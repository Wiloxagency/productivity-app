const mongoose = require('mongoose');

const dailyPlanningSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  },
  plannedTasks: [{
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true
    },
    plannedStartTime: Date,
    plannedDuration: Number, // in minutes
    actualDuration: Number, // in minutes
    completed: {
      type: Boolean,
      default: false
    },
    priority: {
      type: Number,
      default: 1
    }
  }],
  plannedActivities: [{
    activity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity',
      required: true
    },
    plannedStartTime: Date,
    plannedDuration: Number, // in minutes
    actualDuration: Number, // in minutes
    completed: {
      type: Boolean,
      default: false
    },
    priority: {
      type: Number,
      default: 1
    }
  }],
  goals: [String], // Daily goals/objectives
  notes: String,
  productivity: {
    planned: {
      totalTasks: { type: Number, default: 0 },
      totalTime: { type: Number, default: 0 } // in minutes
    },
    actual: {
      completedTasks: { type: Number, default: 0 },
      totalTime: { type: Number, default: 0 } // in minutes
    },
    score: { type: Number, default: 0 } // 0-100 productivity score
  },
  personalGrowth: {
    planned: {
      totalItems: { type: Number, default: 0 },
      totalTime: { type: Number, default: 0 } // in minutes for Personal Development + Health & Fitness
    },
    actual: {
      completedItems: { type: Number, default: 0 },
      totalTime: { type: Number, default: 0 } // in minutes from time tracker
    },
    score: { type: Number, default: 0 } // 0-100 personal growth score
  },
  dayType: {
    type: String,
    enum: ['workday', 'weekend', 'holiday', 'vacation'],
    default: 'workday'
  }
}, {
  timestamps: true
});

// Initialize default values for personal growth if not set
dailyPlanningSchema.pre('save', function(next) {
  // Initialize personalGrowth field if it doesn't exist
  if (!this.personalGrowth) {
    this.personalGrowth = {
      planned: { totalItems: 0, totalTime: 0 },
      actual: { completedItems: 0, totalTime: 0 },
      score: 0
    };
  }
  
  // Productivity score is now calculated dynamically in the route using time tracker data
  // This ensures it's always time-based and matches the actual time spent
  
  next();
});

module.exports = mongoose.model('DailyPlanning', dailyPlanningSchema);
