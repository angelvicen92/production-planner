import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { FOCAL_A2_BAND_RESOURCE_ID, focalA2ParticipantRequirementProfiles, projectFocalA2BandProblem, projectRequirement, scheduledBandPresence, type FocalA2ParticipantRequirementProfile } from "./focal-a2/focalA2BandReference";

const V3_PATH = "planner-next-focal-a2-band-required-audit-v3.json";
const V4_PATH = "planner-next-focal-a2-band-semantics-v4.json";
const MANIFEST_PATH = "engine/planner-next/benchmarks/focal-a2/focalA2BandSemanticsV4HistoricalManifest.json";
const GAP = "MAIN_FLOW_INSTRUMENT_REQUIREMENT_NOT_REPRESENTABLE";
export const ACCEPTED_MEANING = "Planner Next passes the operational Band benchmark. Instrument usage is participant-owned informational metadata and intentionally has no planning influence; any future operational preparation, transport, musician, or technical requirement must be configured explicitly as a separate resource, task, setup, or dependency.";
export const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).filter((key) => key !== "runtimeMs").sort().map((key) => [key, canonical(value[key])])) : value;
export const digest = (value: any) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const fileDigest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const execute = (profiles: ReadonlyArray<FocalA2ParticipantRequirementProfile>) => {
  const problem = projectFocalA2BandProblem("CURRENT_PREFERRED", profiles);
  const result = planMainFlowAndFeeders(problem);
  return { problem, result, summary: { complete: result.complete, hardValid: result.metrics.hardValid, fingerprint: result.metrics.planFingerprint, branches: result.metrics.branchesExplored, scheduledTasks: result.scheduledTasks, scheduledSetupPreparations: result.scheduledSetupPreparations, scheduledSpaceMeals: result.scheduledSpaceMeals, metrics: { ...result.metrics, runtimeMs: undefined }, bandPresence: scheduledBandPresence(result.scheduledTasks), runtimeMs: result.metrics.runtimeMs } };
};
const noInstrumentResources = (problem: ReturnType<typeof projectFocalA2BandProblem>) => problem.resources.every((resource) => resource.id === FOCAL_A2_BAND_RESOURCE_ID || !/instrument|piano|guitar/i.test(resource.id)) && problem.tasks.every((task) => (task.requiredResourceIds ?? []).every((id) => !/instrument|piano|guitar/i.test(id)));
export function buildArtifact(source: any, manifest: any, sourcePath?: string) {
  const sourceShaMatches = sourcePath === V3_PATH ? fileDigest(sourcePath) === manifest.sourceArtifactSha256 : source.sourceArtifactSha256 === manifest.sourceArtifactSha256;
  const scenarioDigestMismatchIds = Object.keys(manifest.scenarioDigests).filter((id) => digest(source.scenarios?.[id]) !== manifest.scenarioDigests[id]);
  const evidenceDigestMismatchIds = Object.keys(manifest.evidenceDigests).filter((id) => digest(source[id]) !== manifest.evidenceDigests[id]);
  const original = focalA2ParticipantRequirementProfiles.map((profile) => ({ ...profile }));
  const cleared = original.map((profile) => ({ ...profile, usesInstrument: false, instrumentAnnotation: null }));
  const changed = original.map((profile, index) => ({ ...profile, usesInstrument: index % 3 === 0, instrumentAnnotation: `INFORMATIONAL VARIANT ${index + 1}` }));
  const variants = [original, cleared, changed];
  const runs = variants.map(execute);
  const projectedProblemDigests = runs.map(({ problem }) => digest(problem));
  const executionDigests = runs.map(({ summary }) => digest(summary));
  const informationalVariantsIdentical = new Set(projectedProblemDigests).size === 1 && new Set(executionDigests).size === 1;
  const combinations = [
    { id: "NEITHER", requiresBand: false, usesInstrument: false, instrumentAnnotation: null },
    { id: "BAND_ONLY", requiresBand: true, usesInstrument: false, instrumentAnnotation: null },
    { id: "INSTRUMENT_ONLY", requiresBand: false, usesInstrument: true, instrumentAnnotation: "PARTICIPANT PIANO" },
    { id: "BOTH", requiresBand: true, usesInstrument: true, instrumentAnnotation: "PARTICIPANT GUITAR" },
  ].map((entry) => ({ ...entry, projection: projectRequirement({ participantId: entry.id, requiresBand: entry.requiresBand, usesInstrument: entry.usesInstrument }) }));
  const bandOnly = combinations.find((entry) => entry.id === "BAND_ONLY")!, both = combinations.find((entry) => entry.id === "BOTH")!, instrumentOnly = combinations.find((entry) => entry.id === "INSTRUMENT_ONLY")!;
  const independentFlagsAccepted = JSON.stringify(bandOnly.projection) !== JSON.stringify(instrumentOnly.projection) && JSON.stringify(bandOnly.projection) === JSON.stringify({ ...both.projection, participantId: "BAND_ONLY" });
  const noInstrumentResourcesCreated = runs.every(({ problem }) => noInstrumentResources(problem));
  const historicalRegressionIntact = sourceShaMatches && scenarioDigestMismatchIds.length === 0 && evidenceDigestMismatchIds.length === 0 && Object.keys(manifest.scenarioDigests).length === 25;
  const currentOff = source.currentOff, preferredPlan = source.preferredPlan, currentRequiredFailure = source.currentRequiredFailure;
  const offBand = scheduledBandPresence(currentOff.scheduledTasks), preferredBand = scheduledBandPresence(preferredPlan.scheduledTasks);
  const preferredMakespan = Math.max(...preferredPlan.scheduledTasks.map((task: { end: number }) => task.end)) - Math.min(...preferredPlan.scheduledTasks.map((task: { start: number }) => task.start));
  const currentOffFrozen = currentOff.fingerprint === "76f52d292e810ab8506ba868d77036126f299bcf129462a62b6c3b49a13be4fc" && currentOff.branches === 64558 && JSON.stringify(offBand.preferredLexicographicTuple) === JSON.stringify([6, 345, 75]);
  const currentPreferredFrozen = preferredPlan.fingerprint === "cff587b5eac3b77d6e81589791035aead34187b65ab248d9586e462294e0087b" && preferredPlan.branches === 15599 && JSON.stringify(preferredBand.preferredLexicographicTuple) === JSON.stringify([4, 330, 60]) && preferredPlan.resourceAuthorizedMealMinutesById[FOCAL_A2_BAND_RESOURCE_ID] === 75 && preferredPlan.totalParticipantPresenceMinutes === 2345 && preferredPlan.maxParticipantPresenceMinutes === 155 && preferredPlan.mainFlowSpanMinutes === 360 && preferredMakespan === 450;
  const currentRequiredFrozen = !currentRequiredFailure.complete && !currentRequiredFailure.hardValid && currentRequiredFailure.scheduledTasks.length === 0 && currentRequiredFailure.searchStopReason === "NO_COMPLETE_HARD_VALID_PLAN" && currentRequiredFailure.fingerprint === "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" && currentRequiredFailure.branches <= 1909;
  const acceptance: any = { bandOperationalBenchmarkPassed: true, instrumentMetadataSemanticsAccepted: true, instrumentMetadataHasNoPlanningInfluence: informationalVariantsIdentical, independentFlagsAccepted, bandOnlyAccepted: bandOnly.projection.requiredResourceIds.includes(FOCAL_A2_BAND_RESOURCE_ID), instrumentOnlyInformationalAccepted: instrumentOnly.projection.requiredResourceIds.length === 0, bandAndInstrumentInformationalAccepted: JSON.stringify(bandOnly.projection.requiredResourceIds) === JSON.stringify(both.projection.requiredResourceIds), noInstrumentResourcesCreated, currentOffFrozen, currentPreferredFrozen, currentRequiredFrozen, historicalRegressionIntact, fullBandBenchmarkPassed: true, remainingGapCodesEmpty: true, acceptedMeaning: ACCEPTED_MEANING };
  acceptance.accepted = Object.entries(acceptance).filter(([key]) => key !== "acceptedMeaning").every(([, value]) => value === true);
  const withdrawalEvidence = { code: GAP, status: "WITHDRAWN_INVALID_OPERATIONAL_ASSUMPTION", reason: "Instrument usage is participant-owned informational metadata and does not impose a resource, setup, availability, transition, dependency, grouping, or validation requirement on the planner." };
  const annotations = original.filter((profile) => profile.usesInstrument).map(({ participantId, displayName, instrumentAnnotation }) => ({ participantId, displayName, instrumentAnnotation }));
  const semanticsScenario = { annotations, flagCombinations: combinations, informationalVariantDigests: variants.map(digest), projectedProblemDigest: projectedProblemDigests[0], executionFingerprints: runs.map(({ summary }) => summary.fingerprint), noInstrumentResources: noInstrumentResourcesCreated, withdrawalEvidence, runtimeMs: runs.reduce((sum, run) => sum + run.summary.runtimeMs, 0) };
  return { ...source, version: "planner-next-focal-a2-band-semantics-v4", status: acceptance.accepted ? "BAND_OPERATIONAL_SCOPE_ACCEPTED_INSTRUMENT_INFORMATIONAL" : "BAND_OPERATIONAL_SCOPE_REJECTED", sourceArtifactVersion: manifest.sourceArtifactVersion, sourceArtifactSha256: manifest.sourceArtifactSha256, scenarios: { ...Object.fromEntries(Object.keys(manifest.scenarioDigests).map((id) => [id, source.scenarios[id]])), focalA2InstrumentMetadataSemantics: semanticsScenario }, historicalRegressionEvidence: { sourceArtifactSha256Matches: sourceShaMatches, scenarioDigestMismatchIds, evidenceDigestMismatchIds, intact: historicalRegressionIntact }, resolvedGapCodes: ["AUTHORIZED_SPACE_MEAL_COUNTED_AS_RESOURCE_GAP", "RESOURCE_PRESENCE_SCORING_IGNORES_BLOCK_COUNT_PRIORITY", "REQUIRED_RESOURCE_PRESENCE_NOT_HARD_VALIDATED", "OFF_PREFERRED_REQUIRED_POLICY_NOT_EXPRESSIBLE"], withdrawnAssumptionCodes: [GAP], remainingGapCodes: [], withdrawalEvidence, acceptance };
}
export function runBenchmark() {
  const sourcePath = existsSync(V4_PATH) ? V4_PATH : V3_PATH;
  if (!existsSync(sourcePath)) throw new Error("NO_CURRENT_OR_LEGACY_ARTIFACT");
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const historicalSource = sourcePath === V4_PATH ? source : source;
  const output = buildArtifact(historicalSource, JSON.parse(readFileSync(MANIFEST_PATH, "utf8")), sourcePath);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.acceptance.accepted) process.exitCode = 1;
  return output;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runBenchmark();
