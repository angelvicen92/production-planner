import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildFocalA2CapabilityAudit } from "../coverage/focalA2CapabilityAudit";

export const SPEC10_012R_EVIDENCE_PATH = "docs/evidence/SPEC10-012R-focal-a2-capability-audit.json";
export const SPEC10_012R_REPORT_PATH = "docs/coverage/SPEC10-012R-A2-COVERAGE.md";
export function serializeFocalA2CoverageEvidence(): string {
  return `${JSON.stringify(buildFocalA2CapabilityAudit(), null, 2)}\n`;
}
export function generateFocalA2CoverageEvidence(path = SPEC10_012R_EVIDENCE_PATH) {
  const json = serializeFocalA2CoverageEvidence(); const audit = JSON.parse(json); mkdirSync("docs/evidence", { recursive: true }); writeFileSync(path, json);
  mkdirSync("docs/coverage", { recursive: true });
  writeFileSync(SPEC10_012R_REPORT_PATH, `# SPEC10-012R — Auditoría A2 basada en Evidence\n\n> Documento generado desde \`${path}\`. No editar sus conclusiones manualmente.\n\n- Capacidades: **167**; auditadas: **${audit.auditedCapabilityCount}**; \`NOT_AUDITED\`: **${audit.notAuditedCapabilityIds.length}**.\n- Requisitos: \`${JSON.stringify(audit.requirementCounts)}\`.\n- Estados: \`${JSON.stringify(audit.statusCounts)}\`.\n- Familias: \`${JSON.stringify(audit.familyCounts)}\`.\n- \`fullA2PlanningCoverage\`: **${audit.fullA2PlanningCoverage}**.\n- \`fullA2ProductReadiness\`: **${audit.fullA2ProductReadiness}**.\n- Recomendación: **${audit.recommendation.type}**, capacidad **${audit.recommendation.selectedCapabilityId}**.\n\nLa auditoría es tooling-only, read-only, determinista y no modifica contratos ni comportamiento productivo. El probe end-to-end ejecuta preflight, adaptador, \`executePlannerNext\` y validación canónica. Los probes de capa declaran explícitamente las capas no ejecutadas.\n`);
  return { bytes: Buffer.byteLength(json), sha256: createHash("sha256").update(json).digest("hex") };
}
if (process.argv[1]?.endsWith("runFocalA2CoverageAuditBenchmark.ts")) generateFocalA2CoverageEvidence();
