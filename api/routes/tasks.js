const express = require('express');
const router = express.Router();
const Task = require('../models/Task');

// GET all tasks with filtering
router.get('/', async (req, res) => {
  try {
    const { status, quadrant, category, plannedDate } = req.query;
    let filter = {};
    
    if (status) filter.status = status;
    if (quadrant) filter.quadrant = parseInt(quadrant);
    if (category) filter.category = category;
    if (plannedDate) {
      const date = new Date(plannedDate);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      filter.plannedDate = { $gte: date, $lt: nextDate };
    }
    
    const tasks = await Task.find(filter)
      .populate('category', 'name color')
      .populate('project', 'name color')
      .populate('relatedTimeEntries')
      .sort({ priority: 1, createdAt: 1 });
    
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET backlog (ordered by priority)
router.get('/backlog', async (req, res) => {
  try {
    const tasks = await Task.find({ 
      status: { $in: ['Not Started', 'Started'] } // Include both not started and started tasks in backlog
    })
      .populate('category', 'name color')
      .populate('project', 'name color')
      .sort({ priority: 1, createdAt: 1 });
    
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET daily tasks
router.get('/daily/:date', async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);
    
    const tasks = await Task.find({
      plannedDate: { $gte: startDate, $lt: endDate }
    }).populate('category', 'name color')
      .populate('project', 'name color')
      .populate('relatedTimeEntries')
      .sort({ priority: 1 });
    
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new task
router.post('/', async (req, res) => {
  try {
    const task = new Task(req.body);
    await task.save();
    await task.populate('category', 'name color');
    await task.populate('project', 'name color');
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT reorder tasks in backlog (MUST come before /:id routes)
router.put('/reorder', async (req, res) => {
  try {
    const { taskIds } = req.body; // Array of task IDs in new order
    
    const updatePromises = taskIds.map((taskId, index) => 
      Task.findByIdAndUpdate(taskId, { priority: index + 1 })
    );
    
    await Promise.all(updatePromises);
    
    const reorderedTasks = await Task.find({ 
      _id: { $in: taskIds },
      status: { $in: ['Not Started', 'Started'] }
    }).populate('category', 'name color')
      .populate('project', 'name color')
      .sort({ priority: 1 });
    
    res.json(reorderedTasks);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update task
router.put('/:id', async (req, res) => {
  try {
    if (req.body.status === 'Completed' && !req.body.completedAt) {
      req.body.completedAt = new Date();
    }
    
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('category', 'name color')
     .populate('project', 'name color');
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT move task from backlog to daily planning
router.put('/:id/plan', async (req, res) => {
  try {
    const { plannedDate, priority } = req.body;
    
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      {
        // Do NOT change status - keep original backlog status
        plannedDate: new Date(plannedDate),
        priority: priority || 1
      },
      { new: true, runValidators: true }
    ).populate('category', 'name color')
     .populate('project', 'name color');
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE task
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
