import { createHash } from "node:crypto";
import type { FutureJointCompletionWitnessV1 } from "./anonymousPipelineWitness";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { materializeItinerantUnitAssignment } from "./itinerantUnitAssignment";
import { materializeScheduledItinerantUnitMeals } from "./itinerantUnitMeals";
import { validatePlan } from "./validate";

/** Replays a complete ephemeral context against current canonical authorities.
 * It performs no search, grants no protection, and charges each replayed vertex. */
export function revalidateJointCompletionWitness(source:PlannerNextProblem,witness:FutureJointCompletionWitnessV1,
  protectedTasks:readonly ScheduledTask[],consume:()=>boolean):"PASS"|"STALE"|"BUDGET_EXHAUSTED" {
  const {fingerprint,...body}=witness;
  if(witness.version!==1||createHash("sha256").update(JSON.stringify(body)).digest("hex")!==fingerprint)return "STALE";
  const taskById=new Map(source.tasks.map(task=>[task.id,task]));
  if(witness.tasks.length!==taskById.size||new Set(witness.tasks.map(task=>task.id)).size!==taskById.size)return "STALE";
  const semantics=(task:typeof source.tasks[number])=>{
    const {availability:_availability,...identity}=task;
    return JSON.stringify({...identity,dependencies:[...identity.dependencies].sort(),requiredResourceIds:[...(identity.requiredResourceIds??[])].sort()});
  };
  for(const scheduled of witness.tasks){
    if(!consume())return "BUDGET_EXHAUSTED";
    const expected=taskById.get(scheduled.id);if(!expected)return "STALE";
    const assigned=expected.itinerantUnitId===scheduled.itinerantUnitId?expected
      :materializeItinerantUnitAssignment(source,expected,scheduled.itinerantUnitId??"");
    const {start,end,...actual}=scheduled;
    if(!assigned||semantics(actual)!==semantics(assigned)||end-start!==assigned.duration
      ||!(assigned.availability??[source.day]).some(window=>window.start<=start&&end<=window.end))return "STALE";
  }
  for(const fixed of protectedTasks){const actual=witness.tasks.find(task=>task.id===fixed.id);
    if(!actual||actual.start!==fixed.start||actual.end!==fixed.end||actual.spaceId!==fixed.spaceId
      ||actual.itinerantUnitId!==fixed.itinerantUnitId
      ||JSON.stringify([...(actual.requiredResourceIds??[])].sort())!==JSON.stringify([...(fixed.requiredResourceIds??[])].sort()))return "STALE";
  }
  for(const _item of [...witness.preparations,...witness.roundPreparations,...witness.participantMeals,...witness.operationalMeals])
    if(!consume())return "BUDGET_EXHAUSTED";
  const resourceMeals=(source.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],
    start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
  return validatePlan(source,[...witness.tasks],[...witness.preparations],[...witness.spaceMeals],[...witness.participantMeals],resourceMeals,
    materializeScheduledItinerantUnitMeals(source),[...witness.roundPreparations],[...witness.operationalMeals]).hardValid?"PASS":"STALE";
}
