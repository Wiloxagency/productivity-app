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
  autoStop?: boolean;
  aliases?: string[];
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
  plannedEnd?: string;
  autoStop?: boolean;
  sequenceId?: string;
  source?: 'user' | 'assistant' | 'auto';
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  _id: string;
  title: string;
  description?: string;
  category: Category;
  project?: Project;
  parentTask?: { _id: string; title: string } | string | null;
  source?: 'user' | 'assistant';
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

// ---- AI assistant
export interface AssistantActionSummary {
  id: string;
  summary: string;
  undone: boolean;
  tool?: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  actions: AssistantActionSummary[];
  pending?: boolean;
  error?: boolean;
}

export interface AssistantConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface AssistantNextSuggestion {
  source: 'queue' | 'plan';
  reason: string;
  itemType: 'task' | 'activity';
  id: string;
  title: string;
  minutes?: number;
  startsAt?: string | null;
  startsAtLocal?: string | null;
  project?: string;
  autoStart?: boolean;
}

export interface AssistantLiveState {
  active: {
    id: string;
    title: string;
    startTime: string;
    plannedEnd?: string;
    plannedEndLocal?: string | null;
    autoStop: boolean;
  } | null;
  queue: Array<{ id: string; title: string; minutes: number; status: string }>;
  next: AssistantNextSuggestion | null;
}

export interface AssistantSettings {
  timezone: string;
  workdayStart: string;
  workdayEnd: string;
  lunchTime: string;
  lunchDuration: number;
  lunchActivity?: string | null;
  bufferMinutes: number;
  defaultTaskMinutes: number;
  customInstructions: string;
}
