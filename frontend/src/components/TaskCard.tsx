import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  TextField,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as StartIcon,
  Schedule as PlanIcon,
  ArrowUpward as PriorityUpIcon,
  ArrowDownward as PriorityDownIcon,
  CheckCircle as CompleteIcon,
  Cancel as CancelIcon,
  PlayCircleOutline as StartTaskIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import { Task, QuadrantColors, QuadrantLabels } from '../types';

interface TaskCardProps {
  task: Task;
  compact?: boolean;
  priority?: number;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onPlan: (task: Task) => void;
  onStartTracking: (task: Task) => void;
  onStatusChange?: (taskId: string, status: Task['status']) => void;
  onPriorityChange?: (taskId: string, direction: 'up' | 'down') => void;
  onPrioritySet?: (taskId: string, targetPriority: number) => void;
  maxPriority?: number;
}

export default function TaskCard({
  task,
  compact = false,
  priority,
  onEdit,
  onDelete,
  onPlan,
  onStartTracking,
  onStatusChange,
  onPriorityChange,
  onPrioritySet,
  maxPriority,
}: TaskCardProps) {
  const [isPriorityEditing, setIsPriorityEditing] = useState(false);
  const [priorityInputValue, setPriorityInputValue] = useState('');
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const canEditPriority =
    !compact &&
    typeof priority === 'number' &&
    typeof onPrioritySet === 'function' &&
    typeof maxPriority === 'number' &&
    maxPriority > 0;

  const startPriorityEdit = () => {
    if (!canEditPriority || typeof priority !== 'number') return;
    setPriorityInputValue(String(priority));
    setIsPriorityEditing(true);
  };

  const cancelPriorityEdit = () => {
    setIsPriorityEditing(false);
    setPriorityInputValue('');
  };

  const submitPriorityEdit = () => {
    if (!canEditPriority || typeof priority !== 'number' || typeof onPrioritySet !== 'function' || typeof maxPriority !== 'number') {
      cancelPriorityEdit();
      return;
    }

    const parsedPriority = Number.parseInt(priorityInputValue, 10);
    if (!Number.isFinite(parsedPriority)) {
      cancelPriorityEdit();
      return;
    }

    const boundedPriority = Math.min(Math.max(parsedPriority, 1), maxPriority);
    if (boundedPriority !== priority) {
      onPrioritySet(task._id, boundedPriority);
    }

    cancelPriorityEdit();
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'Not Started': return '#6c757d';
      case 'Started': return '#007bff';
      case 'Completed': return '#28a745';
      case 'Cancelled': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'Not Started': return '⚪';
      case 'Started': return '🔵';
      case 'Completed': return '✅';
      case 'Cancelled': return '❌';
      default: return '⚪';
    }
  };

  return (
    <Card 
      sx={{ 
        mb: compact ? 1 : 2,
        border: `2px solid ${QuadrantColors[task.quadrant]}`,
        '&:hover': { boxShadow: 4 },
        transition: 'all 0.2s ease-in-out',
      }}
    >
      <CardContent sx={{ pb: compact ? 1 : 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Typography 
              variant={compact ? "subtitle1" : "h6"} 
              gutterBottom
              sx={{ 
                fontSize: compact ? '0.95rem' : '1.25rem',
                lineHeight: compact ? 1.3 : 1.6,
              }}
            >
              {task.title}
            </Typography>
            
            {!compact && task.description && (
              <Typography 
                variant="body2" 
                color="text.secondary" 
                gutterBottom
                sx={{ 
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {task.description}
              </Typography>
            )}
            
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
              {!compact && typeof priority === 'number' && (
                isPriorityEditing ? (
                  <TextField
                    size="small"
                    type="number"
                    value={priorityInputValue}
                    onChange={(event) => setPriorityInputValue(event.target.value)}
                    onBlur={submitPriorityEdit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        submitPriorityEdit();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelPriorityEdit();
                      }
                    }}
                    autoFocus
                    inputProps={{
                      min: 1,
                      max: maxPriority,
                      style: {
                        padding: '2px 4px',
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        color: 'white',
                      },
                    }}
                    sx={{
                      width: 56,
                      '& .MuiOutlinedInput-root': {
                        height: 22,
                        backgroundColor: 'primary.main',
                        color: 'white',
                        '& fieldset': { borderColor: 'primary.main' },
                        '&:hover fieldset': { borderColor: 'primary.main' },
                        '&.Mui-focused fieldset': { borderColor: 'primary.dark' },
                      },
                    }}
                  />
                ) : (
                  <Tooltip title={canEditPriority ? 'Click to edit priority' : 'Priority'}>
                    <Chip
                      label={`#${priority}`}
                      size="small"
                      onClick={canEditPriority ? startPriorityEdit : undefined}
                      sx={{
                        backgroundColor: 'primary.main',
                        color: 'white',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        height: '20px',
                        cursor: canEditPriority ? 'pointer' : 'default',
                      }}
                    />
                  </Tooltip>
                )
              )}
              <Chip
                label={`${getStatusIcon(task.status)} ${task.status}`}
                size="small"
                sx={{
                  backgroundColor: getStatusColor(task.status),
                  color: 'white',
                  fontSize: '0.7rem',
                  height: compact ? '20px' : '24px',
                }}
              />
              <Chip
                label={compact ? `Q${task.quadrant}` : QuadrantLabels[task.quadrant]}
                size="small"
                sx={{
                  backgroundColor: QuadrantColors[task.quadrant],
                  color: 'white',
                  fontSize: '0.7rem',
                  height: compact ? '20px' : '24px',
                }}
              />
              <Chip
                label={task.category.name}
                size="small"
                variant="outlined"
                sx={{ 
                  borderColor: task.category.color, 
                  color: task.category.color,
                  fontSize: '0.7rem',
                  height: compact ? '20px' : '24px',
                }}
              />
              {task.project && (
                <Chip
                  label={task.project.name}
                  size="small"
                  variant="outlined"
                  sx={{ 
                    borderColor: task.project.color, 
                    color: task.project.color,
                    fontSize: '0.7rem',
                    height: compact ? '20px' : '24px',
                  }}
                />
              )}
              <Chip
                label={formatTime(task.estimatedTime)}
                size="small"
                variant="outlined"
                sx={{ 
                  fontSize: '0.7rem',
                  height: compact ? '20px' : '24px',
                }}
              />
              {!compact && task.tags.slice(0, 2).map(tag => (
                <Chip 
                  key={tag} 
                  label={tag} 
                  size="small" 
                  variant="outlined" 
                  sx={{ 
                    fontSize: '0.7rem',
                    height: '20px',
                  }} 
                />
              ))}
            </Box>
            
            {!compact && task.dueDate && (
              <Typography variant="caption" color="warning.main" sx={{ fontWeight: 'medium' }}>
                📅 Due: {dayjs(task.dueDate).format('MMM D, YYYY')}
              </Typography>
            )}
          </Box>
          
          <Stack direction={compact ? "column" : "row"} spacing={compact ? 0.2 : 0.5}>
            {/* Priority Controls */}
            {onPriorityChange && !compact && (
              <>
                <Tooltip title="Increase Priority">
                  <IconButton
                    size="small"
                    onClick={() => onPriorityChange(task._id, 'up')}
                    sx={{ '&:hover': { backgroundColor: 'action.hover' } }}
                  >
                    <PriorityUpIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Decrease Priority">
                  <IconButton
                    size="small"
                    onClick={() => onPriorityChange(task._id, 'down')}
                    sx={{ '&:hover': { backgroundColor: 'action.hover' } }}
                  >
                    <PriorityDownIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
            
            {/* Status Controls */}
            {onStatusChange && (
              <>
                {task.status === 'Not Started' && (
                  <Tooltip title="Start Task">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => onStatusChange(task._id, 'Started')}
                      sx={{ '&:hover': { backgroundColor: 'primary.light' } }}
                    >
                      <StartTaskIcon fontSize={compact ? "small" : "medium"} />
                    </IconButton>
                  </Tooltip>
                )}
                
                {(task.status === 'Not Started' || task.status === 'Started') && (
                  <Tooltip title="Mark Complete">
                    <IconButton
                      size="small"
                      color="success"
                      onClick={() => onStatusChange(task._id, 'Completed')}
                      sx={{ '&:hover': { backgroundColor: 'success.light' } }}
                    >
                      <CompleteIcon fontSize={compact ? "small" : "medium"} />
                    </IconButton>
                  </Tooltip>
                )}
                
                {(task.status === 'Not Started' || task.status === 'Started') && (
                  <Tooltip title="Cancel Task">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => onStatusChange(task._id, 'Cancelled')}
                      sx={{ '&:hover': { backgroundColor: 'error.light' } }}
                    >
                      <CancelIcon fontSize={compact ? "small" : "medium"} />
                    </IconButton>
                  </Tooltip>
                )}
              </>
            )}
            
            <Tooltip title="Start Time Tracking">
              <IconButton
                size="small"
                color="primary"
                onClick={() => onStartTracking(task)}
                sx={{ '&:hover': { backgroundColor: 'primary.light' } }}
                disabled={task.status === 'Completed' || task.status === 'Cancelled'}
              >
                <StartIcon fontSize={compact ? "small" : "medium"} />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Plan for Date">
              <IconButton
                size="small"
                color="secondary"
                onClick={() => onPlan(task)}
                sx={{ '&:hover': { backgroundColor: 'secondary.light' } }}
                disabled={task.status === 'Completed' || task.status === 'Cancelled'}
              >
                <PlanIcon fontSize={compact ? "small" : "medium"} />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Edit Task">
              <IconButton
                size="small"
                color="info"
                onClick={() => onEdit(task)}
                sx={{ '&:hover': { backgroundColor: 'info.light' } }}
              >
                <EditIcon fontSize={compact ? "small" : "medium"} />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Delete Task">
              <IconButton
                size="small"
                color="error"
                onClick={() => onDelete(task._id)}
                sx={{ '&:hover': { backgroundColor: 'error.light' } }}
              >
                <DeleteIcon fontSize={compact ? "small" : "medium"} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}
