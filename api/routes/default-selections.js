const express = require('express');
const router = express.Router();
const DefaultSelection = require('../models/DefaultSelection');

// GET default selections
router.get('/', async (req, res) => {
  try {
    const defaultSelections = await DefaultSelection.find({ isActive: true })
      .populate({
        path: 'selectedTasks.task',
        populate: {
          path: 'category',
          select: 'name color'
        }
      })
      .populate({
        path: 'selectedActivities.activity',
        populate: {
          path: 'category',
          select: 'name color'
        }
      });
    
    // Transform the data to match the expected frontend format
    const response = {
      tasks: [],
      activities: []
    };
    
    defaultSelections.forEach(selection => {
      if (selection.type === 'tasks' && selection.selectedTasks) {
        response.tasks = selection.selectedTasks;
      } else if (selection.type === 'activities' && selection.selectedActivities) {
        response.activities = selection.selectedActivities;
      }
    });
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST save default selections
router.post('/', async (req, res) => {
  try {
    const { selectedTasks, selectedActivities } = req.body;
    
    // Save tasks default selection if provided
    if (selectedTasks && selectedTasks.length > 0) {
      // Remove any existing active tasks default selection
      await DefaultSelection.updateMany(
        { type: 'tasks', isActive: true },
        { $set: { isActive: false } }
      );
      
      // Create new tasks default selection
      const tasksDefault = new DefaultSelection({
        type: 'tasks',
        selectedTasks: selectedTasks,
        isActive: true
      });
      await tasksDefault.save();
    }
    
    // Save activities default selection if provided
    if (selectedActivities && selectedActivities.length > 0) {
      // Remove any existing active activities default selection
      await DefaultSelection.updateMany(
        { type: 'activities', isActive: true },
        { $set: { isActive: false } }
      );
      
      // Create new activities default selection
      const activitiesDefault = new DefaultSelection({
        type: 'activities',
        selectedActivities: selectedActivities,
        isActive: true
      });
      await activitiesDefault.save();
    }
    
    res.json({ message: 'Default selections saved successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE remove default selections
router.delete('/', async (req, res) => {
  try {
    await DefaultSelection.updateMany(
      { isActive: true },
      { $set: { isActive: false } }
    );
    res.json({ message: 'Default selections cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
