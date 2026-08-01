import assert from "node:assert/strict";
import { anchoredTaskIds } from "../anchoredAccompaniment";
import type { PlannerNextProblem } from "../contracts";
import { fingerprint } from "../fingerprint";
import { classifyFixedCoreExploration, evaluateStandaloneCompletion, fixedCoreStandaloneExplorationFingerprint,
  updateStandaloneParetoFrontier, type StandaloneCompletionPoint } from "../fixedCoreStandaloneExploration";
import { constructExactItinerantPlan, runExactItinerantPlanSearch, runExactStandaloneSearchForFixedCore } from "../exactItinerantPlan";
import { evaluateParticipantItineraryQuality } from "../participantItineraryQuality";
import { createResidualObligationMainOrderer } from "../residualObligationAlignment";
import { validatePlan } from "../validate";
import { createAcceptedExactConstructiveFocalA2Problem } from "./focal-a2/focalA2ExactConstructiveConfiguration";
import { itinerantOperationProfiles } from "./focal-a2/focalA2RealityReference";

const EXPECTED_CORE = "44f10279aa01fa7628c01962e9fbdd819d69486ae11df4fe4851de946600f07f";
const EXPECTED_FIRST = "38309867fb51dcb14515d152035b7076a4738cac04d3d8cea721ec7be0749fa8";
const EXPECTED_QUALITY = "13a87e0d9b6983c18ca5a0162785058b67b10f8ea65d46644463f49063791c75";
function createProblem(reversed = false): PlannerNextProblem {
  const p = createAcceptedExactConstructiveFocalA2Problem(reversed ? [...itinerantOperationProfiles].reverse() : itinerantOperationProfiles);
  if (reversed) { p.tasks.reverse(); p.participants.reverse(); p.spaces.reverse(); p.resources.reverse(); p.coaches.reverse();
    p.anchoredAccompaniments?.reverse(); for (const item of [...p.tasks, ...p.participants, ...p.spaces, ...p.resources, ...p.coaches]) item.availability?.reverse(); }
  return p;
}
function runPlans(reversed = false) {
  const problem = createProblem(reversed), before = JSON.stringify(problem);
  const coreIds = new Set(problem.tasks.filter((t) => t.kind === "main" || t.kind === "vocal").map(({ id }) => id));
  for (const id of anchoredTaskIds(problem)) coreIds.add(id);
  const pending = problem.tasks.filter(({ id }) => !coreIds.has(id));
  const baseline = constructExactItinerantPlan(problem); const orderer = createResidualObligationMainOrderer(problem, pending);
  const experiment = runExactItinerantPlanSearch(problem, { coreOrderer: orderer.options });
  return { problem, before, coreIds, pending, baseline, experiment, inputUnchanged: before === JSON.stringify(problem) };
}
const first = runPlans(), again = runPlans(), reversed = runPlans(true);
for (const run of [first, again, reversed]) {
  assert.equal(run.inputUnchanged, true); assert.equal(run.baseline.evidence.branchesExplored, 85_557);
  assert.equal(run.baseline.evidence.fullFingerprint, "fded1fd188ba3daa833f68ce74533e6db43fd6e801d64f7f4cebea42aa5224d6");
  assert.equal(run.experiment.evidence.branchesExplored, 70_704); assert.equal(run.experiment.evidence.selectedCoreFingerprint, EXPECTED_CORE);
  assert.equal(run.experiment.evidence.fullFingerprint, EXPECTED_FIRST);
}
assert.deepEqual(first.baseline, again.baseline); assert.deepEqual(first.baseline, reversed.baseline);
assert.deepEqual(first.experiment, again.experiment); assert.deepEqual(first.experiment, reversed.experiment);
const baselineQuality = evaluateParticipantItineraryQuality(first.problem, first.baseline.scheduledTasks);
const currentQuality = evaluateParticipantItineraryQuality(first.problem, first.experiment.scheduledTasks);
assert.equal(baselineQuality.summary.qualityFingerprint, "a64f641fcde8d470808a1b3e2eda986b5a99390600dd5c70ab189d37fc16189f");
assert.equal(currentQuality.summary.qualityFingerprint, EXPECTED_QUALITY);

function fixed(run: ReturnType<typeof runPlans>, explore: boolean) {
  const core = run.experiment.scheduledTasks.filter(({ id }) => run.coreIds.has(id));
  const coreFingerprint = fingerprint(core, [], run.experiment.scheduledSpaceMeals); assert.equal(coreFingerprint, EXPECTED_CORE);
  const before = JSON.stringify({ problem: run.problem, core, meals: run.experiment.scheduledSpaceMeals, pending: run.pending });
  const points: StandaloneCompletionPoint[] = []; let frontier: StandaloneCompletionPoint[] = [];
  const result = runExactStandaloneSearchForFixedCore(run.problem, core, run.experiment.scheduledSpaceMeals, run.pending,
    explore ? { onHardValidStandaloneLeaf(leaf) {
      const point = evaluateStandaloneCompletion(run.problem, leaf.scheduledTasks as typeof run.experiment.scheduledTasks,
        leaf.fullFingerprint, evaluateParticipantItineraryQuality(run.problem, run.baseline.scheduledTasks),
        evaluateParticipantItineraryQuality(run.problem, run.experiment.scheduledTasks), leaf.standaloneStarts, leaf.selectionOrder);
      points.push(point); frontier = updateStandaloneParetoFrontier(frontier, point); return "CONTINUE";
    }} : {});
  assert.equal(before, JSON.stringify({ problem: run.problem, core, meals: run.experiment.scheduledSpaceMeals, pending: run.pending }));
  return { result, points, frontier, coreFingerprint };
}
const protectedFirst = fixed(first, false), protectedAgain = fixed(again, false), protectedReversed = fixed(reversed, false);
for (const item of [protectedFirst, protectedAgain, protectedReversed]) {
  assert.equal(item.result.outcome, "FOUND"); assert.equal(fingerprint(item.result.scheduledTasks!, [], first.experiment.scheduledSpaceMeals), EXPECTED_FIRST);
  assert.deepEqual(item.result.selectionOrder, first.experiment.evidence.selectedStandaloneSelectionOrder);
  assert.equal(validatePlan(first.problem, item.result.scheduledTasks!, [], first.experiment.scheduledSpaceMeals).hardValid, true);
}
assert.deepEqual(protectedFirst.result, protectedAgain.result); assert.deepEqual(protectedFirst.result, protectedReversed.result);
const exploration = fixed(first, true), explorationAgain = fixed(again, true), explorationReversed = fixed(reversed, true);

