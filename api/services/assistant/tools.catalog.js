// Search / create / update tools (projects, tasks, activities)
const k = require('./toolkit');
const {
  define, str, num, bool, obj, fail, taskView, activityView, resolveWhen, findCategory, addTaskToPlanning,
  backlogPriority, completeInPlannings, Project, Task, Activity, TimeEntry, rankBySimilarity, localDateStr, dayBucket, timeline
} = k;

define('search_projects',
  'Busca proyectos existentes por similitud de nombre (tolera acentos, abreviaturas, números romanos). Úsalo SIEMPRE antes de crear un proyecto o una tarea.',
  obj({ query: str('Texto a buscar, p.ej. "Carlos V"'), includeArchived: bool('Incluir archivados') }, ['query']),
  async ({ query, includeArchived }) => {
    const projects = await Project.find(includeArchived ? {} : { isArchived: false });
    const ranked = rankBySimilarity(query, projects, (p) => [p.name, ...(p.tags || [])], { min: 0.3, limit: 8 });
    const results = [];
    for (const r of ranked) {
      const openTasks = await Task.countDocuments({ project: r.item._id, status: { $in: ['Not Started', 'Started'] } });
      results.push({ id: String(r.item._id), name: r.item.name, status: r.item.status, score: r.score, openTasks });
    }
    return { status: 'ok', results };
  });

define('search_tasks',
  'Busca tareas existentes por similitud (título, proyecto y tarea padre). Úsalo para encontrar la tarea padre, evitar duplicados o localizar una tarea a modificar.',
  obj({
    query: str('Texto a buscar'),
    projectId: str('Limitar a un proyecto'),
    includeCompleted: bool('Incluir completadas/canceladas')
  }, ['query']),
  async ({ query, projectId, includeCompleted }) => {
    const filter = includeCompleted ? {} : { status: { $in: ['Not Started', 'Started'] } };
    if (projectId) filter.project = projectId;
    const tasks = await Task.find(filter).populate('project', 'name').populate('parentTask', 'title').limit(2000);
    const ranked = rankBySimilarity(query, tasks,
      (t) => [t.title, `${t.project?.name || ''} ${t.title}`, `${t.parentTask?.title || ''} ${t.title}`], { min: 0.35, limit: 10 });
    return { status: 'ok', results: ranked.map((r) => ({ ...taskView(r.item), score: r.score })) };
  });

define('search_activities',
  'Busca actividades (rutinas como Nadar, Gym, Almuerzo, Caminar) por nombre o alias. Tienen duración por defecto y pueden auto-cerrarse.',
  obj({ query: str('Texto a buscar, p.ej. "natación"') }, ['query']),
  async ({ query }) => {
    const activities = await Activity.find({}).populate('category', 'name');
    const ranked = rankBySimilarity(query, activities, (a) => [a.name, ...(a.aliases || []), a.description], { min: 0.35, limit: 8 });
    return { status: 'ok', results: ranked.map((r) => ({ ...activityView(r.item), score: r.score })) };
  });

define('create_project',
  'Crea un proyecto nuevo. SOLO después de buscar y de que el usuario confirme explícitamente que quiere crearlo.',
  obj({
    name: str('Nombre del proyecto'),
    description: str('Descripción opcional'),
    userConfirmed: bool('true solo si el usuario dijo explícitamente que sí quiere crear este proyecto'),
    allowSimilar: bool('true si el usuario confirmó que NO es ninguno de los proyectos similares')
  }, ['name', 'userConfirmed']),
  async ({ name, description, userConfirmed, allowSimilar }, ctx) => {
    if (!userConfirmed) return { status: 'needs_confirmation', message: 'Pregunta al usuario si desea crear el proyecto.' };
    const projects = await Project.find({});
    const similar = rankBySimilarity(name, projects, (p) => p.name, { min: 0.75, limit: 5 });
    const exact = projects.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (exact) return { status: 'exists', project: { id: String(exact._id), name: exact.name } };
    if (similar.length && !allowSimilar) {
      return {
        status: 'possible_duplicate',
        message: 'Existen proyectos parecidos. Pregunta al usuario si se refiere a alguno.',
        candidates: similar.map((s) => ({ id: String(s.item._id), name: s.item.name, score: s.score }))
      };
    }
    const project = await Project.create({ name: name.trim(), description });
    ctx.rec.created(project);
    return { status: 'created', project: { id: String(project._id), name: project.name }, summary: `Proyecto creado: ${project.name}` };
  });

