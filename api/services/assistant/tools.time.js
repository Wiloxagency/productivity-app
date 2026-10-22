// Time tracking / sequence / planning tools
const k = require('./toolkit');
const AssistantSettings = require('../../models/AssistantSettings');
const { findLunchActivity } = require('../dayPlanner');
const { dueReminders, consumeMatchingReminders } = require('./memory');
const {
  define, str, num, bool, obj, fail, entryView, resolveWhen, markPlanningCompleted, findEntryByName, completeInPlannings,
  crypto, Task, Activity, TimeEntry, QueueItem, rankBySimilarity, zonedToUtc, localDateStr, localTimeStr,
  localDateTimeStr, dayBucket, addMinutes, timeline, buildDayPlan, getNextSuggestion, normalizePlanningOrder, DailyPlanning
} = k;

const populated = (id) => TimeEntry.findById(id).populate('activity', 'name').populate('task', 'title');

define('get_current_state',
  'Devuelve lo que está corriendo ahora, la cola de la secuencia y la siguiente actividad sugerida.',
  obj({}),
  async (_args, ctx) => {
    await timeline.enforceAutoStops(ctx.now);
    const active = await TimeEntry.findOne({ isActive: true }).populate('activity', 'name').populate('task', 'title');
    const queue = await QueueItem.find({ status: { $in: ['pending', 'running'] } }).sort({ sequenceId: 1, order: 1 });
    return {
      status: 'ok',
      active: entryView(active, ctx.tz) || null,
      queue: queue.map((q) => ({
        title: q.title,
        minutes: q.plannedMinutes,
        status: q.status,
        scheduledStart: q.scheduledStart ? localDateTimeStr(q.scheduledStart, ctx.tz) : undefined
      })),
      next: await getNextSuggestion({ now: ctx.now })
    };
  });

define('start_item',
  'Inicia el cronómetro de una tarea o actividad (detiene lo que esté corriendo).',
  obj({
    itemType: { type: 'string', enum: ['task', 'activity'] },
    id: str('Id de la tarea o actividad'),
    plannedMinutes: num('Duración prevista (por defecto la de la tarea/actividad)'),
    autoStop: bool('Forzar auto-cierre al cumplir la duración'),
    startedAt: str('Hora HH:mm local si empezó antes ("empecé a las 9")')
  }, ['itemType', 'id']),
  async (args, ctx) => {
    let startAt = ctx.now;
    if (args.startedAt) {
      const t = zonedToUtc(localDateStr(ctx.now, ctx.tz), args.startedAt, ctx.tz);
      if (t > ctx.now) return fail('startedAt está en el futuro');
      startAt = t;
    }
    const result = await timeline.withLock(() => timeline.startEntry({
      itemType: args.itemType, id: args.id, startAt, plannedMinutes: args.plannedMinutes, autoStop: args.autoStop, rec: ctx.rec, tz: ctx.tz
    })).catch((e) => ({ error: e.message }));
    if (result.error) return fail(result.error);
    await timeline.enforceAutoStops(ctx.now);
    return {
      status: 'started',
      entry: entryView(await populated(result.entry._id), ctx.tz),
      summary: `Iniciado: ${result.title} (${localTimeStr(startAt, ctx.tz)}${result.autoStop ? `, cierre ${localTimeStr(result.entry.plannedEnd, ctx.tz)}` : ''})`
    };
  });

