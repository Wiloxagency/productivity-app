# Personal Productivity App

A comprehensive personal productivity application with time tracking, task management, and productivity analytics. Built with Node.js/Express backend and React/TypeScript frontend.

## Features

### ✅ Implemented
- **Pomodoro Timer**: Customizable timer with activity selection
- **Time Tracking**: Automatic and manual time entry recording
- **Activity Management**: Categorized activities with Eisenhower Matrix quadrants
- **Dashboard**: Real-time overview of daily progress and productivity
- **Database Integration**: MongoDB Atlas with comprehensive data models

### 🚧 Coming Soon
- **Task Management**: Backlog with drag-and-drop reordering
- **Daily Planning**: Move tasks from backlog to daily schedule
- **Productivity Reports**: Detailed analytics and trends
- **Complete Task Management Workflow**

## Tech Stack

### Backend (API)
- **Node.js** with Express.js
- **MongoDB Atlas** with Mongoose ODM
- **RESTful API** with comprehensive endpoints
- **Environment-based configuration**

### Frontend (Dashboard)
- **React 18** with TypeScript
- **Vite** for fast development
- **Material-UI (MUI)** for modern design
- **React Query** for state management
- **React Router** for navigation

## Project Structure

```
productivity-app/
├── api/                    # Node.js Express API
│   ├── models/            # Mongoose schemas
│   ├── routes/            # API endpoints
│   ├── middleware/        # Express middleware
│   ├── .env              # Environment variables
│   ├── index.js          # Main server file
│   ├── seed.js           # Database seeding script
│   └── package.json
└── frontend/              # React TypeScript app
    ├── src/
    │   ├── components/    # Reusable components
    │   ├── pages/         # Route components
    │   ├── services/      # API integration
    │   ├── types/         # TypeScript definitions
    │   ├── hooks/         # Custom React hooks
    │   └── context/       # React context providers
    ├── vite.config.ts     # Vite configuration
    └── package.json
```

## Database Schema

### Categories
- Work, Personal Development, Health & Fitness, Domestic Tasks, Meals, Leisure, Rest

### Activities
- Organized by categories and Eisenhower Matrix quadrants:
  - **Q1**: Urgent & Important (Crisis management)
  - **Q2**: Not Urgent & Important (Prevention, planning)
  - **Q3**: Urgent & Not Important (Interruptions)
  - **Q4**: Not Urgent & Not Important (Time wasters)

### Time Entries
- Track start/end times with automatic duration calculation
- Link to activities and support Pomodoro technique
- Daily aggregation and reporting

### Tasks & Planning
- Backlog management with priority ordering
- Daily planning with estimated vs actual time tracking
- Productivity scoring based on completion rates

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB Atlas account (provided connection string)
- npm or yarn package manager

### Setup

1. **Clone and Install Dependencies**
   ```bash
   cd ~/projects/productivity-app
   
   # Install API dependencies
   cd api
   npm install
   
   # Install Frontend dependencies
   cd ../frontend
   npm install
   ```

2. **Environment Configuration**
   Copy the example environment file and configure your database connection:
   ```bash
   cd api
   cp .env.example .env
   ```
   
   Edit `.env` and replace the placeholder values with your actual configuration:
   - Set `MONGODB_URI` to your MongoDB Atlas connection string
   - Generate a secure `JWT_SECRET` for production use
   - Configure other environment variables as needed

3. **Seed Database** (Already completed)
   ```bash
   cd api
   node seed.js
   ```

4. **Start Development Servers**
   
   Terminal 1 - API Server:
   ```bash
   cd api
   npm run dev
   ```
   
   Terminal 2 - Frontend Server:
   ```bash
   cd frontend
   npm run dev
   ```

5. **Access Application**
   - Frontend: http://localhost:5173
   - API: http://localhost:5000

## Usage Guide

### Getting Started
1. **Dashboard**: Overview of daily progress and quick access to timer
2. **Time Tracker**: Start Pomodoro sessions and view time entries
3. **Task Manager**: Manage backlog and organize tasks (Coming Soon)
4. **Daily Planning**: Plan your day and track completion (Coming Soon)
5. **Reports**: View productivity analytics (Coming Soon)

### Time Tracking Workflow
1. Select an activity from the predefined list
2. Start the Pomodoro timer (25 minutes default)
3. Work on the activity until timer completes
4. Review time entries and add notes if needed
5. View daily progress on the dashboard

### Eisenhower Matrix Integration
All activities are organized into four quadrants:
- **Q1 (Red)**: Urgent & Important - Handle immediately
- **Q2 (Green)**: Not Urgent & Important - Schedule and focus
- **Q3 (Yellow)**: Urgent & Not Important - Delegate if possible
- **Q4 (Gray)**: Not Urgent & Not Important - Minimize

## API Endpoints

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create new category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Activities
- `GET /api/activities` - Get all activities (with filtering)
- `GET /api/activities/quadrant/:quadrant` - Get activities by quadrant
- `POST /api/activities` - Create new activity
- `PUT /api/activities/:id` - Update activity
- `DELETE /api/activities/:id` - Delete activity

### Time Entries
- `GET /api/time-entries` - Get time entries (with filtering)
- `GET /api/time-entries/active` - Get currently active entry
- `POST /api/time-entries/start` - Start new time entry
- `PUT /api/time-entries/stop/:id` - Stop time entry
- `GET /api/time-entries/daily-summary/:date` - Get daily summary

### Tasks
- `GET /api/tasks/backlog` - Get backlog tasks
- `GET /api/tasks/daily/:date` - Get daily planned tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id/plan` - Move task to daily planning
- `PUT /api/tasks/reorder` - Reorder backlog priorities

### Planning
- `GET /api/planning/:date` - Get daily planning
- `POST /api/planning/:date` - Update daily planning
- `PUT /api/planning/:date/task/:taskId/complete` - Mark task complete
- `GET /api/planning/reports/:startDate/:endDate` - Get productivity reports

## Development Notes

- The app uses MongoDB Atlas for data persistence
- Frontend uses TypeScript for type safety
- Material-UI provides a modern, responsive design system
- React Query handles API state management and caching
- The Pomodoro timer integrates with time tracking automatically

## Next Steps

To continue development:
1. Complete the Task Manager page with full CRUD operations
2. Implement the Daily Planning workflow
3. Add comprehensive reporting and analytics
4. Add user authentication if needed for multi-user support
5. Implement notifications and reminders
6. Add data export/import functionality

## Database Schema

The application uses MongoDB with the following collections:
- **categories**: Activity categories (Work, Personal Development, etc.)
- **activities**: Individual activities organized by Eisenhower Matrix quadrants
- **timeentries**: Time tracking records with start/end times
- **tasks**: Task management with backlog and daily planning
- **dailyplannings**: Daily planning and productivity tracking

The initial seed data includes 7 categories and 16 pre-configured activities covering all aspects of daily life.
