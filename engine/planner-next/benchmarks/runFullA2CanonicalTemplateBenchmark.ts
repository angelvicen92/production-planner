import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  analyzeCanonicalFullA2Representability,
  canonicalFingerprint,
  createCanonicalFullA2Template,
  expandCanonicalFullA2Template,
  runRepresentabilityGate,
  validateExpandedCanonicalFullA2Template,
} from "./focal-a2/full-day/canonicalFullA2Template";

const sourcePaths = [
  "docs/source/DOCUMENTO_MAESTRO_INTERPRETACION_ENSAYO_A2_v1.md",
  "docs/source/CUADRO_TAREAS_DIA_DE_PRUEBA_A2_v1.md",
  "docs/source/ADDENDUM_A2_DESCANSOS_OPERATIVOS_Y_COMIDAS_2026-08-08.md",
  "docs/source/ADDENDUM_OFICIAL_SEMANTICA_AGRUPACION_TRANSPORTE_2026-08-08.md",
  "docs/evidence/A2-FULL-008-effective-configuration-probe.json",
] as const;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeStable(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value.endsWith("\n") ? value : `${value}\n`);
}

const template = createCanonicalFullA2Template();
const expansion = expandCanonicalFullA2Template(template);
const validation = validateExpandedCanonicalFullA2Template(expansion);
const representability = analyzeCanonicalFullA2Representability(expansion);
const gate = runRepresentabilityGate(representability, () => ({
  engineInputBuilt: false,
  preflightCalled: false,
  adapterCalled: false,
  executePlannerNextCalled: false,
}));
const shuffledTemplate = {
  ...template,
  participants: [...template.participants].reverse(),
  assignments: [...template.assignments].reverse(),
  spaces: [...template.spaces].reverse(),
  resources: [...template.resources].reverse(),
  itinerantUnits: [...template.itinerantUnits].reverse(),
  itinerantOperations: [...template.itinerantOperations].reverse(),
};
const shuffledExpansion = expandCanonicalFullA2Template(shuffledTemplate);
const mutationBlocked = (() => {
  try {
    (expansion.tasks as unknown as unknown[]).push({});
    return false;
  } catch {
    return true;
  }
})();

