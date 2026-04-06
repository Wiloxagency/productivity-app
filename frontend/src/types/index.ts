export interface Category {
  _id: string;
  name: string;
  description?: string;
  color: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  _id: string;
  name: string;
  description?: string;
  color: string;
  status: 'active' | 'on-hold' | 'completed' | 'cancelled';
  startDate: string;
  endDate?: string;
  targetEndDate?: string;
  priority: number;
  tags: string[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeadlineItem {
  _id: string;
  title: string;
  description?: string;
  type: 'Project' | 'Task' | 'Promise';
  commitmentDate: string;
  finalDeliveryDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  _id: string;
  name: string;
  description?: string;
  category: Category;
  project?: Project;
  quadrant: 1 | 2 | 3 | 4;
  isDefault: boolean;
  estimatedDuration: number;
  color: string;
  scheduleTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  _id: string;
  activity?: Activity;
  task?: Task;
  startTime: string;
  endTime?: string;
  duration: number;
  isPomodoro: boolean;
  isBreak: boolean;
  pomodoroCompleted: boolean;
  notes?: string;
  date: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  _id: string;
  title: string;
  description?: string;
  category: Category;
  project?: Project;
  quadrant: 1 | 2 | 3 | 4;
  status: 'Not Started' | 'Started' | 'Completed' | 'Cancelled';
  priority: number;
  estimatedTime: number;
  actualTime: number;
  dueDate?: string;
  completedAt?: string;
  plannedDate?: string;
  relatedTimeEntries: string[];
  tags: string[];
  scheduleTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedTask {
  task: Task;
  plannedStartTime?: string;
  plannedDuration?: number;
  actualDuration?: number;
  completed: boolean;
  priority: number;
}

export interface PlannedActivity {
  activity: Activity;
  plannedStartTime?: string;
  plannedDuration?: number;
  actualDuration?: number;
  completed: boolean;
  priority: number;
}

export interface DailyPlanning {
  _id: string;
  date: string;
  plannedTasks: PlannedTask[];
  plannedActivities: PlannedActivity[];
  goals: string[];
  notes?: string;
  productivity: {
    planned: {
      totalTasks: number;
      totalTime: number;
    };
    actual: {
      completedTasks: number;
      totalTime: number;
    };
    score: number;
  };
  personalGrowth: {
    planned: {
      totalItems: number;
      totalTime: number;
    };
    actual: {
      completedItems: number;
      totalTime: number;
    };
    score: number;
  };
  dayType: 'workday' | 'weekend' | 'holiday' | 'vacation';
  createdAt: string;
  updatedAt: string;
}

export interface ProductivityReport {
  period: {
    start: string;
    end: string;
  };
  totalDays: number;
  averageProductivity: number;
  totalPlannedTasks: number;
  totalCompletedTasks: number;
  totalPlannedTime: number;
  totalActualTime: number;
  dailyStats: Array<{
    date: string;
    productivity: DailyPlanning['productivity'];
    dayType: string;
  }>;
}

export interface DailySummary {
  totalTime: number;
  entriesCount: number;
  byQuadrant: Record<string, { time: number; count: number }>;
  byCategory: Record<string, { time: number; count: number }>;
  pomodorosCompleted: number;
}

export const QuadrantLabels = {
  1: 'Do',
  2: 'Schedule', 
  3: 'Delegate',
  4: 'Eliminate'
} as const;

export const QuadrantColors = {
  1: '#dc3545', // Red
  2: '#28a745', // Green
  3: '#ffc107', // Yellow
  4: '#6c757d'  // Gray
} as const;
