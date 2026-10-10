/** Experimental compiler: current canonical authorities only. No lineage or solution input. */
import type { PlannerNextProblem,ScheduledTask,Task,ScheduledOperationalMeal } from '../../engine/planner-next/contracts';
import { exactTaskStaticStartDomain,effectiveResourceTransitionMinutes } from '../../engine/planner-next/placement';
import { materializeItinerantUnitAssignment } from '../../engine/planner-next/itinerantUnitAssignment';
import { participantGapMinutes } from '../../engine/planner-next/participantTransition';
import { effectiveCoachTransitionMinutes } from '../../engine/planner-next/coachRouteTransitions';
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES as GRID } from '../../engine/planner-next/integration/plannerNextCapabilities';

export function buildGlobalCandidateModel(source:PlannerNextProblem,protectedTasks:readonly ScheduledTask[]=[],protectedOperationalMeals:readonly ScheduledOperationalMeal[]=[]){
 const protectedById=new Map(protectedTasks.map(t=>[t.id,t]));
 if(protectedTasks.some(t=>!source.tasks.some(s=>s.id===t.id)))throw Error('UNKNOWN_PROTECTED_TASK');
 const tasks=source.tasks.map(task=>{
  const fixed=protectedById.get(task.id);
  const unitIds=fixed?[fixed.itinerantUnitId]:task.allowedItinerantUnitIds?.length?task.allowedItinerantUnitIds:[task.itinerantUnitId];
  const variants=unitIds.flatMap(unit=>{
   const materialized:Task|null=unit&&unit!==task.itinerantUnitId?materializeItinerantUnitAssignment(source,task,unit):task;
   if(!materialized)return[];
   const starts=[...exactTaskStaticStartDomain(source,materialized,[]).starts()].filter(s=>!fixed||s===fixed.start);
   return [{task:materialized,starts}];
  });
  return {id:task.id,duration:task.duration,dependencies:task.dependencies,variants};
 });
 const transport=new Map<string,string>();for(const d of ['arrival','departure'] as const)for(const id of source.transportPolicy?.[d].taskIds??[])transport.set(id,d);
 const paired:any[]=[];
 const internal=(a:Task,b:Task)=>(source.anchoredAccompaniments??[]).some(c=>{const ids=[...c.beforeTaskIds,c.anchorTaskId,...c.afterTaskIds];return ids.includes(a.id)&&ids.includes(b.id);});
 const gap=(a:Task,b:Task)=>{
  let n=participantGapMinutes(source,a,b);
  if(a.coachId&&a.coachId===b.coachId)n=Math.max(n,effectiveCoachTransitionMinutes(source,a.coachId,a.spaceId,b.spaceId));
  if(a.spaceId!==b.spaceId&&!internal(a,b)){
   for(const id of a.requiredResourceIds??[])if(b.requiredResourceIds?.includes(id))n=Math.max(n,effectiveResourceTransitionMinutes(source,id));
   if(a.itinerantUnitId&&a.itinerantUnitId===b.itinerantUnitId)n=Math.max(n,source.itinerantUnits?.find(u=>u.id===a.itinerantUnitId)?.transitionMinutes??0);
  }return n;
 };
 for(let i=0;i<tasks.length;i++)for(let j=i+1;j<tasks.length;j++){
  const left=tasks[i]!,right=tasks[j]!;
  for(let ai=0;ai<left.variants.length;ai++)for(let bi=0;bi<right.variants.length;bi++){
   const a=left.variants[ai]!.task,b=right.variants[bi]!.task;
   if(a.jointGroupId&&a.jointGroupId===b.jointGroupId)continue;
   if(transport.get(a.id)&&transport.get(a.id)===transport.get(b.id))continue;
   const conflict=(a.participantId&&a.participantId===b.participantId)||(a.coachId&&a.coachId===b.coachId)||a.spaceId===b.spaceId
    ||(a.requiredResourceIds??[]).some(id=>b.requiredResourceIds?.includes(id))||(a.itinerantUnitId&&a.itinerantUnitId===b.itinerantUnitId);
   if(conflict)paired.push({a:a.id,b:b.id,ai,bi,gapAB:gap(a,b),gapBA:gap(b,a)});
  }
 }
 const meals=(source.participantMeals??[]).map(m=>{const person=source.participants.find(p=>p.id===m.participantId);const starts=[];
  for(let s=m.window.start;s+m.duration<=m.window.end;s+=GRID)if((!m.fixedInterval||s===m.fixedInterval.start)&&person?.availability.some(w=>w.start<=s&&s+m.duration<=w.end))starts.push(s);
  return {...m,starts};});
 return {version:1,qualification:'EXPERIMENTAL candidate model; negatives are INCONCLUSIVE. Full canonical certification mandatory.',
  source,tasks,meals,paired,protectedTasks,protectedOperationalMeals,grid:GRID};
}
