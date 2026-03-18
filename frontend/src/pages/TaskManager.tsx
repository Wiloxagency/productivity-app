import React, { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tabs,
  Tab,
  Paper,
  Stack,
  Tooltip,
  Badge,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as StartIcon,
  Schedule as PlanIcon,
  ViewModule as MatrixIcon,
  List as ListIcon,
  Event as DeadlineIcon,
  PriorityHigh as PriorityIcon,
  FolderOpen as ProjectIcon,
  Assessment as ActivityIcon,
  Whatshot as Q1Icon,
  Star as Q2Icon,
  Group as Q3Icon,
  Delete as Q4Icon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { tasksApi, categoriesApi, activitiesApi, timeEntriesApi, projectsApi } from '../services/api';
import { Task, Category, Project, QuadrantColors, QuadrantLabels } from '../types';
import ProjectManager from '../components/ProjectManager';
import ActivityManager from '../components/ActivityManager';
import DeadlineManager from '../components/DeadlineManager';
import TaskCard from '../components/TaskCard';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

export default function TaskManager() {
  const [currentTab, setCurrentTab] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [taskToPlan, setTaskToPlan] = useState<Task | null>(null);
  const [plannedDate, setPlannedDate] = useState(dayjs());
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    project: '',
    quadrant: 1,
    status: 'Not Started' as Task['status'],
    estimatedTime: 25,
    tags: '',
    dueDate: null as dayjs.Dayjs | null,
  });

  const queryClient = useQueryClient();

  const { data: backlogTasks = [] } = useQuery({
    queryKey: ['backlogTasks'],
    queryFn: () => tasksApi.getBacklog(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => activitiesApi.getAll(),
  });

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry'],
    queryFn: timeEntriesApi.getActive,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.getAll(),
  });

  // Get tasks by quadrant
  const tasksByQuadrant = {
    1: backlogTasks.filter(task => task.quadrant === 1),
    2: backlogTasks.filter(task => task.quadrant === 2),
    3: backlogTasks.filter(task => task.quadrant === 3),
    4: backlogTasks.filter(task => task.quadrant === 4),
  };

  const createTaskMutation = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlogTasks'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) =>
      tasksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlogTasks'] });
      setDialogOpen(false);
      setEditingTask(null);
      resetForm();
    },
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskIdToDelete, setTaskIdToDelete] = useState<string | null>(null);

  const deleteTaskMutation = useMutation({
    mutationFn: tasksApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlogTasks'] });
      setDeleteConfirmOpen(false);
      setTaskIdToDelete(null);
    },
  });

  const planTaskMutation = useMutation({
    mutationFn: ({ id, plannedDate }: { id: string; plannedDate: string }) =>
      tasksApi.plan(id, { plannedDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlogTasks'] });
      queryClient.invalidateQueries({ queryKey: ['dailyTasks'] });
      setPlanDialogOpen(false);
      setTaskToPlan(null);
    },
  });

  const startTimeTrackingMutation = useMutation({
    mutationFn: (activityId: string) =>
      timeEntriesApi.start({ activity: activityId, isPomodoro: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category: '',
      project: '',
      quadrant: 1,
      status: 'Not Started' as Task['status'],
      estimatedTime: 25,
      tags: '',
      dueDate: null,
    });
  };

  const handleOpenDialog = (task?: Task) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        title: task.title,
        description: task.description || '',
        category: task.category._id,
        project: task.project?._id || '',
        quadrant: task.quadrant,
        status: task.status,
        estimatedTime: task.estimatedTime,
        tags: task.tags.join(', '),
        dueDate: task.dueDate ? dayjs(task.dueDate) : null,
      });
    } else {
      setEditingTask(null);
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const taskData = {
      title: formData.title,
      description: formData.description,
      category: formData.category, // API expects category ID string
      project: formData.project, // API expects project ID string
      quadrant: formData.quadrant,
      status: formData.status,
      estimatedTime: formData.estimatedTime,
      tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
      dueDate: formData.dueDate?.toISOString(),
    } as any;

    if (editingTask) {
      updateTaskMutation.mutate({ id: editingTask._id, data: taskData });
    } else {
      createTaskMutation.mutate(taskData);
    }
  };

  const handlePlanTask = (task: Task) => {
    setTaskToPlan(task);
    setPlanDialogOpen(true);
  };

  const handleStartTracking = async (task: Task) => {
    try {
      // Check if there's already an active timer running
      if (activeEntry) {
        // Stop the current time entry (this preserves the original entry in the list)
        await timeEntriesApi.stop(activeEntry._id, {
          notes: `Switched to tracking task: ${task.title}`
        });
        
        // Start new time tracking for this task as regular tracking (non-pomodoro)
        await timeEntriesApi.startWithTask({
          task: task._id,
          isPomodoro: false,
          notes: `Started tracking task: ${task.title}`,
          localDate: dayjs().format('YYYY-MM-DD'),
        });

        // Refresh active entry data
        queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
        queryClient.invalidateQueries({ queryKey: ['timeEntries'] });

        setSnackbarMessage(`🔄 Switched to tracking task: ${task.title}`);
      } else {
        // Start new time tracking for this task (default to non-Pomodoro)
        await timeEntriesApi.startWithTask({
          task: task._id,
          isPomodoro: false,
          notes: `Started tracking task: ${task.title}`,
          localDate: dayjs().format('YYYY-MM-DD'),
        });
        
        // Refresh active entry data
        queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
        queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
        
        setSnackbarMessage(`🚀 Started tracking task: ${task.title}`);
      }
      
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Error starting time tracking:', error);
      // Show error notification
      setSnackbarMessage('❌ Failed to start time tracking');
      setSnackbarOpen(true);
    }
  };

  const handleStatusChange = async (taskId: string, status: Task['status']) => {
    try {
      await updateTaskMutation.mutateAsync({ 
        id: taskId, 
        data: { status }
      });
      setSnackbarMessage(`✅ Task status updated to: ${status}`);
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Error updating task status:', error);
      setSnackbarMessage('❌ Failed to update task status');
      setSnackbarOpen(true);
    }
  };

  const handlePriorityChange = async (taskId: string, direction: 'up' | 'down') => {
    try {
      const currentIndex = backlogTasks.findIndex(t => t._id === taskId);
      if (currentIndex === -1) return;
      
      // Calculate new position
      const newIndex = direction === 'up' 
        ? Math.max(0, currentIndex - 1) 
        : Math.min(backlogTasks.length - 1, currentIndex + 1);
      
      if (newIndex === currentIndex) return; // No movement possible
      
      // Create new order by moving the task
      const reorderedTasks = [...backlogTasks];
      const [movedTask] = reorderedTasks.splice(currentIndex, 1);
      reorderedTasks.splice(newIndex, 0, movedTask);
      
      // Extract task IDs in new order
      const taskIds = reorderedTasks.map(t => t._id);
      
      // Use the reorder API to update all priorities at once
      await tasksApi.reorder(taskIds);
      
      // Refresh the data
      queryClient.invalidateQueries({ queryKey: ['backlogTasks'] });
      
      setSnackbarMessage(`📈 Task priority ${direction === 'up' ? 'increased' : 'decreased'}`);
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Error updating task priority:', error);
      setSnackbarMessage('❌ Failed to update task priority');
      setSnackbarOpen(true);
    }
  };

  const handlePrioritySet = async (taskId: string, targetPriority: number) => {
    try {
      const currentIndex = backlogTasks.findIndex(t => t._id === taskId);
      if (currentIndex === -1) return;

      const targetIndex = Math.min(Math.max(targetPriority, 1), backlogTasks.length) - 1;
      if (targetIndex === currentIndex) return;

      const reorderedTasks = [...backlogTasks];
      const [movedTask] = reorderedTasks.splice(currentIndex, 1);
      reorderedTasks.splice(targetIndex, 0, movedTask);

      const taskIds = reorderedTasks.map(t => t._id);
      await tasksApi.reorder(taskIds);

      queryClient.invalidateQueries({ queryKey: ['backlogTasks'] });

      setSnackbarMessage(`📌 Task moved to priority #${targetIndex + 1}`);
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Error setting task priority:', error);
      setSnackbarMessage('❌ Failed to update task priority');
      setSnackbarOpen(true);
    }
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };


  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Task Manager</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          size="large"
        >
          Add New Task
        </Button>
      </Box>

      {/* Quick Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="primary">{backlogTasks.length}</Typography>
              <Typography variant="body2" color="text.secondary">Total Tasks</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="error">{tasksByQuadrant[1].length}</Typography>
              <Typography variant="body2" color="text.secondary">Crisis</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="success.main">{tasksByQuadrant[2].length}</Typography>
              <Typography variant="body2" color="text.secondary">Goals</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="text.secondary">{tasksByQuadrant[3].length + tasksByQuadrant[4].length}</Typography>
              <Typography variant="body2" color="text.secondary">Distractions</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ width: '100%', mb: 3 }}>
        <Tabs
          value={currentTab}
          onChange={(_, newValue) => setCurrentTab(newValue)}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab 
            icon={<ListIcon />}
            label={`Backlog (${backlogTasks.length})`}
          />
          <Tab 
            icon={<MatrixIcon />}
            label="Eisenhower Matrix"
          />
          <Tab 
            icon={<ProjectIcon />}
            label={`Projects (${projects.length})`}
          />
          <Tab 
            icon={<ActivityIcon />}
            label={`Activities (${activities.length})`}
          />
          <Tab
            icon={<DeadlineIcon />}
            label="DEADLINE"
          />
          <Tab 
            icon={<Q1Icon />}
            label={`Q1: Do (${tasksByQuadrant[1].length})`}
          />
          <Tab 
            icon={<Q2Icon />}
            label={`Q2: Schedule (${tasksByQuadrant[2].length})`}
          />
          <Tab 
            icon={<Q3Icon />}
            label={`Q3: Delegate (${tasksByQuadrant[3].length})`}
          />
          <Tab 
            icon={<Q4Icon />}
            label={`Q4: Eliminate (${tasksByQuadrant[4].length})`}
          />
        </Tabs>
      </Paper>

      {/* Backlog View */}
      <TabPanel value={currentTab} index={0}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h5" gutterBottom>
              📋 Task Backlog ({backlogTasks.length} tasks)
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              All tasks ordered by priority. Use actions to manage or move to daily planning.
            </Typography>
          </Grid>
          
          {backlogTasks.length === 0 ? (
            <Grid item xs={12}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 6 }}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No tasks in backlog
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Create your first task to get started with productivity planning!
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                    sx={{ mt: 2 }}
                  >
                    Add First Task
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ) : (
            <Grid item xs={12}>
              {backlogTasks.map((task, index) => (
                <TaskCard 
                  key={task._id} 
                  task={task} 
                  priority={index + 1}
                  maxPriority={backlogTasks.length}
                  onEdit={handleOpenDialog}
                  onDelete={(id) => { setTaskIdToDelete(id); setDeleteConfirmOpen(true); }}
                  onPlan={handlePlanTask}
                  onStartTracking={handleStartTracking}
                  onStatusChange={handleStatusChange}
                  onPriorityChange={handlePriorityChange}
                  onPrioritySet={handlePrioritySet}
                />
              ))}
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* Eisenhower Matrix View */}
      <TabPanel value={currentTab} index={1}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" gutterBottom>
            📊 Eisenhower Decision Matrix
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Visual representation of all tasks organized by urgency and importance.
          </Typography>
        </Box>
        
        {/* Force 2x2 Grid Layout */}
        <Box sx={{ minHeight: '70vh' }}>
          {/* First Row: Q1 | Q2 */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {/* Quadrant 1: Do */}
            <Grid item xs={12} sm={6}>
              <Card 
                sx={{ 
                  height: '48vh', 
                  border: `3px solid ${QuadrantColors[1]}`,
                  backgroundColor: 'rgba(220, 53, 69, 0.05)'
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Box sx={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: QuadrantColors[1] }} />
                    <Typography variant="h6" color="error.main">
                      Q1: Do
                    </Typography>
                    <Badge badgeContent={tasksByQuadrant[1].length} color="error" />
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    🔥 Handle immediately
                  </Typography>
                  <Box sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {tasksByQuadrant[1].map((task) => (
                      <TaskCard 
                        key={task._id} 
                        task={task} 
                        compact 
                        onEdit={handleOpenDialog}
                        onDelete={(id) => deleteTaskMutation.mutate(id)}
                        onPlan={handlePlanTask}
                        onStartTracking={handleStartTracking}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                    {tasksByQuadrant[1].length === 0 && (
                      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                        No crisis tasks - Great!
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Quadrant 2: Schedule */}
            <Grid item xs={12} sm={6}>
              <Card 
                sx={{ 
                  height: '48vh', 
                  border: `3px solid ${QuadrantColors[2]}`,
                  backgroundColor: 'rgba(40, 167, 69, 0.05)'
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Box sx={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: QuadrantColors[2] }} />
                    <Typography variant="h6" color="success.main">
                      Q2: Schedule
                    </Typography>
                    <Badge badgeContent={tasksByQuadrant[2].length} color="success" />
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    ⭐ Plan dedicated time
                  </Typography>
                  <Box sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {tasksByQuadrant[2].map((task) => (
                      <TaskCard 
                        key={task._id} 
                        task={task} 
                        compact 
                        onEdit={handleOpenDialog}
                        onDelete={(id) => deleteTaskMutation.mutate(id)}
                        onPlan={handlePlanTask}
                        onStartTracking={handleStartTracking}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                    {tasksByQuadrant[2].length === 0 && (
                      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                        Add important goals here
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Second Row: Q3 | Q4 */}
          <Grid container spacing={2}>
            {/* Quadrant 3: Delegate */}
            <Grid item xs={12} sm={6}>
              <Card 
                sx={{ 
                  height: '48vh', 
                  border: `3px solid ${QuadrantColors[3]}`,
                  backgroundColor: 'rgba(255, 193, 7, 0.05)'
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Box sx={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: QuadrantColors[3] }} />
                    <Typography variant="h6" color="warning.main">
                      Q3: Delegate
                    </Typography>
                    <Badge badgeContent={tasksByQuadrant[3].length} color="warning" />
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    ⚡ Delegate or minimize
                  </Typography>
                  <Box sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {tasksByQuadrant[3].map((task) => (
                      <TaskCard 
                        key={task._id} 
                        task={task} 
                        compact 
                        onEdit={handleOpenDialog}
                        onDelete={(id) => deleteTaskMutation.mutate(id)}
                        onPlan={handlePlanTask}
                        onStartTracking={handleStartTracking}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                    {tasksByQuadrant[3].length === 0 && (
                      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                        No interruptions
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Quadrant 4: Eliminate */}
            <Grid item xs={12} sm={6}>
              <Card 
                sx={{ 
                  height: '48vh', 
                  border: `3px solid ${QuadrantColors[4]}`,
                  backgroundColor: 'rgba(108, 117, 125, 0.05)'
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Box sx={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: QuadrantColors[4] }} />
                    <Typography variant="h6" color="text.secondary">
                      Q4: Eliminate
                    </Typography>
                    <Badge badgeContent={tasksByQuadrant[4].length} color="default" />
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    🗑️ Consider eliminating
                  </Typography>
                  <Box sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {tasksByQuadrant[4].map((task) => (
                      <TaskCard 
                        key={task._id} 
                        task={task} 
                        compact 
                        onEdit={handleOpenDialog}
                        onDelete={(id) => deleteTaskMutation.mutate(id)}
                        onPlan={handlePlanTask}
                        onStartTracking={handleStartTracking}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                    {tasksByQuadrant[4].length === 0 && (
                      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                        No time wasters - Excellent!
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* Matrix Guide */}
        <Box sx={{ mt: 3 }}>
          <Alert severity="info">
            <Typography variant="subtitle2" gutterBottom>💡 Eisenhower Matrix Guide:</Typography>
            <Typography variant="body2">
              • <strong>Q1 (Do):</strong> Urgent crises that need immediate attention<br/>
              • <strong>Q2 (Schedule):</strong> Important goals that drive long-term success<br/>
              • <strong>Q3 (Delegate):</strong> Urgent but unimportant interruptions<br/>
              • <strong>Q4 (Eliminate):</strong> Time-wasting activities to minimize
            </Typography>
          </Alert>
        </Box>
      </TabPanel>

      {/* Projects View */}
      <TabPanel value={currentTab} index={2}>
        <ProjectManager />
      </TabPanel>

      {/* Activities View */}
      <TabPanel value={currentTab} index={3}>
        <ActivityManager />
      </TabPanel>
      {/* Deadline View */}
      <TabPanel value={currentTab} index={4}>
        <DeadlineManager />
      </TabPanel>

      {/* Individual Quadrant Views */}
      {[1, 2, 3, 4].map((quadrant) => (
        <TabPanel key={quadrant} value={currentTab} index={quadrant + 4}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: QuadrantColors[quadrant as keyof typeof QuadrantColors],
                  }}
                />
                <Typography variant="h5">
                  Q{quadrant}: {QuadrantLabels[quadrant as keyof typeof QuadrantLabels]}
                </Typography>
                <Chip
                  label={`${tasksByQuadrant[quadrant as keyof typeof tasksByQuadrant].length} tasks`}
                  color="primary"
                />
              </Box>
              
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {quadrant === 1 && "🔥 Crisis mode - Handle these immediately"}
                {quadrant === 2 && "⭐ Focus zone - Schedule dedicated time for these"}
                {quadrant === 3 && "⚡ Interruptions - Delegate or minimize"}
                {quadrant === 4 && "🗑️ Time wasters - Consider eliminating"}
              </Typography>
            </Grid>
            
            {tasksByQuadrant[quadrant as keyof typeof tasksByQuadrant].length === 0 ? (
              <Grid item xs={12}>
                <Card>
                  <CardContent sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body1" color="text.secondary">
                      No tasks in this quadrant
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ) : (
              <Grid item xs={12}>
                {tasksByQuadrant[quadrant as keyof typeof tasksByQuadrant].map((task) => (
                  <TaskCard 
                    key={task._id} 
                    task={task}
                    onEdit={handleOpenDialog}
                    onDelete={(id) => { setTaskIdToDelete(id); setDeleteConfirmOpen(true); }}
                    onPlan={handlePlanTask}
                    onStartTracking={handleStartTracking}
                    onStatusChange={handleStatusChange}
                    onPriorityChange={handlePriorityChange}
                  />
                ))}
              </Grid>
            )}
          </Grid>
        </TabPanel>
      ))}

      {/* Add/Edit Task Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingTask ? 'Edit Task' : 'Create New Task'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Task Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                multiline
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Category</InputLabel>
                <Select
                  value={formData.category}
                  label="Category"
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  {categories.map((category) => (
                    <MenuItem key={category._id} value={category._id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: category.color,
                          }}
                        />
                        {category.name}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Project</InputLabel>
                <Select
                  value={formData.project}
                  label="Project"
                  onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                >
                  {projects.filter(p => p.status === 'active' && !p.isArchived).map((project) => (
                    <MenuItem key={project._id} value={project._id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: project.color,
                          }}
                        />
                        {project.name}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Priority Quadrant</InputLabel>
                <Select
                  value={formData.quadrant}
                  label="Priority Quadrant"
                  onChange={(e) => setFormData({ ...formData, quadrant: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4].map((q) => (
                    <MenuItem key={q} value={q}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: QuadrantColors[q as keyof typeof QuadrantColors],
                          }}
                        />
                        Q{q}: {QuadrantLabels[q as keyof typeof QuadrantLabels]}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  label="Status"
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Task['status'] })}
                >
                  {['Not Started', 'Started', 'Completed', 'Cancelled'].map((status) => (
                    <MenuItem key={status} value={status}>
                      {status}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Estimated Time (minutes)"
                type="number"
                value={formData.estimatedTime}
                onChange={(e) => setFormData({ ...formData, estimatedTime: Number(e.target.value) })}
                inputProps={{ min: 5, max: 480 }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Due Date (optional)"
                value={formData.dueDate}
                onChange={(date) => setFormData({ ...formData, dueDate: date })}
                format="MM/DD/YYYY"
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Tags (comma-separated)"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="urgent, project-x, personal"
                helperText="Separate multiple tags with commas"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!formData.title || !formData.category || !formData.project || createTaskMutation.isPending || updateTaskMutation.isPending}
          >
            {editingTask ? 'Update' : 'Create'} Task
          </Button>
        </DialogActions>
      </Dialog>

      {/* Plan Task Dialog */}
      <Dialog open={planDialogOpen} onClose={() => setPlanDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Plan Task for Specific Date</DialogTitle>
        <DialogContent>
          {taskToPlan && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                {taskToPlan.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {taskToPlan.description}
              </Typography>
              
              <DatePicker
                label="Planned Date"
                value={plannedDate}
                onChange={(date) => setPlannedDate(date || dayjs())}
                format="MM/DD/YYYY"
                slotProps={{ textField: { fullWidth: true, sx: { mt: 2 } } }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (taskToPlan) {
                planTaskMutation.mutate({
                  id: taskToPlan._id,
                  plannedDate: plannedDate.format('YYYY-MM-DD'),
                });
              }
            }}
            disabled={planTaskMutation.isPending}
          >
            Plan Task
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => { setDeleteConfirmOpen(false); setTaskIdToDelete(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this task? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteConfirmOpen(false); setTaskIdToDelete(null); }}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => taskIdToDelete && deleteTaskMutation.mutate(taskIdToDelete)}
            disabled={deleteTaskMutation.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success/Error Notification */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        sx={{
          '& .MuiSnackbarContent-root': {
            backgroundColor: snackbarMessage.includes('❌') ? 'error.main' : 'success.main',
            color: 'white',
            fontWeight: 'medium',
          },
        }}
      />
    </Box>
  );
}
