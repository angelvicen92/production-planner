import assert from "node:assert/strict";
import test from "node:test";
import type { EngineDiagnostics } from "@/hooks/use-engine-diagnostics";
import {
  buildEngineDiagnosticsSnapshot,
  ENGINE_DIAGNOSTICS_EXPORT_VERSION,
  MAX_EXPORTED_WARNINGS_PER_GROUP,
  MAX_EXPORTED_HARD_VIOLATIONS,
} from "./engine-diagnostics-export";

const generatedAt = new Date("2026-05-31T01:25:00.000Z");

test("builds a defensive snapshot from incomplete diagnostics", () => {
  const snapshot = buildEngineDiagnosticsSnapshot({}, { generatedAt, planId: 42 });

  assert.equal(snapshot.exportVersion, ENGINE_DIAGNOSTICS_EXPORT_VERSION);
  assert.equal(snapshot.generatedAt, generatedAt.toISOString());
  assert.equal(snapshot.planId, 42);
  assert.equal(snapshot.runId, null);
  assert.equal(snapshot.summary.plannedTasks, null);
  assert.equal(snapshot.intelligence.backtrackingAttempted, null);
  assert.equal(snapshot.intelligence.coachWaveOrderingAttempted, false);
  assert.equal(snapshot.intelligence.coachWaveCandidatesGenerated, 0);
  assert.equal(snapshot.intelligence.coachWaveAccepted, false);
  assert.equal(snapshot.intelligence.coachWaveReason, "generator_not_invoked");
  assert.deepEqual(snapshot.intelligence.coachWaveBefore, {});
  assert.deepEqual(snapshot.intelligence.coachWaveAfter, {});
  assert.equal(snapshot.intelligence.pipelineBuilderAttempted, false);
  assert.deepEqual(snapshot.intelligence.pipelineConflictDetails, []);
  assert.equal(snapshot.intelligence.pipelineRepairAttempted, false);
  assert.equal(snapshot.intelligence.pipelineRepairCandidatesGenerated, 0);
  assert.equal(snapshot.intelligence.pipelineRepairAccepted, false);
  assert.equal(snapshot.intelligence.pipelineSegmentRepairAttempted, false);
  assert.equal(snapshot.intelligence.pipelineSegmentRepairCandidatesGenerated, 0);
  assert.equal(snapshot.intelligence.pipelineSegmentRepairAccepted, false);
  assert.equal(snapshot.intelligence.pipelineSegmentRepairReason, "not_attempted");
  assert.deepEqual(snapshot.intelligence.pipelineSegmentRepairStrategiesTried, []);
  assert.deepEqual(snapshot.intelligence.pipelineSegmentRepairMovedTalentNames, []);
  assert.deepEqual(snapshot.intelligence.pipelineSegmentRepairRejectedReasons, []);
  assert.equal(snapshot.intelligence.pipelineCandidatesGenerated, 0);
  assert.equal(snapshot.intelligence.pipelineAccepted, false);
  assert.equal(snapshot.intelligence.pipelineReason, "generator_not_invoked");
  assert.deepEqual(snapshot.intelligence.pipelineMappedTalents, []);
  assert.deepEqual(snapshot.intelligence.pipelineUnmappedTalents, []);
  assert.deepEqual(snapshot.intelligence.pipelineMovedTasks, []);
  assert.deepEqual(snapshot.intelligence.pipelineStableTasks, []);
  assert.deepEqual(snapshot.humanReviewTemplate, {
    observedIssue: null,
    expectedBehavior: null,
    criticalTalentOrResource: null,
    notes: null,
  });
  assert.deepEqual(snapshot.warnings.resourceDiagnosticWarnings, []);
});

