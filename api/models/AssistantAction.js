const mongoose = require('mongoose');

// Undo log for every write the assistant performs.
// ops are replayed in reverse order on undo:
//   create -> delete the document
//   update -> restore the `before` snapshot
//   delete -> re-insert the `before` snapshot
const opSchema = new mongoose.Schema({
  op: { type: String, enum: ['create', 'update', 'delete'], required: true },
  model: { type: String, required: true },
  docId: { type: mongoose.Schema.Types.ObjectId, required: true },
  before: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const assistantActionSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'AssistantConversation' },
  tool: { type: String },
  summary: { type: String, required: true },
  ops: [opSchema],
  undone: { type: Boolean, default: false },
  undoneAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('AssistantAction', assistantActionSchema);
