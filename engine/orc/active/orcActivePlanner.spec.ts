import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../../types";
import { extractPlannedTasksFromORCSimulatedState, runORCActivePlanner } from "./orcActivePlanner";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import type { OperationalState, SimulatedState, ValidationResult } from "../contracts";
import { deepFreeze } from "../immutability";


const fullyPlannedInput = (): EngineInput => ({
  planId: 96,
  workDay: { start: "09:00", end: "12:00" },
  meal: { start: "13:00", end: "14:00" },
  camerasAvailable: 1,
  tasks: [
    { id: 1, planId: 96, templateId: 10, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, durationOverrideMin: 30, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [7] },
    { id: 2, planId: 96, templateId: 11, status: "pending", contestantId: 1, zoneId: 10, spaceId: 10, durationOverrideMin: 30, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [7] },
  ],
  locks: [],
  optimizerMainZoneId: 10,
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [{ id: 7, resourceItemId: 70, typeId: 1, name: "Camera 1", isAvailable: true }],
  resourceItemComponents: {},
  groupingZoneIds: [],
});

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

const shadow = (planning: OperationalState["planning"], violations: string[] = [], changedTaskCount = 0): ORCShadowModeResult => {
  const sim: SimulatedState = deepFreeze({ id: "sim:1", candidateStateId: "cand:1", baseStateId: "state:1", operationalStateSnapshot: state(planning), planningMaterialization: { source: changedTaskCount > 0 ? "candidate_transformations" : planning.length > 0 ? "baseline_seed_preserved" : "none", plannedTaskCount: planning.length, changedTaskCount, warnings: [] }, appliedTransformations: [], simulationMode: "READ_ONLY_BASELINE", readOnly: true, createdAt: null }) as SimulatedState;
  const validation: ValidationResult = deepFreeze({ id: "val:1", simulatedStateId: sim.id, result: violations.length ? "INVALID" : "VALID", violatedConstraints: violations, explanation: "test", validatedAt: null, evidenceIds: [] }) as ValidationResult;
  return {
    operationalState: state([]), operationalMap: {} as any, operationalAnalysis: {} as any, operationalCriticality: {} as any,
    opportunities: [], diagnoses: [], searchSpaces: [], candidates: [{ id: "candidate:1", state: { status: "valid", evidenceIds: [], metadata: {} }, assignments: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:30", spaceId: 1, resourceIds: [10] }], operationalValues: [], evidenceIds: [], metadata: { source: "test" } }], candidateStates: [{ id: "cand:1", candidateId: "candidate:1", strategy: "test", originOpportunity: null, plannedTransformations: [], estimatedImpact: {}, estimatedCost: {}, confidence: 1, sourceAssignments: [] }], simulatedStates: [sim], validationResults: [validation],
    operationalValues: [{ simulatedStateId: sim.id, continuity: 1, makespan: 1, permanence: 1, compaction: 1, resourcePressure: 1, robustness: 1, stability: 1, futureFreedom: 1, overallScore: 1, breakdown: {}, evaluatedAt: null, evidenceIds: [], metadata: {} }],
    commitDecisions: [], evidence: [], advisoryDecision: null, executionEvidence: {} as any, cognitiveState: {} as any, cognitiveStateInitial: {} as any, cognitiveStateDiff: {}, candidateSummary: { searchSpaceCount: 0, candidateCount: 0, duplicateCandidatesDiscarded: 0, truncatedByBudget: false }, summary: { validCount: violations.length ? 0 : 1, invalidCount: violations.length ? 1 : 0 } as any,
  };
};

const validPlanning = [
  { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [10], spaceId: 1 },
  { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [10], spaceId: 1 },
  { taskId: 3, startPlanned: "10:00", endPlanned: "10:30", assignedResourceIds: [10], spaceId: 1 },
];

test("ORC Active preserva un baseline completo sin candidatos de mejora usando candidato interno", () => {
  const result = runORCActivePlanner(fullyPlannedInput());
  assert.equal(result.diagnostics.usedEngine, "orc_baseline_preserved");
  assert.equal(result.diagnostics.orcResultKind, "orc_baseline_preserved");
  assert.equal(result.diagnostics.fallbackReason, null);
  assert.equal(result.output.plannedTasks.length, 2);
  assert.deepEqual(result.output.plannedTasks.map((task) => task.taskId), [1, 2]);
  assert.equal(result.diagnostics.planningRelationToBaseline.changedTaskCount, 0);
  assert.equal(result.diagnostics.planningRelationToBaseline.isEquivalentToBaseline, true);
  assert.equal(result.diagnostics.bestCandidateTrace.bestCandidate.metadata.baselinePreservation, true);
  assert.equal(result.diagnostics.bestCandidateTrace.planningMaterialization.source, "baseline_seed_preserved");
  assert.equal(result.diagnostics.effectiveMoves.accepted, 0);
});

test("extrae planning desde operationalStateSnapshot.planning", () => {
  const sim = shadow(validPlanning).simulatedStates[0];
  const extraction = extractPlannedTasksFromORCSimulatedState(sim, [1]);
  assert.equal(extraction.extractionSource, "operationalStateSnapshot.planning");
  assert.equal(extraction.plannedTasks.length, 3);
  assert.deepEqual(extraction.pendingTaskIds, []);
});

test("extrae planning desde ruta alternativa operationalState.planning", () => {
  const base = shadow([]).simulatedStates[0] as any;
  const sim = deepFreeze({ ...base, operationalState: state(validPlanning) }) as any as SimulatedState;
  const extraction = extractPlannedTasksFromORCSimulatedState(sim, [1]);
  assert.equal(extraction.extractionSource, "operationalState.planning");
  assert.equal(extraction.plannedTasks.length, 3);
  assert.ok(extraction.extractionWarnings.some((warning) => warning.includes("operationalStateSnapshot.planning")));
});

test("planning vacío produce fallback explícito de extracción", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow([]) });
  assert.equal(result.diagnostics.usedEngine, "v4_fallback");
  assert.equal(result.diagnostics.fallbackReason, "orc_planning_extraction_empty");
  assert.equal(result.diagnostics.bestCandidateTrace.extractionSource, "none");
  assert.equal(result.diagnostics.bestCandidateTrace.plannedTaskCount, 0);
  assert.equal(result.diagnostics.bestCandidateTrace.pendingTaskCount, 1);
  assert.ok(result.diagnostics.bestCandidateTrace.extractionWarnings.length > 0);
});

