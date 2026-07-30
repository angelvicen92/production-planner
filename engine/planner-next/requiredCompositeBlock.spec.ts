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

test("unequal durations define meal cuts only at task boundaries", () => {
  const problem = requiredContinuousResourceScenario("FEASIBLE_CONTIGUOUS");
  const mains = problem.tasks.filter((task) => task.kind === "main").slice(0, 3)
    .map((task, index) => ({ ...task, duration: [30, 20, 40][index]! }));
  const block = buildRequiredCompositeBlocks(problem, mains)[0]!;
  assert.equal(block.productiveDurationMinutes, 90);
  assert.deepEqual(block.taskBoundaryOffsets, [0, 30, 50, 90]);
  assert.deepEqual(block.authorizedMealSplitOffsets, [30, 50]);
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
  const positions = requiredCompositePositions(blocks, mains, pattern);
  assert.ok(positions.length > 0);
  for (const position of positions) for (let index = 0; index < mains.length; index += 1) {
    const fits = mains.filter((task) => taskFitsRequiredCompositePosition(task, index, blocks, position));
    const inside = index >= position.startIndexByResourceId[blocks[0]!.resourceId]!
      && index < position.startIndexByResourceId[blocks[0]!.resourceId]! + required.length;
    assert.equal(fits.some((task) => task.id.startsWith("foreign-")), !inside);
  }
});
