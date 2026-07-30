import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { evaluateResourcePresence } from "../resourcePresence";
import { requiredContinuousResourceScenario, dividedRequiredSchedule } from "../scenarios/requiredContinuousResourceScenario";
import { validatePlan } from "../validate";
import { auditFocalA2RequiredFeasibility } from "./focal-a2/focalA2RequiredFeasibilityAudit";
import { buildRequiredCompositeBlocks, requiredCompositePositions } from "../requiredCompositeBlock";
import { FOCAL_A2_BAND_RESOURCE_ID, projectFocalA2BandProblem } from "./focal-a2/focalA2BandReference";

const LEGACY_PATH = "planner-next-focal-a2-band-required-audit-v2.json";
const CURRENT_PATH = "planner-next-focal-a2-band-required-audit-v3.json";
const MANIFEST_PATH = "engine/planner-next/benchmarks/focal-a2/focalA2BandRequiredCompositeV3HistoricalManifest.json";
export const ACCEPTED_MEANING = "Planner Next expresses and hard-validates REQUIRED continuous-resource concentration, completes feasible REQUIRED controls, rejects divided or impossible plans atomically, and proves that a single Band block is infeasible in the real Focal A2 corpus under its coach-block, feeder, availability, meal, and dependency constraints; PREFERRED remains the valid operational policy for this day, and main-flow instrument representation remains pending";
export const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).filter((k) => k !== "runtimeMs").sort().map((k) => [k, canonical(value[k])])) : value;
export const digest = (value: any) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const fileDigest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const reverse = (p: any) => ({ ...p, tasks: [...p.tasks].reverse(), participants: [...p.participants].reverse(), coaches: [...p.coaches].reverse(), spaces: [...p.spaces].reverse(), resources: [...p.resources].reverse() });
const execute = (mode: "ORIGINAL" | "CURRENT_OFF" | "CURRENT_PREFERRED" | "CURRENT_REQUIRED", reversed = false) => {
  const base = mode === "ORIGINAL" ? (awaitProblem()) : projectFocalA2BandProblem(mode);
  const problem = reversed ? reverse(base) : base, before = JSON.stringify(problem), result = planMainFlowAndFeeders(problem);
  return { mode, complete: result.complete, searchStopReason: result.metrics.searchStopReason, reasonCodes: result.metrics.reasonCodes,
    scheduledTasks: result.scheduledTasks, scheduledSetupPreparations: result.scheduledSetupPreparations, scheduledSpaceMeals: result.scheduledSpaceMeals,
    plannedTaskCount: result.metrics.plannedTaskCount, fingerprint: result.metrics.planFingerprint, branches: result.metrics.branchesExplored,
    branchBudgetConsumed: result.metrics.branchBudgetConsumed, runtimeMs: result.metrics.runtimeMs,
    totalParticipantPresenceMinutes: result.metrics.totalParticipantPresenceMinutes, maxParticipantPresenceMinutes: result.metrics.maxParticipantPresenceMinutes,
    mainFlowSpanMinutes: result.metrics.mainFlowStart == null || result.metrics.mainFlowEnd == null ? 0 : result.metrics.mainFlowEnd - result.metrics.mainFlowStart,
    resourceOperationalBlockCountById: result.metrics.resourceOperationalBlockCountById, resourceAuthorizedMealMinutesById: result.metrics.resourceAuthorizedMealMinutesById,
    hardValid: result.metrics.hardValid, inputUnchanged: before === JSON.stringify(problem) };
};
import { focalA2Problem } from "./focal-a2/focalA2Problem";
const awaitProblem = () => focalA2Problem();