define('complete_current',
  'Detiene lo que está corriendo. Con markTaskCompleted=true marca la tarea como Completada ("termina la tarea actual"). Si era parte de una secuencia, arranca la siguiente.',
  obj({
    markTaskCompleted: bool('Marcar la tarea como completada (true para "termina/finaliza")'),
    startNext: bool('Iniciar la siguiente sugerida (si no hay secuencia)')
  }),
  async (args, ctx) => {
    const active = await TimeEntry.findOne({ isActive: true }).populate('activity', 'name').populate('task', 'title');
    if (!active) return { status: 'nothing_running', next: await getNextSuggestion({ now: ctx.now }) };
    const title = timeline.entryTitle(active);
    const { sequenceId } = active;

    await timeline.withLock(async () => {
      const raw = await TimeEntry.findById(active._id);
      await timeline.closeEntry(raw, ctx.now, ctx.rec);
      await markPlanningCompleted(raw, ctx.tz, ctx.rec);
      if (raw.task && args.markTaskCompleted) {
        const task = await Task.findById(raw.task);
        if (task) {
          ctx.rec.before(task);
          task.status = 'Completed';
          task.completedAt = ctx.now;
          await task.save();
        }
      }
    });

    let started = null;
    if (sequenceId) {
      const nextQ = await QueueItem.findOne({ sequenceId, status: 'pending' }).sort({ order: 1 });
      if (nextQ) started = await timeline.withLock(() => timeline.startQueueItem(nextQ, ctx.now, ctx.tz, ctx.rec));
    }
    const next = await getNextSuggestion({ now: ctx.now });
    if (!started && args.startNext && next) {
      const r = await timeline.withLock(() => timeline.startEntry({ itemType: next.itemType, id: next.id, startAt: ctx.now, rec: ctx.rec, tz: ctx.tz }));
      started = r.entry;
    }
    const startedTitle = started ? timeline.entryTitle(await populated(started._id)) : null;
    return {
      status: 'stopped',
      stopped: title,
      taskCompleted: !!(active.task && args.markTaskCompleted),
      startedNext: startedTitle,
      next: startedTitle ? undefined : next,
      summary: `${args.markTaskCompleted && active.task ? 'Completada' : 'Detenida'}: ${title}${startedTitle ? ` → iniciada ${startedTitle}` : ''}`
    };
  });

define('schedule_sequence',
  'Encadena rutinas que se inician y cierran solas una tras otra ("voy a nadar, luego al gimnasio y por último a caminar"). Solo las actividades con auto-cierre arrancan/cierran solas; las tareas de trabajo, el almuerzo y las comidas NUNCA arrancan solas (quedan como "Siguiente"). NO lo uses para planificar la jornada de trabajo: para eso está plan_day.',
  obj({
    items: {
      type: 'array',
      minItems: 1,
      items: obj({
        itemType: { type: 'string', enum: ['task', 'activity'] },
        id: str('Id'),
        minutes: num('Duración (opcional; por defecto la de la actividad/tarea)')
      }, ['itemType', 'id'])
    },
    startTime: str('Hora HH:mm de inicio del primero. Omitir = ahora. Puede ser pasada ("salí a nadar a las 6").'),
    date: str('Fecha YYYY-MM-DD (por defecto hoy)'),
    timeZone: str('Zona IANA de startTime si no es la local')
  }, ['items']),
  async (args, ctx) => {
    const sequenceId = `seq_${crypto.randomBytes(5).toString('hex')}`;
    const resolved = [];
    for (const [index, it] of args.items.entries()) {
      const doc = it.itemType === 'task' ? await Task.findById(it.id).catch(() => null) : await Activity.findById(it.id).catch(() => null);
      if (!doc) return fail(`No existe ${it.itemType} ${it.id}`);
      const minutes = Math.round(it.minutes || (it.itemType === 'task' ? doc.estimatedTime : doc.estimatedDuration) || 30);
      resolved.push({ doc, minutes, index, itemType: it.itemType });
    }

    let startAt = ctx.now;
    if (args.startTime) {
      const when = resolveWhen({ date: args.date || localDateStr(ctx.now, args.timeZone || ctx.tz), time: args.startTime, timeZone: args.timeZone }, ctx);
      if (when.error) return fail(when.error);
      startAt = when.instant;
    }

    const items = [];
    for (const c of resolved) {
      const item = await QueueItem.create({
        sequenceId,
        order: c.index,
        itemType: c.itemType,
        task: c.itemType === 'task' ? c.doc._id : undefined,
        activity: c.itemType === 'activity' ? c.doc._id : undefined,
        title: c.doc.name || c.doc.title,
        plannedMinutes: c.minutes,
        autoStart: true,
        scheduledStart: c.index === 0 && startAt > ctx.now ? startAt : undefined
      });
      ctx.rec.created(item);
      items.push(item);
    }

    if (startAt <= ctx.now) {
      await timeline.withLock(() => timeline.startQueueItem(items[0], startAt, ctx.tz, ctx.rec));
      await timeline.enforceAutoStops(ctx.now); // catch up if the start was in the past
    }

    let cursor = startAt;
    const plan = resolved.map((c) => {
      const s = cursor;
      cursor = addMinutes(cursor, c.minutes);
      return { title: c.doc.name || c.doc.title, minutes: c.minutes, start: localTimeStr(s, ctx.tz), end: localTimeStr(cursor, ctx.tz) };
    });
    return {
      status: startAt <= ctx.now ? 'started' : 'scheduled',
      plan,
      summary: `Secuencia: ${plan.map((p) => `${p.title} ${p.start}–${p.end}`).join(' → ')}`
    };
  });

