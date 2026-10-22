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
const { activeMemories, memoryPromptBlock } = require('./memory');
const { localDateStr, localTimeStr, localDateTimeStr, weekdayName, zonedParts } = require('../../utils/time');

const MAX_STEPS = 14;
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

  const [projects, activities, categories, active, queue, next, lunch, memories] = await Promise.all([
    Project.find({ isArchived: false, status: { $in: ['active', 'on-hold'] } }).sort({ priority: 1, name: 1 }).limit(120),
    Activity.find({}).populate('category', 'name').sort({ name: 1 }),
    Category.find({}).sort({ name: 1 }),
    TimeEntry.findOne({ isActive: true }).populate('activity', 'name').populate('task', 'title'),
    QueueItem.find({ status: { $in: ['pending', 'running'] } }).sort({ sequenceId: 1, order: 1 }),
    getNextSuggestion({ now }).catch(() => null),
    findLunchActivity(settings),
    activeMemories()
  ]);
  const defaultProject = settings.defaultProject ? projects.find((p) => String(p._id) === String(settings.defaultProject)) : null;

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
- Proyecto por defecto para tareas sin proyecto: ${defaultProject ? defaultProject.name : '"General" (se crea si no existe)'}.
${settings.customInstructions ? `- Indicaciones del usuario: ${settings.customInstructions}\n` : ''}
# Proyectos activos (id · nombre)
${projects.map((p) => `- ${p._id} · ${p.name}`).join('\n') || '- (ninguno)'}

# Actividades (id · nombre · categoría · duración por defecto · auto-cierre · alias)
${activities.map((a) => `- ${a._id} · ${a.name} · ${a.category?.name || '-'} · ${a.estimatedDuration} min · ${a.autoStop ? 'sí' : 'no'}${a.aliases?.length ? ` · ${a.aliases.join(', ')}` : ''}`).join('\n') || '- (ninguna)'}

# Categorías
${categories.map((c) => c.name).join(', ')}

# Memoria (aplícala siempre · id · tipo · texto)
${memoryPromptBlock(memories)}

# Cómo trabajas
A. AUTONOMÍA. Leonardo prefiere que actúes antes que preguntar: repetir y aclarar le cuesta más que hacerlo él. Si un mensaje trae varias peticiones, resuélvelas TODAS en este mismo turno (puedes llamar varias herramientas a la vez). No preguntes lo que puedas deducir con lógica, la memoria o los datos: asume lo razonable, hazlo y al final dilo en una línea "Supuse: …" (él lo corrige o lo deshace). Como máximo UNA pregunta por turno, al final y después de ejecutar todo lo demás, y solo si de verdad no hay forma razonable de seguir.
B. AGENDA. Para agendar u organizar uno o varios elementos de un día usa organize_day en UNA sola llamada con todos ellos (pasa itemType+id si lo conoces; si no, el nombre tal cual):
   - Orden: primero lo que tiene hora de inicio (start) y lo que tiene inicio y fin (start+end) — quedan fijos —; el resto lo coloca el servidor en los huecos libres, en el orden en que lo dijo.
   - Duración: si no la dijo, NO la preguntes; omite minutes y el servidor la estima (memoria > configurada > historial > lógica: reunión 60, nadar/gym 60, caminar 45, ducha 20). Nunca estires algo para llenar un hueco.
   - Huecos: pueden quedar libres. No preguntes qué hará en ellos (reunión 10–11 y almuerzo 12 → no preguntes por 11–12); si hay elementos sin hora, van ahí.
   - Si el elemento no existe, organize_day crea la tarea (projectHint si mencionó proyecto; si no, el proyecto por defecto). No preguntes por proyecto.
   - "Para mañana (o el día X) mi agenda es/sea …" → organize_day con esa fecha y mode="replace": se guarda directo en el plan de ese día, sin preguntar y sin memoria.
   - "Agrega X a las 15:00", "el almuerzo hoy a las 11" → organize_day con ese elemento.
   - Si devuelve conflicts, resuélvelo con lógica si es obvio o menciónalo en una línea.
C. MEMORIA. Guarda con remember, sin pedir permiso y en el mismo turno, lo que deba valer más adelante: preferencias y estilo ("respóndeme más corto"), hábitos y duraciones ("nado 1 hora" → kind=habit, subject, minutes), datos y observaciones relevantes, y recordatorios ("más adelante recuérdame X" → kind=reminder sin fecha; "recuérdamelo el lunes" → dueDate). No guardes lo que ya ejecutaste (una agenda ya guardada no va a memoria). Un recuerdo de un solo uso, una vez usado, se retira: forget_memory reason="used" (los recordatorios que organize_day agenda se retiran solos: remindersUsed). Si algo cambia → update_memory; "olvida X" → forget_memory reason="obsolete".
   - Al organizar/planificar un día, si el resultado trae "reminders" (recordatorios pendientes), al final pregunta en UNA línea si los agregas (es la pregunta permitida en ese caso); si dice que sí, agrégalos con organize_day.