test("includes key metrics without copying full engine or planning payloads", () => {
  const diagnostics = {
    id: 9,
    planId: 42,
    engineVersion: "v3",
    status: "success",
    solutionSource: "operational_neighborhood",
    plannedTasks: 80,
    hardConstraintViolations: 0,
    selectedCandidateMetrics: { score: 123, nested: { gapMinutes: 4 } },
    engineMetadata: {
      candidateSolutionsEvaluated: 7,
      neighborhoodCandidatesGenerated: 6,
      neighborhoodCandidateAccepted: true,
      operationalCompactionAttempted: true,
      operationalCompactionCandidatesGenerated: 4,
      operationalCompactionAccepted: true,
      operationalCompactionReason: "operational_neighborhood selected: lower coach idle",
      operationalCompactionMetricsBefore: { coachIdlePenalty: 260 },
      operationalCompactionMetricsAfter: { coachIdlePenalty: 20, maxCoachGapMinutes: 20 },
      coachCompactionAttempted: true,
      coachCompactionCandidatesGenerated: 2,
      coachCompactionRejectedReasons: ["blocked_by_availability"],
      coachCompactionTargetedCoaches: [{ coachId: 501, coachName: "Coach A", maxGapMinutes: 260, spanMinutes: 320, idleMinutes: 260 }],
      coachCompactionBestBefore: { maxCoachGapMinutes: 260 },
      coachCompactionBestAfter: { maxCoachGapMinutes: 20 },
      coachWaveOrderingAttempted: true,
      coachWaveCandidatesGenerated: 3,
      coachWaveAccepted: true,
      coachWaveReason: "operational_neighborhood selected: coach wave ordering",
      coachWaveBefore: { maxCoachGapMinutes: 260, coachSplitDayPenalty: 1 },
      coachWaveAfter: { maxCoachGapMinutes: 20, coachSplitDayPenalty: 0 },
      pipelineBuilderAttempted: true,
      pipelineCandidatesGenerated: 3,
      pipelineAccepted: true,
      pipelineReason: "partial_mapping_used",
      pipelineRejectedReasons: [],
      pipelineBefore: { maxCoachGapMinutes: 260 },
      pipelineAfter: { maxCoachGapMinutes: 20 },
      pipelineMappedTalents: ["Lucía", "Jose Maria"],
      pipelineUnmappedTalents: ["Talent 19"],
      pipelineMovedTasks: [11, 12],
      pipelineStableTasks: [13],
      pipelineFeederOutcomes: ["feeder_relocated", "feeder_kept_stable"],
      pipelineRepairAttempted: true,
      pipelineRepairCandidatesGenerated: 1,
      pipelineRepairAccepted: true,
      pipelineConflictDetails: [{
        candidateName: "pipeline_coachA_first",
        violationCode: "RESOURCE_OVERLAP",
        resourceId: 501,
        resourceName: "Coach A",
        taskIds: [11, 12],
        taskNames: ["Vocal 1", "Vocal 2"],
        talentNames: ["Lucía", "Jose Maria"],
        blockingTaskIds: [12],
        blockingTaskNames: ["Vocal 2"],
        movableTaskIds: [11],
        lockedOrExecutedTaskIds: [12],
        repairAttempted: true,
        repairStrategy: "move_whole_segment_by_offset",
        repairResult: "repair_success_candidate_generated",
        message: "Coach overlap",
      }],
      pipelineSegmentRepairAttempted: true,
      pipelineSegmentRepairCandidatesGenerated: 1,
      pipelineSegmentRepairAccepted: true,
      pipelineSegmentRepairReason: "pipeline_builder selected: segment repair lower coach gap",
      pipelineSegmentRepairStrategiesTried: ["move_whole_segment_by_offset"],
      pipelineSegmentRepairMovedTalentNames: ["Lucía"],
      pipelineSegmentRepairRejectedReasons: [],
      declaredResourceBundleCount: 5,
      usableResourceBundleCount: 4,
    },
    engineInput: { tasks: Array.from({ length: 1_000 }, (_, id) => ({ id })) },
    planningOutput: { assignments: Array.from({ length: 1_000 }, (_, id) => ({ id })) },
  } as EngineDiagnostics & Record<string, unknown>;

  const snapshot = buildEngineDiagnosticsSnapshot(diagnostics, { generatedAt });
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.runId, 9);
  assert.equal(snapshot.summary.plannedTasks, 80);
  assert.equal(snapshot.intelligence.candidateSolutionsEvaluated, 7);
  assert.equal(snapshot.intelligence.operationalCompactionAttempted, true);
  assert.equal(snapshot.intelligence.operationalCompactionCandidatesGenerated, 4);
  assert.equal(snapshot.intelligence.operationalCompactionAccepted, true);
  assert.deepEqual(snapshot.intelligence.operationalCompactionMetricsBefore, { coachIdlePenalty: 260 });
  assert.deepEqual(snapshot.intelligence.operationalCompactionMetricsAfter, { coachIdlePenalty: 20, maxCoachGapMinutes: 20 });
  assert.equal(snapshot.intelligence.coachCompactionAttempted, true);
  assert.equal(snapshot.intelligence.coachCompactionCandidatesGenerated, 2);
  assert.deepEqual(snapshot.intelligence.coachCompactionRejectedReasons, ["blocked_by_availability"]);
  assert.deepEqual(snapshot.intelligence.coachCompactionTargetedCoaches, [{ coachId: 501, coachName: "Coach A", maxGapMinutes: 260, spanMinutes: 320, idleMinutes: 260 }]);
  assert.deepEqual(snapshot.intelligence.coachCompactionBestBefore, { maxCoachGapMinutes: 260 });
  assert.deepEqual(snapshot.intelligence.coachCompactionBestAfter, { maxCoachGapMinutes: 20 });
  assert.equal(snapshot.intelligence.coachWaveOrderingAttempted, true);
  assert.equal(snapshot.intelligence.coachWaveCandidatesGenerated, 3);
  assert.equal(snapshot.intelligence.coachWaveAccepted, true);
  assert.equal(snapshot.intelligence.coachWaveReason, "operational_neighborhood selected: coach wave ordering");
  assert.deepEqual(snapshot.intelligence.coachWaveBefore, { maxCoachGapMinutes: 260, coachSplitDayPenalty: 1 });
  assert.deepEqual(snapshot.intelligence.coachWaveAfter, { maxCoachGapMinutes: 20, coachSplitDayPenalty: 0 });
  assert.equal(snapshot.intelligence.pipelineBuilderAttempted, true);
  assert.equal(snapshot.intelligence.pipelineCandidatesGenerated, 3);
  assert.equal(snapshot.intelligence.pipelineReason, "partial_mapping_used");
  assert.deepEqual(snapshot.intelligence.pipelineMappedTalents, ["Lucía", "Jose Maria"]);
  assert.deepEqual(snapshot.intelligence.pipelineUnmappedTalents, ["Talent 19"]);
  assert.deepEqual(snapshot.intelligence.pipelineMovedTasks, [11, 12]);
  assert.deepEqual(snapshot.intelligence.pipelineStableTasks, [13]);
  assert.equal(snapshot.intelligence.pipelineRepairAccepted, true);
  assert.deepEqual((snapshot.intelligence.pipelineConflictDetails as any[])[0].blockingTaskNames, ["Vocal 2"]);
  assert.equal(snapshot.intelligence.pipelineSegmentRepairAccepted, true);
  assert.deepEqual(snapshot.intelligence.pipelineSegmentRepairMovedTalentNames, ["Lucía"]);
  assert.deepEqual(snapshot.selectedCandidateMetrics, { score: 123, nested: { gapMinutes: 4 } });
  assert.equal(snapshot.resourceBundles.usable, 4);
  assert.deepEqual(snapshot.humanReviewTemplate, {
    observedIssue: null,
    expectedBehavior: null,
    criticalTalentOrResource: null,
    notes: null,
  });
  assert.equal(serialized.includes("engineInput"), false);
  assert.equal(serialized.includes("planningOutput"), false);
  assert.ok(serialized.length < 6_000);
});


