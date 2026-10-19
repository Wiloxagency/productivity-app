// Tools the assistant (gpt-6-astra) can call. Every executor returns a plain
// JSON result for the model; writes go through `ctx.rec` so they can be undone.
const crypto = require('crypto');
const Project = require('../../models/Project');
const Task = require('../../models/Task');
const Activity = require('../../models/Activity');
const Category = require('../../models/Category');
const TimeEntry = require('../../models/TimeEntry');
const QueueItem = require('../../models/QueueItem');
const DailyPlanning = require('../../models/DailyPlanning');
const { rankBySimilarity } = require('../../utils/similarity');
const {
  isValidTimeZone, zonedToUtc, localDateStr, localTimeStr, localDateTimeStr, addDaysStr, dayBucket, parseHHmm, addMinutes
} = require('../../utils/time');
const timeline = require('../timeline');
const { buildDayPlan, getNextSuggestion } = require('../dayPlanner');

// ---------------------------------------------------------------- helpers
const fail = (message, extra = {}) => ({ status: 'error', message, ...extra });

const taskView = (t) => ({
  id: String(t._id),
  title: t.title,
  project: t.project?.name,
  projectId: t.project?._id ? String(t.project._id) : (t.project ? String(t.project) : undefined),
  parentTask: t.parentTask?.title,
  parentTaskId: t.parentTask?._id ? String(t.parentTask._id) : (t.parentTask ? String(t.parentTask) : undefined),
  status: t.status,
  quadrant: t.quadrant,
  estimatedMinutes: t.estimatedTime,
  plannedDate: t.plannedDate ? localDateStr(t.plannedDate, 'UTC') : undefined,
  scheduleTime: t.scheduleTime || undefined
});

const activityView = (a) => ({
  id: String(a._id),
  name: a.name,
  category: a.category?.name,
  defaultMinutes: a.estimatedDuration,
  autoStop: !!a.autoStop,
  aliases: a.aliases?.length ? a.aliases : undefined,
  scheduleTime: a.scheduleTime || undefined
});

const entryView = (e, tz) => e && ({
  id: String(e._id),
  title: timeline.entryTitle(e),
  itemType: e.task ? 'task' : 'activity',
  start: localDateTimeStr(e.startTime, tz),
  end: e.endTime ? localDateTimeStr(e.endTime, tz) : undefined,
  plannedEnd: e.plannedEnd ? localDateTimeStr(e.plannedEnd, tz) : undefined,
  autoStop: !!e.autoStop,
  running: !!e.isActive,
  minutes: e.isActive ? Math.max(0, Math.round((Date.now() - e.startTime.getTime()) / 60000)) : e.duration
});

// date/time given by the user (optionally in another timezone) -> user's tz
const resolveWhen = ({ date, time, timeZone }, ctx) => {
  const userTz = ctx.tz;
  if (timeZone && !isValidTimeZone(timeZone)) return { error: `Zona horaria inválida: ${timeZone}` };
  const srcTz = timeZone || userTz;
  if (time && !parseHHmm(time)) return { error: `Hora inválida: ${time} (usa HH:mm)` };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: `Fecha inválida: ${date} (usa YYYY-MM-DD)` };
  if (!date && !time) return {};

  let srcDate = date || localDateStr(ctx.now, srcTz);
  let assumedTomorrow = false;
  if (time) {
    let instant = zonedToUtc(srcDate, time, srcTz);
    if (!date && instant < ctx.now) {
      srcDate = addDaysStr(srcDate, 1);
      instant = zonedToUtc(srcDate, time, srcTz);
      assumedTomorrow = true;
    }
    return {
      instant,
      ymd: localDateStr(instant, userTz),
      hhmm: localTimeStr(instant, userTz),
      source: srcTz !== userTz ? `${time} ${srcTz}` : undefined,
      assumedTomorrow
    };
  }
  return { ymd: srcDate };
};

const findCategory = async (name, fallbackId) => {
  if (name) {
    const all = await Category.find({});
    const exact = all.find((c) => c.name.toLowerCase() === String(name).toLowerCase());
    if (exact) return exact;
    const ranked = rankBySimilarity(name, all, (c) => c.name, { min: 0.5, limit: 1 });
    if (ranked.length) return ranked[0].item;
  }
  if (fallbackId) {
    const c = await Category.findById(fallbackId);
    if (c) return c;
  }
  return (await Category.findOne({ name: 'Work' })) || Category.findOne({});
};

