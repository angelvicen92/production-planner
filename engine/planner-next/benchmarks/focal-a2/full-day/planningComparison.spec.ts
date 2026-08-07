import assert from "node:assert/strict";
import test from "node:test";
import {
  PRIMARY_KPI_IDS,
  comparePlanningQuality,
  type ComparisonTolerancePolicy,
  type PrimaryComparisonSignal,
  type PrimaryKpiId,
} from "./planningComparison";

function signals(overrides: Readonly<Record<string, number>> = {}): PrimaryComparisonSignal[] {
  return PRIMARY_KPI_IDS.map((kpiId) => {
    const id = `${kpiId}.primary`;
    const direction = kpiId === "P10" ? "HIGHER_IS_BETTER" as const : "LOWER_IS_BETTER" as const;
    return { id, kpiId, direction, humanValue: 100, optiPlanValue: overrides[id] ?? 100 };
  });
}

function policy(values: readonly PrimaryComparisonSignal[] = signals(), tolerance = 5): ComparisonTolerancePolicy {
  const requiredSignalIdsByKpi = Object.fromEntries(PRIMARY_KPI_IDS.map((kpiId) => [
    kpiId,
    values.filter((signal) => signal.kpiId === kpiId).map(({ id }) => id),
  ])) as Record<PrimaryKpiId, string[]>;
  return {
    version: "A2.tolerance.synthetic.v1",
    requiredSignalIdsByKpi,
    toleranceBySignalId: Object.fromEntries(values.map(({ id }) => [id, tolerance])),
  };
}

function compare(values = signals(), tolerancePolicy: ComparisonTolerancePolicy | undefined = policy(values)) {
  return comparePlanningQuality({ referenceHardGates: "PASS", optiPlanHardGates: "PASS", signals: values, tolerancePolicy });
}

test("non-compensable OptiPlan hard-gate failure is INVALID before quality comparison", () => {
  const result = comparePlanningQuality({ referenceHardGates: "UNASSESSED", optiPlanHardGates: "FAIL", signals: [] });
  assert.equal(result.status, "CLASSIFIED");
  if (result.status !== "CLASSIFIED") return;
  assert.equal(result.classification, "INVALID");
  assert.equal(result.mayClaimBetterThanHuman, false);
  assert.deepEqual(result.signalEvidence, []);
});

test("comparison blocks when the human reference hard gates are not resolved", () => {
  const values = signals();
  const result = comparePlanningQuality({ referenceHardGates: "UNASSESSED", optiPlanHardGates: "PASS", signals: values, tolerancePolicy: policy(values) });
  assert.equal(result.status, "BLOCKED_BY_CONFIGURATION");
  if (result.status !== "BLOCKED_BY_CONFIGURATION") return;
  assert.ok(result.missing.includes("reference_hard_gates:unassessed"));
  assert.equal(result.classification, null);
});

test("comparison policy must declare a non-empty exact signal surface for every P01-P10 KPI", () => {
  const values = signals();
  const tolerancePolicy = policy(values);
  const brokenSurface = {
    ...tolerancePolicy,
    requiredSignalIdsByKpi: { ...tolerancePolicy.requiredSignalIdsByKpi, P10: [] },
  };
  const result = compare(values, brokenSurface);
  assert.equal(result.status, "BLOCKED_BY_CONFIGURATION");
  if (result.status !== "BLOCKED_BY_CONFIGURATION") return;
  assert.ok(result.missing.includes("comparison_surface:P10"));
  assert.ok(result.missing.includes("signal_not_in_policy:P10.primary"));
});

test("comparison blocks when a signal required by the versioned surface is absent", () => {
  const complete = signals();
  const tolerancePolicy = policy(complete);
  const supplied = complete.filter(({ kpiId }) => kpiId !== "P10");
  const result = compare(supplied, tolerancePolicy);
  assert.equal(result.status, "BLOCKED_BY_CONFIGURATION");
  if (result.status !== "BLOCKED_BY_CONFIGURATION") return;
  assert.ok(result.missing.includes("signal_required:P10.primary"));
});

test("comparison blocks signals outside the policy or mapped to the wrong KPI", () => {
  const values = signals();
  const tolerancePolicy = policy(values);
  const extra = [...values, { id: "P03.unversioned", kpiId: "P03" as const, direction: "LOWER_IS_BETTER" as const, humanValue: 100, optiPlanValue: 90 }];
  const extraResult = compare(extra, tolerancePolicy);
  assert.equal(extraResult.status, "BLOCKED_BY_CONFIGURATION");
  if (extraResult.status === "BLOCKED_BY_CONFIGURATION") assert.ok(extraResult.missing.includes("signal_not_in_policy:P03.unversioned"));

  const mismatched = values.map((signal) => signal.id === "P03.primary" ? { ...signal, kpiId: "P02" as const } : signal);
  const mismatchResult = compare(mismatched, tolerancePolicy);
  assert.equal(mismatchResult.status, "BLOCKED_BY_CONFIGURATION");
  if (mismatchResult.status === "BLOCKED_BY_CONFIGURATION") assert.ok(mismatchResult.missing.includes("signal_kpi_mismatch:P03.primary"));
});

