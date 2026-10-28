/** Independent constructive capacity witness, derived from workload, never sent to the app or SQL. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {validatePlan} from '../../../engine/planner-next/validate';
import {materializeItinerantUnitAssignment} from '../../../engine/planner-next/itinerantUnitAssignment';
const base=process.argv[2],input=JSON.parse(readFileSync(`${base}/integrated-memory-input.json`,'utf8')),map=JSON.parse(readFileSync(`${base}/integrated-obligations.json`,'utf8'));
const adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('adapter');const p=adapter.problem;
const tasks:any[]=[],put=(id:number,start:number)=>{
 let task=p.tasks.find(t=>t.id==='task:'+id)!;assert.ok(task);
 if(task.itinerantUnitId){const assigned=materializeItinerantUnitAssignment(p,task,task.itinerantUnitId);assert.ok(assigned);task=assigned;}
 tasks.push({...task,start,end:start+task.duration});return start+task.duration;
};
// Workload bounds: preparations serial, each phase serial by physical operation, closures serial.
let cursor=p.day.start;
for(const g of map.groups)cursor=put(g[0].id,cursor);
for(const phase of map.policy.phases)for(const id of phase){const start=cursor;cursor=put(id,start);for(const group of map.jointStructure.groups)if(group.taskIds.includes(id))for(const peer of group.taskIds)if(peer!==id)put(peer,start);}
for(const g of map.groups)cursor=put(g.at(-1).id,cursor);
let rivalStart=cursor;for(const rival of map.competitors){
 const restEnd=p.operationalMealPolicies![0].window.end;
 // One resource-independent rival may fit before rest; later operations start after the latest allowed pause.
 const task=p.tasks.find(t=>t.id==='task:'+rival.id)!;
 if(rivalStart<p.operationalMealPolicies![0].window.start&&rivalStart+task.duration<=p.operationalMealPolicies![0].window.start)rivalStart=put(rival.id,rivalStart);
 else rivalStart=put(rival.id,Math.max(restEnd,rivalStart));
}
const technicalEnd=put(map.technicalTask.id,rivalStart);
const productionStart=Math.ceil(Math.max(cursor,technicalEnd)/5)*5;
// Feeder cohort follows coach identity. Schedule all feeders, then a continuous Main column with the same cohort order.
const mains=p.tasks.filter(t=>t.kind==='main').sort((a,b)=>String(a.coachId).localeCompare(String(b.coachId))||a.id.localeCompare(b.id));
let feederEnd=productionStart;for(const main of mains)feederEnd=put(Number(main.dependencies[0].slice(5)),feederEnd);
let mainEnd=feederEnd;for(const main of mains)mainEnd=put(Number(main.id.slice(5)),mainEnd);
const policy=p.operationalMealPolicies![0],operationalMeals=[{id:policy.id,start:policy.window.end-policy.duration,end:policy.window.end,duration:policy.duration,resourceIds:policy.resourceIds,spaceIds:policy.spaceIds}];
assert.equal(tasks.length,input.tasks.length);assert.equal(new Set(tasks.map(t=>t.id)).size,input.tasks.length);
const validation=validatePlan(p,tasks,[],[],[],[],[],[],operationalMeals);
writeFileSync(process.argv[3],JSON.stringify({memoryOnly:true,stage:false,algorithm:'Serialize preparations, phases and closures; pack rivals around the declared pause; serialize feeder cohorts by coach, then the continuous Main column. No human times or solver output.',taskCount:tasks.length,mainEnd,tasks,operationalMeals,validation},null,2));
assert.ok(validation.hardValid,JSON.stringify(validation));console.log(JSON.stringify({status:'PASS',tasks:tasks.length,mainEnd,hardValid:validation.hardValid}));
