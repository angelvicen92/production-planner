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
  assert.equal(prefilterCandidatesByHardConstraints([candidate("PRESERVE_BASELINE_SAFETY", [], { baselinePreservation: true, baselineSafetyCandidate: true, readOnly: true })], state()).candidates.length, 1);
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
  assert.equal(reason(candidate("space", [{ taskId: 1, startPlanned: "09:30", endPlanned: "10:00", spaceId: 2, resourceIds: [10] }])), "candidate-introduced-space-overlap");
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

test("applies scoped protected breaks in hard prefilter", () => {
  const otherSpace = prefilterCandidatesByHardConstraints([candidate("other-space", [{ taskId: 1, startPlanned: "09:05", endPlanned: "09:25", spaceId: 2, resourceIds: [10] }])], state({ availability: { ...state().availability, protectedBreaks: [{ start: "09:00", end: "09:30", kind: "protected", spaceId: 1 } as any] }, spaces: { ...state().spaces, concurrencyById: { 2: 2 } } }));
  assert.equal(otherSpace.candidates.length, 1);
  assert.equal(reason(candidate("matching-space"), state({ availability: { ...state().availability, protectedBreaks: [{ start: "09:00", end: "09:30", kind: "protected", spaceId: 1 } as any] } })), "hard-break-overlap");
  assert.equal(reason(candidate("contestant"), state({ availability: { ...state().availability, protectedBreaks: [{ start: "09:00", end: "09:30", contestantId: 1 } as any] } })), "hard-break-overlap");
  assert.equal(reason(candidate("resource"), state({ availability: { ...state().availability, protectedBreaks: [{ start: "09:00", end: "09:30", resourceItemId: 10 } as any] } })), "hard-break-overlap");
  assert.equal(prefilterCandidatesByHardConstraints([candidate("unmatched-resource")], state({ availability: { ...state().availability, protectedBreaks: [{ start: "09:00", end: "09:30", resourceItemId: 999 } as any] } })).candidates.length, 1);
  assert.equal(reason(candidate("global-hard"), state({ availability: { ...state().availability, globalHardBreaks: [{ start: "09:00", end: "09:30" }] } })), "hard-break-overlap");
});

test("prefilter aligns meal rejection with mealMode semantics", () => {
  const moveInMeal = candidate("move-in-meal", [{ taskId: 1, startPlanned: "12:00", endPlanned: "12:30", resourceIds: [10] }]);
  const flexible = state({ availability: { ...state().availability, meal: { start: "12:00", end: "13:00" }, mealWindow: { start: "12:00", end: "13:00" } }, constraints: { mealMode: "flexible_meal_window" } });
  assert.equal(prefilterCandidatesByHardConstraints([moveInMeal], flexible).candidates.length, 1);
  assert.equal(reason(moveInMeal, state({ availability: { ...state().availability, meal: { start: "12:00", end: "13:00" } }, constraints: { mealMode: "global_hard_break" } })), "hard-break-overlap");
  assert.equal(reason(moveInMeal, state({ availability: { ...state().availability, actualMeal: { start: "12:00", end: "13:00" } }, constraints: { mealMode: "flexible_meal_window" } })), "hard-break-overlap");
  assert.equal(reason(moveInMeal, state({ availability: { ...state().availability, globalHardBreaks: [{ start: "12:00", end: "13:00" }] }, constraints: { mealMode: "flexible_meal_window" } })), "hard-break-overlap");
  const discarded = prefilterCandidatesByHardConstraints([moveInMeal], state({ availability: { ...state().availability, actualMeal: { start: "12:00", end: "13:00" } }, constraints: { mealMode: "flexible_meal_window" } })).discardedCandidates;
  assert.doesNotThrow(() => JSON.stringify(discarded));
});

test("allows baseline repair candidate that resolves its preexisting productive overlap", () => {
  const s = state({
    planning: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [10], spaceId: 1, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
      { taskId: 2, startPlanned: "09:10", endPlanned: "09:40", assignedResourceIds: [20], spaceId: 1, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    ],
    spaces: { ...state().spaces, exclusiveById: { 1: true }, capacityById: { 1: 1 }, concurrencyById: { 1: 1 } },
    tasks: [{ ...state().tasks[0], spaceId: 1 } as any, { ...state().tasks[1], spaceId: 1 } as any],
  });
  const repair = candidate("repair", [{ taskId: 1, startPlanned: "09:40", endPlanned: "10:10", spaceId: 1, resourceIds: [10] }], { baselineRepairCandidate: true, repairedViolationCode: "SPACE_OVERLAP", conflictingTaskIds: [1, 2] });
  const result = prefilterCandidatesByHardConstraints([repair], s);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.discardedCandidates.length, 0);
});

test("discards baseline repair candidate that introduces a different overlap", () => {
  const s = state({
    planning: [
      { taskId: 1, startPlanned: "09:00", endPlanned: "09:30", assignedResourceIds: [10], spaceId: 1, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
      { taskId: 2, startPlanned: "09:10", endPlanned: "09:40", assignedResourceIds: [20], spaceId: 1, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
      { taskId: 3, startPlanned: "09:45", endPlanned: "10:15", assignedResourceIds: [30], spaceId: 1, operationalRole: "productive_task", spaceOccupancyMode: "exclusive", blocksSpace: true },
    ] as any,
    tasks: [...state().tasks, { id: 3, status: "pending", contestantId: 3, itinerantTeamId: 3, spaceId: 1, assignedResourceIds: [30] } as any],
    spaces: { ...state().spaces, exclusiveById: { 1: true }, capacityById: { 1: 1 }, concurrencyById: { 1: 1 } },
  });
  const repair = candidate("repair-introduces", [{ taskId: 1, startPlanned: "09:50", endPlanned: "10:20", spaceId: 1, resourceIds: [10] }], { baselineRepairCandidate: true, repairedViolationCode: "SPACE_OVERLAP", conflictingTaskIds: [1, 2] });
  const result = prefilterCandidatesByHardConstraints([repair], s);
  assert.equal(result.discardedCandidates[0].reason, "candidate-introduced-space-overlap");
  assert.deepEqual(result.discardedCandidates[0].conflictingTaskIds, [1, 3]);
});
