import type { EngineInput, EngineOutput, TaskInput, TimeWindow } from "../../types";
import { resolveORCPlanningEntryOperationalRoleMetadata, isORCProductiveRole, isORCSpaceBlockingRole, type ORCPlanningEntryOperationalRole } from "../state/nonWorkTaskClassifier";
import { resolveORCTransportContract, type ORCTransportContract } from "../state/transportContractResolver";

export interface ORCBaselineSeedDiagnostics {
  applied: boolean;
  v4PlannedCount: number;
  protectedExistingPlanningCount: number;
  clearedRawPlanningCount: number;
  unseededPendingCount: number;
  seededPlanningCount: number;
  sourcePlanningCount: number;
  source: "v4_baseline";
  warnings: string[];
  error?: string;
  operationalRoleSummary?: Record<string, number>;
  productiveSeededCount?: number;
  nonProductiveSeededCount?: number;
  mealPlaceholderCount?: number;
  arrivalPlaceholderCount?: number;
  callTimePlaceholderCount?: number;
  nonOperationalPlaceholderCount?: number;
  sharedSpaceOccupancyCount?: number;
  nonBlockingSpaceOccupancyCount?: number;
  exclusiveSpaceOccupancyCount?: number;
  spaceOccupancySummary?: Record<string, number>;
  spaceBlockingPlaceholderCount?: number;
  unknownRoleCount?: number;
  roleWarnings?: string[];
  transportArrivalCount?: number;
  transportDepartureCount?: number;
  transportSeededCount?: number;
  transportNonBlockingCount?: number;
  transportContractConfigured?: boolean;
  transportContractWarnings?: string[];
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
  source: "v4_planned_task" | "protected_existing_planning";
  seedSource: "v4_planned_task" | "protected_existing_planning";
  operationalRole: ORCPlanningEntryOperationalRole;
  blocksSpace: boolean;
  countsAsWork: boolean;
  countsForMainFlow: boolean;
  countsForResourceLoad: boolean;
  countsForTalentLoad: boolean;
  allowsSpaceOverlap?: boolean;
  spaceOccupancyMode?: "exclusive" | "shared" | "non_blocking";
  transportGroupCapacity?: number | null;
  transportGroupingTarget?: number | null;
  transportGroupingWeight?: number | null;
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


const roleFlags = (role: ORCPlanningEntryOperationalRole, task: TaskInput, entry: Pick<ORCBaselinePlanningEntry, "assignedResources">): Pick<ORCBaselinePlanningEntry, "blocksSpace" | "countsAsWork" | "countsForMainFlow" | "countsForResourceLoad" | "countsForTalentLoad"> => {
  const blocksSpace = (task.blocksSpace === true) || isORCSpaceBlockingRole(role);
  const countsAsWork = isORCProductiveRole(role);
  return {
    blocksSpace,
    countsAsWork,
    countsForMainFlow: countsAsWork,
    countsForResourceLoad: countsAsWork || ((entry.assignedResources?.length ?? 0) > 0 && task.countsForResourceLoad === true),
    countsForTalentLoad: countsAsWork,
  };
};

function classifySeed(task: TaskInput, partial: { taskId: number; startPlanned: string; endPlanned: string; assignedSpace?: number | null; assignedResources: number[]; source: "v4_planned_task" | "protected_existing_planning" }, mealWindow: TimeWindow | null, transportContract: ORCTransportContract): ORCBaselinePlanningEntry {
  const roleMeta = resolveORCPlanningEntryOperationalRoleMetadata({ entry: { taskId: partial.taskId, startPlanned: partial.startPlanned, endPlanned: partial.endPlanned, assignedResourceIds: partial.assignedResources, spaceId: partial.assignedSpace ?? null }, task, mealWindow, transportContract });
  const isTransport = roleMeta.role === "transport_arrival" || roleMeta.role === "transport_departure";
  const flags = isTransport ? {
    blocksSpace: task.blocksSpace === true ? true : roleMeta.blocksSpace,
    countsAsWork: roleMeta.countsAsWork,
    countsForMainFlow: roleMeta.countsForMainFlow,
    countsForResourceLoad: roleMeta.countsForResourceLoad,
    countsForTalentLoad: roleMeta.countsForTalentLoad,
  } : roleFlags(roleMeta.role, task, partial);
  return { ...partial, seedSource: partial.source, operationalRole: roleMeta.role, ...flags, allowsSpaceOverlap: roleMeta.allowsSpaceOverlap, spaceOccupancyMode: roleMeta.spaceOccupancyMode, transportGroupCapacity: roleMeta.transportGroupCapacity ?? null, transportGroupingTarget: roleMeta.transportGroupingTarget ?? null, transportGroupingWeight: roleMeta.transportGroupingWeight ?? null };
}

function minimalSeededTask(task: TaskInput, seed: ORCBaselinePlanningEntry | null, preserveExistingPlanning: boolean): TaskInput {
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
    next.seedSource = seed.seedSource;
    next.operationalRole = seed.operationalRole;
    next.blocksSpace = seed.blocksSpace;
    next.countsAsWork = seed.countsAsWork;
    next.countsForMainFlow = seed.countsForMainFlow;
    next.countsForResourceLoad = seed.countsForResourceLoad;
    next.countsForTalentLoad = seed.countsForTalentLoad;
    next.allowsSpaceOverlap = seed.allowsSpaceOverlap;
    next.spaceOccupancyMode = seed.spaceOccupancyMode;
    next.transportGroupCapacity = seed.transportGroupCapacity;
    next.transportGroupingTarget = seed.transportGroupingTarget;
    next.transportGroupingWeight = seed.transportGroupingWeight;
  } else if (preserveExistingPlanning && task.startPlanned && task.endPlanned) {
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

  const lockedTaskIds = new Set((input.locks ?? []).map((lock) => Number(lock.taskId)).filter(Number.isFinite));
  const seedByTask = new Map<number, ORCBaselinePlanningEntry>();
  const seedPlanning: ORCBaselinePlanningEntry[] = [];
  const preserveExistingByTask = new Set<number>();
  let protectedExistingPlanningCount = 0;
  let clearedRawPlanningCount = 0;
  let unseededPendingCount = 0;
  let v4SeededCount = 0;
  const mealWindow = input.actualMeal ?? input.mealWindow ?? input.meal ?? null;
  const transportContract = resolveORCTransportContract(input as any);

  for (const task of input.tasks ?? []) {
    const planned = plannedByTask.get(task.id);
    const protectedOrLocked = task.status === "done" || task.status === "in_progress" || lockedTaskIds.has(Number(task.id));
    const hasExistingPlanning = Boolean(task.startPlanned && task.endPlanned);
    if (!planned) {
      if (protectedOrLocked && hasExistingPlanning) {
        const entry = classifySeed(task, { taskId: task.id, startPlanned: String(task.startPlanned), endPlanned: String(task.endPlanned), assignedSpace: task.spaceId ?? null, assignedResources: [...(task.assignedResourceIds ?? [])].map(Number).filter(Number.isFinite).sort((a, b) => a - b), source: "protected_existing_planning" }, mealWindow, transportContract);
        seedByTask.set(task.id, entry);
        seedPlanning.push(entry);
        preserveExistingByTask.add(task.id);
        protectedExistingPlanningCount += 1;
      } else {
        unseededPendingCount += 1;
        if (hasExistingPlanning || (task.assignedResourceIds?.length ?? 0) > 0) clearedRawPlanningCount += 1;
      }
      continue;
    }
    const entry = classifySeed(task, { taskId: task.id, startPlanned: planned.startPlanned, endPlanned: planned.endPlanned, assignedSpace: assignedSpaceFor(task, planned, v4Output) ?? null, assignedResources: resources(planned), source: "v4_planned_task" }, mealWindow, transportContract);
    seedByTask.set(task.id, entry);
    seedPlanning.push(entry);
    v4SeededCount += 1;
  }

  if (plannedByTask.size > v4SeededCount) warnings.push(`${plannedByTask.size - v4SeededCount} V4 planned task(s) were not present in EngineInput.tasks.`);
  if (clearedRawPlanningCount > 0) warnings.push(`Cleared raw planning from ${clearedRawPlanningCount} pending task(s) not present in V4 output.`);
  if (protectedExistingPlanningCount > 0) warnings.push(`Preserved existing planning for ${protectedExistingPlanningCount} protected/locked task(s).`);
  if (plannedByTask.size === 0) warnings.push("V4 produced no planned tasks; ORC baseline seed contains only protected/locked planning.");

  const operationalRoleSummary = seedPlanning.reduce<Record<string, number>>((acc, entry) => { acc[entry.operationalRole] = (acc[entry.operationalRole] ?? 0) + 1; return acc; }, {});
  const productiveSeededCount = seedPlanning.filter((entry) => entry.countsAsWork).length;
  const nonProductiveSeededCount = seedPlanning.length - productiveSeededCount;
  const transportArrivalCount = operationalRoleSummary.transport_arrival ?? 0;
  const transportDepartureCount = operationalRoleSummary.transport_departure ?? 0;
  const transportSeededCount = transportArrivalCount + transportDepartureCount;
  const transportNonBlockingCount = seedPlanning.filter((entry) => (entry.operationalRole === "transport_arrival" || entry.operationalRole === "transport_departure") && entry.blocksSpace === false).length;
  const roleWarnings: string[] = [];
  const spaceOccupancySummary = seedPlanning.reduce<Record<string, number>>((acc, entry) => { const mode = entry.blocksSpace ? "exclusive" : "non_blocking"; acc[mode] = (acc[mode] ?? 0) + 1; return acc; }, {});

  const sanitizedInput: EngineInput = {
    ...clone(input),
    tasks: (input.tasks ?? []).map((task) => minimalSeededTask(task, seedByTask.get(task.id) ?? null, preserveExistingByTask.has(task.id))),
  };

  return {
    input: sanitizedInput,
    seedPlanning,
    baselineSeed: {
      applied: seedPlanning.length > 0,
      v4PlannedCount: plannedByTask.size,
      protectedExistingPlanningCount,
      clearedRawPlanningCount,
      unseededPendingCount,
      seededPlanningCount: seedPlanning.length,
      sourcePlanningCount: v4Output.plannedTasks?.length ?? 0,
      source: "v4_baseline",
      warnings,
      operationalRoleSummary,
      productiveSeededCount,
      nonProductiveSeededCount,
      mealPlaceholderCount: operationalRoleSummary.meal_break_placeholder ?? 0,
      arrivalPlaceholderCount: operationalRoleSummary.arrival_placeholder ?? 0,
      callTimePlaceholderCount: operationalRoleSummary.call_time_placeholder ?? 0,
      nonOperationalPlaceholderCount: operationalRoleSummary.non_operational_placeholder ?? 0,
      sharedSpaceOccupancyCount: spaceOccupancySummary.shared ?? 0,
      nonBlockingSpaceOccupancyCount: spaceOccupancySummary.non_blocking ?? 0,
      exclusiveSpaceOccupancyCount: spaceOccupancySummary.exclusive ?? 0,
      spaceOccupancySummary,
      spaceBlockingPlaceholderCount: seedPlanning.filter((entry) => entry.blocksSpace && !entry.countsAsWork).length,
      unknownRoleCount: operationalRoleSummary.unknown ?? 0,
      roleWarnings,
      transportArrivalCount,
      transportDepartureCount,
      transportSeededCount,
      transportNonBlockingCount,
      transportContractConfigured: transportContract.configured,
      transportContractWarnings: [...transportContract.warnings],
    },
  };
}
