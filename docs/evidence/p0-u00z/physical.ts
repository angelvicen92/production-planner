import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const directory=resolve(process.argv[2]),output=resolve(process.argv[3]);
const read=(n:string)=>JSON.parse(readFileSync(join(directory,'native',n+'.json'),'utf8'));
assert.equal(read('integration').status,'PASS');const report:any[]=[];
for(const label of ['A','B','D','C'])for(let ordinal=1;ordinal<=(label==='B'?2:1);ordinal++){
 const input=read(label+'-input'),run=read(`${label}-S${ordinal}-run`).assisted_result_json,proof=run.evidence.nominalPhysicalFutureWitness,accepted=read(`${label}-S${ordinal}-accepted`).activeStage.snapshotJson,daily=read(`${label}-S${ordinal}-daily`);
 assert.equal(proof.operationalMeals.length,input.operationalMealPolicies.length);
 for(const meal of proof.operationalMeals)for(const t of proof.tasks){
  const resources=[...(t.requiredResourceIds??[]),...(t.coachId?[t.coachId]:[])];
  const affected=(t.blocksSpace!==false&&meal.spaceIds.includes(t.spaceId))||resources.some(id=>meal.resourceIds.includes(id));
  if(affected)assert.ok(t.end<=meal.start||t.start>=meal.end,'physical task overlaps pause');
 }
 for(const t of accepted.tasks.filter((t:any)=>t.startPlanned)){
  const row=daily.find((r:any)=>Number(r.id)===t.taskId);assert.ok(row);assert.equal(row.start_planned,t.startPlanned);assert.equal(row.end_planned,t.endPlanned);assert.deepEqual(row.assigned_resource_ids??[],t.assignedResourceIds??[]);
  if(t.itinerantTeamId){const unit=input.itinerantCompositionSnapshot.units.find((u:any)=>u.id===t.itinerantTeamId);assert.ok(unit?.members.length);for(const m of unit.members)assert.ok(t.assignedResourceIds.includes(m.planResourceItemId));}
 }
 if(label==='B')assert.equal(input.operationalMealPolicies.length,2,'the recomposed unit does not acquire an inferred third meal');
 if(label==='D'){const visual=proof.tasks.find((t:any)=>t.blocksSpace===false);const meal=proof.operationalMeals.find((m:any)=>m.spaceIds.includes(visual.spaceId));assert.ok(visual.start<meal.end&&visual.end>meal.start);}
 report.push({label,ordinal,physicalMeals:proof.operationalMeals,acceptedMeals:accepted.operationalMeals??[],pendingMealWitnesses:proof.operationalMeals.filter((m:any)=>!accepted.operationalMeals?.some((a:any)=>a.policyId===m.id)).length,physicalTaskCount:proof.tasks.length,persistedAssignmentsExact:true});
}
writeFileSync(output,JSON.stringify({status:'PASS',remoteWrites:0,report},null,2));console.log('PASS physical resources, unit members, occupied spaces, independent policies, pending witnesses and persisted assignments');