test("keeps the complete pipeline repair JSON shape and synthesizes unavailable validator details", () => {
  const snapshot = buildEngineDiagnosticsSnapshot({
    engineMetadata: {
      pipelineRejectedReasons: ["resource_conflict", "candidate_failed_hard_validation"],
      pipelineSegmentRepairAttempted: false,
    },
  }, { generatedAt });
  const parsed = JSON.parse(JSON.stringify(snapshot));
  const requiredKeys = [
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
  ];
  for (const key of requiredKeys) assert.equal(Object.hasOwn(parsed.intelligence, key), true, `missing ${key}`);
  assert.equal(parsed.intelligence.pipelineSegmentRepairReason, "segment_repair_not_invoked");
  assert.equal(parsed.intelligence.pipelineConflictDetails.length, 1);
  assert.equal(parsed.intelligence.pipelineConflictDetails[0].message, "conflict_detail_unavailable_from_validator");
});

test("limits exported warnings and warning details", () => {
  const warnings = Array.from({ length: MAX_EXPORTED_WARNINGS_PER_GROUP + 5 }, (_, index) => ({
    code: `WARNING_${index}`,
    message: "x".repeat(1_000),
    taskIds: Array.from({ length: 100 }, (_, taskId) => taskId),
  }));

  const snapshot = buildEngineDiagnosticsSnapshot({
    diagnosticWarnings: {
      resourceDiagnosticWarnings: warnings,
      resourceBundleValidationWarnings: warnings,
    },
  }, { generatedAt });

  assert.equal(snapshot.warnings.resourceDiagnosticWarnings.length, MAX_EXPORTED_WARNINGS_PER_GROUP);
  assert.equal(snapshot.warnings.resourceBundleValidationWarnings.length, MAX_EXPORTED_WARNINGS_PER_GROUP);
  assert.equal(snapshot.warnings.resourceDiagnosticWarnings[0]?.message?.length, 500);
  assert.equal(snapshot.warnings.resourceDiagnosticWarnings[0]?.taskIds?.length, 25);
});


