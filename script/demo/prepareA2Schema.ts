import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {latestAssistedSQLContracts} from './assistedSQLContracts';

/** Explicit drift adoption, not a replay of the migration ledger. No row DML. */
export function buildA2SchemaSQL(){
 const migration=(name:string)=>readFileSync(`supabase/migrations/${name}`,'utf8');
 const operational=migration('076_plan_operational_config_snapshots.sql');
 const additions=operational.slice(operational.indexOf('ALTER TABLE'),operational.indexOf('-- Migration-time'))
  .replaceAll("config_source TEXT NOT NULL DEFAULT 'INHERITED'","config_source TEXT NOT NULL DEFAULT 'LEGACY_BACKFILL'");
 const bundle=operational.slice(operational.indexOf('CREATE TABLE IF NOT EXISTS public.plan_resource_bundle_snapshots'),operational.indexOf('INSERT INTO public.plan_resource_bundle_snapshots'));
 const bundlePermissions=operational.slice(operational.indexOf('ALTER TABLE public.plan_resource_bundle_snapshots ENABLE'));
 const margins=migration('087_participant_transition_margins.sql')
  .replace('ALTER TABLE public.plans ADD CONSTRAINT plans_participant_transition_provenance_check', 'ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_participant_transition_provenance_check;\nALTER TABLE public.plans ADD CONSTRAINT plans_participant_transition_provenance_check')
  .replace('UPDATE public.plan_task_template_snapshots SET contract_version = 2 WHERE contract_version = 1;','-- Preserve all existing v1 snapshots. The application normalizer supports v1 and v2.')
  .replace('CHECK (contract_version = 2);','CHECK (contract_version IN (1,2));');
 const rpcDefinitions=[...latestAssistedSQLContracts()].map(([name,c])=>`${c.definition}\nREVOKE ALL ON FUNCTION ${c.signature} FROM PUBLIC,anon,authenticated,service_role;\n${name==='assisted_apply_snapshot'?'':`GRANT EXECUTE ON FUNCTION ${c.signature} TO service_role;`}`).join('\n');
 return `-- PREPARED ONLY. Requires specific authorization, backup and catalog preflight.
-- Repairs the observed 076 drift, installs 086 RPCs and adopts 087 without rewriting existing snapshots.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_setting('optiplan.confirmed_demo_project',true) IS DISTINCT FROM 'dyqusivzgxebkxkwohwn' THEN RAISE EXCEPTION 'WRONG_DEMO_PROJECT'; END IF;
 IF coalesce(current_setting('optiplan.backup_sha256',true),'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'VERIFIED_BACKUP_REQUIRED'; END IF;
 IF coalesce(current_setting('optiplan.schema_approved',true),'') <> 'yes' THEN RAISE EXCEPTION 'SCHEMA_APPROVAL_REQUIRED'; END IF;
END $$;
${additions}\n${bundle}\n${bundlePermissions}
${migration('086_assisted_itinerant_resource_persistence.sql')}
${margins}
${migration('088_plan_planner_next_configuration.sql')}
-- Reconcile public Assisted contracts by their source bodies, not ledger numbers.
${rpcDefinitions}
NOTIFY pgrst,'reload schema';
COMMIT;`;
}
if(process.argv[1]?.endsWith('prepareA2Schema.ts')){
 const directory=process.argv[2]??'work/a2-existing';mkdirSync(directory,{recursive:true});
 const sql=buildA2SchemaSQL();writeFileSync(`${directory}/schema.sql`,sql);
 console.log(JSON.stringify({mode:'OFFLINE_PREPARATION',file:`${directory}/schema.sql`,sha256:createHash('sha256').update(sql).digest('hex'),writes:0}));
}
