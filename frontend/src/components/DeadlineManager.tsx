import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Stack,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { deadlinesApi, projectsApi, tasksApi } from '../services/api';
import { DeadlineItem, Project, Task } from '../types';

type ManualDeadlineForm = {
  title: string;
  description: string;
  type: 'Project' | 'Task' | 'Promise';
  commitmentDate: Dayjs | null;
  finalDeliveryDate: Dayjs | null;
};

type DeadlineListItem = {
  id: string;
  title: string;
  description?: string;
  type: string;
  source: 'Manual' | 'Project' | 'Task';
  createdAt: string;
  commitmentDate: string;
};

const getDaysLeft = (targetDate: string): number => {
  const today = dayjs().startOf('day');
  return dayjs(targetDate).startOf('day').diff(today, 'day');
};

const formatDaysLeft = (daysLeft: number): string => {
  if (daysLeft === 0) return 'Today';
  if (daysLeft > 0) return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
  const overdueDays = Math.abs(daysLeft);
  return `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue`;
};

const getDaysLeftColor = (daysLeft: number): 'success' | 'warning' | 'error' => {
  if (daysLeft < 0) return 'error';
  if (daysLeft <= 3) return 'warning';
  return 'success';
};

export default function DeadlineManager() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<ManualDeadlineForm>({
    title: '',
    description: '',
    type: 'Promise',
    commitmentDate: dayjs(),
    finalDeliveryDate: dayjs(),
  });

  const { data: manualItems = [] } = useQuery({
    queryKey: ['deadlineItems'],
    queryFn: () => deadlinesApi.getAll(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.getAll(),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => tasksApi.getAll(),
  });

  const createDeadlineMutation = useMutation({
    mutationFn: (payload: Partial<DeadlineItem>) => deadlinesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deadlineItems'] });
      setDialogOpen(false);
      setFormData({
        title: '',
        description: '',
        type: 'Promise',
        commitmentDate: dayjs(),
        finalDeliveryDate: dayjs(),
      });
    },
  });

  const deadlineItems = useMemo<DeadlineListItem[]>(() => {
    const manualDeadlineItems: DeadlineListItem[] = manualItems.map((item) => ({
      id: `manual:${item._id}`,
      title: item.title,
      description: item.description,
      type: item.type,
      source: 'Manual',
      createdAt: item.createdAt,
      commitmentDate: item.commitmentDate,
    }));

    const projectDeadlineItems: DeadlineListItem[] = (projects as Project[])
      .filter((project) => !project.isArchived && !!project.targetEndDate)
      .map((project) => ({
        id: `project:${project._id}`,
        title: project.name,
        description: project.description,
        type: 'Project',
        source: 'Project',
        createdAt: project.createdAt,
        commitmentDate: project.targetEndDate!,
      }));

    const taskDeadlineItems: DeadlineListItem[] = (tasks as Task[])
      .filter((task) => !!task.plannedDate && task.status !== 'Completed' && task.status !== 'Cancelled')
      .map((task) => ({
        id: `task:${task._id}`,
        title: task.title,
        description: task.description,
        type: 'Task',
        source: 'Task',
        createdAt: task.createdAt,
        commitmentDate: task.plannedDate!,
      }));

    return [...manualDeadlineItems, ...projectDeadlineItems, ...taskDeadlineItems].sort((a, b) => {
      const dateA = new Date(a.commitmentDate).getTime();
      const dateB = new Date(b.commitmentDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.title.localeCompare(b.title);
    });
  }, [manualItems, projects, tasks]);

  const handleCreate = () => {
    if (!formData.title.trim() || !formData.commitmentDate || !formData.finalDeliveryDate) return;

    createDeadlineMutation.mutate({
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      type: formData.type,
      commitmentDate: formData.commitmentDate.toISOString(),
      finalDeliveryDate: formData.finalDeliveryDate.toISOString(),
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h5" gutterBottom sx={{ mb: 0.5 }}>
            📅 DEADLINE
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Deadlines from manual commitments, active projects with target end date, and planned unfinished tasks.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
        >
          Add Deadline
        </Button>
      </Box>

      <Card>
        <CardContent>
          {deadlineItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No deadline items available.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Source</TableCell>
                    <TableCell>Created At</TableCell>
                    <TableCell>Commitment Date</TableCell>
                    <TableCell>Days Left</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deadlineItems.map((item) => {
                    const daysLeft = getDaysLeft(item.commitmentDate);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {item.title}
                            </Typography>
                            {item.description && (
                              <Typography variant="caption" color="text.secondary">
                                {item.description}
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>{item.type}</TableCell>
                        <TableCell>
                          <Chip
                            label={item.source}
                            size="small"
                            color={item.source === 'Manual' ? 'primary' : (item.source === 'Project' ? 'secondary' : 'default')}
                          />
                        </TableCell>
                        <TableCell>{dayjs(item.createdAt).format('MMM D, YYYY')}</TableCell>
                        <TableCell>{dayjs(item.commitmentDate).format('MMM D, YYYY')}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={formatDaysLeft(daysLeft)}
                            color={getDaysLeftColor(daysLeft)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Deadline Item</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              required
              fullWidth
              value={formData.title}
              onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
            />
            <TextField
              label="Description (optional)"
              fullWidth
              multiline
              rows={2}
              value={formData.description}
              onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
            />
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                label="Type"
                value={formData.type}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, type: event.target.value as ManualDeadlineForm['type'] }))
                }
              >
                <MenuItem value="Project">Project</MenuItem>
                <MenuItem value="Task">Task</MenuItem>
                <MenuItem value="Promise">Promise</MenuItem>
              </Select>
            </FormControl>
            <DatePicker
              label="Commitment Date"
              value={formData.commitmentDate}
              onChange={(date) => setFormData((prev) => ({ ...prev, commitmentDate: date }))}
              format="MM/DD/YYYY"
              slotProps={{ textField: { fullWidth: true, required: true } }}
            />
            <DatePicker
              label="Final Delivery Date"
              value={formData.finalDeliveryDate}
              onChange={(date) => setFormData((prev) => ({ ...prev, finalDeliveryDate: date }))}
              format="MM/DD/YYYY"
              slotProps={{ textField: { fullWidth: true, required: true } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={
              createDeadlineMutation.isPending ||
              !formData.title.trim() ||
              !formData.commitmentDate ||
              !formData.finalDeliveryDate
            }
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
