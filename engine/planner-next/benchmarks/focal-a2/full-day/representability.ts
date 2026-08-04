import { adaptEngineInputToPlannerNextProblem } from "../../../integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "../../../integration/engineInputAdapter.fixture";
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
  return {
    executed: true,
    supported: result.status === "SUPPORTED",
    projectedGlobalResourceTransitionMinutes: result.status === "SUPPORTED" ? result.problem.resourceTransitionMinutes : null,
    supportsSpecificCoachRouteTransition: false,
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
  if (!contractFieldPresence.plannerNextProblemHasRoundSynchronization) {
    implementationBlockers.push(blocker({
      code: "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED",
      layer: "PLANNER_NEXT",
      affectedRule: "sincronización de rondas Totales 1/Coreo",
      canonicalIds: expansion.tasks.filter((task) => task.type === "TOTALES_1" || task.type === "TOTALES_COREO").map((task) => task.id),
      operationalExplanation: "No existe contrato PlannerNextProblem equivalente para rondas simultáneas entre dos espacios independientes.",
      semanticLoss: "Las dependencias impondrían precedencia, no sincronización de arranque entre salas.",
      implementationRank: 4,
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
  executor(analysis as never);
  return deepFreeze({
    status: "EXECUTED",
    analysis,
    executorCallCount: callCount,
    engineInputBuilt: true,
    preflightCalled: true,
    adapterCalled: true,
    executePlannerNextCalled: true,
  });
}
