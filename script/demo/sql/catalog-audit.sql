-- Read-only: run using the confirmed project's SQL editor or psql.
-- Export the single JSON value as catalog-audit.json. No Auth names or credentials.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
 'format',1,'observedAt',now(),'database',current_database(),
 'columns',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default,is_identity,CASE WHEN column_name='id' THEN pg_get_serial_sequence(format('%I.%I',table_schema,table_name),column_name) ELSE NULL END AS sequence FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position) x),
 'tables',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname) x),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname) x),
 'grants',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role','PUBLIC') ORDER BY table_name,grantee,privilege_type) x),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'bypassRLS',rolbypassrls)) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated)) FROM pg_constraint WHERE connamespace='public'::regnamespace),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'identity',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'securityDefiner',p.prosecdef,'config',p.proconfig,'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE'))) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'),
 'sequences',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT schemaname,sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename) x),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'definition',pg_get_triggerdef(oid))) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
 'counts',jsonb_build_object('plans',(SELECT count(*) FROM public.plans),'contestants',(SELECT count(*) FROM public.contestants),'daily_tasks',(SELECT count(*) FROM public.daily_tasks),'planning_runs',(SELECT count(*) FROM public.planning_runs)),
 'authUserCount',(SELECT count(*) FROM auth.users),
 'appRoleCounts',(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT r.key,count(u.user_id) AS users FROM public.roles r LEFT JOIN public.user_roles u ON u.role_id=r.id GROUP BY r.key ORDER BY r.key) x)
) AS audit;
COMMIT;
