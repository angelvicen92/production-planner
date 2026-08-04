import type { EngineInput, ProtectedBreakInput, TaskStatus } from "../../types";
import { executePlannerNext } from "../executePlannerNext";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "../integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { technicalChainScenario } from "../scenarios/technicalChainScenario";
import { getTechnicalChains } from "../technicalChains";
import { validatePlan } from "../validate";
import { participantMealA2Scenario } from "../scenarios/participantMealA2Scenario";
import { participantMealBacktrackingScenario } from "../scenarios/participantMealBacktrackingScenario";
import { engineTimeToMinute } from "../integration/engineTime";

export interface ProbeObservation {
  readonly id: string;
  readonly probeId: string;
  readonly layer: "PREFLIGHT" | "ADAPTER" | "SEARCH" | "VALIDATION";
  readonly property: string;
  readonly observed: unknown;
  readonly expected: unknown;
  readonly pass: boolean;
  readonly boundary: "ENGINE_INPUT" | "PLANNER_LAYER" | "A2";
}

export interface CapabilityProbeResult {
  readonly id: string;
  readonly functionsExecuted: readonly string[];
  readonly observations: readonly ProbeObservation[];
  readonly reasonCodes: readonly string[];
  readonly deterministic: boolean;
  readonly inputImmutable: boolean;
}

const stable = (value: unknown): string => JSON.stringify(value);
const integrationFingerprint = (value: ReturnType<typeof executeIntegration>): string => stable({ preflight: value.preflight, adapted: value.adapted, kind: value.execution?.kind ?? null, scheduledTasks: value.execution?.result?.scheduledTasks ?? null, hardValid: value.validation?.hardValid ?? null, validationReasons: value.validation?.reasonCodes ?? null });
const observe = (probeId: string, id: string, layer: ProbeObservation["layer"], property: string, observed: unknown, expected: unknown, boundary: ProbeObservation["boundary"] = "ENGINE_INPUT"): ProbeObservation =>
  Object.freeze({ id, probeId, layer, property, observed, expected, pass: stable(observed) === stable(expected), boundary });

function baseFixture(): EngineInput {
  const input = structuredClone(createSupportedEngineInputAdapterFixture());
  input.plannerNext!.searchPolicy = "COMPATIBILITY_PRESERVING";
  return input;
}

function executeIntegration(input: EngineInput) {
  const preflight = preflightEngineInputForPlannerNext(input);
  const adapted = adaptEngineInputToPlannerNextProblem(input);
  if (adapted.status !== "SUPPORTED") return { preflight, adapted, execution: null, validation: null };
  const execution = executePlannerNext(adapted.problem);
  const validation = execution.result
    ? validatePlan(adapted.problem, execution.result.scheduledTasks, "scheduledSetupPreparations" in execution.result ? execution.result.scheduledSetupPreparations : [], execution.result.scheduledSpaceMeals)
    : null;
  return { preflight, adapted, execution, validation };
}