const recomputePlannedTotals = (planning) => {
  planning.productivity.planned.totalTasks = planning.plannedTasks.length + planning.plannedActivities.length;
  planning.productivity.planned.totalTime = planning.plannedTasks.reduce((s, pt) => s + (pt.plannedDuration || 0), 0)
    + planning.plannedActivities.reduce((s, pa) => s + (pa.plannedDuration || 0), 0);
};

const addTaskToPlanning = async (ymd, task, { start, minutes }, rec) => {
  const bucket = dayBucket(ymd);
  let planning = await DailyPlanning.findOne({ date: bucket });
  if (!planning) {
    planning = new DailyPlanning({ date: bucket, plannedTasks: [], plannedActivities: [], goals: [] });
    await planning.save();
    rec.created(planning);
  } else {
    rec.before(planning);
  }
  const existing = planning.plannedTasks.find((pt) => String(pt.task) === String(task._id));
  if (existing) {
    if (start) existing.plannedStartTime = start;
    if (minutes) existing.plannedDuration = minutes;
  } else {
    planning.plannedTasks.push({
      task: task._id,
      plannedStartTime: start,
      plannedDuration: minutes,
      priority: planning.plannedTasks.length + planning.plannedActivities.length + 1
    });
  }
  // keep the list ordered by start time (items without time go last)
  planning.plannedTasks.sort((a, b) => (a.plannedStartTime ? new Date(a.plannedStartTime).getTime() : Infinity)
    - (b.plannedStartTime ? new Date(b.plannedStartTime).getTime() : Infinity));
  recomputePlannedTotals(planning);
  await planning.save();
};

const markPlanningCompleted = async (entry, tz, rec) => {
  const bucket = dayBucket(localDateStr(entry.startTime, tz));
  const planning = await DailyPlanning.findOne({ date: bucket });
  if (!planning) return;
  const list = entry.task ? planning.plannedTasks : planning.plannedActivities;
  const field = entry.task ? 'task' : 'activity';
  const item = list.find((x) => String(x[field]) === String(entry.task || entry.activity));
  if (!item || item.completed) return;
  rec.before(planning);
  item.completed = true;
  item.actualDuration = (item.actualDuration || 0) + (entry.duration || 0);
  await planning.save();
};

const backlogPriority = async (quadrant, dueYmd, ctx) => {
  const soon = dueYmd && dueYmd <= addDaysStr(localDateStr(ctx.now, ctx.tz), 1);
  if (quadrant === 1 || soon) return 1;
  const last = await Task.findOne({ status: { $in: ['Not Started', 'Started'] } }).sort({ priority: -1 });
  return (last?.priority || 0) + 1;
};

// Most recent entry matching a name (last 24 h; running first)
const findEntryByName = async (name, ctx) => {
  const since = addMinutes(ctx.now, -24 * 60);
  const entries = await TimeEntry.find({ startTime: { $gte: since } })
    .populate('activity', 'name aliases')
    .populate('task', 'title')
    .sort({ startTime: -1 });
  const ranked = rankBySimilarity(name, entries, (e) => [e.activity?.name, ...(e.activity?.aliases || []), e.task?.title], { min: 0.5 });
  if (!ranked.length) return null;
  const best = ranked[0].score;
  const top = ranked.filter((r) => r.score >= best - 0.05).map((r) => r.item);
  return top.find((e) => e.isActive) || top[0];
};

// ---------------------------------------------------------------- registry
const TOOLS = [];
const EXECUTORS = {};
const define = (name, description, parameters, executor) => {
  TOOLS.push({ type: 'function', function: { name, description, parameters } });
  EXECUTORS[name] = executor;
};

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description) => ({ type: 'number', description });
const bool = (description) => ({ type: 'boolean', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

module.exports = {
  fail, taskView, activityView, entryView, resolveWhen, findCategory, addTaskToPlanning, markPlanningCompleted,
  backlogPriority, findEntryByName, TOOLS, EXECUTORS, define, str, num, bool, obj,
  // re-exports used by the tool files
  crypto, Project, Task, Activity, TimeEntry, QueueItem, rankBySimilarity, zonedToUtc, localDateStr, localTimeStr,
  localDateTimeStr, dayBucket, addMinutes, timeline, buildDayPlan, getNextSuggestion
};
