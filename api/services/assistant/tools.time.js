// Time tracking / sequence / planning tools
const k = require('./toolkit');
const {
  define, str, num, bool, obj, fail, entryView, resolveWhen, markPlanningCompleted, findEntryByName,
  crypto, Task, Activity, TimeEntry, QueueItem, rankBySimilarity, zonedToUtc, localDateStr, localTimeStr,
  localDateTimeStr, dayBucket, addMinutes, timeline, buildDayPlan, getNextSuggestion
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
  'Encadena actividades/tareas que se inician y cierran solas una tras otra ("voy a nadar, luego al gimnasio y por último a caminar"). Usa la duración por defecto de cada una salvo que el usuario indique otra.',
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
  'Arma el plan del día: bloques fijos (reuniones con hora, almuerzo), luego tareas por urgencia/prioridad en los huecos libres del horario. apply=true lo guarda en Daily Planning.',
  obj({
    date: str('Fecha YYYY-MM-DD (por defecto hoy)'),
    apply: bool('Guardar el plan (true) o solo proponerlo (false)'),
    includeBacklog: bool('Rellenar huecos con tareas del backlog (por defecto true)')
  }),
  async (args, ctx) => {
    const plan = await buildDayPlan({ date: args.date, apply: !!args.apply, includeBacklog: args.includeBacklog !== false, rec: ctx.rec, now: ctx.now });
    const compact = {
      status: plan.applied ? 'applied' : 'proposal',
      date: plan.date,
      workday: plan.workday,
      timeline: plan.timeline.map((i) => `${i.startLocal}–${i.endLocal} ${i.title}${i.project ? ` [${i.project}]` : ''}${i.kind !== 'flexible' ? ` (${i.kind})` : ''}`),
      unscheduled: plan.unscheduled.slice(0, 10).map((i) => `${i.title} (${i.minutes} min)`),
      unscheduledCount: plan.unscheduled.length,
      missed: plan.missed.map((i) => `${i.startLocal} ${i.title}`),
      freeMinutes: plan.freeMinutes
    };
    if (plan.applied) compact.summary = `Plan del ${plan.date}: ${plan.timeline.length} bloques`;
    return compact;
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
