import assert from "node:assert/strict";
import test from "node:test";
import {
  PRIMARY_KPI_IDS,
  comparePlanningQuality,
  type ComparisonTolerancePolicy,
  type PrimaryComparisonSignal,
} from "./planningComparison";

function signals(overrides: Readonly<Record<string, number>> = {}): PrimaryComparisonSignal[] {
  return PRIMARY_KPI_IDS.map((kpiId, index) => {
    const id = `${kpiId}.primary`;
    const direction = kpiId === "P10" ? "HIGHER_IS_BETTER" as const : "LOWER_IS_BETTER" as const;
    return {
      id,
      kpiId,
      direction,
      humanValue: 100,
      optiPlanValue: overrides[id] ?? 100,
    };
  });
}

function policy(values: readonly PrimaryComparisonSignal[] = signals(), tolerance = 5): ComparisonTolerancePolicy {
  return {
    version: "A2.tolerance.synthetic.v1",
    toleranceBySignalId: Object.fromEntries(values.map(({ id }) => [id, tolerance])),
  };
}

function compare(values = signals(), tolerancePolicy: ComparisonTolerancePolicy | undefined = policy(values)) {
  return comparePlanningQuality({
    referenceHardGates: "PASS",
    optiPlanHardGates: "PASS",
    signals: values,
    tolerancePolicy,
  });
}

test("non-compensable OptiPlan hard-gate failure is INVALID before quality comparison", () => {
  const result = comparePlanningQuality({
    referenceHardGates: "UNASSESSED",
    optiPlanHardGates: "FAIL",
    signals: [],
  });
  assert.equal(result.status, "CLASSIFIED");
  if (result.status !== "CLASSIFIED") return;
  assert.equal(result.classification, "INVALID");
  assert.equal(result.mayClaimBetterThanHuman, false);
  assert.deepEqual(result.signalEvidence, []);
});

test("comparison blocks when the human reference hard gates are not resolved", () => {
  const values = signals();
  const result = comparePlanningQuality({
    referenceHardGates: "UNASSESSED",
    optiPlanHardGates: "PASS",
    signals: values,
    tolerancePolicy: policy(values),
  });
  assert.equal(result.status, "BLOCKED_BY_CONFIGURATION");
  if (result.status !== "BLOCKED_BY_CONFIGURATION") return;
  assert.ok(result.missing.includes("reference_hard_gates:unassessed"));
  assert.equal(result.classification, null);
});

test("comparison blocks until every P01-P10 primary KPI is represented", () => {
  const values = signals().filter(({ kpiId }) => kpiId !== "P10");
  const result = compare(values, policy(values));
  assert.equal(result.status, "BLOCKED_BY_CONFIGURATION");
  if (result.status !== "BLOCKED_BY_CONFIGURATION") return;
  assert.ok(result.missing.includes("primary_kpi:P10"));
});

test("comparison blocks without an explicit versioned tolerance policy", () => {
  const result = compare(signals(), undefined);
  assert.equal(result.status, "BLOCKED_BY_CONFIGURATION");
  if (result.status !== "BLOCKED_BY_CONFIGURATION") return;
  assert.ok(result.missing.includes("tolerance_policy"));
});

test("comparison blocks when any signal lacks a tolerance or has an invalid tolerance", () => {
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
  const values = signals();
  values.push({ ...values[0]! });
  const result = compare(values, policy(values));
  assert.equal(result.status, "BLOCKED_BY_CONFIGURATION");
  if (result.status !== "BLOCKED_BY_CONFIGURATION") return;
  assert.ok(result.missing.includes(`signal_id:duplicate:${values[0]!.id}`));
});

test("comparison evidence is deterministic, ordered and deeply frozen", () => {
  const values = signals().reverse();
  const result = compare(values, policy(values));
  assert.equal(result.status, "CLASSIFIED");
  if (result.status !== "CLASSIFIED") return;
  assert.deepEqual(result.signalEvidence.map(({ kpiId }) => kpiId), PRIMARY_KPI_IDS);
  assert.equal(result.tolerancePolicyVersion, "A2.tolerance.synthetic.v1");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.signalEvidence));
  assert.ok(result.signalEvidence.every(Object.isFrozen));
});
