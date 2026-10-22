const mongoose = require('mongoose');

// Long-term memory of the assistant: what Leonardo asked it to keep in mind
// (preferences, style, habits/durations, facts) and pending reminders.
// One-shot items (a reminder, a single scheduling request) are marked `done`
// once used, so they stop showing up in the prompt. Nothing is hard-deleted.
const assistantMemorySchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['preference', 'style', 'habit', 'fact', 'reminder', 'note'],
    default: 'note'
  },
  text: { type: String, required: true, trim: true },
  // What it refers to ("Natación", "Proyecto Carlos V") — used for matching
  subject: { type: String, trim: true },
  // Usual duration for a habit ("nado 1 hora" -> 60)
  minutes: Number,
  // Reminders: YYYY-MM-DD from which to bring it up ("más adelante" = none)
  dueDate: String,
  oneShot: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'done', 'archived'], default: 'active' },
  resolvedAt: Date,
  resolution: String,
  source: { type: String, enum: ['assistant', 'user'], default: 'assistant' },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'AssistantConversation' }
}, { timestamps: true });

assistantMemorySchema.index({ status: 1, kind: 1 });

module.exports = mongoose.model('AssistantMemory', assistantMemorySchema);
