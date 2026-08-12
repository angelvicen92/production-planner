import { createHash } from "node:crypto";
import type { EngineInput, TimeWindow } from "../../types";
import type { AnchoredAccompaniment, PlannerNextProblem, RoundSynchronizationPolicy, Task, Window } from "../contracts";
import { preflight as preflightPlannerNextProblem } from "../validate";
import { resolveEffectivePlanResourceAvailability } from "./effectivePlanResourceAvailability";
import { resolveEffectivePlanSpatialAvailability } from "./effectivePlanSpatialAvailability";
import { resolveEffectiveTaskResourceAssignments } from "./effectiveTaskResourceAssignments";
import { resolveEffectiveTaskFixedInterval } from "./effectiveTaskFixedInterval";
import { resolveProjectedPlannerNextTaskResources } from "./projectedTaskResources";
import { engineTimeToMinute, minuteToEngineTime } from "./engineTime";
import { resolveParticipantScopedMeals } from "./assignedParticipantMealBreaks";
import { isFlexibleParticipantMealTask, resolveFlexibleParticipantMealTasks } from "./flexibleParticipantMealTasks";
import { resolveAssignedResourceMealBreaks } from "./assignedResourceMealBreaks";
import { resolveAssignedItinerantUnitMealBreaks } from "./assignedItinerantUnitMealBreaks";
import { resolveFlexibleOperationalMealPolicies } from "./flexibleOperationalMealPolicies";
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

