// Chat loop: system prompt with live context + tool calling against gpt-6-astra.
const AssistantConversation = require('../../models/AssistantConversation');
const AssistantAction = require('../../models/AssistantAction');
const AssistantSettings = require('../../models/AssistantSettings');
const Project = require('../../models/Project');
const Activity = require('../../models/Activity');
const Category = require('../../models/Category');
const TimeEntry = require('../../models/TimeEntry');
const QueueItem = require('../../models/QueueItem');
const { chatCompletion, getConfig } = require('./llm');
const { TOOLS, executeTool } = require('./tools');
const { Recorder } = require('../recorder');
const timeline = require('../timeline');
const { getNextSuggestion, findLunchActivity } = require('../dayPlanner');
const { localDateStr, localTimeStr, localDateTimeStr, weekdayName, zonedParts } = require('../../utils/time');

const MAX_STEPS = 10;
const HISTORY_LIMIT = 40;
const TURN_BUDGET_MS = 110 * 1000; // stay under nginx proxy_read_timeout (120 s)

const utcOffsetLabel = (now, tz) => {
  const p = zonedParts(now, tz);
  const diff = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(now.getTime() / 1000) * 1000) / 60000);
  const sign = diff >= 0 ? '+' : '-';
  const abs = Math.abs(diff);
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`;
};

const buildSystemPrompt = async (now) => {
  const settings = await AssistantSettings.getSingleton();
  const tz = settings.timezone;
  await timeline.enforceAutoStops(now);

  const [projects, activities, categories, active, queue, next, lunch] = await Promise.all([
    Project.find({ isArchived: false, status: { $in: ['active', 'on-hold'] } }).sort({ priority: 1, name: 1 }).limit(120),
    Activity.find({}).populate('category', 'name').sort({ name: 1 }),
    Category.find({}).sort({ name: 1 }),
    TimeEntry.findOne({ isActive: true }).populate('activity', 'name').populate('task', 'title'),
    QueueItem.find({ status: { $in: ['pending', 'running'] } }).sort({ sequenceId: 1, order: 1 }),
    getNextSuggestion({ now }).catch(() => null),
    findLunchActivity(settings)
  ]);

  const today = localDateStr(now, tz);
  const activeLine = active
    ? `"${timeline.entryTitle(active)}" desde ${localTimeStr(active.startTime, tz)}${active.plannedEnd ? `, fin previsto ${localTimeStr(active.plannedEnd, tz)}` : ''}${active.autoStop ? ' (auto-cierre)' : ' (sin auto-cierre: corre hasta acción manual)'}`
    : 'nada';
  const queueLines = queue.length
    ? queue.map((q) => `- ${q.title} ${q.plannedMinutes} min [${q.status}]${q.scheduledStart ? ` inicia ${localDateTimeStr(q.scheduledStart, tz)}` : ''}`).join('\n')
    : '- (vacía)';
  const nextLine = next ? `${next.title}${next.startsAtLocal ? ` a las ${next.startsAtLocal}` : ''} — ${next.reason}` : 'sin sugerencia';

  return `Eres el asistente de proyectos y tiempo de Leonardo, integrado en su app de productividad (proyectos, tareas, actividades, tracker Pomodoro y planificación diaria). Tu objetivo: ahorrarle tiempo ejecutando acciones con las herramientas y anticipar su planificación del día.

# Contexto actual
- Ahora: ${weekdayName(today)} ${localDateTimeStr(now, tz)} (${tz}, ${utcOffsetLabel(now, tz)}).
- Horario base: ${settings.workdayStart}–${settings.workdayEnd}. Almuerzo ${settings.lunchTime} (${settings.lunchDuration} min)${lunch ? ` → actividad "${lunch.name}" id=${lunch._id}` : ' (no hay actividad de almuerzo configurada)'}.
- En curso: ${activeLine}.
- Cola de secuencias:
${queueLines}
- Siguiente sugerida: ${nextLine}.
${settings.customInstructions ? `- Indicaciones del usuario: ${settings.customInstructions}\n` : ''}
# Proyectos activos (id · nombre)
${projects.map((p) => `- ${p._id} · ${p.name}`).join('\n') || '- (ninguno)'}

