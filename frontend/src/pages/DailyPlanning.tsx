import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  TextField,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CompleteIcon,
  Schedule as ScheduleIcon,
  Today as TodayIcon,
  Assignment as TaskIcon,
  Timeline as TimelineIcon,
  PlayCircle as ActivityIcon,
  SwapVert as ReorderIcon,
  ArrowUpward as MoveUpIcon,
  ArrowDownward as MoveDownIcon,
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
  const [editingPriorityItemKey, setEditingPriorityItemKey] = useState<string | null>(null);
  const [priorityInputValue, setPriorityInputValue] = useState('');

  const queryClient = useQueryClient();
  const autoCompletingItemsRef = useRef<Set<string>>(new Set());
  const getNameCategoryKey = (name?: string, categoryName?: string) =>
    `${(name || '').trim().toLowerCase()}::${(categoryName || '').trim().toLowerCase()}`;
  const getScheduledItemKey = (plannedItem: { type: 'task' | 'activity'; item: any }) => {
    const rawId = plannedItem.type === 'task'
      ? plannedItem.item.task?._id || plannedItem.item.task
      : plannedItem.item.activity?._id || plannedItem.item.activity;
    return `${plannedItem.type}-${rawId}`;
  };

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

  const scheduledItems = useMemo(
    () =>
      [
        ...(planning?.plannedTasks?.map((pt) => ({ type: 'task' as const, item: pt })) || []),
        ...(planning?.plannedActivities?.map((pa) => ({ type: 'activity' as const, item: pa })) || []),
      ].sort((a, b) => {
        const aPriority = a.item.priority;
        const bPriority = b.item.priority;
        if (aPriority !== bPriority) return aPriority - bPriority;

        const aTime = a.item.plannedStartTime;
        const bTime = b.item.plannedStartTime;
        if (!aTime && !bTime) return 0;
        if (!aTime) return 1;
        if (!bTime) return -1;
        return new Date(aTime).getTime() - new Date(bTime).getTime();
      }),
    [planning]
  );

  const moveScheduledPriorityMutation = useMutation({
    mutationFn: async (orderedItems: Array<{ type: 'task' | 'activity'; item: any }>) => {
      const reprioritizedItems = orderedItems.map((entry, index) => ({
        ...entry,
        priority: index + 1,
      }));

      const updatedPlannedTasks = reprioritizedItems
        .filter((entry) => entry.type === 'task')
        .map((entry) => ({
          task: entry.item.task?._id || entry.item.task,
          plannedStartTime: entry.item.plannedStartTime,
          plannedDuration: entry.item.plannedDuration,
          actualDuration: entry.item.actualDuration,
          completed: entry.item.completed,
          priority: entry.priority,
        }));

      const updatedPlannedActivities = reprioritizedItems
        .filter((entry) => entry.type === 'activity')
        .map((entry) => ({
          activity: entry.item.activity?._id || entry.item.activity,
          plannedStartTime: entry.item.plannedStartTime,
          plannedDuration: entry.item.plannedDuration,
          actualDuration: entry.item.actualDuration,
          completed: entry.item.completed,
          priority: entry.priority,
        }));

      return planningApi.updatePlanning(selectedDate.format('YYYY-MM-DD'), {
        plannedTasks: updatedPlannedTasks as any,
        plannedActivities: updatedPlannedActivities as any,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyPlanning'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });

  const handleMoveScheduledItem = (currentIndex: number, direction: 'up' | 'down') => {
    if (moveScheduledPriorityMutation.isPending) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= scheduledItems.length) return;

    const reordered = [...scheduledItems];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    moveScheduledPriorityMutation.mutate(reordered);
  };

  const startPriorityEdit = (itemKey: string, currentPriority: number) => {
    if (moveScheduledPriorityMutation.isPending || reorderPlanningMutation.isPending) return;
    setEditingPriorityItemKey(itemKey);
    setPriorityInputValue(String(currentPriority));
  };

  const cancelPriorityEdit = () => {
    setEditingPriorityItemKey(null);
    setPriorityInputValue('');
  };

  const submitPriorityEdit = (itemKey: string) => {
    if (editingPriorityItemKey !== itemKey) return;

    const parsedPriority = Number.parseInt(priorityInputValue, 10);
    const currentIndex = scheduledItems.findIndex((entry) => getScheduledItemKey(entry) === itemKey);

    if (!Number.isFinite(parsedPriority) || currentIndex === -1) {
      cancelPriorityEdit();
      return;
    }

    const targetIndex = Math.min(Math.max(parsedPriority, 1), scheduledItems.length) - 1;
    if (targetIndex === currentIndex) {
      cancelPriorityEdit();
      return;
    }

    const reordered = [...scheduledItems];
    const [selectedItem] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, selectedItem);

    cancelPriorityEdit();
    moveScheduledPriorityMutation.mutate(reordered);
  };

  const reorderPlanningMutation = useMutation({
    mutationFn: async () => {
      if (!planning) return null;

      const previousDate = selectedDate.subtract(1, 'day').format('YYYY-MM-DD');
      const previousDayEntries = await timeEntriesApi.getAll({ date: previousDate });

      const combinedItems = [
        ...(planning.plannedTasks || []).map((pt, index) => ({
          type: 'task' as const,
          item: pt,
          itemId: pt.task._id,
          categoryName: pt.task.category?.name || 'Uncategorized',
          originalIndex: index,
        })),
        ...(planning.plannedActivities || []).map((pa, index) => ({
          type: 'activity' as const,
          item: pa,
          itemId: pa.activity._id,
          categoryName: pa.activity.category?.name || 'Uncategorized',
          originalIndex: (planning.plannedTasks?.length || 0) + index,
        })),
      ];

      if (!combinedItems.length) return planning;

      const safePriority = (value: number | undefined, fallback: number) =>
        typeof value === 'number' ? value : fallback;
      const safeStartTime = (value?: string) =>
        value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;

      const sortedCurrent = [...combinedItems].sort((a, b) => {
        const priorityDiff =
          safePriority(a.item.priority, a.originalIndex + 1) -
          safePriority(b.item.priority, b.originalIndex + 1);
        if (priorityDiff !== 0) return priorityDiff;

        const timeDiff = safeStartTime(a.item.plannedStartTime) - safeStartTime(b.item.plannedStartTime);
        if (timeDiff !== 0) return timeDiff;

        return a.originalIndex - b.originalIndex;
      });
      const getTrackingKey = (entry: { type: 'task' | 'activity'; itemId: string }) =>
        `${entry.type}:${entry.itemId}`;

      const currentOrderIndexByKey: Record<string, number> = {};
      sortedCurrent.forEach((entry, index) => {
        currentOrderIndexByKey[getTrackingKey(entry)] = index;
      });

      const previousDayOrderByKey: Record<string, number> = {};
      let previousDayOrderCounter = 0;
      previousDayEntries
        .filter((entry) => entry.task?._id || entry.activity?._id)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .forEach((entry) => {
          const isTaskEntry = !!entry.task?._id;
          const entryType = isTaskEntry ? 'task' : 'activity';
          const entryId = isTaskEntry ? entry.task!._id : entry.activity!._id;
          const key = `${entryType}:${entryId}`;
          if (previousDayOrderByKey[key] === undefined) {
            previousDayOrderByKey[key] = previousDayOrderCounter;
            previousDayOrderCounter += 1;
          }
        });

      const backlogOrderByTaskId: Record<string, number> = {};
      backlogTasks.forEach((task, index) => {
        backlogOrderByTaskId[task._id] = index;
      });

      const reorderedCombined = [...sortedCurrent].sort((a, b) => {
        const aKey = getTrackingKey(a);
        const bKey = getTrackingKey(b);

        const aPreviousOrder = previousDayOrderByKey[aKey];
        const bPreviousOrder = previousDayOrderByKey[bKey];
        const aHasPreviousOrder = aPreviousOrder !== undefined;
        const bHasPreviousOrder = bPreviousOrder !== undefined;

        // Always prioritize and preserve the actual interleaved sequence from yesterday.
        if (aHasPreviousOrder && bHasPreviousOrder && aPreviousOrder !== bPreviousOrder) {
          return aPreviousOrder - bPreviousOrder;
        }
        if (aHasPreviousOrder !== bHasPreviousOrder) {
          return aHasPreviousOrder ? -1 : 1;
        }

        // For tasks not executed yesterday, use current Task Backlog order.
        if (!aHasPreviousOrder && !bHasPreviousOrder && a.type === 'task' && b.type === 'task') {
          const aBacklogOrder = backlogOrderByTaskId[a.itemId];
          const bBacklogOrder = backlogOrderByTaskId[b.itemId];
          const aHasBacklogOrder = aBacklogOrder !== undefined;
          const bHasBacklogOrder = bBacklogOrder !== undefined;

          if (aHasBacklogOrder && bHasBacklogOrder && aBacklogOrder !== bBacklogOrder) {
            return aBacklogOrder - bBacklogOrder;
          }
          if (aHasBacklogOrder !== bHasBacklogOrder) {
            return aHasBacklogOrder ? -1 : 1;
          }
        }

        // Stable fallback: keep current planning order.
        return (
          currentOrderIndexByKey[aKey] -
          currentOrderIndexByKey[bKey]
        );
      });

      const reprioritizedItems = reorderedCombined.map((entry, index) => ({
        ...entry,
        newPriority: index + 1,
      }));

      const updatedPlannedTasks = reprioritizedItems
        .filter((entry) => entry.type === 'task')
        .map((entry) => ({
          task: entry.item.task._id,
          plannedStartTime: entry.item.plannedStartTime,
          plannedDuration: entry.item.plannedDuration,
          actualDuration: entry.item.actualDuration,
          completed: entry.item.completed,
          priority: entry.newPriority,
        }));

      const updatedPlannedActivities = reprioritizedItems
        .filter((entry) => entry.type === 'activity')
        .map((entry) => ({
          activity: entry.item.activity._id,
          plannedStartTime: entry.item.plannedStartTime,
          plannedDuration: entry.item.plannedDuration,
          actualDuration: entry.item.actualDuration,
          completed: entry.item.completed,
          priority: entry.newPriority,
        }));

      return planningApi.updatePlanning(selectedDate.format('YYYY-MM-DD'), {
        plannedTasks: updatedPlannedTasks as any,
        plannedActivities: updatedPlannedActivities as any,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyPlanning'] });
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

  const trackedDurationByItem = useMemo(() => {
    const taskDurations: Record<string, number> = {};
    const activityDurations: Record<string, number> = {};
    const nameCategoryDurations: Record<string, number> = {};

    timeEntries.forEach((entry) => {
      const duration = entry.isActive && entry.startTime
        ? Math.max(0, currentTime.diff(dayjs(entry.startTime), 'minute'))
        : (entry.duration || 0);

      if (entry.task?._id) {
        taskDurations[entry.task._id] = (taskDurations[entry.task._id] || 0) + duration;
        const key = getNameCategoryKey(entry.task.title, entry.task.category?.name);
        nameCategoryDurations[key] = (nameCategoryDurations[key] || 0) + duration;
      }
      if (entry.activity?._id) {
        activityDurations[entry.activity._id] = (activityDurations[entry.activity._id] || 0) + duration;
        const key = getNameCategoryKey(entry.activity.name, entry.activity.category?.name);
        nameCategoryDurations[key] = (nameCategoryDurations[key] || 0) + duration;
      }
    });

    return {
      taskDurations,
      activityDurations,
      nameCategoryDurations,
    };
  }, [timeEntries, currentTime]);

  const getTrackedTaskDuration = (task: any): number => {
    const directMatch = trackedDurationByItem.taskDurations[task?._id] || 0;
    if (directMatch > 0) return directMatch;

    const fallbackKey = getNameCategoryKey(task?.title, task?.category?.name);
    return trackedDurationByItem.nameCategoryDurations[fallbackKey] || 0;
  };

  const getTrackedActivityDuration = (activity: any): number => {
    const directMatch = trackedDurationByItem.activityDurations[activity?._id] || 0;
    if (directMatch > 0) return directMatch;

    const fallbackKey = getNameCategoryKey(activity?.name, activity?.category?.name);
    return trackedDurationByItem.nameCategoryDurations[fallbackKey] || 0;
  };

  useEffect(() => {
    if (!planning) return;

    const autoCompletePlannedItems = async () => {
      const taskCandidates = (planning.plannedTasks || [])
        .map((pt) => {
          const targetDuration = pt.plannedDuration || pt.task.estimatedTime || 0;
          const trackedDuration = Math.max(
            getTrackedTaskDuration(pt.task),
            pt.actualDuration || 0
          );
          return { plannedItem: pt, targetDuration, trackedDuration };
        })
        .filter(({ plannedItem, targetDuration, trackedDuration }) =>
          !plannedItem.completed && targetDuration > 0 && trackedDuration >= targetDuration
        );

      const activityCandidates = (planning.plannedActivities || [])
        .map((pa) => {
          const targetDuration = pa.plannedDuration || pa.activity.estimatedDuration || 0;
          const trackedDuration = Math.max(
            getTrackedActivityDuration(pa.activity),
            pa.actualDuration || 0
          );
          return { plannedItem: pa, targetDuration, trackedDuration };
        })
        .filter(({ plannedItem, targetDuration, trackedDuration }) =>
          !plannedItem.completed && targetDuration > 0 && trackedDuration >= targetDuration
        );

      for (const { plannedItem, trackedDuration } of taskCandidates) {
        const lockKey = `task:${plannedItem.task._id}`;
        if (autoCompletingItemsRef.current.has(lockKey)) continue;

        autoCompletingItemsRef.current.add(lockKey);
        try {
          await completeTaskMutation.mutateAsync({
            taskId: plannedItem.task._id,
            completed: true,
            actualDuration: trackedDuration,
          });
        } catch (error) {
          console.error('Auto-complete task failed:', error);
        } finally {
          autoCompletingItemsRef.current.delete(lockKey);
        }
      }

      for (const { plannedItem, trackedDuration } of activityCandidates) {
        const lockKey = `activity:${plannedItem.activity._id}`;
        if (autoCompletingItemsRef.current.has(lockKey)) continue;

        autoCompletingItemsRef.current.add(lockKey);
        try {
          await completeActivityMutation.mutateAsync({
            activityId: plannedItem.activity._id,
            completed: true,
            actualDuration: trackedDuration,
          });
        } catch (error) {
          console.error('Auto-complete activity failed:', error);
        } finally {
          autoCompletingItemsRef.current.delete(lockKey);
        }
      }
    };

    autoCompletePlannedItems();
  }, [
    planning,
    trackedDurationByItem,
    completeTaskMutation,
    completeActivityMutation,
  ]);

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
                    startIcon={<ReorderIcon />}
                    onClick={() => reorderPlanningMutation.mutate()}
                    disabled={
                      reorderPlanningMutation.isPending ||
                      moveScheduledPriorityMutation.isPending ||
                      !((planning?.plannedTasks?.length || 0) + (planning?.plannedActivities?.length || 0))
                    }
                  >
                    {reorderPlanningMutation.isPending ? 'Re-ordering...' : 'Re-order'}
                  </Button>
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
                  {scheduledItems.map((plannedItem, index) => {
                      const isTask = plannedItem.type === 'task';
                      const item = plannedItem.item;
                      const content = isTask ? (item as any).task : (item as any).activity;
                      const scheduledItemKey = getScheduledItemKey(plannedItem);
                      const title = isTask ? content.title : content.name;
                      const estimatedTime = isTask ? content.estimatedTime : content.estimatedDuration;
                      const targetDuration = item.plannedDuration || estimatedTime || 0;
                      const trackedDuration = isTask
                        ? getTrackedTaskDuration(content)
                        : getTrackedActivityDuration(content);
                      const currentActualDuration = Math.max(trackedDuration, item.actualDuration || 0);
                      const progressPercent = targetDuration > 0
                        ? Math.min(100, Math.round((currentActualDuration / targetDuration) * 100))
                        : (item.completed ? 100 : 0);
                      const progressLabel = item.completed || progressPercent >= 100
                        ? 'Completed'
                        : currentActualDuration > 0
                          ? `In progress: ${formatTime(currentActualDuration)} / ${formatTime(targetDuration)}`
                          : 'Not started';
                      
                      return (
                        <Card
                          key={scheduledItemKey}
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
                                  <Chip
                                    label={
                                      item.completed || progressPercent >= 100
                                        ? '✅ Done'
                                        : currentActualDuration > 0
                                          ? `⏳ ${progressPercent}%`
                                          : '⬜ Not started'
                                    }
                                    size="small"
                                    color={
                                      item.completed || progressPercent >= 100
                                        ? 'success'
                                        : currentActualDuration > 0
                                          ? 'warning'
                                          : 'default'
                                    }
                                  />
                                </Box>

                                <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
                                  {editingPriorityItemKey === scheduledItemKey ? (
                                    <TextField
                                      size="small"
                                      type="number"
                                      value={priorityInputValue}
                                      onChange={(event) => setPriorityInputValue(event.target.value)}
                                      onBlur={() => submitPriorityEdit(scheduledItemKey)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          submitPriorityEdit(scheduledItemKey);
                                        }
                                        if (event.key === 'Escape') {
                                          event.preventDefault();
                                          cancelPriorityEdit();
                                        }
                                      }}
                                      autoFocus
                                      inputProps={{
                                        min: 1,
                                        max: scheduledItems.length,
                                        style: {
                                          padding: '2px 4px',
                                          textAlign: 'center',
                                          fontSize: '0.75rem',
                                          color: 'white',
                                        },
                                      }}
                                      sx={{
                                        width: 56,
                                        '& .MuiOutlinedInput-root': {
                                          height: 22,
                                          backgroundColor: 'primary.main',
                                          color: 'white',
                                          '& fieldset': { borderColor: 'primary.main' },
                                          '&:hover fieldset': { borderColor: 'primary.main' },
                                          '&.Mui-focused fieldset': { borderColor: 'primary.dark' },
                                        },
                                      }}
                                    />
                                  ) : (
                                    <Tooltip title="Click to edit priority">
                                      <Chip
                                        label={`#${item.priority}`}
                                        size="small"
                                        onClick={() => startPriorityEdit(scheduledItemKey, item.priority || index + 1)}
                                        sx={{
                                          backgroundColor: 'primary.main',
                                          color: 'white',
                                          fontSize: '0.7rem',
                                          height: '20px',
                                          cursor: 'pointer',
                                        }}
                                      />
                                    </Tooltip>
                                  )}
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
                                    ⏱️ {formatTime(targetDuration)}
                                  </Typography>
                                  {currentActualDuration > 0 && (
                                    <Typography variant="body2" color="primary">
                                      ✓ {formatTime(currentActualDuration)} tracked
                                    </Typography>
                                  )}
                                </Box>

                                <Box sx={{ mt: 1.25 }}>
                                  <LinearProgress
                                    variant="determinate"
                                    value={progressPercent}
                                    sx={{ height: 6, borderRadius: 3 }}
                                    color={
                                      item.completed || progressPercent >= 100
                                        ? 'success'
                                        : currentActualDuration > 0
                                          ? 'primary'
                                          : 'inherit'
                                    }
                                  />
                                  <Typography variant="caption" color="text.secondary">
                                    {progressLabel}
                                  </Typography>
                                </Box>
                              </Box>

                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Tooltip title="Move up">
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleMoveScheduledItem(index, 'up')}
                                      disabled={
                                        index === 0 ||
                                        moveScheduledPriorityMutation.isPending ||
                                        reorderPlanningMutation.isPending
                                      }
                                    >
                                      <MoveUpIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title="Move down">
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleMoveScheduledItem(index, 'down')}
                                      disabled={
                                        index === scheduledItems.length - 1 ||
                                        moveScheduledPriorityMutation.isPending ||
                                        reorderPlanningMutation.isPending
                                      }
                                    >
                                      <MoveDownIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title={item.completed ? "Mark as incomplete" : "Mark as complete"}>
                                  <IconButton
                                    size="small"
                                    color={item.completed ? "success" : "default"}
                                    onClick={() => {
                                      if (isTask) {
                                        completeTaskMutation.mutate({
                                          taskId: content._id,
                                          completed: !item.completed,
                                          actualDuration: currentActualDuration,
                                        });
                                      } else {
                                        completeActivityMutation.mutate({
                                          activityId: content._id,
                                          completed: !item.completed,
                                          actualDuration: currentActualDuration,
                                        });
                                      }
                                    }}
                                    disabled={
                                      completeTaskMutation.isPending ||
                                      completeActivityMutation.isPending ||
                                      moveScheduledPriorityMutation.isPending ||
                                      reorderPlanningMutation.isPending
                                    }
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
