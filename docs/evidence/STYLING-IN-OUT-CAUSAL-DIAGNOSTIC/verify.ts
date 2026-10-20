import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { buildCanonicalA2AssistedStage1Fixture } from "../../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";

const baselineDirectory = resolve(process.argv[2] ?? "/tmp/styling-causal-baseline");
const controlDirectory = resolve(process.argv[3] ?? "/tmp/styling-causal-control");
const destination = resolve(process.argv[4] ?? baselineDirectory);
const read = (directory: string, name: string) => JSON.parse(readFileSync(resolve(directory, name), "utf8"));
const first = read(baselineDirectory, "run.json"), second = read(controlDirectory, "run.json");
const runtime = read(baselineDirectory, "runtime.json");
assert.deepEqual(runtime, read(controlDirectory, "runtime.json"));
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const material = (run: any) => ({ ...run, iterations: run.iterations.map(({ durationMs: _duration, ...stage }: any) => stage) });
// Compare the entire existing benchmark result. Only wall-clock duration differs;
// fingerprints, placements, scopes, branches, prunes, validation and stop reasons
// remain in the comparison, including all nested causal diagnostics/witnesses.
assert.deepEqual(material(first), material(second));
assert.equal(first.status, "PASS"); assert.equal(first.completedObligationCount, 266);
const jointFingerprints = first.iterations.map((stage: any) => stage.futureStructuralWitnesses.find((w: any) => w.kind === "JOINT_COMPLETION").fingerprint);
assert.equal(new Set(jointFingerprints).size, 1, "all Stages must replay the same complete witness in this baseline");
for (const stage of first.iterations.slice(1)) {
  assert.equal(stage.work.coreBranches, 0);
  assert.equal(stage.standaloneDiagnostic.ordinaryBranchesExplored, 0);
  assert.equal(stage.standaloneDiagnostic.standaloneCompleteLeafCount, 0);
}
const fixture = buildCanonicalA2AssistedStage1Fixture();
const baselineSha = "75040e7dabdb77864e216d3b1163c2fb9f26509b";
const git = async (...args: string[]) => (await promisify(execFile)("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })).stdout;
const baselineTree = (await git("rev-parse", `${baselineSha}^{tree}`)).trim();
const productionPaths = (await git("ls-files", "engine", "server", "shared", "client", "script", "supabase", "package.json", "package-lock.json")).trim().split("\n");
const runtimeHashes = Object.fromEntries(productionPaths.map(path => [path, sha(readFileSync(path))]));
const productionDiff = await git("diff", baselineSha, "--", ...productionPaths);
assert.equal(productionDiff, "", "this diagnosis must not change production, tests or canonical benchmark code");
const priorProofPath = "docs/evidence/AUTOPILOT-MAXIMIZED/integration-proof.json";
const prior = JSON.parse(readFileSync(priorProofPath, "utf8"));
const report = read(destination, "report.json");
const participantComparison = report.baseline.participants.map((row: any, index: number) => {
  const old = prior.topologyMetrics.participants[index];
  // The old artifact uses the historical-import namespace. Alignment is by
  // canonical contestant ordinal, not equality of imported numeric IDs.
  return { participant: row.participant, oldImportedId: old.id, currentCanonicalId: row.canonicalId,
    previous: { inEndToEntryMinutes: old.inToEntryMinutes, lastIncludingMealToExitMinutes: old.lastToExitMinutes, exitEndToOutMinutes: old.exitToOutMinutes, presenceMinutes: old.presenceMinutes },
    current: { inEndToEntryMinutes: row.inEndToEntryMinutes, lastIncludingMealToExitMinutes: row.lastIncludingMealToExitMinutes, exitEndToOutMinutes: row.exitEndToOutMinutes, presenceMinutes: row.presenceMinutes } };
});
const previousRuntimeChanges = Object.entries(prior.runtimeHashes).flatMap(([path, oldSha]) => {
  const now = sha(readFileSync(path)); return oldSha === now ? [] : [{ path, previous: oldSha, current: now }];
});
const stalePath = "docs/evidence/A2-ASSIST-8-assisted-completion.json";
const stale = JSON.parse(readFileSync(stalePath, "utf8"));
const result = { status: "PASS", baselineSha, baselineTree, nodeVersion: process.version, v8Version: process.versions.v8, runtime,
  fixtureInputSha256: sha(JSON.stringify(fixture.input)), fixtureProblemSha256: sha(JSON.stringify(fixture.adapter.problem)),
  branchBudgetPerStage: fixture.input.plannerNext?.searchBudget?.maxBranchExpansions,
  unchangedProductionPathCount: productionPaths.length, productionTreeUnchanged: true,
  runtimeHashes, neutralCapture: { equal: true, excludedFields: ["iterations[*].durationMs"], materialSha256: sha(JSON.stringify(material(first))),
    withCaptureDurationsMs: first.iterations.map((stage: any) => stage.durationMs), withoutCaptureDurationsMs: second.iterations.map((stage: any) => stage.durationMs),
    fingerprints: [first.deterministicFingerprint, second.deterministicFingerprint],
    stageBranches: first.iterations.map((stage: any) => stage.branchesExplored), jointFingerprints,
    afterS1CoreAndOrdinarySearchAbsent: true },
  previousEvidence: { path: priorProofPath, sha256: sha(readFileSync(priorProofPath)), previousRuntimeChanges,
    previous: { placedObligations: prior.topologyMetrics.placedObligations, dayClosureMinute: prior.topologyMetrics.dayClosureMinute,
      participantPresenceTotalMinutes: prior.topologyMetrics.participantPresenceTotalMinutes, styling: prior.topologyMetrics.styling },
    current: { completedObligations: report.baseline.completedObligations, dayClosureMinute: report.baseline.dayClosureMinute,
      participantPresenceTotalMinutes: report.baseline.participantPresenceTotalMinutes, styling: report.baseline.styling }, participantComparison },
  staleNamedBenchmarkArtifact: { path: stalePath, status: stale.status, milestone: stale.milestone, fingerprint: stale.deterministicFingerprint,
    interpretation: "Historical artifact; regenerated current runner passes S11, so its S6 blocker is not current Evidence." } };
writeFileSync(resolve(destination, "verification.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ status: result.status, unchangedProductionPaths: productionPaths.length, neutralCapture: true,
  fingerprint: first.deterministicFingerprint, previousRuntimeFilesChanged: previousRuntimeChanges.length }));