define('create_task',
  'Crea una tarea (o subtarea con parentTaskId) y, si tiene fecha, la agrega al plan de ese día ordenada por hora. Requiere proyecto existente y duración estimada.',
  obj({
    title: str('Título claro y corto, p.ej. "Reunión: detalles de integración"'),
    projectId: str('Id del proyecto (de search_projects). Puede omitirse si hay parentTaskId.'),
    parentTaskId: str('Id de la tarea padre si es subtarea'),
    estimatedMinutes: num('Duración estimada en minutos'),
    date: str('Fecha YYYY-MM-DD en la zona de timeZone (o del usuario)'),
    time: str('Hora HH:mm si tiene hora fija (reuniones/citas)'),
    timeZone: str('Zona IANA en la que el usuario dio la hora, p.ej. "Europe/Madrid" para "hora de España". Omitir si es su hora local.'),
    quadrant: { type: 'integer', enum: [1, 2, 3, 4], description: 'Eisenhower: 1 urgente+importante, 2 importante, 3 urgente, 4 ninguno' },
    categoryName: str('Work, Personal Development, Health & Fitness, Domestic Tasks, Meals, Leisure o Rest'),
    description: str('Descripción / notas (p.ej. "mostrar los resultados")'),
    addToDailyPlan: bool('Agregar al plan del día de la fecha (por defecto true si hay fecha)'),
    allowDuplicate: bool('true solo si el usuario confirmó que NO es una de las tareas similares existentes')
  }, ['title', 'estimatedMinutes']),
  async (args, ctx) => {
    let project = args.projectId ? await Project.findById(args.projectId).catch(() => null) : null;
    let parent = null;
    if (args.parentTaskId) {
      parent = await Task.findById(args.parentTaskId).catch(() => null);
      if (!parent) return fail('parentTaskId no existe; usa search_tasks.');
      if (!project) project = await Project.findById(parent.project);
    }
    if (!project) return fail('Proyecto no encontrado. Usa search_projects y, si no existe, pregunta al usuario si desea crearlo.');
    const minutes = Math.round(Number(args.estimatedMinutes));
    if (!(minutes > 0)) return { status: 'missing_fields', missing: ['estimatedMinutes'], message: 'Pregunta la duración estimada.' };

    const when = resolveWhen(args, ctx);
    if (when.error) return fail(when.error);

    // Duplicate guard (same project, open or same day)
    const siblings = await Task.find({ project: project._id, status: { $ne: 'Cancelled' } }).populate('parentTask', 'title');
    const dupes = rankBySimilarity(args.title, siblings, (t) => t.title, { min: 0.8, limit: 5 })
      .filter((d) => d.item.status !== 'Completed' || (when.ymd && d.item.plannedDate && localDateStr(d.item.plannedDate, 'UTC') === when.ymd));
    if (dupes.length && !args.allowDuplicate) {
      return {
        status: 'possible_duplicate',
        message: 'Hay tareas muy parecidas en este proyecto. Pregunta si es una de ellas (y si la actualizo) o si creo una nueva.',
        candidates: dupes.map((d) => ({ ...taskView(d.item), score: d.score }))
      };
    }

    const category = await findCategory(args.categoryName, parent?.category);
    const quadrant = args.quadrant || parent?.quadrant || 2;
    const task = new Task({
      title: args.title.trim(),
      description: args.description,
      project: project._id,
      parentTask: parent?._id || null,
      category: category._id,
      quadrant,
      estimatedTime: minutes,
      priority: await backlogPriority(quadrant, when.ymd, ctx),
      plannedDate: when.ymd ? dayBucket(when.ymd) : undefined,
      dueDate: when.ymd ? dayBucket(when.ymd) : undefined,
      scheduleTime: when.hhmm,
      source: 'assistant'
    });
    await task.save();
    ctx.rec.created(task);

    if (when.ymd && args.addToDailyPlan !== false) {
      await addTaskToPlanning(when.ymd, task, { start: when.instant, minutes }, ctx.rec);
    }

    const whenText = when.ymd ? ` · ${when.ymd}${when.hhmm ? ` ${when.hhmm}` : ''}${when.source ? ` (${when.source})` : ''}` : '';
    return {
      status: 'created',
      task: { ...taskView(task), project: project.name, parentTask: parent?.title },
      localDate: when.ymd,
      localTime: when.hhmm,
      sourceTime: when.source,
      assumedTomorrow: when.assumedTomorrow || undefined,
      summary: `Tarea creada: ${task.title} · ${project.name}${parent ? ` › ${parent.title}` : ''}${whenText} · ${minutes} min`
    };
  });

