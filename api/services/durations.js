// Duration estimate for an item the user did not give a length for.
// Order: explicit > remembered habit > configured (activity/task) > history > keyword logic.
// Never stretches an item to fill a gap (no "5 h swimming").
const TimeEntry = require('../models/TimeEntry');
const { durationFromMemory } = require('./assistant/memory');
const { normalize } = require('../utils/similarity');

const MIN = 5;
const MAX_ESTIMATE = 240;

const KEYWORDS = [
  [/\b(reunion|meeting|llamada|call|entrevista|cita|demo)\b/, 60],
  [/\b(almuerzo|lunch|almoco|comida)\b/, null], // -> settings.lunchDuration
  [/\b(nadar|natacion|swim|swimming|gym|gimnasio|entrenamiento|workout|correr|running)\b/, 60],
  [/\b(caminar|caminata|walk|walking)\b/, 45],
  [/\b(ducha|shower|banarme|bano)\b/, 20],
  [/\b(desayuno|breakfast|cena|dinner|merienda)\b/, 30],
  [/\b(siesta|nap|descanso|break)\b/, 20],
  [/\b(revisar|responder|correo|email|emails|mails)\b/, 30]
];

const clamp = (m) => Math.max(MIN, Math.min(MAX_ESTIMATE, Math.round(m)));

const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

const historyMinutes = async (itemType, id, now = new Date()) => {
  const since = new Date(now.getTime() - 60 * 24 * 60 * 60000);
  const entries = await TimeEntry.find({ [itemType]: id, isActive: false, startTime: { $gte: since } })
    .sort({ startTime: -1 }).limit(20);
  const values = entries.map((e) => e.duration).filter((d) => d >= MIN && d <= 300);
  return values.length >= 2 ? clamp(median(values)) : null;
};

const keywordMinutes = (name, settings) => {
  const text = normalize(name);
  for (const [re, minutes] of KEYWORDS) {
    if (re.test(text)) return minutes === null ? settings.lunchDuration || 60 : minutes;
  }
  return null;
};

// { itemType, doc, name, memories, settings, now } -> { minutes, source }
const estimateMinutes = async ({ itemType, doc, name, memories = [], settings, now }) => {
  const label = doc ? (doc.name || doc.title) : name;
  const names = [label, name, ...(doc?.aliases || [])];
  const remembered = durationFromMemory(names, memories);
  if (remembered) return { minutes: clamp(remembered.minutes), source: 'memoria' };

  if (doc && itemType === 'activity' && doc.estimatedDuration > 0) return { minutes: clamp(doc.estimatedDuration), source: 'actividad' };
  if (doc && itemType === 'task' && doc.estimatedTime > 0) return { minutes: clamp(doc.estimatedTime), source: 'tarea' };

  if (doc) {
    const hist = await historyMinutes(itemType, doc._id, now);
    if (hist) return { minutes: hist, source: 'historial' };
  }
  const byWord = keywordMinutes(label || '', settings);
  if (byWord) return { minutes: clamp(byWord), source: 'lógica' };
  return { minutes: clamp(settings.defaultTaskMinutes || 30), source: 'por defecto' };
};

module.exports = { estimateMinutes, keywordMinutes, historyMinutes };