test("ORC completo desde ruta alternativa sin cambios preserva baseline", () => {
  const baseShadow = shadow([]);
  const sim = deepFreeze({ ...(baseShadow.simulatedStates[0] as any), operationalState: state(validPlanning) }) as any as SimulatedState;
  const result = runORCActivePlanner(input(), { orcShadowResult: { ...baseShadow, simulatedStates: [sim] } });
  assert.equal(result.diagnostics.usedEngine, "orc_baseline_preserved");
  assert.equal(result.diagnostics.orcResultKind, "orc_baseline_preserved");
  assert.equal(result.diagnostics.gates.complete, true);
  assert.equal(result.diagnostics.bestCandidateTrace.extractionSource, "operationalState.planning");
  assert.equal(result.diagnostics.bestCandidateTrace.plannedTaskCount, 3);
});

test("ORC Active passes a baseline-seeded input to runORC", () => {
  let received: EngineInput | null = null;
  const result = runORCActivePlanner(input(), {
    runORC: (seeded) => {
      received = seeded;
      return shadow(validPlanning, [], 1);
    },
  });
  assert.ok(received);
  assert.equal(result.diagnostics.baselineSeed.source, "v4_baseline");
  assert.equal(result.diagnostics.bestCandidateTrace.seededPlanningCount, result.diagnostics.baselineSeed.seededPlanningCount);
});

