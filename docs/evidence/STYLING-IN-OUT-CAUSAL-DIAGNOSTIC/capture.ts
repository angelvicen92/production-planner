import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runA2Assist8Evidence } from "../../../server/benchmarks/runA2Assist8Evidence";
import type { AssistedPlanningSnapshotV1 } from "../../../server/assistedPlanningSnapshot";

// Offline Evidence only. The existing benchmark replaces persistence with its
// in-memory boundary; the existing callback receives a clone after acceptance.
const destination = resolve(process.argv[2] ?? "/tmp/styling-causal-baseline");
mkdirSync(destination, { recursive: true });
const require = createRequire(import.meta.url);
writeFileSync(resolve(destination, "runtime.json"), JSON.stringify({ node: process.version, v8: process.versions.v8,
  packages: Object.fromEntries(["tsx", "typescript", "esbuild"].map(name => [name, JSON.parse(readFileSync(require.resolve(`${name}/package.json`), "utf8")).version])),
  lockfileSha256: createHash("sha256").update(readFileSync("package-lock.json")).digest("hex") }));
const snapshots: AssistedPlanningSnapshotV1[] = [];
const capture = !process.argv.includes("--without-capture");
const result = await runA2Assist8Evidence({
  reportIterationDurations: true,
  ...(capture ? { onAcceptedStage(snapshot: AssistedPlanningSnapshotV1) { snapshots.push(snapshot); } } : {}),
});
writeFileSync(resolve(destination, "run.json"), JSON.stringify(result));
if (capture) writeFileSync(resolve(destination, "snapshots.json"), JSON.stringify(snapshots));
console.log(JSON.stringify({ status: result.status, stages: result.stageCount,
  completed: result.completedObligationCount, fingerprint: result.deterministicFingerprint }));
