// Memory tools: what the assistant keeps between conversations.
const AssistantMemory = require('../../models/AssistantMemory');
const { define, str, num, bool, obj, fail, rankBySimilarity } = require('./toolkit');
const { KIND_LABEL } = require('./memory');

const KINDS = ['preference', 'style', 'habit', 'fact', 'reminder', 'note'];

define('remember',
  'Guarda en la memoria algo que debe valer más adelante, SIN pedir permiso: preferencias y estilo de respuesta, hábitos y duraciones habituales ("nado 1 hora" → kind=habit, subject="Natación", minutes=60), datos relevantes y recordatorios "más adelante recuérdame X" (kind=reminder; dueDate si dio fecha). No guardes lo que ya quedó agendado. Si ya existe algo parecido, lo actualiza.',
  obj({
    kind: { type: 'string', enum: KINDS, description: 'preference | style | habit | fact | reminder | note' },
    text: str('Lo que hay que recordar, en una frase clara'),
    subject: str('A qué se refiere (actividad, tarea, proyecto o persona)'),
    minutes: num('Duración habitual (solo hábitos)'),
    dueDate: str('YYYY-MM-DD desde cuándo recordarlo (recordatorios)'),
    oneShot: bool('true si sirve una sola vez (los recordatorios lo son por defecto)')
  }, ['kind', 'text']),
  async (args, ctx) => {
    if (args.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.dueDate)) return fail('dueDate debe ser YYYY-MM-DD');
    const active = await AssistantMemory.find({ status: 'active', kind: args.kind });
    const same = rankBySimilarity(args.subject ? `${args.subject} ${args.text}` : args.text, active,
      (m) => [m.subject ? `${m.subject} ${m.text}` : m.text], { min: 0.82, limit: 1 })[0]
      || (args.kind === 'habit' && args.subject
        ? rankBySimilarity(args.subject, active.filter((m) => m.subject), (m) => m.subject, { min: 0.85, limit: 1 })[0]
        : null);
    const fields = {
      kind: args.kind,
      text: args.text.trim(),
      subject: args.subject || undefined,
      minutes: args.minutes > 0 ? Math.round(args.minutes) : undefined,
      dueDate: args.dueDate || undefined,
      oneShot: typeof args.oneShot === 'boolean' ? args.oneShot : args.kind === 'reminder'
    };
    if (same) {
      const m = same.item;
      ctx.rec.before(m);
      Object.entries(fields).forEach(([key, value]) => { if (value !== undefined) m[key] = value; });
      await m.save();
      return { status: 'updated', id: String(m._id), summary: `Memoria actualizada: ${m.text}` };
    }
    const m = await AssistantMemory.create({ ...fields, conversation: ctx.conversationId });
    ctx.rec.created(m);
    return { status: 'saved', id: String(m._id), summary: `Recordaré (${KIND_LABEL[m.kind]}): ${m.text}` };
  });

define('update_memory',
  'Corrige un recuerdo existente (el usuario cambió de idea: "ahora nado 45 minutos", "el recordatorio pásalo al lunes").',
  obj({
    id: str('Id del recuerdo (de la sección Memoria)'),
    text: str('Nuevo texto'),
    subject: str('Nuevo sujeto'),
    minutes: num('Nueva duración'),
    dueDate: str('Nueva fecha YYYY-MM-DD ("" para quitarla)')
  }, ['id']),
  async (args, ctx) => {
    const m = await AssistantMemory.findById(args.id).catch(() => null);
    if (!m) return fail('Recuerdo no encontrado');
    ctx.rec.before(m);
    if (args.text) m.text = args.text.trim();
    if (args.subject) m.subject = args.subject;
    if (args.minutes > 0) m.minutes = Math.round(args.minutes);
    if (args.dueDate !== undefined) m.dueDate = args.dueDate || undefined;
    m.status = 'active';
    await m.save();
    return { status: 'updated', summary: `Memoria actualizada: ${m.text}` };
  });

define('forget_memory',
  'Saca un recuerdo de la memoria activa: reason="used" cuando ya se usó un recuerdo de un solo uso (p.ej. el recordatorio quedó agendado o ya se hizo), "obsolete" si dejó de valer o el usuario pide olvidarlo.',
  obj({
    id: str('Id del recuerdo'),
    reason: { type: 'string', enum: ['used', 'obsolete'] }
  }, ['id']),
  async (args, ctx) => {
    const m = await AssistantMemory.findById(args.id).catch(() => null);
    if (!m) return fail('Recuerdo no encontrado');
    if (m.status !== 'active') return { status: 'ok', message: 'Ya no estaba activo' };
    ctx.rec.before(m);
    m.status = args.reason === 'obsolete' ? 'archived' : 'done';
    m.resolvedAt = ctx.now;
    m.resolution = args.reason || 'used';
    await m.save();
    return { status: 'ok', summary: `${args.reason === 'obsolete' ? 'Olvidado' : 'Usado y retirado de memoria'}: ${m.text}` };
  });
