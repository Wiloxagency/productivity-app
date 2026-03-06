import React, { useState, useEffect, useRef } from 'react';
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
  const [isRunning, setIsRunning] = useState(false);
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

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry'],
    queryFn: timeEntriesApi.getActive,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const startTimerMutation = useMutation({
    mutationFn: (data: { activity: string; isPomodoro: boolean; isBreak?: boolean; notes?: string; localDate?: string }) =>
      timeEntriesApi.start(data),
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

  // Timer countdown effect - using refs to avoid circular dependencies
  useEffect(() => {
    // Clear any existing interval before starting a new one to avoid duplicates
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setTimeLeft((currentTime) => {
          if (currentTime <= 1) {
            // Timer completed, stop it and clear interval in cleanup below
            setIsRunning(false);
            return 0;
          }
          return currentTime - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  // Periodic sync with server to prevent drift and handle state changes
  useEffect(() => {
    if (isRunning && activeEntry && activeEntry.isPomodoro) {
      const syncInterval = setInterval(() => {
        // Recalculate the time left based on server data
        const activeActivityFromList = activeEntry.activity
          ? activities.find(a => a._id === activeEntry.activity!._id)
          : null;
        const isBreakActivity = !!activeActivityFromList && 
          activeActivityFromList.name && 
          activeActivityFromList.name.trim().toLowerCase() === 'break time';
        
        const currentDuration = isBreakActivity ? POMODORO_SETTINGS.BREAK_DURATION : POMODORO_SETTINGS.WORK_DURATION;
        const startTime = new Date(activeEntry.startTime).getTime();
        const now = new Date().getTime();
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        const totalSeconds = currentDuration * 60;
        const remaining = Math.max(0, totalSeconds - elapsedSeconds);
        
        // Update timeLeft to sync with server time
        setTimeLeft(remaining);
        
        // If time is up, stop the timer
        if (remaining === 0) {
          setIsRunning(false);
        }
      }, 30000); // Sync every 30 seconds
      
      return () => clearInterval(syncInterval);
    }
  }, [isRunning, activeEntry, activities]);

  // Handle timer completion when timeLeft reaches 0
  useEffect(() => {
    if (timeLeft !== 0 || isRunning) return;
    if (!activeEntry || !activeEntry.isPomodoro) return;

    const completionKey = `${activeEntry._id}:${activeEntry.startTime}`;
    if (hasCompletionBeenNotified(completionKey)) return;
    markCompletionAsNotified(completionKey);

    // Trigger notifications and completion handler
    handleTimerComplete();

    // Stop the time entry ONLY if the current selected activity is "Break Time"
    if (selectedType === 'activity') {
      const currentActivity = activities.find(a => a._id === selectedItem);
      const isBreakActivitySelected = !!currentActivity && 
        currentActivity.name && 
        currentActivity.name.trim().toLowerCase() === 'break time';
      
      if (isBreakActivitySelected) {
        stopTimerMutation.mutate({ 
          id: activeEntry._id, 
          notes: notes || 'Break completed',
          keepTimerRunning: true 
        });
      }
    }
  }, [timeLeft, isRunning, activeEntry, selectedType, selectedItem, activities]);

  // Sync with active entry and handle timer state
  useEffect(() => {
    if (!activeEntry) {
      // No active entry, reset timer state if not already running
      if (isRunning) {
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

    // Detect if the active entry corresponds to the "Break Time" activity
    const activeActivityFromList = activeEntry.activity
      ? activities.find(a => a._id === activeEntry.activity!._id)
      : null;
    const isBreakActivity = !!activeActivityFromList && 
      activeActivityFromList.name && 
      activeActivityFromList.name.trim().toLowerCase() === 'break time';

    // Reflect break/work mode in UI based on the active entry
    setIsBreak(!!isBreakActivity);

    // Use fixed Pomodoro durations
    const currentDuration = isBreakActivity ? POMODORO_SETTINGS.BREAK_DURATION : POMODORO_SETTINGS.WORK_DURATION;
    
    // Update duration state
    setDuration(currentDuration);
    
    // Only sync timer state if this is a fresh pomodoro start (not a switch during running timer)
    // We detect a switch by checking if the timer is already running with significant time left
    const isTimerSwitchDuringRun = isRunning && timeLeft > 10; // More than 10 seconds left
    
    if (!isTimerSwitchDuringRun) {
      // This is a fresh start or timer completion, calculate time based on entry start time
      const startTime = new Date(activeEntry.startTime).getTime();
      const now = new Date().getTime();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const totalSeconds = currentDuration * 60;
      const remaining = Math.max(0, totalSeconds - elapsedSeconds);
      
      // For Pomodoro entries, set timer as running if there's still time left
      if (activeEntry.isPomodoro && remaining > 0) {
        setTimeLeft(remaining);
        if (!isRunning) {
          setIsRunning(true);
        }
      } else if (activeEntry.isPomodoro && remaining === 0) {
        // Timer completed, stop it
        setTimeLeft(0);
        if (isRunning) {
          setIsRunning(false);
        }
      } else {
        // Not a pomodoro entry or no time left
        setTimeLeft(remaining);
        if (isRunning) {
          setIsRunning(false);
        }
      }
    }
    // If this is a switch during running timer, don't modify timeLeft - let it continue counting down
  }, [activeEntry?.activity?._id, activeEntry?.task?._id, activeEntry?.startTime, activeEntry?.isPomodoro, activities]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startTaskMutation = useMutation({
    mutationFn: (data: { task: string; isPomodoro?: boolean; notes?: string; localDate?: string }) =>
      timeEntriesApi.startWithTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });

  const handleStart = () => {
    if (!selectedItem) return;
    
    // Use fixed Pomodoro durations, not activity/task durations
    const currentDuration = isBreak ? POMODORO_SETTINGS.BREAK_DURATION : POMODORO_SETTINGS.WORK_DURATION;
    
    setDuration(currentDuration);
    setTimeLeft(currentDuration * 60);
    setIsRunning(true);
    
    if (selectedType === 'activity') {
      startTimerMutation.mutate({
        activity: selectedItem,
        isPomodoro: true,
        isBreak: isBreak,
        notes: notes || undefined,
        localDate: dayjs().format('YYYY-MM-DD'),
      });
    } else {
      startTaskMutation.mutate({
        task: selectedItem,
        isPomodoro: true,
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

  const handleStopTask = () => {
    if (!activeEntry) return;
    stopTimerMutation.mutate({ id: activeEntry._id, notes: notes || 'Task stopped manually' });
    setIsRunning(false);
  };

  const handleReset = () => {
    const currentDuration = isBreak ? POMODORO_SETTINGS.BREAK_DURATION : POMODORO_SETTINGS.WORK_DURATION;
    setDuration(currentDuration);
    setTimeLeft(currentDuration * 60);
    setIsRunning(false);
  };

  const handleSwitchMode = () => {
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

        if (!isRunning) {
          // Start break tracking immediately
          setIsRunning(true);
          startTimerMutation.mutate({
            activity: breakActivity._id,
            isPomodoro: true,
            isBreak: true,
            notes: notes || undefined,
            localDate: dayjs().format('YYYY-MM-DD'),
          });
        }
      }
    }
  };

  const handleItemChange = async (value: string) => {
    const [type, id] = value.split(':') as ['activity' | 'task', string];
    
    if (isRunning && activeEntry && (id !== selectedItem || type !== selectedType)) {
      // Stop current time entry and start new one during running timer
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
            isPomodoro: true,
            isBreak: isBreak,
            notes: notes || undefined,
            localDate: dayjs().format('YYYY-MM-DD'),
          });
        } else {
          await startTaskMutation.mutateAsync({
            task: id,
            isPomodoro: true,
            notes: notes || undefined,
            localDate: dayjs().format('YYYY-MM-DD'),
          });
        }
        
        setSelectedItem(id);
        setSelectedType(type);
        // Keep the timer running and don't reset timeLeft
        setIsRunning(true);
      } catch (error) {
        console.error('Error switching item:', error);
      }
    } else {
      // Just update selection if not running
      setSelectedItem(id);
      setSelectedType(type);
    }
  };

  const progress = ((duration * 60 - timeLeft) / (duration * 60)) * 100;
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
          
          <Typography variant={compact ? 'h4' : 'h3'} sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
            {formatTime(timeLeft)}
          </Typography>
          
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ mt: 2, height: 8, borderRadius: 4 }}
            color={timeLeft === 0 ? 'success' : (isBreak ? 'success' : 'primary')}
          />
          
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {selectedItemData ? `${selectedItemName} - ${duration} min` : 'Select an activity or task'}
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
                <Button
                  variant={isBreak ? 'outlined' : 'contained'}
                  onClick={handleSwitchMode}
                  disabled={isRunning}
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
                  Stop
                </Button>
                <Button
                  variant={isBreak ? 'outlined' : 'contained'}
                  onClick={handleSwitchMode}
                  disabled={isRunning}
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
            {activeEntry && (
              <Button
                variant="outlined"
                startIcon={<StopIcon />}
                onClick={handleStopTask}
                disabled={stopTimerMutation.isPending}
                size={compact ? 'medium' : 'large'}
                color="error"
              >
                Stop Task
              </Button>
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
