import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {canPlaceTask,effectiveResourceTransitionMinutes} from '../../engine/planner-next/placement';
import {participantGapMinutes} from '../../engine/planner-next/participantTransition';
import {effectiveCoachTransitionMinutes} from '../../engine/planner-next/coachRouteTransitions';
import {materializeItinerantUnitAssignment} from '../../engine/planner-next/itinerantUnitAssignment';
// Diagnostic only: no import or invocation of a production search.
const artifact=process.argv[2]??'docs/evidence/ASST-010-S2-PROTECTED-FEASIBLE.json';
const p=process.argv[3]??'work/asst010-protected-oracle';mkdirSync(p,{recursive:true});
const {source,protectedTasks,priorJoint,protectedOperationalMeals}=JSON.parse(readFileSync(artifact,'utf8'));
const oldById=new Map<string,any>(priorJoint.tasks.map((task:any)=>[task.id,task]));
const tasks=source.tasks.map((task:any)=>{
 const old=oldById.get(task.id);
 return old.itinerantUnitId&&old.itinerantUnitId!==task.itinerantUnitId?materializeItinerantUnitAssignment(source,task,old.itinerantUnitId):task;
});
const byId=new Map<string,any>(tasks.map((task:any)=>[task.id,task]));
const domains=tasks.map((task:any)=>({id:task.id,duration:task.duration,dependencies:task.dependencies,
 participantId:task.participantId,starts:Array.from({length:Math.floor((source.day.end-source.day.start-task.duration)/5)+1},(_,i)=>source.day.start+5*i)
 .filter(at=>canPlaceTask(source,task,at,[],priorJoint.spaceMeals)
  &&priorJoint.operationalMeals.every((meal:any)=>!(meal.spaceIds.includes(task.spaceId)||[...(task.requiredResourceIds??[]),task.coachId].some((id:string)=>meal.resourceIds.includes(id)))||at+task.duration<=meal.start||at>=meal.end))}));
const equalities:any[]=[],pairwise:any[]=[],transportPairs:any[]=[];
const offsetGroup=(ids:string[])=>{const first=oldById.get(ids[0]);for(const id of ids.slice(1))equalities.push({a:ids[0],b:id,offset:oldById.get(id).start-first.start});};
for(const jointId of [...new Set(tasks.map((task:any)=>task.jointGroupId).filter(Boolean))])offsetGroup(tasks.filter((task:any)=>task.jointGroupId===jointId).map((task:any)=>task.id));
for(const contract of source.anchoredAccompaniments??[])offsetGroup([...contract.beforeTaskIds,contract.anchorTaskId,...contract.afterTaskIds]);
for(const chain of source.technicalChains??[])offsetGroup(chain.orderedTaskIds);
const transportGroupByTaskId=new Map<string,string>();
for(const direction of ['arrival','departure']){
 const policy=source.transportPolicy?.[direction];if(!policy)continue;
 const groups=new Map<number,string[]>();for(const id of policy.taskIds){const at=oldById.get(id).start;groups.set(at,[...(groups.get(at)??[]),id]);}
 const ordered=[...groups].sort(([a],[b])=>a-b);
 for(const [at,ids] of ordered){offsetGroup(ids);for(const id of ids)transportGroupByTaskId.set(id,`${direction}:${at}`);}
 for(let i=1;i<ordered.length;i++)transportPairs.push({a:ordered[i-1][1][0],b:ordered[i][1][0],gap:policy.minGapMinutes});
}
// Keep only the prior discrete macro layout/assignments as a restriction; every
// nonprotected task start and participant meal may move in permuted-core mode. No product run receives it.
for(const policy of source.roundSynchronizations??[])offsetGroup(policy.lanes.flatMap((lane:any)=>lane.taskIds));
const secondary=new Map<string,string[]>();for(const task of tasks){if(!task.secondaryBlockKey&&!task.setupFamilyId)continue;
 const key=JSON.stringify([task.spaceId,task.secondaryBlockKey,task.setupFamilyId]);secondary.set(key,[...(secondary.get(key)??[]),task.id]);}
