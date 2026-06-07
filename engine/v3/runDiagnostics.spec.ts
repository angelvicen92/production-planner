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
  assert.equal(diagnostics.mainStageGapMinutes, 0);
  assert.equal(diagnostics.coachSwitchCount, null);
  assert.equal(diagnostics.restrictiveTalentAverageStartOffset, 0);
  assert.equal(diagnostics.engineMetadata.candidateSolutionsEvaluated, 4);
  assert.equal(diagnostics.engineMetadata.backtrackingAttempted, true);
  assert.equal(diagnostics.engineMetadata.neighborhoodCandidatesGenerated, 3);
  assert.equal(diagnostics.engineMetadata.cpSatSegmentsAccepted, 1);
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

console.log("engine/v3/runDiagnostics.spec.ts: OK");
