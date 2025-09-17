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
  TextField,
  Chip,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Alert,
  MenuItem,
  IconButton,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Work as WorkIcon,
  Edit as EditIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import dayjs, { Dayjs } from 'dayjs';
import type { DailyPlanning } from '../types';

interface TimeBlockerProps {
  open: boolean;
  onClose: () => void;
  date: string;
  existingPlanning?: DailyPlanning;
}

export default function TimeBlocker({
  open,
  onClose,
  date,
  existingPlanning,
}: TimeBlockerProps) {
  const [timeBlocks, setTimeBlocks] = useState([
    { id: 1, name: 'Morning Focus Block', startTime: dayjs().hour(9).minute(0), endTime: dayjs().hour(11).minute(0) },
    { id: 2, name: 'Afternoon Work Block', startTime: dayjs().hour(14).minute(0), endTime: dayjs().hour(16).minute(0) },
  ]);

  const formatTimeSlot = (time: dayjs.Dayjs): string => {
    return time.format('HH:mm');
  };

  const getDuration = (start: dayjs.Dayjs, end: dayjs.Dayjs): string => {
    const minutes = end.diff(start, 'minute');
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const generateTimeSlots = () => {
    const slots = [];
    const startHour = 6; // 6 AM
    const endHour = 22; // 10 PM
    
    for (let hour = startHour; hour <= endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = dayjs().hour(hour).minute(minute);
        slots.push({
          time,
          label: time.format('HH:mm'),
          busy: false, // We can check against scheduled tasks here
        });
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Check if a time slot conflicts with scheduled tasks
  const isTimeSlotBusy = (time: dayjs.Dayjs): boolean => {
    if (!existingPlanning?.plannedTasks) return false;
    
    return existingPlanning.plannedTasks.some(plannedTask => {
      if (!plannedTask.plannedStartTime) return false;
      
      const taskStart = dayjs(plannedTask.plannedStartTime);
      const taskEnd = taskStart.add(plannedTask.plannedDuration || 30, 'minute');
      
      return (time.isAfter(taskStart) || time.isSame(taskStart)) && time.isBefore(taskEnd);
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        🕒 Time Blocks for {dayjs(date).format('MMMM D, YYYY')}
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 3 }}>
          Create time blocks to structure your day. This helps you allocate focused time for different types of work.
        </Alert>

        <Grid container spacing={3}>
          {/* Left: Time Block Templates */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  📋 Time Block Templates
                </Typography>
                <List>
                  {timeBlocks.map((block) => (
                    <ListItem key={block.id} divider>
                      <ListItemText
                        primary={block.name}
                        secondary={`${formatTimeSlot(block.startTime)} - ${formatTimeSlot(block.endTime)} (${getDuration(block.startTime, block.endTime)})`}
                      />
                      <Box>
                        <IconButton size="small">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </ListItem>
                  ))}
                </List>
                <Button
                  startIcon={<AddIcon />}
                  sx={{ mt: 1 }}
                  size="small"
                >
                  Add Custom Block
                </Button>
              </CardContent>
            </Card>
          </Grid>

          {/* Right: Daily Schedule View */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  📅 Daily Schedule
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Current scheduled tasks and availability
                </Typography>

                <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                  {timeSlots.filter((_, index) => index % 2 === 0).map((slot) => { // Show every hour
                    const isBusy = isTimeSlotBusy(slot.time);
                    const scheduledTask = existingPlanning?.plannedTasks?.find(pt => 
                      pt.plannedStartTime && 
                      dayjs(pt.plannedStartTime).format('HH:mm') === slot.time.format('HH:mm')
                    );

                    return (
                      <Box
                        key={slot.label}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          py: 1,
                          px: 2,
                          backgroundColor: isBusy ? 'action.hover' : 'transparent',
                          borderRadius: 1,
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ minWidth: 60, fontFamily: 'monospace' }}
                        >
                          {slot.label}
                        </Typography>
                        <Box sx={{ flex: 1, ml: 2 }}>
                          {scheduledTask ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  backgroundColor: scheduledTask.task.category.color,
                                }}
                              />
                              <Typography variant="body2">
                                {scheduledTask.task.title}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                ({getDuration(dayjs(scheduledTask.plannedStartTime), 
                                  dayjs(scheduledTask.plannedStartTime).add(scheduledTask.plannedDuration || 30, 'minute'))})
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Available
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Schedule Summary */}
        {existingPlanning?.plannedTasks && existingPlanning.plannedTasks.length > 0 && (
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                📊 Schedule Summary
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Typography variant="body2" color="text.secondary">
                    Total Planned Tasks
                  </Typography>
                  <Typography variant="h6">
                    {existingPlanning.plannedTasks.length}
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="body2" color="text.secondary">
                    Total Planned Time
                  </Typography>
                  <Typography variant="h6">
                    {Math.round(existingPlanning.plannedTasks.reduce((sum, pt) => 
                      sum + (pt.plannedDuration || pt.task.estimatedTime), 0) / 60 * 10) / 10}h
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="body2" color="text.secondary">
                    Completed Tasks
                  </Typography>
                  <Typography variant="h6">
                    {existingPlanning.plannedTasks.filter(pt => pt.completed).length}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          startIcon={<TimelineIcon />}
          onClick={onClose}
        >
          Apply Time Blocks
        </Button>
      </DialogActions>
    </Dialog>
  );
}
