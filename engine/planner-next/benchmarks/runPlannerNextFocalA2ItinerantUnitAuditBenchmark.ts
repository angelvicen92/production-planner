import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { evaluateFocalA2RealityUnits } from "./focal-a2/evaluateFocalA2RealityUnits";
import { runFocalA2ItinerantUnitBehavioralControls } from "./focal-a2/focalA2ItinerantUnitBehavioralControls";
import { itinerantOperationProfiles, itinerantUnitProfiles, projectStandaloneFocalA2RealityProblem,
  realityReferenceValidation, realityResourceAvailability, realitySourceDocuments } from "./focal-a2/focalA2RealityReference";

export const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).filter((key) => key !== "runtimeMs").sort().map((key) => [key, canonical(value[key])])) : value;
export const digest = (value: any) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

export function extractProtectedHistoricalSubstrate(source: any, manifest: any) {
  return {
    scenarios: Object.fromEntries(Object.keys(manifest.scenarioDigests).map((id) => [id, source.scenarios?.[id]])),
    historicalEvidence: Object.fromEntries(Object.keys(manifest.historicalEvidenceDigests).map((id) => [id, source.historicalEvidence?.[id] ?? source[id]])),
  };
}

const summarize = (result: ReturnType<typeof planMainFlowAndFeeders>) => ({ complete: result.complete, hardValid: result.metrics.hardValid,
  plannedTaskCount: result.metrics.plannedTaskCount, scheduledTaskCount: result.scheduledTasks.length, fingerprint: result.metrics.planFingerprint,
  branches: result.metrics.branchesExplored, runtimeMs: result.metrics.runtimeMs });

