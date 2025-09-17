const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  quadrant: {
    type: Number,
    required: true,
    enum: [1, 2, 3, 4] // 1: urgent/important, 2: not urgent/important, 3: urgent/not important, 4: not urgent/not important
  },
  status: {
    type: String,
    enum: ['Not Started', 'Started', 'Completed', 'Cancelled'],
    default: 'Not Started'
  },
  priority: {
    type: Number,
    default: 1, // Lower number = higher priority
    min: 1
  },
  estimatedTime: {
    type: Number, // in minutes
    default: 25
  },
  actualTime: {
    type: Number, // in minutes, calculated from time entries
    default: 0
  },
  dueDate: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  plannedDate: {
    type: Date // When this task is planned to be worked on
  },
  relatedTimeEntries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TimeEntry'
  }],
  tags: [String]
}, {
  timestamps: true
});

// Calculate actual time from related time entries
taskSchema.methods.calculateActualTime = async function() {
  const TimeEntry = mongoose.model('TimeEntry');
  const timeEntries = await TimeEntry.find({ _id: { $in: this.relatedTimeEntries } });
  this.actualTime = timeEntries.reduce((total, entry) => total + entry.duration, 0);
  return this.actualTime;
};

module.exports = mongoose.model('Task', taskSchema);
