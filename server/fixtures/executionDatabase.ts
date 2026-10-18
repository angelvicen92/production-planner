import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const actor = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export async function executionDatabase({ incidents = false, scopeFix = true } = {}) {
  const db = new PGlite();
  // Focused PostgreSQL fixture. The native rehearsal separately applies every migration.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TYPE task_status AS ENUM('pending','in_progress','done','interrupted','cancelled');
    CREATE TABLE roles(id integer PRIMARY KEY,key text); CREATE TABLE user_roles(user_id uuid,role_id integer REFERENCES roles);
    INSERT INTO roles VALUES(1,'admin'),(2,'production'),(3,'aux'),(4,'viewer');
    INSERT INTO user_roles VALUES('${actor(1)}',1),('${actor(2)}',2),('${actor(3)}',3),('${actor(4)}',4);
    CREATE TABLE plans(id bigint PRIMARY KEY,date date,status text); INSERT INTO plans VALUES(1,'2026-10-30','published'),(2,'2026-10-31','published');
    CREATE TABLE program_settings(id integer PRIMARY KEY,clock_mode text,simulated_time text,simulated_set_at timestamptz); INSERT INTO program_settings VALUES(1,'auto',NULL,NULL);
    CREATE TABLE daily_tasks(id bigint PRIMARY KEY,plan_id bigint REFERENCES plans,template_id integer,contestant_id integer,space_id integer,zone_id integer,status task_status,start_planned text,end_planned text,assigned_resource_ids jsonb,duration_override integer,cameras_override integer,location_label text,start_real text,end_real text,start_real_seconds integer,end_real_seconds integer,paused_at_seconds integer,paused_at_hhmm text,paused_total_seconds integer DEFAULT 0);
    INSERT INTO daily_tasks(id,plan_id,space_id,zone_id,status,start_planned,end_planned) VALUES(1,1,10,20,'pending','09:00','09:15'),(2,1,11,21,'pending','09:15','09:30'),(3,2,10,20,'pending','09:00','09:15');
    CREATE TABLE task_status_events(id serial PRIMARY KEY,plan_id integer REFERENCES plans,task_id integer REFERENCES daily_tasks,status task_status,changed_by text,time_real text,created_at timestamptz DEFAULT now());
    CREATE TABLE locks(id serial PRIMARY KEY,plan_id integer REFERENCES plans,task_id integer REFERENCES daily_tasks,lock_type text,locked_start text,locked_end text,created_by text,reason text);
    CREATE TABLE user_entity_links(user_id uuid,entity_type text,entity_id bigint,is_primary boolean,id bigserial);
    CREATE TABLE staff_people(id bigint PRIMARY KEY,is_active boolean,name text DEFAULT 'Operador',role_type text DEFAULT 'production'); INSERT INTO staff_people VALUES(5,true);
    CREATE TABLE plan_staff_assignments(plan_id bigint,staff_person_id bigint,scope_type text,zone_id bigint,space_id bigint,staff_role text NOT NULL);
    CREATE TABLE plan_zone_staff_mode(plan_id bigint,zone_id bigint,mode text);
    CREATE TABLE plan_space_settings(plan_id bigint,space_id bigint,zone_id bigint,name text DEFAULT 'Espacio');
    CREATE TABLE resource_items(id bigint PRIMARY KEY,is_active boolean,name text DEFAULT 'Recurso');
    CREATE TABLE plan_resource_items(id bigint PRIMARY KEY,plan_id bigint,resource_item_id bigint,is_available boolean,name text);
    CREATE TABLE plan_space_resource_assignments(plan_id bigint,space_id bigint,plan_resource_item_id bigint);
    CREATE TABLE plan_zone_resource_assignments(plan_id bigint,zone_id bigint,plan_resource_item_id bigint);
    CREATE TABLE assisted_planning_sessions(plan_id integer,status text,active_stage_id bigint,draft_fingerprint text);
    CREATE TABLE assisted_planning_stages(id bigint PRIMARY KEY,plan_id integer,ordinal integer,archived_at timestamptz,snapshot_json jsonb,snapshot_fingerprint text);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated,service_role;`);
  await db.exec(readFileSync('supabase/migrations/093_live_task_execution.sql', 'utf8'));
  if (incidents) {
    await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
      CREATE TABLE zones(id bigint PRIMARY KEY); CREATE TABLE spaces(id bigint PRIMARY KEY);
      INSERT INTO zones VALUES(20),(21); INSERT INTO spaces VALUES(10),(11);
      CREATE TABLE contestants(id bigint PRIMARY KEY,plan_id bigint,name text);
      CREATE TABLE task_templates(id integer PRIMARY KEY,name text); INSERT INTO task_templates VALUES(1,'Actividad');
      UPDATE daily_tasks SET template_id=1;
      CREATE TABLE plan_zone_settings(plan_id bigint,zone_id bigint,name text);
      INSERT INTO plan_zone_settings VALUES(1,20,'Plató'),(1,21,'Otro plató');
      INSERT INTO plan_space_settings VALUES(1,10,20),(1,11,21);`);
    for (let n=1;n<=10;n++) await db.query('INSERT INTO auth.users VALUES($1)', [actor(n)]);
    await db.exec(readFileSync('supabase/migrations/094_operational_incidents.sql', 'utf8'));
  }
  // scopeFix=false is exclusively the historical causal reproduction.
  if (scopeFix) await db.exec(readFileSync('supabase/migrations/096_production_execution_scope.sql', 'utf8'));
  return db;
}
