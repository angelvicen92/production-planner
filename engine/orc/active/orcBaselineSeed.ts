import type { EngineInput, EngineOutput, TaskInput } from "../../types";

export interface ORCBaselineSeedDiagnostics {
  applied: boolean;
  seededPlanningCount: number;
  source: "v4_baseline";
  warnings: string[];
}

export interface ORCBaselineSeededInputResult {
  input: EngineInput;
  baselineSeed: ORCBaselineSeedDiagnostics;
}

type PlannedTask = EngineOutput["plannedTasks"][number];

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));

const resources = (item: PlannedTask): number[] => [...(item.assignedResources ?? [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b);

function assignedSpaceFor(task: TaskInput, planned: PlannedTask, output: EngineOutput): number | null | undefined {
  const scheduled = (output.schedule ?? []).find((item) => item.taskId === planned.taskId);
  if (scheduled?.assignedSpace != null) return scheduled.assignedSpace;
  return task.spaceId ?? null;
}

/**
 * Builds the EngineInput consumed by ORC Active from the original input plus the
 * safe V4 baseline planning. ORC's EngineInput adapter derives
 * OperationalState.planning from task start/end/resources/space fields, so this
 * function seeds those task fields without inventing extra planning data.
 */
export function buildORCBaselineSeededInput(input: EngineInput, v4Output: EngineOutput): ORCBaselineSeededInputResult {
  const warnings: string[] = [];
  const plannedByTask = new Map<number, PlannedTask>();
  for (const planned of v4Output.plannedTasks ?? []) {
    if (!Number.isFinite(Number(planned.taskId)) || !planned.startPlanned || !planned.endPlanned) {
      warnings.push(`Skipped non-convertible V4 planned task ${String(planned.taskId)}.`);
      continue;
    }
    plannedByTask.set(Number(planned.taskId), planned);
  }

  const lockedTaskIds = new Set((input.locks ?? []).map((lock) => lock.taskId));
  let seededPlanningCount = 0;
  const tasks = (input.tasks ?? []).map((task) => {
    const planned = plannedByTask.get(task.id);
    if (!planned) return clone(task);
    const original = clone(task);
    const protectedOrLocked = task.status === "done" || task.status === "in_progress" || lockedTaskIds.has(task.id);
    const hasExistingPlanning = Boolean(task.startPlanned && task.endPlanned);
    seededPlanningCount += 1;
    if (protectedOrLocked && hasExistingPlanning) return original;
    const next: TaskInput = {
      ...original,
      startPlanned: planned.startPlanned,
      endPlanned: planned.endPlanned,
      assignedResourceIds: resources(planned),
    };
    const assignedSpace = assignedSpaceFor(task, planned, v4Output);
    if (assignedSpace !== undefined) next.spaceId = assignedSpace;
    return next;
  });

  if (plannedByTask.size > seededPlanningCount) warnings.push(`${plannedByTask.size - seededPlanningCount} V4 planned task(s) were not present in EngineInput.tasks.`);

  return {
    input: { ...clone(input), tasks },
    baselineSeed: {
      applied: seededPlanningCount > 0,
      seededPlanningCount,
      source: "v4_baseline",
      warnings,
    },
  };
}