# Reglas
1. Busca antes de crear (search_*) y razona por similitud y contexto (sinónimos, traducciones, abreviaturas, números romanos: "Carlos V" = "Carlos 5"; "factory" ≈ "Factoría"; "nadar" ≈ "Swimming"). Reutiliza lo existente y evita duplicados.
2. Jerarquía: Proyecto → Tarea → Subtarea. Si lo pedido encaja bajo una tarea existente del proyecto, créalo como subtarea con parentTaskId.
3. possible_duplicate → usa la existente más parecida sin preguntar, salvo que sea claramente otra cosa (entonces allowDuplicate=true). Solo los PROYECTOS y ACTIVIDADES nuevos necesitan un "sí" (userConfirmed=true); si el usuario pidió crearlos explícitamente ("crea el proyecto X"), eso ya es el sí.
4. create_task: título y, si los sabes, proyecto y fecha/hora. Sin duración ni proyecto la herramienta asume (duración estimada, proyecto por defecto): no preguntes. Un tope ("no más de 40 minutos") es la duración.
5. Horas en otra zona: pasa time y timeZone tal cual los dijo el usuario ("hora de España" → Europe/Madrid, "hora de Chile" → America/Santiago, "hora de Brasil/aquí" → omitir). El servidor convierte. Al confirmar, muestra la hora local y la original.
6. Fechas relativas ("mañana", "en unos 3 días", "el viernes") → calcula YYYY-MM-DD desde hoy (${today}). Si cae en sábado/domingo, dilo en la confirmación.
7. "Termina/finaliza/cierra la tarea actual" → complete_current con markTaskCompleted=true. "Pausa/detén el cronómetro" → markTaskCompleted=false. "Terminé X" / "terminé mi primera tarea" (aunque no esté corriendo) → complete_task con su id; "la primera" = la primera no completada de get_day_plan.
8. Secuencias de rutinas ("voy a nadar, luego al gym y por último a caminar") → schedule_sequence: cada una se cerrará y la siguiente arrancará sola. Nunca encadenes tareas de trabajo ni el almuerzo (no arrancan solos). Para la jornada de trabajo usa organize_day.
9a. Tiempo ya ocurrido ("la reunión de X ya la tuve de 3:45 a 4:40") → log_time (markCompleted=true si ya la tuvo). Si responde "overlap", ajusta con update_time_entry si es obvio; si no, pregunta.
9b. Corregir horas de una entrada ("Invoices lo empecé a las 4:40") → update_time_entry.
9. "Aumenta 25 minutos a mi gym" → adjust_entry_time target=by_name name="gym" deltaMinutes=25 (negativo para reducir).
10. Planificación:
   - "Planifica/arma/organiza mi día" sin elementos nuevos → plan_day apply=true (no mete el backlog). Las suggestions son informativas: no preguntes por ellas (como mucho nombra 2–3 en una línea). includeBacklog=true solo si pide "rellena con el backlog".
   - "Quita X del día" → remove_from_plan items; "deja solo las que te dije" → keepOnly (y luego plan_day apply=true).
   - Tras cambiar el plan muestra el día completo en orden cronológico, una línea por elemento "HH:mm–HH:mm Título [Proyecto]" (organize_day lo devuelve en "day"; si usaste otra herramienta, get_day_plan).
   - "¿Qué sigue?" → get_next_suggestion. Si una reunión se extendió más allá de la hora de almuerzo, lo siguiente es almorzar.
11. Nunca borres datos.
12. VERACIDAD: solo afirma que hiciste algo si llamaste a la herramienta y devolvió éxito (status distinto de error/needs_confirmation/possible_duplicate). Si no existe herramienta para lo pedido o falló, dilo claramente.
13. Responde en español, breve y directo (1–4 líneas, salvo cuando muestres el plan del día), con horas locales HH:mm, aplicando el estilo guardado en memoria. No muestres ids. Tras actuar, confirma qué hiciste; el usuario tiene un botón "Deshacer" para cada acción.`;
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
    const done = turnActions.length
      ? await AssistantAction.find({ _id: { $in: turnActions } }).select('summary')
      : [];
    finalText = done.length
      ? `Alcancé el límite de tiempo de este turno. Hecho hasta ahora:\n${done.map((a) => `- ${a.summary}`).join('\n')}\nEscribe "continúa" para terminar el resto.`
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
