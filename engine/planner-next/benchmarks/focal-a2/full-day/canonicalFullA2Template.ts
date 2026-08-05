import { createHash } from "node:crypto";
import { createCanonicalFullA2Template } from "./manifest";
import { expandCanonicalFullA2Template } from "./expand";
import { validateExpandedCanonicalFullA2Template } from "./validate";
import { analyzeCanonicalFullA2Representability, runRepresentabilityGate } from "./representability";
export * from "./types";
export { EXPECTED_COUNTS_BY_TYPE, EXPECTED_COACH_BY_PARTICIPANT, EXPECTED_PARTICIPANT_TASK_MATRIX, TASK_TYPES, createCanonicalFullA2Template } from "./manifest";
export { expandCanonicalFullA2Template, taskId } from "./expand";
export { validateExpandedCanonicalFullA2Template } from "./validate";
export { analyzeCanonicalFullA2Representability, runRepresentabilityGate } from "./representability";

export function validateCanonicalFullA2Template(template = createCanonicalFullA2Template()) {
  return validateExpandedCanonicalFullA2Template(expandCanonicalFullA2Template(template));
}

export function canonicalFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