test("ORC con changedTaskCount > 0 se usa como cambio real y serializa diagnostics", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, [], 1) });
  assert.equal(result.diagnostics.usedEngine, "orc");
  assert.equal(result.diagnostics.orcResultKind, "orc_changed_plan");
  assert.equal(result.diagnostics.planningRelationToBaseline.changedTaskCount, 1);
  assert.equal(result.diagnostics.planningRelationToBaseline.isEquivalentToBaseline, false);
  assert.equal(result.output.plannedTasks.length, 3);
  assert.equal(result.diagnostics.orcActivationReport.summary.selectedEngine, "orc");
  assert.equal(result.diagnostics.orcActivationReport.summary.finalResult, "ORC aplicado");
  assert.equal(result.diagnostics.orcActivationReport.fallback.reason, null);
  assert.equal(result.diagnostics.orcActivationReport.recommendation.type, "NEXT_IMPROVEMENT");
  assert.equal(result.diagnostics.orcActivationReport.bestORCSimulation.score, 1);
  assert.doesNotThrow(() => JSON.stringify(result.diagnostics.orcActivationReport));
});

test("ORC con changedTaskCount = 0 se clasifica como baseline preservado", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, [], 0) });
  assert.equal(result.diagnostics.usedEngine, "orc_baseline_preserved");
  assert.equal(result.diagnostics.orcResultKind, "orc_baseline_preserved");
  assert.equal(result.diagnostics.fallbackReason, null);
  assert.equal(result.diagnostics.planningRelationToBaseline.changedTaskCount, 0);
  assert.equal(result.diagnostics.planningRelationToBaseline.unchangedTaskCount, 3);
  assert.equal(result.diagnostics.planningRelationToBaseline.isEquivalentToBaseline, true);
  assert.match(result.diagnostics.explanation, /no aplicó cambios sobre el baseline/);
  assert.equal(result.diagnostics.orcActivationReport.summary.selectedEngine, "orc_baseline_preserved");
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
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, [], 1) });
  const gateNames = result.diagnostics.orcActivationReport.gates.map((gate) => gate.name);
  assert.deepEqual(gateNames, Object.keys(result.diagnostics.gates).sort());
  assert.ok(result.diagnostics.orcActivationReport.gates.every((gate) => gate.status === "PASS" || gate.status === "FAIL"));
});

test("comparativa ORC vs V4 incluye todas las métricas requeridas", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, [], 1) });
  assert.deepEqual(Object.keys(result.diagnostics.orcActivationReport.comparison).sort(), [
    "coachIdleTimeDelta",
    "mainFlowContinuityDelta",
    "makespanDelta",
    "operationalCompactnessDelta",
    "talentIdleTimeDelta",
  ]);
});

test("bestCandidateTrace registra ORC seleccionado", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, [], 1) });
  const trace = result.diagnostics.bestCandidateTrace;
  assert.equal(trace.version, "ORC-BEST-CANDIDATE-TRACE-V1");
  assert.equal(trace.simulationCount, 1);
  assert.equal(trace.bestCandidate.candidateId, "candidate:1");
  assert.equal(trace.bestCandidate.candidateStateId, "cand:1");
  assert.equal(trace.bestCandidate.simulatedStateId, "sim:1");
  assert.equal(trace.score, 1);
  assert.equal(trace.plannedTaskCount, 3);
  assert.equal(trace.pendingTaskCount, 0);
  assert.equal(trace.extractionSource, "operationalStateSnapshot.planning");
  assert.deepEqual(trace.extractionWarnings, []);
  assert.equal(trace.plannedTasks.length, 3);
  assert.deepEqual(trace.pendingTasks, []);
  assert.deepEqual(trace.hardViolations, []);
  assert.equal(trace.discardReason, null);
  assert.equal(trace.gatesFailed.length, 0);
  assert.equal(trace.evidence.kind, "best-candidate-trace");
});

test("bestCandidateTrace registra ORC descartado con motivo exacto", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, ["HARD"]) });
  const trace = result.diagnostics.bestCandidateTrace;
  assert.equal(trace.simulationCount, 1);
  assert.deepEqual(trace.hardViolations, ["HARD"]);
  assert.equal(trace.discardReason, "gate_failed:hardFeasible");
  assert.ok(trace.gatesFailed.includes("hardFeasible"));
  assert.equal(trace.evidence.data.discardReason, "gate_failed:hardFeasible");
});

