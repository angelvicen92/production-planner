/** Cold reconstruction from accepted SQL snapshots, never a proposed schedule. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[key];
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_ANON_KEY:'isolated-evidence',SUPABASE_SERVICE_ROLE_KEY:'isolated-evidence'});
const {adaptEngineInputToPlannerNextProblem:adapt}=await import('../../../engine/planner-next/integration/engineInputAdapter');
const {materializeAssistedSnapshotOccupations}=await import('../../../server/assistedProposalService');
const directory=process.argv[2],read=(n:string)=>JSON.parse(readFileSync(`${directory}/native/${n}.json`,'utf8'));
const reports:any[]=[];
for(const label of ['A','B'])for(let stage=1;stage<=(label==='B'?2:1);stage++){
 const input=read(`${label}-input`),adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
 const receipt=read(`${label}-S${stage}-sql-selection`),snapshot=receipt.sqlStage.snapshot_json,rows=read(`${label}-S${stage}-sql`);
 for(const t of snapshot.tasks){const row=rows.find((r:any)=>Number(r.id)===t.taskId);assert.equal(row.start_planned,t.startPlanned);assert.equal(row.end_planned,t.endPlanned);assert.deepEqual(row.assigned_resource_ids??[],t.assignedResourceIds??[]);}
 const actual=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,snapshot).protectedPlacements;
 const anchorIds=new Set(input.anchoredAccompaniments.flatMap((a:any)=>[...a.beforeTaskIds,a.anchorTaskId,...a.afterTaskIds].map((id:number)=>`task:${id}`)));
 const scopeIds=new Set(input.dailyTaskOperationScopes.map((p:any)=>`task:${p.taskId}`));
 const occupations=actual.map(t=>{const source=input.tasks.find((s:any)=>t.id===`task:${s.id}`);return {taskId:t.id,start:t.start,end:t.end,participant:t.participantId,unit:t.itinerantUnitId,space:t.spaceId,blocksSpace:t.blocksSpace!==false,agenda:source.agendaScope??'PHYSICAL_SPACE',inheritance:source.resourceInheritance??'LOCATION',direct:source.declaredResourceIds??[],resources:[...new Set([...(t.requiredResourceIds??[]),...(t.coachId?[t.coachId]:[])])].sort()};});
 for(const t of occupations)if(t.inheritance==='LOCATION')for(const id of input.spaceResourceAssignments[Number(t.space.slice(6))]??[])assert.ok(t.resources.includes(`plan-resource:${id}`),'LOCATION resources remain physically required');
 const parallel=[];
 for(const [i,a] of occupations.entries())for(const b of occupations.slice(i+1))if(a.start<b.end&&b.start<a.end){
  assert.ok(a.space!==b.space||!a.blocksSpace||!b.blocksSpace);assert.ok(!a.participant||a.participant!==b.participant);assert.ok(!a.unit||a.unit!==b.unit);assert.ok(!a.resources.some(r=>b.resources.includes(r)));
  parallel.push({a:a.taskId,b:b.taskId,anchoredAndStandalone:anchorIds.has(a.taskId)&&scopeIds.has(b.taskId)||scopeIds.has(a.taskId)&&anchorIds.has(b.taskId)});
 }
 for(const p of input.dailyTaskOperationScopes){const t=occupations.find(t=>t.taskId===`task:${p.taskId}`);if(t){assert.equal(t.blocksSpace,true);for(const id of p.declaredResourceIds)assert.ok(t.resources.includes(`plan-resource:${id}`));}}
 reports.push({label,stage,sqlStageId:receipt.sqlStage.id,snapshotFingerprint:receipt.sqlStage.snapshot_fingerprint,selections:receipt.selections,occupations,parallel,resourceLabels:input.planResourceItems.map((r:any)=>({id:`plan-resource:${r.id}`,name:r.name})),spaceLabels:input.planSpaceSettings.map((s:any)=>({id:`space:${s.spaceId}`,name:s.name}))});
}
assert.ok(reports.some(r=>r.parallel.some((p:any)=>p.anchoredAndStandalone)),'a physically independent Reality can overlap an anchored operation');
writeFileSync(process.argv[3],JSON.stringify({status:'PASS',sqlRowsMatchStages:true,physicalConflicts:0,reports},null,2));
console.log('PASS physical SQL reconstruction and simultaneous independent/anchored operations');