function controls() {
  const feasibleProblem = requiredContinuousResourceScenario("FEASIBLE_CONTIGUOUS"), feasible = planMainFlowAndFeeders(feasibleProblem);
  const mealProblem = requiredContinuousResourceScenario("FEASIBLE_WITH_AUTHORIZED_MEAL"), meal = planMainFlowAndFeeders(mealProblem);
  const mealPresence = evaluateResourcePresence(mealProblem.resources.find((r) => r.id === "resource-one")!, meal.scheduledTasks, meal.scheduledSpaceMeals);
  const splitProblem = requiredContinuousResourceScenario("SPLIT_INVALID"), split = dividedRequiredSchedule(splitProblem);
  const splitValidation = validatePlan({ ...splitProblem, tasks: split.tasks }, split.tasks);
  const impossibleProblem = requiredContinuousResourceScenario("IMPOSSIBLE_ATOMIC"), impossible = planMainFlowAndFeeders(impossibleProblem);
  const multiProblem = requiredContinuousResourceScenario("MULTIPLE_REQUIRED_RESOURCES"), multi = planMainFlowAndFeeders(multiProblem);
  return {
    feasibleContiguous: { complete: feasible.complete, hardValid: feasible.metrics.hardValid, operationalBlockCount: feasible.metrics.resourceOperationalBlockCountById["resource-one"], accepted: feasible.complete && feasible.metrics.hardValid && feasible.metrics.resourceOperationalBlockCountById["resource-one"] === 1 },
    feasibleWithAuthorizedMeal: { complete: meal.complete, hardValid: meal.metrics.hardValid, ...mealPresence, accepted: meal.complete && mealPresence.operationalBlockCount === 1 && mealPresence.crossesAuthorizedMeal && mealPresence.internalGapMinutes === 0 },
    splitInvalid: { hardValid: splitValidation.hardValid, reasonCodes: splitValidation.reasonCodes, operationalBlockCount: evaluateResourcePresence(splitProblem.resources[0]!, split.tasks).operationalBlockCount, accepted: !splitValidation.hardValid && splitValidation.reasonCodes.includes("RESOURCE_REQUIRED_PRESENCE_VIOLATION:resource-one") },
    impossibleAtomic: { complete: impossible.complete, searchStopReason: impossible.metrics.searchStopReason, collectionsEmpty: impossible.scheduledTasks.length + impossible.scheduledSetupPreparations.length + impossible.scheduledSpaceMeals.length === 0, accepted: !impossible.complete && impossible.metrics.searchStopReason === "NO_COMPLETE_HARD_VALID_PLAN" && impossible.scheduledTasks.length === 0 },
    multipleRequiredResources: { complete: multi.complete, hardValid: multi.metrics.hardValid, operationalBlockCountById: multi.metrics.resourceOperationalBlockCountById, accepted: multi.complete && multi.metrics.hardValid && multiProblem.resources.every((r) => multi.metrics.resourceOperationalBlockCountById[r.id] === 1) },
  };
}

