import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildA2ImportRows} from './a2ImportRows';
import {literal,quote,identifier} from './sql';

export function buildA2ImportSQL(date:string,offset=0,project='dyqusivzgxebkxkwohwn'){
 if(!/^[a-z]{20}$/.test(project))throw Error('Invalid Supabase project ref');
 const dataset=buildA2ImportRows(date,offset),planId=dataset.input.planId;
 const statements=[`-- Canonical A2, unscheduled. No accepted stages, runs or solution times.
-- Preflight must match the real connection host. Session settings are operator assertions.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(78004,${planId});
LOCK TABLE ${dataset.order.map(t=>`public.${identifier(t)}`).join(',')},public.program_settings,public.optimizer_settings IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF current_setting('optiplan.confirmed_demo_project',true) IS DISTINCT FROM ${quote(project)} THEN RAISE EXCEPTION 'DEMO_TARGET_CONFIRMATION_REQUIRED'; END IF;
 IF coalesce(current_setting('optiplan.backup_sha256',true),'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'VERIFIED_BACKUP_REQUIRED'; END IF;
 IF coalesce(current_setting('optiplan.security_approved',true),'') <> 'yes' THEN RAISE EXCEPTION 'SECURITY_PREFLIGHT_REQUIRED'; END IF;
 IF current_setting('optiplan.import_approved',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'IMPORT_APPROVAL_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_id=nullif(current_setting('optiplan.demo_actor',true),'')::uuid AND r.key IN ('admin','production')) THEN RAISE EXCEPTION 'AUTHORIZED_DEMO_ACTOR_REQUIRED'; END IF;
END $$;
CREATE TEMP TABLE a2_existing_rows(table_name text, row_id bigint, row_json jsonb) ON COMMIT DROP;`];
 // Preserve all pre-existing rows in touched tables, including both global defaults.
 for(const table of [...dataset.order,'program_settings','optimizer_settings'])statements.push(`INSERT INTO a2_existing_rows SELECT ${quote(table)},id,to_jsonb(t) FROM public.${identifier(table)} t;`);
 for(const table of dataset.order){
  const ids=dataset.tables[table].filter(r=>r.id!=null).map(r=>r.id);
  if(ids.length)statements.push(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.${identifier(table)} WHERE id IN (${ids.join(',')})) THEN RAISE EXCEPTION 'A2_ID_COLLISION:${table}'; END IF; END $$;`);
  if(dataset.tables[table].some(r=>r.plan_id!=null))statements.push(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.${identifier(table)} WHERE plan_id=${planId}) THEN RAISE EXCEPTION 'A2_DAY_COLLISION:${table}'; END IF; END $$;`);
 }
 statements.push(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.resource_types WHERE code IN (${dataset.tables.resource_types.map(r=>quote(r.code)).join(',')})) THEN RAISE EXCEPTION 'A2_UNIQUE_COLLISION:resource_types.code'; END IF; END $$;`);
 for(const table of dataset.order){
  for(const row of dataset.tables[table]){
   const fields=Object.keys(row);
   const value=(k:string)=>table==='plans'&&k.endsWith('_override_by')?`current_setting('optiplan.demo_actor')::uuid`:table==='plans'&&k.endsWith('_override_at')?'transaction_timestamp()':literal(row[k]);
   statements.push(`INSERT INTO public.${identifier(table)} (${fields.map(identifier).join(',')}) OVERRIDING SYSTEM VALUE VALUES (${fields.map(value).join(',')});`);
  }
 }
 for(const table of [...dataset.order,'program_settings','optimizer_settings'])statements.push(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM a2_existing_rows old LEFT JOIN public.${identifier(table)} t ON t.id=old.row_id WHERE old.table_name=${quote(table)} AND (t.id IS NULL OR to_jsonb(t) IS DISTINCT FROM old.row_json)) THEN RAISE EXCEPTION 'EXISTING_ROWS_CHANGED:${table}'; END IF; END $$;`);
 statements.push(`DO $$ BEGIN
 IF (SELECT count(*) FROM public.daily_tasks WHERE plan_id=${planId})<>266 OR
    (SELECT count(*) FROM public.contestants WHERE plan_id=${planId})<>19 OR
    EXISTS(SELECT 1 FROM public.daily_tasks WHERE plan_id=${planId} AND (start_planned IS NOT NULL OR end_planned IS NOT NULL OR status::text<>'pending')) THEN RAISE EXCEPTION 'INVALID_A2_IMPORT'; END IF;
END $$;`);
 // RESTART is transactional. Never lower a sequence already ahead of max(id).
 for(const table of dataset.order)statements.push(`DO $$ DECLARE seq text; last_id bigint; called boolean; maximum bigint; BEGIN
 seq:=pg_get_serial_sequence('public.${table}','id');
 IF seq IS NULL THEN RAISE EXCEPTION 'MISSING_ID_SEQUENCE:${table}'; END IF;
 EXECUTE format('SELECT last_value,is_called FROM %s',seq) INTO last_id,called;
 SELECT coalesce(max(id),0) INTO maximum FROM public.${identifier(table)};
 EXECUTE format('ALTER SEQUENCE %s RESTART WITH %s',seq,greatest(maximum+1,last_id+CASE WHEN called THEN 1 ELSE 0 END));
END $$;`);
 statements.push(`COMMIT;\nSELECT id,date,status FROM public.plans WHERE id=${planId};`);
 return {dataset,sql:statements.join('\n')};
}

if(process.argv[1]?.endsWith('prepareA2Import.ts')){
 const date=process.argv[2];if(!date)throw Error('Usage: demo:a2:prepare-import -- YYYY-MM-DD [directory] [project-ref]');
 const directory=process.argv[3]??'work/a2-import',project=process.argv[4]??'dyqusivzgxebkxkwohwn';mkdirSync(directory,{recursive:true});
 const {dataset,sql}=buildA2ImportSQL(date,0,project);
 writeFileSync(`${directory}/import.sql`,sql);
 writeFileSync(`${directory}/dataset.json`,JSON.stringify({kind:'CANONICAL_A2_UNSCHEDULED_IMPORT',...dataset},null,2));
 const manifest={version:2,dataset:'A2-FULL-EXEC-001',date,project,planId:dataset.input.planId,contestants:19,obligations:266,productiveTasks:247,participantMeals:19,
  tables:Object.fromEntries(Object.entries(dataset.tables).map(([k,v])=>[k,v.length])),sha256:createHash('sha256').update(sql).digest('hex'),
  target:'IDENTIFIED_TEST_PROJECT_WRITES_NOT_YET_AUTHORIZED',safety:'Existing rows compared before commit; no global default writes; insert-only; transactional sequence restart; no solution import',
  operator:'Set optiplan.demo_actor to an existing authorized Auth UUID; override timestamps materialized at import'};
 writeFileSync(`${directory}/manifest.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
}
