import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, OperationalState } from "../contracts";
import { stableStringify, structuralEquals } from "../structuralEquality";
import { prefilterCandidatesByHardConstraints } from "./candidateHardPrefilter";

const candidate = (id: string, assignments: Candidate["assignments"] = [{ taskId: 1, startPlanned: "09:05", endPlanned: "09:25", spaceId: 1, resourceIds: [10] }], metadata: Record<string, unknown> = {}): Candidate => ({
  id, assignments, metadata, evidenceIds: [], operationalValues: [], state: { status: "draft", evidenceIds: [], metadata: {} },
});
const state = (overrides: Partial<OperationalState> = {}): OperationalState => ({
  id: "s", planId: 1, workDay: { start: "09:00", end: "17:00" },
  planning: [
    { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [10], spaceId: 1 },
    { taskId: 2, startPlanned: "09:30", endPlanned: "10:00", assignedResourceIds: [20], spaceId: 2 },
  ],
  tasks: [{ id: 1, status: "pending", contestantId: 1, itinerantTeamId: 1, spaceId: 1, assignedResourceIds: [10], startPlanned: "09:00", endPlanned: "09:30" } as any, { id: 2, status: "pending", contestantId: 2, itinerantTeamId: 2, spaceId: 2, assignedResourceIds: [20], startPlanned: "09:30", endPlanned: "10:00" } as any],
  resources: [], spaces: { parentById: {}, nameById: {}, capacityById: {}, concurrencyById: {}, exclusiveById: {}, priorityById: {} },
  availability: { workDay: null, meal: null, mealWindow: null, actualMeal: null, globalHardBreaks: [], protectedBreaks: [], contestantAvailabilityById: {} },
  dependencies: [], locks: [], constraints: {}, operationalMetrics: {}, cognitive: { opportunities: [], searchSpaces: [], candidates: [], candidateStates: [], simulatedStates: [], validationResults: [], operationalValues: [], commitDecisions: [], evidence: [], metadata: {} }, source: "EngineInput", schemaVersion: "ORC-SPEC-01", ...overrides,
});
const reason = (c: Candidate, s = state()) => prefilterCandidatesByHardConstraints([c], s).discardedCandidates[0]?.reason;

test("accepts PRESERVE_BASELINE, abstract candidates, and missing OperationalState", () => {
  assert.equal(prefilterCandidatesByHardConstraints([candidate("PRESERVE_BASELINE", [])], state()).candidates.length, 1);
  assert.equal(prefilterCandidatesByHardConstraints([candidate("abstract", [], { readOnly: true })], state()).candidates.length, 1);
  const missing = prefilterCandidatesByHardConstraints([candidate("bad", [{ taskId: 999, resourceIds: [] }])], null);
  assert.equal(missing.candidates.length, 1);
  assert.equal(missing.evidence.some((e) => e.kind === "candidate-hard-prefilter-skipped"), true);
});

test("discards basic integrity and protected task violations", () => {
  assert.equal(reason(candidate("missing", [{ taskId: 999, resourceIds: [] }])), "task-not-found");
  assert.equal(reason(candidate("nan", [{ taskId: Number.NaN, resourceIds: [] }])), "invalid-task-id");
  assert.equal(reason(candidate("fmt", [{ taskId: 1, startPlanned: "9:00", endPlanned: "10:00", resourceIds: [10] }])), "invalid-time-format");
  assert.equal(reason(candidate("range", [{ taskId: 1, startPlanned: "10:00", endPlanned: "10:00", resourceIds: [10] }])), "invalid-time-range");
  assert.equal(reason(candidate("done", undefined, {}), state({ tasks: [{ ...state().tasks[0], status: "done" } as any, state().tasks[1]] })), "protected-task-status");
  assert.equal(reason(candidate("progress", undefined, {}), state({ tasks: [{ ...state().tasks[0], status: "in_progress" } as any, state().tasks[1]] })), "protected-task-status");
});

