import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Paper,
  Stack,
  Alert,
  Chip,
  LinearProgress,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CompleteIcon,
  Schedule as ScheduleIcon,
  Today as TodayIcon,
  Assignment as TaskIcon,
  Timeline as TimelineIcon,
  PlayCircle as ActivityIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { planningApi, tasksApi, activitiesApi, timeEntriesApi } from '../services/api';
import { QuadrantColors, QuadrantLabels } from '../types';
import TaskScheduler from '../components/TaskScheduler';
import TimeBlocker from '../components/TimeBlocker';
import GoalsManager from '../components/GoalsManager';

export default function DailyPlanning() {
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [timeBlockerOpen, setTimeBlockerOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(dayjs());

  const queryClient = useQueryClient();

  const { data: planning, isLoading } = useQuery({
    queryKey: ['dailyPlanning', selectedDate.format('YYYY-MM-DD')],
    queryFn: () => planningApi.getPlanning(selectedDate.format('YYYY-MM-DD')),
  });

  const { data: backlogTasks = [] } = useQuery({
    queryKey: ['backlogTasks'],
    queryFn: () => tasksApi.getBacklog(),
  });

  const { data: allActivities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => activitiesApi.getAll(),
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['timeEntries', selectedDate.format('YYYY-MM-DD')],
    queryFn: () => timeEntriesApi.getAll({ date: selectedDate.format('YYYY-MM-DD') }),
  });

  const { data: dailySummary } = useQuery({
    queryKey: ['dailySummary', selectedDate.format('YYYY-MM-DD')],
    queryFn: () => timeEntriesApi.getDailySummary(selectedDate.format('YYYY-MM-DD')),
  });

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry'],
    queryFn: timeEntriesApi.getActive,
    refetchInterval: 5000,
  });

  // Update current time for real-time duration calculation
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs());
    }, 30000); // Update every 30 seconds

    return () => clearInterval(timer);
  }, []);

  const completeTaskMutation = useMutation({
    mutationFn: ({ taskId, completed, actualDuration }: { 
      taskId: string; 
      completed: boolean; 
      actualDuration?: number 
    }) =>
      planningApi.completeTask(selectedDate.format('YYYY-MM-DD'), taskId, { 
        completed, 
        actualDuration 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyPlanning'] });
      queryClient.invalidateQueries({ queryKey: ['backlogTasks'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });

  const completeActivityMutation = useMutation({
    mutationFn: ({ activityId, completed, actualDuration }: { 
      activityId: string; 
      completed: boolean; 
      actualDuration?: number 
    }) =>
      planningApi.completeActivity(selectedDate.format('YYYY-MM-DD'), activityId, { 
        completed, 
        actualDuration 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyPlanning'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatTimeSlot = (date: Date): string => {
    return dayjs(date).format('HH:mm');
  };

  const getProductivityColor = (score: number): string => {
    if (score >= 80) return 'success.main';
    if (score >= 60) return 'warning.main';
    return 'error.main';
  };

  const availableTasks = backlogTasks.filter(task => 
    !planning?.plannedTasks.some(pt => pt.task._id === task._id)
  );

  const availableActivities = allActivities.filter(activity => 
    !planning?.plannedActivities?.some(pa => pa.activity._id === activity._id)
  );

  // Work vs Other breakdown for planned and completed items (tasks + activities)
  const workPlannedItems = planning ? [
    ...(planning.plannedTasks || []).filter(pt => pt.task.category.name === 'Work'),
    ...(planning.plannedActivities || []).filter(pa => pa.activity.category.name === 'Work'),
  ] : [];
  const otherPlannedItems = planning ? [
    ...(planning.plannedTasks || []).filter(pt => pt.task.category.name !== 'Work'),
    ...(planning.plannedActivities || []).filter(pa => pa.activity.category.name !== 'Work'),
  ] : [];

  const workPlannedCount = workPlannedItems.length;
  const otherPlannedCount = otherPlannedItems.length;
  
  const workCompletedCount = workPlannedItems.filter(item => item.completed).length;
  const otherCompletedCount = otherPlannedItems.filter(item => item.completed).length;
  
  const workPlannedTime = workPlannedItems.reduce((sum, item) => {
    const isTask = 'task' in item;
    return sum + (item.plannedDuration || (isTask ? item.task.estimatedTime : item.activity.estimatedDuration) || 0);
  }, 0);
  const otherPlannedTime = otherPlannedItems.reduce((sum, item) => {
    const isTask = 'task' in item;
    return sum + (item.plannedDuration || (isTask ? item.task.estimatedTime : item.activity.estimatedDuration) || 0);
  }, 0);
  
  // Helper function to calculate current duration for active entries
  const calculateActiveEntryDuration = (): number => {
    if (activeEntry && activeEntry.isActive && activeEntry.startTime &&
        dayjs(activeEntry.startTime).format('YYYY-MM-DD') === selectedDate.format('YYYY-MM-DD')) {
      const startTime = dayjs(activeEntry.startTime);
      const elapsed = currentTime.diff(startTime, 'minute');
      return Math.max(0, elapsed);
    }
    return 0;
  };

  // Calculate actual time using dailySummary API (more reliable than parsing individual entries)
  // This API provides category breakdown that matches Time Tracker calculations
  const workActualTime = (() => {
    if (!dailySummary) return 0;
    
    // Get Work category time + any active entry if it's work/break
    let workTime = dailySummary.byCategory['Work']?.time || 0;
    
    // Add active entry time if it's work category or break
    if (activeEntry && dayjs(activeEntry.startTime).format('YYYY-MM-DD') === selectedDate.format('YYYY-MM-DD')) {
      const isWorkCategory = activeEntry.activity?.category?.name === 'Work' || activeEntry.task?.category?.name === 'Work';
      const isBreakTime = activeEntry.isBreak;
      if (isWorkCategory || isBreakTime) {
        workTime += calculateActiveEntryDuration();
      }
    }
    
    return workTime;
  })();
    
  const otherActualTime = (() => {
    if (!dailySummary) return 0;
    
    // Sum all non-Work categories
    let otherTime = Object.entries(dailySummary.byCategory)
      .filter(([categoryName]) => categoryName !== 'Work')
      .reduce((sum, [_, categoryData]) => sum + categoryData.time, 0);
    
    // Add active entry time if it's non-work and not break
    if (activeEntry && dayjs(activeEntry.startTime).format('YYYY-MM-DD') === selectedDate.format('YYYY-MM-DD')) {
      const isWorkCategory = activeEntry.activity?.category?.name === 'Work' || activeEntry.task?.category?.name === 'Work';
      const isBreakTime = activeEntry.isBreak;
      if (!isWorkCategory && !isBreakTime) {
        otherTime += calculateActiveEntryDuration();
      }
    }
    
    return otherTime;
  })();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <Typography>Loading daily planning...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Daily Planning</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <DatePicker
            label="Planning Date"
            value={selectedDate}
            onChange={(date) => setSelectedDate(date || dayjs())}
            format="MM/DD/YYYY"
          />
          <Button
            variant="contained"
            startIcon={<TodayIcon />}
            onClick={() => setSelectedDate(dayjs())}
            size="small"
          >
            Today
          </Button>
        </Box>
      </Box>

      {/* Quick Actions */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<AddIcon />}
            onClick={() => setSchedulerOpen(true)}
            sx={{ py: 1.5 }}
          >
            Schedule Items
          </Button>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<TimelineIcon />}
            onClick={() => setTimeBlockerOpen(true)}
            sx={{ py: 1.5 }}
          >
            Create Time Blocks
          </Button>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<TaskIcon />}
            onClick={() => setGoalsOpen(true)}
            sx={{ py: 1.5 }}
          >
            Set Daily Goals
          </Button>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Left Column: Overview & Stats */}
        <Grid item xs={12} md={4}>
          <Stack spacing={3}>
            {/* Daily Overview */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  📊 Daily Overview
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {selectedDate.format('dddd, MMMM D, YYYY')}
                </Typography>
                
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Productivity Score</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {(() => {
                        const score = workPlannedTime > 0 ? Math.min(100, Math.round((workActualTime / workPlannedTime) * 100)) : 0;
                        return score;
                      })()}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={workPlannedTime > 0 ? Math.min(100, Math.round((workActualTime / workPlannedTime) * 100)) : 0}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: getProductivityColor(workPlannedTime > 0 ? Math.min(100, Math.round((workActualTime / workPlannedTime) * 100)) : 0),
                      },
                    }}
                  />
                </Box>

                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Personal Growth Score</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {planning?.personalGrowth?.score || 0}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={planning?.personalGrowth?.score || 0}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: getProductivityColor(planning?.personalGrowth?.score || 0),
                      },
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {formatTime(planning?.personalGrowth?.actual.totalTime || 0)} / {formatTime(planning?.personalGrowth?.planned.totalTime || 0)} Personal Development + Health
                  </Typography>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Work Tasks
                    </Typography>
                    <Typography variant="h6">
                      {workCompletedCount} / {workPlannedCount}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Time
                    </Typography>
                    <Typography variant="h6">
                      {formatTime(workActualTime)} / {formatTime(workPlannedTime)}
                    </Typography>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Other Tasks
                    </Typography>
                    <Typography variant="h6">
                      {otherCompletedCount} / {otherPlannedCount}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Time
                    </Typography>
                    <Typography variant="h6">
                      {formatTime(otherActualTime)} / {formatTime(otherPlannedTime)}
                    </Typography>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                {/* Remaining Time and Final Hour Calculations */}
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Work Remaining
                    </Typography>
                    <Typography variant="h6" color={workPlannedTime - workActualTime > 0 ? "warning.main" : "success.main"}>
                      {(() => {
                        const remaining = Math.max(0, workPlannedTime - workActualTime);
                        return formatTime(remaining);
                      })()}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Other Remaining
                    </Typography>
                    <Typography variant="h6" color={otherPlannedTime - otherActualTime > 0 ? "info.main" : "success.main"}>
                      {(() => {
                        const remaining = Math.max(0, otherPlannedTime - otherActualTime);
                        return formatTime(remaining);
                      })()}
                    </Typography>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary" textAlign="center">
                      📅 Final Hour Estimated
                    </Typography>
                    <Typography variant="h6" textAlign="center" color="primary.main">
                      {(() => {
                        // Calculate remaining time for each category separately, ensuring no negative values
                        const workRemainingMinutes = Math.max(0, workPlannedTime - workActualTime);
                        const otherRemainingMinutes = Math.max(0, otherPlannedTime - otherActualTime);
                        const totalRemainingMinutes = workRemainingMinutes + otherRemainingMinutes;
                        
                        if (totalRemainingMinutes === 0) {
                          return "All tasks completed! 🎉";
                        }
                        
                        const now = currentTime;
                        const estimatedFinishTime = now.add(totalRemainingMinutes, 'minute');
                        return estimatedFinishTime.format('HH:mm');
                      })()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" textAlign="center" display="block">
                      {(() => {
                        // Calculate remaining time for each category separately, ensuring no negative values
                        const workRemainingMinutes = Math.max(0, workPlannedTime - workActualTime);
                        const otherRemainingMinutes = Math.max(0, otherPlannedTime - otherActualTime);
                        const totalRemainingMinutes = workRemainingMinutes + otherRemainingMinutes;
                        
                        if (totalRemainingMinutes === 0) return "";
                        
                        return `${formatTime(totalRemainingMinutes)} remaining from now`;
                      })()}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Daily Goals */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  🎯 Daily Goals
                </Typography>
                {planning?.goals && planning.goals.length > 0 ? (
                  planning.goals.map((goal, index) => (
                    <Typography key={index} variant="body2" sx={{ mb: 1 }}>
                      • {goal}
                    </Typography>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No goals set for this day
                  </Typography>
                )}
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setGoalsOpen(true)}
                  sx={{ mt: 1 }}
                >
                  {planning?.goals?.length ? 'Edit Goals' : 'Add Goals'}
                </Button>
              </CardContent>
            </Card>

            {/* Available Tasks */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  📋 Available Tasks ({availableTasks.length})
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Tasks from backlog ready to schedule
                </Typography>
                
                {availableTasks.length === 0 ? (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    All backlog tasks are scheduled or completed!
                  </Alert>
                ) : (
                  <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                    {availableTasks.slice(0, 5).map((task) => (
                      <Box key={task._id} sx={{ mb: 1, p: 1, backgroundColor: 'grey.50', borderRadius: 1 }}>
                        <Typography variant="body2" fontWeight="medium">
                          {task.title}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                          <Chip
                            label={`Q${task.quadrant}`}
                            size="small"
                            sx={{
                              backgroundColor: QuadrantColors[task.quadrant],
                              color: 'white',
                              fontSize: '0.7rem',
                              height: '18px',
                            }}
                          />
                          <Chip
                            label={task.category.name}
                            size="small"
                            variant="outlined"
                            sx={{
                              borderColor: task.category.color,
                              color: task.category.color,
                              fontSize: '0.7rem',
                              height: '18px',
                            }}
                          />
                        </Box>
                      </Box>
                    ))}
                    {availableTasks.length > 5 && (
                      <Typography variant="caption" color="text.secondary">
                        +{availableTasks.length - 5} more tasks...
                      </Typography>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        {/* Right Column: Scheduled Tasks */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  📅 Scheduled Items ({(planning?.plannedTasks?.length || 0) + (planning?.plannedActivities?.length || 0)})
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    startIcon={<ScheduleIcon />}
                    onClick={() => setSchedulerOpen(true)}
                  >
                    Add Items
                  </Button>
                </Box>
              </Box>

              {(planning?.plannedTasks && planning.plannedTasks.length > 0) || (planning?.plannedActivities && planning.plannedActivities.length > 0) ? (
                <Box>
                  {/* Combine and sort all planned items */}
                  {[
                    ...(planning.plannedTasks?.map(pt => ({ type: 'task' as const, item: pt })) || []),
                    ...(planning.plannedActivities?.map(pa => ({ type: 'activity' as const, item: pa })) || [])
                  ]
                    .sort((a, b) => {
                      const aTime = a.item.plannedStartTime;
                      const bTime = b.item.plannedStartTime;
                      const aPriority = a.item.priority;
                      const bPriority = b.item.priority;
                      
                      if (!aTime && !bTime) return aPriority - bPriority;
                      if (!aTime) return 1;
                      if (!bTime) return -1;
                      return new Date(aTime).getTime() - new Date(bTime).getTime();
                    })
                    .map((plannedItem, index) => {
                      const isTask = plannedItem.type === 'task';
                      const item = plannedItem.item;
                      const content = isTask ? (item as any).task : (item as any).activity;
                      const title = isTask ? content.title : content.name;
                      const estimatedTime = isTask ? content.estimatedTime : content.estimatedDuration;
                      
                      return (
                        <Card
                          key={`${plannedItem.type}-${content._id}`}
                          variant="outlined"
                          sx={{
                            mb: 2,
                            backgroundColor: item.completed ? 'success.light' : 'background.paper',
                            opacity: item.completed ? 0.8 : 1,
                          }}
                        >
                          <CardContent sx={{ py: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <Box sx={{ flex: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                  {isTask ? <TaskIcon fontSize="small" /> : <ActivityIcon fontSize="small" />}
                                  <Typography 
                                    variant="h6" 
                                    sx={{ 
                                      fontSize: '1rem',
                                      textDecoration: item.completed ? 'line-through' : 'none'
                                    }}
                                  >
                                    {title}
                                  </Typography>
                                  {item.completed && (
                                    <Chip label="✅ Done" size="small" color="success" />
                                  )}
                                </Box>

                                <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
                                  <Chip
                                    label={`#${item.priority}`}
                                    size="small"
                                    sx={{
                                      backgroundColor: 'primary.main',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      height: '20px',
                                    }}
                                  />
                                  <Chip
                                    label={`Q${content.quadrant}`}
                                    size="small"
                                    sx={{
                                      backgroundColor: QuadrantColors[content.quadrant],
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      height: '20px',
                                    }}
                                  />
                                  <Chip
                                    label={content.category.name}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                      borderColor: content.category.color,
                                      color: content.category.color,
                                      fontSize: '0.7rem',
                                      height: '20px',
                                    }}
                                  />
                                  <Chip
                                    label={isTask ? 'Task' : 'Activity'}
                                    size="small"
                                    sx={{
                                      backgroundColor: isTask ? '#1976d2' : '#9c27b0',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      height: '20px',
                                    }}
                                  />
                                </Box>

                                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                  {item.plannedStartTime && (
                                    <Typography variant="body2" color="text.secondary">
                                      🕐 {formatTimeSlot(new Date(item.plannedStartTime))}
                                    </Typography>
                                  )}
                                  <Typography variant="body2" color="text.secondary">
                                    ⏱️ {formatTime(item.plannedDuration || estimatedTime)}
                                  </Typography>
                                  {item.actualDuration && (
                                    <Typography variant="body2" color="primary">
                                      ✓ {formatTime(item.actualDuration)} actual
                                    </Typography>
                                  )}
                                </Box>
                              </Box>

                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Tooltip title={item.completed ? "Mark as incomplete" : "Mark as complete"}>
                                  <IconButton
                                    size="small"
                                    color={item.completed ? "success" : "default"}
                                    onClick={() => {
                                      if (isTask) {
                                        completeTaskMutation.mutate({
                                          taskId: content._id,
                                          completed: !item.completed,
                                          actualDuration: item.actualDuration,
                                        });
                                      } else {
                                        completeActivityMutation.mutate({
                                          activityId: content._id,
                                          completed: !item.completed,
                                          actualDuration: item.actualDuration,
                                        });
                                      }
                                    }}
                                    disabled={completeTaskMutation.isPending || completeActivityMutation.isPending}
                                  >
                                    <CompleteIcon />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      );
                    })}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No items scheduled
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Start planning your day by scheduling tasks and activities
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setSchedulerOpen(true)}
                    sx={{ mt: 2 }}
                  >
                    Schedule First Item
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Planning Notes */}
      {planning?.notes && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              📝 Planning Notes
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {planning.notes}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Task Scheduler Dialog */}
      <TaskScheduler
        open={schedulerOpen}
        onClose={() => setSchedulerOpen(false)}
        date={selectedDate.format('YYYY-MM-DD')}
        availableTasks={availableTasks}
        availableActivities={availableActivities}
        existingPlanning={planning}
      />

      {/* Time Blocker Dialog */}
      <TimeBlocker
        open={timeBlockerOpen}
        onClose={() => setTimeBlockerOpen(false)}
        date={selectedDate.format('YYYY-MM-DD')}
        existingPlanning={planning}
      />

      {/* Goals Manager Dialog */}
      <GoalsManager
        open={goalsOpen}
        onClose={() => setGoalsOpen(false)}
        date={selectedDate.format('YYYY-MM-DD')}
        existingGoals={planning?.goals || []}
        existingNotes={planning?.notes || ''}
      />
    </Box>
  );
}
