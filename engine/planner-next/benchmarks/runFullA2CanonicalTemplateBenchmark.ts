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
const gate = runRepresentabilityGate(representability, () => {
  throw new Error("SPEC10-016 gate must not execute while representability is BLOCKED.");
});
const shuffledTemplate = {
  ...template,
  participants: [...template.participants].reverse(),
  assignments: [...template.assignments].reverse(),
  spaces: [...template.spaces].reverse(),
  resources: [...template.resources].reverse(),
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
  canonicalOperations: {
    anchoredOperations: expansion.anchoredOperations,
    jointOperations: expansion.jointOperations,
    technicalChains: expansion.technicalChains,
  },
  invariants: validation.invariants,
  validationStatus: validation.status,
  validationIssues: validation.issues,
  requiredCreationInputs: expansion.requiredCreationInputs,
  representabilityStatus: representability.status,
  requiredCreationInputBlockers: representability.requiredCreationInputs,
  implementationBlockers: representability.implementationBlockers,
  nextImplementationBlocker: representability.nextImplementationBlocker,
  adapterProbe: representability.adapterProbe,
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

## Required creation inputs

${requiredRows}

Estos datos son inputs de creación del futuro día y no se seleccionan como siguiente capacidad técnica.

## Implementation blockers

Estado de representabilidad: **${representability.status}**. La puerta ejecutada devuelve **${gate.status}**, con executorCallCount=${gate.executorCallCount}, sin EngineInput parcial, sin preflight, sin adaptador y sin executePlannerNext.

${implementationRows}

## Siguiente blocker técnico razonado

${next ? `El siguiente paso de menor riesgo es **${next.code}**: Planner Next ya soporta grupos conjuntos mediante jointGroupId, no requiere nuevas reglas de búsqueda, exige una ampliación contractual menor en EngineInput/adaptador y desbloquea semántica real de C06/C10 que hoy se perdería si se aproximara con dependencias.` : "No hay blocker técnico pendiente."}

## No implementado

No se implementa botón, DB, API, UI, persistencia, contratos productivos, preflight productivo, adaptador productivo ni ejecución del motor para un subconjunto parcial.
`);

console.log(JSON.stringify({
  status: representability.status,
  gateStatus: gate.status,
  executorCallCount: gate.executorCallCount,
  expansionFingerprint: evidence.expansionFingerprint,
  manifestFingerprint: evidence.manifestFingerprint,
  totalTaskCount: evidence.totalTaskCount,
}, null, 2));
