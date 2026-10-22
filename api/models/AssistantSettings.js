const mongoose = require('mongoose');

// Singleton document with the preferences the assistant and the day planner use.
const assistantSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  timezone: { type: String, default: 'America/Fortaleza' },
  workdayStart: { type: String, default: '03:30' }, // HH:mm local
  workdayEnd: { type: String, default: '18:00' },   // HH:mm local
  lunchTime: { type: String, default: '12:00' },    // HH:mm local
  lunchDuration: { type: Number, default: 60 },     // minutes
  lunchActivity: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity' },
  // Minutes left free between planned blocks
  bufferMinutes: { type: Number, default: 5 },
  // Default duration when a meeting/task has no estimate and none can be inferred
  defaultTaskMinutes: { type: Number, default: 30 },
  // Project used for tasks the assistant has to create without a clear project
  defaultProject: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  // Free text the assistant always keeps in mind ("los viernes no agendo reuniones")
  customInstructions: { type: String, default: '' }
}, { timestamps: true });

assistantSettingsSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne({ key: 'default' });
  if (!doc) doc = await this.create({ key: 'default' });
  return doc;
};

module.exports = mongoose.model('AssistantSettings', assistantSettingsSchema);
