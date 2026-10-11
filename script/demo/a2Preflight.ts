import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildA2ImportRows} from './a2ImportRows';
import {latestAssistedSQLContracts,assistedStageProposalGuardBody} from './assistedSQLContracts';

export const securityTables=['spaces','daily_tasks','resource_pools','plan_resource_pools','resource_types','resource_items','plan_resource_items','space_resource_defaults','plan_space_resource_assignments','zone_resource_type_defaults','space_resource_type_defaults','plan_zone_resource_type_requirements','plan_space_resource_type_requirements','plan_vocal_coach_rules','vocal_coach_rules'];
type Catalog={format:number;columns:any[];tables:any[];policies:any[];functions:any[];roles:any[];grants:any[];triggers:any[];sequences:any[];constraints:any[]};
function body(definition:string){const match=definition.match(/\bAS\s+(\$\w*\$)([\s\S]*)/i);if(!match)return null;return match[2].slice(0,match[2].indexOf(match[1])).replaceAll('\r\n','\n').trim();}
export function requiredFunctionBodies(){
 const bodies=new Map([...latestAssistedSQLContracts()].map(([name,c])=>[name,c.body]));
 bodies.set('guard_assisted_stage_proposal_plan',assistedStageProposalGuardBody());
 return bodies;
}
export function auditIsFresh(observedAt:unknown,now=Date.now()){
 const observed=typeof observedAt==='string'?Date.parse(observedAt):NaN;
 return Number.isFinite(observed)&&observed<=now&&now-observed<=15*60_000;
}
const readBoundary="has_role'admin'ORhas_role'production'ORhas_role'aux'ORhas_role'viewer'";
function normalizedPolicyExpression(value:unknown){return String(value).replaceAll('public.','').replaceAll('::text','').replace(/[\s()]/g,'');}
/** Fail closed: an API exposure or a migration number is never schema evidence. */
export function inspectA2Catalog(catalog:Catalog,date:string){
 const issues:string[]=[],dataset=buildA2ImportRows(date);
 if(catalog.format!==1)issues.push('UNKNOWN_CATALOG_FORMAT');
 for(const table of dataset.order)for(const column of [...new Set(dataset.tables[table].flatMap(Object.keys))])if(!catalog.columns?.some(c=>c.table_name===table&&c.column_name===column))issues.push(`MISSING_COLUMN:${table}.${column}`);
 for(const table of dataset.order)if(!catalog.columns?.some(c=>c.table_name===table&&c.column_name==='id'&&c.sequence))issues.push(`MISSING_ID_SEQUENCE:${table}`);
 for(const [table,columns] of Object.entries({program_settings:['default_participant_transition_minutes'],task_templates:['participant_margin_before_minutes','participant_margin_after_minutes']}))for(const column of columns)if(!catalog.columns?.some(c=>c.table_name===table&&c.column_name===column))issues.push(`MISSING_COLUMN:${table}.${column}`);
 for(const [name,expected] of requiredFunctionBodies()){
  const candidates=catalog.functions?.filter(f=>f.name===name)??[];
  const matching=candidates.find(f=>body(f.definition)===expected);
  if(!matching)issues.push(`RPC_BODY_DRIFT:${name}`);
  else if(name!=='assisted_apply_snapshot'&&name!=='guard_assisted_stage_proposal_plan'&&!matching.serviceExecute)issues.push(`RPC_SERVER_DENIED:${name}`);
 }
 for(const f of catalog.functions??[])if((f.name.startsWith('assisted_')||['apply_day_config_operation','apply_day_config_operation_v2','initialize_day_config_revision'].includes(f.name))&&(f.anonExecute||f.authenticatedExecute))issues.push(`RPC_CLIENT_WRITE_GRANT:${f.name}`);
 if(!catalog.roles?.some(r=>r.name==='service_role'&&r.bypassRLS))issues.push('SERVER_ROLE_RLS_INCOMPATIBLE');
 for(const table of securityTables){
  if(!catalog.tables?.some(t=>t.name===table&&t.rls))issues.push(`RLS_DISABLED:${table}`);
  for(const [name,cmd,permissive,role] of [
   ['a2_api_read_boundary','SELECT','RESTRICTIVE','public'],
   ['a2_authorized_read','SELECT','PERMISSIVE','authenticated'],
   ['a2_api_insert_boundary','INSERT','RESTRICTIVE','public'],
   ['a2_api_update_boundary','UPDATE','RESTRICTIVE','public'],
   ['a2_api_delete_boundary','DELETE','RESTRICTIVE','public']
  ]){
   const p=catalog.policies?.find(p=>p.tablename===table&&p.policyname===name);
   if(!p){issues.push(`MISSING_SECURITY_POLICY:${table}.${name}`);continue;}
   if(p.cmd!==cmd||p.permissive!==permissive||p.roles?.length!==1||p.roles[0]!==role)issues.push(`SECURITY_POLICY_CONTRACT_DRIFT:${table}.${name}`);
   if(cmd==='SELECT'&&normalizedPolicyExpression(p.qual)!==readBoundary)issues.push(`SECURITY_READ_POLICY_DRIFT:${table}.${name}`);
   if((cmd==='UPDATE'||cmd==='DELETE')&&normalizedPolicyExpression(p.qual)!=='false')issues.push(`SECURITY_WRITE_POLICY_DRIFT:${table}.${name}`);
   if((cmd==='UPDATE'||cmd==='INSERT')&&normalizedPolicyExpression(p.with_check)!=='false')issues.push(`SECURITY_WRITE_CHECK_DRIFT:${table}.${name}`);
  }
 }
 if(!catalog.triggers?.some(t=>t.name==='preserve_plan_planner_next_configuration'))issues.push('MISSING_IMMUTABLE_DAY_CONTRACT');
 const versionCheck=catalog.constraints?.find(c=>c.name==='plan_task_template_snapshots_contract_version_check');
 if(!versionCheck?.definition.includes('2'))issues.push('SNAPSHOT_V2_NOT_ALLOWED');
 return {issues,compatible:issues.length===0};
}

