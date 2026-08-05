import { adaptEngineInputToPlannerNextProblem } from "../../../integration/engineInputAdapter";
import { createSpec10017JointGroupEngineInputFixture, createSupportedEngineInputAdapterFixture } from "../../../integration/engineInputAdapter.fixture";
import { planMainFlowAndFeeders } from "../../../planMainFlowAndFeeders";
import { preflight as preflightPlannerNextProblem, validatePlan } from "../../../validate";
import { preflightEngineInputForPlannerNext } from "../../../integration/engineInputPreflight";
import type { ExpandedCanonicalFullA2Template, RepresentabilityAnalysis, RepresentabilityBlocker, RepresentabilityExecutor, RepresentabilityGateResult } from "./types";
import { contractFieldPresence } from "./types";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function blocker(values: RepresentabilityBlocker): RepresentabilityBlocker {
  return values;
}

function runAdapterTransitionProbe(): RepresentabilityAnalysis["adapterProbe"] {
  const fixture = createSupportedEngineInputAdapterFixture();
  fixture.plannerNext = {
    ...fixture.plannerNext!,
    resourceTransitionMinutes: 30,
  };
  const result = adaptEngineInputToPlannerNextProblem(fixture);
  const problem = result.status === "SUPPORTED" ? result.problem as unknown as Record<string, unknown> : {};
  const resources = Array.isArray(problem.resources) ? problem.resources as readonly Record<string, unknown>[] : [];
  const problemHasRouteSpecificCoachTransition = ["coachRouteTransitions", "resourceRouteTransitions", "routeTransitionRules"].some((key) => key in problem);
  const coachResourcesHaveOriginDestinationRule = resources.some((resource) => resource.type === "coach" && ("fromSpaceId" in resource || "toSpaceId" in resource || "transitionScope" in resource));
  const jointInput = createSpec10017JointGroupEngineInputFixture();
  const before = structuredClone(jointInput);
  const jointPreflight = preflightEngineInputForPlannerNext(jointInput);
  const jointAdapter = adaptEngineInputToPlannerNextProblem(jointInput);
  const jointPlannerPreflight = jointAdapter.status === "SUPPORTED" ? preflightPlannerNextProblem(jointAdapter.problem) : ["ADAPTER_UNSUPPORTED"];
  const plan = jointAdapter.status === "SUPPORTED" && jointPlannerPreflight.length === 0 ? planMainFlowAndFeeders(jointAdapter.problem) : null;
  const hard = plan && jointAdapter.status === "SUPPORTED" ? validatePlan(jointAdapter.problem, plan.scheduledTasks, plan.scheduledSetupPreparations, plan.scheduledSpaceMeals, plan.scheduledParticipantMeals, plan.scheduledResourceMeals, plan.scheduledItinerantUnitMeals) : null;
  const first = plan?.scheduledTasks.filter(t => t.jointGroupId === "joint-group:a2-c06-c10-alfombra-roja") ?? [];
  const second = plan?.scheduledTasks.filter(t => t.jointGroupId === "joint-group:a2-c06-c10-totales-post") ?? [];
  const reversed = createSpec10017JointGroupEngineInputFixture(); reversed.tasks.reverse();
  const reversedAdapter = adaptEngineInputToPlannerNextProblem(reversed);
  const again = jointAdapter.status === "SUPPORTED" ? adaptEngineInputToPlannerNextProblem(createSpec10017JointGroupEngineInputFixture()) : null;
  return {
    executed: true,
    supported: result.status === "SUPPORTED",
    engineInputPreflightSupported: jointPreflight.status === "SUPPORTED",
    adapterSupported: jointAdapter.status === "SUPPORTED",
    plannerNextPreflightSupported: jointPlannerPreflight.length === 0,
    sourceGroupCount: 2,
    projectedGroupCount: jointAdapter.status === "SUPPORTED" ? new Set(jointAdapter.problem.tasks.flatMap(t => t.jointGroupId ? [t.jointGroupId] : [])).size : 0,
    projectedMemberCount: jointAdapter.status === "SUPPORTED" ? jointAdapter.problem.tasks.filter(t => t.jointGroupId).length : 0,
    dependenciesPreserved: jointAdapter.status === "SUPPORTED" && jointAdapter.problem.tasks.find(t=>t.id==="task:203")?.dependencies[0] === "task:201" && jointAdapter.problem.tasks.find(t=>t.id==="task:204")?.dependencies[0] === "task:202",
    firstGroupSynchronized: first.length === 2 && new Set(first.map(t => `${t.start}:${t.end}`)).size === 1,
    secondGroupSynchronized: second.length === 2 && new Set(second.map(t => `${t.start}:${t.end}`)).size === 1,
    sequencePreserved: first.length === 2 && second.length === 2 && Math.min(...second.map(t=>t.start)) >= Math.max(...first.map(t=>t.end)),
    complete: plan?.complete ?? false,
    hardValid: hard?.hardValid ?? false,
    jointGroupViolationCount: hard?.jointGroupViolationCount ?? null,
    deterministic: jointAdapter.status === "SUPPORTED" && again?.status === "SUPPORTED" && jointAdapter.problemFingerprint === again.problemFingerprint,
    orderInvariant: jointAdapter.status === "SUPPORTED" && reversedAdapter.status === "SUPPORTED" && jointAdapter.problemFingerprint === reversedAdapter.problemFingerprint,
    inputImmutable: JSON.stringify(jointInput) === JSON.stringify(before),
    projectedGlobalResourceTransitionMinutes: result.status === "SUPPORTED" ? result.problem.resourceTransitionMinutes : null,
    supportsSpecificCoachRouteTransition: problemHasRouteSpecificCoachTransition && coachResourcesHaveOriginDestinationRule,
    problemHasRouteSpecificCoachTransition,
    coachResourcesHaveOriginDestinationRule,
  };
}

