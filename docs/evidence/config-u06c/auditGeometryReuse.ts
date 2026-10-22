import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { buildCanonicalA2AssistedStage1Fixture } from "../../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { authorizedPipelineArchitectureMaterializations } from "../../../engine/planner-next/anonymousPipelineWitness";

// Read-only timing/certificate audit. It never enters the production search path.
const { assisted } = buildCanonicalA2AssistedStage1Fixture();
const start = performance.now();
const next = authorizedPipelineArchitectureMaterializations(assisted.problem).next();
assert.ok(!next.done);
const first = next.value;
const attempts = first.materialized.diagnostic.entryArrivalAttempts;
const inputs = attempts.map(attempt => JSON.stringify(attempt.obligations.map(task =>
  [task.id, task.participantId, task.start, task.end])));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const report = {
  node: process.version,
  sourceSha256: createHash("sha256").update(readFileSync("engine/planner-next/anonymousPipelineWitness.ts")).digest("hex"),
  transportSourceSha256: createHash("sha256").update(readFileSync("engine/planner-next/transportGrouping.ts")).digest("hex"),
  durationMs: Math.round(performance.now() - start),
  status: first.materialized.witness.status,
  arrivalAttempts: inputs.length,
  uniqueArrivalInputs: new Set(inputs).size,
  architectureFingerprint: hash(first.architecture),
  witnessFingerprint: first.materialized.witness.fingerprint,
  placementsFingerprint: hash(first.materialized.scheduledTasks),
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
