import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { runORCActivePlanner } from "./orcActivePlanner";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import type { OperationalState, SimulatedState, ValidationResult } from "../contracts";
import { deepFreeze } from "../immutability";

const input = (): EngineInput => ({
  planId: 1,
  workDay: { start: "09:00", end: "12:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 1,
  tasks: [
    { id: 1, planId: 1, templateId: 1, status: "pending", durationOverrideMin: 30, spaceId: 1, assignedResourceIds: [10] },
    { id: 2, planId: 1, templateId: 2, status: "done", durationOverrideMin: 30, spaceId: 1, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [10] },
    { id: 3, planId: 1, templateId: 3, status: "in_progress", durationOverrideMin: 30, spaceId: 1, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [10] },
  ],
  locks: [],
  zoneResourceAssignments: {},
  spaceResourceAssignments: { 1: [10] },
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [{ id: 10, resourceItemId: 10, typeId: 1, name: "R", isAvailable: true }],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

const state = (planning: OperationalState["planning"]): OperationalState => deepFreeze({
  id: "state:1", planId: 1, workDay: { start: "09:00", end: "12:00" }, planning, tasks: input().tasks, resources: input().planResourceItems,
  spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [] },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {},
  cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} },
  source: "EngineInput", schemaVersion: "ORC-SPEC-01",
}) as OperationalState;

const shadow = (planning: OperationalState["planning"], violations: string[] = []): ORCShadowModeResult => {
  const sim: SimulatedState = deepFreeze({ id: "sim:1", candidateStateId: "cand:1", baseStateId: "state:1", operationalStateSnapshot: state(planning), appliedTransformations: [], simulationMode: "READ_ONLY_BASELINE", readOnly: true, createdAt: null }) as SimulatedState;
  const validation: ValidationResult = deepFreeze({ id: "val:1", simulatedStateId: sim.id, result: violations.length ? "INVALID" : "VALID", violatedConstraints: violations, explanation: "test", validatedAt: null, evidenceIds: [] }) as ValidationResult;
  return {
    operationalState: state([]), operationalMap: {} as any, operationalAnalysis: {} as any, operationalCriticality: {} as any,
    opportunities: [], diagnoses: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [sim], validationResults: [validation],
    operationalValues: [{ simulatedStateId: sim.id, continuity: 1, makespan: 1, permanence: 1, compaction: 1, resourcePressure: 1, robustness: 1, stability: 1, futureFreedom: 1, overallScore: 1, breakdown: {}, evaluatedAt: null, evidenceIds: [], metadata: {} }],
    commitDecisions: [], evidence: [], advisoryDecision: null, executionEvidence: {} as any, cognitiveState: {} as any, cognitiveStateInitial: {} as any, cognitiveStateDiff: {}, candidateSummary: { searchSpaceCount: 0, candidateCount: 0, duplicateCandidatesDiscarded: 0, truncatedByBudget: false }, summary: { validCount: violations.length ? 0 : 1, invalidCount: violations.length ? 1 : 0 } as any,
  };
};

const validPlanning = [
  { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [10], spaceId: 1 },
  { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [10], spaceId: 1 },
  { taskId: 3, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [10], spaceId: 1 },
];

test("ORC válido se usa y serializa diagnostics", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning) });
  assert.equal(result.diagnostics.usedEngine, "orc");
  assert.equal(result.output.plannedTasks.length, 3);
  assert.equal(result.diagnostics.orcActivationReport.summary.selectedEngine, "orc");
  assert.equal(result.diagnostics.orcActivationReport.summary.finalResult, "ORC aplicado");
  assert.equal(result.diagnostics.orcActivationReport.fallback.reason, null);
  assert.equal(result.diagnostics.orcActivationReport.recommendation.type, "NEXT_IMPROVEMENT");
  assert.equal(result.diagnostics.orcActivationReport.bestORCSimulation.score, 1);
  assert.doesNotThrow(() => JSON.stringify(result.diagnostics.orcActivationReport));
});

test("ORC incompleto cae a V4", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning.filter((item) => item.taskId !== 1)) });
  assert.equal(result.diagnostics.usedEngine, "v4_fallback");
  assert.match(result.diagnostics.fallbackReason ?? "", /complete|allPending/);
  assert.equal(result.diagnostics.orcActivationReport.summary.selectedEngine, "v4_fallback");
  assert.match(result.diagnostics.orcActivationReport.fallback.explanation ?? "", /tareas pendientes/);
});

test("ORC con hard violation cae a V4", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, ["HARD"]) });
  assert.equal(result.diagnostics.usedEngine, "v4_fallback");
  assert.equal(result.diagnostics.fallbackReason, "gate_failed:hardFeasible");
  assert.deepEqual(result.diagnostics.orcActivationReport.bestORCSimulation.hardViolations, ["HARD"]);
  assert.equal(result.diagnostics.orcActivationReport.recommendation.message, "Resolver hard feasibility.");
});


test("ORC que empeora métricas críticas cae a V4", () => {
  const worse = [
    { taskId: 1, startPlanned: "11:00", endPlanned: "11:30", assignedResourceIds: [10], spaceId: 1 },
    { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [10], spaceId: 1 },
    { taskId: 3, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [10], spaceId: 1 },
  ];
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(worse) });
  assert.equal(result.diagnostics.gates.opqmNotWorseThanV4, false);
  assert.equal(result.diagnostics.usedEngine, "v4_fallback");
});

test("V4 sigue funcionando aunque ORC falle", () => {
  const result = runORCActivePlanner(input(), { runORC: () => { throw new Error("boom"); } });
  assert.equal(result.diagnostics.usedEngine, "v4_fallback");
  assert.equal(result.diagnostics.fallbackReason, "orc_execution_failed");
  assert.ok(Array.isArray(result.output.plannedTasks));
});

test("no muta done ni in_progress", () => {
  const changed = validPlanning.map((item) => item.taskId === 2 ? { ...item, startPlanned: "11:00", endPlanned: "11:30" } : item);
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(changed) });
  assert.equal(result.diagnostics.gates.doesNotModifyDone, false);
  assert.equal(result.diagnostics.usedEngine, "v4_fallback");
});

test("todos los gates aparecen como PASS o FAIL en el informe", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning) });
  const gateNames = result.diagnostics.orcActivationReport.gates.map((gate) => gate.name);
  assert.deepEqual(gateNames, Object.keys(result.diagnostics.gates).sort());
  assert.ok(result.diagnostics.orcActivationReport.gates.every((gate) => gate.status === "PASS" || gate.status === "FAIL"));
});

test("comparativa ORC vs V4 incluye todas las métricas requeridas", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning) });
  assert.deepEqual(Object.keys(result.diagnostics.orcActivationReport.comparison).sort(), [
    "coachIdleTimeDelta",
    "mainFlowContinuityDelta",
    "makespanDelta",
    "operationalCompactnessDelta",
    "talentIdleTimeDelta",
  ]);
});

test("determinismo", () => {
  const a = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning) });
  const b = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning) });
  assert.deepEqual(a.output.plannedTasks, b.output.plannedTasks);
  assert.deepEqual(a.diagnostics.orcActivationReport, b.diagnostics.orcActivationReport);
});
