import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { materializeAnchoredOperation } from "./anchoredAccompaniment";
import type { MainFlowTimeline } from "./mainFlowMeal";
import { taskFitsRequiredCompositePosition, type RequiredCompositeBlock, type RequiredCompositePosition } from "./requiredCompositeBlock";

export interface MainResidualPosition {
  position: number;
  slot: number;
}

export interface MainResidualMatchingAssessment {
  feasible: boolean;
  remainingTaskCount: number;
  remainingSlotCount: number;
  matchingSize: number;
  unmatchedTaskIds: string[];
  feasibleSlotCountByTaskId: Record<string, number>;
  edgeCount: number;
  edgeEvaluationCount: number;
}

/**
 * Exact necessary feasibility check for the residual main assignment. Future-to-future
 * conflicts are deliberately relaxed; every edge is nevertheless hard-valid against
 * the structural occupations already materialized on the current branch.
 */
export function assessMainResidualMatching(
  problem: PlannerNextProblem,
  remainingMainTasks: readonly Task[],
  remainingPositions: readonly MainResidualPosition[],
  pattern: readonly string[],
  _timeline: MainFlowTimeline | undefined,
  requiredBlocks: readonly RequiredCompositeBlock[],
  compositePosition: RequiredCompositePosition,
  placedStructuralTasks: readonly ScheduledTask[],
  scheduledSpaceMeals: readonly ScheduledSpaceMeal[],
): MainResidualMatchingAssessment {
  const placedIds = new Set(placedStructuralTasks.map(task => task.id));
  const tasks = [...remainingMainTasks]
    .filter(task => task.kind === "main" && !placedIds.has(task.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const positions = [...remainingPositions]
    .sort((a, b) => a.slot - b.slot || a.position - b.position);
  const feasibleSlotsByTask = new Map<string, number[]>();
  let edgeCount = 0;
  let edgeEvaluationCount = 0;

  for (const task of tasks) {
    const slots: number[] = [];
    positions.forEach((candidate, slotIndex) => {
      edgeEvaluationCount += 1;
      if (task.blockKey !== pattern[candidate.position]
        || !taskFitsRequiredCompositePosition(task, candidate.position, requiredBlocks, compositePosition)) return;
      const operation = materializeAnchoredOperation(
        problem,
        task,
        candidate.slot,
        [...placedStructuralTasks],
        [...scheduledSpaceMeals],
      );
      if (!operation) return;
      slots.push(slotIndex);
      edgeCount += 1;
    });
    feasibleSlotsByTask.set(task.id, slots);
  }

  const taskIdBySlot = new Map<number, string>();
  const matchedSlotByTask = new Map<string, number>();
  const augment = (taskId: string, visitedSlots: Set<number>): boolean => {
    for (const slotIndex of feasibleSlotsByTask.get(taskId) ?? []) {
      if (visitedSlots.has(slotIndex)) continue;
      visitedSlots.add(slotIndex);
      const occupant = taskIdBySlot.get(slotIndex);
      if (occupant !== undefined && !augment(occupant, visitedSlots)) continue;
      taskIdBySlot.set(slotIndex, taskId);
      matchedSlotByTask.set(taskId, slotIndex);
      return true;
    }
    return false;
  };

  for (const task of tasks) augment(task.id, new Set<number>());
  const unmatchedTaskIds = tasks.map(task => task.id).filter(id => !matchedSlotByTask.has(id));
  return {
    feasible: tasks.length === positions.length && unmatchedTaskIds.length === 0,
    remainingTaskCount: tasks.length,
    remainingSlotCount: positions.length,
    matchingSize: matchedSlotByTask.size,
    unmatchedTaskIds,
    feasibleSlotCountByTaskId: Object.fromEntries(tasks.map(task => [task.id, feasibleSlotsByTask.get(task.id)?.length ?? 0])),
    edgeCount,
    edgeEvaluationCount,
  };
}
