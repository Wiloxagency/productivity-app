const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  name: {
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
    ref: 'Project'
  },
  quadrant: {
    type: Number,
    required: true,
    enum: [1, 2, 3, 4], // 1: urgent/important, 2: not urgent/important, 3: urgent/not important, 4: not urgent/not important
    validate: {
      validator: function(v) {
        return [1, 2, 3, 4].includes(v);
      },
      message: 'Quadrant must be 1, 2, 3, or 4'
    }
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  estimatedDuration: {
    type: Number, // in minutes
    default: 25 // Default pomodoro duration
  },
  color: {
    type: String,
    default: '#28a745'
  },
  scheduleTime: {
    type: String, // HH:mm format
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Activity', activitySchema);