for(const ids of secondary.values())if(ids.length>1)offsetGroup(ids);
for(const space of source.spaces.filter((space:any)=>space.secondaryContinuity==='REQUIRED'))offsetGroup(tasks.filter((task:any)=>task.spaceId===space.id).map((task:any)=>task.id));
const anchorForward=new Set((source.anchoredAccompaniments??[]).flatMap((c:any)=>{const ids=[...c.beforeTaskIds,c.anchorTaskId,...c.afterTaskIds];return ids.slice(1).map((id:string,i:number)=>`${ids[i]}|${id}`);}));
const gap=(a:any,b:any)=>{
 let value=a.participantId&&a.participantId===b.participantId?participantGapMinutes(source,a,b):0;
 if(a.coachId&&a.coachId===b.coachId)value=Math.max(value,effectiveCoachTransitionMinutes(source,a.coachId,a.spaceId,b.spaceId));
 if(a.spaceId!==b.spaceId){for(const id of a.requiredResourceIds??[])if(b.requiredResourceIds?.includes(id))value=Math.max(value,effectiveResourceTransitionMinutes(source,id));
  if(a.itinerantUnitId&&a.itinerantUnitId===b.itinerantUnitId)value=Math.max(value,source.itinerantUnits.find((unit:any)=>unit.id===a.itinerantUnitId)?.transitionMinutes??0);}
 return anchorForward.has(`${a.id}|${b.id}`)?0:value;
};
for(let i=0;i<tasks.length;i++)for(const b of tasks.slice(i+1)){const a=tasks[i];
 if(a.jointGroupId&&a.jointGroupId===b.jointGroupId)continue;
 if(transportGroupByTaskId.has(a.id)&&transportGroupByTaskId.get(a.id)===transportGroupByTaskId.get(b.id))continue;
 const conflict=(a.participantId&&a.participantId===b.participantId)||(a.coachId&&a.coachId===b.coachId)||a.spaceId===b.spaceId
  ||(a.requiredResourceIds??[]).some((id:string)=>b.requiredResourceIds?.includes(id))||(a.itinerantUnitId&&a.itinerantUnitId===b.itinerantUnitId);
 if(conflict)pairwise.push({a:a.id,b:b.id,gapAB:gap(a,b),gapBA:gap(b,a)});
}
const preparations=priorJoint.preparations.map((prep:any)=>{
 const family=tasks.filter((task:any)=>task.spaceId===prep.spaceId&&task.setupFamilyId===prep.setupFamilyId).sort((a:any,b:any)=>oldById.get(a.id).start-oldById.get(b.id).start);
 return {...prep,reference:family[0]?.id,offset:prep.start-(family[0]?oldById.get(family[0].id).start:0)};
});
const roundPreparations=priorJoint.roundPreparations.map((prep:any)=>{
 const policy=source.roundSynchronizations.find((item:any)=>item.id===prep.synchronizationId);
 const reference=policy.lanes[0].taskIds[0];return {...prep,reference,offset:prep.start-oldById.get(reference).start};
});
const fixedStarts=tasks.filter((task:any)=>task.kind==='main'||task.kind==='vocal').map((task:any)=>({id:task.id,start:oldById.get(task.id).start}));
for(const fixed of protectedTasks)if(!fixedStarts.some((item:any)=>item.id===fixed.id))fixedStarts.push({id:fixed.id,start:fixed.start});
const data={qualification:'Restricted independent CP-SAT oracle, preserves prior discrete macro layouts/assignments; fixed-core freezes Main/Vocal, fixed-main freezes Main only, permuted-core preserves only accepted tasks and the old Main slot set. Negative is NOT global infeasibility. Positive requires full canonical validation.',source,tasks,domains,equalities,pairwise,transportPairs,preparations,roundPreparations,fixedStarts,protectedTasks,protectedOperationalMeals,priorJoint};
writeFileSync(`${p}/full-oracle-input.json`,JSON.stringify(data));
console.log(JSON.stringify({tasks:tasks.length,meals:source.participantMeals.length,pairwise:pairwise.length,equalities:equalities.length,zeroDomains:domains.filter((x:any)=>!x.starts.length).map((x:any)=>x.id)}));
