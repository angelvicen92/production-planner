import type { ParticipantMealObligation, ScheduledParticipantMeal } from "../engine/planner-next/contracts";
import { participantMealWitnessFingerprint } from "../engine/planner-next/participantMeals";

export function certifyGlobalParticipantMealGate(
  obligations: readonly ParticipantMealObligation[],
  protectedMeals: readonly ScheduledParticipantMeal[],
  witnessMeals: readonly ScheduledParticipantMeal[],
  reasonCodes: readonly string[],
) {
  const required=new Set(obligations.map(meal=>meal.sourceTaskId));
  const certified=new Map([...protectedMeals,...witnessMeals].map(meal=>[meal.sourceTaskId,meal]));
  const zeroDomainMealSourceIds=[...required].filter(id=>!certified.has(id)).sort();
  // An absent terminal witness is not a proof that its domain is empty.  Any
  // exhausted planner phase makes the global certificate incomplete, even
  // when the participant-meal sub-search itself did not consume the budget.
  const budget=reasonCodes.some(code=>code.endsWith("BUDGET_EXHAUSTED"));
  return Object.freeze({participantMealObligationCount:required.size,protectedParticipantMealCount:protectedMeals.length,
    flexiblePendingParticipantMealCount:Math.max(0,required.size-protectedMeals.length),
    globallyCertifiedParticipantMealCount:[...certified.keys()].filter(id=>required.has(id)).length,
    globalParticipantMealWitnessFingerprint:zeroDomainMealSourceIds.length?null:participantMealWitnessFingerprint([...certified.values()]),
    zeroDomainMealSourceIds:Object.freeze(zeroDomainMealSourceIds),
    globalMealGate:zeroDomainMealSourceIds.length===0?"PASS" as const:budget?"BUDGET_EXHAUSTED" as const:"PRUNE" as const});
}