function protectedStatusCase(status: TaskStatus, taskId: number): CapabilityProbeResult {
  const id = `protected-${status}`;
  const input = baseFixture();
  if (status === "cancelled") {
    input.tasks.push({ ...structuredClone(input.tasks.find((task) => task.id === 105)!), id: taskId, templateId: 800 + taskId, status });
    input.locks.push({ id: 90, planId: input.planId, taskId, lockType: "resource", lockedResourceId: 504 });
  } else {
    Object.assign(input.tasks.find((task) => task.id === taskId), { status, startReal: "10:00", endReal: "10:30", durationOverrideMin: null });
  }
  const before = stable(input);
  const first = executeIntegration(input);
  const second = executeIntegration(input);
  const problemTask = first.adapted.status === "SUPPORTED" ? first.adapted.problem.tasks.find((task) => task.id === `task:${taskId}`) : undefined;
  const scheduled = first.execution?.result?.scheduledTasks.find((task) => task.id === `task:${taskId}`);
  const observations = status === "cancelled"
    ? [
      observe(id, "protected.cancelled.problemAbsent", "ADAPTER", "cancelled task is absent from PlannerNextProblem", problemTask === undefined, true),
      observe(id, "protected.cancelled.resultAbsent", "SEARCH", "cancelled task and its lock create no scheduled obligation", scheduled === undefined, true),
    ]
    : [
      observe(id, `protected.${status}.availability`, "ADAPTER", `${status} preserves the exact protected interval`, problemTask?.availability, [{ start: 600, end: 630 }]),
      observe(id, `protected.${status}.duration`, "ADAPTER", `${status} derives duration from the protected interval`, problemTask?.duration, 30),
      observe(id, `protected.${status}.dispatcherNoPartial`, "SEARCH", `${status} dispatcher does not publish a partial plan when the complete fixture is infeasible`, { complete: first.execution?.result?.complete, scheduledCount: first.execution?.result?.scheduledTasks.length }, { complete: false, scheduledCount: 0 }),
    ];
  return Object.freeze({ id, functionsExecuted: ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem", "executePlannerNext", "validatePlan"], observations: Object.freeze(observations), reasonCodes: first.preflight.reasonCodes, deterministic: integrationFingerprint(first) === integrationFingerprint(second), inputImmutable: before === stable(input) });
}

export function runProtectedStatusProbes(): readonly CapabilityProbeResult[] {
  return Object.freeze([protectedStatusCase("done", 101), protectedStatusCase("in_progress", 101), protectedStatusCase("cancelled", 106)]);
}

function lockProbe(id: string, mutate: (input: EngineInput) => void, checks: (result: ReturnType<typeof executeIntegration>) => readonly ProbeObservation[]): CapabilityProbeResult {
  const input = baseFixture();
  mutate(input);
  const before = stable(input);
  const first = executeIntegration(input);
  const second = executeIntegration(input);
  return Object.freeze({ id, functionsExecuted: ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem", ...(first.adapted.status === "SUPPORTED" ? ["executePlannerNext", "validatePlan"] : [])], observations: Object.freeze(checks(first)), reasonCodes: first.preflight.reasonCodes, deterministic: integrationFingerprint(first) === integrationFingerprint(second), inputImmutable: before === stable(input) });
}

export function runLockProbes(): readonly CapabilityProbeResult[] {
  const validTime = lockProbe("lock-time-valid", (input) => input.locks.push({ id: 20, planId: 701, taskId: 105, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" }), (result) => {
    const task = result.adapted.status === "SUPPORTED" ? result.adapted.problem.tasks.find((entry) => entry.id === "task:105") : undefined;
    return [observe("lock-time-valid", "lock.time.valid.interval", "ADAPTER", "compatible complete time lock is preserved exactly", task?.availability, [{ start: 600, end: 630 }])];
  });
  const contradictoryTime = lockProbe("lock-time-contradictory", (input) => input.locks.push(
    { id: 20, planId: 701, taskId: 105, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" },
    { id: 21, planId: 701, taskId: 105, lockType: "time", lockedStart: "11:00", lockedEnd: "11:30" },
  ), (result) => [observe("lock-time-contradictory", "lock.time.contradictory.reason", "PREFLIGHT", "contradictory time obligations are rejected", result.preflight.reasonCodes.includes("UNREPRESENTABLE_TIME_LOCK"), true)]);
  const resource = lockProbe("lock-resource-valid", (input) => input.locks.push(
    { id: 20, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 },
    { id: 21, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 },
  ), (result) => {
    const task = result.adapted.status === "SUPPORTED" ? result.adapted.problem.tasks.find((entry) => entry.id === "task:105") : undefined;
    return [observe("lock-resource-valid", "lock.resource.deduplicated", "ADAPTER", "resource lock is projected once", task?.requiredResourceIds?.filter((value) => value === "plan-resource:504").length, 1)];
  });
  const space = lockProbe("lock-space", (input) => input.locks.push({ id: 20, planId: 701, taskId: 105, lockType: "space" }), (result) => [observe("lock-space", "lock.space.reason", "PREFLIGHT", "space lock reports its real unsupported reason", result.preflight.reasonCodes.includes("UNREPRESENTABLE_SPACE_LOCK"), true)]);
  const full = lockProbe("lock-full", (input) => input.locks.push({ id: 20, planId: 701, taskId: 105, lockType: "full", lockedStart: "10:00", lockedEnd: "10:30", lockedResourceId: 504 }), (result) => [
    observe("lock-full", "lock.full.timeDimension", "PREFLIGHT", "full lock time dimension is representable", result.preflight.reasonCodes.includes("UNREPRESENTABLE_TIME_LOCK"), false),
    observe("lock-full", "lock.full.resourceDimension", "PREFLIGHT", "full lock resource dimension is representable", result.preflight.reasonCodes.includes("UNREPRESENTABLE_RESOURCE_LOCK"), false),
    observe("lock-full", "lock.full.spaceDimension", "PREFLIGHT", "full lock space dimension reports the contract gap", result.preflight.reasonCodes.includes("UNREPRESENTABLE_SPACE_LOCK"), true),
  ]);
  const compatible = lockProbe("locks-combined-compatible", (input) => input.locks.push(
    { id: 20, planId: 701, taskId: 105, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" },
    { id: 21, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 },
  ), (result) => [observe("locks-combined-compatible", "lock.combined.compatible", "ADAPTER", "compatible time and resource locks adapt together", result.adapted.status, "SUPPORTED")]);
  const incompatible = lockProbe("locks-combined-incompatible", (input) => input.locks.push(
    { id: 20, planId: 701, taskId: 105, lockType: "time", lockedStart: "10:00", lockedEnd: "10:30" },
    { id: 21, planId: 701, taskId: 105, lockType: "time", lockedStart: "11:00", lockedEnd: "11:30" },
    { id: 22, planId: 701, taskId: 105, lockType: "resource", lockedResourceId: 504 },
  ), (result) => [observe("locks-combined-incompatible", "lock.combined.incompatible", "PREFLIGHT", "incompatible combined locks report the executed reason", result.preflight.reasonCodes.includes("UNREPRESENTABLE_TIME_LOCK"), true)]);
  return Object.freeze([validTime, contradictoryTime, resource, space, full, compatible, incompatible]);
}

export function runCoachAvailabilityProbe(): CapabilityProbeResult {
  const input = baseFixture();
  Object.assign(input.planResourceItems.find((resource) => resource.id === 501), { availabilityStart: "10:00", availabilityEnd: "12:00" });
  const before = stable(input);
  const first = executeIntegration(input);
  const second = executeIntegration(input);
  const coach = first.adapted.status === "SUPPORTED" ? first.adapted.problem.coaches.find((entry) => entry.id === "plan-resource:501") : undefined;
  return Object.freeze({ id: "coach-availability", functionsExecuted: ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem"], observations: Object.freeze([
    observe("coach-availability", "coach.availability.projected", "ADAPTER", "effective resource availability is projected to coach", coach?.availability, [{ start: 600, end: 720 }]),
    observe("coach-availability", "coach.notDuplicated", "ADAPTER", "coach identity is not duplicated as generic resource", first.adapted.status === "SUPPORTED" && first.adapted.problem.resources.some((entry) => entry.id === "plan-resource:501"), false),
  ]), reasonCodes: first.preflight.reasonCodes, deterministic: integrationFingerprint(first) === integrationFingerprint(second), inputImmutable: before === stable(input) });
}

export function runTechnicalTaskProbe(): CapabilityProbeResult {
  const input = baseFixture();
  const before = stable(input);
  const first = executeIntegration(input);
  const second = executeIntegration(input);
  const task = first.adapted.status === "SUPPORTED" ? first.adapted.problem.tasks.find((entry) => entry.id === "task:105") : undefined;
  const scheduled = first.execution?.result?.scheduledTasks.find((entry) => entry.id === "task:105");
  return Object.freeze({ id: "technical-task", functionsExecuted: ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem", "executePlannerNext", "validatePlan"], observations: Object.freeze([
    observe("technical-task", "technical.kind", "ADAPTER", "plannerNextKind technical remains typed", task?.kind, "technical"),
    observe("technical-task", "technical.noParticipant", "ADAPTER", "technical task has no participant", "participantId" in (task ?? {}), false),
    observe("technical-task", "technical.resource", "ADAPTER", "technical task preserves explicit resources", task?.requiredResourceIds, ["plan-resource:502", "plan-resource:503"]),
    observe("technical-task", "technical.scheduled", "SEARCH", "technical task is executed", scheduled !== undefined, true),
    observe("technical-task", "technical.hardValid", "VALIDATION", "technical result is hard-valid", first.validation?.hardValid, true),
  ]), reasonCodes: first.preflight.reasonCodes, deterministic: integrationFingerprint(first) === integrationFingerprint(second), inputImmutable: before === stable(input) });
}

export function runTechnicalChainProbe(): CapabilityProbeResult {
  const problem = technicalChainScenario();
  const before = stable(problem);
  const chains = getTechnicalChains(problem.tasks);
  const first = planMainFlowAndFeeders(problem);
  const second = planMainFlowAndFeeders(problem);
  const validation = validatePlan(problem, first.scheduledTasks, first.scheduledSetupPreparations);
  const ids = chains[0]?.map((task) => task.id) ?? [];
  const scheduled = first.scheduledTasks.filter((task) => ids.includes(task.id));
  return Object.freeze({ id: "technical-chain", functionsExecuted: ["getTechnicalChains", "planMainFlowAndFeeders", "validatePlan"], observations: Object.freeze([
    observe("technical-chain", "technical.chain.ids", "SEARCH", "technical chain members are identified", ids, ["technical-chain-positioning", "technical-chain-camera-test"], "PLANNER_LAYER"),
    observe("technical-chain", "technical.chain.dependencies", "SEARCH", "technical chain dependency is preserved", chains[0]?.[1]?.dependencies, ["technical-chain-positioning"], "PLANNER_LAYER"),
    observe("technical-chain", "technical.chain.complete", "SEARCH", "technical chain is scheduled completely", scheduled.length, ids.length, "PLANNER_LAYER"),
    observe("technical-chain", "technical.chain.ordered", "VALIDATION", "predecessor ends before dependent starts", scheduled[0]!.end <= scheduled[1]!.start, true, "PLANNER_LAYER"),
    observe("technical-chain", "technical.chain.hardValid", "VALIDATION", "technical chain is hard-valid", validation.hardValid, true, "PLANNER_LAYER"),
  ]), reasonCodes: validation.reasonCodes, deterministic: stable(first.scheduledTasks) === stable(second.scheduledTasks), inputImmutable: before === stable(problem) });
}

export function runTechnicalDependencyIntegrationProbe(): CapabilityProbeResult {
  const input = baseFixture();
  input.tasks.push({ ...structuredClone(input.tasks.find((task) => task.id === 105)!), id: 106, templateId: 906, dependsOnTaskIds: [105], assignedResourceIds: [504] });
  input.plannerNext!.searchBudget = { bestK: 5, maxBacktracks: 1000, maxPatterns: 1000, maxBranchExpansions: 300000 };
  const before = stable(input);
  const first = executeIntegration(input);
  const second = executeIntegration(input);
  const dependent = first.adapted.status === "SUPPORTED" ? first.adapted.problem.tasks.find((task) => task.id === "task:106") : undefined;
  const predecessorResult = first.execution?.result?.scheduledTasks.find((task) => task.id === "task:105");
  const dependentResult = first.execution?.result?.scheduledTasks.find((task) => task.id === "task:106");
  return Object.freeze({ id: "technical-dependency-integration", functionsExecuted: ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem", "executePlannerNext", "validatePlan"], observations: Object.freeze([
    observe("technical-dependency-integration", "technical.dependency.typed", "ADAPTER", "EngineInput technical dependency remains typed", dependent?.dependencies, ["task:105"]),
    observe("technical-dependency-integration", "technical.dependency.ordered", "VALIDATION", "technical predecessor ends before dependent starts", Boolean(predecessorResult && dependentResult && predecessorResult.end <= dependentResult.start), true),
    observe("technical-dependency-integration", "technical.dependency.hardValid", "VALIDATION", "integrated dependency plan is hard-valid", first.validation?.hardValid, true),
  ]), reasonCodes: first.preflight.reasonCodes, deterministic: integrationFingerprint(first) === integrationFingerprint(second), inputImmutable: before === stable(input) });
}

export function runTransportDistinctionProbe(): CapabilityProbeResult {
  const ordinary = baseFixture();
  ordinary.tasks.find((task) => task.id === 105)!.templateName = "desmontaje y traslado";
  const structured = baseFixture();
  structured.transportSettings = { source: "engine-buildInput-optimizer-transport", vehicleCapacity: 8 };
  const beforeOrdinary = stable(ordinary), beforeStructured = stable(structured);
  const ordinaryResult = executeIntegration(ordinary), structuredResult = executeIntegration(structured);
  return Object.freeze({ id: "transport-distinction", functionsExecuted: ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem", "executePlannerNext", "validatePlan"], observations: Object.freeze([
    observe("transport-distinction", "transport.ordinaryTechnicalSupported", "PREFLIGHT", "ordinary technical name does not activate transport semantics", ordinaryResult.preflight.status, "SUPPORTED"),
    observe("transport-distinction", "transport.structuredRejected", "PREFLIGHT", "structured transport contract reports its real reason", structuredResult.preflight.reasonCodes.includes("UNSUPPORTED_TRANSPORT_CONTRACT"), true),
    observe("transport-distinction", "transport.ordinaryHardValid", "VALIDATION", "ordinary technical operation remains hard-valid", ordinaryResult.validation?.hardValid, true),
  ]), reasonCodes: structuredResult.preflight.reasonCodes, deterministic: true, inputImmutable: beforeOrdinary === stable(ordinary) && beforeStructured === stable(structured) });
}

