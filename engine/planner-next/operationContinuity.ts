import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { hasRequiredSecondaryContinuity, secondaryGapMinutes } from "./secondaryContinuity";

/** Group membership is an explicit authority; room occupancy remains independent. */
export function assessOperationContinuity(problem: Pick<PlannerNextProblem, "operationContinuityGroups">,
  tasks: readonly ScheduledTask[]) {
  return (problem.operationContinuityGroups ?? []).map(group => {
    const members = tasks.filter(task => group.taskIds.includes(task.id));
    const gapMinutes = secondaryGapMinutes(members);
    const complete = members.length === (group.declaredTaskCount ?? group.taskIds.length);
    return { groupId: group.id, policy: group.policy, requestedGapMinutes: 0, gapMinutes,
      deviationMinutes: group.policy === "OFF" ? 0 : gapMinutes,
      penalty: group.policy === "PREFERRED" ? gapMinutes * group.gapWeight : 0,
      satisfied: group.policy !== "REQUIRED" || complete && (members.length < 2 || hasRequiredSecondaryContinuity(members)),
      complete };
  });
}

export function assessSpacePolicies(problem: Partial<Pick<PlannerNextProblem,"spaces"|"operationalMealPolicies">>,tasks:readonly ScheduledTask[]){
  return (problem.spaces??[]).filter(space=>space.setupPolicy?.contractVersion===2).map(space=>{
    const own=tasks.filter(task=>task.spaceId===space.id).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
    const sequence=own.flatMap((task,index)=>task.setupFamilyId&&task.setupFamilyId!==own[index-1]?.setupFamilyId?[task.setupFamilyId]:[]);
    const changes=Math.max(0,sequence.length-1),reentries=sequence.length-new Set(sequence).size;
    const prep=space.setupPolicy!.groupingPolicy==="OFF"?0:changes*(space.setupPolicy!.preparationMinutesBetweenFamilies??0);
    const pauses=(problem.operationalMealPolicies??[]).filter(p=>p.spaceIds.includes(space.id)&&p.duration===p.window.end-p.window.start&&own.length&&p.window.start>=own[0].start&&p.window.end<=own.at(-1)!.end).reduce((sum,p)=>sum+p.duration,0);
    const gapMinutes=Math.max(0,secondaryGapMinutes(own)-prep-pauses);
    const continuityPenalty=space.secondaryContinuity==="PREFERRED"?gapMinutes:0;
    const setupPenalty=space.setupPolicy!.groupingPolicy==="PREFERRED"?changes+reentries:0;
    return {spaceId:space.id,continuityPolicy:space.secondaryContinuity,groupingPolicy:space.setupPolicy!.groupingPolicy,gapMinutes,changes,reentries,continuityPenalty,setupPenalty,penalty:continuityPenalty+setupPenalty};
  });
}

export function continuityPenalty(problem: Pick<PlannerNextProblem, "operationContinuityGroups"> & Partial<Pick<PlannerNextProblem,"spaces"|"operationalMealPolicies">>, tasks: readonly ScheduledTask[]) {
  return assessOperationContinuity(problem, tasks).reduce((sum, group) => sum + group.penalty, 0)+assessSpacePolicies(problem,tasks).reduce((sum,space)=>sum+space.penalty,0);
}

export function operationContinuityPreflight(problem: Pick<PlannerNextProblem, "operationContinuityGroups" | "tasks" | "mainFlow" | "transportPolicy">): string[] {
  const groups = problem.operationContinuityGroups ?? [];
  if(!Array.isArray(groups)) return ["INVALID_OPERATION_CONTINUITY_GROUP"];
  const seen = new Set<string>(), members = new Set<string>();
  for (const group of groups) {
    if (!group || typeof group.id !== "string" || !group.id || seen.has(group.id)
      || !["OFF", "PREFERRED", "REQUIRED"].includes(group.policy) || !Number.isInteger(group.gapWeight)
      || group.gapWeight < 1 || group.gapWeight > 1000 || !Array.isArray(group.taskIds) || !group.taskIds.length
      || new Set(group.taskIds).size !== group.taskIds.length
      || group.declaredTaskCount !== undefined && (!Number.isInteger(group.declaredTaskCount)
        || group.declaredTaskCount < group.taskIds.length
        || group.policy === "REQUIRED" && group.declaredTaskCount !== group.taskIds.length)) return ["INVALID_OPERATION_CONTINUITY_GROUP"];
    seen.add(group.id);
    const tasks = group.taskIds.map(id => problem.tasks.find(task => task.id === id));
    const transportIds=[...(problem.transportPolicy?.arrival.taskIds??[]),...(problem.transportPolicy?.departure.taskIds??[])];
    if (tasks.some(task => !task || task.kind !== "auxiliary" || task.spaceId === problem.mainFlow?.spaceId
      || transportIds.includes(task.id) || task.blocksSpace === false || task.jointGroupId !== undefined || task.setupFamilyId !== undefined)
      || new Set(tasks.map(task => task?.spaceId)).size !== 1 || group.taskIds.some(id => members.has(id)))
      return ["UNSUPPORTED_OPERATION_CONTINUITY_MEMBERS"];
    group.taskIds.forEach(id => members.add(id));
  }
  return [];
}
