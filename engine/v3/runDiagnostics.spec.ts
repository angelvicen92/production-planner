import assert from "node:assert/strict";
import type { EngineOutput } from "../types";
import type { EngineV3Input } from "./types";
import { buildRunDiagnostics } from "./runDiagnostics";

const input: EngineV3Input = {
  planId: 21,
  workDay: { start: "09:00", end: "12:00" },
  meal: { start: "12:00", end: "12:30" },
  camerasAvailable: 1,
  tasks: [
    { id: 1, planId: 21, templateId: 1, status: "pending", zoneId: 1, spaceId: 10, contestantId: 100 },
    { id: 2, planId: 21, templateId: 2, status: "pending", zoneId: 1, spaceId: 10 },
  ],
  locks: [],
  groupingZoneIds: [],
  optimizerMainZoneId: 1,
  contestantAvailabilityById: { 100: { start: "09:00", end: "10:00" } },
  zoneResourceAssignments: {},
  spaceResourceAssignments: {},
  zoneResourceTypeRequirements: {},
  spaceResourceTypeRequirements: {},
  planResourceItems: [
    { id: 101, resourceItemId: 1001, typeId: 12, name: "Camera A", isAvailable: true },
  ],
  resourceItemComponents: {},
  resourceBundles: [{ id: "empty", name: "Invalid empty bundle", isActive: true }],
};

const selectedCandidateMetrics = {
  coachSwitchCount: 0,
  coachSwitchPenalty: 0,
  coachIdlePenalty: 0,
  coachSpanPenalty: 0,
  coachSplitDayPenalty: 0,
  talentIdlePenalty: 0,
  talentSpanPenalty: 0,
  maxGapPenalty: 0,
  bundleCoherencePenalty: 0,
  bundleSwitchPenalty: 0,
  partialBundleUsageWarnings: 0,
  bundleSpaceAffinityMatches: 0,
  bundleSpaceAffinityMismatches: 0,
  restrictiveTalentAverageStartOffset: 0,
  mainStageGapMinutes: 10,
  mainStageGapCount: 1,
  makespan: 50,
  hardConstraintViolations: 0,
};

const output: EngineOutput = {
  feasible: false,
  complete: false,
  hardFeasible: true,
  plannedTasks: [{ taskId: 1, startPlanned: "09:00", endPlanned: "09:20", assignedSpace: 10, assignedResources: [101] }],
  unplanned: [{ taskId: 2, code: "NO_SLOT", message: "No slot" }],
  warnings: [],
  v3Meta: {
    solutionSource: "operational_neighborhood",
    candidateSelectionReason: "safe operational improvement",
    candidateSolutionsEvaluated: 4,
    selectedCandidateMetrics,
    backtrackingAttempted: true,
    backtrackingAccepted: false,
    backtrackingFallbackReason: "base candidate remained better",
    neighborhoodSearchAttempted: true,
    neighborhoodCandidatesGenerated: 3,
    neighborhoodCandidateAccepted: true,
    coachCompactionAttempted: true,
    coachCompactionCandidatesGenerated: 0,
    coachCompactionRejectedReasons: ["no_improving_slot_found"],
    coachCompactionTargetedCoaches: [{
      coachId: 501,
      coachName: "Lucía",
      maxGapMinutes: 260,
      spanMinutes: 320,
      idleMinutes: 260,
    }],
    coachCompactionBestBefore: { maxCoachGapMinutes: 260 },
    coachCompactionBestAfter: { maxCoachGapMinutes: 260 },
    coachWaveOrderingAttempted: true,
    coachWaveCandidatesGenerated: 2,
    coachWaveAccepted: true,
    coachWaveReason: "lower coach split/gap",
    coachWaveBefore: { maxCoachGapMinutes: 260 },
    coachWaveAfter: { maxCoachGapMinutes: 90 },
    pipelineBuilderAttempted: true,
    pipelineCandidatesGenerated: 3,
    pipelineAccepted: true,
    pipelineReason: "pipeline_builder selected: lower coach gap",
    pipelineRejectedReasons: ["resource_conflict"],
    pipelineBefore: { maxCoachGapMinutes: 260 },
    pipelineAfter: { maxCoachGapMinutes: 45 },
    pipelineSegmentRepairAttempted: true,
    pipelineSegmentRepairCandidatesGenerated: 1,
    pipelineSegmentRepairAccepted: true,
    pipelineSegmentRepairReason: "pipeline_builder selected: segment repair lower coach gap",
    pipelineSegmentRepairStrategiesTried: ["move_whole_segment_by_offset"],
    pipelineSegmentRepairMovedTalentNames: ["Lucía"],
    pipelineSegmentRepairRejectedReasons: [],
    pipelineLaneRepairAttempted: true,
    pipelineLaneRepairCandidatesGenerated: 1,
    pipelineLaneRepairAccepted: true,
    pipelineLaneRepairReason: "lane_repair_candidate_generated",
    pipelineLaneRepairRejectedReasons: [],
    pipelineAlternativeLaneAttempted: true,
    pipelineAlternativeLaneCandidatesGenerated: 0,
    pipelineAlternativeLaneAccepted: false,
    pipelineAlternativeLaneRejectedReasons: ["alternative_lane_unavailable_missing_config"],
    cpSatPilotAttempted: true,
    cpSatPilotAccepted: false,
    cpSatPilotReason: "no strict improvement",
    cpSatSegmentsAttempted: 2,
    cpSatSegmentsAccepted: 1,
  },
};