const evidence = {
  contractVersion: template.contractVersion,
  sourceDocuments: sourcePaths.map((path) => ({ path, sha256: sha256File(path) })),
  manifestFingerprint: canonicalFingerprint(template),
  expansionFingerprint: canonicalFingerprint(expansion),
  participantCount: expansion.participants.length,
  contestantTaskCount: expansion.tasks.filter((task) => task.participantId).length,
  technicalTaskCount: expansion.tasks.filter((task) => !task.participantId).length,
  totalTaskCount: expansion.tasks.length,
  countsByType: expansion.countsByType,
  canonicalResources: expansion.resources,
  itinerantUnits: expansion.itinerantUnits,
  itinerantOperations: expansion.itinerantOperations,
  unitIdNotHardResource: expansion.itinerantUnits.every((unit) => !expansion.resources.some((resource) => resource.id === unit.id) && expansion.tasks.every((task) => !task.requiredResourceIds.includes(unit.id))),
  effectiveResourcesByItinerantOperation: expansion.itinerantOperations.map((operation) => ({
    operationId: operation.id,
    itinerantUnitId: operation.itinerantUnitId,
    memberResourceIds: operation.memberResourceIds,
    taskResources: operation.taskIds.map((taskId) => ({ taskId, requiredResourceIds: expansion.tasks.find((task) => task.id === taskId)?.requiredResourceIds ?? [] })),
  })),
  anchorEffectiveResources: expansion.anchoredOperations.map((operation) => ({
    operationId: operation.id,
    anchorTaskId: operation.anchorTaskId,
    itinerantUnitId: operation.itinerantUnitId,
    memberResourceIds: operation.memberResourceIds,
    requiredResourceIds: expansion.tasks.find((task) => task.id === operation.anchorTaskId)?.requiredResourceIds ?? [],
  })),
  setupWithoutHardOrder: expansion.rules.setup.orderConstraint === "UNSPECIFIED" && expansion.rules.setup.oneBlockPerFamily === true,
  canonicalOperations: {
    anchoredOperations: expansion.anchoredOperations,
    jointOperations: expansion.jointOperations,
    technicalChains: expansion.technicalChains,
    itinerantOperations: expansion.itinerantOperations,
  },
  invariants: validation.invariants,
  validationStatus: validation.status,
  validationIssues: validation.issues,
  requiredCreationInputs: expansion.requiredCreationInputs,
  effectiveConfiguration: expansion.effectiveConfiguration,
  representabilityStatus: representability.status,
  requiredCreationInputBlockers: representability.requiredCreationInputs,
  implementationBlockers: representability.implementationBlockers,
  nextImplementationBlocker: representability.nextImplementationBlocker,
  participantAvailabilityProbe: representability.participantAvailabilityProbe,
  transportPolicyProbe: representability.transportPolicyProbe,
  scopedMealPolicyProbe: representability.scopedMealPolicyProbe,
  adapterProbe: representability.adapterProbe,
  jointGroupProbe: representability.jointGroupProbe,
  jointGroupCapabilityProven: representability.jointGroupCapabilityProven,
  setupPolicyProbe: representability.setupPolicyProbe,
  setupPolicyCapabilityProven: representability.setupPolicyCapabilityProven,
  flexibleSetupOrderProbe: representability.flexibleSetupOrderProbe,
  flexibleSetupOrderCapabilityProven:
    representability.flexibleSetupOrderCapabilityProven,
  roundSynchronizationProbe: representability.roundSynchronizationProbe,
  roundSynchronizationCapabilityProven:
    representability.roundSynchronizationCapabilityProven,
  representabilityGate: gate,
  noEngineInputPartial: gate.engineInputBuilt === false,
  noSeedSchedule: expansion.tasks.every((task) => !("start" in task) && !("end" in task) && !("startPlanned" in task) && !("referenceOrder" in task)),
  noLocks: true,
  determinism: {
    sameExpansionFingerprint: canonicalFingerprint(expandCanonicalFullA2Template(createCanonicalFullA2Template())) === canonicalFingerprint(expansion),
  },
  orderInvariance: {
    shuffledExpansionFingerprint: canonicalFingerprint(shuffledExpansion),
    matches: canonicalFingerprint(shuffledExpansion) === canonicalFingerprint(expansion),
  },
  inputImmutable: {
    expansionMutationBlocked: mutationBlocked,
  },
  negativeMutationCoverage: [
    "anchoredOperations.empty",
    "anchoredOperations.omitC05",
    "jointOperations.empty",
    "technicalChains.empty",
    "itinerantUnits.empty",
    "itinerantOperations.c05WrongUnit",
    "itinerantResources.removeSon2",
    "anchoredAnchor.removeCam3",
    "requiredResourceIds.unitAsHardResource",
    "resources.unitRegisteredAsResource",
    "itinerantOperations.taskInTwoUnits",
    "setup.sillonAsEstrellas",
    "setup.cornerMusicFamily",
    "setup.orderConstraintHardcoded",
    "setup.oneBlockPerFamilyLost",
    "counts.recomputedAgainstTasks",
    "croma.addSon2",
    "croma.addCanonicalSound",
    "technicalChain.adjacencyLost",
    "technicalChain.resourceContinuityLost",
    "technicalChain.orderChanged",
    "technicalChain.contractResourceLost",
    "technicalChain.taskExtraResource",
    "technicalChain.durationChanged",
    "itinerantOperation.kindChanged",
    "effectiveConfiguration.participantAvailability.C01.end",
    "effectiveConfiguration.participantAvailability.C02-C19.end",
    "effectiveConfiguration.transportPolicy.arrival.minGapMinutes",
    "effectiveConfiguration.transportPolicy.departure.groupingTarget",
    "effectiveConfiguration.transportPolicy.departure.minParticipantsPerGroupInvented",
    "effectiveConfiguration.transportPolicy.departure.minGapMinutes",
    "effectiveConfiguration.transportPolicy.vanCapacity",
    "effectiveConfiguration.meals.operational.defaultDurationMinutes",
    "effectiveConfiguration.meals.operational.realityDurationMinutes45",
    "effectiveConfiguration.meals.effectiveWindow",
    "effectiveConfiguration.meals.participant.sodexoDurationMinutes",
    "effectiveConfiguration.meals.participant.maxSimultaneous",
    "effectiveConfiguration.meals.operational.fixedHumanCutIntervalIntroduced",
  ],
};

