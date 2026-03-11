import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Stack,
  keyframes,
} from '@mui/material';
import {
  Check as CompleteIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Edit as EditIcon,
  PlayArrow as PlayIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { timeEntriesApi, activitiesApi, tasksApi, planningApi } from '../services/api';
import { QuadrantColors, QuadrantLabels } from '../types';
import PomodoroTimer from '../components/PomodoroTimer';

// CSS keyframes for pulse animation
const pulseAnimation = keyframes`
  0% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.05);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
`;
const HIDDEN_NEXT_THREE_STORAGE_KEY = 'timeTracker:hiddenNextThreeByDate:v1';

type PlannedItemPreview = {
  id: string;
  type: 'task' | 'activity';
  title: string;
  categoryName: string;
  categoryColor: string;
  quadrant: number;
  priority: number;
  plannedStartTime?: string;
};

export default function TimeTracker() {
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [entryToEdit, setEntryToEdit] = useState<any>(null);
  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false);
  const [entryToSwitch, setEntryToSwitch] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(dayjs());
  const [manualEntry, setManualEntry] = useState({
    item: '',
    type: 'activity' as 'activity' | 'task',
    startTime: '',
    endTime: '',
    notes: '',
  });
  const [editEntryData, setEditEntryData] = useState({
    startTime: '',
    endTime: '',
  });
  const [lastManualSelection, setLastManualSelection] = useState<{
    item: string;
    type: 'activity' | 'task';
  } | null>(null);
  const manualStartTimeInputRef = useRef<HTMLInputElement | null>(null);
  const manualEndTimeInputRef = useRef<HTMLInputElement | null>(null);
  const [hiddenNextItemsByDate, setHiddenNextItemsByDate] = useState<Record<string, string[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(HIDDEN_NEXT_THREE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });

  const queryClient = useQueryClient();
  const buildLocalDateTime = (dateValue: string, timeValue: string): Date | null => {
    const dateParts = dateValue.split('-').map(Number);
    const timeParts = timeValue.split(':').map(Number);

    if (
      dateParts.length !== 3 ||
      timeParts.length < 2 ||
      dateParts.some((part) => Number.isNaN(part)) ||
      timeParts.some((part) => Number.isNaN(part))
    ) {
      return null;
    }

    const [year, month, day] = dateParts;
    const [hours, minutes] = timeParts;
    const built = new Date(year, month - 1, day, hours, minutes, 0, 0);

    if (Number.isNaN(built.getTime())) return null;
    return built;
  };

  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => activitiesApi.getAll(),
  });

  const { data: backlogTasks = [] } = useQuery({
    queryKey: ['backlogTasks'],
    queryFn: () => tasksApi.getBacklog(),
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['timeEntries', selectedDate.format('YYYY-MM-DD')],
    queryFn: () => timeEntriesApi.getAll({ date: selectedDate.format('YYYY-MM-DD') }),
  });

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry'],
    queryFn: timeEntriesApi.getActive,
    refetchInterval: 5000,
  });

  const { data: dailyPlanning } = useQuery({
    queryKey: ['dailyPlanning', selectedDate.format('YYYY-MM-DD')],
    queryFn: () => planningApi.getPlanning(selectedDate.format('YYYY-MM-DD')),
  });

  const { data: dailySummary } = useQuery({
    queryKey: ['dailySummary', selectedDate.format('YYYY-MM-DD')],
    queryFn: () => timeEntriesApi.getDailySummary(selectedDate.format('YYYY-MM-DD')),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: timeEntriesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
      setDeleteConfirmOpen(false);
      setEntryToDelete(null);
    },
  });

  const startFromEntryMutation = useMutation({
    mutationFn: async (entry: any) => {
      const localDate = selectedDate.format('YYYY-MM-DD');
      const taskId = entry.task?._id;
      const activityId = entry.activity?._id;
      const matchedTask = taskId ? backlogTasks.find((task) => task._id === taskId) : null;
      const matchedActivity = activityId ? activities.find((activity) => activity._id === activityId) : null;

      const categoryName =
        entry.task?.category?.name ||
        matchedTask?.category?.name ||
        entry.activity?.category?.name ||
        matchedActivity?.category?.name ||
        '';
      const activityName = (entry.activity?.name || matchedActivity?.name || '').trim().toLowerCase();

      const isBreak = activityName === 'break time';
      const isWorkCategory = categoryName.trim().toLowerCase() === 'work';
      const isTaskEntry = !!entry.task?._id;
      const isPomodoro = isTaskEntry
        ? true
        : (isBreak || isWorkCategory || entry.isPomodoro === true || activeEntry?.isPomodoro === true);

      if (activeEntry?.isActive && activeEntry._id !== entry._id) {
        await timeEntriesApi.stop(activeEntry._id, {
          notes: `Switched to: ${entry.activity?.name || entry.task?.title || 'selected item'}`,
        });
      }

      if (entry.task?._id) {
        return timeEntriesApi.startWithTask({
          task: entry.task._id,
          isPomodoro,
          notes: `Started task: ${entry.task.title}`,
          localDate,
        });
      }

      if (entry.activity?._id) {
        return timeEntriesApi.start({
          activity: entry.activity._id,
          isPomodoro,
          notes: `Started activity: ${entry.activity.name}`,
          localDate,
        });
      }

      return Promise.resolve(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
      queryClient.invalidateQueries({ queryKey: ['dailyPlanning'] });
      setSwitchConfirmOpen(false);
      setEntryToSwitch(null);
    },
  });

  const completePlannedItemMutation = useMutation({
    mutationFn: async (item: PlannedItemPreview) => {
      const dateKey = selectedDate.format('YYYY-MM-DD');
      if (item.type === 'task') {
        return planningApi.completeTask(dateKey, item.id, { completed: true });
      }
      return planningApi.completeActivity(dateKey, item.id, { completed: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyPlanning'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
    },
  });

  const createManualEntryMutation = useMutation({
    mutationFn: async (data: any) => {
      const selectedDateKey = selectedDate.format('YYYY-MM-DD');
      const startDateTime = buildLocalDateTime(selectedDateKey, data.startTime);
      const endDateTime = buildLocalDateTime(selectedDateKey, data.endTime);
      const dayStart = buildLocalDateTime(selectedDateKey, '00:00');

      if (!startDateTime || !endDateTime || !dayStart) {
        throw new Error('Invalid date or time. Please verify start/end time.');
      }
      if (endDateTime.getTime() <= startDateTime.getTime()) {
        throw new Error('End time must be after start time.');
      }
      
      const entryData: any = {
        startTime: startDateTime,
        endTime: endDateTime,
        notes: data.notes,
        isActive: false, // Manual entries are already completed
        date: dayStart, // Use local start of day for date field
      };
      
      if (data.type === 'activity') {
        entryData.activity = data.item;
      } else {
        entryData.task = data.item;
      }
      
      // Calculate duration in minutes
      entryData.duration = Math.round((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60));
      
      return timeEntriesApi.createManual(entryData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries', selectedDate.format('YYYY-MM-DD')] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
      setDialogOpen(false);
      setManualEntry((previous) => ({
        ...previous,
        startTime: '',
        endTime: '',
        notes: '',
      }));
    },
    onError: (error: any) => {
      const serverMessage = error?.response?.data?.error;
      alert(serverMessage || error?.message || 'Could not add manual entry. Please try again.');
    },
  });

  const updateTimeEntryMutation = useMutation({
    mutationFn: async (data: { id: string; startTime: string; endTime: string }) => {
      const entryDate = dayjs(entryToEdit.startTime).format('YYYY-MM-DD');
      const startDateTime = new Date(`${entryDate}T${data.startTime}`);
      const endDateTime = new Date(`${entryDate}T${data.endTime}`);
      
      // Calculate duration in minutes
      const duration = Math.round((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60));
      
      const updateData = {
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        duration: duration,
      };
      
      return timeEntriesApi.update(data.id, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
      setEditDialogOpen(false);
      setEntryToEdit(null);
      setEditEntryData({ startTime: '', endTime: '' });
    },
  });

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatDateTime = (dateTime: string): string => {
    return dayjs(dateTime).format('HH:mm');
  };
  const selectedDateKey = selectedDate.format('YYYY-MM-DD');
  const getPlannedItemKey = (item: PlannedItemPreview) => `${item.type}:${item.id}`;
  const hiddenKeysForSelectedDate = hiddenNextItemsByDate[selectedDateKey] || [];
  const isHiddenFromNextThree = (item: PlannedItemPreview) =>
    hiddenKeysForSelectedDate.includes(getPlannedItemKey(item));
  const hideFromNextThree = (item: PlannedItemPreview) => {
    const itemKey = getPlannedItemKey(item);
    setHiddenNextItemsByDate((prev) => {
      const currentDateHidden = prev[selectedDateKey] || [];
      if (currentDateHidden.includes(itemKey)) {
        return prev;
      }
      return {
        ...prev,
        [selectedDateKey]: [...currentDateHidden, itemKey],
      };
    });
  };
  const shouldHideFromNextThree = (item: PlannedItemPreview): boolean => {
    if (item.type !== 'activity') return false;
    const normalizedTitle = item.title.trim().toLowerCase();
    return (
      normalizedTitle === 'break time' ||
      normalizedTitle === 'jackie' ||
      normalizedTitle === 'jackie activity' ||
      normalizedTitle.includes('jackie')
    );
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(HIDDEN_NEXT_THREE_STORAGE_KEY, JSON.stringify(hiddenNextItemsByDate));
    } catch {
      // ignore storage errors
    }
  }, [hiddenNextItemsByDate]);

  useEffect(() => {
    if (!dialogOpen) return;
    if (manualEntry.item) return;
    if (!lastManualSelection?.item) return;

    setManualEntry((previous) => ({
      ...previous,
      item: lastManualSelection.item,
      type: lastManualSelection.type,
    }));
  }, [dialogOpen, manualEntry.item, lastManualSelection]);

  const trackedTaskIds = new Set(
    timeEntries
      .map((entry) => entry.task?._id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );
  const trackedActivityIds = new Set(
    timeEntries
      .map((entry) => entry.activity?._id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  const nextThreeItems: PlannedItemPreview[] = dailyPlanning
    ? [
        ...(dailyPlanning.plannedTasks || []).map((pt) => ({
          id: pt.task._id,
          type: 'task' as const,
          title: pt.task.title,
          categoryName: pt.task.category.name,
          categoryColor: pt.task.category.color,
          quadrant: pt.task.quadrant,
          priority: pt.priority,
          plannedStartTime: pt.plannedStartTime,
          completed: pt.completed,
        })),
        ...(dailyPlanning.plannedActivities || []).map((pa) => ({
          id: pa.activity._id,
          type: 'activity' as const,
          title: pa.activity.name,
          categoryName: pa.activity.category.name,
          categoryColor: pa.activity.category.color,
          quadrant: pa.activity.quadrant,
          priority: pa.priority,
          plannedStartTime: pa.plannedStartTime,
          completed: pa.completed,
        })),
      ]
        .filter((item) => {
          if (item.completed) return false;
          if (shouldHideFromNextThree(item)) return false;
          if (isHiddenFromNextThree(item)) return false;
          if (item.type === 'task') {
            if (trackedTaskIds.has(item.id)) return false;
            return item.id !== activeEntry?.task?._id;
          }
          if (trackedActivityIds.has(item.id)) return false;
          return item.id !== activeEntry?.activity?._id;
        })
        .sort((a, b) => {
          const aPriority = typeof a.priority === 'number' ? a.priority : Number.MAX_SAFE_INTEGER;
          const bPriority = typeof b.priority === 'number' ? b.priority : Number.MAX_SAFE_INTEGER;
          if (aPriority !== bPriority) return aPriority - bPriority;

          const aTime = a.plannedStartTime ? new Date(a.plannedStartTime).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.plannedStartTime ? new Date(b.plannedStartTime).getTime() : Number.MAX_SAFE_INTEGER;
          if (aTime !== bTime) return aTime - bTime;

          return a.title.localeCompare(b.title);
        })
        .slice(0, 3)
        .reverse()
    : [];

  // Calculate real-time duration for active entries
  const calculateCurrentDuration = (entry: any): number => {
    if (entry.isActive && entry.startTime) {
      const startTime = dayjs(entry.startTime);
      const elapsed = currentTime.diff(startTime, 'minute');
      return Math.max(0, elapsed);
    }
    return entry.duration;
  };

  // Calculate total time including active entries
  const totalTime = timeEntries.reduce((sum, entry) => {
    return sum + calculateCurrentDuration(entry);
  }, 0);

  // Calculate work time (work category + break time)
  const workTime = timeEntries.reduce((sum, entry) => {
    const isWorkCategory = entry.activity?.category?.name === 'Work' || entry.task?.category?.name === 'Work';
    const isBreakTime = entry.isBreak;
    
    if (isWorkCategory || isBreakTime) {
      return sum + calculateCurrentDuration(entry);
    }
    return sum;
  }, 0);

  const getProductivityColor = (score: number): string => {
    if (score >= 80) return 'success.main';
    if (score >= 60) return 'warning.main';
    return 'error.main';
  };

  const workPlannedItems = dailyPlanning ? [
    ...(dailyPlanning.plannedTasks || []).filter(pt => pt.task?.category?.name === 'Work'),
    ...(dailyPlanning.plannedActivities || []).filter(pa => pa.activity?.category?.name === 'Work'),
  ] : [];

  const otherPlannedItems = dailyPlanning ? [
    ...(dailyPlanning.plannedTasks || []).filter(pt => pt.task?.category?.name !== 'Work'),
    ...(dailyPlanning.plannedActivities || []).filter(pa => pa.activity?.category?.name !== 'Work'),
  ] : [];

  const workPlannedCount = workPlannedItems.length;
  const otherPlannedCount = otherPlannedItems.length;

  const workCompletedCount = workPlannedItems.filter(item => item.completed).length;
  const otherCompletedCount = otherPlannedItems.filter(item => item.completed).length;

  const workPlannedTime = workPlannedItems.reduce((sum, item) => {
    const isTask = 'task' in item;
    return sum + (item.plannedDuration || (isTask ? item.task?.estimatedTime : item.activity?.estimatedDuration) || 0);
  }, 0);

  const otherPlannedTime = otherPlannedItems.reduce((sum, item) => {
    const isTask = 'task' in item;
    return sum + (item.plannedDuration || (isTask ? item.task?.estimatedTime : item.activity?.estimatedDuration) || 0);
  }, 0);

  const workActualTime = workTime;
  const otherActualTime = Math.max(0, totalTime - workActualTime);
  const productivityScore = workPlannedTime > 0
    ? Math.min(100, Math.round((workActualTime / workPlannedTime) * 100))
    : 0;

  const workRemainingMinutes = Math.max(0, workPlannedTime - workActualTime);
  const otherRemainingMinutes = Math.max(0, otherPlannedTime - otherActualTime);
  const totalRemainingMinutes = workRemainingMinutes + otherRemainingMinutes;
  const projectedFinishTime = totalRemainingMinutes > 0
    ? dayjs().add(totalRemainingMinutes, 'minute').format('HH:mm')
    : 'Done';

  // Update current time every minute for duration calculation
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs());
    }, 60000); // Update every minute for duration accuracy

    return () => clearInterval(timer);
  }, []);

  // More frequent updates for better UX - but only if there's an active entry
  useEffect(() => {
    if (activeEntry) {
      const timer = setInterval(() => {
        setCurrentTime(dayjs());
      }, 30000); // Update every 30 seconds when actively tracking

      return () => clearInterval(timer);
    }
  }, [activeEntry]);

  const handleDeleteClick = (entryId: string) => {
    setEntryToDelete(entryId);
    setDeleteConfirmOpen(true);
  };

  const handleEditClick = (entry: any) => {
    if (entry.isActive) {
      return; // Don't allow editing active entries
    }
    setEntryToEdit(entry);
    // Convert times to HH:mm format for the time inputs
    setEditEntryData({
      startTime: dayjs(entry.startTime).format('HH:mm'),
      endTime: entry.endTime ? dayjs(entry.endTime).format('HH:mm') : '',
    });
    setEditDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (entryToDelete) {
      deleteEntryMutation.mutate(entryToDelete);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setEntryToDelete(null);
  };

  const handleSwitchClick = (entry: any) => {
    if (entry.isActive) return;
    setEntryToSwitch(entry);
    setSwitchConfirmOpen(true);
  };

  const handleSwitchConfirm = () => {
    if (!entryToSwitch) return;
    startFromEntryMutation.mutate(entryToSwitch);
  };

  const handleSwitchCancel = () => {
    setSwitchConfirmOpen(false);
    setEntryToSwitch(null);
  };

  const handleManualEntrySubmit = () => {
    const resolvedStartTime = manualEntry.startTime || manualStartTimeInputRef.current?.value || '';
    const resolvedEndTime = manualEntry.endTime || manualEndTimeInputRef.current?.value || '';
    const payload = manualEntry.item
      ? { ...manualEntry, startTime: resolvedStartTime, endTime: resolvedEndTime }
      : lastManualSelection
        ? {
            ...manualEntry,
            item: lastManualSelection.item,
            type: lastManualSelection.type,
            startTime: resolvedStartTime,
            endTime: resolvedEndTime,
          }
        : { ...manualEntry, startTime: resolvedStartTime, endTime: resolvedEndTime };

    if (resolvedStartTime !== manualEntry.startTime || resolvedEndTime !== manualEntry.endTime) {
      setManualEntry((previous) => ({
        ...previous,
        startTime: resolvedStartTime,
        endTime: resolvedEndTime,
      }));
    }

    const missingFields: string[] = [];
    if (!payload.item) missingFields.push('activity/task');
    if (!payload.startTime) missingFields.push('start time');
    if (!payload.endTime) missingFields.push('end time');

    if (missingFields.length > 0) {
      alert(`Please fill: ${missingFields.join(', ')}.`);
      return;
    }

    const selectedDateKey = selectedDate.format('YYYY-MM-DD');
    const startDateTime = buildLocalDateTime(selectedDateKey, payload.startTime);
    const endDateTime = buildLocalDateTime(selectedDateKey, payload.endTime);
    if (!startDateTime || !endDateTime) {
      alert('Invalid start/end time.');
      return;
    }
    if (endDateTime.getTime() <= startDateTime.getTime()) {
      alert('End time must be after start time');
      return;
    }
    
    createManualEntryMutation.mutate(payload);
  };

  const handleEditEntrySubmit = () => {
    if (!editEntryData.startTime || !editEntryData.endTime || !entryToEdit) {
      return;
    }
    
    // Validate that end time is after start time
    const startTime = dayjs(`2000-01-01T${editEntryData.startTime}`);
    const endTime = dayjs(`2000-01-01T${editEntryData.endTime}`);
    
    if (endTime.isBefore(startTime) || endTime.isSame(startTime)) {
      alert('End time must be after start time');
      return;
    }
    
    updateTimeEntryMutation.mutate({
      id: entryToEdit._id,
      startTime: editEntryData.startTime,
      endTime: editEntryData.endTime,
    });
  };

  return (
    <Box sx={{ height: 'calc(100vh - 88px)', overflow: 'hidden' }}>
      <Grid container spacing={3} sx={{ height: '100%' }}>
        {/* Left Column: Pomodoro + Stats */}
        <Grid item xs={12} md={5} sx={{ height: '100%', minHeight: 0 }}>
          <Stack spacing={2} sx={{ height: '100%', minHeight: 0 }}>
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', '& > *': { flex: 1, minHeight: 0 } }}>
              <PomodoroTimer compact />
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <Card sx={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ minHeight: 0, overflowY: 'auto', py: 1.5 }}>
                  <Typography variant="h6" gutterBottom>
                    📊 Daily Overview
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {selectedDate.format('dddd, MMMM D, YYYY')}
                  </Typography>

                  <Box sx={{ mt: 1.25 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">Productivity Score</Typography>
                      <Typography variant="body2" fontWeight="bold">{productivityScore}%</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={productivityScore}
                      sx={{
                        height: 7,
                        borderRadius: 4,
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: getProductivityColor(productivityScore),
                        },
                      }}
                    />
                  </Box>

                  <Box sx={{ mt: 1.25 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">Personal Growth Score</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {dailyPlanning?.personalGrowth?.score || 0}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={dailyPlanning?.personalGrowth?.score || 0}
                      sx={{
                        height: 7,
                        borderRadius: 4,
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: getProductivityColor(dailyPlanning?.personalGrowth?.score || 0),
                        },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {formatTime(dailyPlanning?.personalGrowth?.actual?.totalTime || 0)} / {formatTime(dailyPlanning?.personalGrowth?.planned?.totalTime || 0)} Personal Development + Health
                    </Typography>
                  </Box>

                  <Grid container spacing={1} sx={{ mt: 0.25 }}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Work Tasks</Typography>
                      <Typography variant="body2" fontWeight="bold">{workCompletedCount} / {workPlannedCount}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Work Time</Typography>
                      <Typography variant="body2" fontWeight="bold">{formatTime(workActualTime)} / {formatTime(workPlannedTime)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Other Tasks</Typography>
                      <Typography variant="body2" fontWeight="bold">{otherCompletedCount} / {otherPlannedCount}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Other Time</Typography>
                      <Typography variant="body2" fontWeight="bold">{formatTime(otherActualTime)} / {formatTime(otherPlannedTime)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Remaining</Typography>
                      <Typography variant="body2" fontWeight="bold">{formatTime(totalRemainingMinutes)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Projected Finish</Typography>
                      <Typography variant="body2" fontWeight="bold">{projectedFinishTime}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Box>
          </Stack>
        </Grid>

        {/* Right Column: Time Entries */}
        <Grid item xs={12} md={7} sx={{ height: '100%', minHeight: 0, display: 'flex' }}>
          <Card sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h6">
                    Time Entries - {selectedDate.format('MMMM D, YYYY')}
                  </Typography>
                  <IconButton size="small" onClick={() => setDatePickerOpen(true)} title="Select date">
                    <CalendarIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setDialogOpen(true)}
                >
                  Add Manual Entry
                </Button>
              </Box>

              <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Item</TableCell>
                        <TableCell>Category</TableCell>
                        <TableCell>Q</TableCell>
                        <TableCell>Start</TableCell>
                        <TableCell>End</TableCell>
                        <TableCell>Duration</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {nextThreeItems.map((item) => (
                        <TableRow key={`planned-${item.type}-${item.id}`} sx={{ backgroundColor: 'action.hover' }}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  backgroundColor: item.categoryColor,
                                }}
                              />
                              <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                {item.title}
                                <Chip
                                  label="Planned"
                                  size="small"
                                  sx={{ ml: 1, fontSize: '0.6rem', height: '16px' }}
                                />
                                <Chip
                                  label={item.type === 'task' ? 'Task' : 'Activity'}
                                  size="small"
                                  sx={{ ml: 0.5, fontSize: '0.6rem', height: '16px' }}
                                />
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              {item.categoryName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={`${item.quadrant}`}
                              size="small"
                              sx={{
                                backgroundColor: QuadrantColors[item.quadrant as keyof typeof QuadrantColors],
                                color: 'white',
                                width: 24,
                                height: 20,
                                fontSize: '0.7rem',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              —
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              —
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              —
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() =>
                                  handleSwitchClick({
                                    isActive: false,
                                    ...(item.type === 'task'
                                      ? { task: { _id: item.id, title: item.title } }
                                      : { activity: { _id: item.id, name: item.title } }),
                                  })
                                }
                                disabled={
                                  startFromEntryMutation.isPending ||
                                  completePlannedItemMutation.isPending
                                }
                                title={`Switch and start this ${item.type}`}
                              >
                                <PlayIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => completePlannedItemMutation.mutate(item)}
                                disabled={
                                  startFromEntryMutation.isPending ||
                                  completePlannedItemMutation.isPending
                                }
                                title={`Mark this ${item.type} as completed`}
                              >
                                <CompleteIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => hideFromNextThree(item)}
                                disabled={
                                  startFromEntryMutation.isPending ||
                                  completePlannedItemMutation.isPending
                                }
                                title={`Hide this ${item.type} from Next 3 list`}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                      {timeEntries.map((entry) => {
                        const itemName = entry.activity?.name || entry.task?.title || 'Unknown';
                        const itemColor = entry.activity?.color || entry.task?.category?.color || '#2196f3';
                        const itemCategory = entry.isBreak ? 'Break' : (entry.activity?.category?.name || entry.task?.category?.name || 'Unknown');
                        const itemQuadrant = entry.activity?.quadrant || entry.task?.quadrant || 1;
                        
                        return (
                          <TableRow key={entry._id}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    backgroundColor: itemColor,
                                  }}
                                />
                                <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                                  {itemName}
                                  {entry.task && (
                                    <Chip 
                                      label="Task" 
                                      size="small" 
                                      sx={{ ml: 1, fontSize: '0.6rem', height: '16px' }}
                                    />
                                  )}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                {itemCategory}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={`${itemQuadrant}`}
                                size="small"
                                sx={{
                                  backgroundColor: QuadrantColors[itemQuadrant],
                                  color: 'white',
                                  width: 24,
                                  height: 20,
                                  fontSize: '0.7rem',
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                {formatDateTime(entry.startTime)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {entry.endTime ? (
                                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                  {formatDateTime(entry.endTime)}
                                </Typography>
                              ) : (
                                <Chip label="Active" color="primary" size="small" sx={{ fontSize: '0.7rem' }} />
                              )}
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    fontSize: '0.8rem', 
                                    fontWeight: 'medium',
                                    color: entry.isActive ? 'primary.main' : 'inherit'
                                  }}
                                >
                                  {formatTime(calculateCurrentDuration(entry))}
                                </Typography>
                                {entry.isActive && (
                                  <Chip 
                                    label="LIVE" 
                                    size="small" 
                                    color="primary" 
                                    sx={{ 
                                      fontSize: '0.6rem', 
                                      height: '16px',
                                      animation: `${pulseAnimation} 2s infinite`,
                                      fontWeight: 'bold'
                                    }} 
                                  />
                                )}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                {!entry.isActive && (
                                  <IconButton
                                    size="small"
                                    color="success"
                                    onClick={() => handleSwitchClick(entry)}
                                    disabled={startFromEntryMutation.isPending}
                                    title="Switch and start this item"
                                  >
                                    <PlayIcon fontSize="small" />
                                  </IconButton>
                                )}
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => handleEditClick(entry)}
                                  disabled={entry.isActive}
                                  title="Edit times"
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeleteClick(entry._id)}
                                  disabled={entry.isActive}
                                  title="Delete entry"
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {timeEntries.length === 0 && nextThreeItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} align="center">
                            <Typography variant="body2" color="text.secondary">
                              No time entries for this date
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
        </Grid>
      </Grid>

      {/* Date Picker Dialog */}
      <Dialog open={datePickerOpen} onClose={() => setDatePickerOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Select Date</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <DatePicker
            value={selectedDate}
            onChange={(date) => {
              setSelectedDate(date || dayjs());
              setDatePickerOpen(false);
            }}
            format="MM/DD/YYYY"
            slotProps={{ textField: { fullWidth: true } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDatePickerOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Manual Entry Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Manual Time Entry</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Activity or Task</InputLabel>
                <Select
                  value={manualEntry.item ? `${manualEntry.type}:${manualEntry.item}` : ''}
                  label="Activity or Task"
                  onChange={(e) => {
                    const [type, id] = e.target.value.split(':') as ['activity' | 'task', string];
                    setManualEntry((previous) => ({ ...previous, item: id, type }));
                    setLastManualSelection({ item: id, type });
                  }}
                >
                  {/* Activities Section */}
                  <MenuItem disabled sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    📋 Activities (Repetitive)
                  </MenuItem>
                  {activities.map((activity) => (
                    <MenuItem key={`activity:${activity._id}`} value={`activity:${activity._id}`} sx={{ pl: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: activity.color,
                          }}
                        />
                        {activity.name}
                      </Box>
                    </MenuItem>
                  ))}
                  
                  {/* Tasks Section */}
                  <MenuItem disabled sx={{ fontWeight: 'bold', color: 'secondary.main', mt: 1 }}>
                    🎯 Backlog Tasks (Work Items)
                  </MenuItem>
                  {backlogTasks.map((task) => (
                    <MenuItem key={`task:${task._id}`} value={`task:${task._id}`} sx={{ pl: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: task.category.color,
                          }}
                        />
                        {task.title}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Start Time"
                type="time"
                value={manualEntry.startTime}
                inputRef={manualStartTimeInputRef}
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setManualEntry((previous) => ({ ...previous, startTime: value }));
                }}
                onChange={(e) => setManualEntry((previous) => ({ ...previous, startTime: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="End Time"
                type="time"
                value={manualEntry.endTime}
                inputRef={manualEndTimeInputRef}
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setManualEntry((previous) => ({ ...previous, endTime: value }));
                }}
                onChange={(e) => setManualEntry((previous) => ({ ...previous, endTime: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={2}
                value={manualEntry.notes}
                onChange={(e) => setManualEntry((previous) => ({ ...previous, notes: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained"
            onClick={handleManualEntrySubmit}
            disabled={createManualEntryMutation.isPending}
          >
            Add Entry
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Time Entry Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Time Entry</DialogTitle>
        <DialogContent>
          {entryToEdit && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                {entryToEdit.activity?.name || entryToEdit.task?.title || 'Unknown'}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {dayjs(entryToEdit.startTime).format('MMMM D, YYYY')}
              </Typography>
              
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Start Time"
                    type="time"
                    value={editEntryData.startTime}
                    onChange={(e) => setEditEntryData({ ...editEntryData, startTime: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="End Time"
                    type="time"
                    value={editEntryData.endTime}
                    onChange={(e) => setEditEntryData({ ...editEntryData, endTime: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Note: Only start and end times can be edited. The activity/task and other details remain unchanged.
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained"
            onClick={handleEditEntrySubmit}
            disabled={!editEntryData.startTime || !editEntryData.endTime || updateTimeEntryMutation.isPending}
          >
            Update Times
          </Button>
        </DialogActions>
      </Dialog>
      {/* Switch Confirmation Dialog */}
      <Dialog open={switchConfirmOpen} onClose={handleSwitchCancel} maxWidth="xs" fullWidth>
        <DialogTitle>Switch to selected item?</DialogTitle>
        <DialogContent>
          <Typography>
            {activeEntry
              ? `If you continue, the current active timer will stop and switch to "${entryToSwitch?.activity?.name || entryToSwitch?.task?.title || 'selected item'}".`
              : `Start tracking "${entryToSwitch?.activity?.name || entryToSwitch?.task?.title || 'selected item'}"?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSwitchCancel}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleSwitchConfirm}
            disabled={startFromEntryMutation.isPending}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={handleDeleteCancel} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this time entry? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={handleDeleteConfirm}
            disabled={deleteEntryMutation.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
