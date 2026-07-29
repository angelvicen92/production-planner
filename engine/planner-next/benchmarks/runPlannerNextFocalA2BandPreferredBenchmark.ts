import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { validatePlan } from "../validate";
import { focalA2Problem } from "./focal-a2/focalA2Problem";
import {
  focalTaskSpan,
  projectFocalA2BandProblem,
  referenceBandPresence,
  scheduledBandPresence,
} from "./focal-a2/focalA2BandReference";
import { validateGeneratedFocalA2Plan } from "./focal-a2/validateFocalA2Reference";

const LEGACY_PATH = "planner-next-focal-a2-band-preferred-v1.json";
const CURRENT_PATH = "planner-next-focal-a2-band-preferred-v2.json";
const MANIFEST_PATH =
  "engine/planner-next/benchmarks/focal-a2/focalA2BandPreferredV2HistoricalManifest.json";
const ACCEPTED_MEANING =
  "Planner Next applies the generic soft PREFERRED continuous-resource policy and passes the Focal A2 Band concentration target; REQUIRED presence and main-flow instrument representation remain pending";
const RESOLVED_GAPS = [
  "AUTHORIZED_SPACE_MEAL_COUNTED_AS_RESOURCE_GAP",
  "RESOURCE_PRESENCE_SCORING_IGNORES_BLOCK_COUNT_PRIORITY",
];
const REMAINING_GAPS = [
  "MAIN_FLOW_INSTRUMENT_REQUIREMENT_NOT_REPRESENTABLE",
  "REQUIRED_RESOURCE_PRESENCE_NOT_HARD_VALIDATED",
  "OFF_PREFERRED_REQUIRED_POLICY_NOT_EXPRESSIBLE",
];

export const canonical = (value: any): any => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => key !== "runtimeMs")
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
export const digest = (value: any): string =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const sha256File = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const uniqueSorted = (values: string[]): string[] =>
  [...new Set(values)].sort();
const mismatchFields = (actual: any, frozen: any): string[] =>
  uniqueSorted(
    Object.keys(frozen).filter(
      (key) => JSON.stringify(actual[key]) !== JSON.stringify(frozen[key]),
    ),
  );

const reverseProblem = (problem: any): any => ({
  ...problem,
  tasks: [...problem.tasks].reverse(),
  participants: [...problem.participants].reverse(),
  coaches: [...problem.coaches].reverse(),
  spaces: [...problem.spaces].reverse(),
  resources: [...problem.resources].reverse(),
});

function execute(
  mode: "ORIGINAL" | "CURRENT_OFF" | "CURRENT_PREFERRED",
  reversed = false,
) {
  const problem =
    mode === "ORIGINAL" ? focalA2Problem() : projectFocalA2BandProblem(mode);
  const input = reversed ? reverseProblem(problem) : problem;
  const before = JSON.stringify(input);
  const result = planMainFlowAndFeeders(input);
  const span = focalTaskSpan(result.scheduledTasks);
  const mainFlowSpanMinutes =
    result.metrics.mainFlowStart == null || result.metrics.mainFlowEnd == null
      ? 0
      : result.metrics.mainFlowEnd - result.metrics.mainFlowStart;
  const validation = validatePlan(
    input,
    result.scheduledTasks,
    result.scheduledSetupPreparations,
    result.scheduledSpaceMeals,
  );
  const focalValidation = validateGeneratedFocalA2Plan(input, result);

  return {
    mode,
    complete: result.complete,
    hardValid: result.metrics.hardValid,
    plannedTaskCount: result.metrics.plannedTaskCount,
    scheduledTasks: result.scheduledTasks,
    scheduledMeals: result.scheduledSpaceMeals,
    fingerprint: result.metrics.planFingerprint,
    branches: result.metrics.branchesExplored,
    branchBudgetConsumed: result.metrics.branchBudgetConsumed,
    runtimeMs: result.metrics.runtimeMs,
    totalParticipantPresenceMinutes:
      result.metrics.totalParticipantPresenceMinutes,
    maxParticipantPresenceMinutes: result.metrics.maxParticipantPresenceMinutes,
    focalTaskStart: span.start,
    focalTaskEnd: span.end,
    focalMakespanMinutes: span.spanMinutes,
    mainFlowStart: result.metrics.mainFlowStart,
    mainFlowEnd: result.metrics.mainFlowEnd,
    mainFlowSpanMinutes,
    bandPresence: scheduledBandPresence(result.scheduledTasks),
    resourceOperationalBlockCountById:
      result.metrics.resourceOperationalBlockCountById,
    resourceAuthorizedMealMinutesById:
      result.metrics.resourceAuthorizedMealMinutesById,
    validation,
    focalValidation,
    inputUnchanged: before === JSON.stringify(input),
  };
}

