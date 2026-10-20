// Builds the day timeline: fixed blocks (scheduled meetings/tasks, lunch),
// then fills the free gaps with planned + backlog tasks by urgency.
// Also computes the "next suggested item" (e.g. a meeting that overran until
// 12:00 -> suggest lunch instead of the 11:00 item).
const DailyPlanning = require('../models/DailyPlanning');
const TimeEntry = require('../models/TimeEntry');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const QueueItem = require('../models/QueueItem');
const AssistantSettings = require('../models/AssistantSettings');
const {
  zonedToUtc, localDateStr, localTimeStr, dayBucket, addMinutes, diffMinutes
} = require('../utils/time');

const LUNCH_NAMES = ['lunch', 'almuerzo', 'almoco', 'almoço', 'comida'];

const findLunchActivity = async (settings) => {
  if (settings.lunchActivity) {
    const a = await Activity.findById(settings.lunchActivity);
    if (a) return a;
  }
  const all = await Activity.find({}).populate('category', 'name');
  return all.find((a) => LUNCH_NAMES.includes(a.name.trim().toLowerCase()))
    || all.find((a) => a.category?.name === 'Meals' && /lunch|almuer/i.test(a.name))
    || null;
};

const roundUp = (date, minutes = 5) => {
  const ms = minutes * 60000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
};

const key = (type, id) => `${type}:${id}`;

const loadPlanning = (bucket) => DailyPlanning.findOne({ date: bucket })
  .populate({ path: 'plannedTasks.task', populate: [{ path: 'category', select: 'name color' }, { path: 'project', select: 'name' }] })
  .populate({ path: 'plannedActivities.activity', populate: { path: 'category', select: 'name color' } });

const trackedMinutes = async (bucket, now) => {
  const entries = await TimeEntry.find({ date: bucket });
  const map = new Map();
  entries.forEach((e) => {
    const minutes = e.isActive ? Math.max(0, diffMinutes(now, e.startTime)) : (e.duration || 0);
    const k = e.task ? key('task', e.task) : key('activity', e.activity);
    map.set(k, (map.get(k) || 0) + minutes);
  });
  return { map, entries };
};

// Renumber priorities by planned start time so every view (Daily Planning,
// Time Tracker queue) shows the day in chronological order.
const normalizePlanningOrder = (doc) => {
  const time = (x) => (x.plannedStartTime ? new Date(x.plannedStartTime).getTime() : Infinity);
  const all = [...doc.plannedTasks, ...doc.plannedActivities]
    .map((item, index) => ({ item, index, prio: typeof item.priority === 'number' ? item.priority : 999 }))
    .sort((a, b) => (time(a.item) - time(b.item)) || (a.prio - b.prio) || (a.index - b.index));
  all.forEach(({ item }, i) => { item.priority = i + 1; });
  doc.plannedTasks.sort((a, b) => a.priority - b.priority);
  doc.plannedActivities.sort((a, b) => a.priority - b.priority);
  doc.productivity.planned.totalTasks = doc.plannedTasks.length + doc.plannedActivities.length;
  doc.productivity.planned.totalTime = doc.plannedTasks.reduce((s, pt) => s + (pt.plannedDuration || 0), 0)
    + doc.plannedActivities.reduce((s, pa) => s + (pa.plannedDuration || 0), 0);
  return doc;
};

