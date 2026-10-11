import { createHash } from 'node:crypto';
import type { PlannerNextProblem } from '../../engine/planner-next/contracts';
import type { FutureJointCompletionWitnessV1 } from '../../engine/planner-next/anonymousPipelineWitness';
import { revalidateJointCompletionWitness } from '../../engine/planner-next/jointCompletionWitness';
import { validatePlan } from '../../engine/planner-next/validate';
import { materializeScheduledItinerantUnitMeals } from '../../engine/planner-next/itinerantUnitMeals';
/** Review an independent local copy of S10. Never changes the recorded stages or a database. */
export function reviewA2Draft(source:PlannerNextProblem,recorded:FutureJointCompletionWitnessV1,edits:unknown){
 if(!Array.isArray(edits)||edits.length>recorded.tasks.length+recorded.participantMeals.length)throw Error('INVALID_EDITS');
 const changes=new Map<string,{start:number;end:number}>();
 const minute=(s:unknown)=>{if(typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('INVALID_TIME');return Number(s.slice(0,2))*60+Number(s.slice(3));};
 for(const row of edits){const id=`task:${row.taskId}`;
  if(!Number.isInteger(row.taskId)||changes.has(id))throw Error('INVALID_TASK_ID');
  const task=recorded.tasks.find(t=>t.id===id)??recorded.participantMeals.find(m=>m.sourceTaskId===id);
  const start=minute(row.start),end=minute(row.end);if(!task||end-start!==task.duration)throw Error('INVALID_DURATION_OR_TASK');
  changes.set(id,{start,end});
 }
 const {fingerprint:_fingerprint,...original}=recorded;
 const body={...original,tasks:recorded.tasks.map(t=>({...t,...changes.get(t.id)})),participantMeals:recorded.participantMeals.map(m=>({...m,...changes.get(m.sourceTaskId)}))};
 const candidate={...body,fingerprint:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
 const resourceMeals=(source.resourceMeals??[]).map(m=>({id:m.id,sourceTaskId:m.sourceTaskId,resourceIds:m.resourceIds,start:m.interval.start,end:m.interval.end,duration:m.interval.end-m.interval.start}));
 const validation=validatePlan(source,[...candidate.tasks],[...candidate.preparations],[...candidate.spaceMeals],[...candidate.participantMeals],resourceMeals,materializeScheduledItinerantUnitMeals(source),[...candidate.roundPreparations],[...candidate.operationalMeals]);
 let charges=0;const replay=revalidateJointCompletionWitness(source,candidate,[],()=>charges<100_000?(charges++,true):false);
 return {feasible:validation.hardValid&&replay==='PASS',replay,auditCharges:charges,violations:validation.violations,reasonCodes:validation.reasonCodes,
  reasons:validation.reasonCodes.map(code=>({message:code})),mode:'LOCAL_INDEPENDENT_REVIEW',persisted:false};
}