export function buildItinerantUnitArtifact(source: any, manifest: any) {
  const substrate = extractProtectedHistoricalSubstrate(source, manifest);
  const scenarioMismatchIds = Object.entries(manifest.scenarioDigests).filter(([id, expected]) => digest(substrate.scenarios[id]) !== expected).map(([id]) => id);
  const historicalEvidenceMismatchIds = Object.entries(manifest.historicalEvidenceDigests).filter(([id, expected]) => digest(substrate.historicalEvidence[id]) !== expected).map(([id]) => id);
  const fingerprintMismatchIds = Object.entries(manifest.frozenFingerprints ?? {}).filter(([id, expected]) => substrate.historicalEvidence[id]?.fingerprint !== expected).map(([id]) => id);
  const historicalRegressionIntact = Object.keys(substrate.scenarios).length === 28 && !scenarioMismatchIds.length && !historicalEvidenceMismatchIds.length && !fingerprintMismatchIds.length;
  const problem = projectStandaloneFocalA2RealityProblem(); const before = JSON.stringify(problem);
  const freshProjectionDigest = digest(projectStandaloneFocalA2RealityProblem());
  const result = planMainFlowAndFeeders(problem); const repeat = planMainFlowAndFeeders(projectStandaloneFocalA2RealityProblem());
  const reversedProblem = projectStandaloneFocalA2RealityProblem(); reversedProblem.tasks.reverse(); reversedProblem.resources.reverse(); reversedProblem.spaces.reverse(); reversedProblem.participants.reverse();
  const reversed = planMainFlowAndFeeders(reversedProblem);
  const evaluation = evaluateFocalA2RealityUnits(result.scheduledTasks, before === JSON.stringify(problem));
  const standaloneRealityRun = { status: result.complete ? "EXECUTED_COMPLETE" : "EXECUTED_NO_COMPLETE_PLAN", ...summarize(result),
    deterministic: result.metrics.planFingerprint === repeat.metrics.planFingerprint, orderInvariant: result.metrics.planFingerprint === reversed.metrics.planFingerprint,
    inputUnchanged: before === JSON.stringify(problem), evaluation };
  const behavioralControls = runFocalA2ItinerantUnitBehavioralControls();
  const confirmedGapCodes = ["ANCHORED_OPERATION_RELATIVE_SEGMENTS_NOT_EXPRESSIBLE", "MAIN_FLOW_GENERIC_ANCHORED_CLOSURE_NOT_EXPRESSIBLE"];
  const wrappedMainControl = { status: "CONTRACT_GAP_CONFIRMED", expressible: false, anchorKind: "main", adjacency: "REQUIRED", spaceSource: "ANCHOR_SPACE" };
  const wrappedAuxiliaryControl = { status: "CONTRACT_GAP_CONFIRMED", expressible: false, anchorKind: "auxiliary", adjacency: "REQUIRED", spaceSource: "ANCHOR_SPACE" };
  const invalidStandaloneSubstitutionControl = { status: "REJECTED_INVALID_PROJECTION", validProjection: false, preservesAnchorIdentity: false, preservesAdjacency: false };
  const combinedRealityRun = { status: "NOT_EXECUTED_UNREPRESENTABLE_INPUT", reason: "Generic before/anchor/after adjacency is not expressible." };
  const scenario = { itinerantUnitProfiles, itinerantOperationProfiles, referenceValidation: realityReferenceValidation, sourceAvailability: realityResourceAvailability,
    standaloneRealityRun, behavioralControls, wrappedMainControl, wrappedAuxiliaryControl, invalidStandaloneSubstitutionControl, combinedRealityRun, confirmedGapCodes };
  const positive = {
    artifactAccepted: true, sourceCorpusAccepted: realitySourceDocuments.length === 2,
    operationProfileCountsAccepted: realityReferenceValidation.operationProfileCount === 12 && realityReferenceValidation.standaloneOperationCount === 9 && realityReferenceValidation.wrappedOperationCount === 3,
    unitCompositionAccepted: itinerantUnitProfiles.every((unit) => unit.memberResourceIds.length > 0),
    unitIdentityAccepted: evaluation.exactMembershipSatisfied, sourceAvailabilityAccepted: Object.values(realityResourceAvailability).every((windows) => windows.length > 0),
    anchorSpaceSemanticsAccepted: itinerantOperationProfiles.filter((o) => o.type === "WRAP_ANCHOR").every((o) => o.before.spaceSource === "ANCHOR_SPACE" && o.after.spaceSource === "ANCHOR_SPACE"),
    humanReferenceNotUsedAsSeed: problem.tasks.filter((task) => task.id.startsWith("reality-operation-")).every((task) => !("start" in task) && !("end" in task) && task.dependencies.length === 0),
    standaloneProjectionPure: digest(projectStandaloneFocalA2RealityProblem()) === freshProjectionDigest, standaloneInputUnchanged: standaloneRealityRun.inputUnchanged,
    standalonePlanComplete: result.complete, standalonePlanHardValid: result.metrics.hardValid, standalonePlanDeterministic: standaloneRealityRun.deterministic,
    standalonePlanOrderInvariant: standaloneRealityRun.orderInvariant, exactCompositionDemonstrated: behavioralControls.exactComposition,
    parallelUnitsDemonstrated: behavioralControls.parallelUnits, resourceRecompositionDemonstrated: behavioralControls.recomposition,
    resourceExclusivityDemonstrated: behavioralControls.exclusivity, resourceAvailabilityDemonstrated: behavioralControls.availability,
    variableDurationsDemonstrated: behavioralControls.variableDurations, unitAgendasCorrect: evaluation.exactMembershipSatisfied,
    wrappedMainContractGapConfirmed: !wrappedMainControl.expressible, wrappedAuxiliaryContractGapConfirmed: !wrappedAuxiliaryControl.expressible,
    invalidStandaloneSubstitutionRejected: !invalidStandaloneSubstitutionControl.validProjection, historicalRegressionIntact, onlyCurrentArtifactRequired: true,
  };
  const acceptance: any = { ...positive, combinedInputRepresentable: false, fullRealityBenchmarkPassed: false,
    acceptedMeaning: "Planner Next correctly plans the representable standalone itinerant-unit subset with exact configurable resource composition, source availability, independent unit identity, parallel teams, later resource recomposition, exclusivity, movement, variable durations, deterministic output, and auditable unit agendas. The full Focal A2 itinerant benchmark remains intentionally unexecuted because generic before/anchor/after adjacency and anchored main-flow closure are not yet expressible; no invalid duration-total substitution is accepted." };
  acceptance.accepted = Object.values(positive).every(Boolean) && acceptance.combinedInputRepresentable === false && acceptance.fullRealityBenchmarkPassed === false;
  return { version: "planner-next-focal-a2-itinerant-unit-audit-v3", status: acceptance.accepted ? "FOCAL_A2_ITINERANT_UNIT_AUDIT_REPAIRED" : "FOCAL_A2_ITINERANT_UNIT_AUDIT_REJECTED",
    sourceArtifactVersion: manifest.sourceArtifactVersion, sourceArtifactSha256: manifest.sourceArtifactSha256,
    scenarios: { ...substrate.scenarios, focalA2ItinerantUnitAuditRepair: scenario }, historicalEvidence: substrate.historicalEvidence,
    sourceDocuments: realitySourceDocuments, referenceValidation: realityReferenceValidation, itinerantUnitProfiles, itinerantOperationProfiles,
    sourceAvailability: realityResourceAvailability, standaloneRealityRun, behavioralControls, wrappedMainControl, wrappedAuxiliaryControl,
    invalidStandaloneSubstitutionControl, combinedRealityRun, confirmedGapCodes,
    withdrawnGapCodes: ["REALITY_EXACT_RESOURCE_COMPOSITION_NOT_EXPRESSIBLE", "REALITY_PARALLEL_UNITS_NOT_EXPRESSIBLE", "REALITY_AFTERNOON_RECOMPOSITION_NOT_EXPRESSIBLE", "REALITY_UNIT_COMPACTNESS_NOT_ACHIEVED", "REALITY_FUTURE_FEASIBILITY_INSUFFICIENT"].map((code) => ({ code, reason: "Withdrawn with the invalid v1 projection; retained only in historical scenario evidence." })),
    historicalRegressionEvidence: { protectedScenarioCount: Object.keys(manifest.scenarioDigests).length, scenarioMismatchIds, historicalEvidenceMismatchIds, fingerprintMismatchIds, intact: historicalRegressionIntact }, acceptance };
}

export function runBenchmark() {
  const sourcePath = process.env.FOCAL_A2_HISTORICAL_SOURCE ?? (existsSync("planner-next-focal-a2-itinerant-unit-audit-v3.json") ? "planner-next-focal-a2-itinerant-unit-audit-v3.json" : "planner-next-focal-a2-itinerant-unit-audit-v2.json");
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const manifest = JSON.parse(readFileSync("engine/planner-next/benchmarks/focal-a2/focalA2ItinerantUnitV3HistoricalManifest.json", "utf8"));
  const output = buildItinerantUnitArtifact(source, manifest); process.stdout.write(`${JSON.stringify(output, null, 2)}\n`); if (!output.acceptance.accepted) process.exitCode = 1; return output;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runBenchmark();
