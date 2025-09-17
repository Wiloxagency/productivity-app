const express = require('express');
const router = express.Router();
const DailyPlanning = require('../models/DailyPlanning');
const Task = require('../models/Task');
const TimeEntry = require('../models/TimeEntry');

// GET planning for specific date
router.get('/:date', async (req, res) => {
  try {
    const date = new Date(req.params.date);
    let planning = await DailyPlanning.findOne({ date })
      .populate({
        path: 'plannedTasks.task',
        populate: {
          path: 'category',
          select: 'name color'
        }
      })
      .populate({
        path: 'plannedActivities.activity',
        populate: {
          path: 'category',
          select: 'name color'
        }
      });
    
    if (!planning) {
      // Create empty planning for the date
      const newPlanning = new DailyPlanning({
        date,
        plannedTasks: [],
        plannedActivities: [],
        goals: []
      });
      await newPlanning.save();
      return res.json(newPlanning);
    }
    
    // Calculate both Productivity and Personal Growth Scores using time tracker data
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
    
    // Calculate daily summary data using same logic as daily-summary endpoint
    const dailySummary = {
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
      dailySummary.byQuadrant[q] = {
        time: quadrantEntries.reduce((sum, entry) => sum + entry.duration, 0),
        count: quadrantEntries.length
      };
    });
    
    // Group by category (same logic as daily-summary endpoint)
    timeEntries.forEach(entry => {
      let categoryName;
      
      // Break time entries count as Work category
      if (entry.isBreak) {
        categoryName = 'Work';
      } else {
        categoryName = entry.activity?.category?.name || entry.task?.category?.name || 'Unknown';
      }
      
      if (!dailySummary.byCategory[categoryName]) {
        dailySummary.byCategory[categoryName] = { time: 0, count: 0 };
      }
      dailySummary.byCategory[categoryName].time += entry.duration;
      dailySummary.byCategory[categoryName].count += 1;
    });
    
    // Calculate Productivity Score using same logic as Work Tasks Time display
    const workItems = [
      ...(planning.plannedTasks || []).filter(pt => 
        pt.task && pt.task.category && pt.task.category.name === 'Work'
      ),
      ...(planning.plannedActivities || []).filter(pa => 
        pa.activity && pa.activity.category && pa.activity.category.name === 'Work'
      )
    ];
    
    const plannedWorkTime = workItems.reduce((sum, item) => {
      const isTask = 'task' in item;
      return sum + (item.plannedDuration || (isTask ? item.task.estimatedTime : item.activity.estimatedDuration) || 0);
    }, 0);
    
    // Use daily summary Work category time (same as frontend display)
    // This includes Work category entries + break time entries
    const actualWorkTime = dailySummary.byCategory['Work']?.time || 0;
    
    // Update productivity score - purely time-based using same data as display
    planning.productivity.score = plannedWorkTime > 0 ? 
      Math.round(Math.min((actualWorkTime / plannedWorkTime) * 100, 100)) : 0;
    
    // Calculate Personal Growth Score (Personal Development + Health & Fitness categories)
    const personalGrowthCategories = ['Personal Development', 'Health & Fitness'];
    
    // Planned personal growth items and time
    const plannedPersonalGrowthItems = [
      ...(planning.plannedTasks || []).filter(pt => 
        pt.task && pt.task.category && personalGrowthCategories.includes(pt.task.category.name)
      ),
      ...(planning.plannedActivities || []).filter(pa => 
        pa.activity && pa.activity.category && personalGrowthCategories.includes(pa.activity.category.name)
      )
    ];
    
    const plannedPersonalGrowthTime = plannedPersonalGrowthItems.reduce((sum, item) => {
      const isTask = 'task' in item;
      return sum + (item.plannedDuration || (isTask ? item.task.estimatedTime : item.activity.estimatedDuration) || 0);
    }, 0);
    
    const completedPersonalGrowthItems = plannedPersonalGrowthItems.filter(item => item.completed).length;
    
    // Actual personal growth time from time tracker (including break time in personal development/health)
    const actualPersonalGrowthTime = timeEntries
      .filter(entry => {
        // Include break time if it's under personal development activities, or direct category matches
        if (entry.isBreak && entry.activity?.category?.name && personalGrowthCategories.includes(entry.activity.category.name)) {
          return true;
        }
        const categoryName = entry.activity?.category?.name || entry.task?.category?.name;
        return personalGrowthCategories.includes(categoryName);
      })
      .reduce((sum, entry) => sum + entry.duration, 0);
    
    // Update personal growth scores
    planning.personalGrowth = {
      planned: {
        totalItems: plannedPersonalGrowthItems.length,
        totalTime: plannedPersonalGrowthTime
      },
      actual: {
        completedItems: completedPersonalGrowthItems,
        totalTime: actualPersonalGrowthTime
      },
      score: plannedPersonalGrowthTime > 0 ? 
        Math.round(Math.min((actualPersonalGrowthTime / plannedPersonalGrowthTime) * 100, 100)) : 0
    };
    
    // Save the updated scores
    await planning.save();
    
    res.json(planning);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create or update daily planning
router.post('/:date', async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const { plannedTasks, plannedActivities, goals, notes, dayType } = req.body;
    
    let planning = await DailyPlanning.findOne({ date });
    
    if (!planning) {
      planning = new DailyPlanning({ date });
    }
    
    // Update fields
    if (plannedTasks) planning.plannedTasks = plannedTasks;
    if (plannedActivities) planning.plannedActivities = plannedActivities;
    if (goals) planning.goals = goals;
    if (notes !== undefined) planning.notes = notes;
    if (dayType) planning.dayType = dayType;
    
    // Calculate planned totals
    const totalTasks = planning.plannedTasks.length + (planning.plannedActivities ? planning.plannedActivities.length : 0);
    const totalTaskTime = planning.plannedTasks.reduce(
      (sum, pt) => sum + (pt.plannedDuration || 0), 0
    );
    const totalActivityTime = planning.plannedActivities ? planning.plannedActivities.reduce(
      (sum, pa) => sum + (pa.plannedDuration || 0), 0
    ) : 0;
    
    planning.productivity.planned.totalTasks = totalTasks;
    planning.productivity.planned.totalTime = totalTaskTime + totalActivityTime;
    
    await planning.save();
    await planning.populate({
      path: 'plannedTasks.task',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    await planning.populate({
      path: 'plannedActivities.activity',
      populate: {
        path: 'category',
        select: 'name color'
      }
    });
    
    // Update only plannedDate, do NOT change status (keep backlog status intact)
    if (plannedTasks) {
      await Task.updateMany(
        { _id: { $in: plannedTasks.map(pt => pt.task) } },
        { plannedDate: date }
      );
    }
    
    res.json(planning);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update task completion in planning
router.put('/:date/task/:taskId/complete', async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const { completed, actualDuration } = req.body;
    
    const planning = await DailyPlanning.findOne({ date });
    if (!planning) {
      return res.status(404).json({ error: 'Planning not found for this date' });
    }
    
    const plannedTask = planning.plannedTasks.find(
      pt => pt.task.toString() === req.params.taskId
    );
    
    if (!plannedTask) {
      return res.status(404).json({ error: 'Task not found in daily planning' });
    }
    
    plannedTask.completed = completed;
    if (actualDuration !== undefined) {
      plannedTask.actualDuration = actualDuration;
    }
    
    // Recalculate actual stats
    const completedTasks = planning.plannedTasks.filter(pt => pt.completed).length;
    const completedActivities = planning.plannedActivities ? planning.plannedActivities.filter(pa => pa.completed).length : 0;
    const actualTaskTime = planning.plannedTasks.reduce(
      (sum, pt) => sum + (pt.actualDuration || 0), 0
    );
    const actualActivityTime = planning.plannedActivities ? planning.plannedActivities.reduce(
      (sum, pa) => sum + (pa.actualDuration || 0), 0
    ) : 0;
    
    planning.productivity.actual.completedTasks = completedTasks + completedActivities;
    planning.productivity.actual.totalTime = actualTaskTime + actualActivityTime;
    
    await planning.save();
    
    // DO NOT automatically update task status - this should only be done from Task Manager
    // The scheduled item completion is separate from the task's overall status
    
    res.json(planning);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update activity completion in planning
router.put('/:date/activity/:activityId/complete', async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const { completed, actualDuration } = req.body;
    
    const planning = await DailyPlanning.findOne({ date });
    if (!planning) {
      return res.status(404).json({ error: 'Planning not found for this date' });
    }
    
    const plannedActivity = planning.plannedActivities.find(
      pa => pa.activity.toString() === req.params.activityId
    );
    
    if (!plannedActivity) {
      return res.status(404).json({ error: 'Activity not found in daily planning' });
    }
    
    plannedActivity.completed = completed;
    if (actualDuration !== undefined) {
      plannedActivity.actualDuration = actualDuration;
    }
    
    // Recalculate actual stats
    const completedTasks = planning.plannedTasks.filter(pt => pt.completed).length;
    const completedActivities = planning.plannedActivities ? planning.plannedActivities.filter(pa => pa.completed).length : 0;
    const actualTaskTime = planning.plannedTasks.reduce(
      (sum, pt) => sum + (pt.actualDuration || 0), 0
    );
    const actualActivityTime = planning.plannedActivities ? planning.plannedActivities.reduce(
      (sum, pa) => sum + (pa.actualDuration || 0), 0
    ) : 0;
    
    planning.productivity.actual.completedTasks = completedTasks + completedActivities;
    planning.productivity.actual.totalTime = actualTaskTime + actualActivityTime;
    
    await planning.save();
    
    res.json(planning);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET productivity reports
router.get('/reports/:startDate/:endDate', async (req, res) => {
  try {
    const startDate = new Date(req.params.startDate);
    const endDate = new Date(req.params.endDate);
    endDate.setDate(endDate.getDate() + 1);
    
    const plannings = await DailyPlanning.find({
      date: { $gte: startDate, $lt: endDate }
    }).sort({ date: 1 });
    
    const report = {
      period: { start: startDate, end: new Date(req.params.endDate) },
      totalDays: plannings.length,
      averageProductivity: 0,
      totalPlannedTasks: 0,
      totalCompletedTasks: 0,
      totalPlannedTime: 0,
      totalActualTime: 0,
      dailyStats: plannings.map(p => ({
        date: p.date,
        productivity: p.productivity,
        dayType: p.dayType
      }))
    };
    
    if (plannings.length > 0) {
      report.averageProductivity = plannings.reduce((sum, p) => sum + p.productivity.score, 0) / plannings.length;
      report.totalPlannedTasks = plannings.reduce((sum, p) => sum + p.productivity.planned.totalTasks, 0);
      report.totalCompletedTasks = plannings.reduce((sum, p) => sum + p.productivity.actual.completedTasks, 0);
      report.totalPlannedTime = plannings.reduce((sum, p) => sum + p.productivity.planned.totalTime, 0);
      report.totalActualTime = plannings.reduce((sum, p) => sum + p.productivity.actual.totalTime, 0);
    }
    
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
