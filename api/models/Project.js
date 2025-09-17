const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    default: '#2196f3' // Default blue color
  },
  status: {
    type: String,
    enum: ['active', 'on-hold', 'completed', 'cancelled'],
    default: 'active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  targetEndDate: {
    type: Date
  },
  priority: {
    type: Number,
    default: 1,
    min: 1
  },
  tags: [String],
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for better query performance
projectSchema.index({ status: 1, isArchived: 1 });

module.exports = mongoose.model('Project', projectSchema);