if(process.argv[1]?.endsWith('a2Preflight.ts')){
 const [directory,date,backup]=process.argv.slice(2);
 if(!directory||!date||!backup)throw Error('Usage: demo:a2:preflight -- directory YYYY-MM-DD verified-backup.dump');
 const project='dyqusivzgxebkxkwohwn';
 if(new URL(process.env.SUPABASE_URL!).hostname!==`${project}.supabase.co`||process.env.SUPABASE_URL!==process.env.VITE_SUPABASE_URL)throw Error('Wrong Supabase client/server host');
 if(statSync(backup).size<1024||readFileSync(backup).subarray(0,5).toString()!=='PGDMP')throw Error('A nonempty pg_dump custom archive is required');
 const rest=JSON.parse(readFileSync(`${directory}/rest-audit.json`,'utf8')),catalog=JSON.parse(readFileSync(`${directory}/catalog-audit.json`,'utf8'));
 const result=inspectA2Catalog(catalog,date),issues=[...result.issues];
 if(rest.project!==project||rest.date!==date||!auditIsFresh(rest.observedAt))issues.push('REST_PREFLIGHT_STALE_OR_WRONG_TARGET');
 if(rest.collisions?.length||rest.unreadableTables?.length||rest.missingColumns?.length)issues.push('REST_STORAGE_NOT_READY');
 if((rest.anonChecks??[]).some((c:any)=>c.returnedRows>0))issues.push('ANONYMOUS_DATA_EXPOSED');
 if(!auditIsFresh(catalog.observedAt))issues.push('SQL_CATALOG_STALE');
 const report={project,date,mode:'READ_ONLY_PREFLIGHT',issues,readyForApprovedImport:issues.length===0,backupSha256:createHash('sha256').update(readFileSync(backup)).digest('hex'),backupRestoreTest:'OPERATOR_MUST_CONFIRM_RESTORE_ON_LOCAL_COPY',writes:0};
 writeFileSync(`${directory}/preflight.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(issues.length)process.exitCode=1;
}
