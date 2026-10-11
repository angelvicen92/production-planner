import test from 'node:test';
import assert from 'node:assert/strict';
import {buildA2ImportRows} from './a2ImportRows';
import {auditIsFresh,inspectA2Catalog,requiredFunctionBodies,securityTables} from './a2Preflight';
import {buildA2SecurityRollback} from './prepareA2SecurityRollback';

function compatible(){
 const dataset=buildA2ImportRows('2026-10-30');
 const catalog={format:1,columns:Object.entries(dataset.tables).flatMap(([table,rows])=>[...new Set(rows.flatMap(Object.keys))].map(column=>({table_name:table,column_name:column,sequence:column==='id'?`public.${table}_id_seq`:null}))),tables:securityTables.map(name=>({name,rls:true})),roles:[{name:'service_role',bypassRLS:true}],policies:securityTables.flatMap(tablename=>['SELECT','INSERT','UPDATE','DELETE'].map(cmd=>({tablename,policyname:`a2_api_${cmd==='SELECT'?'read':cmd.toLowerCase()}_boundary`,permissive:'RESTRICTIVE',roles:['public'],cmd,qual:cmd==='SELECT'?"(public.has_role('admin'::text) OR public.has_role('production'::text) OR public.has_role('aux'::text) OR public.has_role('viewer'::text))":'false',with_check:'false'})).concat({tablename,policyname:'a2_authorized_read',permissive:'PERMISSIVE',roles:['authenticated'],cmd:'SELECT',qual:"(public.has_role('admin'::text) OR public.has_role('production'::text) OR public.has_role('aux'::text) OR public.has_role('viewer'::text))",with_check:null} as any)),functions:[...requiredFunctionBodies()].map(([name,body])=>({name,definition:`CREATE FUNCTION ${name}() AS $function$\n${body}\n$function$;`,serviceExecute:name!=='assisted_apply_snapshot',anonExecute:false,authenticatedExecute:false})),grants:[],triggers:[{name:'preserve_plan_planner_next_configuration'}],sequences:[],constraints:[{name:'plan_task_template_snapshots_contract_version_check',definition:'CHECK (contract_version IN (1, 2))'}]};
 for(const [table,columns] of Object.entries({program_settings:['default_participant_transition_minutes'],task_templates:['participant_margin_before_minutes','participant_margin_after_minutes']}))for(const column of columns)catalog.columns.push({table_name:table,column_name:column,sequence:null});
 return catalog;
}
test('preflight rejects schema/RPC/security drift, broad policy expressions, false policy roles and missing sequences',()=>{
 const now=Date.parse('2026-10-10T19:00:00Z');
 for(const stamp of [undefined,null,'invalid','2026-10-10T18:44:59Z','2026-10-10T19:00:01Z'])assert.equal(auditIsFresh(stamp,now),false);
 assert.equal(auditIsFresh('2026-10-10T18:45:00Z',now),true);
 const catalog=compatible();assert.deepEqual(inspectA2Catalog(catalog,'2026-10-30').issues,[]);
 for(const mutate of [(c:any)=>c.columns.pop(),(c:any)=>c.functions[0].definition+='-- unrelated',(c:any)=>c.functions[0].definition=c.functions[0].definition.replace('UPDATE','DELETE'),(c:any)=>c.functions.find((f:any)=>f.name==='guard_assisted_stage_proposal_plan').definition=c.functions.find((f:any)=>f.name==='guard_assisted_stage_proposal_plan').definition.replace('public.planning_runs','planning_runs'),(c:any)=>c.functions[1].anonExecute=true,(c:any)=>c.roles[0].bypassRLS=false,(c:any)=>c.tables[0].rls=false,(c:any)=>c.policies[0].qual+=' OR true',(c:any)=>c.policies[0].roles=['authenticated'],(c:any)=>c.policies[0].permissive='PERMISSIVE',(c:any)=>c.policies[1].cmd='SELECT',(c:any)=>c.policies[2].with_check='true',(c:any)=>c.policies[4].qual='true',(c:any)=>c.policies[0].roles.push('authenticated'),(c:any)=>c.columns.find((x:any)=>x.column_name==='id').sequence=null]){
  const altered=structuredClone(catalog);mutate(altered);
  if(altered.functions[0].definition.endsWith('-- unrelated'))assert.equal(inspectA2Catalog(altered,'2026-10-30').compatible,true,'comments outside the body do not change a function contract');
  else assert.equal(inspectA2Catalog(altered,'2026-10-30').compatible,false);
 }
});
test('security rollback is based on the captured original state and requires separate approval',()=>{
 const catalog=compatible();catalog.policies=[];catalog.tables[0].rls=false;
 const sql=buildA2SecurityRollback(catalog);
 assert.match(sql,/SECURITY_ROLLBACK_APPROVAL_REQUIRED/);assert.match(sql,/spaces" DISABLE ROW LEVEL SECURITY/);
 assert.doesNotMatch(sql,/daily_tasks" DISABLE ROW LEVEL SECURITY/);
 assert.doesNotMatch(sql,/DELETE|TRUNCATE|INSERT/);
 assert.throws(()=>buildA2SecurityRollback(compatible()),/already exists/);
});
