// organize_day: schedule several items of a day in ONE call.
// Items with a time (start, or start+end) are fixed; the rest are placed by the
// day planner in the free gaps. Missing durations are estimated (never asked).
// Unknown items are created as tasks (project hint or the default project).
const k = require('./toolkit');
const AssistantSettings = require('../../models/AssistantSettings');
const Category = require('../../models/Category');
const { findLunchActivity } = require('../dayPlanner');
const { estimateMinutes } = require('../durations');
const { activeMemories, dueReminders, consumeMatchingReminders } = require('./memory');
const {
  define, str, num, obj, fail, resolveWhen, findCategory, backlogPriority, getDefaultProject,
  Project, Task, Activity, rankBySimilarity, localDateStr, localTimeStr, dayBucket, addMinutes,
  buildDayPlan, normalizePlanningOrder, DailyPlanning
} = k;

const LUNCH_RE = /\b(almuerzo|almorzar|lunch|almoco|almoço)\b/i;
const ACTIVITY_MIN = 0.6;
const TASK_MIN = 0.7;

const capitalize = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

const resolveByName = (name, { activities, tasks, lunch }) => {
  if (lunch && LUNCH_RE.test(name)) return { itemType: 'activity', doc: lunch, score: 1 };
  const act = rankBySimilarity(name, activities, (a) => [a.name, ...(a.aliases || [])], { min: ACTIVITY_MIN, limit: 1 })[0];
  const task = rankBySimilarity(name, tasks, (t) => [t.title, t.project?.name ? `${t.project.name} ${t.title}` : null], { min: TASK_MIN, limit: 1 })[0];
  if (act && (!task || act.score >= task.score)) return { itemType: 'activity', doc: act.item, score: act.score };
  if (task) return { itemType: 'task', doc: task.item, score: task.score };
  return null;
};

const resolveProject = async (args, ctx) => {
  if (args.projectId) {
    const p = await Project.findById(args.projectId).catch(() => null);
    if (p) return { project: p };
  }
  if (args.projectHint) {
    const projects = await Project.find({ isArchived: false });
    const hit = rankBySimilarity(args.projectHint, projects, (p) => [p.name, ...(p.tags || [])], { min: 0.6, limit: 1 })[0];
    if (hit) return { project: hit.item };
  }
  return { project: await getDefaultProject(ctx), isDefault: true };
};

