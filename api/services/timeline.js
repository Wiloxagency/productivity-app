// Time-entry engine used by the assistant and the background ticker:
//  - start / close entries (one active entry at a time, like the existing routes)
//  - auto-close entries whose activity (or assistant sequence) has autoStop=true
//  - start the next item of a sequence back-to-back (catching up if the app was
//    closed: "Nadar" started 5 h ago -> closed at +60 min, gym started then, ...)
//  - extend / shorten an entry and shift the rest of its sequence
const TimeEntry = require('../models/TimeEntry');
const QueueItem = require('../models/QueueItem');
const Activity = require('../models/Activity');
const Task = require('../models/Task');
const AssistantSettings = require('../models/AssistantSettings');
const { localDateStr, dayBucket, addMinutes } = require('../utils/time');
const { findLunchActivity } = require('./dayPlanner');

// Only routine activities with auto-close (swim, gym, walk…) may start by
// themselves. Tasks (work), lunch and any meal are NEVER auto-started: they
// stay as "Siguiente" with a play button. Leonardo: "estoy trabajando y aún no
// tengo tiempo para almorzar".
const canAutoStart = async (item) => {
  if (!item || item.itemType !== 'activity' || !item.autoStart) return false;
  const activity = await Activity.findById(item.activity).populate('category', 'name');
  if (!activity || !activity.autoStop) return false;
  if (activity.category?.name === 'Meals') return false;
  const lunch = await findLunchActivity(await AssistantSettings.getSingleton());
  if (lunch && String(lunch._id) === String(activity._id)) return false;
  return true;
};

const isBreakName = (name) => (name || '').trim().toLowerCase() === 'break time';

const getTimezone = async () => (await AssistantSettings.getSingleton()).timezone || 'America/Fortaleza';

// Simple in-process mutex: the ticker and HTTP requests must not start the
// same queue item twice (PM2 runs a single fork instance).
let lock = Promise.resolve();
const withLock = (fn) => {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
};

const populateEntry = (query) => query
  .populate({ path: 'activity', select: 'name color quadrant estimatedDuration autoStop category', populate: { path: 'category', select: 'name color' } })
  .populate({ path: 'task', select: 'title estimatedTime quadrant project parentTask category status', populate: [{ path: 'category', select: 'name color' }, { path: 'project', select: 'name' }] });

const entryTitle = (entry) => entry?.activity?.name || entry?.task?.title || '(sin nombre)';

const closeEntry = async (entry, endAt, rec) => {
  if (rec) rec.before(entry);
  const end = new Date(Math.max(new Date(endAt).getTime(), new Date(entry.startTime).getTime()));
  entry.endTime = end;
  entry.isActive = false;
  await entry.save();
  const items = await QueueItem.find({ timeEntry: entry._id, status: 'running' });
  for (const item of items) {
    if (rec) rec.before(item);
    item.status = 'done';
    item.endedAt = end;
    await item.save();
  }
  return entry;
};

const stopActiveEntries = async (at = new Date(), rec) => {
  const active = await TimeEntry.find({ isActive: true });
  for (const entry of active) await closeEntry(entry, at, rec);
  return active;
};

const resolveItem = async (itemType, id) => {
  if (itemType === 'activity') {
    const activity = await Activity.findById(id);
    if (!activity) throw new Error(`Actividad no encontrada: ${id}`);
    return { doc: activity, title: activity.name, minutes: activity.estimatedDuration, autoStop: !!activity.autoStop };
  }
  const task = await Task.findById(id);
  if (!task) throw new Error(`Tarea no encontrada: ${id}`);
  return { doc: task, title: task.title, minutes: task.estimatedTime, autoStop: false };
};

const startEntry = async ({
  itemType, id, startAt = new Date(), plannedMinutes, autoStop, sequenceId, source = 'assistant', notes, rec, tz
}) => {
  const timezone = tz || await getTimezone();
  const { doc, title, minutes: defaultMinutes, autoStop: defaultAutoStop } = await resolveItem(itemType, id);
  const minutes = Number(plannedMinutes) > 0 ? Number(plannedMinutes) : defaultMinutes;
  const shouldAutoStop = (autoStop === undefined ? defaultAutoStop : !!autoStop) && minutes > 0;

  await stopActiveEntries(startAt, rec);

  const entry = new TimeEntry({
    [itemType]: doc._id,
    startTime: startAt,
    date: dayBucket(localDateStr(startAt, timezone)),
    isActive: true,
    isPomodoro: true,
    isBreak: itemType === 'activity' && isBreakName(title),
    plannedEnd: minutes > 0 ? addMinutes(startAt, minutes) : undefined,
    autoStop: shouldAutoStop,
    sequenceId,
    source,
    notes
  });
  await entry.save();
  if (rec) rec.created(entry);
  return { entry, title, minutes, autoStop: shouldAutoStop };
};