test("bestCandidateTrace registra ausencia de simulaciones", () => {
  const empty = { ...shadow([]), simulatedStates: [], validationResults: [], operationalValues: [], summary: { validCount: 0, invalidCount: 0 } as any };
  const result = runORCActivePlanner(input(), { orcShadowResult: empty });
  const trace = result.diagnostics.bestCandidateTrace;
  assert.equal(result.diagnostics.fallbackReason, "no_valid_orc_simulation");
  assert.equal(trace.simulationCount, 0);
  assert.equal(trace.bestCandidate.simulatedStateId, null);
  assert.equal(trace.score, null);
  assert.deepEqual(trace.plannedTasks, []);
  assert.deepEqual(trace.pendingTasks, [1]);
  assert.equal(trace.opqm, null);
});

test("bestCandidateTrace serializa como JSON estable", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, [], 1) });
  const parsed = JSON.parse(JSON.stringify(result.diagnostics.bestCandidateTrace));
  assert.equal(parsed.version, "ORC-BEST-CANDIDATE-TRACE-V1");
  assert.equal(parsed.evidence.source, "orc-best-candidate-trace");
});

test("determinismo", () => {
  const a = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, [], 1) });
  const b = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, [], 1) });
  assert.deepEqual(a.output.plannedTasks, b.output.plannedTasks);
  assert.deepEqual(a.diagnostics.orcActivationReport, b.diagnostics.orcActivationReport);
  assert.deepEqual(a.diagnostics.bestCandidateTrace, b.diagnostics.bestCandidateTrace);
});

test("ORC Active unlocks baseline seed hard infeasible when selected baseline-overlap repair is valid and committed", () => {
  const repairShadow = {
    ...shadow(validPlanning, [], 1),
    commitDecisions: [{ decision: "COMMIT", operationalValueId: "sim:1", reason: "repair", differences: [], evidenceId: "evidence", createdAt: null }],
    summary: {
      validCount: 1,
      invalidCount: 0,
      baselineOverlapRepair: {
        generatedCandidateCount: 1,
        candidateStateCount: 1,
        simulatedStateCount: 1,
        validSimulationCount: 1,
        invalidSimulationCount: 0,
        selectedAsBest: true,
        selectedAsCommit: true,
        selectedCandidateId: "orc-see:baseline-overlap-repair:test",
        lineage: { rawCandidateIds: ["orc-see:baseline-overlap-repair:test"], syntheticCandidateIds: ["candidate:partial-plan:orc-see:baseline-overlap-repair:test"], partialPlanIds: ["partial-plan:orc-see:baseline-overlap-repair:test"], candidateStateIds: ["cand:1"], simulatedStateIds: ["sim:1"], committedSimulatedStateIds: ["sim:1"], readOnly: true },
      },
    } as any,
  };
  const result = runORCActivePlanner(input(), { orcShadowResult: repairShadow });
  assert.equal(result.diagnostics.usedEngine, "orc");
  assert.equal(result.diagnostics.orcResultKind, "orc_changed_plan");
  assert.equal(result.diagnostics.fallbackReason, null);
  assert.equal(result.diagnostics.orcSummary.planningMaterialization.source, "candidate_transformations");
  assert.ok(result.diagnostics.orcSummary.planningMaterialization.changedTaskCount > 0);
  assert.equal(result.diagnostics.gates.baselineSeedHardFeasible, true);
  assert.equal(result.diagnostics.gates.hardFeasible, true);
  assert.equal(result.diagnostics.gates.noHardViolations, true);
  assert.equal(result.diagnostics.orcSummary.baselineOverlapRepair.selectedAsCommit, true);
  assert.equal(result.diagnostics.orcSummary.runtimeContract.productionConceptAlignmentContractVersion, "ORC-PRODUCTION-CONCEPT-ALIGNMENT-ID235");
  assert.equal(result.diagnostics.orcSummary.productionConceptAlignment.readOnly, true);
});

