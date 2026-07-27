import type { PlannerNextProblem, ScheduledTask, ValidationSummary } from "./contracts";
import { contains, overlaps } from "./time";

export function preflight(p: PlannerNextProblem): string[] {
  const reasons: string[] = [];
  if (p.day.start >= p.day.end) reasons.push("INVALID_DAY");
  if (p.mainFlow.continuity !== "REQUIRED") reasons.push("MAIN_FLOW_CONTINUITY_REQUIRED");
  if (p.budget.bestK < 1 || p.budget.maxBacktracks < 0) reasons.push("INVALID_SEARCH_BUDGET");
  const ids = (xs: {id:string}[]) => new Set(xs.map(x=>x.id));
  if (ids(p.tasks).size !== p.tasks.length) reasons.push("DUPLICATE_TASK_ID");
  const people=ids(p.participants), coaches=ids(p.coaches), spaces=ids(p.spaces), tasks=ids(p.tasks);
  for (const t of p.tasks) if (!people.has(t.participantId)||!coaches.has(t.coachId)||!spaces.has(t.spaceId)||t.duration<=0||t.dependencies.some(d=>!tasks.has(d))) reasons.push("INVALID_TASK_REFERENCE");
  if (!spaces.has(p.mainFlow.spaceId)) reasons.push("MISSING_MAIN_FLOW_SPACE");
  return [...new Set(reasons)].sort();
}

export function validatePlan(p: PlannerNextProblem, scheduled: ScheduledTask[]): ValidationSummary {
  let dependency=0, overlap=0, transition=0, availability=0, block=0;
  const byId=new Map(scheduled.map(t=>[t.id,t])); const participants=new Map(p.participants.map(x=>[x.id,x])); const coaches=new Map(p.coaches.map(x=>[x.id,x])); const spaces=new Map(p.spaces.map(x=>[x.id,x]));
  for (const t of scheduled) {
    if (t.end-t.start!==t.duration || t.start<p.day.start || t.end>p.day.end || overlaps(t,p.protectedMeal) || !contains(participants.get(t.participantId)?.availability??[],t.start,t.end) || !contains(coaches.get(t.coachId)?.availability??[],t.start,t.end) || !contains(spaces.get(t.spaceId)?.availability??[],t.start,t.end)) availability++;
    for (const d of t.dependencies) { const feeder=byId.get(d); if (!feeder || feeder.end>t.start) dependency++; }
  }
  for (let i=0;i<scheduled.length;i++) for(let j=i+1;j<scheduled.length;j++) { const a=scheduled[i],b=scheduled[j]; if (!overlaps(a,b)) continue; if(a.participantId===b.participantId||a.coachId===b.coachId||a.spaceId===b.spaceId) overlap++; }
  for (const field of ["participantId","coachId"] as const) {
    const margin=field==="participantId"?p.participantTransitionMinutes:p.resourceTransitionMinutes;
    const groups=new Map<string,ScheduledTask[]>(); for(const t of scheduled) groups.set(t[field],[...(groups.get(t[field])??[]),t]);
    for(const list of groups.values()) { list.sort((a,b)=>a.start-b.start); for(let i=1;i<list.length;i++) if(list[i-1].spaceId!==list[i].spaceId && list[i].start-list[i-1].end<margin) transition++; }
  }
  const mains=scheduled.filter(t=>t.kind==="main").sort((a,b)=>a.start-b.start); if(mains.length) { if(mains.at(-1)!.end!==p.mainFlow.preferredEnd) block++; for(let i=1;i<mains.length;i++) if(mains[i-1].end!==mains[i].start) block++; const runs:{key:string;n:number}[]=[]; for(const t of mains){const key=t.blockKey!; if(runs.at(-1)?.key===key) runs.at(-1)!.n++;else runs.push({key,n:1});} const counts=new Map<string,number>(); for(const r of runs){counts.set(r.key,(counts.get(r.key)??0)+1);if(r.n<p.mainFlow.minTasksPerBlock)block++;} if([...counts.values()].some(n=>n>p.mainFlow.maxBlocksByKey))block++; }
  const reasonCodes:string[]=[]; if(scheduled.length!==p.tasks.length)reasonCodes.push("UNPLANNED_TASKS"); if(dependency)reasonCodes.push("DEPENDENCY_VIOLATION");if(overlap)reasonCodes.push("OVERLAP_VIOLATION");if(transition)reasonCodes.push("TRANSITION_VIOLATION");if(availability)reasonCodes.push("AVAILABILITY_VIOLATION");if(block)reasonCodes.push("BLOCK_VIOLATION");
  return {hardValid:reasonCodes.length===0,dependencyViolationCount:dependency,overlapViolationCount:overlap,transitionViolationCount:transition,availabilityViolationCount:availability,blockViolationCount:block,reasonCodes};
}
