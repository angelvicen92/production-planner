/** Prepare only. Never connects to or writes a database. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {buildA2ImportSQL} from './prepareA2Import';import {a2HistoricalCatalog} from './a2HistoricalCatalog';
import {identifier,literal} from './sql';
export function prepareA2RealImport(date:string,planId:number,offset:number,catalog= a2HistoricalCatalog){
 if(!Number.isSafeInteger(planId)||planId<=0||planId===27001)throw Error('An explicit new plan identity is required');
 if(!Number.isSafeInteger(offset)||offset<100000)throw Error('A separate positive import namespace is required');
 const {dataset,sql}=buildA2ImportSQL(date,offset,'dyqusivzgxebkxkwohwn',{historicalCatalog:catalog,planId});
 const preflight=`-- READ ONLY: catalog, schema and collisions. No private task contents.\nBEGIN READ ONLY;\n`+
 `SELECT id,name,zone_id,parent_space_id FROM public.spaces ORDER BY id;\nSELECT id,name FROM public.zones ORDER BY id;\n`+
 `SELECT id,name,type_id FROM public.resource_items WHERE id BETWEEN 1 AND 14;\n`+
 `SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('plans','plan_space_settings','daily_tasks','plan_task_template_snapshots') ORDER BY 1,2;\n`+
 dataset.order.filter(table=>dataset.tables[table].length).map(table=>`SELECT '${table}' AS table_name,count(*) AS collisions FROM public.${identifier(table)} WHERE id IN (${dataset.tables[table].map(row=>row.id).join(',')});`).join('\n')+
 `\nSELECT plan_id,count(*) FROM public.daily_tasks WHERE plan_id IN (27001,${planId}) GROUP BY plan_id;\nSELECT plan_id,count(*) FROM public.assisted_planning_stages WHERE plan_id IN (27001,${planId}) GROUP BY plan_id;\nCOMMIT;`;
 const newSpaces=dataset.tables.spaces.map(row=>row.id);
 const rollback=`-- Local preparation only. Before any Assisted session; never delete immutable history.\nBEGIN;\nSELECT pg_advisory_xact_lock(78004,${planId});\nLOCK TABLE public.plans,public.assisted_planning_sessions,public.daily_tasks IN SHARE ROW EXCLUSIVE MODE;\nDO $$ BEGIN\n IF current_setting('optiplan.rollback_approved',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'ROLLBACK_APPROVAL_REQUIRED'; END IF;\n IF NOT EXISTS(SELECT 1 FROM public.plans WHERE id=${planId} AND date=${literal(date)}::date) THEN RAISE EXCEPTION 'ROLLBACK_IDENTITY_MISMATCH'; END IF;\n IF EXISTS(SELECT 1 FROM public.assisted_planning_sessions WHERE plan_id=${planId}) OR EXISTS(SELECT 1 FROM public.assisted_planning_stages WHERE plan_id=${planId}) THEN RAISE EXCEPTION 'IMMUTABLE_HISTORY_MUST_BE_RETAINED'; END IF;\n IF EXISTS(SELECT 1 FROM public.daily_tasks WHERE plan_id=${planId} AND (status::text<>'pending' OR start_planned IS NOT NULL OR end_planned IS NOT NULL)) THEN RAISE EXCEPTION 'ROLLBACK_REQUIRES_EMPTY_NEW_DAY'; END IF;\nEND $$;\n`+
 dataset.order.slice().reverse().filter(table=>!['plans','zones','spaces','task_templates','resource_items','resource_types'].includes(table)&&dataset.tables[table].length).map(table=>{
  const ids=dataset.tables[table].map(row=>row.id).join(',');
  const owner=table==='plan_optimizer_snapshot_heuristics'?`snapshot_id IN (SELECT id FROM public.plan_optimizer_snapshots WHERE plan_id=${planId})`:`plan_id=${planId}`;
  return `DELETE FROM public.${identifier(table)} WHERE id IN (${ids}) AND ${owner};`;
 }).join('\n')+
 `\nDELETE FROM public.plans WHERE id=${planId};\n`+
 dataset.tables.task_templates.map(row=>`DELETE FROM public.task_templates WHERE id=${row.id} AND NOT EXISTS(SELECT 1 FROM public.daily_tasks WHERE template_id=${row.id});`).join('\n')+
 `\nDELETE FROM public.spaces s WHERE id IN (${newSpaces.join(',')}) AND NOT EXISTS(SELECT 1 FROM public.daily_tasks t WHERE t.space_id=s.id) AND NOT EXISTS(SELECT 1 FROM public.plan_space_settings p WHERE p.space_id=s.id) AND NOT EXISTS(SELECT 1 FROM public.task_templates t WHERE t.space_id=s.id);\nCOMMIT;`;
 return {dataset,sql,preflight,rollback,manifest:{contractVersion:2,date,planId,offset,oldPlanId:27001,obligations:266,contestants:19,
  catalogFingerprint:dataset.historicalCatalogFingerprint,sourceSpaces:23,explicitExtensions:1,spatialMapping:dataset.spatialManifest,resourceReferences:dataset.resourceReferences,resourceMapping:dataset.resourceManifest,
  sqlSha256:createHash('sha256').update(sql).digest('hex'),writes:0,readyForDeployment:false,
  gates:['fresh identity/catalog/schema/function/security preflight','verified backup plus restore rehearsal','zero collisions','explicit operator import authorization','postchecks and real product replan'],
  safety:'Insert-only new day; reused rows compared; aliases collapsed; SQL transaction fails closed on drift. Rollback only before session, no immutable Stage deletion.'}};
}
if(process.argv[1]?.endsWith('prepareA2RealImport.ts')){
 const [date,plan,namespace,directory='work/a2-real-import',catalogPath]=process.argv.slice(2);
 if(!date||!plan||!namespace)throw Error('Usage: prepareA2RealImport.ts YYYY-MM-DD NEW_PLAN_ID OFFSET [directory] [identity-catalog.json]');
 let catalog=a2HistoricalCatalog;
 if(catalogPath){const raw=JSON.parse(readFileSync(catalogPath,'utf8'));catalog={resource_types:a2HistoricalCatalog.resource_types,resource_items:a2HistoricalCatalog.resource_items,zones:raw.zones.filter((z:any)=>a2HistoricalCatalog.zones.some(e=>e.id===z.id)),spaces:raw.spaces.filter((s:any)=>a2HistoricalCatalog.spaces.some(e=>e.id===s.id))};}
 const result=prepareA2RealImport(date,Number(plan),Number(namespace),catalog);mkdirSync(directory,{recursive:true});
 for(const [file,value] of Object.entries({'import.sql':result.sql,'preflight.sql':result.preflight,'rollback.sql':result.rollback,'manifest.json':JSON.stringify(result.manifest,null,2),'dataset.json':JSON.stringify(result.dataset,null,2)}))writeFileSync(`${directory}/${file}`,value);
 console.log(JSON.stringify({directory,planId:result.dataset.input.planId,writes:0,readyForDeployment:false}));
}