define('update_task',
  'Modifica una tarea existente (título, estado, duración, fecha/hora, padre, proyecto, cuadrante).',
  obj({
    taskId: str('Id de la tarea'),
    title: str('Nuevo título'),
    status: { type: 'string', enum: ['Not Started', 'Started', 'Completed', 'Cancelled'] },
    estimatedMinutes: num('Nueva duración estimada'),
    date: str('Nueva fecha YYYY-MM-DD'),
    time: str('Nueva hora HH:mm'),
    timeZone: str('Zona IANA de la hora indicada'),
    clearSchedule: bool('Quitar fecha y hora'),
    parentTaskId: str('Nuevo padre ("none" para quitarlo)'),
    projectId: str('Nuevo proyecto'),
    quadrant: { type: 'integer', enum: [1, 2, 3, 4] },
    description: str('Descripción')
  }, ['taskId']),
  async (args, ctx) => {
    const task = await Task.findById(args.taskId).catch(() => null);
    if (!task) return fail('Tarea no encontrada');
    ctx.rec.before(task);
    const changes = [];
    if (args.title) { task.title = args.title; changes.push('título'); }
    if (args.status) {
      task.status = args.status;
      if (args.status === 'Completed') {
        task.completedAt = ctx.now;
        await completeInPlannings('task', task._id, ctx.rec);
      }
      changes.push(`estado ${args.status}`);
    }
    if (args.estimatedMinutes) { task.estimatedTime = Math.round(args.estimatedMinutes); changes.push(`${task.estimatedTime} min`); }
    if (args.quadrant) { task.quadrant = args.quadrant; changes.push(`Q${args.quadrant}`); }
    if (args.description !== undefined) task.description = args.description;
    if (args.projectId) {
      const p = await Project.findById(args.projectId).catch(() => null);
      if (!p) return fail('Proyecto no encontrado');
      task.project = p._id;
      changes.push(`proyecto ${p.name}`);
    }
    if (args.parentTaskId) {
      if (args.parentTaskId === 'none') task.parentTask = null;
      else {
        if (args.parentTaskId === String(task._id)) return fail('Una tarea no puede ser su propio padre');
        const parent = await Task.findById(args.parentTaskId).catch(() => null);
        if (!parent) return fail('Tarea padre no encontrada');
        task.parentTask = parent._id;
        changes.push(`padre ${parent.title}`);
      }
    }
    let when = null;
    if (args.clearSchedule) {
      task.plannedDate = undefined;
      task.dueDate = undefined;
      task.scheduleTime = undefined;
      changes.push('sin fecha');
    } else if (args.date || args.time) {
      when = resolveWhen({
        date: args.date || (task.plannedDate ? localDateStr(task.plannedDate, 'UTC') : undefined),
        time: args.time,
        timeZone: args.timeZone
      }, ctx);
      if (when.error) return fail(when.error);
      task.plannedDate = dayBucket(when.ymd);
      task.dueDate = dayBucket(when.ymd);
      if (when.hhmm) task.scheduleTime = when.hhmm;
      changes.push(`${when.ymd}${when.hhmm ? ` ${when.hhmm}` : ''}`);
    }
    await task.save();
    if (when) await addTaskToPlanning(when.ymd, task, { start: when.instant, minutes: task.estimatedTime }, ctx.rec);
    return { status: 'updated', task: taskView(task), summary: `Tarea actualizada: ${task.title} (${changes.join(', ') || 'sin cambios'})` };
  });

