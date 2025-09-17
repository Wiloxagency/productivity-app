import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Box,
  Typography,
  Chip,
  Checkbox,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Divider,
  Alert,
  Tabs,
  Tab,
  Menu,
  MenuItem,
  DialogContentText,
  IconButton,
} from '@mui/material';
import {
  Schedule as ScheduleIcon,
  Task as TaskIcon,
  PlayCircle as ActivityIcon,
  Save as SaveIcon,
  Restore as LoadIcon,
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  Close as CancelIcon,
} from '@mui/icons-material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { planningApi, timeEntriesApi, defaultSelectionsApi } from '../services/api';
import type { Task, Activity, DailyPlanning } from '../types';
import { QuadrantColors } from '../types';

interface TaskSchedulerProps {
  open: boolean;
  onClose: () => void;
  date: string;
  availableTasks: Task[];
  availableActivities: Activity[];
  existingPlanning?: DailyPlanning;
}

export default function TaskScheduler({
  open,
  onClose,
  date,
  availableTasks,
  availableActivities,
  existingPlanning,
}: TaskSchedulerProps) {
  const [tabValue, setTabValue] = useState(0); // 0 = tasks, 1 = activities, 2 = scheduled items
  const [selectedItems, setSelectedItems] = useState<{
    [itemId: string]: {
      type: 'task' | 'activity';
      selected: boolean;
      plannedStartTime: dayjs.Dayjs | null;
      plannedDuration: number;
      priority: number;
    };
  }>({});
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [loadConfirmOpen, setLoadConfirmOpen] = useState(false);
  const [editingScheduledItems, setEditingScheduledItems] = useState<{
    [key: string]: {
      plannedStartTime: dayjs.Dayjs | null;
      plannedDuration: number;
      type: 'task' | 'activity';
      itemId: string;
    };
  }>({});

  const queryClient = useQueryClient();

  // Fetch default selection from database
  const { data: defaultSelection } = useQuery({
    queryKey: ['defaultSelection'],
    queryFn: defaultSelectionsApi.get,
  });

  // Fetch time entries for the selected date to calculate time already tracked
  const { data: timeEntries = [] } = useQuery({
    queryKey: ['timeEntries', date],
    queryFn: () => timeEntriesApi.getAll({ date }),
  });

  const updatePlanningMutation = useMutation({
    mutationFn: (planningData: any) =>
      planningApi.updatePlanning(date, planningData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyPlanning'] });
      queryClient.invalidateQueries({ queryKey: ['backlogTasks'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      onClose();
      setSelectedItems({});
    },
  });

  const saveDefaultMutation = useMutation({
    mutationFn: (payload: { selectedTasks: Array<{ task: string; plannedDuration: number }>; selectedActivities: Array<{ activity: string; plannedDuration: number }> }) =>
      defaultSelectionsApi.save(payload),
    onSuccess: () => {
      // Wait a bit before invalidating to ensure save is complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['defaultSelection'] });
      }, 100);
      setSaveConfirmOpen(false);
      setMenuAnchorEl(null);
      console.log('Default selection saved successfully');
    },
    onError: (error) => {
      console.error('Failed to save default selection:', error);
      setSaveConfirmOpen(false);
      setMenuAnchorEl(null);
    },
  });

  const deleteDefaultMutation = useMutation({
    mutationFn: defaultSelectionsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defaultSelection'] });
    },
  });

  const updateScheduledItemMutation = useMutation({
    mutationFn: ({
      itemKey,
      type,
      itemId,
      plannedStartTime,
      plannedDuration,
    }: {
      itemKey: string;
      type: 'task' | 'activity';
      itemId: string;
      plannedStartTime: string | null;
      plannedDuration: number;
    }) => {
      const updatedTasks = existingPlanning?.plannedTasks.map((task, index) => {
        const currentKey = `task-${index}`;
        if (currentKey === itemKey) {
          return {
            ...task,
            plannedStartTime,
            plannedDuration,
          };
        }
        return task;
      }) || [];

      const updatedActivities = existingPlanning?.plannedActivities.map((activity, index) => {
        const currentKey = `activity-${index}`;
        if (currentKey === itemKey) {
          return {
            ...activity,
            plannedStartTime,
            plannedDuration,
          };
        }
        return activity;
      }) || [];

      return planningApi.updatePlanning(date, {
        plannedTasks: updatedTasks,
        plannedActivities: updatedActivities,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyPlanning'] });
      queryClient.invalidateQueries({ queryKey: ['backlogTasks'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setEditingScheduledItems({});
    },
  });

  const deleteScheduledItemMutation = useMutation({
    mutationFn: ({ itemKey, type }: { itemKey: string; type: 'task' | 'activity' }) => {
      const updatedTasks = type === 'task'
        ? existingPlanning?.plannedTasks.filter((_, index) => `task-${index}` !== itemKey) || []
        : existingPlanning?.plannedTasks || [];

      const updatedActivities = type === 'activity'
        ? existingPlanning?.plannedActivities.filter((_, index) => `activity-${index}` !== itemKey) || []
        : existingPlanning?.plannedActivities || [];

      return planningApi.updatePlanning(date, {
        plannedTasks: updatedTasks,
        plannedActivities: updatedActivities,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyPlanning'] });
      queryClient.invalidateQueries({ queryKey: ['backlogTasks'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setEditingScheduledItems({});
    },
  });

  const handleItemToggle = (itemId: string, item: Task | Activity, type: 'task' | 'activity') => {
    const estimatedDuration = type === 'task' 
      ? (item as Task).estimatedTime 
      : (item as Activity).estimatedDuration;

    setSelectedItems(prev => ({
      ...prev,
      [itemId]: {
        type,
        selected: !prev[itemId]?.selected,
        plannedStartTime: prev[itemId]?.plannedStartTime || null,
        plannedDuration: prev[itemId]?.plannedDuration || estimatedDuration,
        priority: prev[itemId]?.priority || Object.keys(prev).filter(id => prev[id].selected).length + 1,
      },
    }));
  };

  const handleTimeChange = (itemId: string, time: dayjs.Dayjs | null) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        plannedStartTime: time,
      },
    }));
  };

  const handleDurationChange = (itemId: string, duration: number) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        plannedDuration: duration,
      },
    }));
  };

  const handleSubmit = () => {
    // Separate selected items into tasks and activities
    const tasksToSchedule = Object.entries(selectedItems)
      .filter(([_, data]) => data.selected && data.type === 'task')
      .map(([taskId, data]) => ({
        task: taskId,
        plannedStartTime: data.plannedStartTime?.toISOString(),
        plannedDuration: data.plannedDuration,
        priority: data.priority,
        completed: false,
      }));

    const activitiesToSchedule = Object.entries(selectedItems)
      .filter(([_, data]) => data.selected && data.type === 'activity')
      .map(([activityId, data]) => ({
        activity: activityId,
        plannedStartTime: data.plannedStartTime?.toISOString(),
        plannedDuration: data.plannedDuration,
        priority: data.priority,
        completed: false,
      }));

    const updatedPlannedTasks = [
      ...(existingPlanning?.plannedTasks || []),
      ...tasksToSchedule,
    ];

    const updatedPlannedActivities = [
      ...(existingPlanning?.plannedActivities || []),
      ...activitiesToSchedule,
    ];

    updatePlanningMutation.mutate({
      plannedTasks: updatedPlannedTasks,
      plannedActivities: updatedPlannedActivities,
    });
  };

  const handleSaveDefault = () => {
    const selectedTasks = Object.entries(selectedItems)
      .filter(([_, data]) => data.selected && data.type === 'task')
      .map(([itemId, data]) => ({ task: itemId, plannedDuration: data.plannedDuration }));

    const selectedActivities = Object.entries(selectedItems)
      .filter(([_, data]) => data.selected && data.type === 'activity')
      .map(([itemId, data]) => ({ activity: itemId, plannedDuration: data.plannedDuration }));

    saveDefaultMutation.mutate({ selectedTasks, selectedActivities });
  };

  const handleLoadDefault = async () => {
    // First, refresh the default selection query to get the latest data
    await queryClient.refetchQueries({ queryKey: ['defaultSelection'] });
    
    // Get the refreshed data
    const latestDefaultSelection = queryClient.getQueryData(['defaultSelection']) as typeof defaultSelection;
    
    const newSelectedItems: typeof selectedItems = {};
    let priority = 1;

    // Prefer server-saved default selection if available
    // Build from tasks
    if (latestDefaultSelection?.tasks?.length || latestDefaultSelection?.activities?.length) {
      console.log('Found saved defaults:', latestDefaultSelection);

      // Tasks
      (latestDefaultSelection.tasks || []).forEach((entry) => {
        const taskObj = entry.task;
        const itemId: string = typeof taskObj === 'string' ? taskObj : taskObj?._id;
        if (!itemId) return;
        const exists = availableTasks.some(t => t._id === itemId);
        if (!exists) {
          console.warn(`Task ${itemId} not in available tasks`);
          return;
        }
        const estimated = availableTasks.find(t => t._id === itemId)?.estimatedTime || entry.plannedDuration || 0;
        newSelectedItems[itemId] = {
          type: 'task',
          selected: true,
          plannedStartTime: null,
          plannedDuration: entry.plannedDuration || estimated,
          priority: priority++,
        };
      });

      // Activities
      (latestDefaultSelection.activities || []).forEach((entry) => {
        const activityObj = entry.activity;
        const itemId: string = typeof activityObj === 'string' ? activityObj : activityObj?._id;
        if (!itemId) return;
        const exists = availableActivities.some(a => a._id === itemId);
        if (!exists) {
          console.warn(`Activity ${itemId} not in available activities`);
          return;
        }
        const estimated = availableActivities.find(a => a._id === itemId)?.estimatedDuration || entry.plannedDuration || 0;
        newSelectedItems[itemId] = {
          type: 'activity',
          selected: true,
          plannedStartTime: null,
          plannedDuration: entry.plannedDuration || estimated,
          priority: priority++,
        };
      });
    } else {
      console.log('No saved defaults found, using fallback');
      
      // Fallback: use activities marked as isDefault when no saved defaults exist
      availableActivities
        .filter(a => a.isDefault)
        .forEach(a => {
          console.log(`Adding default activity ${a.name}`);
          newSelectedItems[a._id] = {
            type: 'activity',
            selected: true,
            plannedStartTime: null,
            plannedDuration: a.estimatedDuration,
            priority: priority++,
          };
        });
    }

    console.log('Final selected items to set:', newSelectedItems);
    console.log('Current selected items before update:', selectedItems);
    
    // Always set the selected items
    setSelectedItems(newSelectedItems);
    
    // Verify the state was set correctly
    setTimeout(() => {
      console.log('Selected items after state update should have completed:', newSelectedItems);
    }, 100);

    setLoadConfirmOpen(false);
    setMenuAnchorEl(null);
  };

  const hasDefaultSelection = () => {
    // Check backend-saved defaults
    const hasTasks = (defaultSelection?.tasks || []).some(entry => {
      const id = typeof entry.task === 'string' ? entry.task : entry.task?._id;
      return id && availableTasks.some(t => t._id === id);
    });
    const hasActivities = (defaultSelection?.activities || []).some(entry => {
      const id = typeof entry.activity === 'string' ? entry.activity : entry.activity?._id;
      return id && availableActivities.some(a => a._id === id);
    });
    if (hasTasks || hasActivities) return true;

    // Fallback: any activities flagged as default
    if (availableActivities.some(a => a.isDefault)) return true;

    return false;
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  // Handlers for scheduled items
  const handleEditScheduledItem = (itemKey: string, item: any, type: 'task' | 'activity') => {
    const itemId = type === 'task' ? item.task._id : item.activity._id;
    const plannedStartTime = item.plannedStartTime ? dayjs(item.plannedStartTime) : null;
    const plannedDuration = item.plannedDuration || 0;

    setEditingScheduledItems(prev => ({
      ...prev,
      [itemKey]: {
        plannedStartTime,
        plannedDuration,
        type,
        itemId,
      },
    }));
  };

  const handleScheduledTimeChange = (itemKey: string, time: dayjs.Dayjs | null) => {
    setEditingScheduledItems(prev => ({
      ...prev,
      [itemKey]: {
        ...prev[itemKey],
        plannedStartTime: time,
      },
    }));
  };

  const handleScheduledDurationChange = (itemKey: string, duration: number) => {
    setEditingScheduledItems(prev => ({
      ...prev,
      [itemKey]: {
        ...prev[itemKey],
        plannedDuration: duration,
      },
    }));
  };

  const handleSaveScheduledItem = (itemKey: string) => {
    const editData = editingScheduledItems[itemKey];
    if (!editData) return;

    updateScheduledItemMutation.mutate({
      itemKey,
      type: editData.type,
      itemId: editData.itemId,
      plannedStartTime: editData.plannedStartTime?.toISOString() || null,
      plannedDuration: editData.plannedDuration,
    });
  };

  const handleCancelEditScheduledItem = (itemKey: string) => {
    setEditingScheduledItems(prev => {
      const { [itemKey]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleDeleteScheduledItem = (itemKey: string, type: 'task' | 'activity') => {
    deleteScheduledItemMutation.mutate({ itemKey, type });
  };

  const selectedCount = Object.values(selectedItems).filter(data => data.selected).length;
  
  // Calculate total hours for selected items with work/non-work breakdown
  const { workMinutes, nonWorkMinutes, totalMinutes } = Object.entries(selectedItems)
    .filter(([_, data]) => data.selected)
    .reduce((acc, [itemId, data]) => {
      let duration = 0;
      let isWorkCategory = false;
      
      if (data.type === 'task') {
        const task = availableTasks.find(t => t._id === itemId);
        duration = data.plannedDuration || task?.estimatedTime || 0;
        isWorkCategory = task?.category.name === 'Work';
      } else {
        const activity = availableActivities.find(a => a._id === itemId);
        duration = data.plannedDuration || activity?.estimatedDuration || 0;
        isWorkCategory = activity?.category.name === 'Work';
      }
      
      return {
        workMinutes: acc.workMinutes + (isWorkCategory ? duration : 0),
        nonWorkMinutes: acc.nonWorkMinutes + (isWorkCategory ? 0 : duration),
        totalMinutes: acc.totalMinutes + duration,
      };
    }, { workMinutes: 0, nonWorkMinutes: 0, totalMinutes: 0 });
  
  const workTimeText = formatTime(workMinutes);
  const nonWorkTimeText = formatTime(nonWorkMinutes);
  const totalTimeText = formatTime(totalMinutes);
  
  // Calculate time already tracked for selected items today
  const trackedMinutes = Object.entries(selectedItems)
    .filter(([_, data]) => data.selected)
    .reduce((total, [itemId, data]) => {
      let trackedTime = 0;
      
      if (data.type === 'task') {
        // Find time entries for this task
        trackedTime = timeEntries
          .filter(entry => entry.task && entry.task._id === itemId)
          .reduce((sum, entry) => sum + (entry.duration || 0), 0);
      } else {
        // Find time entries for this activity
        trackedTime = timeEntries
          .filter(entry => entry.activity && entry.activity._id === itemId)
          .reduce((sum, entry) => sum + (entry.duration || 0), 0);
      }
      
      return total + trackedTime;
    }, 0);
  
  // Calculate Final Hour Estimated
  const currentTime = dayjs();
  const currentHour = currentTime.hour();
  const currentMinute = currentTime.minute();
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  
  // Calculate remaining time needed (planned time - already tracked time)
  const remainingMinutes = Math.max(0, totalMinutes - trackedMinutes);
  
  // Calculate final estimated completion time
  const finalEstimatedMinutes = currentTotalMinutes + remainingMinutes;
  const finalHour = Math.floor(finalEstimatedMinutes / 60) % 24;
  const finalMinute = finalEstimatedMinutes % 60;
  
  const finalHourText = `${finalHour.toString().padStart(2, '0')}:${finalMinute.toString().padStart(2, '0')}`;
  const trackedTimeText = formatTime(trackedMinutes);
  const remainingTimeText = formatTime(remainingMinutes);

  const renderScheduledItem = (item: any, type: 'task' | 'activity', index: number, totalItems: number) => {
    const itemKey = `${type}-${index}`;
    const content = type === 'task' ? item.task : item.activity;
    const isEditing = editingScheduledItems[itemKey];
    const editData = editingScheduledItems[itemKey];
    
    const title = type === 'task' ? content.title : content.name;
    const description = type === 'task' ? content.description : content.description;
    const estimatedDuration = type === 'task' ? content.estimatedTime : content.estimatedDuration;
    const plannedDuration = item.plannedDuration || estimatedDuration;
    const plannedStartTime = item.plannedStartTime ? dayjs(item.plannedStartTime).format('HH:mm') : 'Not set';
    
    return (
      <Box key={itemKey}>
        <ListItem disablePadding>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {type === 'task' ? <TaskIcon fontSize="small" /> : <ActivityIcon fontSize="small" />}
                  <Typography variant="body1" fontWeight="medium">
                    {title}
                  </Typography>
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
                  {item.completed && (
                    <Chip
                      label="Completed"
                      size="small"
                      color="success"
                      sx={{ fontSize: '0.7rem', height: '20px' }}
                    />
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {!isEditing ? (
                    <>
                      <IconButton
                        size="small"
                        onClick={() => handleEditScheduledItem(itemKey, item, type)}
                        disabled={updateScheduledItemMutation.isPending}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteScheduledItem(itemKey, type)}
                        disabled={deleteScheduledItemMutation.isPending}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleSaveScheduledItem(itemKey)}
                        disabled={updateScheduledItemMutation.isPending}
                      >
                        <CheckIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleCancelEditScheduledItem(itemKey)}
                      >
                        <CancelIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </Box>
              </Box>
            }
            secondary={
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {description}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    🕐 Start: {plannedStartTime}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    ⏱️ Duration: {formatTime(plannedDuration)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    📊 Priority: {item.priority}
                  </Typography>
                </Box>
              </Box>
            }
          />
        </ListItem>

        {isEditing && (
          <Box sx={{ pl: 6, pr: 2, pb: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TimePicker
                  label="Start Time"
                  value={editData?.plannedStartTime}
                  onChange={(time) => handleScheduledTimeChange(itemKey, time)}
                  slotProps={{
                    textField: {
                      size: 'small',
                      fullWidth: true,
                      helperText: 'Set the planned start time'
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Duration (minutes)"
                  type="number"
                  size="small"
                  fullWidth
                  value={editData?.plannedDuration || plannedDuration}
                  onChange={(e) => handleScheduledDurationChange(itemKey, Number(e.target.value))}
                  inputProps={{ min: 5, max: 480 }}
                  helperText={`Estimated: ${formatTime(estimatedDuration)}`}
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {index < totalItems - 1 && <Divider />}
      </Box>
    );
  };

  const renderItem = (item: Task | Activity, type: 'task' | 'activity', index: number, totalItems: number) => {
    const itemId = item._id;
    const isSelected = selectedItems[itemId]?.selected || false;
    const itemData = selectedItems[itemId];
    const estimatedDuration = type === 'task' 
      ? (item as Task).estimatedTime 
      : (item as Activity).estimatedDuration;
    const title = type === 'task' ? (item as Task).title : (item as Activity).name;
    const description = type === 'task' ? (item as Task).description : item.description;

    return (
      <Box key={itemId}>
        <ListItem disablePadding>
          <ListItemButton onClick={() => handleItemToggle(itemId, item, type)}>
            <ListItemIcon>
              <Checkbox
                checked={isSelected}
                tabIndex={-1}
                disableRipple
              />
            </ListItemIcon>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {type === 'task' ? <TaskIcon fontSize="small" /> : <ActivityIcon fontSize="small" />}
                  <Typography variant="body1" fontWeight="medium">
                    {title}
                  </Typography>
                  <Chip
                    label={`Q${item.quadrant}`}
                    size="small"
                    sx={{
                      backgroundColor: QuadrantColors[item.quadrant],
                      color: 'white',
                      fontSize: '0.7rem',
                      height: '20px',
                    }}
                  />
                  <Chip
                    label={item.category.name}
                    size="small"
                    variant="outlined"
                    sx={{
                      borderColor: item.category.color,
                      color: item.category.color,
                      fontSize: '0.7rem',
                      height: '20px',
                    }}
                  />
                </Box>
              }
              secondary={
                <Typography variant="body2" color="text.secondary">
                  Estimated: {formatTime(estimatedDuration)} • {description}
                </Typography>
              }
            />
          </ListItemButton>
        </ListItem>

        {isSelected && (
          <Box sx={{ pl: 6, pr: 2, pb: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TimePicker
                  label="Start Time (optional)"
                  value={itemData?.plannedStartTime}
                  onChange={(time) => handleTimeChange(itemId, time)}
                  slotProps={{
                    textField: {
                      size: 'small',
                      fullWidth: true,
                      helperText: 'Leave empty for flexible scheduling'
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Duration (minutes)"
                  type="number"
                  size="small"
                  fullWidth
                  value={itemData?.plannedDuration || estimatedDuration}
                  onChange={(e) => handleDurationChange(itemId, Number(e.target.value))}
                  inputProps={{ min: 5, max: 480 }}
                  helperText={`Default: ${formatTime(estimatedDuration)}`}
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {index < totalItems - 1 && <Divider />}
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        📅 Schedule Items for {dayjs(date).format('MMMM D, YYYY')}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', height: '70vh' }}>
        {/* Fixed Header Section */}
        <Box sx={{ 
          position: 'sticky', 
          top: 0, 
          backgroundColor: 'background.paper', 
          zIndex: 1, 
          pb: 2,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}>
          <Box sx={{ mb: 2 }}>
            <Alert severity="info">
              Select tasks and activities to schedule for this day. You can set specific start times and adjust durations.
            </Alert>
          </Box>

          {/* Scheduling Summary - Always Visible */}
          {selectedCount > 0 && (
            <Alert severity="success" sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2" fontWeight="medium">
                  📋 {selectedCount} item{selectedCount > 1 ? 's' : ''} selected for scheduling
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {workMinutes > 0 && (
                    <Typography variant="body2">
                      💼 Work Time: {workTimeText}
                    </Typography>
                  )}
                  {nonWorkMinutes > 0 && (
                    <Typography variant="body2">
                      🏠 Non-Work Time: {nonWorkTimeText}
                    </Typography>
                  )}
                  <Typography variant="body2" fontWeight="medium">
                    ⏱️ Total: {totalTimeText}
                  </Typography>
                  {trackedMinutes > 0 && (
                    <Typography variant="body2">
                      ✅ Already Tracked: {trackedTimeText}
                    </Typography>
                  )}
                  <Typography variant="body2">
                    ⏳ Remaining: {remainingTimeText}
                  </Typography>
                  <Typography variant="body2" fontWeight="medium" color="primary">
                    🎯 Final Hour Estimated: {finalHourText}
                  </Typography>
                </Box>
              </Box>
            </Alert>
          )}

          <Box sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
              <Tab 
                label={`Tasks (${availableTasks.length})`} 
                icon={<TaskIcon />}
                iconPosition="start"
              />
              <Tab 
                label={`Activities (${availableActivities.length})`} 
                icon={<ActivityIcon />}
                iconPosition="start"
              />
              <Tab 
                label={`Scheduled (${(existingPlanning?.plannedTasks.length || 0) + (existingPlanning?.plannedActivities.length || 0)})`} 
                icon={<ScheduleIcon />}
                iconPosition="start"
              />
            </Tabs>
            
            {/* Default Selection Controls */}
            <Box sx={{ display: 'flex', gap: 1, pr: 2 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SaveIcon />}
                onClick={() => setSaveConfirmOpen(true)}
                disabled={selectedCount === 0}
              >
                Save Default
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<LoadIcon />}
                onClick={() => setLoadConfirmOpen(true)}
                disabled={!hasDefaultSelection()}
              >
                Load Default
              </Button>
            </Box>
          </Box>
        </Box>

        {/* Scrollable Content Area */}
        <Box sx={{ flex: 1, overflow: 'auto', pt: 2 }}>

          {tabValue === 0 && (
            availableTasks.length === 0 ? (
              <Alert severity="warning">
                No tasks available to schedule. All backlog tasks are either already scheduled or completed.
              </Alert>
            ) : (
              <List>
                {availableTasks.map((task, index) => 
                  renderItem(task, 'task', index, availableTasks.length)
                )}
              </List>
            )
          )}

          {tabValue === 1 && (
            availableActivities.length === 0 ? (
              <Alert severity="warning">
                No activities available to schedule.
              </Alert>
            ) : (
              <List>
                {availableActivities.map((activity, index) => 
                  renderItem(activity, 'activity', index, availableActivities.length)
                )}
              </List>
            )
          )}

          {tabValue === 2 && (
            <Box>
              {(!existingPlanning?.plannedTasks?.length && !existingPlanning?.plannedActivities?.length) ? (
                <Alert severity="info">
                  No items scheduled for this day yet. Switch to the Tasks or Activities tabs to schedule new items.
                </Alert>
              ) : (
                <List>
                  {/* Render Scheduled Tasks */}
                  {existingPlanning?.plannedTasks?.map((plannedTask, index) =>
                    renderScheduledItem(plannedTask, 'task', index, (existingPlanning.plannedTasks?.length || 0) + (existingPlanning.plannedActivities?.length || 0))
                  )}
                  
                  {/* Render Scheduled Activities */}
                  {existingPlanning?.plannedActivities?.map((plannedActivity, index) =>
                    renderScheduledItem(plannedActivity, 'activity', index, (existingPlanning.plannedTasks?.length || 0) + (existingPlanning.plannedActivities?.length || 0))
                  )}
                </List>
              )}
            </Box>
          )}
        </Box>

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={selectedCount === 0 || updatePlanningMutation.isPending}
          startIcon={<ScheduleIcon />}
        >
          Schedule {selectedCount} Item{selectedCount > 1 ? 's' : ''}
        </Button>
      </DialogActions>

      {/* Save Default Confirmation Dialog */}
      <Dialog open={saveConfirmOpen} onClose={() => setSaveConfirmOpen(false)}>
        <DialogTitle>Save Default Selection</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Save your current selection ({selectedCount} items, {totalTimeText}) as the default? 
            This will overwrite any previously saved default selection.
          </DialogContentText>
          <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="body2" fontWeight="medium" gutterBottom>
              Current Selection Summary:
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {workMinutes > 0 && (
                <Typography variant="body2">
                  💼 Work Time: {workTimeText}
                </Typography>
              )}
              {nonWorkMinutes > 0 && (
                <Typography variant="body2">
                  🏠 Non-Work Time: {nonWorkTimeText}
                </Typography>
              )}
              <Typography variant="body2" fontWeight="medium">
                ⏱️ Total: {totalTimeText}
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveConfirmOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleSaveDefault}
            startIcon={<SaveIcon />}
          >
            Save as Default
          </Button>
        </DialogActions>
      </Dialog>

      {/* Load Default Confirmation Dialog */}
      <Dialog open={loadConfirmOpen} onClose={() => setLoadConfirmOpen(false)}>
        <DialogTitle>Load Default Selection</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Load your saved default selection? This will replace your current selection 
            {selectedCount > 0 && `(${selectedCount} items currently selected)`}.
          </DialogContentText>
          {selectedCount > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Your current selection will be lost. Make sure to save it first if you want to keep it.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoadConfirmOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleLoadDefault}
            startIcon={<LoadIcon />}
          >
            Load Default
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
