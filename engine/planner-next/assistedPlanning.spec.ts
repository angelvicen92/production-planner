import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { buildAssistedProblem, createPlanningScope, executeAssistedPlanning } from "./assistedPlanning";

function fixture(): PlannerNextProblem {
  return {
    day: { start: 0, end: 180 }, spaces: [
      { id: "main-space", availability: [{ start: 0, end: 180 }] },
      { id: "vocal-space", availability: [{ start: 0, end: 180 }] },
      { id: "other-space", availability: [{ start: 0, end: 180 }] },
    ], resources: [{ id: "coach", availability: [{ start: 0, end: 180 }], presencePreference: "OFF" }],
    participants: [{ id: "p1", availability: [{ start: 0, end: 180 }] }, { id: "p2", availability: [{ start: 0, end: 180 }] }],
    coaches: [{ id: "coach", availability: [{ start: 0, end: 180 }] }],
    tasks: [
      { id: "feed", kind: "vocal", duration: 10, spaceId: "vocal-space", participantId: "p1", coachId: "coach", dependencies: [] },
      { id: "main", kind: "main", duration: 15, spaceId: "main-space", participantId: "p1", coachId: "coach", blockKey: "coach", dependencies: ["feed"], requiredResourceIds: ["coach"] },
      { id: "protected", kind: "auxiliary", duration: 10, spaceId: "other-space", participantId: "p2", dependencies: [] },
      { id: "outside", kind: "auxiliary", duration: 10, spaceId: "other-space", participantId: "p2", dependencies: [] },
    ],
    mainFlow: { spaceId: "main-space", preferredEnd: 120, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 5, resourceTransitionMinutes: 0,
    budget: { bestK: 2, maxBacktracks: 100, maxPatterns: 20, maxBranchExpansions: 5_000 },
    auxiliaryPolicy: { participantPresencePreference: "OFF" }, searchPolicy: "EXACT_CONSTRUCTIVE",
  };
}

test("scope resolution is canonical and rejects duplicate or unknown task IDs", () => {
  const scope = createPlanningScope({ kind: "space", value: "main-space" }, { z: 1, a: true }, ["main"]);
  assert.deepEqual(scope.resolvedTaskIds, ["main"]);
  assert.deepEqual(Object.keys(scope.metadata), ["a", "z"]);
  assert.throws(() => createPlanningScope({ kind: "ids", value: "x" }, {}, ["main", "main"]), /DUPLICATE/);
  assert.throws(() => buildAssistedProblem(fixture(), createPlanningScope({ kind: "ids", value: "x" }, {}, ["missing"]), []), /UNKNOWN/);
});

test("assisted projection is immutable, fixes accepted placements and never moves outside scope", () => {
  const source = fixture();
  const before = structuredClone(source);
  const protectedPlacement: ScheduledTask = { ...source.tasks.find(({ id }) => id === "protected")!, start: 140, end: 150 } as ScheduledTask;
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), [protectedPlacement]);
  assert.deepEqual(source, before);
  assert.deepEqual(assisted.automaticTaskIds, ["feed", "main"]);
  assert.deepEqual(assisted.supportingTaskIds, ["feed"]);
  assert.equal(assisted.problem.tasks.some(({ id }) => id === "outside"), false);
  const first = executeAssistedPlanning(assisted);
  const second = executeAssistedPlanning(buildAssistedProblem(source, assisted.scope, [protectedPlacement]));
  assert.equal(first.evidence.completeForScope, true, first.evidence.reasonCodes.join(","));
  assert.equal(first.evidence.hardValid, true);
  assert.equal(first.evidence.requiredValid, true);
  assert.equal(first.evidence.proposalCount, 1);
  assert.deepEqual(first.evidence.supportingTaskIds, ["feed"]);
  assert.equal(first.evidence.fingerprint, second.evidence.fingerprint);
  assert.deepEqual(first.proposal?.map(({ id }) => id), ["main"]);
  assert.equal(first.proposal?.some(({ id }) => id === "feed" || id === "outside" || id === "protected"), false);
  const scheduledProtected = executeAssistedPlanning(assisted).evidence;
  assert.equal(scheduledProtected.protectedPlacementCount, 1);
  assert.equal(scheduledProtected.protectedPlacementsPreserved, true);
  assert.deepEqual(source, before);
});

test("protected placements are not roots of supporting closure", () => {
  const source = fixture();
  source.tasks.find(({ id }) => id === "protected")!.dependencies = ["outside"];
  const protectedPlacement = { ...source.tasks.find(({ id }) => id === "protected")!, start: 140, end: 150 } as ScheduledTask;
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), [protectedPlacement]);
  assert.deepEqual(assisted.supportingTaskIds, ["feed"]);
  assert.equal(assisted.problem.tasks.some(({ id }) => id === "outside"), false);
});

test("supporting closure does not infer feeders from task kind and participant", () => {
  const source = fixture();
  source.tasks.find(({ id }) => id === "main")!.dependencies = [];
  source.tasks.push({ ...source.tasks.find(({ id }) => id === "feed")!, id: "another-vocal" });
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), []);
  assert.deepEqual(assisted.supportingTaskIds, []);
  assert.deepEqual(assisted.problem.tasks.map(({ id }) => id), ["main"]);
});

test("combined evidence preserves an inherited protected-placement HARD violation", () => {
  const source = fixture();
  const protectedTask = source.tasks.find(({ id }) => id === "protected")!;
  protectedTask.availability = [{ start: 0, end: 10 }];
  const protectedPlacement = { ...protectedTask, start: 140, end: 150 } as ScheduledTask;
  const assisted = buildAssistedProblem(source, createPlanningScope({ kind: "space", value: "main-space" }, {}, ["main"]), [protectedPlacement]);
  const result = executeAssistedPlanning(assisted);
  assert.deepEqual(result.proposal?.map(({ id }) => id), ["main"]);
  assert.equal(result.evidence.protectedPlacementsPreserved, true);
  assert.equal(result.evidence.completeForScope, true);
  assert.equal(result.evidence.proposalCount, 1);
  assert.equal(result.evidence.hardValid, false);
  assert.equal(result.evidence.requiredValid, false);
});
