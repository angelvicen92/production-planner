import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildFocalA2CapabilityAudit } from "../coverage/focalA2CapabilityAudit";

export const SPEC10_012R_EVIDENCE_PATH = "docs/evidence/SPEC10-012R-focal-a2-capability-audit.json";
export const SPEC10_012R_REPORT_PATH = "docs/coverage/SPEC10-012R-A2-COVERAGE.md";

export function serializeFocalA2CoverageEvidence(): string {
  return `${JSON.stringify(buildFocalA2CapabilityAudit(), null, 2)}\n`;
}

export function generateFocalA2CoverageEvidence(path = SPEC10_012R_EVIDENCE_PATH) {
  const json = serializeFocalA2CoverageEvidence();
  const audit = JSON.parse(json);
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(path, json);
  mkdirSync("docs/coverage", { recursive: true });
  writeFileSync(SPEC10_012R_REPORT_PATH, `# SPEC10-012R2 — Piloto A2 de Evidence real

> Documento generado desde \`${path}\`. Las conclusiones no se editan manualmente.

PR #616 y la primera revisión de este PR aportaron andamiaje provisional, pero sus conteos masivos no eran autoridad. SPEC10-012R2 queda deliberadamente reducido a un piloto reproducible antes de ampliar el catálogo.

## Alcance del piloto

- Capacidades auditadas: **${audit.pilotCapabilityIds.join(", ")}**.
- Bindings literales: **${audit.bindings.length}**.
- Source assertions revisadas: **${audit.sourceAssertions.length}**.
- Probe observations ejecutadas: **${audit.probeObservations.length}**.
- Test assertions: **${audit.bindings.flatMap((binding: { testAssertions: unknown[] }) => binding.testAssertions).length}**.
- Benchmark assertions: **${audit.bindings.flatMap((binding: { benchmarkAssertions: unknown[] }) => binding.benchmarkAssertions).length}**.
- Resultados de assertions: \`${JSON.stringify(audit.assertionCounts)}\`.

## Cobertura derivada

- Técnicamente auditadas: **${audit.technicallyAuditedCapabilityCount}**.
- Source-reviewed: **${audit.sourceReviewedCapabilityCount}**.
- \`NOT_AUDITED\`: **${audit.notAuditedCapabilityCount}**.
- Fases de producto: **${audit.productPhaseCapabilityIds.join(", ")}**.
- Requisitos: \`${JSON.stringify(audit.requirementCounts)}\`.
- Estados: \`${JSON.stringify(audit.statusCounts)}\`.
- Familias piloto: \`${JSON.stringify(audit.familyCounts)}\`.
- Recomendación: **${audit.recommendation.type}**, capacidad **${audit.recommendation.selectedCapabilityId}** — ${audit.recommendation.selectedAction}.

Todo lo que no pertenece al piloto queda sin binding y \`NOT_AUDITED / AUDIT\`, salvo 162–167 como \`PRODUCT_PHASE_NOT_IMPLEMENTED / PRODUCT\`. No se auditan aquí vocal, main, Reality, joint tasks, espacios ni validación completa. La ampliación será incremental.

## Focal y límites

Los datos Focal se leen de \`${audit.focalEvidence.file}\`: \`${JSON.stringify(audit.focalEvidence.observations)}\`. No se copian expectativas como observaciones. Este PR sólo modifica tooling, Evidence y documentación; no implementa capacidades ni cambia producción.
`);
  return { bytes: Buffer.byteLength(json), sha256: createHash("sha256").update(json).digest("hex") };
}

if (process.argv[1]?.endsWith("runFocalA2CoverageAuditBenchmark.ts")) generateFocalA2CoverageEvidence();
