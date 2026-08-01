import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { realProductionScenarios } from "../../orc/benchmarks/fixtures/real-scenarios/realProductionScenarios";
import { preflightEngineInputForPlannerNext } from "./engineInputPreflight";

const clone = <T>(v: T): T => structuredClone(v);
const freeze = <T>(v: T): T => { if (v && typeof v === "object") { Object.values(v as object).forEach(freeze); Object.freeze(v); } return v; };
const base = (): EngineInput => clone(realProductionScenarios[0].input);
const codes = (input: EngineInput) => preflightEngineInputForPlannerNext(input).reasonCodes;
const reverseRecord = <T>(value: Record<number, T> | undefined) => value && Object.fromEntries(Object.entries(value).reverse()) as Record<number, T>;
const reversed = (source: EngineInput): EngineInput => {
  const input = clone(source); input.tasks.reverse().forEach(t => { t.dependsOnTaskIds?.reverse(); t.assignedResourceIds?.reverse(); });
  input.locks.reverse(); input.planResourceItems.reverse(); input.protectedBreaks?.reverse(); input.contestantAvailabilityById = reverseRecord(input.contestantAvailabilityById);
  input.spaceResourceAssignments = reverseRecord(input.spaceResourceAssignments) ?? {}; input.zoneResourceAssignments = reverseRecord(input.zoneResourceAssignments) ?? {};
  return input;
};

test("is pure, deeply read-only, deterministic, and collection-order invariant", () => {
  const input = freeze(base()); const before = structuredClone(input); const first = preflightEngineInputForPlannerNext(input);
  assert.deepEqual(input, before); assert.deepEqual(first, preflightEngineInputForPlannerNext(input)); assert.deepEqual(first, preflightEngineInputForPlannerNext(reversed(input)));
  assert.equal(first.readOnly, true); assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.issues));
});

test("keeps reversible, separate, name-independent identity namespaces and detects duplicate definitions", () => {
  const input = base(); input.tasks[0].id = 101; input.tasks[0].contestantId = 101; input.planResourceItems[0].id = 101;
  const result = preflightEngineInputForPlannerNext(input); const sameSource = result.identityMap.filter(e => e.sourceId === "101");
  assert.ok(new Set(sameSource.map(e => e.namespace)).size >= 3); assert.ok(sameSource.every(e => e.canonicalId.endsWith(`:${e.sourceId}`)));
  const renamed = clone(input); renamed.tasks.forEach(t => { t.templateName = "renamed"; t.contestantName = "renamed"; }); renamed.planResourceItems.forEach(r => r.name = "renamed");
  const renamedResult = preflightEngineInputForPlannerNext(renamed); assert.deepEqual(result.identityMap, renamedResult.identityMap); assert.equal(result.sourceFingerprint, renamedResult.sourceFingerprint);
  input.tasks.push(clone(input.tasks[0])); assert.ok(codes(input).includes("DUPLICATE_ID"));
});

test("audits strict times and protected state without changing planning", () => {
  const input = base(); input.workDay = { start: "8:30", end: "18:30" }; input.tasks[0].status = "done"; input.tasks[0].startPlanned = "10:00"; input.tasks[0].endPlanned = "09:00";
  const result = preflightEngineInputForPlannerNext(input); assert.ok(result.reasonCodes.includes("UNSUPPORTED_TIME_VALUE")); assert.ok(result.reasonCodes.includes("PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE"));
  input.tasks[0].endPlanned = undefined; assert.ok(codes(input).includes("PROTECTED_TASK_WITHOUT_FIXED_PLANNING"));
  input.tasks[1].durationOverrideMin = 0; assert.ok(codes(input).includes("MISSING_TASK_DURATION"));
});

test("uses dependency arrays authoritatively, legacy fallback, missing-reference and cycle checks", () => {
  const input = base(); input.tasks[0].dependsOnTaskIds = [input.tasks[1].id]; input.tasks[0].dependsOnTaskId = 999999;
  assert.ok(!preflightEngineInputForPlannerNext(input).issues.some(i => i.code === "MISSING_DEPENDENCY_REFERENCE" && i.details?.dependencyTaskId === "999999"));
  input.tasks[0].dependsOnTaskIds = null; assert.ok(codes(input).includes("MISSING_DEPENDENCY_REFERENCE"));
  input.tasks[0].dependsOnTaskIds = [input.tasks[1].id]; input.tasks[1].dependsOnTaskIds = [input.tasks[0].id]; assert.ok(codes(input).includes("DEPENDENCY_CYCLE"));
});

test("audits locks, resources, spaces, breaks, transport, setup, policy and budget", () => {
  const input = base(); input.locks = [{ id: 1, planId: input.planId + 1, taskId: 999, lockType: "full" }];
  input.tasks[0].assignedResourceIds = [999]; input.tasks[0].resourceRequirements = { anyOf: [{ quantity: 2, resourceItemIds: [999] }], byType: { 999: 2 }, byItem: { 999: 2 } };
  input.spaceCapacityById = { 10001: 2 }; input.protectedBreaks = [{ id: 2, start: "12:00", end: "12:10", contestantId: 301 }];
  input.transportSettings = { source: "engine-buildInput-optimizer-transport", vehicleCapacity: 8 }; input.groupingBySpaceId = { 10001: { key: "S:10001", level: 2, minChain: 2 } };
  const result = preflightEngineInputForPlannerNext(input); for (const code of ["PLAN_ID_MISMATCH", "UNREPRESENTABLE_TIME_LOCK", "UNREPRESENTABLE_SPACE_LOCK", "MISSING_RESOURCE_REFERENCE", "UNSUPPORTED_RESOURCE_REQUIREMENT", "UNSUPPORTED_SPACE_CAPACITY", "UNSUPPORTED_BREAK_SCOPE", "UNSUPPORTED_TRANSPORT_CONTRACT", "UNSUPPORTED_SETUP_MAPPING", "MISSING_SEARCH_POLICY_CONFIGURATION", "MISSING_SEARCH_BUDGET_CONFIGURATION"] as const) assert.ok(result.reasonCodes.includes(code), code);
});

test("freezes honest evidence for all representative scenarios", () => {
  for (const scenario of realProductionScenarios) { const result = preflightEngineInputForPlannerNext(freeze(clone(scenario.input))); assert.equal(result.status, "UNSUPPORTED", scenario.id); assert.match(result.sourceFingerprint, /^[a-f0-9]{64}$/); assert.match(result.identityMapFingerprint, /^[a-f0-9]{64}$/); }
});
