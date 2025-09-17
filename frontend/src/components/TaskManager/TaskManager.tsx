import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
} from '@mui/material';
import {
  Add as AddIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { tasksApi, categoriesApi } from '../../services/api';
import type { Task } from '../../types';

export default function TaskManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  const { data: backlogTasks = [] } = useQuery({
    queryKey: ['backlogTasks'],
    queryFn: () => tasksApi.getBacklog(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll,
  });

  const handleOpenDialog = (task?: Task) => {
    setEditingTask(task || null);
    setDialogOpen(true);
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

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Backlog Tasks ({backlogTasks.length})
        </Typography>
        {backlogTasks.length === 0 ? (
          <Typography color="text.secondary">
            No tasks in backlog. Create your first task!
          </Typography>
        ) : (
          <Box>
            {backlogTasks.map((task) => (
              <Box
                key={task._id}
                sx={{
                  p: 2,
                  mb: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                }}
                onClick={() => handleOpenDialog(task)}
              >
                <Typography variant="subtitle1" fontWeight="medium">
                  {task.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {task.description}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