export { engineTimeToMinute, minuteToEngineTime } from "./engineTime";

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
    spaces: sorted(problem.spaces, (entry) => entry.id).map((entry) => ({ ...entry, availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`), ...(entry.setupPolicy ? { setupPolicy: { ...entry.setupPolicy, familyOrder: [...entry.setupPolicy.familyOrder], ...(entry.setupPolicy.preparationMinutesByFamily ? { preparationMinutesByFamily: Object.fromEntries(Object.entries(entry.setupPolicy.preparationMinutesByFamily).sort(([left], [right]) => compare(left, right))) } : {}) } } : {}) })),
    resources: sorted(problem.resources, (entry) => entry.id).map((entry) => ({ ...entry, availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`) })),
    participants: sorted(problem.participants, (entry) => entry.id).map((entry) => ({ ...entry, availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`) })),
    coaches: sorted(problem.coaches, (entry) => entry.id).map((entry) => ({ ...entry, availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`) })),
    ...(problem.itinerantUnits ? { itinerantUnits: sorted(problem.itinerantUnits, (entry) => entry.id).map((entry) => ({ ...entry, availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`) })) } : {}),
    tasks: sorted(problem.tasks, (entry) => entry.id).map((entry) => ({
      ...entry,
      dependencies: [...entry.dependencies].sort(compare),
      ...(entry.requiredResourceIds ? { requiredResourceIds: [...entry.requiredResourceIds].sort(compare) } : {}),
      ...(entry.availability ? { availability: sorted(entry.availability, (item) => `${item.start}:${item.end}`) } : {}),
      ...(entry.setupFamilyId ? { setupFamilyId: entry.setupFamilyId } : {}),
    })),
    ...(problem.participantMeals ? { participantMeals: sorted(problem.participantMeals, (entry) => `${entry.participantId}\0${entry.sourceTaskId}`).map((entry) => ({ ...entry, ...(entry.dependencies ? { dependencies: [...entry.dependencies].sort(compare) } : {}) })) } : {}),
    ...(problem.resourceMeals ? { resourceMeals: sorted(problem.resourceMeals, (entry) => `${entry.id}\0${entry.sourceTaskId}`).map(entry=>({...entry,resourceIds:[...entry.resourceIds].sort(compare)})) } : {}),
    ...(problem.operationalMealPolicies ? { operationalMealPolicies: sorted(problem.operationalMealPolicies, (entry) => entry.id).map((entry) => ({ ...entry, resourceIds: [...entry.resourceIds].sort(compare), spaceIds: [...entry.spaceIds].sort(compare) })) } : {}),
    ...(problem.itinerantUnitMeals ? { itinerantUnitMeals: sorted(problem.itinerantUnitMeals, entry=>entry.id) } : {}),
    ...(problem.coachRouteTransitions ? { coachRouteTransitions: sorted(problem.coachRouteTransitions, (entry) => `${entry.coachId}\0${entry.fromSpaceId}\0${entry.toSpaceId}`) } : {}),
    ...(problem.roundSynchronizations ? { roundSynchronizations: sorted(problem.roundSynchronizations, (entry) => entry.id).map((entry) => ({ ...entry, lanes: sorted(entry.lanes, (lane) => lane.spaceId).map((lane) => ({ ...lane, taskIds: [...lane.taskIds].sort(compare) })) })) } : {}),
    ...(problem.anchoredAccompaniments ? { anchoredAccompaniments: sorted(problem.anchoredAccompaniments, (entry) => entry.id).map((entry) => ({ ...entry, beforeTaskIds: [...entry.beforeTaskIds], afterTaskIds: [...entry.afterTaskIds] })) } : {}),
    ...(problem.transportPolicy ? { transportPolicy: {
      arrival: { ...problem.transportPolicy.arrival, taskIds: [...problem.transportPolicy.arrival.taskIds].sort(compare) },
      departure: { ...problem.transportPolicy.departure, taskIds: [...problem.transportPolicy.departure.taskIds].sort(compare) },
    } } : {}),
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
  const sourceCoachRouteTransitions = input.coachRouteTransitions ?? [];
  const sourceRoundSynchronizations = input.roundSynchronizations ?? [];
  const linkedBreakIds=new Set(input.tasks.filter(task=>isFlexibleParticipantMealTask(input,task)&&task.breakId!=null).map(task=>String(task.breakId)));
  const participantMeals = resolveParticipantScopedMeals({ ...input, actualMeal: input.actualMeal&&linkedBreakIds.has(String(input.actualMeal.id))?undefined:input.actualMeal, protectedBreaks: input.protectedBreaks?.filter(entry=>!linkedBreakIds.has(String(entry.id))) });
  const flexibleParticipantMeals = resolveFlexibleParticipantMealTasks(input);
  const resourceMealResolution = resolveAssignedResourceMealBreaks(input);
  const operationalMealPolicies = resolveFlexibleOperationalMealPolicies(input);
  const itinerantUnitMeals = resolveAssignedItinerantUnitMealBreaks(input);
  const spatial = resolveEffectivePlanSpatialAvailability(input.workDay, input.planZoneSettings, input.planSpaceSettings);
  const assignments = resolveEffectiveTaskResourceAssignments(input).assignments;
  const assignmentByTaskId = new Map(assignments.map((entry) => [entry.taskId, entry]));
  const activeTasks = input.tasks.filter((task) => task.status !== "cancelled" && !isFlexibleParticipantMealTask(input, task) && task.breakKind !== "resource_meal").sort((a, b) => a.id - b.id);
  const coachByParticipantId = new Map(Object.entries(input.vocalCoachPlanResourceItemIdByContestantId ?? {}).map(([participantId, coachId]) => [Number(participantId), coachId]));
  const participantIdsByCoachId = new Map<number, readonly number[]>();
  for (const [participantId, coachId] of coachByParticipantId) participantIdsByCoachId.set(coachId, Object.freeze([...(participantIdsByCoachId.get(coachId) ?? []), participantId].sort((a, b) => a - b)));
  const projectionsByTaskId = new Map(activeTasks.map((task) => {
    const projection = resolveProjectedPlannerNextTaskResources(task, assignmentByTaskId.get(task.id)!, input.locks, coachByParticipantId, participantIdsByCoachId);
    if (projection.status !== "REPRESENTABLE") throw new Error(`Preflight accepted unsupported resource projection for task ${task.id}`);
    return [task.id, projection] as const;
  }));
  const configuredCoachIds=new Set(Object.values(input.vocalCoachPlanResourceItemIdByContestantId??{}));
  const routeCoachIds = sourceCoachRouteTransitions.map((route) => route.coachPlanResourceItemId);
  const mealResourceIds=new Set([
    ...resourceMealResolution.meals.flatMap(meal=>[...meal.resourceIds]),
    ...operationalMealPolicies.flatMap((meal) => [...meal.resourceIds]),
  ]);
  const coachResourceIds = new Set([...projectionsByTaskId.values()].flatMap((projection) => projection.coachResourceId === undefined ? [] : [projection.coachResourceId]).concat([...mealResourceIds].filter(id=>configuredCoachIds.has(id)), routeCoachIds));
  const requiredSpaceIds = new Set(activeTasks.map((task) => task.spaceId!).concat(
    config.mainFlow.spaceId,
    sourceCoachRouteTransitions.flatMap((route) => [route.fromSpaceId, route.toSpaceId]),
    sourceRoundSynchronizations.flatMap((policy) => policy.lanes.map((lane) => lane.spaceId)),
    operationalMealPolicies.flatMap((policy) => [...policy.spaceIds]),
  ));
  const requiredResourceIds = new Set([...projectionsByTaskId.values()].flatMap((projection) => [...projection.genericResourceIds]).concat([...mealResourceIds].filter(id=>!coachResourceIds.has(id))));

  const tasks: Task[] = activeTasks.map((source) => {
    const projection = projectionsByTaskId.get(source.id)!;
    const protectedInterval = source.status === "done" || source.status === "in_progress" ? resolveProtectedTaskInterval(source) : null;
    const fixedResolution = resolveEffectiveTaskFixedInterval(source, input.locks);
    const fixed = fixedResolution.status === "EXACT" ? fixedResolution.interval : undefined;
    const coachResourceId = projection.coachResourceId;
    const resources = projection.genericResourceIds;
    const base = {
      id: canonical("task", source.id),
      duration: protectedInterval && (protectedInterval.status === "COMPLETE_REAL" || protectedInterval.status === "COMPLETE_PLANNED")
        ? engineTimeToMinute(protectedInterval.interval.end) - engineTimeToMinute(protectedInterval.interval.start)
        : source.durationOverrideMin!,
      spaceId: canonical("space", source.spaceId!),
      dependencies: [...new Set(source.dependsOnTaskIds ?? (source.dependsOnTaskId != null ? [source.dependsOnTaskId] : []))].sort((a, b) => a - b).map((id) => canonical("task", id)),
      ...(resources.length ? { requiredResourceIds: resources.map((id) => canonical("plan-resource", id)) } : {}),
      ...(fixed ? { availability: [window(fixed)] } : {}),
      ...(source.itinerantTeamId != null ? { itinerantUnitId: canonical("itinerant-team",source.itinerantTeamId) } : {}),
    };
    if (source.plannerNextKind === "technical") return { ...base, kind: "technical" as const };
    if (source.plannerNextKind === "main" || source.plannerNextKind === "vocal") {
      const coachId = canonical("plan-resource", coachResourceId!);
      return { ...base, kind: source.plannerNextKind, participantId: canonical("participant", source.contestantId!), coachId, ...(source.plannerNextKind === "main" ? { blockKey: coachId } : {}) };
    }
    return { ...base, kind: "auxiliary" as const, participantId: canonical("participant", source.contestantId!), ...(source.jointGroupId != null ? { jointGroupId: canonical("joint-group", source.jointGroupId) } : {}), ...(source.setupFamilyId != null ? { setupFamilyId: canonical("setup-family", `${source.spaceId}:${source.setupFamilyId}`) } : {}) };
  });

  const participants = [...new Set([...activeTasks.filter((task) => task.plannerNextKind !== "technical").map((task) => task.contestantId!), ...flexibleParticipantMeals.obligations.map((meal) => Number(meal.participantId.split(":").at(-1)))])]
    .sort((a, b) => a - b).map((id) => ({ id: canonical("participant", id), availability: [...(participantMeals.availabilityByParticipantId.get(id) ?? [window(input.contestantAvailabilityById![id])])] }));
  const resources = [...requiredResourceIds].sort((a, b) => a - b).map((id) => {
    const source = input.planResourceItems.find((entry) => entry.id === id)!;
    const availability = resolveEffectivePlanResourceAvailability(input.workDay, source);
    if (availability.status !== "AVAILABLE") throw new Error(`Preflight accepted unavailable resource ${id}`);
    return { id: canonical("plan-resource", id), availability: [...(resourceMealResolution.availabilityByResourceId.get(id)??[window(availability.effectiveWindow)])], presencePreference: "OFF" as const, transitionMinutes: config.resourceTransitionMinutes };
  });
  const coaches = [...coachResourceIds].sort((a, b) => a - b).map((id) => {
    const source = input.planResourceItems.find((entry) => entry.id === id)!;
    const availability = resolveEffectivePlanResourceAvailability(input.workDay, source);
    if (availability.status !== "AVAILABLE") throw new Error(`Preflight accepted unavailable coach ${id}`);
    return { id: canonical("plan-resource", id), availability: [...(resourceMealResolution.availabilityByResourceId.get(id)??[window(availability.effectiveWindow)])] };
  });
  const itinerantUnits = preflight.identityMap.filter((identity) => identity.namespace === "itinerant-team")
    .map((identity) => Number(identity.sourceId))
    .sort((a, b) => a - b)
    .map((id) => ({
      id: canonical("itinerant-team", id),
      availability: input.itinerantUnitAvailabilityById![id]!.map(window)
        .sort((left, right) => left.start - right.start || left.end - right.end),
    }));
  const setupPoliciesBySpaceId = new Map((input.setupPolicies ?? []).map((policy) => [policy.spaceId, policy]));
  const spaces = [...requiredSpaceIds].sort((a, b) => a - b).map((id) => {
    const availability = spatial.spacesById.get(id)?.effectiveWindow;
    if (!availability) throw new Error(`Preflight accepted unavailable space ${id}`);
    const setupPolicy = setupPoliciesBySpaceId.get(id);
    const canonicalSpace = canonical("space", id);
    if (!setupPolicy) return { id: canonicalSpace, availability: [window(availability)] };
    const canonicalFamily = (family: string) => canonical("setup-family", `${id}:${family}`);
    if (setupPolicy.orderConstraint === "EXPLICIT") {
      const familyOrder = setupPolicy.familyOrder!.map(canonicalFamily);
      const preparationMinutesByFamily = Object.fromEntries(familyOrder.slice(1).map((family) => [family, setupPolicy.preparationMinutesBetweenFamilies]).sort(([left], [right]) => compare(left, right)));
      return { id: canonicalSpace, availability: [window(availability)], secondaryContinuity: "REQUIRED" as const, setupPolicy: { familyOrder, reentry: "FORBIDDEN" as const, preparationMinutesByFamily } };
    }
    const familyOrder = [...setupPolicy.families].sort(compare).map(canonicalFamily);
    return { id: canonicalSpace, availability: [window(availability)], secondaryContinuity: "REQUIRED" as const, setupPolicy: {
      familyOrder,
      flexibleFamilyOrder: true,
      reentry: "FORBIDDEN" as const,
      preparationMinutesBetweenFamilies: setupPolicy.preparationMinutesBetweenFamilies,
    } };
  });
  const coachRouteTransitions = sourceCoachRouteTransitions.map((route) => ({
    coachId: canonical("plan-resource", route.coachPlanResourceItemId),
    fromSpaceId: canonical("space", route.fromSpaceId),
    toSpaceId: canonical("space", route.toSpaceId),
    minutes: route.minutes,
  })).sort((left, right) => compare(
    `${left.coachId}\0${left.fromSpaceId}\0${left.toSpaceId}`,
    `${right.coachId}\0${right.fromSpaceId}\0${right.toSpaceId}`,
  ));
  const roundSynchronizations: RoundSynchronizationPolicy[] =
    sourceRoundSynchronizations.map((policy) => ({
      id: canonical("round-synchronization", policy.id),
      synchronization: policy.synchronization,
      lanes: [...policy.lanes]
        .sort((left, right) => left.spaceId - right.spaceId)
        .map((lane) => ({
          spaceId: canonical("space", lane.spaceId),
          taskIds: [...lane.taskIds]
            .sort((left, right) => left - right)
            .map((taskId) => canonical("task", taskId)),
          preparationMinutesBetweenRounds: lane.preparationMinutesBetweenRounds,
        })),
    })).sort((left, right) => compare(left.id, right.id));

  const anchoredAccompaniments: AnchoredAccompaniment[] | undefined = input.anchoredAccompaniments?.map((entry) => ({
    id: canonical("anchored-operation", String(entry.id)),
    anchorTaskId: canonical("task", entry.anchorTaskId),
    beforeTaskIds: entry.beforeTaskIds.map((id) => canonical("task", id)),
    afterTaskIds: entry.afterTaskIds.map((id) => canonical("task", id)),
    adjacency: "REQUIRED", internalTransition: "INCLUDED", resourceContinuity: "REQUIRED",
    ...(()=>{const segmentIds=[...entry.beforeTaskIds,...entry.afterTaskIds],segments=segmentIds.map(id=>input.tasks.find(task=>task.id===id)?.itinerantTeamId),declared=segments.filter((id):id is number=>id!=null),anchor=input.tasks.find(task=>task.id===entry.anchorTaskId)?.itinerantTeamId;const unit=declared[0]??anchor;return unit!=null&&declared.length===segments.length&&declared.every(id=>id===unit)&&(anchor==null||anchor===unit)?{itinerantUnitId:canonical("itinerant-team",unit)}:{};})(),
  })).sort((a, b) => compare(a.id, b.id));

  const problem: PlannerNextProblem = {
    day: window(input.workDay),
    ...(input.mealMode === "flexible_meal_window" ? {} : { protectedMeal: window(input.meal) }),
    spaces,
    resources,
    participants,
    coaches,
    ...(itinerantUnits.length ? { itinerantUnits } : {}),
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
    ...(coachRouteTransitions.length ? { coachRouteTransitions } : {}),
    ...(roundSynchronizations.length ? { roundSynchronizations } : {}),
    budget: { ...config.searchBudget },
    searchPolicy: config.searchPolicy,
    ...(flexibleParticipantMeals.obligations.length ? { participantMeals: flexibleParticipantMeals.obligations, participantMealCapacity: { maxSimultaneous: input.contestantMealMaxSimultaneous! } } : {}),
    ...(resourceMealResolution.meals.length ? { resourceMeals: resourceMealResolution.meals.map(meal=>({id:canonical("break",meal.breakId),sourceTaskId:canonical("task",meal.sourceTaskId),resourceIds:meal.resourceIds.map(id=>canonical("plan-resource",id)),interval:{...meal.minuteInterval},status:meal.taskStatus as "pending"|"interrupted"|"done"|"in_progress"})) } : {}),
    ...(operationalMealPolicies.length ? { operationalMealPolicies: operationalMealPolicies.map((meal) => ({ id: canonical("break", meal.id), window: { ...meal.window }, duration: meal.duration, resourceIds: meal.resourceIds.map((id) => canonical("plan-resource", id)), spaceIds: meal.spaceIds.map((id) => canonical("space", id)) })) } : {}),
    ...(itinerantUnitMeals.length ? { itinerantUnitMeals: itinerantUnitMeals.map(meal=>({id:canonical("break",meal.breakId),itinerantUnitId:canonical("itinerant-team",meal.itinerantTeamId),interval:{...meal.interval}})) } : {}),
    ...(activeTasks.some((task) => task.plannerNextKind === "auxiliary") ? { auxiliaryPolicy: { participantPresencePreference: "OFF" as const } } : {}),
    ...(anchoredAccompaniments?.length ? { anchoredAccompaniments } : {}),
    ...(input.transportSettings ? { transportPolicy: {
      arrival: {
        taskIds: activeTasks.filter((task) => task.operationalRole === "transport_arrival").map((task) => canonical("task", task.id)),
        minimumGroupSize: input.arrivalGroupingTarget!, maximumGroupSize: input.vanCapacity!,
        minGapMinutes: input.arrivalMinGapMinutes!, groupingWeight: input.transportSettings.groupingWeight!,
      },
      departure: {
        taskIds: activeTasks.filter((task) => task.operationalRole === "transport_departure").map((task) => canonical("task", task.id)),
        minimumGroupSize: input.departureGroupingTarget!, maximumGroupSize: input.vanCapacity!,
        minGapMinutes: input.departureMinGapMinutes!, groupingWeight: input.transportSettings.groupingWeight!,
      },
    } } : {}),
  };
  const coachIds = new Set(problem.coaches.map((coach) => coach.id));
  const channelOverlapIds = problem.resources.map((resource) => resource.id).filter((id) => coachIds.has(id)).sort(compare);
  const canonicalPlannerNextReasonCodes = preflightPlannerNextProblem(problem);
  const plannerNextReasonCodes: readonly string[] = channelOverlapIds.length
    ? ["COACH_RESOURCE_CHANNEL_OVERLAP", ...canonicalPlannerNextReasonCodes]
    : canonicalPlannerNextReasonCodes;
  if (plannerNextReasonCodes.length > 0) {
    const issue: EngineInputPreflightIssue = deepFreeze({ code: "ADAPTED_PROBLEM_NOT_REPRESENTABLE", entityKind: "plan", entityId: String(input.planId), path: "plannerNextProblem", message: "The adapted problem is rejected by the canonical Planner Next preflight.", blocking: true, details: { plannerNextReasonCodes } });
    const diagnostics = { ...preflight.diagnostics, unsupportedCapabilityCodes: [...new Set([...preflight.diagnostics.unsupportedCapabilityCodes, "ADAPTED_PROBLEM_NOT_REPRESENTABLE" as const])].sort(compare) };
    return deepFreeze({ ...envelope, diagnostics, issues: [...preflight.issues, issue], status: "UNSUPPORTED" as const, problem: null, reasonCodes: ["ADAPTED_PROBLEM_NOT_REPRESENTABLE"] as const, problemFingerprint: null });
  }
  const problemFingerprint = fingerprintPlannerNextProblem(problem);
  return deepFreeze({ ...envelope, status: "SUPPORTED" as const, problem, reasonCodes: [] as const, problemFingerprint });
}