{
  const diagnostics = buildRunDiagnostics(input, output);
  assert.equal(diagnostics.solutionSource, "operational_neighborhood");
  assert.equal(diagnostics.plannedTasks, 1);
  assert.equal(diagnostics.unplannedTasks, 1);
  assert.equal(diagnostics.hardConstraintViolations, 0);
  assert.equal(diagnostics.hardValidationPassed, true);
  assert.deepEqual(diagnostics.hardConstraintViolationDetails, []);
  assert.deepEqual(diagnostics.hardConstraintViolationCodes, []);
  assert.equal(diagnostics.mainStageGapMinutes, 0);
  assert.equal(diagnostics.coachSwitchCount, null);
  assert.equal(diagnostics.restrictiveTalentAverageStartOffset, 0);
  assert.equal(diagnostics.engineMetadata.candidateSolutionsEvaluated, 4);
  assert.equal(diagnostics.engineMetadata.backtrackingAttempted, true);
  assert.equal(diagnostics.engineMetadata.neighborhoodCandidatesGenerated, 3);
  assert.equal(diagnostics.engineMetadata.cpSatSegmentsAccepted, 1);
  assert.equal(diagnostics.engineMetadata.coachCompactionAttempted, true);
  assert.equal(diagnostics.engineMetadata.coachCompactionCandidatesGenerated, 0);
  assert.deepEqual(diagnostics.engineMetadata.coachCompactionRejectedReasons, ["no_improving_slot_found"]);
  assert.deepEqual(diagnostics.engineMetadata.coachCompactionTargetedCoaches, [{
    coachId: 501,
    coachName: "Lucía",
    maxGapMinutes: 260,
    spanMinutes: 320,
    idleMinutes: 260,
  }]);
  assert.deepEqual(diagnostics.engineMetadata.coachCompactionBestBefore, { maxCoachGapMinutes: 260 });
  assert.deepEqual(diagnostics.engineMetadata.coachCompactionBestAfter, { maxCoachGapMinutes: 260 });
  assert.equal(diagnostics.engineMetadata.coachWaveOrderingAttempted, true);
  assert.equal(diagnostics.engineMetadata.coachWaveCandidatesGenerated, 2);
  assert.equal(diagnostics.engineMetadata.coachWaveAccepted, true);
  assert.equal(diagnostics.engineMetadata.coachWaveReason, "lower coach split/gap");
  assert.deepEqual(diagnostics.engineMetadata.coachWaveBefore, { maxCoachGapMinutes: 260 });
  assert.deepEqual(diagnostics.engineMetadata.coachWaveAfter, { maxCoachGapMinutes: 90 });
  assert.equal(diagnostics.engineMetadata.pipelineBuilderAttempted, true);
  assert.equal(diagnostics.engineMetadata.pipelineCandidatesGenerated, 3);
  assert.equal(diagnostics.engineMetadata.pipelineAccepted, true);
  assert.equal(diagnostics.engineMetadata.pipelineReason, "pipeline_builder selected: lower coach gap");
  assert.deepEqual(diagnostics.engineMetadata.pipelineRejectedReasons, ["resource_conflict"]);
  assert.deepEqual(diagnostics.engineMetadata.pipelineBefore, { maxCoachGapMinutes: 260 });
  assert.deepEqual(diagnostics.engineMetadata.pipelineAfter, { maxCoachGapMinutes: 45 });
  assert.equal(diagnostics.engineMetadata.pipelineSegmentRepairAttempted, true);
  assert.equal(diagnostics.engineMetadata.pipelineSegmentRepairCandidatesGenerated, 1);
  assert.equal(diagnostics.engineMetadata.pipelineSegmentRepairAccepted, true);
  assert.deepEqual(diagnostics.engineMetadata.pipelineSegmentRepairMovedTalentNames, ["Lucía"]);
  assert.equal(diagnostics.engineMetadata.pipelineLaneRepairAttempted, true);
  assert.equal(diagnostics.engineMetadata.pipelineLaneRepairCandidatesGenerated, 1);
  assert.equal(diagnostics.engineMetadata.pipelineLaneRepairAccepted, true);
  assert.equal(diagnostics.engineMetadata.pipelineAlternativeLaneAttempted, true);
  assert.deepEqual(diagnostics.engineMetadata.pipelineAlternativeLaneRejectedReasons, ["alternative_lane_unavailable_missing_config"]);
  assert.deepEqual(diagnostics.selectedCandidateMetrics, selectedCandidateMetrics);
}

