const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema({
  activity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Activity'
  },
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number, // in minutes, calculated when endTime is set
    default: 0
  },
  isPomodoro: {
    type: Boolean,
    default: false
  },
  isBreak: {
    type: Boolean,
    default: false
  },
  pomodoroCompleted: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    trim: true
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true // true when timer is running, false when stopped
  },
  // Planned end of the entry. Only enforced when autoStop is true.
  plannedEnd: {
    type: Date
  },
  // Close automatically at plannedEnd (activity flag or assistant sequence)
  autoStop: {
    type: Boolean,
    default: false
  },
  // Groups entries started by the same assistant sequence (swim -> gym -> walk)
  sequenceId: {
    type: String
  },
  source: {
    type: String,
    enum: ['user', 'assistant', 'auto'],
    default: 'user'
  }
}, {
  timestamps: true
});

// Validation: Either activity or task must be provided, but not both
timeEntrySchema.pre('validate', function(next) {
  if (!this.activity && !this.task) {
    next(new Error('Either activity or task must be provided'));
  } else if (this.activity && this.task) {
    next(new Error('Cannot track both activity and task simultaneously'));
  } else {
    next();
  }
});

// Calculate duration before saving
timeEntrySchema.pre('save', function(next) {
  if (this.endTime && this.startTime) {
    this.duration = Math.round((this.endTime - this.startTime) / (1000 * 60)); // Convert to minutes
    this.isActive = false;
  }
  next();
});

timeEntrySchema.index({ isActive: 1, autoStop: 1, plannedEnd: 1 });

module.exports = mongoose.model('TimeEntry', timeEntrySchema);