define('adjust_entry_time',
  'Aumenta (+) o reduce (-) minutos a una actividad en curso, ya terminada o en cola ("aumenta 25 minutos a mi gym"). Desplaza lo que venía después en la secuencia.',
  obj({
    target: { type: 'string', enum: ['current', 'last', 'by_name'], description: 'current = lo que corre ahora; last = la última terminada; by_name = buscar por nombre' },
    name: str('Nombre si target=by_name (p.ej. "gym")'),
    deltaMinutes: num('Minutos a sumar (negativo para restar)')
  }, ['target', 'deltaMinutes']),
  async (args, ctx) => {
    let entry = null;
    if (args.target === 'current') entry = await TimeEntry.findOne({ isActive: true });
    else if (args.target === 'last') entry = await TimeEntry.findOne({ isActive: false }).sort({ endTime: -1 });
    else if (args.name) entry = await findEntryByName(args.name, ctx);

    if (!entry && args.name) {
      // Maybe it is still pending in the queue
      const pending = await QueueItem.find({ status: 'pending' });
      const ranked = rankBySimilarity(args.name, pending, (q) => q.title, { min: 0.5, limit: 1 });
      if (ranked.length) {
        const { item } = ranked[0];
        ctx.rec.before(item);
        item.plannedMinutes = Math.max(5, item.plannedMinutes + Math.round(args.deltaMinutes));
        await item.save();
        return { status: 'updated_queue', item: item.title, minutes: item.plannedMinutes, summary: `${item.title}: ahora ${item.plannedMinutes} min (en cola)` };
      }
    }
    if (!entry) return fail('No encontré esa actividad en las últimas 24 h. Pregunta cuál es.');

    const result = await timeline.adjustEntryDuration({ entryId: entry._id, deltaMinutes: args.deltaMinutes, now: ctx.now, rec: ctx.rec })
      .catch((e) => ({ error: e.message }));
    if (result.error) return fail(result.error);
    await timeline.enforceAutoStops(ctx.now);
    const fresh = await populated(entry._id);
    const title = fresh ? timeline.entryTitle(fresh) : '(entrada)';
    let detail = '';
    if (fresh?.isActive && fresh.plannedEnd) detail = `, termina ${localTimeStr(fresh.plannedEnd, ctx.tz)}`;
    else if (fresh?.endTime) detail = `, terminó ${localTimeStr(fresh.endTime, ctx.tz)}`;
    if (result.requeued?.length) detail += `; vuelve a la cola: ${result.requeued.join(', ')}`;
    if (result.clamped) detail += ' (ajustado para no solaparse)';
    return {
      status: 'adjusted',
      entry: entryView(fresh, ctx.tz),
      kind: result.kind,
      shifted: result.shiftedCount,
      summary: `${title} ${args.deltaMinutes > 0 ? '+' : ''}${args.deltaMinutes} min${detail}`
    };
  });