{
  const diagnostics = buildRunDiagnostics(input, output);
  assert.ok(diagnostics.diagnosticWarnings.resourceBundleValidationWarnings.some((warning) => warning.code === "BUNDLE_WITHOUT_COMPONENTS"));
  assert.equal(diagnostics.engineMetadata.declaredResourceBundleCount, 1);
  assert.equal(diagnostics.engineMetadata.invalidResourceBundleCount, 1);
}

{
  const withoutMeta = buildRunDiagnostics(input, { ...output, v3Meta: undefined });
  assert.equal(withoutMeta.solutionSource, "unknown");
  assert.equal(withoutMeta.selectedCandidateMetrics, null);
  assert.equal(withoutMeta.engineMetadata.candidateSelectionReason, null);
  assert.equal(withoutMeta.engineMetadata.backtrackingAttempted, false);
  assert.equal(withoutMeta.engineMetadata.cpSatSegmentsAttempted, 0);
  assert.equal(withoutMeta.engineMetadata.coachCompactionAttempted, false);
  assert.equal(withoutMeta.engineMetadata.coachCompactionCandidatesGenerated, 0);
  assert.deepEqual(withoutMeta.engineMetadata.coachCompactionRejectedReasons, []);
  assert.deepEqual(withoutMeta.engineMetadata.coachCompactionTargetedCoaches, []);
  assert.deepEqual(withoutMeta.engineMetadata.coachCompactionBestBefore, {});
  assert.deepEqual(withoutMeta.engineMetadata.coachCompactionBestAfter, {});
  assert.equal(withoutMeta.engineMetadata.coachWaveOrderingAttempted, false);
  assert.equal(withoutMeta.engineMetadata.coachWaveCandidatesGenerated, 0);
  assert.equal(withoutMeta.engineMetadata.coachWaveAccepted, false);
  assert.equal(withoutMeta.engineMetadata.coachWaveReason, "generator_not_invoked");
  assert.deepEqual(withoutMeta.engineMetadata.coachWaveBefore, {});
  assert.deepEqual(withoutMeta.engineMetadata.coachWaveAfter, {});
  assert.equal(withoutMeta.engineMetadata.pipelineBuilderAttempted, false);
  assert.equal(withoutMeta.engineMetadata.pipelineCandidatesGenerated, 0);
  assert.equal(withoutMeta.engineMetadata.pipelineAccepted, false);
  assert.equal(withoutMeta.engineMetadata.pipelineReason, "generator_not_invoked");
  assert.deepEqual(withoutMeta.engineMetadata.pipelineRejectedReasons, []);
  assert.deepEqual(withoutMeta.engineMetadata.pipelineBefore, {});
  assert.deepEqual(withoutMeta.engineMetadata.pipelineAfter, {});
  assert.deepEqual(withoutMeta.engineMetadata.pipelineMappedTalents, []);
  assert.deepEqual(withoutMeta.engineMetadata.pipelineUnmappedTalents, []);
  assert.deepEqual(withoutMeta.engineMetadata.pipelineMovedTasks, []);
  assert.deepEqual(withoutMeta.engineMetadata.pipelineStableTasks, []);
  assert.deepEqual(withoutMeta.engineMetadata.pipelineFeederOutcomes, []);
  assert.deepEqual(withoutMeta.engineMetadata.pipelineConflictDetails, []);
  assert.equal(withoutMeta.engineMetadata.pipelineSegmentRepairAttempted, false);
  assert.equal(withoutMeta.engineMetadata.pipelineSegmentRepairReason, "not_attempted");
}

{
  const diagnostics = buildRunDiagnostics(input, output);
  const serialized = JSON.stringify(diagnostics);
  assert.ok(serialized.length < 20_000);
  assert.equal(Object.hasOwn(diagnostics, "tasks"), false);
  assert.equal(Object.hasOwn(diagnostics, "input"), false);
  assert.equal(Object.hasOwn(diagnostics, "output"), false);
  assert.equal(serialized.includes("contestantAvailabilityById"), false);
  assert.equal(serialized.includes("plannedTasks\":["), false);
}