# Actividades (id · nombre · categoría · duración por defecto · auto-cierre · alias)
${activities.map((a) => `- ${a._id} · ${a.name} · ${a.category?.name || '-'} · ${a.estimatedDuration} min · ${a.autoStop ? 'sí' : 'no'}${a.aliases?.length ? ` · ${a.aliases.join(', ')}` : ''}`).join('\n') || '- (ninguna)'}

# Categorías
${categories.map((c) => c.name).join(', ')}

# Reglas
1. Busca antes de crear. Usa search_projects / search_tasks / search_activities y razona por similitud y contexto (sinónimos, traducciones, abreviaturas, números romanos: "Carlos V" = "Carlos 5"; "factory" ≈ "Factoría"; "nadar" ≈ "Swimming"). Reutiliza lo existente y evita duplicados.
2. Jerarquía: Proyecto → Tarea → Subtarea. Si lo pedido encaja bajo una tarea existente del proyecto (p.ej. "detalles de la integración" y existe la tarea "Integración"), créalo como subtarea con parentTaskId.
3. Si NO encuentras el proyecto/tarea padre/actividad, muestra las coincidencias más cercanas y pregunta si desea crearlo. Nunca crees proyectos ni actividades sin un "sí" explícito (userConfirmed=true solo entonces). Si una herramienta responde possible_duplicate, pregunta antes de seguir.
4. Para crear una tarea necesitas: título, proyecto y duración estimada; para reuniones/citas también la hora. Si falta algo que no puedas deducir con seguridad, pregunta TODO lo que falte en un solo mensaje corto (p.ej. "¿Cuánto durará la reunión?"). No inventes la duración de reuniones. Si el usuario da un tope ("no más de 40 minutos"), úsalo como duración.
5. Horas en otra zona: pasa time y timeZone tal cual los dijo el usuario ("hora de España" → Europe/Madrid, "hora de Chile" → America/Santiago, "hora de Brasil/aquí" → omitir). El servidor convierte. Al confirmar, muestra la hora local y la original.
6. Fechas relativas ("mañana", "en unos 3 días", "el viernes") → calcula date YYYY-MM-DD desde hoy (${today}). Si cae en sábado/domingo, dilo en la confirmación.
7. "Termina/finaliza/cierra la tarea actual" → complete_current con markTaskCompleted=true. "Pausa/detén el cronómetro" → markTaskCompleted=false.
8. Secuencias ("voy a nadar, luego al gym y por último a caminar") → identifica cada actividad, usa su duración por defecto (o la indicada) y llama schedule_sequence: cada una se cerrará y la siguiente arrancará sola. Si alguna actividad no tiene auto-cierre o no existe, avísalo/pregunta.
9. "Aumenta 25 minutos a mi actividad de gym" → adjust_entry_time target=by_name name="gym" deltaMinutes=25 (negativo para reducir).
10. "Arma/planifica mi día", "¿qué hago ahora?", "¿qué sigue?" → plan_day (apply=true si pide armarlo) o get_next_suggestion. Incluye el almuerzo; si una reunión se extendió más allá de la hora de almuerzo, lo siguiente es almorzar.
11. Nunca borres datos. Puedes encadenar varias herramientas en un mismo turno.
12. Responde en español, breve y directo (1–4 líneas), con horas locales HH:mm. No muestres ids. Tras actuar, confirma qué hiciste; el usuario tiene un botón "Deshacer" para cada acción.`;
};

// Internal chat-style message; llm.js converts it for the Responses / Chat API
const toApiMessage = (m) => ({
  role: m.role,
  content: m.content || '',
  tool_calls: m.tool_calls?.length ? m.tool_calls : undefined,
  tool_call_id: m.tool_call_id,
  raw_output: m.raw_output
});

// Last N messages, never starting in the middle of a tool exchange
const trimHistory = (messages) => {
  let slice = messages.slice(-HISTORY_LIMIT);
  const firstUser = slice.findIndex((m) => m.role === 'user');
  if (firstUser > 0) slice = slice.slice(firstUser);
  return slice;
};

const visibleMessages = async (conversation) => {
  const actionIds = conversation.messages.flatMap((m) => m.actions || []);
  const actions = await AssistantAction.find({ _id: { $in: actionIds } }).select('summary undone tool createdAt');
  const byId = new Map(actions.map((a) => [String(a._id), a]));
  return conversation.messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.content || (m.actions && m.actions.length)) && !(m.tool_calls && m.tool_calls.length && !m.content))
    .map((m) => ({
      id: String(m._id),
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      actions: (m.actions || []).map((id) => byId.get(String(id))).filter(Boolean)
        .map((a) => ({ id: String(a._id), summary: a.summary, undone: a.undone, tool: a.tool }))
    }));
};

const runTurn = async ({ conversationId, message }) => {
  const started = Date.now();
  const now = new Date();
  const settings = await AssistantSettings.getSingleton();
  const tz = settings.timezone;

  let conversation = conversationId ? await AssistantConversation.findById(conversationId).catch(() => null) : null;
  if (!conversation) conversation = new AssistantConversation({});
  if (!conversation.messages.length) conversation.title = message.slice(0, 60);
  conversation.messages.push({ role: 'user', content: message });
  await conversation.save();

  const system = await buildSystemPrompt(now);
  const turnActions = [];
  let finalText = null;

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      if (Date.now() - started > TURN_BUDGET_MS) break;
      const history = trimHistory(conversation.messages).map(toApiMessage);
      const { message: reply, usage } = await chatCompletion({ messages: [{ role: 'system', content: system }, ...history], tools: TOOLS });
      conversation.usage.promptTokens += usage.prompt_tokens || 0;
      conversation.usage.completionTokens += usage.completion_tokens || 0;

      const toolCalls = (reply.tool_calls || []).filter((tc) => tc.type === 'function' || tc.function);
      if (!toolCalls.length) {
        finalText = (reply.content || '').trim() || 'Listo.';
        break;
      }

      conversation.messages.push({
        role: 'assistant',
        content: reply.content || '',
        raw_output: reply.raw_output,
        tool_calls: toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments || '{}' } }))
      });

      for (const tc of toolCalls) {
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {
          args = null;
        }
        const rec = new Recorder();
        const ctx = { now: new Date(), tz, settings, rec, conversationId: conversation._id };
        const result = args === null
          ? { status: 'error', message: 'Argumentos JSON inválidos' }
          : await executeTool(tc.function.name, args, ctx);

        if (rec.hasChanges) {
          const action = await rec.persist({
            conversationId: conversation._id,
            tool: tc.function.name,
            summary: result.summary || tc.function.name
          });
          if (action) turnActions.push(action._id);
        }
        const { summary, ...forModel } = result;
        conversation.messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(forModel).slice(0, 12000) });
      }
      await conversation.save();
    }
  } catch (error) {
    // Keep what was already done visible (with its undo buttons)
    conversation.messages.push({ role: 'assistant', content: `⚠️ ${error.message}`, actions: turnActions });
    await conversation.save();
    error.conversationId = String(conversation._id);
    throw error;
  }

  if (finalText === null) {
    finalText = turnActions.length
      ? 'Hice parte de lo pedido (ver acciones). ¿Quieres que continúe?'
      : 'No pude completar la solicitud a tiempo. ¿Puedes reformularla o dividirla?';
  }
  conversation.messages.push({ role: 'assistant', content: finalText, actions: turnActions });
  await conversation.save();

  const visible = await visibleMessages(conversation);
  return {
    conversationId: String(conversation._id),
    title: conversation.title,
    message: visible[visible.length - 1],
    model: getConfig().model
  };
};

module.exports = { runTurn, visibleMessages, buildSystemPrompt };