define('plan_day',
  'Ordena el día con horas de inicio/fin: bloques fijos (reuniones con hora, almuerzo) y luego las tareas en los huecos libres del horario. Usa SOLO lo ya planificado para ese día, las tareas fechadas ese día y las de includeTaskIds. NO mete el backlog salvo includeBacklog=true. Devuelve `suggestions` del backlog (solo informativas: no preguntes por huecos) y `reminders` de memoria. apply=true guarda horas y orden. Para agregar/fijar varios elementos usa organize_day.',
  obj({
    date: str('Fecha YYYY-MM-DD (por defecto hoy)'),
    apply: bool('Guardar el plan (true) o solo proponerlo (false)'),
    includeTaskIds: { type: 'array', items: { type: 'string' }, description: 'Ids de tareas del backlog que el usuario pidió agregar a ese día' },
    includeBacklog: bool('Rellenar huecos con TODO el backlog. Solo si el usuario lo pide explícitamente.')
  }),
  async (args, ctx) => {
    const plan = await buildDayPlan({
      date: args.date,
      apply: !!args.apply,
      includeBacklog: !!args.includeBacklog,
      includeTaskIds: args.includeTaskIds || [],
      rec: ctx.rec,
      now: ctx.now
    });
    const compact = {
      status: plan.applied ? 'applied' : 'proposal',
      date: plan.date,
      workday: plan.workday,
      timeline: plan.timeline.map((i) => `${i.startLocal}–${i.endLocal} ${i.title}${i.project ? ` [${i.project}]` : ''}${i.kind !== 'flexible' ? ` (${i.kind})` : ''}`),
      unscheduled: plan.unscheduled.slice(0, 10).map((i) => `${i.title} (${i.minutes} min)`),
      unscheduledCount: plan.unscheduled.length,
      missed: plan.missed.map((i) => `${i.startLocal} ${i.title}`),
      suggestions: plan.suggestions.map((t) => ({ id: t.id, title: t.title, project: t.project, minutes: t.minutes, due: t.dueDate })),
      freeMinutes: plan.freeMinutes,
      reminders: (await dueReminders(plan.date)).map((m) => ({ id: String(m._id), text: m.text, since: m.dueDate || undefined }))
    };
    if (!compact.reminders.length) delete compact.reminders;
    if (plan.applied) compact.summary = `Plan del ${plan.date} ordenado: ${plan.timeline.length} bloques`;
    return compact;
  });

const planItemsView = async (ymd, ctx) => {
  const planning = await DailyPlanning.findOne({ date: dayBucket(ymd) })
    .populate({ path: 'plannedTasks.task', select: 'title status estimatedTime project', populate: { path: 'project', select: 'name' } })
    .populate('plannedActivities.activity', 'name estimatedDuration');
  if (!planning) return [];
  // Heal plans where the task is Completed but its plan item is still open
  // (otherwise it keeps showing as pending in the Time Tracker queue)
  const stale = planning.plannedTasks.filter((pt) => pt.task && pt.task.status === 'Completed' && !pt.completed);
  if (stale.length && ctx.rec) {
    ctx.rec.before(planning);
    stale.forEach((pt) => { pt.completed = true; });
    await planning.save();
  }
  const items = [
    ...planning.plannedTasks.filter((pt) => pt.task).map((pt) => ({
      itemType: 'task', id: String(pt.task._id), title: pt.task.title, project: pt.task.project?.name,
      minutes: pt.plannedDuration || pt.task.estimatedTime, start: pt.plannedStartTime, priority: pt.priority,
      completed: pt.completed
    })),
    ...planning.plannedActivities.filter((pa) => pa.activity).map((pa) => ({
      itemType: 'activity', id: String(pa.activity._id), title: pa.activity.name,
      minutes: pa.plannedDuration || pa.activity.estimatedDuration, start: pa.plannedStartTime, priority: pa.priority,
      completed: pa.completed
    }))
  ].sort((a, b) => (a.priority || 999) - (b.priority || 999));
  return items.map((i) => ({
    ...i,
    start: undefined,
    startLocal: i.start ? localTimeStr(i.start, ctx.tz) : null,
    endLocal: i.start ? localTimeStr(addMinutes(i.start, i.minutes || 0), ctx.tz) : null
  }));
};

define('get_day_plan',
  'Lee el plan guardado de un día (lo que el usuario ve en Daily Planning), en orden, con hora inicio–fin y si está completado. Úsalo para verificar después de cada cambio y para saber cuál es "la primera tarea".',
  obj({ date: str('YYYY-MM-DD, por defecto hoy') }),
  async (args, ctx) => {
    const ymd = args.date || localDateStr(ctx.now, ctx.tz);
    const items = await planItemsView(ymd, ctx);
    return {
      status: 'ok',
      date: ymd,
      items: items.map((i) => ({
        itemType: i.itemType,
        id: i.id,
        line: `${i.startLocal ? `${i.startLocal}–${i.endLocal}` : 'sin hora'} ${i.title}${i.project ? ` [${i.project}]` : ''} · ${i.minutes} min${i.completed ? ' ✓ completada' : ''}`
      }))
    };
  });

