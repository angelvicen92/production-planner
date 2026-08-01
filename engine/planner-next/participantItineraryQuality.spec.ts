import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { evaluateParticipantItineraryQuality } from "./participantItineraryQuality";

const participant = (id: string, availability = [{ start: 0, end: 200 }]) => ({ id, availability });
const problem = (ids = ["p"]): PlannerNextProblem => ({
  day: { start: 0, end: 200 }, protectedMeal: { start: 90, end: 100 }, spaces: ["a", "b"].map((id) => ({ id, availability: [{ start: 0, end: 200 }] })),
  resources: [], participants: ids.map((id) => participant(id)), coaches: [], tasks: [],
  mainFlow: { spaceId: "a", preferredEnd: 200, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
  participantTransitionMinutes: 0, resourceTransitionMinutes: 0, budget: { bestK: 1, maxBacktracks: 1, maxPatterns: 1, maxBranchExpansions: 1 },
});
const task = (id: string, start: number, end: number, participantId: string | undefined = "p", spaceId = "a"): ScheduledTask => participantId === undefined
  ? { id, kind: "technical", duration: end - start, spaceId, dependencies: [], start, end }
  : { id, kind: "auxiliary", participantId, duration: end - start, spaceId, dependencies: [], start, end };

test("includes known participants without tasks and ignores technical or unknown-participant tasks", () => {
  const technical: ScheduledTask = { id: "technical", kind: "technical", duration: 20, spaceId: "a", dependencies: [], start: 0, end: 20 };
  const result = evaluateParticipantItineraryQuality(problem(["empty", "p"]), [technical, task("unknown", 0, 20, "other")]);
  assert.equal(result.summary.participantCount, 2); assert.equal(result.summary.participantsWithTasks, 0);
  assert.deepEqual(result.participants.map(({ participantId, taskCount }) => ({ participantId, taskCount })), [{ participantId: "empty", taskCount: 0 }, { participantId: "p", taskCount: 0 }]);
});

test("one task defines presence and productive time without idle", () => {
  const item = evaluateParticipantItineraryQuality(problem(), [task("only", 20, 50)]).participants[0]!;
  assert.deepEqual({ first: item.firstTaskId, last: item.lastTaskId, span: item.presenceSpanMinutes, productive: item.productiveMinutes,
    idle: item.idleMinutes, ratio: item.idleRatio, gaps: item.gapCount }, { first: "only", last: "only", span: 30, productive: 30, idle: 0, ratio: 0, gaps: 0 });
});

test("adjacent tasks do not create a gap and same spaces do not create a change", () => {
  const item = evaluateParticipantItineraryQuality(problem(), [task("a", 10, 20), task("b", 20, 30)]).participants[0]!;
  assert.equal(item.productiveMinutes, 20); assert.equal(item.idleMinutes, 0); assert.equal(item.gapCount, 0); assert.equal(item.spaceChangeCount, 0);
});

test("multiple gaps are explicit and the maximum gap has deterministic neighbours", () => {
  const item = evaluateParticipantItineraryQuality(problem(), [task("last", 70, 80, "p", "b"), task("first", 0, 10), task("middle", 20, 30, "p", "b")]).participants[0]!;
  assert.equal(item.presenceSpanMinutes, 80); assert.equal(item.productiveMinutes, 30); assert.equal(item.idleMinutes, 50); assert.equal(item.gapCount, 2);
  assert.deepEqual(item.gaps, [
    { start: 10, end: 20, duration: 10, beforeTaskId: "first", afterTaskId: "middle", beforeSpaceId: "a", afterSpaceId: "b" },
    { start: 30, end: 70, duration: 40, beforeTaskId: "middle", afterTaskId: "last", beforeSpaceId: "b", afterSpaceId: "b" },
  ]);
  assert.equal(item.maximumGapMinutes, 40); assert.equal(item.maximumGapBeforeTaskId, "middle"); assert.equal(item.maximumGapAfterTaskId, "last");
  assert.equal(item.spaceChangeCount, 1);
});

test("productive time is the interval union and anomalous overlaps never make idle negative", () => {
  const item = evaluateParticipantItineraryQuality(problem(), [task("wide", 10, 60), task("nested", 20, 30), task("overlap", 50, 80)]).participants[0]!;
  assert.equal(item.presenceSpanMinutes, 70); assert.equal(item.productiveMinutes, 70); assert.equal(item.idleMinutes, 0); assert.equal(item.gapCount, 0);
});

test("counts every containing availability window used without interpreting arrival or departure", () => {
  const p = problem(); p.participants[0]!.availability = [{ start: 0, end: 40 }, { start: 40, end: 100 }, { start: 0, end: 100 }];
  const item = evaluateParticipantItineraryQuality(p, [task("early", 10, 20), task("late", 50, 60)]).participants[0]!;
  assert.equal(item.usedAvailabilityWindowCount, 3);
});

test("task and participant input order do not affect metrics, rankings, or fingerprint", () => {
  const p = problem(["b", "a"]); const tasks = [task("b-task", 0, 20, "b"), task("a-late", 30, 40, "a"), task("a-early", 0, 10, "a")];
  const snapshot = JSON.stringify({ p, tasks }); const first = evaluateParticipantItineraryQuality(p, tasks);
  const reversedProblem = structuredClone(p); reversedProblem.participants.reverse();
  const reversed = evaluateParticipantItineraryQuality(reversedProblem, [...tasks].reverse());
  assert.deepEqual(reversed, first); assert.equal(JSON.stringify({ p, tasks }), snapshot);
  assert.deepEqual(first.summary.participantIdsByIdleDescending, ["a", "b"]);
  assert.deepEqual(first.summary.participantIdsByPresenceDescending, ["a", "b"]);
  assert.match(first.summary.qualityFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(evaluateParticipantItineraryQuality(p, tasks).summary.qualityFingerprint, first.summary.qualityFingerprint);
});

test("rankings use participant ID as the stable tie-break", () => {
  const p = problem(["z", "a"]); const tasks = [task("z1", 0, 10, "z"), task("z2", 20, 30, "z"), task("a1", 0, 10, "a"), task("a2", 20, 30, "a")];
  const summary = evaluateParticipantItineraryQuality(p, tasks).summary;
  assert.deepEqual(summary.participantIdsByIdleDescending, ["a", "z"]); assert.deepEqual(summary.participantIdsByPresenceDescending, ["a", "z"]);
});
