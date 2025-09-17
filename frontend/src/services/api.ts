import axios from 'axios';
import { 
  Activity, 
  Category, 
  Project,
  TimeEntry, 
  Task, 
  DailyPlanning, 
  ProductivityReport, 
  DailySummary 
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Categories API
export const categoriesApi = {
  getAll: () => api.get<Category[]>('/categories').then(res => res.data),
  getById: (id: string) => api.get<Category>(`/categories/${id}`).then(res => res.data),
  create: (category: Partial<Category>) => api.post<Category>('/categories', category).then(res => res.data),
  update: (id: string, category: Partial<Category>) => api.put<Category>(`/categories/${id}`, category).then(res => res.data),
  delete: (id: string) => api.delete(`/categories/${id}`).then(res => res.data),
};

// Activities API
export const activitiesApi = {
  getAll: (params?: { category?: string; quadrant?: number }) => 
    api.get<Activity[]>('/activities', { params }).then(res => res.data),
  getById: (id: string) => api.get<Activity>(`/activities/${id}`).then(res => res.data),
  getByQuadrant: (quadrant: number) => api.get<Activity[]>(`/activities/quadrant/${quadrant}`).then(res => res.data),
  create: (activity: Partial<Activity>) => api.post<Activity>('/activities', activity).then(res => res.data),
  update: (id: string, activity: Partial<Activity>) => api.put<Activity>(`/activities/${id}`, activity).then(res => res.data),
  delete: (id: string) => api.delete(`/activities/${id}`).then(res => res.data),
};

// Time Entries API
export const timeEntriesApi = {
  getAll: (params?: { date?: string; activity?: string; isActive?: boolean }) => 
    api.get<TimeEntry[]>('/time-entries', { params }).then(res => res.data),
  getActive: () => api.get<TimeEntry | null>('/time-entries/active').then(res => res.data),
  start: (data: { activity: string; isPomodoro?: boolean; notes?: string; localDate?: string }) => 
    api.post<TimeEntry>('/time-entries/start', data).then(res => res.data),
  startWithTask: (data: { task: string; isPomodoro?: boolean; notes?: string; localDate?: string }) => 
    api.post<TimeEntry>('/time-entries/start-task', data).then(res => res.data),
  switchActivity: (id: string, data: { activity: string; notes?: string }) => 
    api.put<TimeEntry>(`/time-entries/switch-activity/${id}`, data).then(res => res.data),
  switchToTask: (id: string, data: { task: string; notes?: string }) => 
    api.put<TimeEntry>(`/time-entries/switch-task/${id}`, data).then(res => res.data),
  stop: (id: string, data?: { notes?: string }) => 
    api.put<TimeEntry>(`/time-entries/stop/${id}`, data).then(res => res.data),
  stopAll: () => api.put('/time-entries/stop-all').then(res => res.data),
  getDailySummary: (date: string) => 
    api.get<DailySummary>(`/time-entries/daily-summary/${date}`).then(res => res.data),
  update: (id: string, data: Partial<TimeEntry>) => api.put<TimeEntry>(`/time-entries/${id}`, data).then(res => res.data),
  delete: (id: string) => api.delete(`/time-entries/${id}`).then(res => res.data),
  createManual: (data: any) => api.post<TimeEntry>('/time-entries/manual', data).then(res => res.data),
};

// Tasks API
export const tasksApi = {
  getAll: (params?: { status?: string; quadrant?: number; category?: string; plannedDate?: string }) => 
    api.get<Task[]>('/tasks', { params }).then(res => res.data),
  getBacklog: () => api.get<Task[]>('/tasks/backlog').then(res => res.data),
  getDaily: (date: string) => api.get<Task[]>(`/tasks/daily/${date}`).then(res => res.data),
  create: (task: Partial<Task>) => api.post<Task>('/tasks', task).then(res => res.data),
  update: (id: string, task: Partial<Task>) => api.put<Task>(`/tasks/${id}`, task).then(res => res.data),
  plan: (id: string, data: { plannedDate: string; priority?: number }) => 
    api.put<Task>(`/tasks/${id}/plan`, data).then(res => res.data),
  reorder: (taskIds: string[]) => api.put<Task[]>('/tasks/reorder', { taskIds }).then(res => res.data),
  delete: (id: string) => api.delete(`/tasks/${id}`).then(res => res.data),
};

// Projects API
export const projectsApi = {
  getAll: (params?: { status?: string; includeArchived?: boolean }) => 
    api.get<Project[]>('/projects', { params }).then(res => res.data),
  getById: (id: string) => api.get<{ project: Project; activities: Activity[]; tasks: Task[] }>(`/projects/${id}`).then(res => res.data),
  create: (project: Partial<Project>) => api.post<Project>('/projects', project).then(res => res.data),
  update: (id: string, project: Partial<Project>) => api.put<Project>(`/projects/${id}`, project).then(res => res.data),
  delete: (id: string) => api.delete(`/projects/${id}`).then(res => res.data),
  archive: (id: string, archived: boolean) => api.patch<Project>(`/projects/${id}/archive`, { archived }).then(res => res.data),
  getStats: (id: string) => api.get(`/projects/${id}/stats`).then(res => res.data),
};

// Planning API
export const planningApi = {
  getPlanning: (date: string) => api.get<DailyPlanning>(`/planning/${date}`).then(res => res.data),
  updatePlanning: (date: string, planning: Partial<DailyPlanning>) => 
    api.post<DailyPlanning>(`/planning/${date}`, planning).then(res => res.data),
  completeTask: (date: string, taskId: string, data: { completed: boolean; actualDuration?: number }) => 
    api.put<DailyPlanning>(`/planning/${date}/task/${taskId}/complete`, data).then(res => res.data),
  completeActivity: (date: string, activityId: string, data: { completed: boolean; actualDuration?: number }) => 
    api.put<DailyPlanning>(`/planning/${date}/activity/${activityId}/complete`, data).then(res => res.data),
  getReport: (startDate: string, endDate: string) => 
    api.get<ProductivityReport>(`/planning/reports/${startDate}/${endDate}`).then(res => res.data),
};

// Default Selections API for Task Scheduler
// Backend returns { tasks: [{ task, plannedDuration }], activities: [{ activity, plannedDuration }] }
// and expects save payload { selectedTasks: [{ task, plannedDuration }], selectedActivities: [{ activity, plannedDuration }] }
export const defaultSelectionsApi = {
  get: () => api.get<{
    tasks: Array<{ task: any; plannedDuration: number }>;
    activities: Array<{ activity: any; plannedDuration: number }>;
  }>('/default-selections').then(res => res.data),
  save: (payload: { selectedTasks: Array<{ task: string; plannedDuration: number }>; selectedActivities: Array<{ activity: string; plannedDuration: number }> }) => 
    api.post('/default-selections', payload).then(res => res.data),
  delete: () => api.delete('/default-selections').then(res => res.data),
};

export default api;
