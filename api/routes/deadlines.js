const express = require('express');
const router = express.Router();
const DeadlineItem = require('../models/DeadlineItem');

// GET all manual deadline items
router.get('/', async (req, res) => {
  try {
    const items = await DeadlineItem.find().sort({ commitmentDate: 1, createdAt: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create manual deadline item
router.post('/', async (req, res) => {
  try {
    const item = new DeadlineItem(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update manual deadline item
router.put('/:id', async (req, res) => {
  try {
    const item = await DeadlineItem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ error: 'Deadline item not found' });
    }

    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE manual deadline item
router.delete('/:id', async (req, res) => {
  try {
    const item = await DeadlineItem.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Deadline item not found' });
    }
    res.json({ message: 'Deadline item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
