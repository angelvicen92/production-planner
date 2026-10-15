-- Read-only certification supplement. Run with an authorized SQL connection.
-- This file contains SELECT only; do not apply migrations or change grants/RLS.
SELECT n.nspname AS schema_name,c.relname AS table_name,c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('daily_tasks','spaces','resource_items','plan_resource_items','task_templates','itinerant_teams','plan_task_template_snapshots')
ORDER BY c.relname;

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('daily_tasks','spaces','resource_items','plan_resource_items','task_templates','itinerant_teams','plan_task_template_snapshots')
ORDER BY tablename,policyname;

SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
AND table_name IN ('daily_tasks','spaces','resource_items','plan_resource_items','task_templates','itinerant_teams','plan_task_template_snapshots')
ORDER BY table_name,grantee,privilege_type;

SELECT c.conrelid::regclass AS referencing_table,c.confrelid::regclass AS referenced_table,c.conname,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
WHERE n.nspname='public' AND c.contype='f' ORDER BY c.conrelid::regclass::text,c.conname;

-- Coverage of historical payloads without returning their contents or identities.
SELECT plan_id,count(*) AS revision_count,count(*) FILTER(WHERE replay_snapshot_json IS NOT NULL) AS replay_payloads
FROM public.plan_config_revisions GROUP BY plan_id ORDER BY plan_id;
SELECT plan_id,count(*) AS stage_count,count(*) FILTER(WHERE snapshot_json IS NOT NULL) AS historical_payloads
FROM public.assisted_planning_stages GROUP BY plan_id ORDER BY plan_id;
-- Targeted historical JSON dependency extraction needs a separately reviewed,
-- column/path-limited SELECT for the concrete entity considered for archival.
-- Text substring matching against a numeric ID is not referential certification.
