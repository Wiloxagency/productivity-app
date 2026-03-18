const mongoose = require('mongoose');

const deadlineItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  type: {
    type: String,
    enum: ['Project', 'Task', 'Promise'],
    required: true,
  },
  commitmentDate: {
    type: Date,
    required: true,
  },
  finalDeliveryDate: {
    type: Date,
    required: true,
  },
}, {
  timestamps: true,
});

deadlineItemSchema.index({ commitmentDate: 1 });

module.exports = mongoose.model('DeadlineItem', deadlineItemSchema);
