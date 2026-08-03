import { createHash } from "node:crypto";
import type { EngineInput, TimeWindow } from "../../types";
import type { AnchoredAccompaniment, Minute, PlannerNextProblem, Task, Window } from "../contracts";
import { resolveEffectivePlanResourceAvailability } from "./effectivePlanResourceAvailability";
import { resolveEffectivePlanSpatialAvailability } from "./effectivePlanSpatialAvailability";
import { resolveEffectiveTaskResourceAssignments } from "./effectiveTaskResourceAssignments";
import {
  preflightEngineInputForPlannerNext,
  resolveProtectedTaskInterval,
  type EngineInputIdentity,
  type EngineInputPreflightDiagnostics,
  type EngineInputPreflightIssue,
  type EngineInputPreflightReasonCode,
} from "./engineInputPreflight";

export type EngineInputAdapterResult = EngineInputAdapterSupportedResult | EngineInputAdapterUnsupportedResult;

interface EngineInputAdapterEnvelope {
  readonly identityMap: readonly EngineInputIdentity[];
  readonly diagnostics: EngineInputPreflightDiagnostics;
  readonly sourceFingerprint: string;
  readonly identityMapFingerprint: string;
  readonly readOnly: true;
}

export interface EngineInputAdapterSupportedResult extends EngineInputAdapterEnvelope {
  readonly status: "SUPPORTED";
  readonly problem: PlannerNextProblem;
  readonly diagnostics: EngineInputPreflightDiagnostics;
  readonly issues: readonly EngineInputPreflightIssue[];
  readonly reasonCodes: readonly [];
  readonly problemFingerprint: string;
}

export interface EngineInputAdapterUnsupportedResult extends EngineInputAdapterEnvelope {
  readonly status: "UNSUPPORTED";
  readonly problem: null;
  readonly diagnostics: EngineInputPreflightDiagnostics;
  readonly issues: readonly EngineInputPreflightIssue[];
  readonly reasonCodes: readonly EngineInputPreflightReasonCode[];
  readonly problemFingerprint: null;
}

const compare = (left: string, right: string): number => left.localeCompare(right, "en");

