import {readFileSync,writeFileSync} from 'node:fs';
import {securityTables} from './a2Preflight';
import {identifier} from './sql';

/** Generate before applying security.sql. Restores the captured state, not guesses. */
export function buildA2SecurityRollback(catalog:any){
 const statements=[`-- Requires separate rollback approval. Restores the pre-change catalog state.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF current_setting('optiplan.confirmed_demo_project',true) IS DISTINCT FROM 'dyqusivzgxebkxkwohwn' OR current_setting('optiplan.security_rollback_approved',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'SECURITY_ROLLBACK_APPROVAL_REQUIRED'; END IF; END $$;`];
 for(const table of securityTables){
  const old=catalog.tables?.find((t:any)=>t.name===table);if(!old)throw Error(`Missing original catalog state: ${table}`);
  for(const name of ['a2_api_read_boundary','a2_authorized_read','a2_api_insert_boundary','a2_api_update_boundary','a2_api_delete_boundary']){
   if(catalog.policies?.some((p:any)=>p.tablename===table&&p.policyname===name))throw Error('New policy name already exists in the original catalog');
   statements.push(`DROP POLICY IF EXISTS ${identifier(name)} ON public.${identifier(table)};`);
  }
  if(!catalog.grants?.some((g:any)=>g.table_name===table&&g.grantee==='authenticated'&&g.privilege_type==='SELECT'))statements.push(`REVOKE SELECT ON TABLE public.${identifier(table)} FROM authenticated;`);
  if(!old.rls)statements.push(`ALTER TABLE public.${identifier(table)} DISABLE ROW LEVEL SECURITY;`);
 }
 statements.push("NOTIFY pgrst,'reload schema';\nCOMMIT;");return statements.join('\n');
}
if(process.argv[1]?.endsWith('prepareA2SecurityRollback.ts')){
 const directory=process.argv[2];if(!directory)throw Error('Usage: directory containing ORIGINAL catalog-audit.json');
 const catalog=JSON.parse(readFileSync(`${directory}/catalog-audit.json`,'utf8'));
 writeFileSync(`${directory}/security-rollback.sql`,buildA2SecurityRollback(catalog));
 console.log(JSON.stringify({mode:'OFFLINE_PREPARATION',writes:0}));
}
