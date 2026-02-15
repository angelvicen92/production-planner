# OptiPlan - Production Planning Engine

## Overview

OptiPlan is a web application for daily production planning in audiovisual environments. The core purpose is to provide a constraint-based optimization engine that schedules tasks, resources, and spaces for production workflows. The system is designed as a foundational architecture where the planning engine is the central component, kept pure and isolated from UI and database concerns.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style variant)
- **State Management**: TanStack React Query for server state
- **Routing**: Wouter (lightweight React router)
- **Forms**: React Hook Form with Zod validation via @hookform/resolvers
- **Authentication**: Supabase Auth (email/password) handled client-side

The frontend is a single-page application located in `client/src/`. It follows a dashboard layout pattern with sidebar navigation. All views must handle loading, empty, and error states gracefully.

### Backend Architecture
- **Runtime**: Node.js with Express
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod schemas
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Authentication Middleware**: Bearer token validation via Supabase JWT verification

The Express server in `server/` acts as an API layer. It uses Supabase as the database backend with service role key for admin operations. All API routes (except health check) require authentication.

### Engine Architecture (Critical Design Decision)
The planning engine in `engine/` is designed as a **pure, isolated module**:
- No direct dependencies on Supabase or frontend code
- Receives strongly-typed `EngineInput` and returns `EngineOutput`
- Must support explaining infeasibility (not just failing silently)
- Currently contains stub implementation awaiting full constraint solver

The engine's data flow:
1. `buildInput.ts` transforms database entities into `EngineInput`
2. `solve.ts` processes input and generates schedule
3. `explain.ts` provides user-friendly infeasibility messages

### Data Model
Schema defined in `shared/schema.ts` using Drizzle:
- **plans**: Daily production plans with work hours, meal breaks, camera counts
- **zones/spaces**: Physical locations with priority levels
- **resources**: People (auxiliar, coach, presenter) with availability windows
- **task_templates**: Reusable task definitions
- **daily_tasks**: Scheduled tasks with status tracking
- **locks**: Manual overrides that pin tasks to specific times/resources/spaces

Key domain rules:
- Tasks with status `in_progress` or `done` are immutable
- Manual edits create lock entities rather than direct modifications
- No hardcoded domain concepts (e.g., specific studio names)

### Shared Code
The `shared/` directory contains code used by both frontend and backend:
- `schema.ts`: Drizzle table definitions and Zod schemas
- `routes.ts`: API route definitions with input/output types

## External Dependencies

### Supabase (Primary Backend Service)
- **PostgreSQL Database**: Primary data storage
- **Authentication**: Email/password auth with JWT tokens
- **Realtime**: Subscriptions to `daily_tasks` table changes for live updates
- **Row Level Security**: Configured in Supabase dashboard

Environment variables required:
- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Backend: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`

### Database
- PostgreSQL via Supabase
- Drizzle Kit for schema migrations (`drizzle.config.ts`)
- Connection via `DATABASE_URL` environment variable

### Build & Development
- Vite for frontend bundling with React plugin
- esbuild for server bundling (production build)
- TypeScript with strict mode enabled
- Path aliases: `@/` for client source, `@shared/` for shared code