export function analyzeCanonicalFullA2Representability(expansion: ExpandedCanonicalFullA2Template): RepresentabilityAnalysis {
  const requiredCreationInputs = expansion.requiredCreationInputs.map((input) => blocker({
    code: `SOURCE_CONFIGURATION_REQUIRED_${input.toUpperCase()}`,
    layer: "SOURCE_CONFIGURATION",
    affectedRule: input,
    canonicalIds: [],
    operationalExplanation: "La fuente exige este dato al crear el día, pero no fija un valor productivo.",
    semanticLoss: "Inventarlo convertiría una decisión de producción en dato canónico y contaminaría la plantilla.",
  }));

  const implementationBlockers: RepresentabilityBlocker[] = [];
  if (!contractFieldPresence.taskInputHasJointGroupId) {
    implementationBlockers.push(blocker({
      code: "ENGINE_INPUT_JOINT_GROUP_NOT_PROJECTED",
      layer: "ENGINE_INPUT",
      affectedRule: "operaciones conjuntas C06/C10",
      canonicalIds: expansion.jointOperations.flatMap((operation) => operation.taskIds),
      operationalExplanation: "Planner Next ya entiende jointGroupId, pero TaskInput/EngineInput no tiene el campo y el adaptador no puede proyectarlo.",
      semanticLoss: "Sustituirlo por dependencias preservaría orden, pero no mismo inicio y final.",
      implementationRank: 1,
    }));
  }
  if (!contractFieldPresence.taskInputHasSetupFamilyId || !contractFieldPresence.engineInputHasSetupPolicies) {
    implementationBlockers.push(blocker({
      code: "ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED",
      layer: "ENGINE_INPUT",
      affectedRule: "familias Sillón/Estrellas y preparación de set",
      canonicalIds: expansion.tasks.filter((task) => task.setupFamilyId).map((task) => task.id),
      operationalExplanation: "Planner Next tiene setupFamilyId y Space.setupPolicy, pero EngineInput no transporta la familia ni la política de preparación/reentrada.",
      semanticLoss: "Sin ese contrato se perderían el bloque de montaje, los 10 minutos entre familias o la prohibición de reentrada.",
      implementationRank: 2,
    }));
  }

  if (expansion.rules.setup.orderConstraint === "UNSPECIFIED") {
    implementationBlockers.push(blocker({
      code: "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED",
      layer: "PLANNER_NEXT",
      affectedRule: "orden flexible entre familias Sillón/Estrellas",
      canonicalIds: expansion.tasks.filter((task) => task.setupFamilyId).map((task) => task.id),
      operationalExplanation: "La fuente no fija si Sillón precede a Estrellas o al revés, mientras Space.setupPolicy exige familyOrder exacto para representar la transición de familias.",
      semanticLoss: "Elegir un orden convertiría el planning humano en restricción hard e impediría al motor evaluar ambos órdenes válidos.",
      implementationRank: 4,
    }));
  }

  if (!contractFieldPresence.plannerNextProblemHasRoundSynchronization) {
    implementationBlockers.push(blocker({
      code: "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED",
      layer: "PLANNER_NEXT",
      affectedRule: "sincronización de rondas Totales 1/Coreo",
      canonicalIds: expansion.tasks.filter((task) => task.type === "TOTALES_1" || task.type === "TOTALES_COREO").map((task) => task.id),
      operationalExplanation: "No existe contrato PlannerNextProblem equivalente para rondas simultáneas entre dos espacios independientes.",
      semanticLoss: "Las dependencias impondrían precedencia, no sincronización de arranque entre salas.",
      implementationRank: 5,
    }));
  }

  const adapterProbe = runAdapterTransitionProbe();
  if (adapterProbe.projectedGlobalResourceTransitionMinutes === 30 && !adapterProbe.supportsSpecificCoachRouteTransition) {
    implementationBlockers.push(blocker({
      code: "ADAPTER_COACH_ROUTE_TRANSITION_SCOPE_LOSS",
      layer: "ADAPTER",
      affectedRule: "transición coach Caracola → Estudio 7",
      canonicalIds: expansion.tasks.filter((task) => task.coachId).map((task) => task.id),
      operationalExplanation: "El probe del adaptador demuestra que sólo se proyecta resourceTransitionMinutes global; no hay canal para una transición específica por origen/destino y por coach.",
      semanticLoss: "Un margen global sobrerrestringe recursos no afectados o no distingue la ruta Caracola→Estudio 7.",
      implementationRank: 3,
    }));
  }

  const nextImplementationBlocker = [...implementationBlockers].sort((left, right) => (left.implementationRank ?? 999) - (right.implementationRank ?? 999))[0] ?? null;
  return deepFreeze({
    status: requiredCreationInputs.length || implementationBlockers.length ? "BLOCKED" : "FULLY_REPRESENTABLE",
    requiredCreationInputs,
    implementationBlockers,
    blockers: [...requiredCreationInputs, ...implementationBlockers],
    nextImplementationBlocker,
    adapterProbe,
  });
}

export function runRepresentabilityGate(analysis: RepresentabilityAnalysis, executor: RepresentabilityExecutor): RepresentabilityGateResult {
  let callCount = 0;
  if (analysis.status === "BLOCKED") {
    return deepFreeze({
      status: "REJECTED_BLOCKED",
      analysis,
      executorCallCount: callCount,
      engineInputBuilt: false,
      preflightCalled: false,
      adapterCalled: false,
      executePlannerNextCalled: false,
    });
  }
  callCount += 1;
  const trace = executor(analysis);
  return deepFreeze({
    status: "EXECUTED",
    analysis,
    executorCallCount: callCount,
    engineInputBuilt: trace.engineInputBuilt,
    preflightCalled: trace.preflightCalled,
    adapterCalled: trace.adapterCalled,
    executePlannerNextCalled: trace.executePlannerNextCalled,
  });
}
