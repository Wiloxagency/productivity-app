const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');

// GET all activities
router.get('/', async (req, res) => {
  try {
    const { category, quadrant } = req.query;
    let filter = {};
    
    if (category) filter.category = category;
    if (quadrant) filter.quadrant = parseInt(quadrant);
    
    const activities = await Activity.find(filter)
      .populate('category', 'name color')
      .populate('project', 'name color status')
      .sort({ name: 1 });
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single activity
router.get('/:id', async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id)
      .populate('category', 'name color')
      .populate('project', 'name color status');
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new activity
router.post('/', async (req, res) => {
  try {
    const activity = new Activity(req.body);
    await activity.save();
    await activity.populate('category', 'name color');
    await activity.populate('project', 'name color status');
    res.status(201).json(activity);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update activity
router.put('/:id', async (req, res) => {
  try {
    const activity = await Activity.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('category', 'name color')
     .populate('project', 'name color status');
    
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    res.json(activity);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE activity
router.delete('/:id', async (req, res) => {
  try {
    const activity = await Activity.findByIdAndDelete(req.params.id);
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET activities by quadrant for dashboard
router.get('/quadrant/:quadrant', async (req, res) => {
  try {
    const quadrant = parseInt(req.params.quadrant);
    const activities = await Activity.find({ quadrant })
      .populate('category', 'name color')
      .populate('project', 'name color status')
      .sort({ name: 1 });
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