test("ORC Active no lanza excepción si la ejecución con seed falla", () => {
  assert.doesNotThrow(() => runORCActivePlanner(input(), { runORC: () => { throw new TypeError("seed rejected"); } }));
  const result = runORCActivePlanner(input(), { runORC: () => { throw new TypeError("seed rejected"); } });
  assert.equal(result.diagnostics.usedEngine, "v4_fallback");
  assert.equal(result.diagnostics.baselineSeed.source, "v4_baseline");
});

test("ORC Active does not fallback for duplicated flexible meal window baseline", () => {
  const base = fullyPlannedInput();
  const mealAligned = {
    ...base,
    workDay: { start: "09:00", end: "18:00" },
    mealMode: "flexible_meal_window",
    meal: { start: "13:00", end: "16:30" },
    mealWindow: { start: "13:00", end: "16:30" },
    tasks: [
      { ...base.tasks[0], startPlanned: "13:15", endPlanned: "13:45", contestantId: 1, assignedResourceIds: [7], spaceId: 10 },
      { ...base.tasks[1], startPlanned: "13:45", endPlanned: "14:15", contestantId: 1, assignedResourceIds: [7], spaceId: 10 },
    ],
  } as EngineInput;
  const result = runORCActivePlanner(mealAligned);
  assert.notEqual(result.diagnostics.fallbackReason, "baseline_seed_hard_infeasible");
  assert.equal(JSON.stringify(result.diagnostics).includes("PLANNING_CROSSES_HARD_MEAL_BREAK"), false);
  assert.ok(["orc_baseline_preserved", "orc", "v4_fallback"].includes(result.diagnostics.usedEngine));
});

test("ID225 ORC changed plan preserva assignedSpace en reparación [315, 504]", () => {
  const planning = [
    { taskId: 315, startPlanned: "10:20", endPlanned: "10:35", assignedResourceIds: [336], spaceId: 48 },
    { taskId: 504, startPlanned: "10:35", endPlanned: "11:20", assignedResourceIds: [], spaceId: 48 },
  ];
  const baseInput: EngineInput = { ...fullyPlannedInput(), tasks: [
    { id: 315, planId: 96, templateId: 315, status: "pending", contestantId: 1, zoneId: 10, spaceId: 48, durationOverrideMin: 15, startPlanned: "10:20", endPlanned: "10:35", assignedResourceIds: [336] },
    { id: 504, planId: 96, templateId: 504, status: "pending", contestantId: 1, zoneId: 10, spaceId: 48, durationOverrideMin: 45, startPlanned: "10:05", endPlanned: "10:50", assignedResourceIds: [] },
  ], planResourceItems: [{ id: 336, resourceItemId: 336, typeId: 1, name: "R336", isAvailable: true }], spaceResourceAssignments: { 48: [336] } };
  const result = runORCActivePlanner(baseInput, { orcShadowResult: shadow(planning as any, [], 1) });
  assert.equal(result.diagnostics.usedEngine, "orc");
  assert.equal(result.diagnostics.orcResultKind, "orc_changed_plan");
  assert.equal(result.diagnostics.orcSummary.planningMaterialization.assignedSpaceContractValid, true);
  assert.equal(result.diagnostics.orcSummary.planningMaterialization.missingAssignedSpaceFieldCount, 0);
  assert.ok(result.output.plannedTasks.every((task) => Object.prototype.hasOwnProperty.call(task, "assignedSpace")));
  const byTask = new Map(result.output.plannedTasks.map((task) => [task.taskId, task]));
  assert.deepEqual(byTask.get(315), { taskId: 315, startPlanned: "10:20", endPlanned: "10:35", assignedSpace: 48, assignedResources: [336] });
  assert.deepEqual(byTask.get(504), { taskId: 504, startPlanned: "10:35", endPlanned: "11:20", assignedSpace: 48, assignedResources: [] });
});