define('remove_from_plan',
  'Quita elementos del plan de un día (no borra las tareas: vuelven al backlog sin fecha). Usa `items` para quitar unos concretos o `keepOnly` para dejar solo los indicados ("quita las que no te dije").',
  obj({
    date: str('YYYY-MM-DD, por defecto hoy'),
    items: { type: 'array', items: obj({ itemType: { type: 'string', enum: ['task', 'activity'] }, id: str('Id') }, ['itemType', 'id']) },
    keepOnly: { type: 'array', items: obj({ itemType: { type: 'string', enum: ['task', 'activity'] }, id: str('Id') }, ['itemType', 'id']) }
  }),
  async (args, ctx) => {
    const ymd = args.date || localDateStr(ctx.now, ctx.tz);
    const bucket = dayBucket(ymd);
    const planning = await DailyPlanning.findOne({ date: bucket });
    if (!planning) return fail(`No hay plan para ${ymd}`);
    if (!args.items?.length && !args.keepOnly) return fail('Indica items o keepOnly');
    const keyOf = (t, id) => `${t}:${id}`;
    const removeSet = new Set((args.items || []).map((i) => keyOf(i.itemType, i.id)));
    const keepSet = args.keepOnly ? new Set(args.keepOnly.map((i) => keyOf(i.itemType, i.id))) : null;
    const lunch = await findLunchActivity(await AssistantSettings.getSingleton());
    const lunchId = lunch ? String(lunch._id) : null;
    // keepOnly never drops lunch (only removed when named explicitly in items)
    const shouldRemove = (t, id) => (keepSet
      ? !keepSet.has(keyOf(t, String(id))) && !(t === 'activity' && String(id) === lunchId)
      : removeSet.has(keyOf(t, String(id))));

    ctx.rec.before(planning);
    const removedTasks = planning.plannedTasks.filter((pt) => !pt.completed && shouldRemove('task', pt.task));
    const removedActs = planning.plannedActivities.filter((pa) => !pa.completed && shouldRemove('activity', pa.activity));
    planning.plannedTasks = planning.plannedTasks.filter((pt) => !removedTasks.includes(pt));
    planning.plannedActivities = planning.plannedActivities.filter((pa) => !removedActs.includes(pa));
    normalizePlanningOrder(planning);
    await planning.save();

    const titles = [];
    for (const pt of removedTasks) {
      const task = await Task.findById(pt.task);
      if (!task) continue;
      titles.push(task.title);
      if (task.plannedDate && task.plannedDate.getTime() === bucket.getTime()) {
        ctx.rec.before(task);
        task.plannedDate = undefined;
        if (task.dueDate && task.dueDate.getTime() === bucket.getTime() && task.source === 'assistant') task.dueDate = undefined;
        await task.save();
      }
    }
    for (const pa of removedActs) {
      const a = await Activity.findById(pa.activity);
      if (a) titles.push(a.name);
    }
    return {
      status: 'ok',
      removed: titles,
      remaining: (await planItemsView(ymd, ctx)).length,
      summary: titles.length ? `Quitadas del ${ymd}: ${titles.join(', ')}` : undefined
    };
  });