test("discards lock violations", () => {
  assert.equal(reason(candidate("full"), state({ locks: [{ taskId: 1, lockType: "full" } as any] })), "lock-full");
  assert.equal(reason(candidate("time"), state({ locks: [{ taskId: 1, lockType: "time" } as any] })), "lock-time");
  assert.equal(reason(candidate("space", [{ taskId: 1, spaceId: 3, resourceIds: [10] }]), state({ locks: [{ taskId: 1, lockType: "space" } as any] })), "lock-space");
  assert.equal(reason(candidate("resource", [{ taskId: 1, resourceIds: [11] }]), state({ locks: [{ taskId: 1, lockType: "resource" } as any] })), "lock-resource");
});

test("discards workday, hard meals and break overlaps", () => {
  assert.equal(reason(candidate("wd", [{ taskId: 1, startPlanned: "08:00", endPlanned: "09:10", resourceIds: [10] }])), "outside-work-day");
  assert.equal(reason(candidate("meal", [{ taskId: 1, startPlanned: "12:00", endPlanned: "12:30", resourceIds: [10] }]), state({ availability: { ...state().availability, meal: { start: "12:15", end: "13:00" } } })), "hard-break-overlap");
});

test("discards obvious overlaps and allows configured space concurrency", () => {
  assert.equal(reason(candidate("contestant", [{ taskId: 1, startPlanned: "09:30", endPlanned: "10:00", resourceIds: [10] }]), state({ tasks: [{ ...state().tasks[0], contestantId: 2 } as any, state().tasks[1]] })), "contestant-overlap");
  assert.equal(reason(candidate("team", [{ taskId: 1, startPlanned: "09:30", endPlanned: "10:00", resourceIds: [10] }]), state({ tasks: [{ ...state().tasks[0], itinerantTeamId: 2 } as any, state().tasks[1]] })), "itinerant-team-overlap");
  assert.equal(reason(candidate("res", [{ taskId: 1, startPlanned: "09:30", endPlanned: "10:00", resourceIds: [20] }])), "resource-overlap");
  assert.equal(reason(candidate("space", [{ taskId: 1, startPlanned: "09:30", endPlanned: "10:00", spaceId: 2, resourceIds: [10] }])), "space-overlap");
  const ok = prefilterCandidatesByHardConstraints([candidate("space-ok", [{ taskId: 1, startPlanned: "09:30", endPlanned: "10:00", spaceId: 2, resourceIds: [10] }])], state({ spaces: { ...state().spaces, concurrencyById: { 2: 2 } } }));
  assert.equal(ok.candidates.length, 1);
});

test("discards direct dependency violation", () => {
  const s = state({ tasks: [state().tasks[0], { ...state().tasks[1], dependsOnTaskIds: [1] } as any] });
  assert.equal(reason(candidate("dep", [{ taskId: 2, startPlanned: "09:10", endPlanned: "09:20", spaceId: 2, resourceIds: [20] }]), s), "direct-dependency-broken");
});

test("does not mutate inputs, is deterministic, serializable/read-only, and truncates detail evidence", () => {
  const candidates = Array.from({ length: 5 }, (_, i) => candidate(`bad-${i}`, [{ taskId: 999 + i, resourceIds: [] }]));
  const s = state(); const beforeS = stableStringify(s); const beforeC = stableStringify(candidates);
  const first = prefilterCandidatesByHardConstraints(candidates, s, { maxDetailedDiscardEvidence: 2, createdAt: "now" });
  const second = prefilterCandidatesByHardConstraints(candidates, s, { maxDetailedDiscardEvidence: 2, createdAt: "now" });
  assert.equal(stableStringify(s), beforeS); assert.equal(stableStringify(candidates), beforeC);
  assert.equal(structuralEquals(first, second), true); assert.doesNotThrow(() => JSON.stringify(first));
  assert.equal(first.summary.detailedDiscardEvidenceCount, 2); assert.equal(first.summary.overflowDiscardCount, 3);
  assert.equal(first.evidence.filter((e) => e.kind === "candidate-hard-prefilter-discarded").length, 2);
  assert.equal(first.evidence.every((e) => e.data.readOnly === true), true);
});