test("ID225 tareas no modificadas preservan assignedSpace", () => {
  const result = runORCActivePlanner(input(), { orcShadowResult: shadow(validPlanning, [], 1) });
  assert.equal(result.diagnostics.usedEngine, "orc");
  assert.equal(result.output.plannedTasks.find((task) => task.taskId === 2)?.assignedSpace, 1);
  assert.equal(result.output.plannedTasks.find((task) => task.taskId === 3)?.assignedSpace, 1);
});

test("ID225 Active no exporta ORC changed plan si el contrato assignedSpace falla", () => {
  const defective = shadow(validPlanning, [], 1);
  const sim = { ...defective.simulatedStates[0], planningMaterialization: { ...defective.simulatedStates[0].planningMaterialization!, missingAssignedSpaceFieldCount: 1, assignedSpaceContractValid: false } } as SimulatedState;
  const result = runORCActivePlanner(input(), { orcShadowResult: { ...defective, simulatedStates: [sim] } });
  assert.equal(result.diagnostics.orcSummary.planningMaterialization.assignedSpaceContractValid, false);
  assert.notEqual(result.diagnostics.orcResultKind, "orc_changed_plan");
  assert.equal(result.diagnostics.usedEngine, "v4_fallback");
  assert.equal(result.diagnostics.fallbackReason, "orc_planning_materialization_assigned_space_contract_invalid");
});

test("ID225 regresión sintética v4-31 conserva assignedSpace en 219 plannedTasks", () => {
  const planning = Array.from({ length: 219 }, (_, index) => {
    const taskId = index === 0 ? 315 : index === 1 ? 504 : 1000 + index;
    return { taskId, startPlanned: taskId === 504 ? "10:35" : taskId === 315 ? "10:20" : "12:00", endPlanned: taskId === 504 ? "11:20" : taskId === 315 ? "10:35" : "12:05", assignedResourceIds: taskId === 315 ? [336] : [], spaceId: (taskId === 315 || taskId === 504) ? 48 : 1000 + index };
  });
  const tasks = planning.map((entry) => ({ id: entry.taskId, planId: 96, templateId: entry.taskId, status: (entry.taskId === 315 || entry.taskId === 504 ? "pending" : "done") as const, contestantId: 1, zoneId: 10, spaceId: entry.spaceId, durationOverrideMin: 5, startPlanned: entry.taskId === 504 ? "10:05" : entry.startPlanned, endPlanned: entry.taskId === 504 ? "10:50" : entry.endPlanned, assignedResourceIds: entry.assignedResourceIds }));
  const baseInput: EngineInput = { ...fullyPlannedInput(), tasks, planResourceItems: [{ id: 336, resourceItemId: 336, typeId: 1, name: "R336", isAvailable: true }], spaceResourceAssignments: { 48: [336] } };
  const repairShadow = { ...shadow(planning as any, [], 1), commitDecisions: [{ decision: "COMMIT", operationalValueId: "sim:1", reason: "repair", differences: [], evidenceId: "evidence", createdAt: null }], summary: { validCount: 1, invalidCount: 0, baselineOverlapRepair: { validSimulationCount: 1, selectedAsCommit: true } } as any };
  const result = runORCActivePlanner(baseInput, { orcShadowResult: repairShadow });
  assert.equal(result.diagnostics.fallbackReason, null);
  assert.equal(result.diagnostics.usedEngine, "orc");
  assert.equal(result.output.plannedTasks.length, 219);
  assert.equal(result.diagnostics.orcSummary.planningMaterialization.source, "candidate_transformations");
  assert.equal(result.diagnostics.orcSummary.planningMaterialization.changedTaskCount, 1);
  assert.equal(result.diagnostics.orcSummary.planningMaterialization.missingAssignedSpaceFieldCount, 0);
  assert.equal(result.diagnostics.orcSummary.planningMaterialization.assignedSpaceContractValid, true);
  assert.ok(result.output.plannedTasks.every((task) => Object.prototype.hasOwnProperty.call(task, "assignedSpace")));
  const byTask = new Map(result.output.plannedTasks.map((task) => [task.taskId, task]));
  assert.equal(byTask.get(315)?.assignedSpace, 48);
  assert.equal(byTask.get(504)?.assignedSpace, 48);
});