/** Planner Next uses minutes since 00:00 as its explicit temporal origin. */
export function engineTimeToMinute(value: string): Minute {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new RangeError(`Invalid HH:mm value: ${value}`);
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function minuteToEngineTime(value: Minute): string {
  if (!Number.isInteger(value) || value < 0 || value > 1439) throw new RangeError(`Invalid minute value: ${value}`);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function window(value: TimeWindow): Window {
  return { start: engineTimeToMinute(value.start), end: engineTimeToMinute(value.end) };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function canonicalProblem(problem: PlannerNextProblem): unknown {
  const sorted = <T>(values: readonly T[], key: (value: T) => string): T[] => [...values].sort((a, b) => compare(key(a), key(b)));
  return {
    ...problem,
    spaces: sorted(problem.spaces, (entry) => entry.id).map((entry) => ({ ...entry, availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`) })),
    resources: sorted(problem.resources, (entry) => entry.id).map((entry) => ({ ...entry, availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`) })),
    participants: sorted(problem.participants, (entry) => entry.id).map((entry) => ({ ...entry, availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`) })),
    coaches: sorted(problem.coaches, (entry) => entry.id).map((entry) => ({ ...entry, availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`) })),
    tasks: sorted(problem.tasks, (entry) => entry.id).map((entry) => ({
      ...entry,
      dependencies: [...entry.dependencies].sort(compare),
      ...(entry.requiredResourceIds ? { requiredResourceIds: [...entry.requiredResourceIds].sort(compare) } : {}),
      ...(entry.availability ? { availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`) } : {}),
    })),
    ...(problem.anchoredAccompaniments ? { anchoredAccompaniments: sorted(problem.anchoredAccompaniments, (entry) => entry.id).map((entry) => ({ ...entry, beforeTaskIds: [...entry.beforeTaskIds].sort(compare), afterTaskIds: [...entry.afterTaskIds].sort(compare) })) } : {}),
  };
}

export function fingerprintPlannerNextProblem(problem: PlannerNextProblem): string {
  return createHash("sha256").update(JSON.stringify(canonicalProblem(problem))).digest("hex");
}

export function adaptEngineInputToPlannerNextProblem(input: EngineInput): EngineInputAdapterResult {
  const preflight = preflightEngineInputForPlannerNext(input);
  const envelope = {
    identityMap: preflight.identityMap,
    diagnostics: preflight.diagnostics,
    issues: preflight.issues,
    sourceFingerprint: preflight.sourceFingerprint,
    identityMapFingerprint: preflight.identityMapFingerprint,
    readOnly: true as const,
  };
  if (preflight.status === "UNSUPPORTED") {
    return deepFreeze({ ...envelope, status: "UNSUPPORTED" as const, problem: null, reasonCodes: preflight.reasonCodes, problemFingerprint: null });
  }

  const canonical = (namespace: EngineInputIdentity["namespace"], sourceId: string | number): string => {
    const identity = preflight.identityMap.find((entry) => entry.namespace === namespace && entry.sourceId === String(sourceId));
    if (!identity) throw new Error(`Preflight omitted supported identity ${namespace}:${sourceId}`);
    return identity.canonicalId;
  };
  const config = input.plannerNext!;
  const spatial = resolveEffectivePlanSpatialAvailability(input.workDay, input.planZoneSettings, input.planSpaceSettings);
  const assignments = resolveEffectiveTaskResourceAssignments(input).assignments;
  const activeTasks = input.tasks.filter((task) => task.status !== "cancelled").sort((a, b) => a.id - b.id);
  const requiredSpaceIds = new Set(activeTasks.map((task) => task.spaceId!).concat(config.mainFlow.spaceId));
  const requiredResourceIds = new Set(assignments.flatMap((entry) => [...entry.effectiveResourceIds]));
  input.locks.filter((lock) => lock.lockType === "resource" && activeTasks.some((task) => task.id === lock.taskId))
    .forEach((lock) => requiredResourceIds.add(lock.lockedResourceId!));
  const resourceLocksByTask = new Map<number, number[]>();
  const timeLocksByTask = new Map<number, TimeWindow>();
  input.locks.forEach((lock) => {
    if (!activeTasks.some((task) => task.id === lock.taskId)) return;
    if (lock.lockType === "resource") resourceLocksByTask.set(lock.taskId, [...(resourceLocksByTask.get(lock.taskId) ?? []), lock.lockedResourceId!]);
    if (lock.lockType === "time") timeLocksByTask.set(lock.taskId, { start: lock.lockedStart!, end: lock.lockedEnd! });
  });

  const tasks: Task[] = activeTasks.map((source) => {
    const assignment = assignments.find((entry) => entry.taskId === source.id)!;
    const protectedInterval = source.status === "done" || source.status === "in_progress" ? resolveProtectedTaskInterval(source) : null;
    const fixed = protectedInterval && (protectedInterval.status === "COMPLETE_REAL" || protectedInterval.status === "COMPLETE_PLANNED")
      ? protectedInterval.interval : timeLocksByTask.get(source.id) ?? (source.fixedWindowStart && source.fixedWindowEnd ? { start: source.fixedWindowStart, end: source.fixedWindowEnd } : undefined);
    const resources = [...new Set([...assignment.effectiveResourceIds, ...(resourceLocksByTask.get(source.id) ?? [])])].sort((a, b) => a - b);
    const base = {
      id: canonical("task", source.id),
      duration: protectedInterval && (protectedInterval.status === "COMPLETE_REAL" || protectedInterval.status === "COMPLETE_PLANNED")
        ? engineTimeToMinute(protectedInterval.interval.end) - engineTimeToMinute(protectedInterval.interval.start)
        : source.durationOverrideMin!,
      spaceId: canonical("space", source.spaceId!),
      dependencies: [...new Set(source.dependsOnTaskIds ?? (source.dependsOnTaskId != null ? [source.dependsOnTaskId] : []))].sort((a, b) => a - b).map((id) => canonical("task", id)),
      ...(resources.length ? { requiredResourceIds: resources.map((id) => canonical("plan-resource", id)) } : {}),
      ...(fixed ? { availability: [window(fixed)] } : {}),
    };
    if (source.plannerNextKind === "technical") return { ...base, kind: "technical" as const };
    return { ...base, kind: source.plannerNextKind!, participantId: canonical("participant", source.contestantId!) };
  });

  const participants = [...new Set(activeTasks.filter((task) => task.plannerNextKind !== "technical").map((task) => task.contestantId!))]
    .sort((a, b) => a - b).map((id) => ({ id: canonical("participant", id), availability: [window(input.contestantAvailabilityById![id])] }));
  const resources = [...requiredResourceIds].sort((a, b) => a - b).map((id) => {
    const source = input.planResourceItems.find((entry) => entry.id === id)!;
    const availability = resolveEffectivePlanResourceAvailability(input.workDay, source);
    if (availability.status !== "AVAILABLE") throw new Error(`Preflight accepted unavailable resource ${id}`);
    return { id: canonical("plan-resource", id), availability: [window(availability.effectiveWindow)], presencePreference: "OFF" as const, transitionMinutes: config.resourceTransitionMinutes };
  });
  const spaces = [...requiredSpaceIds].sort((a, b) => a - b).map((id) => {
    const availability = spatial.spacesById.get(id)?.effectiveWindow;
    if (!availability) throw new Error(`Preflight accepted unavailable space ${id}`);
    return { id: canonical("space", id), availability: [window(availability)] };
  });
  const runtimeAnchors = (input as unknown as { anchoredAccompaniments?: Array<Record<string, unknown>> }).anchoredAccompaniments;
  const anchoredAccompaniments: AnchoredAccompaniment[] | undefined = runtimeAnchors?.map((entry) => ({
    id: canonical("anchored-operation", String(entry.id)),
    anchorTaskId: canonical("task", String(entry.anchorTaskId ?? entry.anchor)),
    beforeTaskIds: ((entry.beforeTaskIds ?? []) as Array<string | number>).map((id) => canonical("task", id)).sort(compare),
    afterTaskIds: ((entry.afterTaskIds ?? entry.segments ?? []) as Array<string | number>).map((id) => canonical("task", id)).sort(compare),
    adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED",
  })).sort((a, b) => compare(a.id, b.id));

  const problem: PlannerNextProblem = {
    day: window(input.workDay),
    protectedMeal: window(input.meal),
    spaces,
    resources,
    participants,
    coaches: [],
    tasks,
    mainFlow: {
      spaceId: canonical("space", config.mainFlow.spaceId),
      preferredEnd: engineTimeToMinute(config.mainFlow.preferredEnd),
      continuity: config.mainFlow.continuity,
      maxBlocksByKey: config.mainFlow.maxBlocksByKey,
      minTasksPerBlock: config.mainFlow.minTasksPerBlock,
    },
    participantTransitionMinutes: config.participantTransitionMinutes,
    resourceTransitionMinutes: config.resourceTransitionMinutes,
    budget: { ...config.searchBudget },
    searchPolicy: config.searchPolicy,
    ...(anchoredAccompaniments?.length ? { anchoredAccompaniments } : {}),
  };
  const problemFingerprint = fingerprintPlannerNextProblem(problem);
  return deepFreeze({ ...envelope, status: "SUPPORTED" as const, problem, reasonCodes: [] as const, problemFingerprint });
}
