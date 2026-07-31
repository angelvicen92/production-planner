import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PlanResult, PlannerNextProblem } from "./contracts";
import { projectCombinedFocalA2ItinerantProblem } from "./benchmarks/focal-a2/focalA2RealityReference";
import { planCompatibilityPreserving } from "./compatibilityPreservingSearch";
import {
  diagnoseGreedyFeederClosure,
  planMainFlowAndFeeders,
  tryGreedyFeederClosure,
  type GreedyFeederClosureResult,
} from "./planMainFlowAndFeeders";
import { mainFlowVocalScenario } from "./scenarios/mainFlowVocalScenario";

function canonicalResult(result: PlanResult): Omit<PlanResult, "metrics"> & { metrics: Omit<PlanResult["metrics"], "runtimeMs"> } {
  const { runtimeMs: _runtimeMs, ...metrics } = result.metrics;
  return { ...result, metrics };
}

function assertEquivalent(problem: PlannerNextProblem): void {
  const before = structuredClone(problem);
  const direct = planCompatibilityPreserving(problem);
  const facade = planMainFlowAndFeeders(problem);
  assert.deepEqual(canonicalResult(facade), canonicalResult(direct));
  assert.equal(facade.metrics.planFingerprint, direct.metrics.planFingerprint);
  assert.deepEqual(facade.scheduledTasks, direct.scheduledTasks);
  assert.deepEqual(problem, before);
}

test("the compatibility route and historical facade return the same simple PlanResult", () => {
  assert.equal(typeof planCompatibilityPreserving, "function");
  assert.equal(typeof planMainFlowAndFeeders, "function");
  assertEquivalent(mainFlowVocalScenario());
});

test("the compatibility route and facade are canonically identical for Focal A2", () => {
  assertEquivalent(projectCombinedFocalA2ItinerantProblem());
});

test("searchPolicy does not select behavior during the extraction", () => {
  const omitted = canonicalResult(planMainFlowAndFeeders(mainFlowVocalScenario()));
  for (const searchPolicy of ["COMPATIBILITY_PRESERVING", "EXACT_CONSTRUCTIVE"] as const) {
    const problem = mainFlowVocalScenario();
    problem.searchPolicy = searchPolicy;
    assert.deepEqual(canonicalResult(planMainFlowAndFeeders(problem)), omitted);
    assert.deepEqual(canonicalResult(planCompatibilityPreserving(problem)), omitted);
  }
});

test("the compatibility route remains deterministic", () => {
  const first = planCompatibilityPreserving(mainFlowVocalScenario());
  const second = planCompatibilityPreserving(mainFlowVocalScenario());
  assert.deepEqual(canonicalResult(first), canonicalResult(second));
});

test("historical feeder closure exports remain available from the facade module", () => {
  const exportedType: GreedyFeederClosureResult | undefined = undefined;
  assert.equal(exportedType, undefined);
  assert.equal(typeof diagnoseGreedyFeederClosure, "function");
  assert.equal(typeof tryGreedyFeederClosure, "function");
});

test("the extracted route and facade contain no policy routing or duplicate algorithm", () => {
  const routeSource = readFileSync(new URL("./compatibilityPreservingSearch.ts", import.meta.url), "utf8");
  const facadeSource = readFileSync(new URL("./planMainFlowAndFeeders.ts", import.meta.url), "utf8");
  assert.doesNotMatch(routeSource, /resolvePlannerSearchPolicy|detectPlannerCapabilities|problem\.searchPolicy/);
  assert.doesNotMatch(facadeSource, /resolvePlannerSearchPolicy|detectPlannerCapabilities|problem\.searchPolicy/);
  assert.match(facadeSource, /return planCompatibilityPreserving\(problem\);/);
  assert.doesNotMatch(facadeSource, /generatePatterns|compareAlternatives|closeFeeders|validatePlan|fingerprint/);
});
