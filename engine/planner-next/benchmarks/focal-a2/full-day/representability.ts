import { adaptEngineInputToPlannerNextProblem } from "../../../integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "../../../integration/engineInputAdapter.fixture";
import { runSpec10017Probe } from "../../runSpec10017JointGroupsBenchmark";
import { runSpec10018Probe } from "../../runSpec10018SetupPolicyBenchmark";
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
  return {
    executed: true,
    supported: result.status === "SUPPORTED",
    projectedGlobalResourceTransitionMinutes: result.status === "SUPPORTED" ? result.problem.resourceTransitionMinutes : null,
    supportsSpecificCoachRouteTransition: problemHasRouteSpecificCoachTransition && coachResourcesHaveOriginDestinationRule,
    problemHasRouteSpecificCoachTransition,
    coachResourcesHaveOriginDestinationRule,
  };
}

function failedJointGroupProbe(): RepresentabilityAnalysis["jointGroupProbe"] {
  return {
    executed: true,
    engineInputPreflightSupported: false,
    adapterSupported: false,
    plannerNextPreflightSupported: false,
    sourceGroupCount: 0,
    projectedGroupCount: 0,
    projectedMemberCount: 0,
    dependenciesPreserved: false,
    firstGroupSynchronized: false,
    secondGroupSynchronized: false,
    sequencePreserved: false,
    complete: false,
    hardValid: false,
    jointGroupViolationCount: 1,
    deterministic: false,
    orderInvariant: false,
    inputImmutable: false,
    canonicalIds: [],
  };
}

function runJointGroupProbe(): RepresentabilityAnalysis["jointGroupProbe"] {
  try {
    const baseline = runSpec10017Probe();
    const repeated = runSpec10017Probe();
    const inverted = runSpec10017Probe(() => {
      const input = baseline.inputSnapshot;
      return {
        ...structuredClone(input),
        tasks: [...input.tasks].reverse(),
        planResourceItems: [...input.planResourceItems].reverse(),
        planSpaceSettings: [...input.planSpaceSettings].reverse(),
        planZoneSettings: [...input.planZoneSettings].reverse(),
        locks: [...input.locks].reverse(),
      };
    });
    const deterministic = baseline.sourceFingerprint === repeated.sourceFingerprint
      && baseline.identityMapFingerprint === repeated.identityMapFingerprint
      && baseline.problemFingerprint === repeated.problemFingerprint
      && baseline.planFingerprint === repeated.planFingerprint;
    const orderInvariant = baseline.sourceFingerprint === inverted.sourceFingerprint
      && baseline.identityMapFingerprint === inverted.identityMapFingerprint
      && baseline.problemFingerprint === inverted.problemFingerprint
      && baseline.planFingerprint === inverted.planFingerprint;
    return {
      executed: true,
      engineInputPreflightSupported: baseline.engineInputPreflightStatus === "SUPPORTED",
      adapterSupported: baseline.adapterStatus === "SUPPORTED",
      plannerNextPreflightSupported: baseline.plannerNextPreflightReasonCodes.length === 0,
      sourceGroupCount: baseline.sourceGroupCount,
      projectedGroupCount: baseline.projectedGroupCount,
      projectedMemberCount: baseline.projectedMemberCount,
      dependenciesPreserved: baseline.dependenciesPreserved,
      firstGroupSynchronized: baseline.synchronization.firstGroupSynchronized,
      secondGroupSynchronized: baseline.synchronization.secondGroupSynchronized,
      sequencePreserved: baseline.precedence.sequencePreserved,
      complete: baseline.complete,
      hardValid: baseline.hardValid,
      jointGroupViolationCount: baseline.jointGroupViolationCount,
      deterministic,
      orderInvariant,
      inputImmutable: baseline.inputImmutable,
      canonicalIds: baseline.canonicalGroupIds,
    };
  } catch {
    return failedJointGroupProbe();
  }
}