define('create_activity',
  'Crea una actividad/rutina (p.ej. Natación 60 min con auto-cierre). SOLO tras confirmación explícita del usuario.',
  obj({
    name: str('Nombre'),
    categoryName: str('Categoría (p.ej. Health & Fitness, Meals)'),
    estimatedMinutes: num('Duración por defecto'),
    autoStop: bool('Cerrar automáticamente al cumplir la duración (por defecto true)'),
    quadrant: { type: 'integer', enum: [1, 2, 3, 4] },
    aliases: { type: 'array', items: { type: 'string' }, description: 'Sinónimos (nadar, natación, swim)' },
    userConfirmed: bool('true solo si el usuario confirmó crearla')
  }, ['name', 'estimatedMinutes', 'userConfirmed']),
  async (args, ctx) => {
    if (!args.userConfirmed) return { status: 'needs_confirmation' };
    const existing = await Activity.find({});
    const similar = rankBySimilarity(args.name, existing, (a) => [a.name, ...(a.aliases || [])], { min: 0.8, limit: 3 });
    if (similar.length) {
      return { status: 'possible_duplicate', candidates: similar.map((s) => ({ ...activityView(s.item), score: s.score })) };
    }
    const category = await findCategory(args.categoryName);
    const activity = await Activity.create({
      name: args.name.trim(),
      category: category._id,
      quadrant: args.quadrant || 2,
      estimatedDuration: Math.round(args.estimatedMinutes),
      autoStop: args.autoStop !== false,
      aliases: args.aliases || [],
      color: category.color
    });
    ctx.rec.created(activity);
    return {
      status: 'created',
      activity: activityView(activity),
      summary: `Actividad creada: ${activity.name} · ${activity.estimatedDuration} min${activity.autoStop ? ' · auto-cierre' : ''}`
    };
  });

define('update_activity',
  'Cambia la duración por defecto, el auto-cierre, la hora fija diaria o los alias de una actividad.',
  obj({
    activityId: str('Id'),
    estimatedMinutes: num('Nueva duración por defecto'),
    autoStop: bool('Auto-cierre'),
    addAliases: { type: 'array', items: { type: 'string' } },
    scheduleTime: str('Hora fija HH:mm ("" para quitar)')
  }, ['activityId']),
  async (args, ctx) => {
    const activity = await Activity.findById(args.activityId).catch(() => null);
    if (!activity) return fail('Actividad no encontrada');
    ctx.rec.before(activity);
    if (args.estimatedMinutes) activity.estimatedDuration = Math.round(args.estimatedMinutes);
    if (typeof args.autoStop === 'boolean') activity.autoStop = args.autoStop;
    if (args.addAliases?.length) activity.aliases = [...new Set([...(activity.aliases || []), ...args.addAliases])];
    if (args.scheduleTime !== undefined) activity.scheduleTime = args.scheduleTime || undefined;
    await activity.save();
    return {
      status: 'updated',
      activity: activityView(activity),
      summary: `Actividad actualizada: ${activity.name} · ${activity.estimatedDuration} min${activity.autoStop ? ' · auto-cierre' : ''}`
    };
  });

define('complete_task',
  'Marca una tarea como terminada ("terminé X", "ya hice la primera tarea"): estado Completed, la marca como completada en el plan del día (desaparece de pendientes) y detiene el cronómetro si estaba corriendo.',
  obj({ taskId: str('Id de la tarea (usa get_day_plan o search_tasks para encontrarla)') }, ['taskId']),
  async ({ taskId }, ctx) => {
    const task = await Task.findById(taskId).catch(() => null);
    if (!task) return fail('Tarea no encontrada');
    const running = await TimeEntry.findOne({ isActive: true, task: task._id });
    if (running) await timeline.withLock(() => timeline.closeEntry(running, ctx.now, ctx.rec));
    ctx.rec.before(task);
    task.status = 'Completed';
    task.completedAt = ctx.now;
    await task.save();
    const plans = await completeInPlannings('task', task._id, ctx.rec, running ? running.duration : 0);
    return {
      status: 'completed',
      task: task.title,
      stoppedTimer: !!running,
      updatedPlans: plans,
      summary: `Completada: ${task.title}${running ? ' (cronómetro detenido)' : ''}`
    };
  });
