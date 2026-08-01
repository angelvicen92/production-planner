import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { auditResidualObligationOutcomes } from "./residualObligationOutcomeAudit";
import type { ResidualOrderingDecision } from "./residualObligationAlignment";

const windows = [{ start: 0, end: 300 }];
const tasks: Task[] = [
  { id: "a-main", kind: "main", participantId: "a", duration: 10, spaceId: "s1", dependencies: [], blockKey: "x" },
  { id: "a-vocal", kind: "vocal", participantId: "a", duration: 10, spaceId: "s2", dependencies: [] },
  { id: "a-standalone", kind: "auxiliary", participantId: "a", duration: 10, spaceId: "s3", dependencies: [] },
  { id: "a-anchor", kind: "auxiliary", participantId: "a", duration: 10, spaceId: "s3", dependencies: [] },
  { id: "b-main", kind: "main", participantId: "b", duration: 10, spaceId: "s1", dependencies: [], blockKey: "x" },
  { id: "c-main", kind: "main", participantId: "c", duration: 10, spaceId: "s1", dependencies: [], blockKey: "x" },
];
const problem: PlannerNextProblem = { day: { start: 0, end: 300 }, protectedMeal: { start: 290, end: 300 },
  spaces: ["s1", "s2", "s3"].map((id) => ({ id, availability: windows })), resources: [],
  participants: ["a", "b", "c", "empty"].map((id) => ({ id, availability: windows })), coaches: [], tasks,
  mainFlow: { spaceId: "s1", preferredEnd: 280, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
  participantTransitionMinutes: 0, resourceTransitionMinutes: 0, budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 1, maxBranchExpansions: 1 },
  anchoredAccompaniments: [{ id: "anchor", anchorTaskId: "a-standalone", beforeTaskIds: ["a-anchor"], afterTaskIds: [], adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED" }] };
const scheduled = (id: string, start: number): ScheduledTask => ({ ...tasks.find((t) => t.id === id)!, start, end: start + 10 } as ScheduledTask);
const baseline = [scheduled("a-main", 50), scheduled("a-vocal", 30), scheduled("a-standalone", 100), scheduled("a-anchor", 90), scheduled("b-main", 50), scheduled("c-main", 50)];
const experiment = [scheduled("a-main", 40), scheduled("a-vocal", 10), scheduled("a-standalone", 120), scheduled("a-anchor", 110), scheduled("b-main", 60), scheduled("c-main", 50)];
const decision = (participantId: string, candidateId: string, presence: number, gap: number): ResidualOrderingDecision => ({ stateFingerprint: `state-${participantId}`, depth: participantId.charCodeAt(0), slot: 40,
  baselineOrder: [candidateId], contextualOrder: [candidateId], selectedCandidateId: candidateId, selectedParticipantId: participantId, acceptedPath: true,
  keys: [{ candidateId, residualTaskCount: 1, currentPresenceSpan: 20, projectedPresenceLowerBound: presence, projectedMaximumGapLowerBound: gap,
    sumIndependentPresenceExpansion: 0, sumIndependentIdleExpansion: 0, sumIndependentMinimumGap: 0, emptyStaticDomainCount: 0,
    participantSlack: 1, firstObligation: 40 }], explanation: "test" });

test("audits movements, gaps, equity, visibility, rankings, fingerprint, reverse order and immutability", () => {
  const before = structuredClone({ problem, baseline, experiment });
  const choices = [decision("a", "a-main", 120, 80), decision("b", "b-main", 10, 0), decision("c", "c-main", 10, 0)];
  const audit = auditResidualObligationOutcomes(problem, baseline, experiment, choices);
  const a = audit.participants.find((p) => p.participantId === "a")!;
  assert.equal(a.mechanism, "BOTH_BOUNDARIES_EXPANDED"); assert.equal(a.visibility, "VISIBLE_IN_STATIC_BOUND");
  assert.deepEqual(a.movements.map((m) => m.category), ["ANCHORED_SEGMENT", "MAIN", "STANDALONE", "FEEDER"]);
  assert.ok(a.gapChanges.sharedChanged.length > 0 || a.gapChanges.added.length > 0 || a.gapChanges.eliminated.length > 0);
  assert.equal(audit.aggregates.worsenedParticipantCount, 1); assert.equal(audit.aggregates.unchangedParticipantCount, 2);
  assert.equal(audit.classification, "VISIBLE_HARM"); assert.equal(audit.rankings.idleHarm[0], "a");
  const reversed = auditResidualObligationOutcomes({ ...problem, participants: [...problem.participants].reverse(), tasks: [...problem.tasks].reverse() },
    [...baseline].reverse(), [...experiment].reverse(), [...choices].reverse());
  assert.equal(audit.auditFingerprint, reversed.auditFingerprint); assert.deepEqual({ problem, baseline, experiment }, before);
});

test("supports identical plans, no regressions and participants without tasks", () => {
  const audit = auditResidualObligationOutcomes(problem, baseline, baseline, []);
  assert.equal(audit.classification, "NO_REGRESSIONS"); assert.equal(audit.aggregates.grossHarmMinutes, 0);
  assert.equal(audit.participants.find((p) => p.participantId === "empty")!.baseline.taskCount, 0);
});

test("classifies emerging, mixed, and incomplete trace without benchmark-specific data", () => {
  const emerging = auditResidualObligationOutcomes(problem, baseline, experiment, [decision("a", "a-main", 10, 0)]);
  assert.equal(emerging.classification, "EMERGENT_HARM");
  assert.equal(auditResidualObligationOutcomes(problem, baseline, experiment, []).classification, "INCOMPLETE_TRACE");
  const mixedExperiment = [...experiment, scheduled("b-main", 150)].filter((task, index, all) => all.findLastIndex(({ id }) => id === task.id) === index);
  const mixed = auditResidualObligationOutcomes(problem, baseline, mixedExperiment,
    [decision("a", "a-main", 120, 80), decision("b", "b-main", 10, 0)]);
  if (mixed.aggregates.totalHarmVisibleInStaticBound === mixed.aggregates.totalHarmEmergedAfterSelection) assert.equal(mixed.classification, "MIXED");
});