const compact = (point: StandaloneCompletionPoint) => ({ fingerprint: point.metrics.fullFingerprint, qualityFingerprint: point.metrics.qualityFingerprint,
  vector: [point.metrics.grossHarm, point.metrics.maximumIndividualHarm, point.metrics.totalIdle, point.metrics.maximumIdle,
    point.metrics.maximumGap, point.metrics.gapCount, point.metrics.spaceChanges], standaloneStarts: point.metrics.standaloneStarts,
  selectionOrder: point.metrics.selectionOrder, flags: point.flags });
const compare = (keys: Array<keyof StandaloneCompletionPoint["metrics"]>) => (a: StandaloneCompletionPoint, b: StandaloneCompletionPoint) => {
  for (const key of keys) { const delta = (a.metrics[key] as number) - (b.metrics[key] as number); if (delta) return delta; }
  return a.metrics.fullFingerprint.localeCompare(b.metrics.fullFingerprint);
};
function summarize(item: ReturnType<typeof fixed>) {
  const unique = [...new Map(item.points.map((p) => [p.metrics.fullFingerprint, p])).values()];
  const choose = (keys: Array<keyof StandaloneCompletionPoint["metrics"]>) => compact([...unique].sort(compare(keys))[0]!);
  const representatives = { first: compact(unique[0]!), lowestGrossHarm: choose(["grossHarm"]),
    lowestMaximumIndividualHarm: choose(["maximumIndividualHarm"]), lowestTotalIdle: choose(["totalIdle"]),
    lowestMaximumIdle: choose(["maximumIdle"]), lowestMaximumGap: choose(["maximumGap"]),
    paretoLexicographic: compact([...item.frontier].sort(compare(["grossHarm", "maximumIndividualHarm", "maximumIdle", "maximumGap", "totalIdle", "gapCount", "spaceChanges"]))[0]!) };
  const counts = { operationalDominance: unique.filter((p) => p.flags.operationalDominance).length,
    baselineSafe: unique.filter((p) => p.flags.baselineSafe).length, harmReducing: unique.filter((p) => p.flags.harmReducing).length,
    equityDominant: unique.filter((p) => p.flags.equityDominant).length };
  const classification = classifyFixedCoreExploration(unique, item.result.evidence.searchExhaustedNaturally,
    item.result.evidence.budgetExhausted, EXPECTED_FIRST);
  const recommendation = classification === "CASE_1_FIXED_CORE_DOMINANCE" ? "EXPERIMENT_STANDALONE_EQUITY_ORDERING"
    : classification === "CASE_2_CONTROLLED_EQUITY_IMPROVEMENT" ? "DESIGN_STANDALONE_EVIDENCE_ORDERING"
    : classification === "CASE_5_INCONCLUSIVE_BUDGET" ? "ANALYZE_COVERAGE_WITHOUT_BUDGET_INCREASE"
    : "COMPARE_COMPLETE_CORE_LEAVES";
  const canonical = { coreFingerprint: item.coreFingerprint, firstFullFingerprint: EXPECTED_FIRST,
    budget: item.result.evidence.branchLimit, accounting: item.result.evidence, uniqueFingerprints: unique.map((p) => p.metrics.fullFingerprint).sort(),
    representatives, pareto: item.frontier.map(compact), counts, classification, recommendation };
  return { ...canonical, fixedCoreStandaloneExplorationFingerprint: fixedCoreStandaloneExplorationFingerprint(canonical) };
}
const summary = summarize(exploration), summaryAgain = summarize(explorationAgain), summaryReversed = summarize(explorationReversed);
assert.deepEqual(summary, summaryAgain); assert.deepEqual(summary, summaryReversed);
const artifact = { iteration: "SPEC09-012", classification: "DB Safe Merge", productivePlanChanged: false,
  branchAccountingNote: "Fixed-core branches use a fresh standalone-only contractual ledger and are not directly comparable with 70,704 full-plan branches, which include core construction, forward checking, and the first completion.",
  protected: { isolatedCoreBranches: 47_482, exactBaselineBranches: 85_557, residualExperimentBranches: 70_704,
    coreFingerprint: EXPECTED_CORE, firstFullFingerprint: EXPECTED_FIRST, firstQualityFingerprint: EXPECTED_QUALITY,
    firstSelectionOrder: first.experiment.evidence.selectedStandaloneSelectionOrder }, firstLeaf: protectedFirst.result, exploration: summary,
  deterministic: true, orderInvariant: true, hardValid: true, inputImmutable: true, alternativeActivated: false };
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