{
  const requiredPipelineKeys = [
    "pipelineConflictDetails",
    "pipelineRepairAttempted",
    "pipelineRepairCandidatesGenerated",
    "pipelineRepairAccepted",
    "pipelineSegmentRepairAttempted",
    "pipelineSegmentRepairCandidatesGenerated",
    "pipelineSegmentRepairAccepted",
    "pipelineSegmentRepairReason",
    "pipelineSegmentRepairStrategiesTried",
    "pipelineSegmentRepairMovedTalentNames",
    "pipelineSegmentRepairRejectedReasons",
    "pipelineLaneRepairAttempted",
    "pipelineLaneRepairCandidatesGenerated",
    "pipelineLaneRepairAccepted",
    "pipelineLaneRepairReason",
    "pipelineLaneRepairRejectedReasons",
    "pipelineAlternativeLaneAttempted",
    "pipelineAlternativeLaneCandidatesGenerated",
    "pipelineAlternativeLaneAccepted",
    "pipelineAlternativeLaneRejectedReasons",
  ];
  const diagnostics = buildRunDiagnostics(input, { ...output, v3Meta: undefined });
  const serializedMetadata = JSON.parse(JSON.stringify(diagnostics.engineMetadata));
  for (const key of requiredPipelineKeys) assert.equal(Object.hasOwn(serializedMetadata, key), true, `missing ${key}`);
  assert.equal(serializedMetadata.pipelineRepairAttempted, false);
  assert.equal(serializedMetadata.pipelineRepairCandidatesGenerated, 0);
  assert.equal(serializedMetadata.pipelineRepairAccepted, false);
  assert.deepEqual(serializedMetadata.pipelineConflictDetails, []);
}

{
  const diagnostics = buildRunDiagnostics(input, {
    ...output,
    v3Meta: {
      pipelineBuilderAttempted: true,
      pipelineRejectedReasons: ["resource_conflict", "candidate_failed_hard_validation"],
      pipelineSegmentRepairAttempted: false,
    },
  });
  assert.equal(diagnostics.engineMetadata.pipelineSegmentRepairReason, "segment_repair_not_invoked");
  assert.equal(diagnostics.engineMetadata.pipelineConflictDetails.length, 1);
  assert.equal(diagnostics.engineMetadata.pipelineConflictDetails[0]?.violationCode, "RESOURCE_OVERLAP");
  assert.equal(diagnostics.engineMetadata.pipelineConflictDetails[0]?.message, "conflict_detail_unavailable_from_validator");
}

{
  const oversizedDetails = Array.from({ length: 12 }, (_, index) => ({
    candidateName: `candidate_${index}`,
    violationCode: "RESOURCE_OVERLAP",
    taskIds: Array.from({ length: 9 }, (_, item) => item + 1),
    taskNames: Array.from({ length: 9 }, (_, item) => `Task ${item + 1}`),
    talentNames: [],
    blockingTaskIds: Array.from({ length: 9 }, (_, item) => item + 11),
    blockingTaskNames: Array.from({ length: 9 }, (_, item) => `Blocking ${item + 1}`),
    movableTaskIds: [],
    lockedOrExecutedTaskIds: [],
    repairAttempted: true,
    repairStrategy: "move_whole_segment_by_offset",
    repairResult: "repair_attempted_but_no_valid_candidate",
    message: "resource conflict",
  }));
  const diagnostics = buildRunDiagnostics(input, {
    ...output,
    v3Meta: {
      pipelineRejectedReasons: ["resource_conflict_unrepaired"],
      pipelineConflictDetails: oversizedDetails,
      pipelineSegmentRepairAttempted: true,
      pipelineSegmentRepairStrategiesTried: ["move_whole_segment_by_offset"],
      pipelineSegmentRepairRejectedReasons: ["repair_attempted_but_no_valid_candidate"],
    },
  });
  assert.equal(diagnostics.engineMetadata.pipelineConflictDetails.length, 10);
  assert.ok(diagnostics.engineMetadata.pipelineConflictDetails.every((detail) => detail.taskIds.length <= 6
    && detail.taskNames.length <= 6 && detail.blockingTaskIds.length <= 6 && detail.blockingTaskNames.length <= 6));
  assert.equal(diagnostics.engineMetadata.pipelineSegmentRepairAttempted, true);
  assert.deepEqual(diagnostics.engineMetadata.pipelineSegmentRepairStrategiesTried, ["move_whole_segment_by_offset"]);
  assert.deepEqual(diagnostics.engineMetadata.pipelineSegmentRepairRejectedReasons, ["repair_attempted_but_no_valid_candidate"]);
}

console.log("engine/v3/runDiagnostics.spec.ts: OK");
