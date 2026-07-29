import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { focalA2Problem } from "./focal-a2/focalA2Problem";
import { projectFocalA2BandProblem, referenceBandPresence, scheduledBandPresence } from "./focal-a2/focalA2BandReference";

const legacyPath = "planner-next-focal-a2-band-baseline-v1.json";
const currentPath = "planner-next-focal-a2-band-preferred-v1.json";
const sourcePath = existsSync(currentPath) ? currentPath : legacyPath;
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const manifest = JSON.parse(readFileSync("engine/planner-next/benchmarks/focal-a2/focalA2BandPreferredHistoricalManifest.json", "utf8"));
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).filter((key) => key !== "runtimeMs").sort().map((key) => [key, canonical(value[key])])) : value;
const digest = (value: any) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
if (sourcePath === legacyPath && createHash("sha256").update(readFileSync(legacyPath)).digest("hex") !== manifest.sourceArtifactSha256) throw new Error("HISTORICAL_ARTIFACT_SHA_MISMATCH");
const reverse = (problem: any) => ({ ...problem, tasks: [...problem.tasks].reverse(), participants: [...problem.participants].reverse(), coaches: [...problem.coaches].reverse(), spaces: [...problem.spaces].reverse(), resources: [...problem.resources].reverse() });
function execute(mode: "ORIGINAL" | "CURRENT_OFF" | "CURRENT_PREFERRED", reversed = false) {
  const problem = mode === "ORIGINAL" ? focalA2Problem() : projectFocalA2BandProblem(mode);
  const input = reversed ? reverse(problem) : problem;
  const before = JSON.stringify(input);
  const result = planMainFlowAndFeeders(input);
  return { mode, complete: result.complete, hardValid: result.metrics.hardValid, plannedTaskCount: result.metrics.plannedTaskCount,
    scheduledTasks: result.scheduledTasks, scheduledMeals: result.scheduledSpaceMeals, fingerprint: result.metrics.planFingerprint,
    branches: result.metrics.branchesExplored, branchBudgetConsumed: result.metrics.branchBudgetConsumed, runtimeMs: result.metrics.runtimeMs,
    totalParticipantPresenceMinutes: result.metrics.totalParticipantPresenceMinutes, maxParticipantPresenceMinutes: result.metrics.maxParticipantPresenceMinutes,
    makespan: result.metrics.mainFlowEnd! - result.metrics.mainFlowStart!, bandPresence: scheduledBandPresence(result.scheduledTasks),
    resourceOperationalBlockCountById: result.metrics.resourceOperationalBlockCountById,
    resourceAuthorizedMealMinutesById: result.metrics.resourceAuthorizedMealMinutesById, inputUnchanged: before === JSON.stringify(input) };
}
const original = execute("ORIGINAL");
const off = execute("CURRENT_OFF");
const preferred = execute("CURRENT_PREFERRED");
const repeat = execute("CURRENT_PREFERRED");
const reversed = execute("CURRENT_PREFERRED", true);
const deterministic = digest(preferred) === digest(repeat);
const orderInvariant = digest(preferred) === digest(reversed);
const band = preferred.bandPresence;
const accepted = preferred.complete && preferred.hardValid && preferred.plannedTaskCount === 38 && band.operationalBlockCount <= 4
  && band.presenceSpanMinutes <= 345 && band.internalGapMinutes <= 75 && band.authorizedMealMinutesInsideSpan === 75
  && preferred.totalParticipantPresenceMinutes <= 2345 && preferred.maxParticipantPresenceMinutes <= 215 && preferred.makespan <= 450
  && preferred.branchBudgetConsumed <= 300000 && deterministic && orderInvariant && preferred.inputUnchanged
  && off.fingerprint === "76f52d292e810ab8506ba868d77036126f299bcf129462a62b6c3b49a13be4fc" && off.branches === 64558;
const historicalScenarios = source.scenarios ?? {};
const output = { ...source, version: "planner-next-focal-a2-band-preferred-v1", status: accepted ? "BAND_PREFERRED_POLICY_ACCEPTED" : "BAND_PREFERRED_POLICY_FAILED",
  preferredPolicyAccepted: accepted, fullBandBenchmarkPassed: false,
  resolvedGapCodes: ["AUTHORIZED_SPACE_MEAL_COUNTED_AS_RESOURCE_GAP", "RESOURCE_PRESENCE_SCORING_IGNORES_BLOCK_COUNT_PRIORITY"],
  remainingGapCodes: ["MAIN_FLOW_INSTRUMENT_REQUIREMENT_NOT_REPRESENTABLE", "REQUIRED_RESOURCE_PRESENCE_NOT_HARD_VALIDATED", "OFF_PREFERRED_REQUIRED_POLICY_NOT_EXPRESSIBLE"],
  referenceBandPresence: referenceBandPresence(), preferredPlan: preferred,
  preferredEvidence: { repeatDigest: digest(repeat), reversedDigest: digest(reversed), deterministic, orderInvariant, budgetRespected: preferred.branchBudgetConsumed <= 300000, inputUnchanged: preferred.inputUnchanged },
  historicalRegression: { currentOff: off, original, sourceArtifactSha256: manifest.sourceArtifactSha256 },
  scenarios: { ...historicalScenarios, focalA2BandPreferredAudit: { preferred, deterministic, orderInvariant, accepted } } };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (!accepted) process.exitCode = 1;