const mismatch = (actual: any, frozen: any) => Object.keys(frozen).filter((k) => JSON.stringify(actual[k]) !== JSON.stringify(frozen[k])).sort();
export function buildArtifact(source: any, manifest: any, sourcePath?: string) {
  const scenarioDigestMismatchIds = Object.keys(manifest.scenarioDigests).filter((id) => digest(source.scenarios?.[id]) !== manifest.scenarioDigests[id]);
  const evidenceDigestMismatchIds = Object.keys(manifest.evidenceDigests).filter((id) => digest(source[id]) !== manifest.evidenceDigests[id]);
  const fingerprintMismatchIds = Object.keys(manifest.frozenFingerprints).filter((id) => source.scenarios?.[id]?.fingerprint !== manifest.frozenFingerprints[id]);
  const branchBudgetMismatchIds = Object.keys(manifest.frozenBranchBudgets).filter((id) => source.scenarios?.[id]?.branches !== manifest.frozenBranchBudgets[id]);
  const original = execute("ORIGINAL"), currentOff = execute("CURRENT_OFF"), preferredPlan = execute("CURRENT_PREFERRED");
  const required = execute("CURRENT_REQUIRED"), repeat = execute("CURRENT_REQUIRED"), reversed = execute("CURRENT_REQUIRED", true);
  const currentOffProjection = { fingerprint: currentOff.fingerprint, branches: currentOff.branches, taskCount: currentOff.plannedTaskCount, totalParticipantPresenceMinutes: currentOff.totalParticipantPresenceMinutes, maxParticipantPresenceMinutes: currentOff.maxParticipantPresenceMinutes };
  const preferredProjection = { fingerprint: preferredPlan.fingerprint, branches: preferredPlan.branches, taskCount: preferredPlan.plannedTaskCount, totalParticipantPresenceMinutes: preferredPlan.totalParticipantPresenceMinutes, maxParticipantPresenceMinutes: preferredPlan.maxParticipantPresenceMinutes, mainFlowSpanMinutes: preferredPlan.mainFlowSpanMinutes };
  const requiredProjection = { complete: required.complete, fingerprint: required.fingerprint, branches: required.branches, searchStopReason: required.searchStopReason, plannedTaskCount: required.plannedTaskCount };
  const currentOffMismatchFields = mismatch(currentOffProjection, manifest.frozenCurrentOff), preferredPlanMismatchFields = mismatch(preferredProjection, manifest.frozenPreferredPlan), currentRequiredFailureMismatchFields = mismatch(requiredProjection, manifest.frozenCurrentRequiredFailure);
  const sourceArtifactSha256Matches = sourcePath === LEGACY_PATH ? fileDigest(sourcePath) === manifest.sourceArtifactSha256 : source.sourceArtifactSha256 === manifest.sourceArtifactSha256;
  const historicalRegressionEvidence: any = { sourceArtifactSha256Matches, scenarioDigestMismatchIds, evidenceDigestMismatchIds, fingerprintMismatchIds, branchBudgetMismatchIds, currentOffMismatchFields, preferredPlanMismatchFields, currentRequiredFailureMismatchFields, intact: false };
  historicalRegressionEvidence.intact = sourceArtifactSha256Matches && [scenarioDigestMismatchIds, evidenceDigestMismatchIds, fingerprintMismatchIds, branchBudgetMismatchIds, currentOffMismatchFields, preferredPlanMismatchFields, currentRequiredFailureMismatchFields].every((x) => x.length === 0);
  const requiredPolicyControls = controls();
  const certificateProblem = projectFocalA2BandProblem("CURRENT_REQUIRED"), certificateInput = JSON.stringify(certificateProblem);
  const certificate = auditFocalA2RequiredFeasibility({ problem: certificateProblem });
  const repeatedCertificate = auditFocalA2RequiredFeasibility({ problem: certificateProblem });
  const reversedCertificate = auditFocalA2RequiredFeasibility({ problem: reverse(certificateProblem) });
  const certificateRepeatDigest = digest(repeatedCertificate), certificateReversedDigest = digest(reversedCertificate);
  const certificateDeterministic = digest(certificate) === certificateRepeatDigest;
  const certificateOrderInvariant = digest(certificate) === certificateReversedDigest;
  const certificateInputUnchanged = certificateInput === JSON.stringify(certificateProblem) && certificate.inputUnchanged;
  const deterministic = digest(required) === digest(repeat), orderInvariant = digest(required) === digest(reversed);
  const atomic = required.scheduledTasks.length + required.scheduledSetupPreparations.length + required.scheduledSpaceMeals.length === 0;
  const multiProblem = requiredContinuousResourceScenario("MULTIPLE_REQUIRED_RESOURCES");
  const multiMains = multiProblem.tasks.filter((task) => task.kind === "main");
  const structural = requiredCompositePositions(buildRequiredCompositeBlocks(multiProblem, multiMains), multiMains,
    multiMains.map((task) => task.blockKey ?? ""), multiProblem.budget.maxPatterns);
  const homogeneousProblem = requiredContinuousResourceScenario("FEASIBLE_CONTIGUOUS");
  const homogeneousTemplate = homogeneousProblem.tasks.find((task) => task.kind === "main")!;
  const homogeneousMains = Array.from({ length: 10 }, (_, index) => ({ ...homogeneousTemplate,
    id: `homogeneous-main-${index}`, participantId: `homogeneous-participant-${index}`, duration: 30 }));
  const supportedHomogeneousDurationMinutes = buildRequiredCompositeBlocks(homogeneousProblem, homogeneousMains)[0]!.productiveDurationMinutes;
  const blockers = certificate.candidateWindows.flatMap((window: any) => window.blockers);
  const earliest = (taskId: string) => Math.min(...blockers.filter((blocker: any) => blocker.taskId === taskId).map((blocker: any) => blocker.earliestMainStart));
  const historicalRegressionIntact = historicalRegressionEvidence.intact;
  const compositeBlockAccepted = requiredPolicyControls.feasibleContiguous.accepted && requiredPolicyControls.multipleRequiredResources.accepted;
  const homogeneousMainDurationContractAccepted = supportedHomogeneousDurationMinutes === 300;
  const structuralEnumerationBounded = structural.rawCombinationCount <= multiProblem.budget.maxPatterns && !structural.exhausted;
  const certificateTransitionMarginsAccepted = earliest("main-marta-fonrali") === 855 && earliest("main-pere-portero") === 915;
  const currentOffFrozen = currentOffMismatchFields.length === 0, currentPreferredFrozen = preferredPlanMismatchFields.length === 0;
  const currentRequiredAtomic = !required.complete && !required.hardValid && atomic && required.fingerprint === manifest.frozenCurrentRequiredFailure.fingerprint && required.branches <= 1909;
  const fullBandBenchmarkPassed = false;
  const accepted = compositeBlockAccepted && homogeneousMainDurationContractAccepted && structuralEnumerationBounded
    && certificateTransitionMarginsAccepted && certificateDeterministic && certificateOrderInvariant && certificateInputUnchanged
    && historicalRegressionIntact && currentOffFrozen && currentPreferredFrozen && currentRequiredAtomic && deterministic && orderInvariant;
  const acceptance = { compositeBlockAccepted, homogeneousMainDurationContractAccepted, structuralEnumerationBounded,
    certificateTransitionMarginsAccepted, certificateDeterministic, certificateOrderInvariant, historicalRegressionIntact,
    currentOffFrozen, currentPreferredFrozen, currentRequiredAtomic, fullBandBenchmarkPassed, acceptedMeaning: ACCEPTED_MEANING, accepted };
  const scenarios = Object.fromEntries(Object.keys(manifest.scenarioDigests).map((id) => [id, source.scenarios[id]]));
  scenarios.focalA2BandRequiredCompositeFoundationRepair = {
    supportedHomogeneousDurationMinutes,
    structuralLimit: multiProblem.budget.maxPatterns, rawCombinationCount: structural.rawCombinationCount,
    compatibleCombinationCount: structural.compatibleCombinationCount, evaluatedCombinationCount: structural.rawCombinationCount,
    exhausted: structural.exhausted, martaEarliestMainStart: earliest("main-marta-fonrali"), pereEarliestMainStart: earliest("main-pere-portero"),
    certificateRepeatDigest, certificateReversedDigest, currentRequiredResult: required.searchStopReason,
    branches: required.branches, runtimeMs: required.runtimeMs,
  };
  const historicalEvidence = Object.fromEntries(Object.keys(manifest.evidenceDigests).map((id) => [id, source[id]]));
  return { version: "planner-next-focal-a2-band-required-audit-v3", status: accepted ? "BAND_REQUIRED_COMPOSITE_FOUNDATION_ACCEPTED" : "BAND_REQUIRED_COMPOSITE_FOUNDATION_FAILED",
    sourceArtifactVersion: manifest.sourceArtifactVersion, sourceArtifactSha256: manifest.sourceArtifactSha256, scenarios, ...historicalEvidence,
    acceptance, currentOff, preferredPlan, currentRequiredFailure: required,
    requiredPolicyControls, focalRequiredFeasibilityEvidence: { certificate, certificateRepeatDigest, certificateReversedDigest, certificateDeterministic, certificateOrderInvariant, certificateInputUnchanged, atomic }, historicalRegressionEvidence,
    original, resolvedGapCodes: ["AUTHORIZED_SPACE_MEAL_COUNTED_AS_RESOURCE_GAP", "RESOURCE_PRESENCE_SCORING_IGNORES_BLOCK_COUNT_PRIORITY", "REQUIRED_RESOURCE_PRESENCE_NOT_HARD_VALIDATED", "OFF_PREFERRED_REQUIRED_POLICY_NOT_EXPRESSIBLE"], remainingGapCodes: ["MAIN_FLOW_INSTRUMENT_REQUIREMENT_NOT_REPRESENTABLE"] };
}

export function runBenchmark() {
  const sourcePath = existsSync(CURRENT_PATH) ? CURRENT_PATH : LEGACY_PATH;
  if (!existsSync(sourcePath)) throw new Error("NO_CURRENT_OR_LEGACY_ARTIFACT");
  const output = buildArtifact(JSON.parse(readFileSync(sourcePath, "utf8")), JSON.parse(readFileSync(MANIFEST_PATH, "utf8")), sourcePath);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.acceptance.accepted) process.exitCode = 1;
  return output;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runBenchmark();
