const mongoose = require('mongoose');

const defaultSelectionSchema = new mongoose.Schema({
  // Store either tasks or activities, but not both in the same document
  type: {
    type: String,
    enum: ['tasks', 'activities'],
    required: true
  },
  selectedTasks: [{
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    },
    plannedDuration: Number // in minutes
  }],
  selectedActivities: [{
    activity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity'
    },
    plannedDuration: Number // in minutes
  }],
  // Only one default selection per type (tasks or activities)
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Ensure only one active default selection per type
defaultSelectionSchema.index({ type: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

module.exports = mongoose.model('DefaultSelection', defaultSelectionSchema);