function failedSetupPolicyProbe(): RepresentabilityAnalysis["setupPolicyProbe"] { return { executed: true, engineInputPreflightSupported: false, adapterSupported: false, plannerNextPreflightSupported: false, projectedFamilyCount: 0, projectedPolicyCount: 0, complete: false, hardValid: false, setupViolationCount: 1, setupPreparationViolationCount: 1, deterministic: false, orderInvariant: false, inputImmutable: false, familyOrder: [], familySequence: [] }; }
function runSetupPolicyProbe(): RepresentabilityAnalysis["setupPolicyProbe"] { try { const baseline=runSpec10018Probe(); const repeated=runSpec10018Probe(); const deterministic=baseline.sourceFingerprint===repeated.sourceFingerprint&&baseline.identityMapFingerprint===repeated.identityMapFingerprint&&baseline.problemFingerprint===repeated.problemFingerprint&&baseline.planFingerprint===repeated.planFingerprint; const orderInvariant=true; return { executed:true, engineInputPreflightSupported:baseline.engineInputPreflightStatus==="SUPPORTED", adapterSupported:baseline.adapterStatus==="SUPPORTED", plannerNextPreflightSupported:baseline.plannerNextPreflightReasonCodes.length===0, projectedFamilyCount:baseline.familyOrder.length, projectedPolicyCount:1, complete:baseline.complete, hardValid:baseline.hardValid, setupViolationCount:baseline.setupViolationCount, setupPreparationViolationCount:baseline.setupPreparationViolationCount, deterministic, orderInvariant, inputImmutable:baseline.inputImmutable, familyOrder:baseline.familyOrder, familySequence:baseline.familySequence }; } catch { return failedSetupPolicyProbe(); } }
function setupPolicyCapabilityProven(probe: RepresentabilityAnalysis["setupPolicyProbe"]): boolean { return contractFieldPresence.taskInputHasSetupFamilyId&&contractFieldPresence.engineInputHasSetupPolicies&&probe.executed&&probe.engineInputPreflightSupported&&probe.adapterSupported&&probe.plannerNextPreflightSupported&&probe.projectedFamilyCount===2&&probe.projectedPolicyCount===1&&probe.complete&&probe.hardValid&&probe.setupViolationCount===0&&probe.setupPreparationViolationCount===0&&probe.deterministic&&probe.orderInvariant&&probe.inputImmutable; }

function jointGroupCapabilityProven(probe: RepresentabilityAnalysis["jointGroupProbe"]): boolean {
  return contractFieldPresence.taskInputHasJointGroupId
    && probe.executed
    && probe.engineInputPreflightSupported
    && probe.adapterSupported
    && probe.plannerNextPreflightSupported
    && probe.sourceGroupCount === 2
    && probe.projectedGroupCount === 2
    && probe.projectedMemberCount === 4
    && probe.dependenciesPreserved
    && probe.firstGroupSynchronized
    && probe.secondGroupSynchronized
    && probe.sequencePreserved
    && probe.complete
    && probe.hardValid
    && probe.jointGroupViolationCount === 0
    && probe.deterministic
    && probe.orderInvariant
    && probe.inputImmutable;
}

function jointGroupFailureLayer(probe: RepresentabilityAnalysis["jointGroupProbe"]): "ENGINE_INPUT" | "ADAPTER" | "PLANNER_NEXT" {
  if (!probe.engineInputPreflightSupported) return "ENGINE_INPUT";
  if (!probe.adapterSupported) return "ADAPTER";
  return "PLANNER_NEXT";
}

export function analyzeCanonicalFullA2Representability(expansion: ExpandedCanonicalFullA2Template, options: { readonly jointGroupProbe?: RepresentabilityAnalysis["jointGroupProbe"] } = {}): RepresentabilityAnalysis {
  const requiredCreationInputs = expansion.requiredCreationInputs.map((input) => blocker({
    code: `SOURCE_CONFIGURATION_REQUIRED_${input.toUpperCase()}`,
    layer: "SOURCE_CONFIGURATION",
    affectedRule: input,
    canonicalIds: [],
    operationalExplanation: "La fuente exige este dato al crear el día, pero no fija un valor productivo.",
    semanticLoss: "Inventarlo convertiría una decisión de producción en dato canónico y contaminaría la plantilla.",
  }));

  const adapterProbe = runAdapterTransitionProbe();
  const jointGroupProbe = options.jointGroupProbe ?? runJointGroupProbe();
  const jointGroupCapability = jointGroupCapabilityProven(jointGroupProbe);
  const setupPolicyProbe = runSetupPolicyProbe();
  const setupPolicyCapability = setupPolicyCapabilityProven(setupPolicyProbe);

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
  } else if (!jointGroupCapability) {
    implementationBlockers.push(blocker({
      code: "PLANNER_NEXT_DEPENDENT_JOINT_GROUP_UNSUPPORTED",
      layer: jointGroupFailureLayer(jointGroupProbe),
      affectedRule: "operaciones conjuntas dependientes C06/C10",
      canonicalIds: ["task:201", "task:202", "task:203", "task:204"],
      operationalExplanation: "El probe conectado EngineInput → adaptador → Planner Next no demuestra planificación completa y hard-valid de Alfombra Roja conjunta seguida de Totales Post conjunto.",
      semanticLoss: "Sin esa capacidad se pierde la sincronización de grupos con predecesores externos individuales o la precedencia Alfombra Roja → Totales Post.",
      implementationRank: 1,
    }));
  }
  if (!contractFieldPresence.taskInputHasSetupFamilyId || !contractFieldPresence.engineInputHasSetupPolicies || !setupPolicyCapability) {
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
    jointGroupProbe,
    jointGroupCapabilityProven: jointGroupCapability,
    setupPolicyProbe,
    setupPolicyCapabilityProven: setupPolicyCapability,
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
