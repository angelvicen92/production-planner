/** Verify native persisted assignments against the same canonical physical authority. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {materializeItinerantUnitAssignment} from '../../../engine/planner-next/itinerantUnitAssignment';
import {validatePlan} from '../../../engine/planner-next/validate';
import {canPlaceTask} from '../../../engine/planner-next/placement';
const [directory,output]=process.argv.slice(2);
const read=(name:string)=>JSON.parse(readFileSync(resolve(directory,name),'utf8'));
const days=['technical','auxiliary'].map(label=>{
 const {problem,identityMap}=read(`${label}-preflight.json`),stage=read(`${label}-stage.json`),input=read(`${label}-input.json`);
 const productResource=(id:string)=>Number(identityMap.find((i:any)=>i.namespace==='plan-resource'&&i.canonicalId===id).sourceId);
 const rows=stage.activeStage.snapshotJson.tasks;
 const scheduled=rows.map((row:any)=>{
   const source=problem.tasks.find((t:any)=>t.id===`task:${row.taskId}`);
   const task=materializeItinerantUnitAssignment(problem,source,`itinerant-team:${row.itinerantTeamId}`);
   assert.ok(task);assert.deepEqual(row.assignedResourceIds,[...new Set(task.requiredResourceIds!.map(productResource))].sort((a,b)=>a-b));
   const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
   return {...task,start:minute(row.startPlanned),end:minute(row.endPlanned)};
 });
 assert.equal(validatePlan(problem,scheduled).hardValid,true);
 const occupations=scheduled.flatMap((task:any)=>task.requiredResourceIds.map((id:string)=>({taskId:task.id,
   resourceId:productResource(id),name:input.planResourceItems.find((r:any)=>r.id===productResource(id)).name,
   unitId:task.itinerantUnitId,start:task.start,end:task.end})));
 assert.ok(occupations.every((o:any)=>o.end-o.start===10));
 if(label==='technical'){
   const a=scheduled.find((t:any)=>t.itinerantUnitId===problem.tasks[0].itinerantUnitId);
   const c=scheduled.find((t:any)=>t.requiredResourceIds.length===2&&t.itinerantUnitId!==scheduled.at(-1).itinerantUnitId);
   const openSpaces={...problem,spaces:problem.spaces.map((s:any)=>({...s,availability:[problem.day]}))};
   assert.equal(canPlaceTask(openSpaces,{...a,id:'gap-probe',availability:undefined},585,scheduled),true,'CAM_A is free between operations, with physical transitions preserved');
   assert.ok(c);
 }
 return {label,hardValid:true,obligations:scheduled.length,occupations};
});
writeFileSync(output,JSON.stringify({status:'PASS',days},null,2));
console.log(JSON.stringify({status:'PASS',obligations:days.map(d=>d.obligations)}));
