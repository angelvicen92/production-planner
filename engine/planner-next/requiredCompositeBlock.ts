import type { PlannerNextProblem, Task } from "./contracts";

export interface RequiredCompositeBlock {
  resourceId: string;
  memberTaskIds: string[];
  productiveDurationMinutes: number;
  assignedSpaceId: string | undefined;
  taskBoundaryOffsets: number[];
  authorizedMealSplitOffsets: number[];
  canonicalSignature: string;
}

export interface RequiredCompositePosition {
  startIndexByResourceId: Record<string, number>;
  signature: string;
}

/** Builds the provisional, immutable-in-practice units used by main-flow construction. */
export function buildRequiredCompositeBlocks(problem: PlannerNextProblem, mains: readonly Task[]): RequiredCompositeBlock[] {
  return [...problem.resources]
    .filter(({ presenceConcentrationPolicy }) => presenceConcentrationPolicy === "REQUIRED")
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((resource) => {
      const members = [...mains]
        .filter((task) => (task.requiredResourceIds ?? []).includes(resource.id))
        .sort((a, b) => a.id.localeCompare(b.id));
      if (members.length === 0) return [];
      const taskBoundaryOffsets = members.reduce<number[]>((offsets, task) =>
        [...offsets, offsets.at(-1)! + task.duration], [0]);
      const memberTaskIds = members.map(({ id }) => id);
      return [{
        resourceId: resource.id,
        memberTaskIds,
        productiveDurationMinutes: taskBoundaryOffsets.at(-1)!,
        assignedSpaceId: resource.assignedSpaceId,
        taskBoundaryOffsets,
        authorizedMealSplitOffsets: taskBoundaryOffsets.slice(1, -1),
        canonicalSignature: `${resource.id}|${resource.assignedSpaceId ?? ""}|${members.map((task) => `${task.id}:${task.duration}`).join("|")}`,
      }];
    });
}

/** Enumerates macro placements before any member task is selected. */
export function requiredCompositePositions(
  blocks: readonly RequiredCompositeBlock[],
  mains: readonly Task[],
  pattern: readonly string[],
): RequiredCompositePosition[] {
  if (blocks.length === 0) return [{ startIndexByResourceId: {}, signature: "" }];
  const byId = new Map(mains.map((task) => [task.id, task]));
  const candidates = blocks.map((block) => {
    const requiredKeys = block.memberTaskIds.map((id) => byId.get(id)?.blockKey ?? "").sort();
    return Array.from({ length: mains.length - block.memberTaskIds.length + 1 }, (_, startIndex) => startIndex)
      .filter((startIndex) => pattern.slice(startIndex, startIndex + block.memberTaskIds.length).sort()
        .every((key, index) => key === requiredKeys[index]));
  });
  const output: RequiredCompositePosition[] = [];
  const visit = (index: number, starts: number[]) => {
    if (index < blocks.length) {
      for (const start of candidates[index]!) visit(index + 1, [...starts, start]);
      return;
    }
    for (let position = 0; position < mains.length; position += 1) {
      const active = blocks.filter((block, blockIndex) => position >= starts[blockIndex]!
        && position < starts[blockIndex]! + block.memberTaskIds.length);
      const eligible = mains.some((task) => active.every((block) => block.memberTaskIds.includes(task.id))
        && blocks.filter((block) => !active.includes(block)).every((block) => !block.memberTaskIds.includes(task.id)));
      if (!eligible) return;
    }
    const startIndexByResourceId = Object.fromEntries(blocks.map((block, blockIndex) => [block.resourceId, starts[blockIndex]]));
    output.push({ startIndexByResourceId, signature: blocks.map((block, blockIndex) => `${block.resourceId}:${starts[blockIndex]}`).join("|") });
  };
  visit(0, []);
  return output;
}

export function taskFitsRequiredCompositePosition(
  task: Task,
  position: number,
  blocks: readonly RequiredCompositeBlock[],
  compositePosition: RequiredCompositePosition,
): boolean {
  return blocks.every((block) => {
    const start = compositePosition.startIndexByResourceId[block.resourceId]!;
    return block.memberTaskIds.includes(task.id) === (position >= start && position < start + block.memberTaskIds.length);
  });
}