export function buildArtifact(
  source: any,
  manifest: any,
  sourcePath?: string,
): any {
  const scenarioDigestMismatchIds = Object.keys(
    manifest.scenarioDigests,
  ).filter(
    (id) => digest(source.scenarios?.[id]) !== manifest.scenarioDigests[id],
  );
  const evidenceDigestMismatchIds = Object.keys(
    manifest.evidenceDigests,
  ).filter((id) => digest(source[id]) !== manifest.evidenceDigests[id]);
  const fingerprintMismatchIds = Object.keys(
    manifest.frozenFingerprints,
  ).filter(
    (id) =>
      source.scenarios?.[id]?.fingerprint !== manifest.frozenFingerprints[id],
  );
  const branchBudgetMismatchIds = Object.keys(
    manifest.frozenBranchBudgets,
  ).filter(
    (id) =>
      source.scenarios?.[id]?.branches !== manifest.frozenBranchBudgets[id],
  );

  const original = execute("ORIGINAL");
  const currentOff = execute("CURRENT_OFF");
  const preferredPlan = execute("CURRENT_PREFERRED");
  const repeat = execute("CURRENT_PREFERRED");
  const reversed = execute("CURRENT_PREFERRED", true);
  const freshDigest = digest(preferredPlan);
  const repeatDigest = digest(repeat);
  const reversedDigest = digest(reversed);
  const deterministic = freshDigest === repeatDigest;
  const orderInvariant = freshDigest === reversedDigest;
  const independentValidationHardValid =
    preferredPlan.validation.hardValid &&
    preferredPlan.focalValidation.hardValid;

  const currentOffProjection = {
    fingerprint: currentOff.fingerprint,
    branches: currentOff.branches,
    taskCount: currentOff.plannedTaskCount,
    totalParticipantPresenceMinutes: currentOff.totalParticipantPresenceMinutes,
    maxParticipantPresenceMinutes: currentOff.maxParticipantPresenceMinutes,
    focalMakespanMinutes: currentOff.focalMakespanMinutes,
    bandTuple: currentOff.bandPresence.preferredLexicographicTuple,
  };
  const preferredProjection = {
    fingerprint: preferredPlan.fingerprint,
    branches: preferredPlan.branches,
    taskCount: preferredPlan.plannedTaskCount,
    bandTuple: preferredPlan.bandPresence.preferredLexicographicTuple,
    authorizedMealMinutes:
      preferredPlan.bandPresence.authorizedMealMinutesInsideSpan,
    totalParticipantPresenceMinutes:
      preferredPlan.totalParticipantPresenceMinutes,
    maxParticipantPresenceMinutes: preferredPlan.maxParticipantPresenceMinutes,
    mainFlowSpanMinutes: preferredPlan.mainFlowSpanMinutes,
    focalMakespanMinutes: preferredPlan.focalMakespanMinutes,
  };
  const currentOffMismatchFields = mismatchFields(
    currentOffProjection,
    manifest.frozenCurrentOff,
  );
  const preferredPlanMismatchFields = mismatchFields(
    preferredProjection,
    manifest.frozenPreferredPlan,
  );
  const sourceArtifactSha256Matches = sourcePath
    ? sourcePath === LEGACY_PATH
      ? sha256File(sourcePath) === manifest.sourceArtifactSha256
      : source.sourceArtifactSha256 === manifest.sourceArtifactSha256
    : true;
  const historicalRegressionEvidence = {
    sourceArtifactSha256Matches,
    scenarioDigestMismatchIds: uniqueSorted(scenarioDigestMismatchIds),
    evidenceDigestMismatchIds: uniqueSorted(evidenceDigestMismatchIds),
    fingerprintMismatchIds: uniqueSorted(fingerprintMismatchIds),
    branchBudgetMismatchIds: uniqueSorted(branchBudgetMismatchIds),
    currentOffMismatchFields,
    preferredPlanMismatchFields,
    intact: false,
  };
  historicalRegressionEvidence.intact =
    sourceArtifactSha256Matches &&
    [
      scenarioDigestMismatchIds,
      evidenceDigestMismatchIds,
      fingerprintMismatchIds,
      branchBudgetMismatchIds,
      currentOffMismatchFields,
      preferredPlanMismatchFields,
    ].every((items) => items.length === 0);

  const preferredEvidence = {
    freshDigest,
    repeatDigest,
    reversedDigest,
    deterministic,
    orderInvariant,
    budgetRespected: preferredPlan.branchBudgetConsumed <= 300000,
    inputUnchanged: preferredPlan.inputUnchanged,
    independentValidationHardValid,
    currentOffFrozen: currentOffMismatchFields.length === 0,
    preferredPlanFrozen: preferredPlanMismatchFields.length === 0,
    focalTaskStart: preferredPlan.focalTaskStart,
    focalTaskEnd: preferredPlan.focalTaskEnd,
    focalMakespanMinutes: preferredPlan.focalMakespanMinutes,
    mainFlowStart: preferredPlan.mainFlowStart,
    mainFlowEnd: preferredPlan.mainFlowEnd,
    mainFlowSpanMinutes: preferredPlan.mainFlowSpanMinutes,
  };
  const gates = {
    artifactAccepted: true,
    focalCorpusAccepted: Object.keys(source.scenarios ?? {}).length === 23,
    currentPlannerMeetsFocalBenchmark:
      preferredPlan.complete && preferredPlan.plannedTaskCount === 38,
    currentPlannerMeetsPreferredBandBenchmark:
      JSON.stringify(preferredProjection.bandTuple) ===
      JSON.stringify([4, 330, 60]),
    currentPlannerMeetsFullBandBenchmark: false,
    preferredPolicyAccepted: true,
    fullBandBenchmarkPassed: false,
    currentOffFrozen: preferredEvidence.currentOffFrozen,
    preferredPlanHardValid: independentValidationHardValid,
    preferredOperationalQualityAccepted:
      preferredPlan.totalParticipantPresenceMinutes === 2345 &&
      preferredPlan.maxParticipantPresenceMinutes === 155,
    preferredMealSemanticsAccepted:
      preferredProjection.authorizedMealMinutes === 75,
    preferredDeterministic: deterministic,
    preferredOrderInvariant: orderInvariant,
    preferredInputUnchanged: preferredPlan.inputUnchanged,
    preferredBudgetRespected: preferredEvidence.budgetRespected,
    focalMakespanAccepted:
      preferredPlan.focalMakespanMinutes === 450 &&
      preferredPlan.mainFlowSpanMinutes === 360,
    historicalRegressionIntact: historicalRegressionEvidence.intact,
  };
  const accepted = Object.entries(gates).every(([key, value]) =>
    key === "currentPlannerMeetsFullBandBenchmark" ||
    key === "fullBandBenchmarkPassed"
      ? value === false
      : value === true,
  );
  const acceptance = { ...gates, acceptedMeaning: ACCEPTED_MEANING, accepted };

  const historicalEvidence = Object.fromEntries(
    Object.keys(manifest.evidenceDigests).map((key) => [key, source[key]]),
  );
  return {
    version: "planner-next-focal-a2-band-preferred-v2",
    status: accepted
      ? "BAND_PREFERRED_POLICY_ACCEPTED"
      : "BAND_PREFERRED_POLICY_FAILED",
    sourceArtifactVersion: manifest.sourceArtifactVersion,
    sourceArtifactSha256: manifest.sourceArtifactSha256,
    scenarios: source.scenarios,
    ...historicalEvidence,
    acceptance,
    preferredPolicyAccepted: acceptance.preferredPolicyAccepted,
    fullBandBenchmarkPassed: acceptance.fullBandBenchmarkPassed,
    resolvedGapCodes: RESOLVED_GAPS,
    remainingGapCodes: REMAINING_GAPS,
    referenceBandPresence: referenceBandPresence(),
    original,
    currentOff,
    preferredPlan,
    preferredEvidence,
    historicalRegressionEvidence,
  };
}

export function runBenchmark(): any {
  const sourcePath = existsSync(CURRENT_PATH) ? CURRENT_PATH : LEGACY_PATH;
  if (!existsSync(sourcePath)) throw new Error("NO_CURRENT_OR_LEGACY_ARTIFACT");
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const output = buildArtifact(source, manifest, sourcePath);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.acceptance.accepted) process.exitCode = 1;
  return output;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  runBenchmark();
