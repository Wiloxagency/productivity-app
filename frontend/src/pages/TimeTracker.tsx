import React, { useState, useEffect } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Stack,
  keyframes,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Stop as StopIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { timeEntriesApi, activitiesApi, tasksApi } from '../services/api';
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

export default function TimeTracker() {
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [entryToEdit, setEntryToEdit] = useState<any>(null);
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

  const queryClient = useQueryClient();

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

  const deleteEntryMutation = useMutation({
    mutationFn: timeEntriesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
      setDeleteConfirmOpen(false);
      setEntryToDelete(null);
    },
  });

  const stopTimerMutation = useMutation({
    mutationFn: (data: { id: string; notes?: string }) =>
      timeEntriesApi.stop(data.id, { notes: data.notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });

  const createManualEntryMutation = useMutation({
    mutationFn: async (data: any) => {
      // We'll need to create a custom endpoint for manual entries
      // For now, let's create it similar to start but with specific times
      const startDateTime = new Date(`${selectedDate.format('YYYY-MM-DD')}T${data.startTime}`);
      const endDateTime = new Date(`${selectedDate.format('YYYY-MM-DD')}T${data.endTime}`);
      
      const entryData: any = {
        startTime: startDateTime,
        endTime: endDateTime,
        notes: data.notes,
        isActive: false, // Manual entries are already completed
        date: new Date(selectedDate.format('YYYY-MM-DD')), // Use start of day for date field
      };
      
      if (data.type === 'activity') {
        entryData.activity = data.item;
      } else {
        entryData.task = data.item;
      }
      
      // Calculate duration in minutes
      const start = new Date(`${selectedDate.format('YYYY-MM-DD')}T${data.startTime}`);
      const end = new Date(`${selectedDate.format('YYYY-MM-DD')}T${data.endTime}`);
      entryData.duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      
      return timeEntriesApi.createManual(entryData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries', selectedDate.format('YYYY-MM-DD')] });
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
      setDialogOpen(false);
      setManualEntry({
        item: '',
        type: 'activity',
        startTime: '',
        endTime: '',
        notes: '',
      });
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

  const handleManualEntrySubmit = () => {
    if (!manualEntry.item || !manualEntry.startTime || !manualEntry.endTime) {
      return;
    }
    
    createManualEntryMutation.mutate(manualEntry);
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
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Time Tracker</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <DatePicker
            label="Select Date"
            value={selectedDate}
            onChange={(date) => setSelectedDate(date || dayjs())}
            format="MM/DD/YYYY"
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
          >
            Add Manual Entry
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Left Column: Pomodoro Timer */}
        <Grid item xs={12} md={6}>
          <PomodoroTimer />
        </Grid>

        {/* Right Column: Active Timer + Time Entries */}
        <Grid item xs={12} md={6}>
          <Stack spacing={3}>
            {activeEntry ? (
              <Card sx={{ backgroundColor: 'primary.light' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom color="primary.contrastText">
                    Active Timer
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        backgroundColor: activeEntry.activity?.color || activeEntry.task?.category?.color || '#2196f3',
                      }}
                    />
                    <Typography variant="body1" color="primary.contrastText">
                      {activeEntry.activity?.name || activeEntry.task?.title || 'Unknown'}
                    </Typography>
                    <Chip
                      label={QuadrantLabels[(activeEntry.activity?.quadrant || activeEntry.task?.quadrant || 1)]}
                      size="small"
                      sx={{ backgroundColor: QuadrantColors[(activeEntry.activity?.quadrant || activeEntry.task?.quadrant || 1)], color: 'white' }}
                    />
                  </Box>
                  <Typography variant="body2" color="primary.contrastText">
                    Started: {formatDateTime(activeEntry.startTime)}
                  </Typography>
                  <Typography variant="h6" color="primary.contrastText" sx={{ mt: 1 }}>
                    Duration: {formatTime(calculateCurrentDuration(activeEntry))}
                  </Typography>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<StopIcon />}
                    onClick={() => stopTimerMutation.mutate({ id: activeEntry._id })}
                    sx={{ mt: 2 }}
                    fullWidth
                  >
                    Stop Timer
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent>
                  <Typography variant="h6" color="text.secondary" textAlign="center">
                    No active timer
                  </Typography>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Start a pomodoro timer to begin tracking time
                  </Typography>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    Time Entries - {selectedDate.format('MMMM D, YYYY')}
                  </Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="h6" color="primary">
                      Total: {formatTime(totalTime)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Work: {formatTime(workTime)}
                    </Typography>
                  </Box>
                </Box>
                
                <TableContainer component={Paper} variant="outlined">
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
                      {timeEntries.length === 0 && (
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
          </Stack>
        </Grid>
      </Grid>

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
                    setManualEntry({ ...manualEntry, item: id, type });
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
                onChange={(e) => setManualEntry({ ...manualEntry, startTime: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="End Time"
                type="time"
                value={manualEntry.endTime}
                onChange={(e) => setManualEntry({ ...manualEntry, endTime: e.target.value })}
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
                onChange={(e) => setManualEntry({ ...manualEntry, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained"
            onClick={handleManualEntrySubmit}
            disabled={!manualEntry.item || !manualEntry.startTime || !manualEntry.endTime || createManualEntryMutation.isPending}
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
