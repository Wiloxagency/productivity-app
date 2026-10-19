const mongoose = require('mongoose');

// Upcoming items chained by the assistant ("voy a nadar, luego gym y por último
// caminar"). Items of the same sequence are started back-to-back automatically
// when the previous one is auto-closed.
const queueItemSchema = new mongoose.Schema({
  sequenceId: { type: String, required: true, index: true },
  order: { type: Number, required: true },
  itemType: { type: String, enum: ['task', 'activity'], required: true },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  activity: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity' },
  title: { type: String },
  plannedMinutes: { type: Number, required: true },
  autoStart: { type: Boolean, default: true },
  // Optional absolute start for the first item of a sequence (e.g. "a las 6")
  scheduledStart: { type: Date },
  status: {
    type: String,
    enum: ['pending', 'running', 'done', 'skipped'],
    default: 'pending'
  },
  timeEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'TimeEntry' },
  startedAt: { type: Date },
  endedAt: { type: Date }
}, { timestamps: true });

queueItemSchema.index({ status: 1, sequenceId: 1, order: 1 });

module.exports = mongoose.model('QueueItem', queueItemSchema);
