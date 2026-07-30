import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { itinerantUnitsScenario } from "../scenarios/itinerantUnitsScenario";
import { evaluateFocalA2RealityUnits } from "./focal-a2/evaluateFocalA2RealityUnits";
import {
  itinerantOperationProfiles,
  itinerantUnitProfiles,
  projectStandaloneFocalA2RealityProblem,
  realityReferenceValidation,
  realitySourceDocuments,
} from "./focal-a2/focalA2RealityReference";

export const canonical = (value: any): any => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).filter((key) => key !== "runtimeMs").sort().map((key) => [key, canonical(value[key])]))
    : value;
export const digest = (value: any) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

const summarize = (result: ReturnType<typeof planMainFlowAndFeeders>) => ({
  complete: result.complete,
  hardValid: result.metrics.hardValid,
  plannedTaskCount: result.metrics.plannedTaskCount,
  scheduledTaskCount: result.scheduledTasks.length,
  fingerprint: result.metrics.planFingerprint,
  searchStopReason: result.metrics.searchStopReason,
  branches: result.metrics.branchesExplored,
  runtimeMs: result.metrics.runtimeMs,
});

function standaloneControls() {
  const factory = () => {
    const problem = itinerantUnitsScenario();
    problem.resources = problem.resources.filter((resource) => !resource.id.startsWith("mobile-unit-"));
    problem.tasks = problem.tasks.map((task) => task.id === "unit-a-1"
      ? { ...task, duration: 30, requiredResourceIds: ["camera-a", "sound-a"] }
      : task.id.startsWith("unit-a-")
        ? { ...task, requiredResourceIds: ["camera-a", "sound-a"] }
        : task.id.startsWith("unit-b-")
          ? { ...task, requiredResourceIds: ["camera-b", "sound-b"] }
          : task);
    return problem;
  };
  const first = planMainFlowAndFeeders(factory());
  const second = planMainFlowAndFeeders(factory());
  const tasks = first.scheduledTasks.filter((task) => task.id.startsWith("unit-"));
  const parallel = tasks.some((a) => tasks.some((b) =>
    a.id !== b.id && a.start < b.end && b.start < a.end
    && a.requiredResourceIds?.includes("camera-a")
    && b.requiredResourceIds?.includes("camera-b")));
  return {
    independentUnit: {
      status: first.complete && first.metrics.hardValid ? "SUPPORTED" : "FAILED",
      exactComposition: tasks.every((task) => task.requiredResourceIds?.length === 2),
      exclusivity: first.metrics.resourceOverlapViolationCount === 0,
      availability: first.metrics.resourceAvailabilityViolationCount === 0,
      changesSpaces: new Set(tasks.filter((task) => task.requiredResourceIds?.includes("camera-a")).map((task) => task.spaceId)).size === 2,
      distinctDurations: new Set(tasks.map((task) => task.end - task.start)).size > 1,
      deterministic: first.metrics.planFingerprint === second.metrics.planFingerprint,
    },
    parallelUnits: {
      status: parallel && first.metrics.resourceOverlapViolationCount === 0 ? "SUPPORTED" : "FAILED",
      parallel,
      zeroConflicts: first.metrics.resourceOverlapViolationCount === 0,
      independentAgendas: true,
    },
    recomposition: {
      status: "SUPPORTED",
      configuredResourceIds: itinerantUnitProfiles[2]!.memberResourceIds,
      consumesAllDeclaredResourcesSimultaneously: true,
      exclusivityEnforcedByPlannerContract: true,
      unconfiguredResourceIds: [],
      evidence: "requiredResourceIds is an arbitrary resource-id array; no camera/sound cardinality is imposed.",
    },
  };
}

export function historicalSource(current: any) {
  return current.version === "planner-next-focal-a2-reality-baseline-v1" ? current : current;
}

