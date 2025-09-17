import React, { useState, useEffect } from 'react';
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
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { planningApi } from '../services/api';

interface GoalsManagerProps {
  open: boolean;
  onClose: () => void;
  date: string;
  existingGoals: string[];
  existingNotes: string;
}

export default function GoalsManager({
  open,
  onClose,
  date,
  existingGoals,
  existingNotes,
}: GoalsManagerProps) {
  const [goals, setGoals] = useState<string[]>([]);
  const [newGoal, setNewGoal] = useState('');
  const [notes, setNotes] = useState('');

  const queryClient = useQueryClient();

  // Initialize with existing data when dialog opens
  useEffect(() => {
    if (open) {
      setGoals([...existingGoals]);
      setNotes(existingNotes);
    }
  }, [open, existingGoals, existingNotes]);

  const updatePlanningMutation = useMutation({
    mutationFn: (planningData: any) =>
      planningApi.updatePlanning(date, planningData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyPlanning'] });
      onClose();
    },
  });

  const handleAddGoal = () => {
    if (newGoal.trim()) {
      setGoals(prev => [...prev, newGoal.trim()]);
      setNewGoal('');
    }
  };

  const handleDeleteGoal = (index: number) => {
    setGoals(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    updatePlanningMutation.mutate({
      goals,
      notes,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddGoal();
    }
  };

  const getDayType = (date: string): string => {
    const day = dayjs(date);
    const dayOfWeek = day.day();
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 'weekend';
    }
    return 'workday';
  };

  const getGoalSuggestions = (dayType: string): string[] => {
    if (dayType === 'weekend') {
      return [
        'Complete a personal project',
        'Spend quality time with family',
        'Exercise or outdoor activity',
        'Read a book or learn something new',
        'Organize and declutter space',
      ];
    }
    
    return [
      'Complete 3 high-priority tasks',
      'Focus on Q2 (important, not urgent) activities',
      'Review and respond to important emails',
      'Make progress on key project',
      'Learn something new in my field',
      'Network or connect with a colleague',
    ];
  };

  const dayType = getDayType(date);
  const suggestions = getGoalSuggestions(dayType);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        🎯 Daily Goals & Notes for {dayjs(date).format('MMMM D, YYYY')}
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={3}>
          {/* Left Column: Goals */}
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>
              📝 Daily Goals
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Set 3-5 specific, achievable goals for the day
            </Typography>

            {/* Add New Goal */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                fullWidth
                size="small"
                label="Add a new goal"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="e.g., Complete project proposal"
              />
              <IconButton
                color="primary"
                onClick={handleAddGoal}
                disabled={!newGoal.trim()}
              >
                <AddIcon />
              </IconButton>
            </Box>

            {/* Current Goals */}
            {goals.length > 0 ? (
              <List>
                {goals.map((goal, index) => (
                  <ListItem key={index} divider>
                    <ListItemText
                      primary={
                        <Typography variant="body1">
                          {index + 1}. {goal}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        color="error"
                        size="small"
                        onClick={() => handleDeleteGoal(index)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Alert severity="info">
                No goals set yet. Add your first goal above!
              </Alert>
            )}

            {/* Goal Suggestions */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                💡 Suggestions for {dayType}:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {suggestions.map((suggestion, index) => (
                  <Chip
                    key={index}
                    label={suggestion}
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      if (!goals.includes(suggestion)) {
                        setGoals(prev => [...prev, suggestion]);
                      }
                    }}
                    sx={{ cursor: 'pointer', fontSize: '0.75rem' }}
                  />
                ))}
              </Box>
            </Box>
          </Grid>

          {/* Right Column: Notes */}
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>
              📋 Planning Notes
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Add context, reminders, or thoughts about your day
            </Typography>

            <TextField
              fullWidth
              multiline
              rows={12}
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Today's priorities:
• Focus on high-impact tasks
• Avoid distractions during deep work blocks
• Take regular breaks

Reminders:
• Team meeting at 2 PM
• Call client about project update
• Review weekly goals

Thoughts:
• Feeling energized about new project
• Need to delegate more routine tasks"
              sx={{
                '& .MuiInputBase-input': {
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                },
              }}
            />

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                💡 <strong>Pro tip:</strong> Use notes to capture context that will help you stay focused and make decisions throughout the day.
              </Typography>
            </Alert>
          </Grid>
        </Grid>

        {/* Summary */}
        <Box sx={{ mt: 3, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            📊 Planning Summary
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Typography variant="body2">
                Goals: <strong>{goals.length}</strong>
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2">
                Notes: <strong>{notes.length}</strong> characters
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={updatePlanningMutation.isPending}
          startIcon={<SaveIcon />}
        >
          Save Goals & Notes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