// includeBacklog=false (default): only what is already planned for the day,
// tasks dated that day and the ids in includeTaskIds. Other backlog tasks are
// returned as `suggestions` so the user chooses (never dump the whole backlog).
const buildDayPlan = async ({ date, apply = false, includeBacklog = false, includeTaskIds = [], rec, now = new Date() } = {}) => {
  const settings = await AssistantSettings.getSingleton();
  const tz = settings.timezone;
  const today = localDateStr(now, tz);
  const ymd = date || today;
  const isToday = ymd === today;
  const bucket = dayBucket(ymd);
  const buffer = settings.bufferMinutes || 0;

  const dayStart = zonedToUtc(ymd, settings.workdayStart, tz);
  const dayEnd = zonedToUtc(ymd, settings.workdayEnd, tz);
  const cursor = isToday ? new Date(Math.max(dayStart.getTime(), roundUp(now).getTime())) : dayStart;

  const planning = await loadPlanning(bucket);
  const { map: tracked } = await trackedMinutes(bucket, now);
  const active = await TimeEntry.findOne({ isActive: true });
  const activeKey = active ? (active.task ? key('task', active.task) : key('activity', active.activity)) : null;

  const hard = [];
  const flexible = [];
  const missed = [];
  const inPlan = new Set();

  const pushHard = (item) => {
    if (isToday && item.end <= now) {
      if ((tracked.get(item.key) || 0) < item.minutes / 2) missed.push(item);
      return;
    }
    if (isToday && item.start < now) item.start = new Date(Math.max(now.getTime(), item.start.getTime()));
    hard.push(item);
  };

  // Planned tasks
  (planning?.plannedTasks || []).forEach((pt) => {
    const task = pt.task;
    if (!task) return;
    const k = key('task', task._id);
    inPlan.add(k);
    if (pt.completed || ['Completed', 'Cancelled'].includes(task.status)) return;
    const minutes = pt.plannedDuration || task.estimatedTime || settings.defaultTaskMinutes;
    const remaining = Math.max(0, minutes - (tracked.get(k) || 0));
    if (!remaining || k === activeKey) return;
    const base = {
      key: k, itemType: 'task', id: String(task._id), title: task.title, project: task.project?.name,
      quadrant: task.quadrant, priority: pt.priority ?? task.priority, minutes: remaining, prevStart: pt.plannedStartTime
    };
    if (pt.fixedTime && pt.plannedStartTime) {
      const start = new Date(pt.plannedStartTime);
      pushHard({ ...base, kind: 'fixed', start, end: addMinutes(start, remaining) });
    } else if (task.scheduleTime) {
      const start = zonedToUtc(ymd, task.scheduleTime, tz);
      pushHard({ ...base, kind: 'fixed', start, end: addMinutes(start, remaining) });
    } else {
      flexible.push({ ...base, kind: 'flexible' });
    }
  });

  // Planned activities
  const lunch = await findLunchActivity(settings);
  const lunchKey = lunch ? key('activity', lunch._id) : null;
  (planning?.plannedActivities || []).forEach((pa) => {
    const activity = pa.activity;
    if (!activity) return;
    const k = key('activity', activity._id);
    inPlan.add(k);
    if (pa.completed || k === lunchKey) return;
    const minutes = pa.plannedDuration || activity.estimatedDuration || settings.defaultTaskMinutes;
    const remaining = Math.max(0, minutes - (tracked.get(k) || 0));
    if (!remaining || k === activeKey) return;
    const base = {
      key: k, itemType: 'activity', id: String(activity._id), title: activity.name,
      quadrant: activity.quadrant, priority: pa.priority, minutes: remaining, prevStart: pa.plannedStartTime
    };
    if (pa.fixedTime && pa.plannedStartTime) {
      const start = new Date(pa.plannedStartTime);
      pushHard({ ...base, kind: 'fixed', start, end: addMinutes(start, remaining) });
    } else if (activity.scheduleTime) {
      const start = zonedToUtc(ymd, activity.scheduleTime, tz);
      pushHard({ ...base, kind: 'fixed', start, end: addMinutes(start, remaining) });
    } else {
      flexible.push({ ...base, kind: 'flexible' });
    }
  });

  // Lunch block (always, unless already eaten)
  let lunchInfo = null;
  if (lunch) {
    const lunchStart = zonedToUtc(ymd, settings.lunchTime, tz);
    const lunchEnd = addMinutes(lunchStart, settings.lunchDuration);
    const eaten = (tracked.get(lunchKey) || 0) >= settings.lunchDuration / 2;
    lunchInfo = { start: lunchStart, end: lunchEnd, eaten, activityId: String(lunch._id), title: lunch.name };
    if (!eaten && lunchKey !== activeKey) {
      const remaining = Math.max(5, settings.lunchDuration - (tracked.get(lunchKey) || 0));
      let start = lunchStart;
      // Lunch slides (up to 2 h) instead of being "missed"
      if (isToday && now > lunchStart && now <= addMinutes(lunchEnd, 120)) start = roundUp(now);
      if (!(isToday && now > addMinutes(lunchEnd, 120))) {
        hard.push({
          key: lunchKey, itemType: 'activity', id: String(lunch._id), title: lunch.name,
          kind: 'lunch', minutes: remaining, start, end: addMinutes(start, remaining)
        });
      }
    }
  }

  // Backlog candidates
  const suggestions = [];
  const wanted = new Set((includeTaskIds || []).map(String));
  {
    const backlog = await Task.find({ status: { $in: ['Not Started', 'Started'] } })
      .populate('project', 'name')
      .sort({ priority: 1, createdAt: 1 });
    const openChildren = new Set(backlog.filter((t) => t.parentTask).map((t) => String(t.parentTask)));
    backlog.forEach((task) => {
      const k = key('task', task._id);
      if (inPlan.has(k) || k === activeKey) return;
      if (openChildren.has(String(task._id))) return; // work the subtasks instead
      const planned = task.plannedDate ? localDateStr(task.plannedDate, 'UTC') : null;
      if (planned && planned > ymd) return; // planned for a later day
      if (task.scheduleTime && planned && planned !== ymd) return;
      const remaining = Math.max(5, (task.estimatedTime || settings.defaultTaskMinutes) - (task.actualTime || 0));
      const base = {
        key: k, itemType: 'task', id: String(task._id), title: task.title, project: task.project?.name,
        quadrant: task.quadrant, priority: task.priority, minutes: remaining, dueDate: task.dueDate, fromBacklog: true
      };
      if (!(includeBacklog || wanted.has(String(task._id)) || planned === ymd)) {
        suggestions.push({ ...base, kind: 'suggestion' });
        return;
      }
      if (task.scheduleTime && planned === ymd) {
        const start = zonedToUtc(ymd, task.scheduleTime, tz);
        pushHard({ ...base, kind: 'fixed', start, end: addMinutes(start, remaining) });
      } else {
        flexible.push({ ...base, kind: 'flexible' });
      }
    });
  }

  // Order flexible work: planned items first (keeping user's order), then
  // overdue/due, quadrant (Q1 > Q2 > Q3 > Q4) and priority.
  flexible.sort((a, b) => {
    if (!!a.fromBacklog !== !!b.fromBacklog) return a.fromBacklog ? 1 : -1;
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    if (a.fromBacklog && aDue !== bDue) return aDue - bDue;
    if ((a.quadrant || 4) !== (b.quadrant || 4)) return (a.quadrant || 4) - (b.quadrant || 4);
    const aPrev = a.prevStart ? new Date(a.prevStart).getTime() : Infinity;
    const bPrev = b.prevStart ? new Date(b.prevStart).getTime() : Infinity;
    if (aPrev !== bPrev) return aPrev - bPrev;
    return (a.priority || 99) - (b.priority || 99);
  });

  hard.sort((a, b) => a.start - b.start);

  // Free gaps between hard blocks
  const gaps = [];
  let gapStart = cursor;
  if (active && active.plannedEnd && isToday && active.plannedEnd > gapStart) gapStart = roundUp(active.plannedEnd);
  hard.forEach((h) => {
    if (h.start > gapStart) gaps.push({ start: gapStart, end: h.start });
    if (h.end > gapStart) gapStart = h.end;
  });
  if (dayEnd > gapStart) gaps.push({ start: gapStart, end: dayEnd });

  const placed = [];
  const unscheduled = [];
  flexible.forEach((item) => {
    const need = item.minutes + buffer;
    const gap = gaps.find((g) => diffMinutes(g.end, g.start) >= need || (diffMinutes(g.end, g.start) >= item.minutes && g.end.getTime() === dayEnd.getTime()));
    if (!gap) {
      unscheduled.push(item);
      return;
    }
    const start = gap.start;
    const end = addMinutes(start, item.minutes);
    placed.push({ ...item, start, end });
    gap.start = addMinutes(end, buffer);
  });

  const timeline = [...hard, ...placed].sort((a, b) => a.start - b.start);
  const freeMinutes = gaps.reduce((sum, g) => sum + Math.max(0, diffMinutes(g.end, g.start)), 0);

  if (apply) {
    let doc = await DailyPlanning.findOne({ date: bucket });
    if (!doc) {
      doc = new DailyPlanning({ date: bucket, plannedTasks: [], plannedActivities: [], goals: [] });
      await doc.save();
      if (rec) rec.created(doc);
    } else if (rec) {
      rec.before(doc);
    }
    for (const [index, item] of timeline.entries()) {
      if (item.itemType === 'task') {
        const existing = doc.plannedTasks.find((pt) => String(pt.task) === item.id);
        if (existing) {
          existing.plannedStartTime = item.start;
          if (!existing.plannedDuration) existing.plannedDuration = item.minutes;
          existing.priority = index + 1;
        } else {
          doc.plannedTasks.push({ task: item.id, plannedStartTime: item.start, plannedDuration: item.minutes, priority: index + 1 });
          const task = await Task.findById(item.id);
          if (task) {
            if (rec) rec.before(task);
            task.plannedDate = bucket;
            if (!task.dueDate) task.dueDate = bucket;
            await task.save();
          }
        }
      } else {
        const existing = doc.plannedActivities.find((pa) => String(pa.activity) === item.id);
        if (existing) {
          existing.plannedStartTime = item.start;
          if (!existing.plannedDuration) existing.plannedDuration = item.minutes;
          existing.priority = index + 1;
        } else {
          doc.plannedActivities.push({ activity: item.id, plannedStartTime: item.start, plannedDuration: item.minutes, priority: index + 1 });
        }
      }
    }
    normalizePlanningOrder(doc);
    await doc.save();
  }

  const fmt = (i) => ({
    itemType: i.itemType,
    id: i.id,
    title: i.title,
    project: i.project,
    kind: i.kind,
    minutes: i.minutes,
    start: i.start,
    end: i.end,
    startLocal: i.start ? localTimeStr(i.start, tz) : undefined,
    endLocal: i.end ? localTimeStr(i.end, tz) : undefined
  });

  return {
    date: ymd,
    timezone: tz,
    workday: { start: settings.workdayStart, end: settings.workdayEnd },
    lunch: lunchInfo ? { ...lunchInfo, startLocal: localTimeStr(lunchInfo.start, tz) } : null,
    timeline: timeline.map(fmt),
    unscheduled: unscheduled.map(fmt),
    missed: missed.map(fmt),
    suggestions: suggestions
      .sort((a, b) => {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return (aDue - bDue) || ((a.quadrant || 4) - (b.quadrant || 4)) || ((a.priority || 99) - (b.priority || 99));
      })
      .slice(0, 12)
      .map((i) => ({ id: i.id, title: i.title, project: i.project, minutes: i.minutes, quadrant: i.quadrant, dueDate: i.dueDate ? localDateStr(i.dueDate, 'UTC') : undefined })),
    freeMinutes,
    applied: !!apply
  };
};