writeStable("docs/evidence/SPEC10-016-full-a2-canonical-template.json", JSON.stringify(evidence, null, 2));

const implementationRows = representability.implementationBlockers
  .map((blocker) => `- **${blocker.code}** (${blocker.layer}): ${blocker.operationalExplanation} Pérdida si se aproxima: ${blocker.semanticLoss}`)
  .join("\n");
const requiredRows = representability.requiredCreationInputs
  .map((blocker) => `- **${blocker.affectedRule}**: ${blocker.operationalExplanation}`)
  .join("\n");
const next = representability.nextImplementationBlocker;

writeStable("docs/coverage/SPEC10-016-FULL-A2-TEMPLATE.md", `# SPEC10-016 — Plantilla canónica completa A2

## Día expresado

La plantilla anónima expresa ${evidence.participantCount} concursantes, ${evidence.contestantTaskCount} tareas de concursante, ${evidence.technicalTaskCount} tareas técnicas y ${evidence.totalTaskCount} tareas totales. La expansión conserva semántica operativa de transporte, comida individual, flujo principal, pruebas vocales, segmentos anclados, operaciones conjuntas, cadena técnica, espacios, recursos conocidos, setup, sincronización de Totales y transición de coaches sin horarios seed, locks ni nombres reales.

## Unidades itinerantes A2

Se conservan tres composiciones explícitas, sin registrarlas como recursos hard: **reality-unit-a** (cam-3, son-1), **reality-unit-b** (cam-4, son-2) y **reality-unit-combined** (cam-3, cam-4, son-1). Cada operación itinerante declara sus tareas y recursos miembros; los anchors C01/C05/C08 retienen esos recursos además del coach de Estudio 7. EVA se añade sólo a operaciones que la requieren explícitamente.

## Required creation inputs

${requiredRows || "Todos los inputs de creación A2 conocidos para este benchmark están resueltos. Los blockers restantes son exclusivamente técnicos y están demostrados por los probes ejecutables."}

## Implementation blockers

Estado de representabilidad: **${representability.status}**. La puerta ejecutada devuelve **${gate.status}**, con executorCallCount=${gate.executorCallCount}. Los probes de capacidades se ejecutan de forma aislada y no publican un plan parcial.

${implementationRows}

La regla de setup conserva families=[sillon, estrellas], oneBlockPerFamily=true, orderConstraint=UNSPECIFIED, reentry=FORBIDDEN y 10 minutos entre familias; no se impone Sillón antes que Estrellas.

## Siguiente blocker técnico razonado

${next ? `Los probes focales demuestran jointGroupCapabilityProven=${representability.jointGroupCapabilityProven}, setupPolicyCapabilityProven=${representability.setupPolicyCapabilityProven}, flexibleSetupOrderCapabilityProven=${representability.flexibleSetupOrderCapabilityProven}, roundSynchronizationCapabilityProven=${representability.roundSynchronizationCapabilityProven} y supportsSpecificCoachRouteTransition=${representability.adapterProbe.supportsSpecificCoachRouteTransition}. Por eso el siguiente paso de menor riesgo es **${next.code}**.` : `No hay blocker técnico pendiente. El probe conectado demuestra roundSynchronizationCapabilityProven=${representability.roundSynchronizationCapabilityProven}, incluyendo emparejamiento ordinal dinámico, preparación explícita, ronda residual, determinismo, contabilidad de presupuesto y publicación atómica.`}

## No implementado

No se implementa botón, DB, API, UI, persistencia, comidas scoped ni ejecución del motor para un subconjunto parcial.
`);

console.log(JSON.stringify({
  status: representability.status,
  gateStatus: gate.status,
  executorCallCount: gate.executorCallCount,
  expansionFingerprint: evidence.expansionFingerprint,
  manifestFingerprint: evidence.manifestFingerprint,
  totalTaskCount: evidence.totalTaskCount,
}, null, 2));
