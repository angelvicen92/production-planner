import assert from "node:assert/strict";
import test from "node:test";
import type { EngineDiagnostics } from "@/hooks/use-engine-diagnostics";
import {
  buildEngineDiagnosticsSnapshot,
  ENGINE_DIAGNOSTICS_EXPORT_VERSION,
  MAX_EXPORTED_WARNINGS_PER_GROUP,
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
  assert.ok(serialized.length < 5_000);
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