test("comparison blocks without an explicit versioned tolerance policy", () => {
  const values = signals();
  const result = comparePlanningQuality({ referenceHardGates: "PASS", optiPlanHardGates: "PASS", signals: values });
  assert.equal(result.status, "BLOCKED_BY_CONFIGURATION");
  if (result.status !== "BLOCKED_BY_CONFIGURATION") return;
  assert.ok(result.missing.includes("tolerance_policy"));
});

test("comparison blocks when any required signal lacks a tolerance or has an invalid tolerance", () => {
  const values = signals();
  const tolerances = policy(values);
  const missingTolerance = { ...tolerances, toleranceBySignalId: { ...tolerances.toleranceBySignalId } };
  delete (missingTolerance.toleranceBySignalId as Record<string, number>)[values[0]!.id];
  const missing = compare(values, missingTolerance);
  assert.equal(missing.status, "BLOCKED_BY_CONFIGURATION");
  if (missing.status === "BLOCKED_BY_CONFIGURATION") assert.ok(missing.missing.includes(`tolerance:${values[0]!.id}`));

  const invalidTolerance = { ...tolerances, toleranceBySignalId: { ...tolerances.toleranceBySignalId, [values[1]!.id]: -1 } };
  const invalid = compare(values, invalidTolerance);
  assert.equal(invalid.status, "BLOCKED_BY_CONFIGURATION");
  if (invalid.status === "BLOCKED_BY_CONFIGURATION") assert.ok(invalid.missing.includes(`tolerance_invalid:${values[1]!.id}`));
});

test("differences exactly on the tolerance boundary are PARITY", () => {
  const values = signals({ "P01.primary": 105, "P10.primary": 95 });
  const result = compare(values, policy(values, 5));
  assert.equal(result.status, "CLASSIFIED");
  if (result.status !== "CLASSIFIED") return;
  assert.equal(result.classification, "PARITY");
  assert.equal(result.betterSignalIds.length, 0);
  assert.equal(result.worseSignalIds.length, 0);
  assert.equal(result.equivalentSignalIds.length, 10);
  assert.equal(result.mayClaimBetterThanHuman, false);
});

test("a material improvement with no primary regression is PARETO_BETTER", () => {
  const values = signals({ "P02.primary": 94, "P10.primary": 106 });
  const result = compare(values, policy(values, 5));
  assert.equal(result.status, "CLASSIFIED");
  if (result.status !== "CLASSIFIED") return;
  assert.equal(result.classification, "PARETO_BETTER");
  assert.deepEqual(result.betterSignalIds, ["P02.primary", "P10.primary"]);
  assert.deepEqual(result.worseSignalIds, []);
  assert.equal(result.mayClaimBetterThanHuman, true);
});

test("a primary regression with no material improvement is WORSE", () => {
  const values = signals({ "P03.primary": 106 });
  const result = compare(values, policy(values, 5));
  assert.equal(result.status, "CLASSIFIED");
  if (result.status !== "CLASSIFIED") return;
  assert.equal(result.classification, "WORSE");
  assert.deepEqual(result.worseSignalIds, ["P03.primary"]);
  assert.equal(result.mayClaimBetterThanHuman, false);
});

test("mixed material improvement and regression is TRADEOFF regardless of improvement magnitude", () => {
  const values = signals({ "P02.primary": 10, "P03.primary": 106 });
  const result = compare(values, policy(values, 5));
  assert.equal(result.status, "CLASSIFIED");
  if (result.status !== "CLASSIFIED") return;
  assert.equal(result.classification, "TRADEOFF");
  assert.deepEqual(result.betterSignalIds, ["P02.primary"]);
  assert.deepEqual(result.worseSignalIds, ["P03.primary"]);
  assert.equal(result.mayClaimBetterThanHuman, false);
});

test("zero tolerance remains explicit and uses strict beyond-tolerance comparison", () => {
  const values = signals({ "P01.primary": 99 });
  const result = compare(values, policy(values, 0));
  assert.equal(result.status, "CLASSIFIED");
  if (result.status !== "CLASSIFIED") return;
  assert.equal(result.classification, "PARETO_BETTER");
  const p01 = result.signalEvidence.find(({ id }) => id === "P01.primary");
  assert.equal(p01?.tolerance, 0);
  assert.equal(p01?.relation, "BETTER");
});

test("duplicate signal identity fails closed instead of double-counting a KPI", () => {
  const canonical = signals();
  const values = [...canonical, { ...canonical[0]! }];
  const result = compare(values, policy(canonical));
  assert.equal(result.status, "BLOCKED_BY_CONFIGURATION");
  if (result.status !== "BLOCKED_BY_CONFIGURATION") return;
  assert.ok(result.missing.includes(`signal_id:duplicate:${canonical[0]!.id}`));
});

test("comparison evidence is deterministic, ordered and deeply frozen", () => {
  const canonical = signals();
  const values = [...canonical].reverse();
  const result = compare(values, policy(canonical));
  assert.equal(result.status, "CLASSIFIED");
  if (result.status !== "CLASSIFIED") return;
  assert.deepEqual(result.signalEvidence.map(({ kpiId }) => kpiId), PRIMARY_KPI_IDS);
  assert.equal(result.tolerancePolicyVersion, "A2.tolerance.synthetic.v1");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.signalEvidence));
  assert.ok(result.signalEvidence.every(Object.isFrozen));
});
