# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development commands

### Install dependencies
- API: `cd api && npm install`
- Frontend: `cd frontend && npm install`

### Run locally
- API dev server (nodemon, default port `5001`): `cd api && npm run dev`
- API production-style start: `cd api && npm start`
- Frontend dev server: `cd frontend && npm run dev`
  - Vite is configured for port `3001` in `frontend/vite.config.ts` (README mentions `5173`, but config currently uses `3001`).
  - `/api` calls from the frontend are proxied to `http://localhost:5001` by default (override with `VITE_API_PROXY_TARGET` if needed).
- Frontend preview build: `cd frontend && npm run preview`

### Build and lint
- Build frontend: `cd frontend && npm run build`
- Lint frontend: `cd frontend && npm run lint`
- Backend currently has no dedicated build or lint scripts in `api/package.json`.

### Database/bootstrap scripts
- Create env file: `cd api && cp .env.example .env`
- Seed default categories and activities: `cd api && node seed.js`
- Sample task script exists: `cd api && node create-sample-tasks.js`
  - Verify script data against current `Task` schema before use.

### Tests
- No automated test suite is currently configured in this repository.
- API test script is a placeholder that exits with an error: `cd api && npm test`
- No single-test command exists yet because no test runner is configured.

## High-level architecture

### Repository shape
- `api/`: Express + Mongoose backend
- `frontend/`: React + TypeScript + Vite client
- There is no root workspace runner; execute package commands from `api/` and `frontend/` directly.

### Backend architecture
- Entry point: `api/index.js`
  - Loads environment, connects to MongoDB, mounts all route modules under `/api/*`.
- Route modules in `api/routes/` define HTTP behavior by domain:
  - `activities`, `categories`, `projects`, `tasks`, `timeEntries`, `planning`, `default-selections`
- Data access pattern is direct model usage in route handlers (no separate service/repository layer).

### Core domain model relationships
- `Task` references `Category`, `Project`, and related `TimeEntry` documents.
- `Activity` references `Category` and optional `Project`.
- `TimeEntry` references either `activity` or `task` (mutually exclusive; enforced in model validation).
- `DailyPlanning` stores scheduled tasks/activities plus computed productivity and personal growth stats.
- `DefaultSelection` stores reusable scheduling presets used by the task scheduler flow.

### Planning and time-tracking behavior
- Productivity score is computed from tracked time vs planned time in planning routes.
- Work-time calculations treat break entries (`isBreak`) as work-time in summary/scoring logic.
- Marking a planned item complete updates planning state; it does not automatically flip task backlog status.

### Frontend architecture
- App composition (`frontend/src/App.tsx`):
  - React Router routes + React Query + MUI theme + date localization provider.
- Shared API layer (`frontend/src/services/api.ts`):
  - Centralizes all backend calls; page/components should use this module rather than ad-hoc axios calls.
- Page responsibilities:
  - `Dashboard`: daily rollups, active timer context, quadrant distribution
  - `TimeTracker`: active timer and manual/editable time-entry ledger
  - `TaskManager`: backlog CRUD, planning handoff, project/activity management views
  - `DailyPlanning`: scheduling UI, completion updates, productivity/personal growth displays
- Cross-page workflow components:
  - `PomodoroTimer` coordinates timer state with active `TimeEntry` APIs
  - `TaskScheduler` updates `DailyPlanning` and persists default scheduling selections