// What should come next, given what is running now.
const getNextSuggestion = async ({ now = new Date() } = {}) => {
  const settings = await AssistantSettings.getSingleton();
  const tz = settings.timezone;
  const active = await TimeEntry.findOne({ isActive: true })
    .populate('activity', 'name')
    .populate('task', 'title');
  const activeEndsAt = active?.plannedEnd || null;

  // 1) Assistant sequence in progress
  const queueFilter = active?.sequenceId ? { status: 'pending', sequenceId: active.sequenceId } : { status: 'pending' };
  const queued = await QueueItem.findOne(queueFilter).sort({ scheduledStart: 1, order: 1 });
  if (queued && (active?.sequenceId === queued.sequenceId || !queued.scheduledStart || queued.scheduledStart <= addMinutes(now, 60))) {
    return {
      source: 'queue',
      reason: active?.sequenceId === queued.sequenceId ? 'Siguiente en tu secuencia' : 'En cola',
      itemType: queued.itemType,
      id: String(queued.task || queued.activity),
      title: queued.title,
      minutes: queued.plannedMinutes,
      startsAt: active?.sequenceId === queued.sequenceId ? activeEndsAt : (queued.scheduledStart || null),
      startsAtLocal: (active?.sequenceId === queued.sequenceId ? activeEndsAt : queued.scheduledStart)
        ? localTimeStr(active?.sequenceId === queued.sequenceId ? activeEndsAt : queued.scheduledStart, tz) : null,
      autoStart: queued.autoStart
    };
  }

  const plan = await buildDayPlan({ now, includeBacklog: true });
  const candidates = plan.timeline;
  const pick = (item, reason) => item && ({
    source: 'plan', reason, itemType: item.itemType, id: item.id, title: item.title, minutes: item.minutes,
    startsAt: item.start, startsAtLocal: item.startLocal, project: item.project
  });

  // 2) Fixed block (meeting) starting now
  const fixedNow = candidates.find((c) => c.kind === 'fixed'
    && new Date(c.start) <= addMinutes(now, 15) && new Date(c.start) >= addMinutes(now, -10));
  if (fixedNow) return pick(fixedNow, `Agendado a las ${fixedNow.startLocal}`);

  // 3) Lunch is due (e.g. a meeting overran past lunch time)
  if (plan.lunch && !plan.lunch.eaten) {
    const lunchItem = candidates.find((c) => c.kind === 'lunch');
    if (lunchItem && now >= new Date(plan.lunch.start)) {
      return pick(lunchItem, `Ya pasó la hora de almuerzo (${plan.lunch.startLocal})`);
    }
  }

  // 4) Earliest item of the timeline
  if (candidates.length) return pick(candidates[0], 'Siguiente en tu plan del día');
  if (plan.unscheduled.length) return pick(plan.unscheduled[0], 'Prioridad del backlog');
  return null;
};

module.exports = { buildDayPlan, getNextSuggestion, findLunchActivity, normalizePlanningOrder, loadPlanning };
