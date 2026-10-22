// Minimal OpenAI client (fetch, no SDK dependency).
// gpt-6-astra only supports function tools + reasoning through the Responses
// API (/v1/responses), so that is the default. Chat Completions stays available
// for OpenAI-compatible providers that lack /responses.
// Config (api/.env):
//   OPENAI_API_KEY=sk-...
//   OPENAI_MODEL=gpt-6-astra
//   OPENAI_API_MODE=responses        (optional: responses | chat)
//   OPENAI_BASE_URL=https://api.openai.com/v1   (optional)
//   OPENAI_REASONING_EFFORT=low      (optional: none | low | medium | high)
//   OPENAI_TIMEOUT_MS=60000          (optional)

const getConfig = () => ({
  apiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-6-astra',
  mode: (process.env.OPENAI_API_MODE || 'responses').toLowerCase(),
  baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  reasoningEffort: process.env.OPENAI_REASONING_EFFORT || '',
  timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 60000)
});

const isConfigured = () => !!getConfig().apiKey;

class LlmError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const post = async (cfg, path, body) => {
  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs)
    });
  } catch (error) {
    throw new LlmError(`No se pudo contactar al modelo (${error.name === 'TimeoutError' ? 'timeout' : error.message})`, 504);
  }
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LlmError(`Respuesta inválida del modelo (${response.status})`, 502);
  }
  if (!response.ok) {
    throw new LlmError(json?.error?.message || `Error del modelo (${response.status})`, response.status === 401 ? 503 : 502);
  }
  return json;
};

// ---------------------------------------------------------------- Responses API
// Our conversation is stored in chat format; convert it to Responses input items.
// Assistant turns that called tools keep the raw `output` items (reasoning with
// encrypted content + function_call) so the model gets its own reasoning back.
const toResponsesInput = (messages) => {
  const input = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: m.tool_call_id, output: m.content || '' });
    } else if (m.role === 'assistant' && Array.isArray(m.raw_output) && m.raw_output.length) {
      input.push(...m.raw_output);
    } else if (m.role === 'assistant' && m.tool_calls?.length) {
      if (m.content) input.push({ role: 'assistant', content: m.content });
      m.tool_calls.forEach((tc) => input.push({
        type: 'function_call', call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments || '{}'
      }));
    } else if (m.content) {
      input.push({ role: m.role, content: m.content });
    }
  }
  return input;
};

const toResponsesTools = (tools = []) => tools.map((t) => ({
  type: 'function',
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters
}));

const responsesCreate = async (cfg, { messages, tools }) => {
  const system = messages.find((m) => m.role === 'system');
  const body = {
    model: cfg.model,
    instructions: system?.content,
    input: toResponsesInput(messages),
    tools: toResponsesTools(tools),
    tool_choice: 'auto',
    parallel_tool_calls: true,
    store: false,
    include: ['reasoning.encrypted_content'],
    ...(cfg.reasoningEffort ? { reasoning: { effort: cfg.reasoningEffort } } : {})
  };
  const json = await post(cfg, '/responses', body);
  const output = Array.isArray(json.output) ? json.output : [];

  const text = output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((c) => c.type === 'output_text' || c.type === 'text')
    .map((c) => c.text)
    .join('\n')
    .trim() || (json.output_text || '').trim();

  const calls = output.filter((item) => item.type === 'function_call');
  return {
    message: {
      content: text,
      tool_calls: calls.map((c) => ({ id: c.call_id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })),
      // Items to replay on the next request (reasoning + function calls)
      raw_output: calls.length ? output.filter((item) => item.type === 'reasoning' || item.type === 'function_call') : undefined
    },
    usage: {
      prompt_tokens: json.usage?.input_tokens || 0,
      completion_tokens: json.usage?.output_tokens || 0
    }
  };
};

// ---------------------------------------------------------------- Chat Completions
const chatCreate = async (cfg, { messages, tools }) => {
  const body = {
    model: cfg.model,
    messages: messages.map((m) => {
      if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content || '' };
      if (m.role === 'assistant' && m.tool_calls?.length) return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls };
      return { role: m.role, content: m.content || '' };
    }),
    ...(tools && tools.length ? { tools, tool_choice: 'auto', parallel_tool_calls: true } : {}),
    ...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {})
  };
  const json = await post(cfg, '/chat/completions', body);
  const message = json.choices?.[0]?.message;
  if (!message) throw new LlmError('El modelo no devolvió mensaje', 502);
  return { message, usage: json.usage || {} };
};

const chatCompletion = async ({ messages, tools }) => {
  const cfg = getConfig();
  if (!cfg.apiKey) throw new LlmError('OPENAI_API_KEY no está configurada en api/.env', 503);
  return cfg.mode === 'chat' ? chatCreate(cfg, { messages, tools }) : responsesCreate(cfg, { messages, tools });
};

module.exports = { chatCompletion, isConfigured, getConfig, LlmError, toResponsesInput };