define('set_plan_item',
  'Agrega o ajusta un elemento en el plan de un día con hora de inicio y/o duración ("pon X a las 15:00", "dale 90 minutos a Y"). Reordena el día por hora.',
  obj({
    date: str('YYYY-MM-DD, por defecto hoy'),
    itemType: { type: 'string', enum: ['task', 'activity'] },
    id: str('Id de la tarea o actividad'),
    startTime: str('Hora de inicio HH:mm (local)'),
    minutes: num('Duración planificada')
  }, ['itemType', 'id']),
  async (args, ctx) => {
    const ymd = args.date || localDateStr(ctx.now, ctx.tz);
    const bucket = dayBucket(ymd);
    const doc = args.itemType === 'task' ? await Task.findById(args.id).catch(() => null) : await Activity.findById(args.id).catch(() => null);
    if (!doc) return fail('No encontrado');
    let planning = await DailyPlanning.findOne({ date: bucket });
    if (!planning) {
      planning = new DailyPlanning({ date: bucket, plannedTasks: [], plannedActivities: [], goals: [] });
      await planning.save();
      ctx.rec.created(planning);
    } else {
      ctx.rec.before(planning);
    }
    const list = args.itemType === 'task' ? planning.plannedTasks : planning.plannedActivities;
    const ref = args.itemType === 'task' ? 'task' : 'activity';
    let item = list.find((x) => String(x[ref]) === String(doc._id));
    if (!item) {
      list.push({ [ref]: doc._id, plannedDuration: args.minutes || (args.itemType === 'task' ? doc.estimatedTime : doc.estimatedDuration) });
      item = list[list.length - 1];
      if (args.itemType === 'task' && !(doc.plannedDate && doc.plannedDate.getTime() === bucket.getTime())) {
        ctx.rec.before(doc);
        doc.plannedDate = bucket;
        if (!doc.dueDate) doc.dueDate = bucket;
        await doc.save();
      }
    }
    if (args.startTime) {
      item.plannedStartTime = zonedToUtc(ymd, args.startTime, ctx.tz);
      item.fixedTime = true;
    }
    if (args.minutes) item.plannedDuration = Math.round(args.minutes);
    normalizePlanningOrder(planning);
    await planning.save();
    await consumeMatchingReminders([doc.title || doc.name], ctx.rec, ctx.now);
    const start = item.plannedStartTime ? localTimeStr(item.plannedStartTime, ctx.tz) : 'sin hora';
    return {
      status: 'ok',
      summary: `${doc.title || doc.name}: ${start}${item.plannedStartTime ? `–${localTimeStr(addMinutes(item.plannedStartTime, item.plannedDuration || 0), ctx.tz)}` : ''} (${ymd})`
    };
  });

define('log_time',
  'Registra en el tracker un tiempo YA OCURRIDO con hora de inicio y fin ("la reunión de Carlos V la tuve de 3:45 a 4:40", "trabajé en X de 9 a 10"). Con markCompleted=true además marca la tarea como completada (sale de pendientes).',
  obj({
    itemType: { type: 'string', enum: ['task', 'activity'] },
    id: str('Id de la tarea o actividad'),
    startTime: str('Hora de inicio HH:mm'),
    endTime: str('Hora de fin HH:mm'),
    date: str('YYYY-MM-DD (por defecto hoy)'),
    timeZone: str('Zona IANA si las horas no son locales'),
    markCompleted: bool('true si el usuario dice que ya la tuvo / la terminó'),
    allowOverlap: bool('true solo si el usuario confirmó que se solape con otra entrada')
  }, ['itemType', 'id', 'startTime', 'endTime']),
  async (args, ctx) => {
    const doc = args.itemType === 'task' ? await Task.findById(args.id).catch(() => null) : await Activity.findById(args.id).catch(() => null);
    if (!doc) return fail('No encontrado');
    const day = args.date || localDateStr(ctx.now, args.timeZone || ctx.tz);
    const startW = resolveWhen({ date: day, time: args.startTime, timeZone: args.timeZone }, ctx);
    let endW = resolveWhen({ date: day, time: args.endTime, timeZone: args.timeZone }, ctx);
    if (startW.error || endW.error) return fail(startW.error || endW.error);
    let end = endW.instant;
    if (end <= startW.instant) end = addMinutes(end, 24 * 60); // crosses midnight
    if (end > ctx.now) return fail('La hora de fin está en el futuro; usa start_item o set_plan_item.');

    const overlaps = await TimeEntry.find({
      startTime: { $lt: end },
      $or: [{ endTime: { $gt: startW.instant } }, { isActive: true }]
    }).populate('activity', 'name').populate('task', 'title');
    if (overlaps.length && !args.allowOverlap) {
      return {
        status: 'overlap',
        message: 'Se solapa con otras entradas. Pregunta al usuario si ajusto esas entradas (update_time_entry) o registro igual (allowOverlap).',
        overlaps: overlaps.map((e) => entryView(e, ctx.tz))
      };
    }

    const entry = new TimeEntry({
      [args.itemType]: doc._id,
      startTime: startW.instant,
      endTime: end,
      date: dayBucket(localDateStr(startW.instant, ctx.tz)),
      isActive: false,
      isPomodoro: false,
      source: 'assistant',
      notes: 'Registrado por el asistente'
    });
    await entry.save();
    ctx.rec.created(entry);

    let completed = false;
    if (args.markCompleted) {
      if (args.itemType === 'task') {
        ctx.rec.before(doc);
        doc.status = 'Completed';
        doc.completedAt = end;
        await doc.save();
      }
      await completeInPlannings(args.itemType, doc._id, ctx.rec, entry.duration);
      completed = true;
    }
    const title = doc.title || doc.name;
    return {
      status: 'logged',
      entry: entryView(entry, ctx.tz),
      completed,
      summary: `Registrado: ${title} ${localTimeStr(startW.instant, ctx.tz)}–${localTimeStr(end, ctx.tz)} (${entry.duration} min)${completed ? ' · completada' : ''}`
    };
  });

