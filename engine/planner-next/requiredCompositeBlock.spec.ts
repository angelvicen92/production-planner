import assert from "node:assert/strict";
import test from "node:test";
import { buildRequiredCompositeBlocks, requiredCompositePositions, taskFitsRequiredCompositePosition } from "./requiredCompositeBlock";
import { requiredContinuousResourceScenario } from "./scenarios/requiredContinuousResourceScenario";

test("ten 30-minute REQUIRED tasks form one 300-minute composite block", () => {
  const problem = requiredContinuousResourceScenario("FEASIBLE_CONTIGUOUS");
  const template = problem.tasks.find((task) => task.kind === "main")!;
  const mains = Array.from({ length: 10 }, (_, index) => ({
    ...template, id: `main-${index}`, participantId: `participant-${index}`, duration: 30,
  }));
  const input = JSON.stringify(problem);
  const blocks = buildRequiredCompositeBlocks(problem, mains);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.productiveDurationMinutes, 300);
  assert.equal(blocks[0]!.memberTaskIds.length, 10);
  assert.deepEqual(blocks[0]!.taskBoundaryOffsets, [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
  assert.deepEqual(blocks[0]!.authorizedMealSplitOffsets, [30, 60, 90, 120, 150, 180, 210, 240, 270]);
  assert.equal(JSON.stringify(problem), input);
});

test("macro placement excludes foreign tasks from the REQUIRED block", () => {
  const problem = requiredContinuousResourceScenario("FEASIBLE_CONTIGUOUS");
  const required = problem.tasks.filter((task) => task.kind === "main");
  const foreign = required.slice(0, 2).map((task, index) => ({
    ...task, id: `foreign-${index}`, requiredResourceIds: [], participantId: `foreign-participant-${index}`,
  }));
  const mains = [...required, ...foreign];
  const blocks = buildRequiredCompositeBlocks(problem, mains);
  const pattern = mains.map((task) => task.blockKey ?? "");
  const result = requiredCompositePositions(blocks, mains, pattern, 100);
  assert.ok(result.positions.length > 0);
  assert.equal(result.exhausted, false);
  for (const position of result.positions) for (let index = 0; index < mains.length; index += 1) {
    const fits = mains.filter((task) => taskFitsRequiredCompositePosition(task, index, blocks, position));
    const inside = index >= position.startIndexByResourceId[blocks[0]!.resourceId]!
      && index < position.startIndexByResourceId[blocks[0]!.resourceId]! + required.length;
    assert.equal(fits.some((task) => task.id.startsWith("foreign-")), !inside);
  }
});

test("zero members produce no block and all members have one macro position", () => {
  const problem = requiredContinuousResourceScenario("FEASIBLE_CONTIGUOUS");
  const mains = problem.tasks.filter((task) => task.kind === "main");
  assert.deepEqual(buildRequiredCompositeBlocks(problem, mains.map((task) => ({ ...task, requiredResourceIds: [] }))), []);
  const blocks = buildRequiredCompositeBlocks(problem, mains);
  const result = requiredCompositePositions(blocks, mains, mains.map((task) => task.blockKey ?? ""), 10);
  assert.equal(result.compatibleCombinationCount, 1);
  assert.equal(result.rawCombinationCount, 1);
});

test("multiple REQUIRED resources are canonical, signature-exact, and bounded", () => {
  const problem = requiredContinuousResourceScenario("MULTIPLE_REQUIRED_RESOURCES");
  const mains = problem.tasks.filter((task) => task.kind === "main");
  const blocks = buildRequiredCompositeBlocks(problem, mains);
  const pattern = mains.map((task) => task.blockKey ?? "");
  const first = requiredCompositePositions([...blocks].reverse(), [...mains].reverse(), pattern, 100);
  const second = requiredCompositePositions(blocks, mains, pattern, 100);
  assert.deepEqual(first.positions, second.positions);
  assert.ok(second.positions.every((position) => position.signature.split("|").map((part) => part.split(":")[0]).join(",")
    === [...blocks].sort((a, b) => a.resourceId.localeCompare(b.resourceId)).map((block) => block.resourceId).join(",")));
  const limited = requiredCompositePositions(blocks, mains, pattern, 1);
  assert.equal(limited.exhausted, second.rawCombinationCount > 1);
  assert.equal(limited.rawCombinationCount, 1);
});
