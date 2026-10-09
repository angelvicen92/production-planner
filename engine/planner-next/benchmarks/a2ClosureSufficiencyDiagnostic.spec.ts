import assert from "node:assert/strict";
import test from "node:test";
import { inventoryA2ClosureAncestors, replayA2AcceptedTasks, replayA2OperationalMeals } from "./a2ClosureSufficiencyDiagnostic";
import { buildCanonicalA2AssistedStage1Fixture } from "./canonicalA2AssistedStage1Fixture";
import { runExactItinerantPlanSearch } from "../exactItinerantPlan";

test("A2 inventory retains every direct ancestor and distinguishes representation from joint context", () => {
  const inventory = inventoryA2ClosureAncestors();
  assert.equal(inventory.sourceObligations, 266);
  assert.equal(inventory.pendingCount, 209); assert.equal(inventory.directCount, 209);
  assert.deepEqual(inventory.transitiveOnly, []); assert.equal(inventory.uncovered.length, 104);
  assert.equal(inventory.identities.filter(row => row.producer === "TECHNICAL_WITNESS_NOT_COMPOSED").length, 8);
  assert.equal(inventory.groups.filter(group => /CROMA|ESTRELLAS|SILLON/.test(group.identity))
    .reduce((sum, group) => sum + group.taskIds.length, 0), 36);
  assert.deepEqual(inventory, inventoryA2ClosureAncestors());
  assert.equal(inventory.canonicalContracts.arrival.targetGroupSize, 3);
  assert.equal(inventory.canonicalContracts.arrival.maximumGroupSize, 3);
  assert.equal(inventory.canonicalContracts.arrival.minGapMinutes, 30);
});

test("diagnostic inventory cannot alter the current product preflight, result, accounting or input", () => {
  const fixture = buildCanonicalA2AssistedStage1Fixture(), problem = fixture.assisted.problem;
  const saved = structuredClone(problem), before = runExactItinerantPlanSearch(problem);
  inventoryA2ClosureAncestors();
  const after = runExactItinerantPlanSearch(problem);
  assert.deepEqual(after, before); assert.deepEqual(problem, saved);
  assert.equal(after.status, "UNSUPPORTED_STANDALONE_SHAPE"); assert.equal(after.evidence.branchesExplored, 0);
  assert.equal(after.evidence.futureCollectiveClosurePendingPredecessorTaskIds.length, 104);
});

test("accepted resource/unit and operational-meal snapshots replay through their existing authorities", () => {
  const fixture = buildCanonicalA2AssistedStage1Fixture();
  const task = fixture.input.tasks.find(task => task.plannerNextKind === "main" && task.itinerantTeamId == null
    && fixture.adapter.problem.tasks.find(source => source.id === `task:${task.id}`)?.coachId === "plan-resource:4005")!;
  const row = { taskId: task.id, startPlanned: "11:40", endPlanned: "11:55", spaceId: task.spaceId!,
    itinerantTeamId: 5001, assignedResourceIds: [4002, 4005, 4007] };
  const fixed = replayA2AcceptedTasks([row]);
  assert.equal(fixed.length, 1); assert.equal(fixed[0]!.id, `task:${task.id}`);
  assert.equal(fixed[0]!.itinerantUnitId, "itinerant-team:5001");
  assert.deepEqual(fixed[0]!.requiredResourceIds, ["plan-resource:4002", "plan-resource:4007"]);
  assert.equal(fixed[0]!.start, 700); assert.equal(fixed[0]!.end, 715);
  const meals = replayA2OperationalMeals([{ policyId: "break:main-flow", startPlanned: "13:55", endPlanned: "15:10" }]);
  assert.equal(meals[0]!.start, 835); assert.equal(meals[0]!.duration, 75);
  assert.deepEqual(meals[0]!.spaceIds, [fixture.adapter.problem.mainFlow.spaceId]);
});