const startQueueItem = async (item, at, tz, rec) => {
  try {
    const { entry } = await startEntry({
      itemType: item.itemType,
      id: item.itemType === 'task' ? item.task : item.activity,
      startAt: at,
      plannedMinutes: item.plannedMinutes,
      // undefined -> activity's own autoStop flag; tasks never auto-close
      autoStop: undefined,
      sequenceId: item.sequenceId,
      source: rec ? 'assistant' : 'auto',
      tz,
      rec
    });
    if (rec) rec.before(item);
    item.status = 'running';
    item.timeEntry = entry._id;
    item.startedAt = at;
    await item.save();
    return entry;
  } catch (error) {
    if (rec) rec.before(item);
    item.status = 'skipped';
    await item.save();
    return null;
  }
};

// Runs every few seconds (ticker) and before GET /time-entries/active.
const enforceAutoStops = (now = new Date()) => withLock(async () => {
  const events = [];
  const tz = await getTimezone();

  // Expire stale queue items (left over from previous days / never started)
  await QueueItem.updateMany(
    { status: 'pending', $or: [{ createdAt: { $lt: addMinutes(now, -16 * 60) } }, { scheduledStart: { $lt: addMinutes(now, -3 * 60) } }] },
    { $set: { status: 'skipped' } }
  );

  // Queue items whose entry was stopped from the regular UI routes
  const running = await QueueItem.find({ status: 'running' });
  for (const item of running) {
    const entry = item.timeEntry ? await TimeEntry.findById(item.timeEntry) : null;
    if (!entry || !entry.isActive) {
      item.status = 'done';
      item.endedAt = entry?.endTime || now;
      await item.save();
    }
  }

  for (let guard = 0; guard < 50; guard += 1) {
    const active = await TimeEntry.findOne({ isActive: true }).sort({ startTime: -1 });

    // 1) Auto-close an entry that reached its planned end
    if (active && active.autoStop && active.plannedEnd && active.plannedEnd <= now) {
      const end = active.plannedEnd;
      await closeEntry(active, end);
      events.push({ type: 'auto-stopped', entryId: active._id, at: end });

      if (active.sequenceId) {
        const next = await QueueItem.findOne({ sequenceId: active.sequenceId, status: 'pending' }).sort({ order: 1 });
        if (next && await canAutoStart(next)) {
          const started = await startQueueItem(next, end, tz);
          if (started) events.push({ type: 'auto-started', entryId: started._id, at: end });
        }
      }
      continue;
    }

    // 2) First item of a sequence scheduled for a given time ("a las 6 voy a nadar")
    const runningSequences = await QueueItem.distinct('sequenceId', { status: 'running' });
    // Never interrupt something the user is doing (work, lunch…): only start
    // when nothing runs or what runs is itself an auto-closing routine.
    const candidates = (!active || active.autoStop) ? await QueueItem.find({
      status: 'pending',
      autoStart: true,
      scheduledStart: { $lte: now },
      sequenceId: { $nin: runningSequences }
    }).sort({ scheduledStart: 1, order: 1 }) : [];
    let due = null;
    for (const c of candidates) {
      if (await canAutoStart(c)) { due = c; break; }
    }

    if (due) {
      const startAt = active && active.startTime > due.scheduledStart ? active.startTime : due.scheduledStart;
      const started = await startQueueItem(due, startAt, tz);
      if (started) events.push({ type: 'auto-started', entryId: started._id, at: startAt });
      continue;
    }
    break;
  }
  return events;
});

const findQueueItemForEntry = (entryId) => QueueItem.findOne({ timeEntry: entryId });

