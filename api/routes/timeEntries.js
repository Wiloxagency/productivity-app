const express = require('express');
const router = express.Router();
const TimeEntry = require('../models/TimeEntry');

// GET all time entries with filtering
router.get('/', async (req, res) => {
  try {
    const { date, activity, isActive } = req.query;
    let filter = {};
    
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      filter.date = { $gte: startDate, $lt: endDate };
    }
    
    if (activity) filter.activity = activity;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    const timeEntries = await TimeEntry.find(filter)
      .populate('activity', 'name color quadrant')
      .populate({
        path: 'activity',
        populate: {
          path: 'category',
          select: 'name color'
        }
      })
      .populate('task', 'title estimatedTime quadrant')
      .populate({
        path: 'task',
        populate: {
          path: 'category',
          select: 'name color'
        }
      })
      .sort({ startTime: -1 });
    
    res.json(timeEntries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET active time entry
router.get('/active', async (req, res) => {
  try {
    const activeEntry = await TimeEntry.findOne({ isActive: true })
      .populate('activity', 'name color quadrant')
      .populate({
        path: 'activity',
        populate: {
          path: 'category',
          select: 'name color'
        }
      })
      .populate('task', 'title estimatedTime quadrant')
      .populate({
        path: 'task',
        populate: {
          path: 'category',
          select: 'name color'
        }
      });
    
    res.json(activeEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST start new time entry
router.post('/start', async (req, res) => {
  try {
    // Stop any active time entries first
    await TimeEntry.updateMany(
      { isActive: true },
      { 
        endTime: new Date(),
        isActive: false
      }
    );
    
    // Calculate duration for stopped entries
    const stoppedEntries = await TimeEntry.find({ endTime: { $exists: true }, duration: 0 });
    for (let entry of stoppedEntries) {
      entry.duration = Math.round((entry.endTime - entry.startTime) / (1000 * 60));
      await entry.save();
    }
    
    // Determine the local-date bucket (midnight UTC for the provided local date)
    let dateField = new Date();
    if (req.body && req.body.localDate) {
      // Expecting format YYYY-MM-DD; parsed as UTC midnight
      const parsed = new Date(req.body.localDate);
      if (!isNaN(parsed.getTime())) {
        dateField = parsed;
      }
    }

    const timeEntry = new TimeEntry({
      ...req.body,
      date: dateField,
      startTime: new Date(),
      isActive: true
    });
    
    await timeEntry.save();
    await timeEntry.populate('activity', 'name color quadrant');
    await timeEntry.populate({
      path: 'activity',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    
    res.status(201).json(timeEntry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST start new time entry with task
router.post('/start-task', async (req, res) => {
  try {
    // Stop any active time entries first
    await TimeEntry.updateMany(
      { isActive: true },
      { 
        endTime: new Date(),
        isActive: false
      }
    );
    
    // Calculate duration for stopped entries
    const stoppedEntries = await TimeEntry.find({ endTime: { $exists: true }, duration: 0 });
    for (let entry of stoppedEntries) {
      entry.duration = Math.round((entry.endTime - entry.startTime) / (1000 * 60));
      await entry.save();
    }
    
    // Determine the local-date bucket (midnight UTC for the provided local date)
    let dateField = new Date();
    if (req.body && req.body.localDate) {
      // Expecting format YYYY-MM-DD; parsed as UTC midnight
      const parsed = new Date(req.body.localDate);
      if (!isNaN(parsed.getTime())) {
        dateField = parsed;
      }
    }

    const timeEntry = new TimeEntry({
      task: req.body.task,
      isPomodoro: req.body.isPomodoro || false,
      notes: req.body.notes,
      date: dateField,
      startTime: new Date(),
      isActive: true
    });
    
    await timeEntry.save();
    await timeEntry.populate('task', 'title estimatedTime quadrant');
    await timeEntry.populate({
      path: 'task',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    
    res.status(201).json(timeEntry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT switch activity on active time entry
router.put('/switch-activity/:id', async (req, res) => {
  try {
    const { activity, notes } = req.body;
    const timeEntry = await TimeEntry.findById(req.params.id);
    
    if (!timeEntry || !timeEntry.isActive) {
      return res.status(404).json({ error: 'Active time entry not found' });
    }
    
    // Update the activity and notes without stopping the timer
    timeEntry.activity = activity;
    timeEntry.task = undefined; // Clear task when switching to activity
    if (notes !== undefined) {
      timeEntry.notes = notes;
    }
    
    await timeEntry.save();
    await timeEntry.populate('activity', 'name color quadrant');
    await timeEntry.populate({
      path: 'activity',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    
    res.json(timeEntry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT switch to task on active time entry
router.put('/switch-task/:id', async (req, res) => {
  try {
    const { task, notes } = req.body;
    const timeEntry = await TimeEntry.findById(req.params.id);
    
    if (!timeEntry || !timeEntry.isActive) {
      return res.status(404).json({ error: 'Active time entry not found' });
    }
    
    // Update the task and notes without stopping the timer
    timeEntry.task = task;
    timeEntry.activity = undefined; // Clear activity when switching to task
    if (notes !== undefined) {
      timeEntry.notes = notes;
    }
    
    await timeEntry.save();
    await timeEntry.populate('task', 'title estimatedTime quadrant');
    await timeEntry.populate({
      path: 'task',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    
    res.json(timeEntry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT stop time entry
router.put('/stop/:id', async (req, res) => {
  try {
    const timeEntry = await TimeEntry.findById(req.params.id);
    if (!timeEntry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    
    timeEntry.endTime = new Date();
    timeEntry.isActive = false;
    timeEntry.notes = req.body.notes || timeEntry.notes;
    
    await timeEntry.save();
    await timeEntry.populate('activity', 'name color quadrant');
    await timeEntry.populate({
      path: 'activity',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    await timeEntry.populate('task', 'title estimatedTime quadrant');
    await timeEntry.populate({
      path: 'task',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    
    res.json(timeEntry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT stop all active entries
router.put('/stop-all', async (req, res) => {
  try {
    const result = await TimeEntry.updateMany(
      { isActive: true },
      { 
        endTime: new Date(),
        isActive: false
      }
    );
    
    res.json({ message: `Stopped ${result.modifiedCount} active time entries` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET daily summary
router.get('/daily-summary/:date', async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);
    
    const timeEntries = await TimeEntry.find({
      date: { $gte: startDate, $lt: endDate }
    }).populate('activity', 'name quadrant')
      .populate({
        path: 'activity',
        populate: {
          path: 'category',
          select: 'name'
        }
      })
      .populate('task', 'title quadrant')
      .populate({
        path: 'task',
        populate: {
          path: 'category',
          select: 'name'
        }
      });
    
    const summary = {
      totalTime: timeEntries.reduce((sum, entry) => sum + entry.duration, 0),
      entriesCount: timeEntries.length,
      byQuadrant: {},
      byCategory: {},
      pomodorosCompleted: timeEntries.filter(entry => entry.pomodoroCompleted).length
    };
    
    // Group by quadrant
    [1, 2, 3, 4].forEach(q => {
      const quadrantEntries = timeEntries.filter(entry => {
        const quadrant = entry.activity?.quadrant || entry.task?.quadrant;
        return quadrant === q;
      });
      summary.byQuadrant[q] = {
        time: quadrantEntries.reduce((sum, entry) => sum + entry.duration, 0),
        count: quadrantEntries.length
      };
    });
    
    // Group by category
    timeEntries.forEach(entry => {
      let categoryName;
      
      // Break time entries count as Work category
      if (entry.isBreak) {
        categoryName = 'Work';
      } else {
        categoryName = entry.activity?.category?.name || entry.task?.category?.name || 'Unknown';
      }
      
      if (!summary.byCategory[categoryName]) {
        summary.byCategory[categoryName] = { time: 0, count: 0 };
      }
      summary.byCategory[categoryName].time += entry.duration;
      summary.byCategory[categoryName].count += 1;
    });
    
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create manual time entry
router.post('/manual', async (req, res) => {
  try {
    const timeEntry = new TimeEntry({
      ...req.body,
      isActive: false // Manual entries are already completed
    });
    
    await timeEntry.save();
    
    // Populate both activity and task fields
    await timeEntry.populate('activity', 'name color quadrant');
    await timeEntry.populate({
      path: 'activity',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    await timeEntry.populate('task', 'title estimatedTime quadrant');
    await timeEntry.populate({
      path: 'task',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    
    res.status(201).json(timeEntry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update time entry (only for completed entries)
router.put('/:id', async (req, res) => {
  try {
    const timeEntry = await TimeEntry.findById(req.params.id);
    if (!timeEntry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    
    // Don't allow updating active entries
    if (timeEntry.isActive) {
      return res.status(400).json({ error: 'Cannot update active time entries' });
    }
    
    // Update allowed fields
    const allowedUpdates = ['startTime', 'endTime', 'duration', 'notes'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    // If startTime or endTime are being updated, recalculate duration
    if (updates.startTime || updates.endTime) {
      const startTime = new Date(updates.startTime || timeEntry.startTime);
      const endTime = new Date(updates.endTime || timeEntry.endTime);
      updates.duration = Math.round((endTime - startTime) / (1000 * 60));
    }
    
    const updatedEntry = await TimeEntry.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    // Populate the response
    await updatedEntry.populate('activity', 'name color quadrant');
    await updatedEntry.populate({
      path: 'activity',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    await updatedEntry.populate('task', 'title estimatedTime quadrant');
    await updatedEntry.populate({
      path: 'task',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    
    res.json(updatedEntry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE time entry
router.delete('/:id', async (req, res) => {
  try {
    const timeEntry = await TimeEntry.findByIdAndDelete(req.params.id);
    if (!timeEntry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    res.json({ message: 'Time entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
