import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "./contracts";
import { selectMostConstrainedUnit } from "./macroScheduling";
import { buildResourceScopes, determineCurrentlyEligiblePostCoreScope, type PostCoreDescriptor } from "./postCoreOrchestrator";

const descriptor = (id: string, kind: string, domainSize: number, resourcePressure = 0): PostCoreDescriptor<{ id: string }> => ({
  id, kind, unit: { id }, domainSize, domainExact: true, resourcePressure,
  hardResourceAvailabilityMinutes: 100, exclusiveResourceCount: 0, synchronizedSlotCount: 0,
  totalDuration: 10, affectedTaskCount: 1,
});

test("a smaller later-scope domain cannot overtake an eligible structural scope", () => {
  const scope = determineCurrentlyEligiblePostCoreScope([
    descriptor("flexible", "RESOURCE_TASK", 1), descriptor("chain", "TECHNICAL_CHAIN", 8),
  ])!;
  assert.equal(scope.scope, "CONTINUOUS_STRUCTURE");
  assert.equal(selectMostConstrainedUnit(scope.units)?.id, "chain");
});

test("MRV remains authoritative between units in the same scope", () => {
  const scope = determineCurrentlyEligiblePostCoreScope([
    descriptor("wide", "JOINT", 8), descriptor("narrow", "TECHNICAL_CHAIN", 2),
  ])!;
  assert.equal(selectMostConstrainedUnit(scope.units)?.id, "narrow");
});

test("a certified zero domain retains absolute cross-scope priority", () => {
  const scope = determineCurrentlyEligiblePostCoreScope([
    descriptor("structure", "SETUP_GROUP", 3), descriptor("blocked", "RESOURCE_TASK", 0),
  ])!;
  assert.equal(scope.scope, "HARD_BLOCKER");
  assert.equal(scope.units[0]!.id, "blocked");
});

const task = (id: string, resources: string[]): Task => ({ id, kind: "auxiliary", participantId: id,
  duration: 10, spaceId: `space-${id}`, dependencies: [], requiredResourceIds: resources });

test("an explicit resource shared by multiple tasks forms one resource scope", () => {
  const result = buildResourceScopes([task("a", ["r"]), task("b", ["r"])], new Map([["r", 20]]));
  assert.deepEqual(result.scopes.map(({ resourceId, tasks }) => [resourceId, tasks.map(({ id }) => id)]), [["r", ["a", "b"]]]);
  assert.deepEqual(result.atomic, []);
});

test("a non-shared resource stays atomic and is not automatically elevated", () => {
  const result = buildResourceScopes([task("a", ["r"])], new Map([["r", 100]]));
  assert.equal(result.scopes.length, 0);
  assert.deepEqual(result.atomic.map(({ id }) => id), ["a"]);
  assert.equal(determineCurrentlyEligiblePostCoreScope([descriptor("a", "RESOURCE_TASK", 1)])!.scope, "FLEXIBLE");
});

test("multi-resource tasks remain unique and do not create connected-component fusion", () => {
  const tasks = [task("ab", ["a", "b"]), task("a2", ["a"]), task("b2", ["b"])];
  const result = buildResourceScopes(tasks, new Map([["a", 20], ["b", 40]]));
  assert.equal(result.scopes.flatMap(({ tasks }) => tasks).filter(({ id }) => id === "ab").length, 1);
  assert.deepEqual(result.scopes.map(({ resourceId }) => resourceId), ["a"]);
  assert.deepEqual(result.atomic.map(({ id }) => id), ["b2"]);
});

test("scope determination and resource grouping are input-order invariant", () => {
  const items = [descriptor("z", "RESOURCE_TASK", 1), descriptor("a", "SETUP_GROUP", 4)];
  assert.deepEqual(determineCurrentlyEligiblePostCoreScope(items), determineCurrentlyEligiblePostCoreScope([...items].reverse()));
  const tasks = [task("b", ["r"]), task("a", ["r"])];
  assert.deepEqual(buildResourceScopes(tasks, new Map([["r", 20]])), buildResourceScopes([...tasks].reverse(), new Map([["r", 20]])));
});
