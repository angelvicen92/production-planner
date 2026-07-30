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

export interface RequiredCompositePositionsResult {
  positions: RequiredCompositePosition[];
  exhausted: boolean;
  rawCombinationCount: number;
  compatibleCombinationCount: number;
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
      const mainTaskDuration = members[0]!.duration;
      const taskBoundaryOffsets = Array.from({ length: members.length + 1 }, (_, index) => index * mainTaskDuration);
      const memberTaskIds = members.map(({ id }) => id);
      return [{
        resourceId: resource.id,
        memberTaskIds,
        productiveDurationMinutes: members.length * mainTaskDuration,
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
  maximumCombinationCount: number,
): RequiredCompositePositionsResult {
  if (blocks.length === 0) return { positions: [{ startIndexByResourceId: {}, signature: "" }], exhausted: false, rawCombinationCount: 0, compatibleCombinationCount: 1 };
  const canonicalBlocks = [...blocks].sort((a, b) => a.resourceId.localeCompare(b.resourceId));
  const byId = new Map(mains.map((task) => [task.id, task]));
  const candidates = canonicalBlocks.map((block) => {
    const requiredKeys = block.memberTaskIds.map((id) => byId.get(id)?.blockKey ?? "").sort();
    return Array.from({ length: mains.length - block.memberTaskIds.length + 1 }, (_, startIndex) => startIndex)
      .filter((startIndex) => pattern.slice(startIndex, startIndex + block.memberTaskIds.length).sort()
        .every((key, index) => key === requiredKeys[index]));
  });
  const output: RequiredCompositePosition[] = [];
  let rawCombinationCount = 0;
  let exhausted = false;
  const visit = (index: number, starts: number[]) => {
    if (exhausted) return;
    if (index < canonicalBlocks.length) {
      for (const start of candidates[index]!) {
        visit(index + 1, [...starts, start]);
        if (exhausted) return;
      }
      return;
    }
    if (rawCombinationCount >= Math.max(0, maximumCombinationCount)) { exhausted = true; return; }
    rawCombinationCount += 1;
    const positionCounts = new Map<string, number>();
    for (let position = 0; position < mains.length; position += 1) {
      const active = canonicalBlocks.filter((block, blockIndex) => position >= starts[blockIndex]!
        && position < starts[blockIndex]! + block.memberTaskIds.length);
      const signature = `${pattern[position] ?? ""}|${active.map((block) => block.resourceId).join(",")}`;
      positionCounts.set(signature, (positionCounts.get(signature) ?? 0) + 1);
    }
    const taskCounts = new Map<string, number>();
    for (const task of mains) {
      const membership = canonicalBlocks.filter((block) => block.memberTaskIds.includes(task.id)).map((block) => block.resourceId).join(",");
      const signature = `${task.blockKey ?? ""}|${membership}`;
      taskCounts.set(signature, (taskCounts.get(signature) ?? 0) + 1);
    }
    const signatures = new Set([...positionCounts.keys(), ...taskCounts.keys()]);
    if ([...signatures].some((signature) => positionCounts.get(signature) !== taskCounts.get(signature))) return;
    const startIndexByResourceId = Object.fromEntries(canonicalBlocks.map((block, blockIndex) => [block.resourceId, starts[blockIndex]]));
    output.push({ startIndexByResourceId, signature: canonicalBlocks.map((block, blockIndex) => `${block.resourceId}:${starts[blockIndex]}`).join("|") });
  };
  visit(0, []);
  return { positions: output, exhausted, rawCombinationCount, compatibleCombinationCount: output.length };
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
