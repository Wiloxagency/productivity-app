const mongoose = require('mongoose');

// A chat thread with the assistant. `messages` keeps the raw OpenAI-format
// messages (user / assistant / tool) so the thread can be resumed with full
// tool context. The UI only renders user + assistant messages with content.
const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'tool'], required: true },
  content: { type: String, default: '' },
  tool_calls: { type: mongoose.Schema.Types.Mixed },
  tool_call_id: { type: String },
  // Responses API output items (reasoning + function_call) replayed next turn
  raw_output: { type: mongoose.Schema.Types.Mixed },
  // Actions (undoable) produced while answering this message
  actions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AssistantAction' }],
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const assistantConversationSchema = new mongoose.Schema({
  title: { type: String, default: 'Nueva conversación' },
  messages: [messageSchema],
  usage: {
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('AssistantConversation', assistantConversationSchema);