// Extend (+) or shorten (-) an entry. Following entries of the same assistant
// sequence are shifted; anything pushed into the future goes back to the queue.
const adjustEntryDuration = ({ entryId, deltaMinutes, now = new Date(), rec }) => withLock(async () => {
  const entry = await TimeEntry.findById(entryId);
  if (!entry) throw new Error('Entrada de tiempo no encontrada');
  const deltaMs = Number(deltaMinutes) * 60000;
  if (!deltaMs) throw new Error('deltaMinutes debe ser distinto de 0');

  if (entry.isActive) {
    rec.before(entry);
    const base = entry.plannedEnd || now;
    entry.plannedEnd = new Date(Math.max(base.getTime() + deltaMs, entry.startTime.getTime() + 60000));
    await entry.save();
    return { kind: 'active', entry, plannedEnd: entry.plannedEnd };
  }

  const oldEnd = entry.endTime;
  let newEnd = new Date(oldEnd.getTime() + deltaMs);
  if (newEnd <= entry.startTime) throw new Error('La duración resultante sería negativa');

  const chain = entry.sequenceId
    ? await TimeEntry.find({
      sequenceId: entry.sequenceId,
      _id: { $ne: entry._id },
      startTime: { $gte: new Date(oldEnd.getTime() - 60000) }
    }).sort({ startTime: 1 })
    : [];

  if (!chain.length) {
    // Standalone entry: do not overlap the next entry
    const next = await TimeEntry.findOne({
      _id: { $ne: entry._id },
      startTime: { $gte: new Date(oldEnd.getTime() - 60000) }
    }).sort({ startTime: 1 });
    let clamped = false;
    if (deltaMs > 0 && next && newEnd > next.startTime) {
      newEnd = next.startTime;
      clamped = true;
    }
    rec.before(entry);
    if (newEnd > now && !next) {
      // Still doing it: reopen
      entry.endTime = undefined;
      entry.isActive = true;
      entry.duration = 0;
      entry.plannedEnd = newEnd;
      entry.autoStop = true;
      await entry.save();
      return { kind: 'reopened', entry, plannedEnd: newEnd };
    }
    if (newEnd > now) {
      newEnd = now;
      clamped = true;
    }
    entry.endTime = newEnd;
    await entry.save();
    return { kind: 'completed', entry, clamped };
  }

  // Sequence: shift the following entries
  rec.before(entry);
  entry.endTime = newEnd;
  const shifted = [entry];
  for (const c of chain) {
    rec.before(c);
    c.startTime = new Date(c.startTime.getTime() + deltaMs);
    if (c.endTime) c.endTime = new Date(c.endTime.getTime() + deltaMs);
    if (c.plannedEnd) c.plannedEnd = new Date(c.plannedEnd.getTime() + deltaMs);
    shifted.push(c);
  }

  let reopened = null;
  const requeued = [];
  for (let i = 0; i < shifted.length; i += 1) {
    const e = shifted[i];
    if (i > 0 && e.startTime > now) {
      // Not started yet in the new timeline -> back to the queue
      const item = await findQueueItemForEntry(e._id);
      if (item) {
        rec.before(item);
        item.status = 'pending';
        item.timeEntry = undefined;
        item.startedAt = undefined;
        item.endedAt = undefined;
        await item.save();
        requeued.push(item.title);
      }
      rec.deleted(e);
      await TimeEntry.deleteOne({ _id: e._id });
      shifted[i] = null;
      continue;
    }
    const end = e.endTime || e.plannedEnd;
    if (!reopened && end && end > now && e.startTime <= now) {
      e.plannedEnd = end;
      e.endTime = undefined;
      e.isActive = true;
      e.autoStop = true;
      e.duration = 0;
      reopened = e;
      const item = await findQueueItemForEntry(e._id);
      if (item && item.status !== 'running') {
        rec.before(item);
        item.status = 'running';
        item.endedAt = undefined;
        await item.save();
      }
    } else if (e.endTime) {
      e.isActive = false;
    }
  }

  for (const e of shifted) {
    if (e) await e.save();
  }

  return { kind: 'sequence', entry, reopened, requeued, shiftedCount: chain.length };
});

module.exports = {
  getTimezone,
  populateEntry,
  entryTitle,
  closeEntry,
  stopActiveEntries,
  startEntry,
  startQueueItem,
  enforceAutoStops,
  adjustEntryDuration,
  withLock,
  canAutoStart
};
