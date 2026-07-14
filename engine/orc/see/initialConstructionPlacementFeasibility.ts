import type { EngineInput } from "../../types";
import type { CandidateAssignment, OperationalState } from "../contracts";
import { resolveORCPlanningEntryOperationalRoleMetadata, occupiesContestantTime } from "../state/nonWorkTaskClassifier";
import { resolveORCSpaceOccupancy, type ORCSpaceOccupancyMode } from "../state/spaceOccupancyResolver";
import { evaluateORCSpaceCapacitySemantics } from "../state/spaceCapacitySemantics";
import { resolveORCTransportContract } from "../state/transportContractResolver";
import { resolveInitialConstructionProtectedIntervalsForAnchor } from "./initialConstructionSearchSpace";
import { resolveORCTaskDependencyGraph } from "../state/dependencySemantics";

type TaskLike = NonNullable<EngineInput["tasks"]>[number] & Record<string, unknown>;
export type InitialConstructionPlacementReasonCode = "TASK_WINDOW_CONFLICT" | "PROTECTED_INTERVAL_CONFLICT" | "CONTESTANT_OVERLAP" | "SPACE_OVERLAP" | "RESOURCE_OVERLAP" | "DEPENDENCY_CONFLICT";
export type InitialConstructionTaskWindowConflictKind = "OUTSIDE_WORKDAY" | "OUTSIDE_AVAILABILITY" | "FIXED_START" | "FIXED_END" | "DURATION_INCONSISTENT" | "DEPENDENCY_LOWER_BOUND" | "DEPENDENCY_UPPER_BOUND";

