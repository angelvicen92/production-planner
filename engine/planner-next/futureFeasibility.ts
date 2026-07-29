import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { requiredSecondarySpaces, secondaryTasks } from "./secondaryContinuity";
import { canPlaceJointGroup, jointGroupIds, jointGroupMembers, jointWorkItemKey } from "./jointTasks";
import { pendingSpaceMealIds, spaceMealCandidateStarts } from "./spaceMeals";
import { generateTechnicalChainCandidates, getTechnicalChains, technicalChainWorkItemKey } from "./technicalChains";

export interface FutureWorkItemAssessment { key: string; kind: "task" | "joint" | "space" | "technical-chain" | "space-meal"; alternativeCount: number; feasible: boolean }
export interface FutureFeasibilityAssessment { feasible: boolean; blockingWorkItemKeys: string[]; minimumAlternativeCount: number; totalAlternativeCount: number; assessments: FutureWorkItemAssessment[]; branchesConsumed: number; exhausted: boolean }
export interface FutureBudget { remaining: number }
export type BlockProbe = (tasks: Task[], placed: ScheduledTask[], budget: FutureBudget, limit: number) => { count: number; exhausted: boolean };

/** A bounded, search-only forward check. It neither validates nor scores a finished plan. */
export function assessFutureFeasibility(problem: PlannerNextProblem, placed: ScheduledTask[], pending: Task[], budget: FutureBudget, probeBlock: BlockProbe, scheduledSpaceMeals:ScheduledSpaceMeal[]=[]): FutureFeasibilityAssessment {
  const before = budget.remaining;
  const required = new Set(requiredSecondarySpaces(problem).map(x => x.id));
  const assessments: FutureWorkItemAssessment[] = [];
  const chains=getTechnicalChains(pending), chainIds=new Set(chains.flat().map(t=>t.id));
  for(const chain of chains){const generated=generateTechnicalChainCandidates(problem,chain,placed,budget.remaining,"PROBE",problem.budget.bestK);budget.remaining-=generated.consumed;if(generated.exhausted)return result(assessments,before,budget,true);const root=chain[0]!;assessments.push({key:technicalChainWorkItemKey(root.id),kind:"technical-chain",alternativeCount:generated.candidates.length,feasible:generated.candidates.length>0});}
  for (const task of [...pending].filter(t => !chainIds.has(t.id) && !required.has(t.spaceId) && t.jointGroupId === undefined).sort((a,b)=>a.id.localeCompare(b.id))) {
    let count = 0;
    for (let start = problem.day.start; start + task.duration <= problem.day.end; start += 5) {
      if (budget.remaining === 0) return result(assessments, before, budget, true);
      budget.remaining -= 1;
      if (canPlaceTask(problem, task, start, placed,scheduledSpaceMeals)) { count += 1; if (count >= problem.budget.bestK) break; }
    }
    assessments.push({ key: `task:${task.id}`, kind: "task", alternativeCount: count, feasible: count > 0 });
  }
  for(const id of jointGroupIds(pending)) {
    const members=jointGroupMembers(pending,id); let count=0;
    const duration=members[0]?.duration??0;
    for(let start=problem.day.start;start+duration<=problem.day.end;start+=5) {
      if(budget.remaining===0)return result(assessments,before,budget,true);
      budget.remaining-=1;
      if(canPlaceJointGroup(problem,members,start,placed)){count+=1;if(count>=problem.budget.bestK)break;}
    }
    assessments.push({key:jointWorkItemKey(id),kind:"joint",alternativeCount:count,feasible:count>0});
  }
  const spaceIds = [...new Set(pending.filter(t => required.has(t.spaceId)).map(t => t.spaceId))].sort();
  for (const spaceId of spaceIds) {
    const probe = probeBlock(secondaryTasks(pending, spaceId), placed, budget, problem.budget.bestK);
    if (probe.exhausted) return result(assessments, before, budget, true);
    assessments.push({ key: `space:${spaceId}`, kind: "space", alternativeCount: probe.count, feasible: probe.count > 0 });
  }
  for(const spaceId of pendingSpaceMealIds(problem,scheduledSpaceMeals)){let count=0;for(const start of spaceMealCandidateStarts(problem,spaceId,placed,scheduledSpaceMeals)){if(budget.remaining===0)return result(assessments,before,budget,true);budget.remaining-=1;count+=1;if(count>=problem.budget.bestK)break}assessments.push({key:`meal:${spaceId}`,kind:"space-meal",alternativeCount:count,feasible:count>0});}
  return result(assessments, before, budget, false);
}
function result(assessments: FutureWorkItemAssessment[], before: number, budget: FutureBudget, exhausted: boolean): FutureFeasibilityAssessment {
  const blockers = assessments.filter(x=>!x.feasible).map(x=>x.key);
  return { feasible: !exhausted && blockers.length === 0, blockingWorkItemKeys: blockers, minimumAlternativeCount: assessments.length ? Math.min(...assessments.map(x=>x.alternativeCount)) : 0, totalAlternativeCount: assessments.reduce((s,x)=>s+x.alternativeCount,0), assessments, branchesConsumed: before-budget.remaining, exhausted };
}
