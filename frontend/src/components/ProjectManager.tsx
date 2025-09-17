import React, { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
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
  Paper,
  Stack,
  Menu,
  ListItemIcon,
  ListItemText,
  Alert,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  MoreVert as MoreIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  FolderOpen as ProjectIcon,
  Assignment as TaskIcon,
  PlayArrow as ActivityIcon,
  Schedule as CalendarIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { projectsApi } from '../services/api';
import { Project } from '../types';

const ProjectStatusColors = {
  'active': '#4caf50',
  'on-hold': '#ff9800',
  'completed': '#2196f3',
  'cancelled': '#f44336',
} as const;

export default function ProjectManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#2196f3',
    status: 'active' as Project['status'],
    targetEndDate: null as dayjs.Dayjs | null,
    tags: '',
  });

  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', { includeArchived }],
    queryFn: () => projectsApi.getAll({ includeArchived }),
  });

  const createProjectMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) =>
      projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDialogOpen(false);
      setEditingProject(null);
      resetForm();
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      handleCloseMenu();
    },
  });

  const archiveProjectMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      projectsApi.archive(id, archived),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      handleCloseMenu();
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#2196f3',
      status: 'active',
      targetEndDate: null,
      tags: '',
    });
  };

  const handleOpenDialog = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setFormData({
        name: project.name,
        description: project.description || '',
        color: project.color,
        status: project.status,
        targetEndDate: project.targetEndDate ? dayjs(project.targetEndDate) : null,
        tags: project.tags.join(', '),
      });
    } else {
      setEditingProject(null);
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const projectData = {
      name: formData.name,
      description: formData.description,
      color: formData.color,
      status: formData.status,
      targetEndDate: formData.targetEndDate?.toISOString(),
      tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
    };

    if (editingProject) {
      updateProjectMutation.mutate({ id: editingProject._id, data: projectData });
    } else {
      createProjectMutation.mutate(projectData);
    }
  };

  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>, project: Project) => {
    setMenuAnchor(event.currentTarget);
    setSelectedProject(project);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setSelectedProject(null);
  };

  const handleArchiveProject = () => {
    if (selectedProject) {
      archiveProjectMutation.mutate({
        id: selectedProject._id,
        archived: !selectedProject.isArchived
      });
    }
  };

  const handleDeleteProject = () => {
    if (selectedProject) {
      deleteProjectMutation.mutate(selectedProject._id);
    }
  };

  const getStatusText = (status: Project['status']) => {
    switch (status) {
      case 'active': return 'Active';
      case 'on-hold': return 'On Hold';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  const activeProjects = projects.filter(p => !p.isArchived);
  const archivedProjects = projects.filter(p => p.isArchived);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Project Manager</Typography>
          <Typography variant="body2" color="text.secondary">
            Organize your tasks and activities into projects
          </Typography>
        </Box>
        <Stack direction="row" spacing={2}>
          <Button
            variant={includeArchived ? "contained" : "outlined"}
            onClick={() => setIncludeArchived(!includeArchived)}
            size="small"
          >
            {includeArchived ? 'Hide' : 'Show'} Archived
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            size="large"
          >
            New Project
          </Button>
        </Stack>
      </Box>

      {/* Quick Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="primary">{activeProjects.length}</Typography>
              <Typography variant="body2" color="text.secondary">Active Projects</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="success.main">
                {activeProjects.filter(p => p.status === 'completed').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">Completed</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="warning.main">
                {activeProjects.filter(p => p.status === 'on-hold').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">On Hold</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="text.secondary">{archivedProjects.length}</Typography>
              <Typography variant="body2" color="text.secondary">Archived</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Projects Grid */}
      {isLoading ? (
        <LinearProgress />
      ) : (
        <>
          {/* Active Projects */}
          {activeProjects.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ProjectIcon />
                Active Projects ({activeProjects.length})
              </Typography>
              <Grid container spacing={3}>
                {activeProjects.map((project) => (
                  <Grid item xs={12} sm={6} md={4} key={project._id}>
                    <Card 
                      sx={{ 
                        height: '100%',
                        border: `2px solid ${project.color}`,
                        borderRadius: 2,
                      }}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="h6" gutterBottom>
                              {project.name}
                            </Typography>
                            <Chip
                              label={getStatusText(project.status)}
                              size="small"
                              sx={{
                                backgroundColor: ProjectStatusColors[project.status],
                                color: 'white',
                                mb: 1
                              }}
                            />
                          </Box>
                          <IconButton 
                            size="small"
                            onClick={(e) => handleOpenMenu(e, project)}
                          >
                            <MoreIcon />
                          </IconButton>
                        </Box>

                        {project.description && (
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {project.description}
                          </Typography>
                        )}

                        {project.targetEndDate && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                            <CalendarIcon fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">
                              Target: {dayjs(project.targetEndDate).format('MMM DD, YYYY')}
                            </Typography>
                          </Box>
                        )}

                        {project.tags.length > 0 && (
                          <Box sx={{ mt: 2 }}>
                            {project.tags.map((tag) => (
                              <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                            ))}
                          </Box>
                        )}
                      </CardContent>
                      <CardActions>
                        <Button 
                          size="small" 
                          startIcon={<EditIcon />}
                          onClick={() => handleOpenDialog(project)}
                        >
                          Edit
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Archived Projects */}
          {includeArchived && archivedProjects.length > 0 && (
            <Box>
              <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ArchiveIcon />
                Archived Projects ({archivedProjects.length})
              </Typography>
              <Grid container spacing={3}>
                {archivedProjects.map((project) => (
                  <Grid item xs={12} sm={6} md={4} key={project._id}>
                    <Card 
                      sx={{ 
                        height: '100%',
                        opacity: 0.7,
                        border: `1px solid ${project.color}`,
                        borderRadius: 2,
                      }}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="h6" gutterBottom>
                              {project.name}
                            </Typography>
                            <Chip
                              label="Archived"
                              size="small"
                              color="default"
                              sx={{ mb: 1 }}
                            />
                          </Box>
                          <IconButton 
                            size="small"
                            onClick={(e) => handleOpenMenu(e, project)}
                          >
                            <MoreIcon />
                          </IconButton>
                        </Box>

                        {project.description && (
                          <Typography variant="body2" color="text.secondary">
                            {project.description}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Empty State */}
          {activeProjects.length === 0 && (
            <Paper sx={{ p: 6, textAlign: 'center' }}>
              <ProjectIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                No Projects Yet
              </Typography>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                Create your first project to organize your tasks and activities
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
                sx={{ mt: 2 }}
              >
                Create First Project
              </Button>
            </Paper>
          )}
        </>
      )}

      {/* Project Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingProject ? 'Edit Project' : 'Create New Project'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Project Name"
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
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  label="Status"
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Project['status'] })}
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="on-hold">On Hold</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="cancelled">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Project Color"
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Target End Date (optional)"
                value={formData.targetEndDate}
                onChange={(date) => setFormData({ ...formData, targetEndDate: date })}
                format="MM/DD/YYYY"
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Tags (comma-separated)"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="web-app, client-work, personal"
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
            disabled={!formData.name || createProjectMutation.isPending || updateProjectMutation.isPending}
          >
            {editingProject ? 'Update' : 'Create'} Project
          </Button>
        </DialogActions>
      </Dialog>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
      >
        <MenuItem onClick={() => { handleOpenDialog(selectedProject!); handleCloseMenu(); }}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Project</ListItemText>
        </MenuItem>
        
        <MenuItem onClick={handleArchiveProject}>
          <ListItemIcon>
            {selectedProject?.isArchived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>
            {selectedProject?.isArchived ? 'Unarchive' : 'Archive'} Project
          </ListItemText>
        </MenuItem>
        
        <MenuItem 
          onClick={handleDeleteProject}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete Project</ListItemText>
        </MenuItem>
      </Menu>

    </Box>
  );
}
