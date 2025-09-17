const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const Activity = require('../models/Activity');
const Task = require('../models/Task');

// Get all projects
router.get('/', async (req, res) => {
  try {
    const { status, includeArchived } = req.query;
    
    let filter = {};
    if (status) {
      filter.status = status;
    }
    if (!includeArchived) {
      filter.isArchived = false;
    }

    const projects = await Project.find(filter).sort({ priority: 1, createdAt: -1 });
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get project by ID with related activities and tasks
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get related activities and tasks
    const activities = await Activity.find({ project: project._id }).populate('category');
    const tasks = await Task.find({ project: project._id }).populate('category');

    res.json({
      project,
      activities,
      tasks
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create new project
router.post('/', async (req, res) => {
  try {
    const project = new Project(req.body);
    await project.save();
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    if (error.code === 11000) {
      res.status(400).json({ error: 'Project name must be unique' });
    } else {
      res.status(400).json({ error: 'Failed to create project' });
    }
  }
});

// Update project
router.put('/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    if (error.code === 11000) {
      res.status(400).json({ error: 'Project name must be unique' });
    } else {
      res.status(400).json({ error: 'Failed to update project' });
    }
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if project has associated activities or tasks
    const activitiesCount = await Activity.countDocuments({ project: project._id });
    const tasksCount = await Task.countDocuments({ project: project._id });

    if (activitiesCount > 0 || tasksCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete project with associated activities or tasks. Please reassign or delete them first.',
        details: {
          activitiesCount,
          tasksCount
        }
      });
    }

    await Project.findByIdAndDelete(req.params.id);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Archive/unarchive project
router.patch('/:id/archive', async (req, res) => {
  try {
    const { archived } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { isArchived: archived },
      { new: true }
    );
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Error archiving project:', error);
    res.status(500).json({ error: 'Failed to archive project' });
  }
});

// Get project statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const activities = await Activity.find({ project: project._id });
    const tasks = await Task.find({ project: project._id });

    const stats = {
      activitiesCount: activities.length,
      tasksCount: tasks.length,
      completedTasks: tasks.filter(task => task.status === 'completed').length,
      totalEstimatedTime: tasks.reduce((sum, task) => sum + task.estimatedTime, 0),
      totalActualTime: tasks.reduce((sum, task) => sum + task.actualTime, 0),
      tasksByQuadrant: {
        1: tasks.filter(task => task.quadrant === 1).length,
        2: tasks.filter(task => task.quadrant === 2).length,
        3: tasks.filter(task => task.quadrant === 3).length,
        4: tasks.filter(task => task.quadrant === 4).length,
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching project stats:', error);
    res.status(500).json({ error: 'Failed to fetch project statistics' });
  }
});

module.exports = router;