test("exports compact hard-validation failure details", () => {
  const details = Array.from({ length: MAX_EXPORTED_HARD_VIOLATIONS + 5 }, (_, index) => ({
    code: index % 2 ? "SPACE_OVERLAP" : "CONTESTANT_OVERLAP",
    severity: "hard",
    message: `violation ${index}`,
    taskIds: [index + 1, index + 2],
  }));
  const snapshot = buildEngineDiagnosticsSnapshot({
    status: "infeasible",
    hardConstraintViolations: details.length,
    hardValidationPassed: false,
    hardConstraintViolationCodes: ["CONTESTANT_OVERLAP", "SPACE_OVERLAP"],
    hardConstraintViolationDetails: details,
  }, { generatedAt });

  assert.equal(snapshot.summary.hardValidationPassed, false);
  assert.deepEqual(snapshot.summary.hardConstraintViolationCodes, ["CONTESTANT_OVERLAP", "SPACE_OVERLAP"]);
  assert.equal(snapshot.summary.hardConstraintViolationDetails.length, MAX_EXPORTED_HARD_VIOLATIONS);
});

test("includes operational quality when planning tasks are supplied", () => {
  const snapshot = buildEngineDiagnosticsSnapshot({}, {
    generatedAt,
    operationalQualityInput: {
      contestants: [{ id: 1, name: "Talent A" }],
      tasks: [
        { contestantId: 1, startPlanned: "09:00", endPlanned: "09:30", template: { name: "Ensayo" } },
        { contestantId: 1, startPlanned: "11:00", endPlanned: "11:30", template: { name: "Main Stage" } },
      ],
    },
  });

  assert.equal(snapshot.operationalQuality.summary.status, "review");
  assert.equal(snapshot.operationalQuality.topTalentIdle[0]?.idleMinutes, 90);
  assert.equal(snapshot.operationalQuality.feederToMainGaps.maxFeederToMainGap, 90);
});

