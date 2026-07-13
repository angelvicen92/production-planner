import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState } from "../contracts";
import { resolveORCPlanningEntryOperationalRoleMetadata, occupiesContestantTime } from "../state/nonWorkTaskClassifier";
import { resolveORCSpaceOccupancy, type ORCSpaceOccupancyMode } from "../state/spaceOccupancyResolver";
import { resolveORCTransportContract } from "../state/transportContractResolver";
import { resolveInitialConstructionProtectedIntervalsForAnchor } from "./initialConstructionSearchSpace";

type TaskLike = NonNullable<EngineInput["tasks"]>[number] & Record<string, unknown>;
export type InitialConstructionPlacementReasonCode = "TASK_WINDOW_CONFLICT" | "PROTECTED_INTERVAL_CONFLICT" | "CONTESTANT_OVERLAP" | "SPACE_OVERLAP" | "RESOURCE_OVERLAP";

export interface InitialConstructionPlacementFeasibility {
  valid: boolean;
  reasonCodes: InitialConstructionPlacementReasonCode[];
  checkedDimensions: string[];
  role: ReturnType<typeof resolveORCPlanningEntryOperationalRoleMetadata>;
  contestantOccupiesTime: boolean;
  spaceOccupancyMode: ORCSpaceOccupancyMode;
  spaceCapacity: number | null;
  protectedIntervalConflicts: Array<{ start: string; end: string; scope?: string | null; source?: string | null }>;
  readOnly: true;
}

const toMin = (value?: string | null): number | null => /^\d{2}:\d{2}$/.test(String(value ?? "")) ? Number(String(value).slice(0, 2)) * 60 + Number(String(value).slice(3)) : null;
const durationOf = (task: TaskLike | null | undefined): number => Number(task?.durationOverrideMin ?? task?.durationMin ?? task?.durationMinutes ?? task?.duration ?? 0) || 0;
const overlaps = (a: { startPlanned?: string | null; endPlanned?: string | null; start?: string | null; end?: string | null }, b: { startPlanned?: string | null; endPlanned?: string | null; start?: string | null; end?: string | null }): boolean => {
  const as = toMin(a.startPlanned ?? a.start), ae = toMin(a.endPlanned ?? a.end), bs = toMin(b.startPlanned ?? b.start), be = toMin(b.endPlanned ?? b.end);
  return as != null && ae != null && bs != null && be != null && as < be && bs < ae;
};
const entryOf = (a: CandidateAssignment) => ({ taskId: a.taskId, startPlanned: a.startPlanned ?? "", endPlanned: a.endPlanned ?? "", assignedResourceIds: a.resourceIds ?? [], spaceId: a.spaceId ?? null });
const uniq = <T>(xs: T[]) => [...new Set(xs)];

function taskWindowOk(input: EngineInput, task: TaskLike, assignment: CandidateAssignment): boolean {
  const start = toMin(assignment.startPlanned), end = toMin(assignment.endPlanned), workStart = toMin(input.workDay?.start), workEnd = toMin(input.workDay?.end);
  if (start == null || end == null || workStart == null || workEnd == null) return false;
  if (start < workStart || end > workEnd || end - start !== durationOf(task)) return false;
  const availability = task.contestantId != null ? (input.contestantAvailabilityById ?? {})[Number(task.contestantId)] : null;
  const availabilityStart = toMin(availability?.start ?? input.workDay?.start), availabilityEnd = toMin(availability?.end ?? input.workDay?.end);
  if (availabilityStart != null && start < availabilityStart) return false;
  if (availabilityEnd != null && end > availabilityEnd) return false;
  const fixedStart = toMin(String(task.fixedWindowStart ?? "")), fixedEnd = toMin(String(task.fixedWindowEnd ?? ""));
  if (fixedStart != null && start !== fixedStart) return false;
  if (fixedEnd != null && end !== fixedEnd) return false;
  return true;
}

