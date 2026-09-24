import type { ParticipantMealObligation, ScheduledParticipantMeal } from "../engine/planner-next/contracts";
import { participantMealWitnessFingerprint } from "../engine/planner-next/participantMeals";

export interface ParticipantMealInfeasibilityEvidence {
  /** Individually empty domains certified by Planner Next's analytic probe. */
  readonly zeroDomainMealSourceIds?: readonly string[];
  /** Meal obligations covered by a sound collective or exact infeasibility proof. */
  readonly infeasibleMealSourceIds?: readonly string[];
}

export function certifyGlobalParticipantMealGate(
  obligations: readonly ParticipantMealObligation[],
  protectedMeals: readonly ScheduledParticipantMeal[],
  witnessMeals: readonly ScheduledParticipantMeal[],
  reasonCodes: readonly string[],
  infeasibilityEvidence: ParticipantMealInfeasibilityEvidence = {},
) {
  const required=new Set(obligations.map(meal=>meal.sourceTaskId));
  const certified=new Map([...protectedMeals,...witnessMeals].map(meal=>[meal.sourceTaskId,meal]));
  const uncertifiedMealSourceIds=[...required].filter(id=>!certified.has(id)).sort();
  const zeroDomainMealSourceIds=[...new Set(infeasibilityEvidence.zeroDomainMealSourceIds??[])]
    .filter(id=>required.has(id)&&!certified.has(id)).sort();
  const infeasibleMealSourceIds=[...new Set([
    ...zeroDomainMealSourceIds,...(infeasibilityEvidence.infeasibleMealSourceIds??[]),
  ])].filter(id=>required.has(id)&&!certified.has(id)).sort();
  // An absent terminal witness is not a proof that its domain is empty.  Any
  // exhausted planner phase makes the global certificate incomplete, even
  // when the participant-meal sub-search itself did not consume the budget.
  const budget=reasonCodes.some(code=>code.endsWith("BUDGET_EXHAUSTED"));
  return Object.freeze({participantMealObligationCount:required.size,protectedParticipantMealCount:protectedMeals.length,
    flexiblePendingParticipantMealCount:Math.max(0,required.size-protectedMeals.length),
    globallyCertifiedParticipantMealCount:[...certified.keys()].filter(id=>required.has(id)).length,
    globalParticipantMealWitnessFingerprint:uncertifiedMealSourceIds.length?null:participantMealWitnessFingerprint([...certified.values()]),
    zeroDomainMealSourceIds:Object.freeze(zeroDomainMealSourceIds),
    infeasibleMealSourceIds:Object.freeze(infeasibleMealSourceIds),
    uncertifiedMealSourceIds:Object.freeze(uncertifiedMealSourceIds),
    globalMealGate:uncertifiedMealSourceIds.length===0?"PASS" as const
      :infeasibleMealSourceIds.length?"PRUNE" as const
      :budget?"BUDGET_EXHAUSTED" as const:"INCONCLUSIVE" as const});
}
