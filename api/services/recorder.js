const mongoose = require('mongoose');
const AssistantAction = require('../models/AssistantAction');

// Collects the writes done during one assistant tool call so they can be undone.
class Recorder {
  constructor() {
    this.ops = [];
    this.seen = new Set();
  }

  created(doc) {
    if (!doc) return;
    this.ops.push({ op: 'create', model: doc.constructor.modelName, docId: doc._id });
  }

  // Call BEFORE mutating `doc`. Only the first snapshot per document is kept.
  before(doc) {
    if (!doc || !doc._id) return;
    const model = doc.constructor.modelName;
    const key = `${model}:${doc._id}`;
    if (this.seen.has(key)) return;
    if (this.ops.some((o) => o.op === 'create' && String(o.docId) === String(doc._id))) return;
    this.seen.add(key);
    this.ops.push({ op: 'update', model, docId: doc._id, before: doc.toObject({ depopulate: true }) });
  }

  deleted(doc) {
    if (!doc) return;
    this.ops.push({ op: 'delete', model: doc.constructor.modelName, docId: doc._id, before: doc.toObject({ depopulate: true }) });
  }

  get hasChanges() {
    return this.ops.length > 0;
  }

  async persist({ conversationId, tool, summary }) {
    if (!this.hasChanges) return null;
    return AssistantAction.create({ conversation: conversationId, tool, summary, ops: this.ops });
  }
}

const undoAction = async (actionId) => {
  const action = await AssistantAction.findById(actionId);
  if (!action) throw new Error('Acción no encontrada');
  if (action.undone) return action;

  for (const op of [...action.ops].reverse()) {
    const Model = mongoose.model(op.model);
    if (op.op === 'create') {
      await Model.collection.deleteOne({ _id: op.docId });
    } else if (op.op === 'update') {
      await Model.collection.replaceOne({ _id: op.docId }, op.before, { upsert: true });
    } else if (op.op === 'delete') {
      await Model.collection.replaceOne({ _id: op.docId }, op.before, { upsert: true });
    }
  }

  action.undone = true;
  action.undoneAt = new Date();
  await action.save();
  return action;
};

module.exports = { Recorder, undoAction };