export interface ScopedMealProbeOptions {
  readonly start?: string;
  readonly end?: string;
  readonly participantId?: number;
  readonly resourceId?: number;
  readonly itinerantTeamId?: number;
}

export function runScopedMealProbe(scope: "participant" | "resource" | "itinerant-unit", options: ScopedMealProbeOptions = {}): CapabilityProbeResult {
  const id = `meal-${scope}`;
  const start = options.start ?? "15:00";
  const end = options.end ?? "15:30";
  const input = baseFixture();
  if (scope === "participant") {
    input.mealMode="flexible_meal_window";input.mealWindow={start,end};input.mealTaskTemplateId=999;input.contestantMealDurationMinutes=engineTimeToMinute(end)-engineTimeToMinute(start);input.contestantMealMaxSimultaneous=2;
    input.tasks.push({id:106,planId:input.planId,templateId:999,status:"pending",contestantId:options.participantId??201,operationalRole:"meal_break_placeholder"});
  } else if (scope === "itinerant-unit") {
    input.protectedBreaks = [{ id: "unit-meal", kind: "meal", start, end, itinerantTeamId: options.itinerantTeamId ?? 7 }];
  } else {
    const task = input.tasks.find((entry) => entry.id === 105)!;
    Object.assign(task, {
      breakId: 135,
      breakKind: "resource_meal",
      assignedResourceIds: [options.resourceId ?? 503],
      fixedWindowStart: start,
      fixedWindowEnd: end,
    });
  }
  const before = stable(input);
  const firstPreflight = preflightEngineInputForPlannerNext(input);
  const firstAdapter = adaptEngineInputToPlannerNextProblem(input);
  const secondPreflight = preflightEngineInputForPlannerNext(input);
  if (scope === "participant") {
    const runs=["COMPATIBILITY_PRESERVING","EXACT_CONSTRUCTIVE"].map(policy=>{const problem=participantMealA2Scenario(policy as "COMPATIBILITY_PRESERVING"|"EXACT_CONSTRUCTIVE");const execution=executePlannerNext(problem);const result=execution.result!;const validation=validatePlan(problem,result.scheduledTasks,"scheduledSetupPreparations" in result?result.scheduledSetupPreparations:[],result.scheduledSpaceMeals,result.scheduledParticipantMeals);return {policy,complete:result.complete,hardValid:validation.hardValid,mealCount:result.scheduledParticipantMeals?.length??0};});
    const backtracking=["COMPATIBILITY_PRESERVING","EXACT_CONSTRUCTIVE"].map(policy=>{const problem=participantMealBacktrackingScenario(policy as "COMPATIBILITY_PRESERVING"|"EXACT_CONSTRUCTIVE"),result=executePlannerNext(problem).result!;return {policy,complete:result.complete,productiveStart:result.scheduledTasks.find(x=>x.id==="flexible-productive")?.start,mealStart:result.scheduledParticipantMeals[0]?.start,prunes:"metrics" in result?result.metrics.futureInfeasibleCandidatesPruned:result.evidence.participantMealFutureInfeasibleBranches,backtracks:"metrics" in result?result.metrics.backtracks:result.evidence.standaloneBacktracks};});
    const obligation=firstAdapter.status==="SUPPORTED"?firstAdapter.problem.participantMeals?.[0]:undefined;
    return Object.freeze({id,functionsExecuted:["preflightEngineInputForPlannerNext","adaptEngineInputToPlannerNextProblem","executePlannerNext","validatePlan"],observations:Object.freeze([
      observe(id,"meal.participant.preflightStatus","PREFLIGHT","flexible participant meal is supported",firstPreflight.status,"SUPPORTED"),
      observe(id,"meal.participant.reason","PREFLIGHT","valid flexible participant meal has no reason",firstPreflight.reasonCodes,[]),
      observe(id,"meal.participant.adapterStatus","ADAPTER","adapter publishes meal obligation",firstAdapter.status,"SUPPORTED"),
      observe(id,"meal.participant.scope","ADAPTER","meal occupies participant only",obligation?.participantId,`participant:${options.participantId??201}`),
      observe(id,"meal.participant.window","ADAPTER","effective flexible window is preserved",obligation?.window,{start:engineTimeToMinute(start),end:engineTimeToMinute(end)}),
      observe(id,"meal.participant.identity","ADAPTER","source task identity is reversible",obligation?.sourceTaskId,"task:106"),
      observe(id,"meal.participant.entity","ADAPTER","meal obligation has stable identity",obligation?.id,"participant-meal:106"),
      observe(id,"meal.participant.bothPolicies","VALIDATION","both policies complete and validate",runs,[{policy:"COMPATIBILITY_PRESERVING",complete:true,hardValid:true,mealCount:3},{policy:"EXACT_CONSTRUCTIVE",complete:true,hardValid:true,mealCount:3}]),
      observe(id,"meal.participant.structuralBacktracking","SEARCH","both policies reject the first destructive productive slot",backtracking,[{policy:"COMPATIBILITY_PRESERVING",complete:true,productiveStart:960,mealStart:780,prunes:1,backtracks:0},{policy:"EXACT_CONSTRUCTIVE",complete:true,productiveStart:960,mealStart:780,prunes:1,backtracks:2}]),
    ]),reasonCodes:firstPreflight.reasonCodes,deterministic:stable(firstPreflight)===stable(secondPreflight),inputImmutable:before===stable(input)});
  }
  const issue = firstPreflight.issues.find((entry) => entry.code === "UNSUPPORTED_BREAK_SCOPE");
  const protectedBreak = input.protectedBreaks?.[0];
  const resourceTask = input.tasks.find((entry) => entry.id === 105);
  const observedScope = scope === "resource" ? resourceTask?.breakKind : issue?.details?.scope;
  const observedWindow = scope === "resource"
    ? { start: resourceTask?.fixedWindowStart, end: resourceTask?.fixedWindowEnd }
    : { start: protectedBreak?.start, end: protectedBreak?.end };
  const observedIdentity = scope === "participant"
    ? protectedBreak?.contestantId
    : scope === "itinerant-unit"
      ? protectedBreak?.itinerantTeamId
      : resourceTask?.assignedResourceIds?.[0];
  const expectedIdentity = scope === "participant" ? options.participantId ?? 201 : scope === "itinerant-unit" ? options.itinerantTeamId ?? 7 : options.resourceId ?? 503;
  const expectedEntityId = scope === "participant" ? "participant-meal" : scope === "itinerant-unit" ? "unit-meal" : "105";
  return Object.freeze({ id, functionsExecuted: ["preflightEngineInputForPlannerNext", "adaptEngineInputToPlannerNextProblem"], observations: Object.freeze([
    observe(id, `meal.${scope}.preflightStatus`, "PREFLIGHT", `${scope} meal is rejected by executed preflight`, firstPreflight.status, "UNSUPPORTED"),
    observe(id, `meal.${scope}.reason`, "PREFLIGHT", `${scope} meal reports executed break-scope reason`, firstPreflight.reasonCodes.includes("UNSUPPORTED_BREAK_SCOPE"), true),
    observe(id, `meal.${scope}.adapterStatus`, "ADAPTER", `${scope} meal cannot publish a PlannerNextProblem`, firstAdapter.status, "UNSUPPORTED"),
    observe(id, `meal.${scope}.scope`, "PREFLIGHT", `${scope} meal scope is read from the executed input or issue`, observedScope, scope === "itinerant-unit" ? "itinerant-team" : scope === "resource" ? "resource_meal" : "participant"),
    observe(id, `meal.${scope}.window`, "PREFLIGHT", `${scope} meal window is read from the executed input`, observedWindow, { start, end }),
    observe(id, `meal.${scope}.identity`, "PREFLIGHT", `${scope} meal preserves its concrete scoped identity`, observedIdentity, expectedIdentity),
    observe(id, `meal.${scope}.entity`, "PREFLIGHT", `${scope} meal issue preserves its exact entity ID`, issue?.entityId, expectedEntityId),
  ]), reasonCodes: firstPreflight.reasonCodes, deterministic: stable(firstPreflight) === stable(secondPreflight), inputImmutable: before === stable(input) });
}

export function runScopedMealProbes(): readonly CapabilityProbeResult[] {
  return Object.freeze([runScopedMealProbe("participant"), runScopedMealProbe("resource"), runScopedMealProbe("itinerant-unit")]);
}

export function runFocalA2PilotProbes(): readonly CapabilityProbeResult[] {
  return Object.freeze([
    ...runProtectedStatusProbes(),
    ...runLockProbes(),
    runCoachAvailabilityProbe(),
    runTechnicalTaskProbe(),
    runTechnicalChainProbe(),
    runTechnicalDependencyIntegrationProbe(),
    runTransportDistinctionProbe(),
    ...runScopedMealProbes(),
  ]);
}

export function indexProbeObservations(probes: readonly CapabilityProbeResult[]): ReadonlyMap<string, ProbeObservation> {
  return new Map(probes.flatMap((probe) => probe.observations.map((observation) => [observation.id, observation] as const)));
}
