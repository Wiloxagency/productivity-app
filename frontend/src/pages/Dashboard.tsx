import React from 'react';
import {
  Grid,
  Typography,
  Box,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  Stack,
  LinearProgress,
  Divider,
  Avatar,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AccessTimeRounded as TimeIcon,
  LocalFireDepartmentRounded as FireIcon,
  TaskAltRounded as TaskDoneIcon,
  TrendingUpRounded as TrendIcon,
  EventBusyRounded as DeadlineIcon,
  InboxRounded as BacklogIcon,
  PlaylistAddCheckRounded as TodayIcon,
  DonutLargeRounded as PriorityIcon,
  InsightsRounded as InsightsIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import PomodoroTimer from '../components/PomodoroTimer';
import { timeEntriesApi, tasksApi, planningApi, deadlinesApi } from '../services/api';
import { QuadrantColors, QuadrantLabels } from '../types';

const formatTime = (minutes: number): string => {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  color: string;
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
        <Avatar
          variant="rounded"
          sx={{
            bgcolor: alpha(color, 0.12),
            color,
            width: 52,
            height: 52,
            borderRadius: 3,
          }}
        >
          {icon}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.1, color }}>
            {value}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {label}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
      <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
      <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
        {title}
      </Typography>
      {action}
    </Box>
  );
}

