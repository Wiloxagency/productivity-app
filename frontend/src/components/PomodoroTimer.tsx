import React, { useState, useEffect, useRef, useMemo } from 'react';
import dayjs from 'dayjs';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  RestartAlt as ResetIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activitiesApi, timeEntriesApi, tasksApi } from '../services/api';
import { Activity, TimeEntry, Task } from '../types';

interface PomodoroTimerProps {
  onTimerComplete?: () => void;
  compact?: boolean;
}

// Pomodoro Settings - TODO: Move to settings page in the future
const POMODORO_SETTINGS = {
  WORK_DURATION: 60, // minutes
  BREAK_DURATION: 10, // minutes
};
const POMODORO_COMPLETION_NOTIFICATION_KEY = 'pomodoro:lastCompletedEntryKey';

export default function PomodoroTimer({ onTimerComplete, compact = false }: PomodoroTimerProps) {
  const [selectedItem, setSelectedItem] = useState<string>(''); // Can be activity ID or task ID
  const [selectedType, setSelectedType] = useState<'activity' | 'task'>('activity');
  const [isBreak, setIsBreak] = useState(false);
  const [duration, setDuration] = useState(POMODORO_SETTINGS.WORK_DURATION); // minutes
  const [timeLeft, setTimeLeft] = useState(POMODORO_SETTINGS.WORK_DURATION * 60); // seconds
  const [overtimeSeconds, setOvertimeSeconds] = useState(0); // seconds elapsed beyond the target duration
  const [isRunning, setIsRunning] = useState(false);
  const [sessionRefreshAt, setSessionRefreshAt] = useState(dayjs());
  const notes = '';
  
  const queryClient = useQueryClient();
  const intervalRef = useRef<number | null>(null);
  const hasCompletionBeenNotified = (completionKey: string): boolean => {
    try {
      return window.sessionStorage.getItem(POMODORO_COMPLETION_NOTIFICATION_KEY) === completionKey;
    } catch {
      return false;
    }
  };
  const markCompletionAsNotified = (completionKey: string) => {
    try {
      window.sessionStorage.setItem(POMODORO_COMPLETION_NOTIFICATION_KEY, completionKey);
    } catch {
      // ignore storage errors
    }
  };

  // Request notification permission on component mount
  React.useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Refresh time-based session values every minute without requiring reload.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSessionRefreshAt(dayjs());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Function to play notification sound (5 beeps)
  const playNotificationBeeps = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const playBeep = (frequency: number, duration: number, delay: number = 0) => {
      setTimeout(() => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
      }, delay);
    };

    // Play 5 beeps with increasing pitch
    for (let i = 0; i < 5; i++) {
      playBeep(800 + (i * 100), 0.2, i * 300);
    }

    // Close the audio context after the beeps finish to free resources
    const totalDurationMs = (4 * 300) + 500; // last beep starts at 1200ms, add buffer
    setTimeout(() => {
      try { audioContext.close(); } catch {}
    }, totalDurationMs);
  };

  // Function to show system notification
  const showNotification = (title: string, body: string, icon?: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body,
        icon: icon || '/favicon.ico',
        requireInteraction: true, // Keeps notification until user interacts
        tag: 'pomodoro-timer', // Replace previous notifications
      });

      // Auto-close notification after 10 seconds
      setTimeout(() => notification.close(), 10000);

      // Focus window when notification is clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  };

  // Function to handle timer completion
  const handleTimerComplete = () => {
    const completionMessage = isBreak 
      ? '☕ Break time is over! Ready to get back to work?' 
      : '🍅 Pomodoro completed! Time for a well-deserved break!';
    
    const notificationTitle = isBreak ? 'Break Complete!' : 'Pomodoro Complete!';
    
    // Play 5 beeps
    playNotificationBeeps();
    
    // Show system notification
    showNotification(
      notificationTitle,
      completionMessage,
      isBreak ? '/icons/break-complete.png' : '/icons/pomodoro-complete.png'
    );

    // Call the original completion callback
    if (onTimerComplete) onTimerComplete();
  };

  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => activitiesApi.getAll(),
  });

  const { data: backlogTasks = [] } = useQuery({
    queryKey: ['backlogTasks'],
    queryFn: () => tasksApi.getBacklog(),
  });

  const { data: activeEntry, isFetching: isActiveEntryFetching } = useQuery({
    queryKey: ['activeTimeEntry'],
    queryFn: timeEntriesApi.getActive,
    refetchInterval: 5000, // Refresh every 5 seconds
    refetchIntervalInBackground: true,
  });
  const todayDate = dayjs().format('YYYY-MM-DD');
  const { data: todayTimeEntries = [] } = useQuery({
    queryKey: ['timeEntries', todayDate],
    queryFn: () => timeEntriesApi.getAll({ date: todayDate }),
    refetchInterval: 5000,
  });

  const pomodoroSessionStats = useMemo(() => {
    const entriesById = new Map<string, TimeEntry>();
    todayTimeEntries.forEach((entry) => entriesById.set(entry._id, entry));
    const activeEntryDate = activeEntry?.startTime
      ? dayjs(activeEntry.startTime).format('YYYY-MM-DD')
      : activeEntry?.date;
    if (activeEntry && activeEntryDate === todayDate) {
      entriesById.set(activeEntry._id, activeEntry);
    }

    const isBreakEntry = (entry: TimeEntry) =>
      entry.isBreak ||
      entry.activity?.name?.trim().toLowerCase() === 'break time';
    const isWorkTypeEntry = (entry: TimeEntry) => {
      const categoryName = entry.activity?.category?.name || entry.task?.category?.name || '';
      return categoryName.trim().toLowerCase() === 'work';
    };
    const getEntryDurationMinutes = (entry: TimeEntry) => {
      if (entry.isActive && entry.startTime) {
        return Math.max(entry.duration || 0, sessionRefreshAt.diff(dayjs(entry.startTime), 'minute'));
      }
      if (typeof entry.duration === 'number' && entry.duration > 0) {
        return entry.duration;
      }
      if (entry.startTime && entry.endTime) {
        return Math.max(0, dayjs(entry.endTime).diff(dayjs(entry.startTime), 'minute'));
      }
      return 0;
    };
    const additionalCycleThresholdMinutes = POMODORO_SETTINGS.WORK_DURATION * 0.7;

    const orderedEntries = Array.from(entriesById.values())
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    if (!orderedEntries.length) {
      return { cycleCount: 0, totalSessionMinutes: 0 };
    }

    const breakCount = orderedEntries.filter(isBreakEntry).length;

    let lastBreakIndex = -1;
    for (let i = orderedEntries.length - 1; i >= 0; i -= 1) {
      if (isBreakEntry(orderedEntries[i])) {
        lastBreakIndex = i;
        break;
      }
    }

    const entriesAfterLastBreak = orderedEntries.slice(lastBreakIndex + 1);
    let workMinutesAfterLastBreak = 0;
    entriesAfterLastBreak.forEach((entry) => {
      if (isBreakEntry(entry)) {
        workMinutesAfterLastBreak = 0;
        return;
      }

      if (isWorkTypeEntry(entry)) {
        workMinutesAfterLastBreak += getEntryDurationMinutes(entry);
        return;
      }

      // Any non-Work category resets the current session accumulator.
      workMinutesAfterLastBreak = 0;
    });
    const hasQualifiedAdditionalPomodoro =
      workMinutesAfterLastBreak > additionalCycleThresholdMinutes;

    return {
      cycleCount: breakCount + (hasQualifiedAdditionalPomodoro ? 1 : 0),
      totalSessionMinutes: workMinutesAfterLastBreak,
    };
  }, [todayTimeEntries, activeEntry, todayDate, sessionRefreshAt]);

  const startTimerMutation = useMutation({
    mutationFn: (data: { activity: string; isPomodoro: boolean; isBreak?: boolean; notes?: string; localDate?: string }) =>
      timeEntriesApi.start(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });

  const startTaskMutation = useMutation({
    mutationFn: (data: { task: string; isPomodoro?: boolean; notes?: string; localDate?: string }) =>
      timeEntriesApi.startWithTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });

  const stopTimerMutation = useMutation({
    mutationFn: (data: { id: string; notes?: string; keepTimerRunning?: boolean }) =>
      timeEntriesApi.stop(data.id, { notes: data.notes }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      // Only stop the timer if not explicitly keeping it running
      if (!variables.keepTimerRunning) {
        setIsRunning(false);
        if (onTimerComplete) onTimerComplete();
      }
    },
  });

  const switchActivityMutation = useMutation({
    mutationFn: (data: { entryId: string; activity: string; notes?: string }) =>
      timeEntriesApi.switchActivity(data.entryId, { activity: data.activity, notes: data.notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });

  const switchTaskMutation = useMutation({
    mutationFn: (data: { entryId: string; task: string; notes?: string }) =>
      timeEntriesApi.switchToTask(data.entryId, { task: data.task, notes: data.notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });

  // Local fallback countdown while activeEntry query is hydrating.
  useEffect(() => {
    // Active pomodoro entries are synchronized by the authoritative effect below.
    if (activeEntry?.isPomodoro) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setTimeLeft((currentValue) => {
          if (currentValue <= 1) {
            setIsRunning(false);
            return 0;
          }
          return currentValue - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, activeEntry?.isPomodoro]);

  // Authoritative timer synchronization from active entry timestamps.
  // Uses the same source of truth as Time Entries duration (startTime + now).
  // Pomodoro entries keep running past their target duration until the user
  // takes a manual action (stop, switch activity/task, start a break). Reaching
  // the target only fires a one-time notification and starts counting overtime.
  useEffect(() => {
    if (!activeEntry) return;

    const syncFromActiveEntry = () => {
      const activityName = activeEntry.activity?.name?.trim().toLowerCase();
      const activeActivityFromList = activeEntry.activity
        ? activities.find(a => a._id === activeEntry.activity!._id)
        : null;
      const isBreakActivity = activityName
        ? activityName === 'break time'
        : !!activeActivityFromList?.name && activeActivityFromList.name.trim().toLowerCase() === 'break time';

      const currentDuration = isBreakActivity ? POMODORO_SETTINGS.BREAK_DURATION : POMODORO_SETTINGS.WORK_DURATION;
      const startTime = new Date(activeEntry.startTime).getTime();
      const now = Date.now();
      const elapsedSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
      const totalSeconds = currentDuration * 60;
      const remaining = totalSeconds - elapsedSeconds;

      setIsBreak(isBreakActivity);
      setDuration(currentDuration);

      if (activeEntry.isPomodoro) {
        if (remaining > 0) {
          setTimeLeft(remaining);
          setOvertimeSeconds(0);
        } else {
          // Target reached: do NOT stop. Keep tracking, count overtime and
          // notify the user a single time that the target has been reached.
          setTimeLeft(0);
          setOvertimeSeconds(-remaining);
          const completionKey = `${activeEntry._id}:${activeEntry.startTime}`;
          if (!hasCompletionBeenNotified(completionKey)) {
            markCompletionAsNotified(completionKey);
            handleTimerComplete();
          }
        }
        // Remains running until the user performs a manual action.
        setIsRunning(true);
      } else {
        setTimeLeft(Math.max(0, remaining));
        setOvertimeSeconds(0);
        setIsRunning(false);
      }
    };

    syncFromActiveEntry();
    const syncInterval = window.setInterval(syncFromActiveEntry, 1000);
    return () => clearInterval(syncInterval);
  }, [
    activeEntry?._id,
    activeEntry?.startTime,
    activeEntry?.activity?._id,
    activeEntry?.activity?.name,
    activeEntry?.isPomodoro,
    activities,
  ]);

  // Sync with active entry and handle timer state
  useEffect(() => {
    const hasInFlightMutation =
      startTimerMutation.isPending ||
      startTaskMutation.isPending ||
      switchActivityMutation.isPending ||
      switchTaskMutation.isPending ||
      stopTimerMutation.isPending;
    // Treat the period between mutation completion and query refetch as transitional
    const isTransitioning = hasInFlightMutation || isActiveEntryFetching;

    if (!activeEntry) {
      // Only stop local counter when there is truly no active entry and no transition in flight
      if (isRunning && !isTransitioning) {
        setIsRunning(false);
      }
      return;
    }

    // Sync selection with the active entry
    if (activeEntry.activity) {
      if (activeEntry.activity._id !== selectedItem || selectedType !== 'activity') {
        setSelectedItem(activeEntry.activity._id);
        setSelectedType('activity');
      }
    } else if (activeEntry.task) {
      if (activeEntry.task._id !== selectedItem || selectedType !== 'task') {
        setSelectedItem(activeEntry.task._id);
        setSelectedType('task');
      }
    }

    // Keep mode metadata in sync for non-pomodoro active entries.
    if (!activeEntry.isPomodoro) {
      const activeActivityFromList = activeEntry.activity
        ? activities.find(a => a._id === activeEntry.activity!._id)
        : null;
      const isBreakActivity = !!activeActivityFromList &&
        activeActivityFromList.name &&
        activeActivityFromList.name.trim().toLowerCase() === 'break time';
      setIsBreak(!!isBreakActivity);
      setDuration(isBreakActivity ? POMODORO_SETTINGS.BREAK_DURATION : POMODORO_SETTINGS.WORK_DURATION);
      if (isRunning && !isTransitioning) {
        setIsRunning(false);
      }
    }
  }, [
    activeEntry?.activity?._id,
    activeEntry?.task?._id,
    activeEntry?.isPomodoro,
    activities,
    isRunning,
    isActiveEntryFetching,
    startTimerMutation.isPending,
    startTaskMutation.isPending,
    switchActivityMutation.isPending,
    switchTaskMutation.isPending,
    stopTimerMutation.isPending,
  ]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  const isWorkCategoryName = (categoryName?: string) =>
    (categoryName || '').trim().toLowerCase() === 'work';
  const isPomodoroEligibleSelection = (
    type: 'activity' | 'task',
    id: string,
    breakMode: boolean
  ) => {
    if (breakMode) return true;
    if (type === 'activity') {
      const selectedActivity = activities.find((activity) => activity._id === id);
      const isBreakActivity =
        (selectedActivity?.name || '').trim().toLowerCase() === 'break time';
      if (isBreakActivity) return true;
      if (!selectedActivity) return true;
      return isWorkCategoryName(selectedActivity?.category?.name);
    }
    return true;
  };

  const handleStart = () => {
    if (!selectedItem) return;
    
    // Use fixed Pomodoro durations, not activity/task durations
    const currentDuration = isBreak ? POMODORO_SETTINGS.BREAK_DURATION : POMODORO_SETTINGS.WORK_DURATION;
    const shouldUsePomodoro = isPomodoroEligibleSelection(selectedType, selectedItem, isBreak);
    
    setDuration(currentDuration);
    setTimeLeft(currentDuration * 60);
    setOvertimeSeconds(0);
    setIsRunning(shouldUsePomodoro);

    if (selectedType === 'activity') {
      startTimerMutation.mutate({
        activity: selectedItem,
        isPomodoro: shouldUsePomodoro,
        isBreak: isBreak || undefined,
        notes: notes || undefined,
        localDate: dayjs().format('YYYY-MM-DD'),
      });
    } else {
      startTaskMutation.mutate({
        task: selectedItem,
        isPomodoro: shouldUsePomodoro,
        notes: notes || undefined,
        localDate: dayjs().format('YYYY-MM-DD'),
      });
    }
  };

  const handleStop = () => {
    if (activeEntry) {
      stopTimerMutation.mutate({ id: activeEntry._id, notes });
    }
    setIsRunning(false);
  };

  const handleReset = () => {
    const currentDuration = isBreak ? POMODORO_SETTINGS.BREAK_DURATION : POMODORO_SETTINGS.WORK_DURATION;
    setDuration(currentDuration);
    setTimeLeft(currentDuration * 60);
    setOvertimeSeconds(0);
    setIsRunning(false);
  };

  const handleSwitchMode = async () => {
    const newIsBreak = !isBreak;
    setIsBreak(newIsBreak);

    const newDuration = newIsBreak ? POMODORO_SETTINGS.BREAK_DURATION : POMODORO_SETTINGS.WORK_DURATION;
    setDuration(newDuration);

    if (!isRunning) {
      setTimeLeft(newDuration * 60);
    }

    // If switching into Break Mode, auto-select the "Break Time" activity and start tracking
    if (newIsBreak) {
      const breakActivity = activities.find(a => a.name && a.name.trim().toLowerCase() === 'break time');
      if (breakActivity) {
        setSelectedType('activity');
        setSelectedItem(breakActivity._id);
        if (activeEntry) {
          try {
            await stopTimerMutation.mutateAsync({
              id: activeEntry._id,
              notes: 'Switched to break mode',
              keepTimerRunning: true,
            });
          } catch {
            return;
          }
        }

        setTimeLeft(POMODORO_SETTINGS.BREAK_DURATION * 60);
        setIsRunning(true);
        try {
          await startTimerMutation.mutateAsync({
            activity: breakActivity._id,
            isPomodoro: true,
            isBreak: true,
            notes: notes || undefined,
            localDate: dayjs().format('YYYY-MM-DD'),
          });
        } catch {
          setIsRunning(false);
        }
      }
    }
  };

  const handleItemChange = async (value: string) => {
    const [type, id] = value.split(':') as ['activity' | 'task', string];
    const shouldUsePomodoro = isPomodoroEligibleSelection(type, id, isBreak);

    // If there is an active entry, selecting a different item must stop it and
    // start the new one — regardless of whether it was a Pomodoro (running) or a
    // plain tracked entry (isRunning === false). Otherwise the active-entry sync
    // would just revert the selection back.
    if (activeEntry && (id !== selectedItem || type !== selectedType)) {
      // Stop current time entry and start new one without losing tracking
      try {
        // First stop the current time entry (but keep timer running)
        await stopTimerMutation.mutateAsync({
          id: activeEntry._id,
          notes: `Switched during Pomodoro session`,
          keepTimerRunning: true
        });
        
        // Then start a new time entry with the new activity/task
        if (type === 'activity') {
          await startTimerMutation.mutateAsync({
            activity: id,
            isPomodoro: shouldUsePomodoro,
            isBreak: isBreak || undefined,
            notes: notes || undefined,
            localDate: dayjs().format('YYYY-MM-DD'),
          });
        } else {
          await startTaskMutation.mutateAsync({
            task: id,
            isPomodoro: shouldUsePomodoro,
            notes: notes || undefined,
            localDate: dayjs().format('YYYY-MM-DD'),
          });
        }
        
        setSelectedItem(id);
        setSelectedType(type);
        // Keep the timer running and don't reset timeLeft
        setIsRunning(shouldUsePomodoro);
      } catch (error) {
        console.error('Error switching item:', error);
      }
    } else {
      // Just update selection if not running
      setSelectedItem(id);
      setSelectedType(type);
    }
  };

  const isOvertime = overtimeSeconds > 0;
  const progress = Math.min(100, ((duration * 60 - timeLeft) / (duration * 60)) * 100);
  const isBreakCycleActive = isRunning && isBreak;
  const breakActivity = activities.find(
    a => a.name && a.name.trim().toLowerCase() === 'break time'
  );
  const selectableActivities = activities.filter(
    a => !(a.name && a.name.trim().toLowerCase() === 'break time')
  );
  
  const selectedItemData = selectedType === 'activity' 
    ? activities.find(a => a._id === selectedItem)
    : backlogTasks.find(t => t._id === selectedItem);
  
  const selectedItemName = selectedItemData 
    ? (selectedType === 'activity' 
        ? (selectedItemData as Activity).name 
        : (selectedItemData as Task).title)
    : 'Select an item';

  return (
    <Card sx={{ width: '100%', height: compact ? '100%' : 'auto' }}>
      <CardContent sx={{ height: compact ? '100%' : 'auto', overflowY: compact ? 'auto' : 'visible', py: compact ? 1.5 : 2 }}>
        <Typography variant={compact ? 'h6' : 'h5'} component="h2" gutterBottom textAlign="center">
          Pomodoro Timer
        </Typography>
        
        <Box sx={{ textAlign: 'center', my: compact ? 1.25 : 3 }}>
          <Typography 
            variant="h6" 
            sx={{ 
              mb: 1,
              color: isBreak ? 'success.main' : 'primary.main',
              fontWeight: 'bold'
            }}
          >
            {isBreak ? '☕ Break Time' : '🍅 Work Time'}
          </Typography>
          
          <Typography
            variant={compact ? 'h4' : 'h3'}
            sx={{ fontFamily: 'monospace', fontWeight: 'bold', color: isOvertime ? 'warning.main' : undefined }}
          >
            {isOvertime ? `+${formatTime(overtimeSeconds)}` : formatTime(timeLeft)}
          </Typography>

          {isOvertime && (
            <Typography variant="body2" sx={{ mt: 0.5, color: 'warning.main', fontWeight: 600 }}>
              ⏱️ Target reached — still running until you stop, switch or take a break
            </Typography>
          )}

          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ mt: 2, height: 8, borderRadius: 4 }}
            color={isOvertime ? 'warning' : (isBreak ? 'success' : 'primary')}
          />

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {selectedItemData ? `${selectedItemName} - ${duration} min` : 'Select an activity or task'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 600 }}>
            🔁 Pomodoro Cycles: {pomodoroSessionStats.cycleCount} · ⏱️ Session: {pomodoroSessionStats.totalSessionMinutes} min
          </Typography>
        </Box>

        <Stack spacing={compact ? 1.25 : 2}>
          <FormControl fullWidth>
            <InputLabel>Activity or Task</InputLabel>
            <Select
              value={selectedItem ? (selectedType === 'activity' ? `activity:${selectedItem}` : `task:${selectedItem}`) : ''}
              label="Activity or Task"
              onChange={(e) => handleItemChange(e.target.value)}
              disabled={switchActivityMutation.isPending || switchTaskMutation.isPending}
            >
              {/* Activities Section */}
              <MenuItem disabled sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                📋 Activities (Repetitive)
              </MenuItem>
              {selectableActivities.map((activity) => (
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
                    {activity.name} ({activity.estimatedDuration}min)
                  </Box>
                </MenuItem>
              ))}
              {breakActivity && selectedType === 'activity' && selectedItem === breakActivity._id && (
                <MenuItem value={`activity:${breakActivity._id}`} sx={{ display: 'none' }}>
                  {breakActivity.name}
                </MenuItem>
              )}
              
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
                    {task.title} ({task.estimatedTime}min)
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
            {!isRunning ? (
              <>
                {activeEntry ? (
                  <Button
                    variant="contained"
                    startIcon={<StopIcon />}
                    onClick={handleStop}
                    disabled={stopTimerMutation.isPending}
                    size={compact ? 'medium' : 'large'}
                    color="secondary"
                  >
                    Stop Task
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<PlayIcon />}
                    onClick={handleStart}
                    disabled={!selectedItem || startTimerMutation.isPending || startTaskMutation.isPending}
                    size={compact ? 'medium' : 'large'}
                    color={isBreak ? 'success' : 'primary'}
                  >
                    Start {isBreak ? 'Break' : (selectedType === 'task' ? 'Task' : 'Activity')}
                  </Button>
                )}
                <Button
                  variant={isBreak ? 'outlined' : 'contained'}
                  onClick={handleSwitchMode}
                  disabled={isBreakCycleActive}
                  size={compact ? 'medium' : 'large'}
                  color={isBreak ? 'success' : 'primary'}
                >
                  {isBreak ? '🍅 Work Mode' : '☕ Break Mode'}
                </Button>
                {/* Show Reset button when there's an active entry or when timer has been used */}
                {(activeEntry || timeLeft !== (isBreak ? POMODORO_SETTINGS.BREAK_DURATION : POMODORO_SETTINGS.WORK_DURATION) * 60) && (
                  <Button
                    variant="outlined"
                    startIcon={<ResetIcon />}
                    onClick={handleReset}
                    size={compact ? 'medium' : 'large'}
                    color="primary"
                  >
                    Reset
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  variant="contained"
                  startIcon={<StopIcon />}
                  onClick={handleStop}
                  disabled={stopTimerMutation.isPending}
                  size={compact ? 'medium' : 'large'}
                  color="secondary"
                >
                  Stop Task
                </Button>
                <Button
                  variant={isBreak ? 'outlined' : 'contained'}
                  onClick={handleSwitchMode}
                  disabled={isBreakCycleActive}
                  size={compact ? 'medium' : 'large'}
                  color={isBreak ? 'success' : 'primary'}
                >
                  {isBreak ? '🍅 Work Mode' : '☕ Break Mode'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<ResetIcon />}
                  onClick={handleReset}
                  size={compact ? 'medium' : 'large'}
                >
                  Reset
                </Button>
              </>
            )}
          </Box>

          {activeEntry && (
            <Typography variant="body2" color="success.main" textAlign="center">
              Timer started at {new Date(activeEntry.startTime).toLocaleTimeString()}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
