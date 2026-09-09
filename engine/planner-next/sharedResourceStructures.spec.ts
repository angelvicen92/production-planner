import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem, Task } from "./contracts";
import { createExactSearchLedger } from "./exactMainAndFeederCore";
import { deriveSharedResourceStructures, exploreSharedResourceStructure, homogeneousResourceTaskKey } from "./sharedResourceStructures";

const task = (id: string, participantId: string, spaceId: string, duration: number, setupFamilyId?: string): Task => ({
  id, kind: "auxiliary", participantId, spaceId, duration, dependencies: [], requiredResourceIds: ["R"],
  ...(setupFamilyId ? { setupFamilyId } : {}),
});

const problem = (tasks: Task[], end = 100): PlannerNextProblem => ({
  day: { start: 0, end }, spaces: [
    { id: "flex", availability: [{ start: 0, end }] },
    { id: "set", availability: [{ start: 0, end }], setupPolicy: { familyOrder: ["B", "C"], flexibleFamilyOrder: true,
      reentry: "FORBIDDEN", preparationMinutesBetweenFamilies: 10 } },
  ], resources: [{ id: "R", availability: [{ start: 0, end }], presencePreference: "OFF", transitionMinutes: 0 }],
  participants: [...new Set(tasks.map((item) => item.participantId))].map((id) => ({ id, availability: [{ start: 0, end }] })),
  coaches: [], tasks, mainFlow: { spaceId: "main", preferredEnd: end, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
  participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
  budget: { bestK: 1, maxBacktracks: 100, maxPatterns: 100, maxBranchExpansions: 10_000 }, searchPolicy: "EXACT_CONSTRUCTIVE",
});

test("derives homogeneity from canonical authorities and absorbs flexible plus hard resource work", () => {
  const tasks = [task("a2", "p2", "flex", 5), task("a1", "p1", "flex", 5), task("b", "p1", "set", 5, "B"), task("c", "p2", "set", 5, "C")];
  assert.equal(homogeneousResourceTaskKey(tasks[0]!), homogeneousResourceTaskKey(tasks[1]!));
  const [structure] = deriveSharedResourceStructures(tasks)!;
  assert.equal(structure.resourceId, "R");
  assert.deepEqual(structure.tasks.map(({ id }) => id), ["a1", "a2", "b", "c"]);
  assert.deepEqual(structure.hardFamilies.map(({ familyId }) => familyId), ["B", "C"]);
});

test("first shared-resource geometry keeps flexible work compact and setup families atomic", () => {
  const tasks = [task("a2", "p2", "flex", 5), task("a1", "p1", "flex", 5), task("b", "p3", "set", 5, "B"), task("c", "p4", "set", 5, "C")];
  const input = problem(tasks);
  const structure = deriveSharedResourceStructures(tasks)[0]!;
  let accepted: Parameters<Parameters<typeof exploreSharedResourceStructure>[6]>[0] | null = null;
  const result = exploreSharedResourceStructure(input, structure, [], [], [], createExactSearchLedger(10_000), (candidate) => {
    accepted = candidate; return "FOUND";
  });
  assert.equal(result.outcome, "FOUND");
  const flexible = accepted!.tasks.filter(({ spaceId }) => spaceId === "flex").sort((a, b) => a.start - b.start);
  assert.equal(flexible[0]!.end, flexible[1]!.start);
  for (const family of ["B", "C"]) {
    const familyTasks = accepted!.tasks.filter(({ setupFamilyId }) => setupFamilyId === family);
    assert.equal(Math.max(...familyTasks.map(({ end }) => end)) - Math.min(...familyTasks.map(({ start }) => start)), 5);
  }
  assert.equal(accepted!.preparations.length, 1);
  assert.equal(accepted!.preparations[0]!.duration, 10);
  assert.equal(result.evidence.maximumFragments, 1);
});

test("necessary-only capacity overload prunes without consuming a branch", () => {
  const tasks = [task("a1", "p1", "flex", 10), task("a2", "p2", "flex", 10), task("b", "p3", "set", 5, "B"), task("c", "p4", "set", 5, "C")];
  const input = problem(tasks, 30);
  const result = exploreSharedResourceStructure(input, deriveSharedResourceStructures(tasks)[0]!, [], [], [], createExactSearchLedger(100), () => "FOUND");
  assert.equal(result.outcome, "DEAD_END");
  assert.equal(result.evidence.capacityPrunes, 1);
  assert.equal(result.evidence.branches, 0);
});