export default function Dashboard() {
  const today = dayjs().format('YYYY-MM-DD');
  const weekStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');

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

  const { data: deadlines = [] } = useQuery({
    queryKey: ['deadlines'],
    queryFn: () => deadlinesApi.getAll(),
    retry: 1,
  });

  const { data: weeklyReport } = useQuery({
    queryKey: ['weeklyReport', weekStart, today],
    queryFn: () => planningApi.getReport(weekStart, today),
    retry: 1,
  });

  // Live ticking clock used to show elapsed time on the active entry banner.
  const [now, setNow] = React.useState(() => dayjs());
  React.useEffect(() => {
    if (!activeEntry) return;
    const interval = window.setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(interval);
  }, [activeEntry?._id, activeEntry?.startTime]);

  const completedTasks = todaysTasks.filter((task) => task.status === 'Completed');
  const productivityScore = todaysPlanning?.productivity.score || 0;
  const todaysGoals = todaysPlanning?.goals?.filter((g) => g && g.trim().length > 0) || [];
  const tasksProgress =
    todaysTasks.length > 0 ? (completedTasks.length / todaysTasks.length) * 100 : 0;

  const productivityColor =
    productivityScore >= 70 ? '#16a34a' : productivityScore >= 40 ? '#f59e0b' : '#dc2626';

  // Build a normalized 7-day productivity trend.
  const weeklyTrend = React.useMemo(() => {
    const byDate = new Map<string, number>();
    weeklyReport?.dailyStats?.forEach((stat) => {
      byDate.set(dayjs(stat.date).format('YYYY-MM-DD'), stat.productivity?.score || 0);
    });
    return Array.from({ length: 7 }).map((_, i) => {
      const d = dayjs().subtract(6 - i, 'day');
      const key = d.format('YYYY-MM-DD');
      return {
        key,
        label: d.format('dd').charAt(0),
        score: byDate.get(key) || 0,
        isToday: key === today,
      };
    });
  }, [weeklyReport, today]);

  const upcomingDeadlines = React.useMemo(() => {
    const startOfToday = dayjs().startOf('day');
    return [...deadlines]
      .filter((d) => d.finalDeliveryDate)
      .map((d) => ({
        ...d,
        daysLeft: dayjs(d.finalDeliveryDate).startOf('day').diff(startOfToday, 'day'),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);
  }, [deadlines]);

  const deadlineColor = (daysLeft: number) =>
    daysLeft < 0 ? '#dc2626' : daysLeft <= 2 ? '#f59e0b' : '#0ea5e9';
  const deadlineLabel = (daysLeft: number) =>
    daysLeft < 0
      ? `${Math.abs(daysLeft)}d overdue`
      : daysLeft === 0
      ? 'Today'
      : daysLeft === 1
      ? 'Tomorrow'
      : `${daysLeft}d left`;

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Good {dayjs().hour() < 12 ? 'morning' : dayjs().hour() < 18 ? 'afternoon' : 'evening'}!
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          {dayjs().format('dddd, MMMM D, YYYY')}
        </Typography>
      </Box>

      {/* Active session banner */}
      {activeEntry && (
        <Card
          sx={{
            mb: 3,
            border: 'none',
            color: '#fff',
            background: 'linear-gradient(120deg, #4f46e5 0%, #6366f1 55%, #0ea5e9 100%)',
            boxShadow: '0 12px 30px rgba(79,70,229,0.30)',
          }}
        >
          <CardContent
            sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', py: 2.5 }}
          >
            <Box
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: '#fff',
                boxShadow: '0 0 0 5px rgba(255,255,255,0.25)',
                flexShrink: 0,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ opacity: 0.85, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Currently working on
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                {activeEntry.activity?.name || activeEntry.task?.title || 'Untitled'}
              </Typography>
            </Box>
            {(() => {
              const q = activeEntry.activity?.quadrant || activeEntry.task?.quadrant || 1;
              return (
                <Chip
                  label={QuadrantLabels[q as keyof typeof QuadrantLabels]}
                  size="small"
                  sx={{ bgcolor: 'rgba(255,255,255,0.22)', color: '#fff', fontWeight: 600 }}
                />
              );
            })()}
            <Box sx={{ ml: { sm: 'auto' }, textAlign: { xs: 'left', sm: 'right' } }}>
              <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                {formatTime(now.diff(dayjs(activeEntry.startTime), 'minute'))}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                since {dayjs(activeEntry.startTime).format('HH:mm')}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* KPI strip + content */}
      <Grid container spacing={3}>
        <Grid item xs={6} md={3}>
          <StatCard
            icon={<TimeIcon />}
            label="Tracked today"
            value={dailySummary?.totalTime ? formatTime(dailySummary.totalTime) : '0m'}
            color="#4f46e5"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard
            icon={<FireIcon />}
            label="Pomodoros"
            value={dailySummary?.pomodorosCompleted || 0}
            color="#f59e0b"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard
            icon={<TaskDoneIcon />}
            label={`Tasks done${todaysTasks.length ? ` / ${todaysTasks.length}` : ''}`}
            value={completedTasks.length}
            color="#16a34a"
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard
            icon={<TrendIcon />}
            label="Productivity"
            value={`${productivityScore}%`}
            color={productivityColor}
          />
        </Grid>

        {/* Pomodoro Timer */}
        <Grid item xs={12} md={8}>
          <PomodoroTimer />
        </Grid>

        {/* Time by Priority (Eisenhower) */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <SectionHeader icon={<PriorityIcon />} title="Time by priority" />
              <Stack spacing={2.25} sx={{ flexGrow: 1, justifyContent: 'center' }}>
                {[1, 2, 3, 4].map((quadrant) => {
                  const quadrantData = dailySummary?.byQuadrant?.[quadrant];
                  const time = quadrantData?.time || 0;
                  const total = dailySummary?.totalTime || 0;
                  const percentage = total > 0 ? (time / total) * 100 : 0;
                  const color = QuadrantColors[quadrant as keyof typeof QuadrantColors];
                  return (
                    <Box key={quadrant}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Q{quadrant} · {QuadrantLabels[quadrant as keyof typeof QuadrantLabels]}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatTime(time)}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, percentage)}
                        sx={{
                          height: 8,
                          borderRadius: 999,
                          '& .MuiLinearProgress-bar': { backgroundColor: color },
                        }}
                      />
                    </Box>
                  );
                })}
              </Stack>
              {!dailySummary?.totalTime && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
                  Start tracking to see how your time splits across priorities.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Today's Tasks */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <SectionHeader
                icon={<TodayIcon />}
                title="Today's tasks"
                action={
                  <Chip
                    label={`${completedTasks.length}/${todaysTasks.length}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                }
              />
              {todaysTasks.length > 0 && (
                <LinearProgress
                  variant="determinate"
                  value={tasksProgress}
                  color="success"
                  sx={{ height: 6, borderRadius: 999, mb: 1.5 }}
                />
              )}
              {todaysGoals.length > 0 && (
                <Box sx={{ mb: 1.5 }}>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {todaysGoals.slice(0, 3).map((goal, i) => (
                      <Chip key={i} label={`🎯 ${goal}`} size="small" sx={{ bgcolor: alpha('#4f46e5', 0.08), color: '#4338ca' }} />
                    ))}
                  </Stack>
                  <Divider sx={{ mt: 1.5 }} />
                </Box>
              )}
              {todaysTasks.length === 0 ? (
                <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    No tasks planned for today.
                    <br />
                    Visit Daily Planning to add some!
                  </Typography>
                </Box>
              ) : (
                <List dense disablePadding sx={{ flexGrow: 1 }}>
                  {todaysTasks.slice(0, 5).map((task) => (
                    <ListItem key={task._id} disableGutters sx={{ py: 0.75 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          mr: 1.5,
                          flexShrink: 0,
                          bgcolor:
                            task.status === 'Completed'
                              ? '#16a34a'
                              : QuadrantColors[task.quadrant],
                        }}
                      />
                      <ListItemText
                        primary={task.title}
                        primaryTypographyProps={{
                          fontWeight: 600,
                          fontSize: 14,
                          sx: {
                            textDecoration: task.status === 'Completed' ? 'line-through' : 'none',
                            color: task.status === 'Completed' ? 'text.secondary' : 'text.primary',
                          },
                        }}
                        secondary={`${QuadrantLabels[task.quadrant]} · ${formatTime(task.estimatedTime)}`}
                        secondaryTypographyProps={{ fontSize: 12 }}
                      />
                    </ListItem>
                  ))}
                  {todaysTasks.length > 5 && (
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 2.5 }}>
                      + {todaysTasks.length - 5} more
                    </Typography>
                  )}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Upcoming Deadlines */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <SectionHeader icon={<DeadlineIcon />} title="Upcoming deadlines" />
              {upcomingDeadlines.length === 0 ? (
                <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    No deadlines on the radar. 🎉
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={1.25} sx={{ flexGrow: 1 }}>
                  {upcomingDeadlines.map((d) => {
                    const color = deadlineColor(d.daysLeft);
                    return (
                      <Box
                        key={d._id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          p: 1.25,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderLeft: `4px solid ${color}`,
                        }}
                      >
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                            {d.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {d.type} · {dayjs(d.finalDeliveryDate).format('MMM D')}
                          </Typography>
                        </Box>
                        <Chip
                          label={deadlineLabel(d.daysLeft)}
                          size="small"
                          sx={{ bgcolor: alpha(color, 0.12), color, fontWeight: 700 }}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Backlog preview */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <SectionHeader
                icon={<BacklogIcon />}
                title="Backlog"
                action={<Chip label={`${backlogTasks.length}`} size="small" variant="outlined" />}
              />
              {backlogTasks.length === 0 ? (
                <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Your backlog is empty. Great job!
                  </Typography>
                </Box>
              ) : (
                <List dense disablePadding sx={{ flexGrow: 1 }}>
                  {backlogTasks.slice(0, 5).map((task) => (
                    <ListItem key={task._id} disableGutters sx={{ py: 0.75 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          mr: 1.5,
                          flexShrink: 0,
                          bgcolor: QuadrantColors[task.quadrant],
                        }}
                      />
                      <ListItemText
                        primary={task.title}
                        primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
                        secondary={`${QuadrantLabels[task.quadrant]} · ${formatTime(task.estimatedTime)}`}
                        secondaryTypographyProps={{ fontSize: 12 }}
                      />
                    </ListItem>
                  ))}
                  {backlogTasks.length > 5 && (
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 2.5 }}>
                      + {backlogTasks.length - 5} more
                    </Typography>
                  )}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Weekly productivity trend */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <SectionHeader
                icon={<InsightsIcon />}
                title="Last 7 days"
                action={
                  <Chip
                    label={`avg ${weeklyReport?.averageProductivity ?? 0}%`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                }
              />
              <Box sx={{ flexGrow: 1, position: 'relative', minHeight: 150, mt: 1 }}>
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'stretch',
                    justifyContent: 'space-between',
                    gap: 1,
                  }}
                >
                  {weeklyTrend.map((day) => (
                    <Box
                      key={day.key}
                      sx={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>
                        {day.score}
                      </Typography>
                      <Box sx={{ flexGrow: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <Box
                          sx={{
                            width: '100%',
                            maxWidth: 28,
                            height: `${Math.max(4, day.score)}%`,
                            minHeight: 4,
                            borderRadius: 1.5,
                            background: day.isToday
                              ? 'linear-gradient(180deg, #6366f1, #4f46e5)'
                              : alpha('#4f46e5', 0.25),
                            transition: 'height 0.3s ease',
                          }}
                        />
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{ mt: 0.5, fontWeight: day.isToday ? 800 : 500, color: day.isToday ? 'primary.main' : 'text.secondary' }}
                      >
                        {day.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