define('update_time_entry',
  'Corrige la hora de inicio y/o fin de una entrada del tracker ("Invoices lo empecé a las 4:40", "la reunión terminó a las 5"). Para la entrada en curso solo se cambia el inicio.',
  obj({
    target: { type: 'string', enum: ['current', 'by_name'] },
    name: str('Nombre si target=by_name'),
    startTime: str('Nueva hora de inicio HH:mm (local)'),
    endTime: str('Nueva hora de fin HH:mm (local)')
  }, ['target']),
  async (args, ctx) => {
    const entry = args.target === 'current'
      ? await TimeEntry.findOne({ isActive: true })
      : await findEntryByName(args.name || '', ctx);
    if (!entry) return fail('No encontré esa entrada en las últimas 24 h');
    const day = localDateStr(entry.startTime, ctx.tz);
    ctx.rec.before(entry);
    if (args.startTime) {
      const newStart = zonedToUtc(day, args.startTime, ctx.tz);
      if (entry.isActive && entry.plannedEnd) {
        // keep the same planned length from the new start
        entry.plannedEnd = new Date(newStart.getTime() + (entry.plannedEnd.getTime() - entry.startTime.getTime()));
      }
      entry.startTime = newStart;
    }
    if (args.endTime) {
      if (entry.isActive) return fail('La entrada está en curso; para cerrarla usa complete_current');
      entry.endTime = zonedToUtc(day, args.endTime, ctx.tz);
    }
    if (entry.startTime > ctx.now) return fail('El inicio quedaría en el futuro');
    if (entry.endTime && entry.endTime <= entry.startTime) return fail('El fin debe ser posterior al inicio');
    await entry.save();
    const fresh = await populated(entry._id);
    return {
      status: 'updated',
      entry: entryView(fresh, ctx.tz),
      summary: `${timeline.entryTitle(fresh)}: ${localTimeStr(fresh.startTime, ctx.tz)}–${fresh.endTime ? localTimeStr(fresh.endTime, ctx.tz) : 'en curso'}`
    };
  });

define('get_next_suggestion',
  'Calcula qué debería hacer a continuación según la secuencia, el plan, las reuniones y la hora de almuerzo.',
  obj({}),
  async (_args, ctx) => ({ status: 'ok', next: await getNextSuggestion({ now: ctx.now }) }));

define('get_day_entries',
  'Lista lo registrado en el tracker en un día (para responder "¿qué hice hoy?").',
  obj({ date: str('YYYY-MM-DD, por defecto hoy') }),
  async (args, ctx) => {
    const ymd = args.date || localDateStr(ctx.now, ctx.tz);
    const entries = await TimeEntry.find({ date: dayBucket(ymd) }).populate('activity', 'name').populate('task', 'title').sort({ startTime: 1 });
    const total = entries.reduce((s, e) => s + (e.isActive ? Math.round((ctx.now - e.startTime) / 60000) : e.duration), 0);
    return { status: 'ok', date: ymd, totalMinutes: total, entries: entries.map((e) => entryView(e, ctx.tz)) };
  });

define('clear_queue',
  'Cancela los elementos pendientes de la cola (secuencias) que aún no han empezado.',
  obj({}),
  async (_args, ctx) => {
    const pending = await QueueItem.find({ status: 'pending' });
    for (const item of pending) {
      ctx.rec.before(item);
      item.status = 'skipped';
      await item.save();
    }
    return { status: 'ok', skipped: pending.length, summary: pending.length ? `Cola vaciada (${pending.length})` : undefined };
  });
