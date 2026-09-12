import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import { createPendingCompletionDeadlineAuthority } from "./pendingCompletionDeadlineAuthority";

const window = [{ start: 0, end: 100 }];
const task = (id: string, duration: number, dependencies: string[] = [], availability = window): Task => ({
  id, kind: "auxiliary", participantId: id, duration, spaceId: id, dependencies, availability,
});
const problem = (tasks: Task[]): PlannerNextProblem => ({ day: { start: 0, end: 100 },
  spaces: tasks.map(({ spaceId }) => ({ id: spaceId, availability: window })), resources: [],
  participants: tasks.map(({ participantId }) => ({ id: participantId!, availability: window })), coaches: [], tasks,
  participantTransitionMinutes: 0, resourceTransitionMinutes: 0, auxiliaryPolicy: { participantPresencePreference: "OFF" },
  budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 1, maxBranchExpansions: 100 }, searchPolicy: "EXACT_CONSTRUCTIVE" });

test("latest dynamic successor start propagates through a pending IN chain without choosing a start", () => {
  const arrival = task("in", 5), a = task("a", 10, [arrival.id]), b = task("b", 10, [a.id], [{ start: 0, end: 45 }]);
  const input = problem([arrival, a, b]), snapshot = JSON.stringify(input);
  const authority = createPendingCompletionDeadlineAuthority(input, [b, arrival, a], []);
  assert.equal(authority.completionDeadline("b"), 45);
  assert.equal(authority.completionDeadline("a"), 35);
  assert.equal(authority.completionDeadline("in"), 25);
  assert.equal(JSON.stringify(input), snapshot);
  const reversed = createPendingCompletionDeadlineAuthority({ ...input, tasks: [...input.tasks].reverse() }, [a, arrival, b], []);
  assert.deepEqual(["a", "b", "in"].map((id) => reversed.completionDeadline(id)),
    ["a", "b", "in"].map((id) => authority.completionDeadline(id)));
});

test("cycle and unknown successors abstain safely from recursive tightening", () => {
  const a = task("a", 10, ["b"], [{ start: 0, end: 30 }]);
  const b = task("b", 10, ["a"], [{ start: 0, end: 80 }]);
  const unknown = task("unknown-dependent", 10, [a.id]);
  const input = problem([a, b, unknown]);
  const authority = createPendingCompletionDeadlineAuthority(input, [a, b], []);
  assert.equal(authority.completionDeadline("a"), 30);
  assert.equal(authority.completionDeadline("b"), 80);
  assert.equal(authority.completionDeadline("missing"), input.day.end);
});