test("keeps operational quality export compact with a large task input", () => {
  const tasks = Array.from({ length: 2_000 }, (_, index) => ({
    contestantId: (index % 200) + 1,
    startPlanned: index % 2 ? "12:00" : "08:00",
    endPlanned: index % 2 ? "12:30" : "08:30",
    template: { name: `Ensayo ${"x".repeat(500)}` },
    assignedResources: [(index % 50) + 1],
  }));
  const resourceNamesById = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [index + 1, `Coach ${index + 1}`]));
  const snapshot = buildEngineDiagnosticsSnapshot({}, {
    generatedAt,
    operationalQualityInput: { tasks, resourceNamesById },
  });
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.operationalQuality.topTalentIdle.length, 15);
  assert.equal(snapshot.operationalQuality.topCoachIdle.length, 10);
  assert.ok(serialized.length < 30_000, `snapshot was ${serialized.length} bytes`);
  assert.equal(serialized.includes("xxxx".repeat(100)), false);
});

test("normalizes missing coach compaction metadata without nulls", () => {
  const snapshot = buildEngineDiagnosticsSnapshot({}, { generatedAt });

  assert.equal(snapshot.intelligence.coachCompactionAttempted, false);
  assert.equal(snapshot.intelligence.coachCompactionCandidatesGenerated, 0);
  assert.deepEqual(snapshot.intelligence.coachCompactionRejectedReasons, []);
  assert.deepEqual(snapshot.intelligence.coachCompactionTargetedCoaches, []);
  assert.deepEqual(snapshot.intelligence.coachCompactionBestBefore, {});
  assert.deepEqual(snapshot.intelligence.coachCompactionBestAfter, {});
});

test("meal diagnostics are always exported and preserve real scheduler metadata", () => {
  const snapshot = buildEngineDiagnosticsSnapshot({
    engineMetadata: {
      mealMode: "flexible_meal_window",
      mealModeReason: "configured_flexible_meal_window",
      mealWindowStart: "13:00",
      mealWindowEnd: "15:00",
      mealDurationMinutes: 45,
      mealSchedulerAttempted: true,
      mealAssignmentsGenerated: 4,
      mealSchedulerAccepted: true,
      mealSchedulerReason: "flexible_meals_scheduled",
      mealSchedulerRejectedReasons: [],
      mealBlockingConflicts: 2,
      mealMovedAssignments: [{ taskId: 91, fromStart: "13:00", toStart: "13:30", toEnd: "14:15" }],
      mealSchedulerPhase: "post_pipeline",
      mealSchedulerCouldAffectPipeline: true,
      mealSchedulerPipelineIntegrationReason: "post_pipeline_meal_moves_can_change_pipeline_blockers",
    },
  }, { generatedAt });

  assert.equal(snapshot.intelligence.mealMode, "flexible_meal_window");
  assert.equal(snapshot.intelligence.mealSchedulerAttempted, true);
  assert.equal(snapshot.intelligence.mealSchedulerAccepted, true);
  assert.equal(snapshot.intelligence.mealSchedulerPhase, "post_pipeline");
  assert.deepEqual(snapshot.intelligence.mealMovedAssignments, [{ taskId: 91, fromStart: "13:00", toStart: "13:30", toEnd: "14:15" }]);

  const defaults = buildEngineDiagnosticsSnapshot({}, { generatedAt }).intelligence;
  for (const key of [
    "mealMode", "mealModeReason", "mealWindowStart", "mealWindowEnd", "mealDurationMinutes",
    "mealSchedulerAttempted", "mealAssignmentsGenerated", "mealSchedulerAccepted", "mealSchedulerReason",
    "mealSchedulerRejectedReasons", "mealBlockingConflicts", "mealMovedAssignments", "mealSchedulerPhase",
    "mealSchedulerCouldAffectPipeline", "mealSchedulerPipelineIntegrationReason",
  ]) assert.equal(Object.hasOwn(defaults, key), true, `missing ${key}`);
});
