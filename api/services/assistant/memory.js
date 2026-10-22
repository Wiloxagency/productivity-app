// Helpers around AssistantMemory: prompt block, duration hints, reminders.
const AssistantMemory = require('../../models/AssistantMemory');
const { rankBySimilarity, similarity } = require('../../utils/similarity');

const MAX_IN_PROMPT = 80;
const KIND_LABEL = {
  preference: 'preferencia', style: 'estilo', habit: 'hábito', fact: 'dato', reminder: 'recordatorio', note: 'nota'
};

const activeMemories = () => AssistantMemory.find({ status: 'active' }).sort({ kind: 1, createdAt: 1 }).limit(MAX_IN_PROMPT);

const memoryLine = (m) => {
  const extra = [];
  if (m.kind === 'reminder') extra.push(m.dueDate ? `desde ${m.dueDate}` : 'sin fecha');
  if (m.minutes) extra.push(`${m.minutes} min`);
  if (m.oneShot && m.kind !== 'reminder') extra.push('un solo uso');
  return `- ${m._id} · ${KIND_LABEL[m.kind] || m.kind}${m.subject ? ` [${m.subject}]` : ''}: ${m.text}${extra.length ? ` (${extra.join(', ')})` : ''}`;
};

const memoryPromptBlock = (memories) => (memories.length ? memories.map(memoryLine).join('\n') : '- (vacía)');

// Usual duration remembered for an item name ("Natación" -> 60)
const durationFromMemory = (names, memories) => {
  const habits = memories.filter((m) => m.minutes > 0 && (m.subject || m.text));
  let best = null;
  for (const name of [].concat(names).filter(Boolean)) {
    const ranked = rankBySimilarity(name, habits, (m) => [m.subject, m.subject ? null : m.text], { min: 0.75, limit: 1 });
    if (ranked.length && (!best || ranked[0].score > best.score)) best = ranked[0];
  }
  return best ? { minutes: best.item.minutes, memoryId: String(best.item._id) } : null;
};

// Reminders to bring up when organizing `ymd` (no date, or date reached)
const dueReminders = async (ymd) => {
  const list = await AssistantMemory.find({ status: 'active', kind: 'reminder' }).sort({ createdAt: 1 });
  return list.filter((m) => !m.dueDate || m.dueDate <= ymd);
};

// One-shot reminders about something that just got scheduled are used up
const consumeMatchingReminders = async (titles, rec, now = new Date()) => {
  const reminders = await AssistantMemory.find({ status: 'active', kind: 'reminder' });
  const used = [];
  for (const m of reminders) {
    const subject = m.subject || m.text;
    const hit = titles.some((t) => similarity(subject, t) >= 0.8 || (m.subject && similarity(t, m.subject) >= 0.8));
    if (!hit) continue;
    if (rec) rec.before(m);
    m.status = 'done';
    m.resolvedAt = now;
    m.resolution = 'agendado';
    await m.save();
    used.push(m.text);
  }
  return used;
};

module.exports = { activeMemories, memoryPromptBlock, durationFromMemory, dueReminders, consumeMatchingReminders, KIND_LABEL };
