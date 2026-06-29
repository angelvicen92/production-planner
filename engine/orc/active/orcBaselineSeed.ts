import type { EngineInput, EngineOutput, TaskInput } from "../../types";

export interface ORCBaselineSeedDiagnostics {
  applied: boolean;
  seededPlanningCount: number;
  source: "v4_baseline";
  warnings: string[];
  error?: string;
}

export interface ORCBaselineSeededInputResult {
  input: EngineInput;
  baselineSeed: ORCBaselineSeedDiagnostics;
  seedPlanning: ORCBaselinePlanningEntry[];
}

export interface ORCBaselinePlanningEntry {
  taskId: number;
  startPlanned: string;
  endPlanned: string;
  assignedSpace?: number | null;
  assignedResources: number[];
}

type PlannedTask = EngineOutput["plannedTasks"][number];

// Conservative safety cap for the planning-only seed. 219 entries are normally
// well below this; a larger payload means non-minimal data leaked into the seed.
export const ORC_BASELINE_SEED_MAX_SERIALIZED_BYTES = 256 * 1024;

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));

const resources = (item: PlannedTask): number[] => [...(item.assignedResources ?? [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b);

function assignedSpaceFor(task: TaskInput, planned: PlannedTask, output: EngineOutput): number | null | undefined {
  const scheduled = (output.schedule ?? []).find((item) => item.taskId === planned.taskId);
  if (scheduled?.assignedSpace != null) return scheduled.assignedSpace;
  return task.spaceId ?? null;
}

function minimalSeededTask(task: TaskInput, seed: ORCBaselinePlanningEntry | null): TaskInput {
  const next: TaskInput = {
    id: Number(task.id),
    planId: Number(task.planId),
    templateId: Number(task.templateId),
    status: task.status,
    durationOverrideMin: task.durationOverrideMin ?? null,
    camerasOverride: task.camerasOverride ?? null,
    zoneId: task.zoneId ?? null,
    spaceId: seed ? (seed.assignedSpace ?? null) : (task.spaceId ?? null),
    fixedWindowStart: task.fixedWindowStart ?? null,
    fixedWindowEnd: task.fixedWindowEnd ?? null,
  };
  if (task.dependsOnTaskIds?.length) next.dependsOnTaskIds = [...task.dependsOnTaskIds].map(Number).filter(Number.isFinite);
  if (task.dependsOnTemplateIds?.length) next.dependsOnTemplateIds = [...task.dependsOnTemplateIds].map(Number).filter(Number.isFinite);
  if (task.dependsOnTaskId != null) next.dependsOnTaskId = Number(task.dependsOnTaskId);
  if (task.dependsOnTemplateId != null) next.dependsOnTemplateId = Number(task.dependsOnTemplateId);
  if (seed) {
    next.startPlanned = seed.startPlanned;
    next.endPlanned = seed.endPlanned;
    next.assignedResourceIds = [...seed.assignedResources];
  } else if (task.startPlanned && task.endPlanned) {
    next.startPlanned = task.startPlanned;
    next.endPlanned = task.endPlanned;
    next.assignedResourceIds = [...(task.assignedResourceIds ?? [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  }
  return next;
}

export function assertSerializableORCSeed(seed: unknown, maxBytes = ORC_BASELINE_SEED_MAX_SERIALIZED_BYTES): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(seed);
  } catch (error) {
    throw new Error(`baseline_seed_not_serializable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof serialized !== "string") throw new Error("baseline_seed_not_serializable: JSON.stringify returned no payload");
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > maxBytes) throw new Error(`baseline_seed_too_large: ${bytes} bytes exceeds ${maxBytes} byte limit`);
  JSON.parse(serialized);
  return serialized;
}

/**
 * Builds the EngineInput consumed by ORC Active from the original input plus a
 * planning-only V4 baseline seed. The seed itself contains only taskId,
 * start/end, assignedSpace and assignedResources; the ORC input receives a
 * sanitized task list so raw DB/UI entities cannot leak into OperationalState.
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
  const seedByTask = new Map<number, ORCBaselinePlanningEntry>();
  const seedPlanning: ORCBaselinePlanningEntry[] = [];

  for (const task of input.tasks ?? []) {
    const planned = plannedByTask.get(task.id);
    if (!planned) continue;
    const protectedOrLocked = task.status === "done" || task.status === "in_progress" || lockedTaskIds.has(task.id);
    const hasExistingPlanning = Boolean(task.startPlanned && task.endPlanned);
    const entry: ORCBaselinePlanningEntry = protectedOrLocked && hasExistingPlanning
      ? { taskId: task.id, startPlanned: String(task.startPlanned), endPlanned: String(task.endPlanned), assignedSpace: task.spaceId ?? null, assignedResources: [...(task.assignedResourceIds ?? [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b) }
      : { taskId: task.id, startPlanned: planned.startPlanned, endPlanned: planned.endPlanned, assignedSpace: assignedSpaceFor(task, planned, v4Output) ?? null, assignedResources: resources(planned) };
    seedByTask.set(task.id, entry);
    seedPlanning.push(entry);
  }

  if (plannedByTask.size > seedPlanning.length) warnings.push(`${plannedByTask.size - seedPlanning.length} V4 planned task(s) were not present in EngineInput.tasks.`);

  const sanitizedInput: EngineInput = {
    ...clone(input),
    tasks: (input.tasks ?? []).map((task) => minimalSeededTask(task, seedByTask.get(task.id) ?? null)),
  };

  return {
    input: sanitizedInput,
    seedPlanning,
    baselineSeed: {
      applied: seedPlanning.length > 0,
      seededPlanningCount: seedPlanning.length,
      source: "v4_baseline",
      warnings,
    },
  };
}
