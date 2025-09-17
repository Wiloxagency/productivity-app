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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activitiesApi, categoriesApi } from '../services/api';
import { Activity, Category, QuadrantColors, QuadrantLabels } from '../types';

export default function ActivityManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    quadrant: 1,
    estimatedDuration: 25,
    color: '#1976d2',
  });

  const queryClient = useQueryClient();

  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => activitiesApi.getAll(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll,
  });


  const createActivityMutation = useMutation({
    mutationFn: activitiesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateActivityMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Activity> }) =>
      activitiesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setDialogOpen(false);
      setEditingActivity(null);
      resetForm();
    },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: activitiesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setDeleteConfirmOpen(false);
      setActivityToDelete(null);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: '',
      quadrant: 1,
      estimatedDuration: 25,
      color: '#1976d2',
    });
  };

  const handleOpenDialog = (activity?: Activity) => {
    if (activity) {
      setEditingActivity(activity);
      setFormData({
        name: activity.name,
        description: activity.description || '',
        category: activity.category._id,
        quadrant: activity.quadrant,
        estimatedDuration: activity.estimatedDuration,
        color: activity.color,
      });
    } else {
      setEditingActivity(null);
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const activityData = {
      name: formData.name,
      description: formData.description,
      category: formData.category, // API expects category ID string
      quadrant: formData.quadrant,
      estimatedDuration: formData.estimatedDuration,
      color: formData.color,
    } as any;

    if (editingActivity) {
      updateActivityMutation.mutate({ id: editingActivity._id, data: activityData });
    } else {
      createActivityMutation.mutate(activityData);
    }
  };

  const handleDeleteClick = (activityId: string) => {
    setActivityToDelete(activityId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (activityToDelete) {
      deleteActivityMutation.mutate(activityToDelete);
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
        <Typography variant="h5">Activities Management</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          size="large"
        >
          Add New Activity
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>Note:</strong> Activities are used for time tracking and can be auto-created from tasks or manually defined here. Projects are optional for activities.
        </Typography>
      </Alert>

      {/* Activities Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            All Activities ({activities.length})
          </Typography>
          
          {activities.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No activities yet
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Create your first activity to start tracking time!
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
                sx={{ mt: 2 }}
              >
                Add First Activity
              </Button>
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Activity</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Quadrant</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activities.map((activity) => (
                    <TableRow key={activity._id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              backgroundColor: activity.color,
                            }}
                          />
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {activity.name}
                            </Typography>
                            {activity.description && (
                              <Typography variant="caption" color="text.secondary">
                                {activity.description}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: activity.category.color,
                            }}
                          />
                          <Typography variant="body2">
                            {activity.category.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={`Q${activity.quadrant}`}
                          size="small"
                          sx={{
                            backgroundColor: QuadrantColors[activity.quadrant],
                            color: 'white',
                            width: 32,
                            height: 24,
                            fontSize: '0.7rem',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatTime(activity.estimatedDuration)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenDialog(activity)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteClick(activity._id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Activity Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingActivity ? 'Edit Activity' : 'Create New Activity'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Activity Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
              <TextField
                fullWidth
                label="Estimated Duration (minutes)"
                type="number"
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({ ...formData, estimatedDuration: Number(e.target.value) })}
                inputProps={{ min: 5, max: 480 }}
                required
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Color"
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                helperText="Choose a color to represent this activity in timers and reports"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={
              !formData.name || 
              !formData.category || 
              createActivityMutation.isPending || 
              updateActivityMutation.isPending
            }
          >
            {editingActivity ? 'Update' : 'Create'} Activity
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={deleteConfirmOpen} 
        onClose={() => { setDeleteConfirmOpen(false); setActivityToDelete(null); }} 
        maxWidth="xs" 
        fullWidth
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this activity? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteConfirmOpen(false); setActivityToDelete(null); }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            disabled={deleteActivityMutation.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