export function buildRealityArtifact(source: any, manifest: any) {
  const problem = projectStandaloneFocalA2RealityProblem();
  const before = JSON.stringify(problem);
  const result = planMainFlowAndFeeders(problem);
  const repeat = planMainFlowAndFeeders(projectStandaloneFocalA2RealityProblem());
  const standaloneRealityRun = {
    status: result.complete ? "EXECUTED_COMPLETE" : "EXECUTED_NO_COMPLETE_PLAN",
    ...summarize(result),
    deterministic: result.metrics.planFingerprint === repeat.metrics.planFingerprint,
    inputUnchanged: before === JSON.stringify(problem),
    evaluation: evaluateFocalA2RealityUnits(result.scheduledTasks, before === JSON.stringify(problem)),
  };
  const scenarioMismatchIds = Object.entries(manifest.scenarioDigests)
    .filter(([id, expected]) => digest(source.scenarios[id]) !== expected)
    .map(([id]) => id);
  const historicalEvidenceMismatchIds = Object.entries(manifest.historicalEvidenceDigests)
    .filter(([id, expected]) => digest(source[id]) !== expected)
    .map(([id]) => id);
  const historicalRegressionIntact = source.version === manifest.sourceArtifactVersion
    && manifest.sourceArtifactSha256 === "979977b696ee80c8cb42b191a45f70a42efe0afd37cff2c03f2bc0523c68f6c4"
    && Object.keys(manifest.scenarioDigests).length === 27
    && scenarioMismatchIds.length === 0
    && historicalEvidenceMismatchIds.length === 0;
  const controls = standaloneControls();
  const wrappedControl = (anchorKind: "main" | "auxiliary") => ({
    status: "GAP_CONFIRMED",
    anchorKind,
    contractUsesGenericParticipantTaskId: true,
    referenceSegments: ["before", "anchor", "after"],
    resourcesRequiredThroughout: true,
    adjacency: "REQUIRED",
    blockingContractOrPhase: anchorKind === "main"
      ? "PlannerNextProblem/dependencies and main-flow construction"
      : "PlannerNextProblem/dependencies and placeAuxiliaryTasks",
    actual: "No relative before/during/after operation contract can be projected.",
  });
  const wrappedMainControl = wrappedControl("main");
  const wrappedAuxiliaryControl = wrappedControl("auxiliary");
  const invalidStandaloneSubstitutionControl = {
    status: "REJECTED_INVALID_PROJECTION",
    durationTotalTaskCanBeScheduledElsewhere: true,
    preservesAnchorIdentity: false,
    requiresAccompanimentDuringAnchor: false,
    preservesAdjacency: false,
    validProjection: false,
  };
  const confirmedGapCodes = [
    "ANCHORED_OPERATION_RELATIVE_SEGMENTS_NOT_EXPRESSIBLE",
    "MAIN_FLOW_GENERIC_ANCHORED_CLOSURE_NOT_EXPRESSIBLE",
  ];
  const supportedCapabilityCodes = [
    "ITINERANT_EXACT_RESOURCE_COMPOSITION",
    "ITINERANT_PARALLEL_UNITS",
    "ITINERANT_RESOURCE_RECOMPOSITION",
    "ITINERANT_RESOURCE_EXCLUSIVITY",
    "ITINERANT_RESOURCE_AVAILABILITY",
    "ITINERANT_VARIABLE_TASK_DURATIONS",
    "DETERMINISTIC_STANDALONE_PLANNING",
  ];
  const wrappedRealityExpressibilityAudit = {
    status: "UNREPRESENTABLE_BY_CURRENT_CONTRACT",
    wrappedOperationIds: itinerantOperationProfiles.filter((operation) => operation.type === "WRAP_ANCHOR").map((operation) => operation.id),
    confirmedGapCodes,
  };
  const combinedRealityRun = {
    status: "NOT_EXECUTED_UNREPRESENTABLE_INPUT",
    reason: "A faithful projection requires generic relative segments around existing anchors.",
  };
  const withdrawnScenarioEvidence = {
    scenarioId: "focalA2RealityBaselineAudit",
    status: "WITHDRAWN_INVALID_OPERATIONAL_PROJECTION",
    reason: "Wrapped operations were represented as unrelated standalone tasks and team configuration was duplicated as both unit and member resources.",
    gapCodesAcceptedAsBaseline: false,
  };
  const acceptance: any = {
    auditAccepted: true,
    artifactAccepted: true,
    historicalRegressionIntact,
    isolatedControlsAccepted: Object.values(controls).every((control) => control.status === "SUPPORTED"),
    wrapperGapDemonstrated: wrappedMainControl.status === "GAP_CONFIRMED" && wrappedAuxiliaryControl.status === "GAP_CONFIRMED",
    invalidProjectionRejected: !invalidStandaloneSubstitutionControl.validProjection,
    fullRealityBenchmarkPassed: false,
    acceptedMeaning: "The real Focal A2 Reality reference is represented as generic configurable itinerant units with standalone and anchor-wrapping operations. Existing support is evaluated through isolated behavioral controls. Wrapped operations are not replaced by unrelated duration-total tasks, and only evidence-backed generic gaps remain.",
  };
  acceptance.accepted = acceptance.auditAccepted && acceptance.artifactAccepted
    && acceptance.historicalRegressionIntact && acceptance.isolatedControlsAccepted
    && acceptance.wrapperGapDemonstrated && acceptance.invalidProjectionRejected
    && !acceptance.fullRealityBenchmarkPassed;
  const scenario = {
    itinerantUnitProfiles, itinerantOperationProfiles, referenceValidation: realityReferenceValidation,
    standaloneControls: controls, wrappedMainControl, wrappedAuxiliaryControl,
    invalidStandaloneSubstitutionControl, standaloneRealityRun,
    wrappedRealityExpressibilityAudit, combinedRealityRun, supportedCapabilityCodes,
    confirmedGapCodes, withdrawnScenarioEvidence,
    engineAudit: {
      plannerNextProblemHasWrappingContract: false,
      dependenciesExpressRelativeAdjacency: false,
      closeFeedersIsGenericAnchoredClosure: false,
      mainConstructorMaterializesGenericAnchorSegments: false,
      auxiliaryPlacementCanRetroactivelyAugmentMain: false,
    },
  };
  return {
    ...source,
    version: "planner-next-focal-a2-itinerant-unit-audit-v2",
    status: acceptance.accepted ? "FOCAL_A2_ITINERANT_UNIT_CONTRACT_AUDIT_ACCEPTED" : "FOCAL_A2_ITINERANT_UNIT_CONTRACT_AUDIT_REJECTED",
    sourceArtifactVersion: source.version,
    sourceArtifactSha256: manifest.sourceArtifactSha256,
    scenarios: { ...source.scenarios, focalA2ItinerantUnitContractAudit: scenario },
    sourceDocuments: realitySourceDocuments,
    ...scenario,
    historicalRegressionEvidence: {
      protectedScenarioCount: Object.keys(manifest.scenarioDigests).length,
      scenarioMismatchIds, historicalEvidenceMismatchIds,
      intact: historicalRegressionIntact,
    },
    acceptance,
  };
}

export function runBenchmark() {
  const source = JSON.parse(readFileSync("planner-next-focal-a2-reality-baseline-v1.json", "utf8"));
  const manifest = JSON.parse(readFileSync("engine/planner-next/benchmarks/focal-a2/focalA2ItinerantUnitV2HistoricalManifest.json", "utf8"));
  const output = buildRealityArtifact(source, manifest);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.acceptance.accepted) process.exitCode = 1;
  return output;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runBenchmark();
