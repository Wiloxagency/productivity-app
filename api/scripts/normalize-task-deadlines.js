require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../models/Task');
const { normalizeTaskDeadlinePair } = require('../utils/taskDeadline');

const isSameDate = (left, right) => {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return new Date(left).getTime() === new Date(right).getTime();
};

const normalizeTaskDeadlines = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB Atlas');

    const tasks = await Task.find({}, { _id: 1, dueDate: 1, plannedDate: 1 }).lean();

    let updated = 0;
    let alreadyNormalized = 0;
    let cleared = 0;

    for (const task of tasks) {
      const normalizedDates = normalizeTaskDeadlinePair(task.dueDate, task.plannedDate);
      const shouldUpdate =
        !isSameDate(task.dueDate, normalizedDates.dueDate) ||
        !isSameDate(task.plannedDate, normalizedDates.plannedDate);

      if (!shouldUpdate) {
        alreadyNormalized += 1;
        continue;
      }

      await Task.updateOne(
        { _id: task._id },
        {
          $set: {
            dueDate: normalizedDates.dueDate,
            plannedDate: normalizedDates.plannedDate
          }
        }
      );

      if (!normalizedDates.dueDate) {
        cleared += 1;
      }
      updated += 1;
    }

    console.log('Task deadline normalization complete');
    console.log(`Total tasks scanned: ${tasks.length}`);
    console.log(`Tasks updated: ${updated}`);
    console.log(`Tasks already normalized: ${alreadyNormalized}`);
    console.log(`Tasks cleared (both dates null): ${cleared}`);
  } catch (error) {
    console.error('Error normalizing task deadlines:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB Atlas');
  }
};

normalizeTaskDeadlines();
