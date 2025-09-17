import React from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
} from '@mui/material';
import { PlayArrow as PlayIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import PomodoroTimer from '../components/PomodoroTimer';
import { timeEntriesApi, tasksApi, planningApi } from '../services/api';
import { QuadrantColors, QuadrantLabels } from '../types';

export default function Dashboard() {
  const today = dayjs().format('YYYY-MM-DD');

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry'],
    queryFn: timeEntriesApi.getActive,
    staleTime: 10000,
    refetchOnWindowFocus: false,
  });

  const { data: dailySummary } = useQuery({
    queryKey: ['dailySummary', today],
    queryFn: () => timeEntriesApi.getDailySummary(today),
  });

  const { data: todaysTasks = [] } = useQuery({
    queryKey: ['dailyTasks', today],
    queryFn: () => tasksApi.getDaily(today),
  });

  const { data: backlogTasks = [] } = useQuery({
    queryKey: ['backlogTasks'],
    queryFn: () => tasksApi.getBacklog(),
  });

  const { data: todaysPlanning } = useQuery({
    queryKey: ['dailyPlanning', today],
    queryFn: () => planningApi.getPlanning(today),
  });

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const completedTasks = todaysTasks.filter(task => task.status === 'Completed');
  const productivityScore = todaysPlanning?.productivity.score || 0;

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" gutterBottom>
        Good {dayjs().hour() < 12 ? 'morning' : dayjs().hour() < 18 ? 'afternoon' : 'evening'}!
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        {dayjs().format('dddd, MMMM D, YYYY')}
      </Typography>

      <Grid container spacing={3}>
        {/* Pomodoro Timer */}
        <Grid item xs={12} md={6}>
          <PomodoroTimer />
        </Grid>

        {/* Today's Stats */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Today's Progress
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="primary">
                      {dailySummary?.totalTime ? formatTime(dailySummary.totalTime) : '0m'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Time
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="secondary">
                      {dailySummary?.pomodorosCompleted || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Pomodoros
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="success.main">
                      {completedTasks.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Tasks Done
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box textAlign="center">
                    <Typography variant="h4" color={productivityScore >= 70 ? 'success.main' : productivityScore >= 40 ? 'warning.main' : 'error.main'}>
                      {productivityScore}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Productivity
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Active Time Entry */}
        {activeEntry && (
          <Grid item xs={12}>
            <Card sx={{ backgroundColor: 'primary.light', color: 'primary.contrastText' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Currently Working On
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      backgroundColor: activeEntry.activity.color,
                    }}
                  />
                  <Typography variant="body1">
                    {activeEntry.activity.name}
                  </Typography>
                  <Chip
                    label={QuadrantLabels[activeEntry.activity.quadrant]}
                    size="small"
                    sx={{ backgroundColor: QuadrantColors[activeEntry.activity.quadrant], color: 'white' }}
                  />
                  <Typography variant="body2" sx={{ ml: 'auto' }}>
                    Started: {dayjs(activeEntry.startTime).format('HH:mm')}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Today's Tasks */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Today's Tasks ({completedTasks.length}/{todaysTasks.length})
              </Typography>
              
              {todaysTasks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No tasks planned for today. Visit the planning page to add some!
                </Typography>
              ) : (
                <List dense>
                  {todaysTasks.slice(0, 5).map((task) => (
                    <ListItem
                      key={task._id}
                      sx={{
                        bgcolor: task.status === 'Completed' ? 'success.light' : 'transparent',
                        borderRadius: 1,
                        mb: 0.5,
                      }}
                    >
                      <ListItemText
                        primary={task.title}
                        secondary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              label={QuadrantLabels[task.quadrant]}
                              size="small"
                              sx={{ 
                                backgroundColor: QuadrantColors[task.quadrant], 
                                color: 'white',
                                fontSize: '0.7rem'
                              }}
                            />
                            <Typography variant="caption">
                              {formatTime(task.estimatedTime)}
                            </Typography>
                          </Box>
                        }
                        sx={{
                          textDecoration: task.status === 'Completed' ? 'line-through' : 'none',
                        }}
                      />
                    </ListItem>
                  ))}
                  {todaysTasks.length > 5 && (
                    <ListItem>
                      <ListItemText 
                        primary={`... and ${todaysTasks.length - 5} more tasks`}
                        sx={{ fontStyle: 'italic', color: 'text.secondary' }}
                      />
                    </ListItem>
                  )}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Backlog Preview */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Backlog ({backlogTasks.length} tasks)
              </Typography>
              
              {backlogTasks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Your backlog is empty. Great job staying on top of things!
                </Typography>
              ) : (
                <List dense>
                  {backlogTasks.slice(0, 5).map((task) => (
                    <ListItem key={task._id}>
                      <ListItemText
                        primary={task.title}
                        secondary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              label={QuadrantLabels[task.quadrant]}
                              size="small"
                              sx={{ 
                                backgroundColor: QuadrantColors[task.quadrant], 
                                color: 'white',
                                fontSize: '0.7rem'
                              }}
                            />
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                  {backlogTasks.length > 5 && (
                    <ListItem>
                      <ListItemText 
                        primary={`... and ${backlogTasks.length - 5} more tasks`}
                        sx={{ fontStyle: 'italic', color: 'text.secondary' }}
                      />
                    </ListItem>
                  )}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Time Distribution by Quadrant */}
        {dailySummary && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Time Distribution by Priority
                </Typography>
                <Grid container spacing={2}>
                  {[1, 2, 3, 4].map((quadrant) => {
                    const quadrantData = dailySummary.byQuadrant[quadrant];
                    const time = quadrantData?.time || 0;
                    const percentage = dailySummary.totalTime > 0 ? (time / dailySummary.totalTime) * 100 : 0;
                    
                    return (
                      <Grid item xs={12} sm={6} md={3} key={quadrant}>
                        <Box
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            backgroundColor: QuadrantColors[quadrant as keyof typeof QuadrantColors],
                            color: 'white',
                            textAlign: 'center',
                          }}
                        >
                          <Typography variant="h6">
                            {formatTime(time)}
                          </Typography>
                          <Typography variant="body2">
                            Q{quadrant}: {QuadrantLabels[quadrant as keyof typeof QuadrantLabels]}
                          </Typography>
                          <Typography variant="caption">
                            {percentage.toFixed(1)}%
                          </Typography>
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