export interface InitialConstructionPlacementFeasibility {
  valid: boolean;
  reasonCodes: InitialConstructionPlacementReasonCode[];
  checkedDimensions: string[];
  role: ReturnType<typeof resolveORCPlanningEntryOperationalRoleMetadata>;
  contestantOccupiesTime: boolean;
  spaceOccupancyMode: ORCSpaceOccupancyMode;
  spaceCapacity: number | null;
  protectedIntervalConflicts: Array<{ start: string; end: string; scope?: string | null; source?: string | null }>;
  taskWindowConflictDetails: Array<{ kind: InitialConstructionTaskWindowConflictKind; taskId: number; conflictTaskIds: number[]; expected?: string | number | null; actual?: string | number | null; readOnly: true }>;
  contestantConflictTaskIds: number[];
  spaceConflictTaskIds: number[];
  resourceConflictTaskIds: number[];
  protectedIntervalConflictIds: string[];
  dependencyLowerBoundTaskIds: number[];
  dependencyUpperBoundTaskIds: number[];
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

function resolveTaskWindowConflictDetails(input: EngineInput, task: TaskLike, assignment: CandidateAssignment, occupied: CandidateAssignment[], tasks: Map<number, TaskLike>) {
  const graph = resolveORCTaskDependencyGraph([...(input.tasks ?? [])] as any);
  const edgeByKey = new Map(graph.edges.map((e) => [`${e.fromTaskId}->${e.toTaskId}`, e]));
  const details: InitialConstructionPlacementFeasibility["taskWindowConflictDetails"] = [];
  const add = (kind: InitialConstructionTaskWindowConflictKind, conflictTaskIds: number[] = [], expected: any = null, actual: any = null) => details.push({ kind, taskId: Number(task.id), conflictTaskIds: uniq(conflictTaskIds), expected, actual, readOnly: true });
  const start = toMin(assignment.startPlanned), end = toMin(assignment.endPlanned), workStart = toMin(input.workDay?.start), workEnd = toMin(input.workDay?.end);
  if (start == null || end == null || workStart == null || workEnd == null || start < workStart || end > workEnd) add("OUTSIDE_WORKDAY", [], `${input.workDay?.start ?? null}-${input.workDay?.end ?? null}`, `${assignment.startPlanned ?? null}-${assignment.endPlanned ?? null}`);
  if (start != null && end != null && end - start !== durationOf(task)) add("DURATION_INCONSISTENT", [], durationOf(task), end - start);
  const availability = task.contestantId != null ? (input.contestantAvailabilityById ?? {})[Number(task.contestantId)] : null;
  const availabilityStart = toMin(availability?.start ?? input.workDay?.start), availabilityEnd = toMin(availability?.end ?? input.workDay?.end);
  if ((availabilityStart != null && start != null && start < availabilityStart) || (availabilityEnd != null && end != null && end > availabilityEnd)) add("OUTSIDE_AVAILABILITY", [], `${availability?.start ?? input.workDay?.start ?? null}-${availability?.end ?? input.workDay?.end ?? null}`, `${assignment.startPlanned ?? null}-${assignment.endPlanned ?? null}`);
  const fixedStart = toMin(String(task.fixedWindowStart ?? "")), fixedEnd = toMin(String(task.fixedWindowEnd ?? ""));
  if (fixedStart != null && start !== fixedStart) add("FIXED_START", [], task.fixedWindowStart, assignment.startPlanned);
  if (fixedEnd != null && end !== fixedEnd) add("FIXED_END", [], task.fixedWindowEnd, assignment.endPlanned);
  for (const id of graph.prerequisitesByTaskId.get(Number(task.id)) ?? []) { const a = occupied.find(x=>Number(x.taskId)===id); const edge = edgeByKey.get(`${id}->${Number(task.id)}`); if (a && toMin(a.endPlanned) != null && start != null && start < (toMin(a.endPlanned) as number)) add("DEPENDENCY_LOWER_BOUND", [id], { prerequisiteTaskId:id, dependentTaskId:Number(task.id), sourceTypes:edge?.sourceTypes ?? [], expected:a.endPlanned }, assignment.startPlanned); }
  for (const id of graph.dependentsByTaskId.get(Number(task.id)) ?? []) { const a = occupied.find(x=>Number(x.taskId)===id); const edge = edgeByKey.get(`${Number(task.id)}->${id}`); if (a && toMin(a.startPlanned) != null && end != null && end > (toMin(a.startPlanned) as number)) add("DEPENDENCY_UPPER_BOUND", [id], { prerequisiteTaskId:Number(task.id), dependentTaskId:id, sourceTypes:edge?.sourceTypes ?? [], expected:a.startPlanned }, assignment.endPlanned); }
  return details;
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
  const taskWindowConflictDetails: InitialConstructionPlacementFeasibility["taskWindowConflictDetails"] = resolveTaskWindowConflictDetails(args.input, args.task, args.assignment, args.occupiedAssignments, args.tasks);
  if (taskWindowConflictDetails.length) reasonCodes.push("TASK_WINDOW_CONFLICT");
  const dependencyLowerBoundTaskIds: number[] = uniq(taskWindowConflictDetails.filter((d: any)=>d.kind==="DEPENDENCY_LOWER_BOUND").flatMap((d: any)=>d.conflictTaskIds));
  const dependencyUpperBoundTaskIds: number[] = uniq(taskWindowConflictDetails.filter((d: any)=>d.kind==="DEPENDENCY_UPPER_BOUND").flatMap((d: any)=>d.conflictTaskIds));
  if (dependencyLowerBoundTaskIds.length || dependencyUpperBoundTaskIds.length) reasonCodes.push("DEPENDENCY_CONFLICT");
  const protectedIntervalConflicts = resolveInitialConstructionProtectedIntervalsForAnchor({ input: args.input, anchor: { anchorTaskId: args.task.id, contestantId: args.task.contestantId ?? null, spaceId: args.task.spaceId ?? null, zoneId: args.task.zoneId ?? null } }).filter((interval) => overlaps(args.assignment, interval)).map((interval: any) => ({ start: interval.start, end: interval.end, scope: interval.scope ?? null, source: interval.source ?? null }));
  if (protectedIntervalConflicts.length) reasonCodes.push("PROTECTED_INTERVAL_CONFLICT");
  const protectedIntervalConflictIds = protectedIntervalConflicts.map((i)=>`${i.source ?? "protected"}:${i.scope ?? "global"}:${i.start}-${i.end}`).sort();
  const contestantConflictTaskIds: number[] = [];
  const resourceConflictTaskIds: number[] = [];

  const spaceEntries = [args.assignment, ...args.occupiedAssignments].map(entryOf) as any[];
  const spaceViolations = evaluateORCSpaceCapacitySemantics({ entries: spaceEntries, tasks: args.tasks as any, spaces: args.originOperationalState.spaces, mealWindow, transportContract }).filter((violation) => violation.taskIds.includes(args.assignment.taskId));
  const spaceConflictTaskIds = uniq(spaceViolations.flatMap((violation:any)=>violation.taskIds).map(Number).filter((id:number)=>id!==Number(args.assignment.taskId)));
  if (spaceViolations.length) reasonCodes.push("SPACE_OVERLAP");
  for (const other of args.occupiedAssignments) {
    if (!overlaps(other, args.assignment)) continue;
    const otherTask = args.tasks.get(other.taskId);
    const otherEntry = entryOf(other) as any;
    const otherRole = resolveORCPlanningEntryOperationalRoleMetadata({ entry: otherEntry, task: otherTask, mealWindow, transportContract });
    if (contestantOccupiesTime && occupiesContestantTime({ task: otherTask, entry: otherEntry, roleMetadata: otherRole, mealWindow, transportContract }) && args.task.contestantId != null && Number(args.task.contestantId) > 0 && args.task.contestantId === otherTask?.contestantId) { reasonCodes.push("CONTESTANT_OVERLAP"); contestantConflictTaskIds.push(Number(other.taskId)); }
    const sharedResources = other.resourceIds.filter((id) => args.assignment.resourceIds.includes(id));
    if (role.countsAsWork && otherRole.countsAsWork && sharedResources.length) { reasonCodes.push("RESOURCE_OVERLAP"); resourceConflictTaskIds.push(Number(other.taskId)); }
  }
  return Object.freeze({ valid: reasonCodes.length === 0, reasonCodes: uniq(reasonCodes), checkedDimensions, role, contestantOccupiesTime, spaceOccupancyMode: occupancy.spaceOccupancyMode, spaceCapacity: occupancy.spaceCapacity ?? null, protectedIntervalConflicts, taskWindowConflictDetails, contestantConflictTaskIds: uniq(contestantConflictTaskIds), spaceConflictTaskIds, resourceConflictTaskIds: uniq(resourceConflictTaskIds), protectedIntervalConflictIds, dependencyLowerBoundTaskIds, dependencyUpperBoundTaskIds, readOnly: true });
}
