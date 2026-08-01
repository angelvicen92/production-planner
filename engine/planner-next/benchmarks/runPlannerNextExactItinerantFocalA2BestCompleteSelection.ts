import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { anchoredTaskIds } from "../anchoredAccompaniment";
import type { PlannerNextProblem } from "../contracts";
import { constructExactItinerantPlan, runExactItinerantPlanSearch } from "../exactItinerantPlan";
import { evaluateParticipantItineraryQuality } from "../participantItineraryQuality";
import { createResidualObligationMainOrderer } from "../residualObligationAlignment";
import { validatePlan } from "../validate";
import { createAcceptedExactConstructiveFocalA2Problem } from "./focal-a2/focalA2ExactConstructiveConfiguration";
import { itinerantOperationProfiles } from "./focal-a2/focalA2RealityReference";

type Mode = "BASELINE_LOW" | "RESIDUAL_FIRST" | "BEST_DOMINATING_WITHIN_BUDGET";
const reverseWindows = <T extends { availability: Array<{ start: number; end: number }> }>(items: T[]) => {
  items.reverse(); for (const item of items) item.availability.reverse();
};
function createProblem(reversed = false): PlannerNextProblem {
  const problem = createAcceptedExactConstructiveFocalA2Problem(reversed ? [...itinerantOperationProfiles].reverse() : itinerantOperationProfiles);
  if (reversed) {
    problem.tasks.reverse(); for (const task of problem.tasks) task.availability?.reverse();
    reverseWindows(problem.participants); reverseWindows(problem.spaces); reverseWindows(problem.resources);
    reverseWindows(problem.coaches); problem.anchoredAccompaniments?.reverse();
  }
  return problem;
}
function run(mode: Mode, reversed = false) {
  const problem = createProblem(reversed), before = JSON.stringify(problem), started = performance.now();
  const coreIds = new Set(problem.tasks.filter(({ kind }) => kind === "main" || kind === "vocal").map(({ id }) => id));
  for (const id of anchoredTaskIds(problem)) coreIds.add(id);
  const orderer = mode === "BASELINE_LOW" ? null : createResidualObligationMainOrderer(problem,
    problem.tasks.filter(({ id }) => !coreIds.has(id)));
  const plan = mode === "BASELINE_LOW" ? constructExactItinerantPlan(problem) : runExactItinerantPlanSearch(problem, {
    coreOrderer: orderer!.options,
    standaloneCompletionSelection: mode === "RESIDUAL_FIRST" ? "FIRST_HARD_VALID" : "BEST_DOMINATING_WITHIN_BUDGET",
  });
  const quality = evaluateParticipantItineraryQuality(problem, plan.scheduledTasks).summary;
  const core = plan.scheduledTasks.filter(({ id }) => coreIds.has(id));
  const meals = plan.scheduledSpaceMeals;
  return { mode, plan, quality, core, meals, hardValid: validatePlan(problem, plan.scheduledTasks, [], meals).hardValid,
    inputUnchanged: JSON.stringify(problem) === before, runtimeMs: performance.now() - started };
}

const variants = (["BASELINE_LOW", "RESIDUAL_FIRST", "BEST_DOMINATING_WITHIN_BUDGET"] as const).map((mode) => {
  const first = run(mode), second = run(mode), reversed = run(mode, true);
  assert.deepEqual(second.plan, first.plan); assert.deepEqual(reversed.plan, first.plan);
  assert.equal(first.inputUnchanged && second.inputUnchanged && reversed.inputUnchanged, true);
  assert.equal(first.plan.status, "COMPLETE"); assert.equal(first.plan.scheduledTasks.length, 53); assert.equal(first.hardValid, true);
  return { mode, first, secondRuntimeMs: second.runtimeMs, reversedRuntimeMs: reversed.runtimeMs };
});
const baseline = variants[0]!.first, residual = variants[1]!.first, selected = variants[2]!.first;
assert.equal(residual.plan.evidence.fullFingerprint, "38309867fb51dcb14515d152035b7076a4738cac04d3d8cea721ec7be0749fa8");
assert.equal(residual.quality.qualityFingerprint, "13a87e0d9b6983c18ca5a0162785058b67b10f8ea65d46644463f49063791c75");
assert.deepEqual(residual.core, selected.core); assert.deepEqual(residual.meals, selected.meals);
const result = selected.plan.evidence.completePlansObserved === 0 ? "NO_COMPLETE_INCUMBENT"
  : selected.plan.evidence.completeIncumbentReplacements > 0 ? "IMPROVES_FIRST_COMPLETE" : "EQUIVALENT_TO_FIRST_COMPLETE";
const summary = (item: typeof baseline) => ({ branches: item.plan.evidence.branchesExplored,
  coreBranches: item.plan.evidence.coreBranches, standaloneBranches: item.plan.evidence.standaloneBranches,
  completePlansObserved: item.plan.evidence.completePlansObserved,
  replacements: item.plan.evidence.completeIncumbentReplacements,
  firstFingerprint: item.plan.evidence.firstCompleteFingerprint,
  selectedFingerprint: item.plan.evidence.selectedCompleteFingerprint,
  selectedQualityFingerprint: item.quality.qualityFingerprint,
  firstMetrics: item.plan.evidence.firstCompleteQuality, selectedMetrics: item.plan.evidence.selectedCompleteQuality,
  hardValid: item.hardValid, inputUnchanged: item.inputUnchanged, stoppedByBudget: item.plan.evidence.completeSelectionStoppedByBudget,
  runtimeMs: item.runtimeMs });
process.stdout.write(`${JSON.stringify({ result, variants: variants.map(({ mode, first, secondRuntimeMs, reversedRuntimeMs }) =>
  ({ mode, ...summary(first), secondRuntimeMs, reversedRuntimeMs })), deltas: {
    idle: selected.quality.totalIdleMinutes - residual.quality.totalIdleMinutes,
    maximumIdle: selected.quality.maximumParticipantIdleMinutes - residual.quality.maximumParticipantIdleMinutes,
    maximumGap: selected.quality.maximumSingleGapMinutes - residual.quality.maximumSingleGapMinutes,
    gaps: selected.quality.totalGapCount - residual.quality.totalGapCount,
    spaceChanges: selected.quality.totalSpaceChangeCount - residual.quality.totalSpaceChangeCount },
  coreIdentical: true, mealsIdentical: true, deterministic: true, invariant: true }, null, 2)}\n`);
