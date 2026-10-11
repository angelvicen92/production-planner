import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildA2ImportRows} from './a2ImportRows';

// GET only. No RPC invocation, Auth mutation, schema mutation or row mutation.
export async function auditSupabaseREST(project:string,date:string,directory:string){
 const url=process.env.SUPABASE_URL!,key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
 assert.equal(new URL(url).hostname,`${project}.supabase.co`);
 assert.equal(process.env.VITE_SUPABASE_URL,url,'Client and server projects differ');
 const headers={apikey:key,Authorization:`Bearer ${key}`};
 const request=async(path:string,extra:Record<string,string>={})=>{
  const response=await fetch(`${url}/rest/v1/${path}`,{headers:{...headers,...extra}});
  if(!response.ok)throw Error(`Read failed ${path.split('?')[0]} HTTP ${response.status}`);
  return response;
 };
 const schema=await (await request('',{Accept:'application/openapi+json'})).json();
 const dataset=buildA2ImportRows(date),tables=[...new Set([...dataset.order,'program_settings','optimizer_settings','planning_runs','assisted_planning_sessions','assisted_planning_stages'])];
 const rows:Record<string,any[]>={},unreadableTables:{table:string;status:number}[]=[];
 for(const table of tables){
  rows[table]=[];
  for(let offset=0;;offset+=500){
   const response=await fetch(`${url}/rest/v1/${table}?select=*&order=id&offset=${offset}&limit=500`,{headers});
   if(!response.ok){unreadableTables.push({table,status:response.status});break;}
   const page=await response.json();
   rows[table].push(...page);if(page.length<500)break;
  }
 }
 const collisions=dataset.order.flatMap(table=>dataset.tables[table].flatMap(row=>{
  const keys=row.id==null?['plan_id','space_id','plan_resource_item_id']:['id'];
  return rows[table].some(existing=>keys.every(k=>existing[k]===row[k]))?[{table,keys:Object.fromEntries(keys.map(k=>[k,row[k]]))}]:[];
 }));
 const missingColumns=dataset.order.flatMap(table=>[...new Set(dataset.tables[table].flatMap(Object.keys))].filter(column=>!schema.definitions?.[table]?.properties?.[column]).map(column=>({table,column})));
 const anonKey=process.env.SUPABASE_ANON_KEY??process.env.VITE_SUPABASE_ANON_KEY!;
 const anonChecks=await Promise.all(['spaces','daily_tasks','plan_resource_items'].map(async table=>{
  const response=await fetch(`${url}/rest/v1/${table}?select=id&limit=1`,{headers:{apikey:anonKey,Authorization:`Bearer ${anonKey}`}});
  return {table,status:response.status,returnedRows:response.ok?(await response.json()).length:null};
 }));
 const anonSchemaResponse=await fetch(`${url}/rest/v1/`,{headers:{apikey:anonKey,Authorization:`Bearer ${anonKey}`,Accept:'application/openapi+json'}});
 const anonSchema=anonSchemaResponse.ok?await anonSchemaResponse.json():null;
 const result={mode:'REMOTE_REST_GET_ONLY',project,date,observedAt:new Date().toISOString(),writes:0,
  counts:Object.fromEntries(Object.entries(rows).map(([table,data])=>[table,data.length])),
  fingerprints:Object.fromEntries(Object.entries(rows).map(([table,data])=>[table,createHash('sha256').update(JSON.stringify(data)).digest('hex')])),
  collisions,missingColumns,unreadableTables,anonChecks,anonExposedRpcPaths:Object.keys(anonSchema?.paths??{}).filter(p=>p.startsWith('/rpc/')),exposedRpcPaths:Object.keys(schema.paths??{}).filter(p=>p.startsWith('/rpc/')),
  sqlCatalogAudit:'PENDING_SQL_ACCESS',backup:'NOT_ESTABLISHED',readyForWrite:false};
 mkdirSync(directory,{recursive:true});
 // This private baseline contains existing data. Never commit or publish it.
 writeFileSync(`${directory}/private-baseline.json`,JSON.stringify(rows));
 writeFileSync(`${directory}/rest-audit.json`,JSON.stringify(result,null,2));
 return result;
}
if(process.argv[1]?.endsWith('auditSupabaseREST.ts'))console.log(JSON.stringify(await auditSupabaseREST(process.argv[2],process.argv[3],process.argv[4]??'work/a2-existing'),null,2));
