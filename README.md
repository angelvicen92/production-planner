# OptiPlan - Supabase Migration & Setup

## Environment Secrets (Replit)

### Frontend
- `VITE_SUPABASE_URL`: Your Supabase Project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon/Public Key

### Backend
- `SUPABASE_URL`: Same as VITE_SUPABASE_URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Key (Admin)
- `SUPABASE_ANON_KEY`: Same as VITE_SUPABASE_ANON_KEY

## Database Setup
1. Go to your Supabase Project -> SQL Editor
2. Create a new query and paste the contents of `supabase/migrations/001_init.sql`
3. Run the query to create tables, enums, indexes, and RLS policies.

## Testing the App
1. **Login**: Use the email/password form to sign up or sign in.
2. **Plans**: Create a new plan from the dashboard.
3. **Tasks**: Go to plan details and add tasks from templates.
4. **Execution**: Use the "Start / Finish" buttons on tasks to see real-time updates and automatic "Execution Locks" being created.
5. **Optimization**: Click "Generate Planning" to trigger the engine stub.
