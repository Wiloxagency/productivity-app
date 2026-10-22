const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AssistantConversation = require('../models/AssistantConversation');
const AssistantSettings = require('../models/AssistantSettings');
const TimeEntry = require('../models/TimeEntry');
const QueueItem = require('../models/QueueItem');
const AssistantMemory = require('../models/AssistantMemory');
const { runTurn, visibleMessages } = require('../services/assistant');
const { isConfigured, getConfig } = require('../services/assistant/llm');
const { undoAction } = require('../services/recorder');
const { enforceAutoStops, entryTitle } = require('../services/timeline');
const { buildDayPlan, getNextSuggestion } = require('../services/dayPlanner');
const { isValidTimeZone, parseHHmm, localTimeStr } = require('../utils/time');

// The API has no auth yet: cap LLM calls to avoid surprise costs.
const RATE_LIMIT = Number(process.env.ASSISTANT_RATE_LIMIT_PER_MIN || 15);
const hits = [];
const rateLimited = () => {
  const now = Date.now();
  while (hits.length && now - hits[0] > 60000) hits.shift();
  if (hits.length >= RATE_LIMIT) return true;
  hits.push(now);
  return false;
};

router.get('/status', (req, res) => {
  res.json({ configured: isConfigured(), model: getConfig().model, database: mongoose.connection.readyState === 1 });
});

// Fail fast (instead of mongoose's 10 s buffering timeout) when MongoDB is down
router.use((req, res, next) => {
  if (mongoose.connection.readyState === 1) return next();
  return res.status(503).json({
    error: 'La API no está conectada a MongoDB. Revisa el log del API (MongoDB connection error) y el Network Access de Atlas.'
  });
});

// ---- chat
router.post('/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'message es requerido' });
  if (message.length > 4000) return res.status(400).json({ error: 'Mensaje demasiado largo' });
  if (!isConfigured()) return res.status(503).json({ error: 'Falta OPENAI_API_KEY en api/.env' });
  if (rateLimited()) return res.status(429).json({ error: 'Demasiadas solicitudes, espera un minuto' });
  try {
    const result = await runTurn({ conversationId: req.body.conversationId, message });
    res.json(result);
  } catch (error) {
    console.error('[assistant] chat failed:', error);
    res.status(error.status || 500).json({ error: error.message, conversationId: error.conversationId });
  }
});

router.get('/conversations', async (req, res) => {
  const list = await AssistantConversation.find({}).select('title updatedAt').sort({ updatedAt: -1 }).limit(30);
  res.json(list.map((c) => ({ id: String(c._id), title: c.title, updatedAt: c.updatedAt })));
});

router.get('/conversations/:id', async (req, res) => {
  const conversation = await AssistantConversation.findById(req.params.id).catch(() => null);
  if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' });
  res.json({ id: String(conversation._id), title: conversation.title, messages: await visibleMessages(conversation) });
});

// ---- undo
router.post('/actions/:id/undo', async (req, res) => {
  try {
    const action = await undoAction(req.params.id);
    res.json({ id: String(action._id), undone: action.undone, summary: action.summary });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ---- live state for the panel ("en curso" + "siguiente")
router.get('/next', async (req, res) => {
  try {
    await enforceAutoStops();
    const settings = await AssistantSettings.getSingleton();
    const active = await TimeEntry.findOne({ isActive: true }).populate('activity', 'name').populate('task', 'title');
    const queue = await QueueItem.find({ status: { $in: ['pending', 'running'] } }).sort({ sequenceId: 1, order: 1 });
    res.json({
      active: active ? {
        id: String(active._id),
        title: entryTitle(active),
        startTime: active.startTime,
        plannedEnd: active.plannedEnd,
        plannedEndLocal: active.plannedEnd ? localTimeStr(active.plannedEnd, settings.timezone) : null,
        autoStop: !!active.autoStop
      } : null,
      queue: queue.map((q) => ({ id: String(q._id), title: q.title, minutes: q.plannedMinutes, status: q.status })),
      next: await getNextSuggestion()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/plan/:date', async (req, res) => {
  try {
    res.json(await buildDayPlan({ date: req.params.date, apply: false }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- memory (Settings › Asistente IA › Memoria)
const MEMORY_KINDS = ['preference', 'style', 'habit', 'fact', 'reminder', 'note'];

router.get('/memory', async (req, res) => {
  const status = req.query.status === 'all' ? { $in: ['active', 'done', 'archived'] } : 'active';
  res.json(await AssistantMemory.find({ status }).sort({ kind: 1, createdAt: -1 }).limit(300));
});

router.post('/memory', async (req, res) => {
  const { kind = 'note', text, subject, minutes, dueDate } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'text es requerido' });
  if (!MEMORY_KINDS.includes(kind)) return res.status(400).json({ error: 'kind inválido' });
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ error: 'dueDate debe ser YYYY-MM-DD' });
  const memory = await AssistantMemory.create({
    kind, text: String(text).trim(), subject: subject || undefined, minutes: Number(minutes) > 0 ? Math.round(minutes) : undefined,
    dueDate: dueDate || undefined, oneShot: kind === 'reminder', source: 'user'
  });
  res.status(201).json(memory);
});

router.patch('/memory/:id', async (req, res) => {
  const memory = await AssistantMemory.findById(req.params.id).catch(() => null);
  if (!memory) return res.status(404).json({ error: 'No encontrado' });
  const body = req.body || {};
  if (body.text !== undefined) memory.text = String(body.text).trim();
  if (body.subject !== undefined) memory.subject = body.subject || undefined;
  if (body.minutes !== undefined) memory.minutes = Number(body.minutes) > 0 ? Math.round(body.minutes) : undefined;
  if (body.dueDate !== undefined) memory.dueDate = body.dueDate || undefined;
  if (body.status && ['active', 'done', 'archived'].includes(body.status)) memory.status = body.status;
  await memory.save();
  res.json(memory);
});

// Soft delete: the memory leaves the prompt but stays in the database
router.delete('/memory/:id', async (req, res) => {
  const memory = await AssistantMemory.findById(req.params.id).catch(() => null);
  if (!memory) return res.status(404).json({ error: 'No encontrado' });
  memory.status = 'archived';
  memory.resolvedAt = new Date();
  memory.resolution = 'borrado desde Settings';
  await memory.save();
  res.json({ ok: true });
});

// ---- settings
const SETTINGS_FIELDS = ['timezone', 'workdayStart', 'workdayEnd', 'lunchTime', 'lunchDuration', 'lunchActivity', 'bufferMinutes', 'defaultTaskMinutes', 'customInstructions', 'defaultProject'];

router.get('/settings', async (req, res) => {
  res.json(await AssistantSettings.getSingleton());
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await AssistantSettings.getSingleton();
    const body = req.body || {};
    if (body.timezone && !isValidTimeZone(body.timezone)) return res.status(400).json({ error: 'Zona horaria inválida' });
    for (const f of ['workdayStart', 'workdayEnd', 'lunchTime']) {
      if (body[f] !== undefined && !parseHHmm(body[f])) return res.status(400).json({ error: `${f} debe ser HH:mm` });
    }
    SETTINGS_FIELDS.forEach((f) => {
      if (body[f] !== undefined) settings[f] = body[f] === '' && ['lunchActivity', 'defaultProject'].includes(f) ? undefined : body[f];
    });
    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