export function evaluateInitialConstructionPlacementFeasibility(args: { input: EngineInput; originOperationalState: OperationalState; task: TaskLike; assignment: CandidateAssignment; occupiedAssignments: CandidateAssignment[]; tasks: Map<number, TaskLike> }): InitialConstructionPlacementFeasibility {
  const reasonCodes: InitialConstructionPlacementReasonCode[] = [];
  const checkedDimensions = ["task_window", "protected_intervals", "contestant_occupancy", "space_occupancy", "resource_occupancy"];
  const transportContract = (args.originOperationalState.constraints as any)?.transportContract ?? resolveORCTransportContract(args.input as any);
  const mealWindow = args.originOperationalState.availability?.actualMeal ?? args.originOperationalState.availability?.meal ?? args.originOperationalState.availability?.mealWindow ?? (args.input as any).actualMeal ?? (args.input as any).mealWindow ?? (args.input as any).meal ?? null;
  const entry = entryOf(args.assignment) as any;
  const role = resolveORCPlanningEntryOperationalRoleMetadata({ entry, task: args.task, mealWindow, transportContract });
  const contestantOccupiesTime = occupiesContestantTime({ task: args.task, entry, roleMetadata: role, mealWindow, transportContract });
  const occupancy = resolveORCSpaceOccupancy({ entry, task: args.task, roleMetadata: role, spaceConfig: args.originOperationalState.spaces, transportContract });
  if (!taskWindowOk(args.input, args.task, args.assignment)) reasonCodes.push("TASK_WINDOW_CONFLICT");
  const protectedIntervalConflicts = resolveInitialConstructionProtectedIntervalsForAnchor({ input: args.input, anchor: { anchorTaskId: args.task.id, contestantId: args.task.contestantId ?? null, spaceId: args.task.spaceId ?? null, zoneId: args.task.zoneId ?? null } }).filter((interval) => overlaps(args.assignment, interval)).map((interval: any) => ({ start: interval.start, end: interval.end, scope: interval.scope ?? null, source: interval.source ?? null }));
  if (protectedIntervalConflicts.length) reasonCodes.push("PROTECTED_INTERVAL_CONFLICT");
  for (const other of args.occupiedAssignments) {
    if (!overlaps(other, args.assignment)) continue;
    const otherTask = args.tasks.get(other.taskId);
    const otherEntry = entryOf(other) as any;
    const otherRole = resolveORCPlanningEntryOperationalRoleMetadata({ entry: otherEntry, task: otherTask, mealWindow, transportContract });
    if (contestantOccupiesTime && occupiesContestantTime({ task: otherTask, entry: otherEntry, roleMetadata: otherRole, mealWindow, transportContract }) && args.task.contestantId != null && Number(args.task.contestantId) > 0 && args.task.contestantId === otherTask?.contestantId) reasonCodes.push("CONTESTANT_OVERLAP");
    const sharedResources = other.resourceIds.filter((id) => args.assignment.resourceIds.includes(id));
    if (role.countsAsWork && otherRole.countsAsWork && sharedResources.length) reasonCodes.push("RESOURCE_OVERLAP");
    if (args.assignment.spaceId != null && args.assignment.spaceId === other.spaceId) {
      const otherOcc = resolveORCSpaceOccupancy({ entry: otherEntry, task: otherTask, roleMetadata: otherRole, spaceConfig: args.originOperationalState.spaces, transportContract });
      if (occupancy.blocksSpace && otherOcc.blocksSpace && !occupancy.allowsSpaceOverlap && !otherOcc.allowsSpaceOverlap) {
        const spaceId = Number(args.assignment.spaceId);
        const spaces = args.originOperationalState.spaces;
        const capacity = spaces?.exclusiveById?.[spaceId] === true ? 1 : Math.max(1, spaces?.concurrencyById?.[spaceId] ?? spaces?.capacityById?.[spaceId] ?? 1);
        if (capacity < 2) reasonCodes.push("SPACE_OVERLAP");
      }
    }
  }
  return Object.freeze({ valid: reasonCodes.length === 0, reasonCodes: uniq(reasonCodes), checkedDimensions, role, contestantOccupiesTime, spaceOccupancyMode: occupancy.spaceOccupancyMode, spaceCapacity: occupancy.spaceCapacity ?? null, protectedIntervalConflicts, readOnly: true });
}