define('organize_day',
  'Agenda VARIOS elementos de un día en UNA sola llamada y reordena el día. Cada elemento: name (como lo dijo el usuario) o itemType+id; opcional start "HH:mm", end "HH:mm" o minutes. Con hora quedan fijos (start, o start+end); sin hora se colocan solos en los huecos libres. Sin minutes el servidor estima la duración (memoria > configurada > historial > lógica). Busca tareas/actividades existentes y, si no existe, crea la tarea (projectId/projectHint o proyecto por defecto). mode="replace" = "mi agenda de ese día es esta" (quita lo demás pendiente, salvo almuerzo). Devuelve el día completo, conflictos y recordatorios pendientes de memoria.',
  obj({
    date: str('YYYY-MM-DD (por defecto hoy)'),
    mode: { type: 'string', enum: ['add', 'replace'], description: 'add (por defecto) o replace' },
    items: {
      type: 'array',
      minItems: 1,
      items: obj({
        name: str('Nombre como lo dijo el usuario ("nadar", "reunión con Pablo")'),
        itemType: { type: 'string', enum: ['task', 'activity'] },
        id: str('Id si ya lo conoces'),
        start: str('Hora de inicio HH:mm'),
        end: str('Hora de fin HH:mm'),
        minutes: num('Duración si el usuario la dijo'),
        timeZone: str('Zona IANA si las horas no son locales'),
        projectId: str('Proyecto para crear la tarea si no existe'),
        projectHint: str('Nombre aproximado del proyecto si lo mencionó'),
        categoryName: str('Categoría si hay que crear la tarea (Work, Health & Fitness, Meals, Domestic Tasks…)'),
        quadrant: { type: 'integer', enum: [1, 2, 3, 4] }
      })
    }
  }, ['items']),
  async (args, ctx) => {
    const ymd = args.date || localDateStr(ctx.now, ctx.tz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return fail('date debe ser YYYY-MM-DD');
    const bucket = dayBucket(ymd);
    const settings = ctx.settings || await AssistantSettings.getSingleton();
    const [activities, tasks, lunch, memories] = await Promise.all([
      Activity.find({}),
      Task.find({ status: { $in: ['Not Started', 'Started'] } }).populate('project', 'name').sort({ updatedAt: -1 }).limit(2000),
      findLunchActivity(settings),
      activeMemories()
    ]);

    let planning = await DailyPlanning.findOne({ date: bucket });
    if (!planning) {
      planning = new DailyPlanning({ date: bucket, plannedTasks: [], plannedActivities: [], goals: [] });
      await planning.save();
      ctx.rec.created(planning);
    } else {
      ctx.rec.before(planning);
    }
    const basePriority = planning.plannedTasks.length + planning.plannedActivities.length;

    const scheduled = [];
    const created = [];
    const problems = [];
    const keep = new Set();

    for (const [index, it] of args.items.entries()) {
      const label = it.name || it.id || `elemento ${index + 1}`;
      // 1) resolve the item
      let itemType = it.itemType;
      let doc = null;
      if (it.id && itemType) {
        doc = itemType === 'task' ? await Task.findById(it.id).catch(() => null) : await Activity.findById(it.id).catch(() => null);
      }
      if (!doc && it.name) {
        const hit = resolveByName(it.name, { activities, tasks, lunch });
        if (hit) ({ itemType, doc } = hit);
      }

      // 2) times / duration
      let startI = null;
      let endI = null;
      if (it.start) {
        const w = resolveWhen({ date: ymd, time: it.start, timeZone: it.timeZone }, ctx);
        if (w.error) { problems.push(`${label}: ${w.error}`); continue; }
        startI = w.instant;
      }
      if (it.end) {
        const w = resolveWhen({ date: ymd, time: it.end, timeZone: it.timeZone }, ctx);
        if (w.error) { problems.push(`${label}: ${w.error}`); continue; }
        endI = w.instant;
        if (startI && endI <= startI) endI = addMinutes(endI, 24 * 60);
      }
      let minutes = null;
      let durationSource = 'indicada';
      if (it.minutes > 0) minutes = Math.round(it.minutes);
      else if (startI && endI) minutes = Math.round((endI - startI) / 60000);
      else {
        const est = await estimateMinutes({ itemType: itemType || 'task', doc, name: it.name, memories, settings, now: ctx.now });
        minutes = est.minutes;
        durationSource = est.source;
      }
      if (!startI && endI) startI = addMinutes(endI, -minutes); // "hasta las 11"

      // 3) create the task when it does not exist
      if (!doc) {
        if (!it.name) { problems.push(`${label}: no encontrado`); continue; }
        const { project, isDefault } = await resolveProject(it, ctx);
        const category = await findCategory(it.categoryName);
        const quadrant = it.quadrant || 2;
        doc = new Task({
          title: capitalize(it.name.trim()),
          project: project._id,
          category: category._id,
          quadrant,
          estimatedTime: minutes,
          priority: await backlogPriority(quadrant, ymd, ctx),
          plannedDate: bucket,
          dueDate: bucket,
          source: 'assistant'
        });
        await doc.save();
        ctx.rec.created(doc);
        itemType = 'task';
        tasks.push(doc);
        created.push(`${doc.title} [${project.name}${isDefault ? ', proyecto por defecto' : ''}]`);
      } else if (itemType === 'task' && !(doc.plannedDate && doc.plannedDate.getTime() === bucket.getTime())) {
        ctx.rec.before(doc);
        doc.plannedDate = bucket;
        if (!doc.dueDate) doc.dueDate = bucket;
        await doc.save();
      }

      // 4) upsert into the day plan
      const list = itemType === 'task' ? planning.plannedTasks : planning.plannedActivities;
      const ref = itemType === 'task' ? 'task' : 'activity';
      let item = list.find((x) => String(x[ref]) === String(doc._id));
      if (!item) {
        list.push({ [ref]: doc._id, priority: basePriority + index + 1 });
        item = list[list.length - 1];
      } else if (item.completed && (startI || it.minutes)) {
        item.completed = false; // scheduled again explicitly
      }
      if (startI) {
        item.plannedStartTime = startI;
        item.fixedTime = true;
      } else if (!item.fixedTime) {
        item.plannedStartTime = undefined; // let the planner place it
        item.priority = basePriority + index + 1;
      }
      if (it.minutes > 0 || (startI && endI) || !item.plannedDuration) item.plannedDuration = minutes;
      keep.add(`${itemType}:${doc._id}`);
      scheduled.push({
        title: doc.title || doc.name,
        fixed: !!item.fixedTime,
        minutes: item.plannedDuration,
        durationSource: (it.minutes > 0 || (startI && endI)) ? 'indicada' : durationSource
      });
    }

    // "mi agenda es esta": drop the other pending items (never lunch, never completed)
    const removed = [];
    if (args.mode === 'replace') {
      const lunchId = lunch ? String(lunch._id) : null;
      const dropTasks = planning.plannedTasks.filter((pt) => !pt.completed && !keep.has(`task:${pt.task}`));
      const dropActs = planning.plannedActivities.filter((pa) => !pa.completed && !keep.has(`activity:${pa.activity}`) && String(pa.activity) !== lunchId);
      planning.plannedTasks = planning.plannedTasks.filter((pt) => !dropTasks.includes(pt));
      planning.plannedActivities = planning.plannedActivities.filter((pa) => !dropActs.includes(pa));
      for (const pt of dropTasks) {
        const t = await Task.findById(pt.task);
        if (!t) continue;
        removed.push(t.title);
        if (t.plannedDate && t.plannedDate.getTime() === bucket.getTime()) {
          ctx.rec.before(t);
          t.plannedDate = undefined;
          await t.save();
        }
      }
      for (const pa of dropActs) {
        const a = activities.find((x) => String(x._id) === String(pa.activity));
        if (a) removed.push(a.name);
      }
    }
    normalizePlanningOrder(planning);
    await planning.save();

    // Re-flow the whole day (fixed blocks first, the rest in the gaps)
    const plan = await buildDayPlan({ date: ymd, apply: true, rec: ctx.rec, now: ctx.now });

    const conflicts = [];
    for (let i = 1; i < plan.timeline.length; i += 1) {
      const prev = plan.timeline[i - 1];
      const cur = plan.timeline[i];
      if (new Date(cur.start) < new Date(prev.end)) conflicts.push(`${prev.title} (${prev.startLocal}–${prev.endLocal}) se cruza con ${cur.title} (${cur.startLocal}–${cur.endLocal})`);
    }

    const usedReminders = await consumeMatchingReminders(scheduled.map((s) => s.title), ctx.rec, ctx.now);
    const reminders = (await dueReminders(ymd)).map((m) => ({ id: String(m._id), text: m.text, since: m.dueDate || undefined }));

    const placed = new Map(plan.timeline.map((i) => [i.title, i]));
    return {
      status: 'applied',
      date: ymd,
      scheduled: scheduled.map((s) => {
        const p = placed.get(s.title);
        return `${p ? `${p.startLocal}–${p.endLocal}` : 'sin hueco'} ${s.title}${s.fixed ? ' (fija)' : ''} · ${s.minutes} min${s.durationSource !== 'indicada' ? ` (duración: ${s.durationSource})` : ''}`;
      }),
      created: created.length ? created : undefined,
      removed: removed.length ? removed : undefined,
      day: plan.timeline.map((i) => `${i.startLocal}–${i.endLocal} ${i.title}${i.project ? ` [${i.project}]` : ''}`),
      unscheduled: plan.unscheduled.length ? plan.unscheduled.map((i) => `${i.title} (${i.minutes} min) — no cabe en la jornada`) : undefined,
      missed: plan.missed.length ? plan.missed.map((i) => `${i.startLocal} ${i.title}`) : undefined,
      conflicts: conflicts.length ? conflicts : undefined,
      problems: problems.length ? problems : undefined,
      remindersUsed: usedReminders.length ? usedReminders : undefined,
      reminders: reminders.length ? reminders : undefined,
      summary: `Agenda ${ymd}: ${scheduled.map((s) => s.title).join(', ')}${created.length ? ` (creadas: ${created.length})` : ''}`
    };
  });
