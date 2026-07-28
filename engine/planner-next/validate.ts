import type {
  Person,
  PlannerNextProblem,
  ScheduledTask,
  Space,
  Resource,
  Task,
  ValidationSummary,
  Window,
} from "./contracts";
import { contains, overlaps } from "./time";
import { effectiveResourceTransitionMinutes } from "./placement";
import { hasRequiredSecondaryContinuity, requiredSecondarySpaces, secondaryTasks } from "./secondaryContinuity";
import { followsSetupOrder, hasSetupReentry, setupBlockCounts, setupSpaces, setupTasks } from "./setupGrouping";

function hasDuplicateIds(items: Array<{ id: string }>): boolean {
  return new Set(items.map(({ id }) => id)).size !== items.length;
}

function invalidWindow(window: Window, day: Window): boolean {
  return !Number.isFinite(window.start)
    || !Number.isFinite(window.end)
    || window.start >= window.end
    || window.start < day.start
    || window.end > day.end;
}

function validateAvailability(items: Array<Person | Space | Resource>, day: Window): boolean {
  return items.some((item) =>
    !Array.isArray(item.availability)
    || item.availability.length === 0
    || item.availability.some((window) => invalidWindow(window, day)),
  );
}

/** Validates exactly the deliberately small contract supported by Planner Next. */
export function preflight(problem: PlannerNextProblem): string[] {
  const reasons = new Set<string>();
  const day = problem.day;

  if (!day || !Number.isFinite(day.start) || !Number.isFinite(day.end) || day.start >= day.end) {
    reasons.add("INVALID_DAY");
  }
  const usableDay = day && Number.isFinite(day.start) && Number.isFinite(day.end) && day.start < day.end;
  if (!problem.protectedMeal || !usableDay || invalidWindow(problem.protectedMeal, day)) {
    reasons.add("INVALID_PROTECTED_MEAL");
  }
  const preferredEnd = problem.mainFlow?.preferredEnd;
  if (!usableDay
    || !Number.isFinite(preferredEnd)
    || preferredEnd < day.start
    || preferredEnd > day.end
    || (problem.protectedMeal && preferredEnd > problem.protectedMeal.start)) {
    reasons.add("INVALID_PREFERRED_END");
  }
  if (problem.mainFlow?.continuity !== "REQUIRED") {
    reasons.add("UNSUPPORTED_CONTINUITY");
  }

  const budget = problem.budget;
  if (!budget
    || !Number.isInteger(budget.bestK) || budget.bestK <= 0
    || !Number.isInteger(budget.maxBacktracks) || budget.maxBacktracks < 0
    || !Number.isInteger(budget.maxPatterns) || budget.maxPatterns <= 0
    || !Number.isInteger(budget.maxBranchExpansions) || budget.maxBranchExpansions <= 0) {
    reasons.add("INVALID_SEARCH_BUDGET");
  }
  if (!Number.isFinite(problem.participantTransitionMinutes)
    || problem.participantTransitionMinutes < 0
    || !Number.isFinite(problem.resourceTransitionMinutes)
    || problem.resourceTransitionMinutes < 0) {
    reasons.add("INVALID_TRANSITION_MARGIN");
  }

  const participants = Array.isArray(problem.participants) ? problem.participants : [];
  const coaches = Array.isArray(problem.coaches) ? problem.coaches : [];
  const spaces = Array.isArray(problem.spaces) ? problem.spaces : [];
  const tasks = Array.isArray(problem.tasks) ? problem.tasks : [];
  const resources = Array.isArray(problem.resources) ? problem.resources : [];
  if (!Array.isArray(problem.resources)) reasons.add("INVALID_RESOURCE_CONTRACT");
  if (hasDuplicateIds(participants)) reasons.add("DUPLICATE_PARTICIPANT_ID");
  if (hasDuplicateIds(coaches)) reasons.add("DUPLICATE_COACH_ID");
  if (hasDuplicateIds(spaces)) reasons.add("DUPLICATE_SPACE_ID");
  if (hasDuplicateIds(tasks)) reasons.add("DUPLICATE_TASK_ID");
  if (hasDuplicateIds(resources)) reasons.add("DUPLICATE_RESOURCE_ID");
  if (resources.some(({ id }) => typeof id !== "string" || id.trim() === "")) reasons.add("INVALID_RESOURCE_CONTRACT");
  if (resources.some(({ transitionMinutes }) => transitionMinutes !== undefined
    && (typeof transitionMinutes !== "number" || !Number.isFinite(transitionMinutes)
      || !Number.isInteger(transitionMinutes) || transitionMinutes < 0))) reasons.add("INVALID_RESOURCE_TRANSITION");
  if (usableDay && validateAvailability([...participants, ...coaches, ...spaces], day)) {
    reasons.add("INVALID_AVAILABILITY_WINDOW");
  }
  if (usableDay && resources.some((resource) => !Array.isArray(resource.availability)
    || resource.availability.length === 0
    || resource.availability.some((window) => invalidWindow(window, day)))) {
    reasons.add("INVALID_RESOURCE_AVAILABILITY");
  }
  const preferenceLevels = new Set(["OFF", "LOW", "MEDIUM", "HIGH", "MAXIMUM"]);
  if (resources.some(({ presencePreference }) => !preferenceLevels.has(presencePreference))) {
    reasons.add("INVALID_RESOURCE_PREFERENCE");
  }
  const auxiliaries = tasks.filter((task) => task?.kind === "auxiliary");
  if (auxiliaries.length > 0 && !problem.auxiliaryPolicy) reasons.add("MISSING_AUXILIARY_POLICY");
  if (problem.auxiliaryPolicy && !preferenceLevels.has(problem.auxiliaryPolicy.participantPresencePreference)) reasons.add("INVALID_AUXILIARY_POLICY");

  const participantIds = new Set(participants.map(({ id }) => id));
  const coachIds = new Set(coaches.map(({ id }) => id));
  const spaceIds = new Set(spaces.map(({ id }) => id));
  const taskIds = new Set(tasks.map(({ id }) => id));
  const resourceIds = new Set(resources.map(({ id }) => id));
  const mainSpaceId = problem.mainFlow?.spaceId;
  if (!mainSpaceId || !spaceIds.has(mainSpaceId)) reasons.add("MISSING_MAIN_FLOW_SPACE");
  for (const space of spaces) {
    if (space.setupPolicy !== undefined) {
      const policy = space.setupPolicy as { familyOrder?: unknown; reentry?: unknown };
      if (!policy || typeof policy !== "object" || !Array.isArray(policy.familyOrder) || policy.familyOrder.length === 0 || policy.familyOrder.some((x) => typeof x !== "string" || x.length === 0)) reasons.add("INVALID_SETUP_POLICY");
      const order = Array.isArray(policy?.familyOrder) ? policy.familyOrder.filter((x): x is string => typeof x === "string") : [];
      if (new Set(order).size !== order.length) reasons.add("DUPLICATE_SETUP_FAMILY");
      if (policy?.reentry !== "FORBIDDEN") reasons.add("UNSUPPORTED_SETUP_REENTRY");
      if (space.id === mainSpaceId) reasons.add("SETUP_ON_MAIN_FLOW_UNSUPPORTED");
      if (space.secondaryContinuity !== "REQUIRED") reasons.add("SETUP_REQUIRES_REQUIRED_CONTINUITY");
      const own = tasks.filter((task) => task?.spaceId === space.id);
      if (own.some((task) => task.kind !== "auxiliary")) reasons.add("SETUP_WITH_NON_AUXILIARY_TASK");
      if (own.some((task) => typeof task.setupFamilyId !== "string" || task.setupFamilyId.length === 0)) reasons.add("MISSING_SETUP_FAMILY");
      if (own.some((task) => typeof task.setupFamilyId === "string" && !order.includes(task.setupFamilyId))) reasons.add("UNKNOWN_SETUP_FAMILY");
      if (order.some((family) => !own.some((task) => task.setupFamilyId === family))) reasons.add("EMPTY_SETUP_FAMILY");
    }
    if (space.secondaryContinuity !== undefined && space.secondaryContinuity !== "OFF" && space.secondaryContinuity !== "REQUIRED") reasons.add("INVALID_SECONDARY_CONTINUITY");
    if (space.secondaryContinuity !== "REQUIRED") continue;
    const own = tasks.filter((task) => task?.spaceId === space.id);
    const auxiliaryCount = own.filter((task) => task?.kind === "auxiliary").length;
    if (space.id === mainSpaceId) reasons.add("REQUIRED_SECONDARY_ON_MAIN_FLOW_UNSUPPORTED");
    if (own.some((task) => task?.kind !== "auxiliary")) reasons.add("REQUIRED_SECONDARY_WITH_NON_AUXILIARY_TASK");
    if (auxiliaryCount === 0) reasons.add("REQUIRED_SECONDARY_SPACE_EMPTY");
    else if (auxiliaryCount === 1) reasons.add("REQUIRED_SECONDARY_SPACE_TOO_SMALL");
  }

  for (const task of tasks) {
    if (task.setupFamilyId !== undefined && !spaces.find((space) => space.id === task.spaceId)?.setupPolicy) reasons.add("SETUP_FAMILY_OUTSIDE_SETUP_SPACE");
    const requirements = task.requiredResourceIds;
    if (requirements !== undefined && !Array.isArray(requirements)) {
      reasons.add("INVALID_RESOURCE_CONTRACT");
    } else if (Array.isArray(requirements)) {
      if (new Set(requirements).size !== requirements.length) reasons.add("DUPLICATE_TASK_RESOURCE_REQUIREMENT");
      if (requirements.some((id) => typeof id !== "string" || !resourceIds.has(id))) reasons.add("MISSING_RESOURCE_REFERENCE");
      if (task.kind === "vocal" && requirements.length > 0) reasons.add("UNSUPPORTED_FEEDER_RESOURCE_REQUIREMENT");
    }
    if (task.kind !== "main" && task.kind !== "vocal" && task.kind !== "auxiliary") reasons.add("UNSUPPORTED_TASK_KIND");
    if (!participantIds.has(task.participantId)) reasons.add("MISSING_PARTICIPANT_REFERENCE");
    if (task.kind === "main" && (!task.coachId || !coachIds.has(task.coachId))) reasons.add("MAIN_COACH_REQUIRED");
    if (task.kind === "vocal" && (!task.coachId || !coachIds.has(task.coachId))) reasons.add("VOCAL_COACH_REQUIRED");
    if (task.kind !== "auxiliary" && (!task.coachId || !coachIds.has(task.coachId))) reasons.add("MISSING_COACH_REFERENCE");
    if (task.kind === "auxiliary" && task.coachId !== undefined) reasons.add("AUXILIARY_COACH_UNSUPPORTED");
    if (!spaceIds.has(task.spaceId)) reasons.add("MISSING_SPACE_REFERENCE");
    if (!Number.isFinite(task.duration) || task.duration <= 0) reasons.add("INVALID_TASK_DURATION");
    if (!Array.isArray(task.dependencies)
      || task.dependencies.some((dependencyId) => !taskIds.has(dependencyId))) {
      reasons.add("MISSING_TASK_REFERENCE");
    }
    if (task.kind === "main" && task.spaceId !== mainSpaceId) reasons.add("INVALID_MAIN_FLOW_SPACE");
    if (task.kind === "vocal" && task.spaceId === mainSpaceId) reasons.add("INVALID_VOCAL_SPACE");
    if (task.kind === "auxiliary") {
      if (!task.participantId || !participantIds.has(task.participantId) || !task.spaceId || !spaceIds.has(task.spaceId)
        || !Number.isFinite(task.duration) || task.duration <= 0) reasons.add("INVALID_AUXILIARY_TASK");
      if (task.blockKey !== undefined) reasons.add("AUXILIARY_BLOCK_KEY_UNSUPPORTED");
      if (!Array.isArray(task.dependencies) || task.dependencies.length > 0) reasons.add("AUXILIARY_DEPENDENCY_UNSUPPORTED");
    }
  }

  for (const participant of participants) {
    const own = tasks.filter((task) => task.participantId === participant.id);
    const mains = own.filter((task) => task.kind === "main");
    const vocals = own.filter((task) => task.kind === "vocal");
    if (mains.length === 0 && vocals.length === 0 && own.every((task) => task.kind === "auxiliary")) continue;
    if (mains.length === 0) reasons.add("MISSING_MAIN_TASK");
    if (vocals.length === 0) reasons.add("MISSING_FEEDER_TASK");
    if (mains.length > 1) reasons.add("MULTIPLE_MAIN_TASKS_FOR_PARTICIPANT");
    if (vocals.length > 1) reasons.add("MULTIPLE_VOCAL_TASKS_FOR_PARTICIPANT");
    if (mains.length !== 1 || vocals.length !== 1) continue;
    const main = mains[0];
    const vocal = vocals[0];
    if (!main || !vocal) continue;
    if (!Array.isArray(main.dependencies) || !main.dependencies.includes(vocal.id)) {
      reasons.add("MISSING_FEEDER_DEPENDENCY");
    }
    if (main.dependencies.length !== 1 || main.dependencies[0] !== vocal.id) {
      reasons.add("UNSUPPORTED_MAIN_DEPENDENCIES");
    }
    if (main.coachId !== vocal.coachId) reasons.add("MAIN_FEEDER_COACH_MISMATCH");
    if (!main.blockKey) reasons.add("MISSING_MAIN_BLOCK_KEY");
    else if (main.blockKey !== main.coachId) reasons.add("INVALID_MAIN_BLOCK_KEY");
  }

  const mainDurations = new Set(tasks.filter(({ kind }) => kind === "main").map(({ duration }) => duration));
  if (mainDurations.size > 1) reasons.add("UNSUPPORTED_MAIN_DURATION_MIX");
  return [...reasons].sort();
}

export function validatePlan(problem: PlannerNextProblem, scheduled: ScheduledTask[]): ValidationSummary {
  let dependency = 0;
  let overlap = 0;
  let transition = 0;
  let availability = 0;
  let block = 0;
  let resourceAvailability = 0;
  let resourceOverlap = 0;
  let resourceTransition = 0;
  let secondaryContinuity = 0;
  let setup = 0;
  const byId = new Map(scheduled.map((task) => [task.id, task]));
  const participants = new Map(problem.participants.map((item) => [item.id, item]));
  const coaches = new Map(problem.coaches.map((item) => [item.id, item]));
  const spaces = new Map(problem.spaces.map((item) => [item.id, item]));
  const resources = new Map(problem.resources.map((item) => [item.id, item]));

  for (const task of scheduled) {
    const participant = participants.get(task.participantId);
    const coach = task.coachId === undefined ? undefined : coaches.get(task.coachId);
    const space = spaces.get(task.spaceId);
    if (task.end - task.start !== task.duration
      || task.start < problem.day.start || task.end > problem.day.end
      || overlaps(task, problem.protectedMeal)
      || !participant || !contains(participant.availability, task.start, task.end)
      || (task.coachId !== undefined && (!coach || !contains(coach.availability, task.start, task.end)))
      || !space || !contains(space.availability, task.start, task.end)) availability += 1;
    for (const resourceId of task.requiredResourceIds ?? []) {
      const resource = resources.get(resourceId);
      if (!resource || !contains(resource.availability, task.start, task.end)) resourceAvailability += 1;
    }
    for (const dependencyId of task.dependencies) {
      const feeder = byId.get(dependencyId);
      if (!feeder || feeder.end > task.start) dependency += 1;
    }
  }
  for (let first = 0; first < scheduled.length; first += 1) {
    for (let second = first + 1; second < scheduled.length; second += 1) {
      const a = scheduled[first];
      const b = scheduled[second];
      if (!a || !b || !overlaps(a, b)) continue;
      if (a.participantId === b.participantId || (a.coachId !== undefined && a.coachId === b.coachId) || a.spaceId === b.spaceId) overlap += 1;
      if ((a.requiredResourceIds ?? []).some((id) => (b.requiredResourceIds ?? []).includes(id))) resourceOverlap += 1;
    }
  }
  for (const field of ["participantId", "coachId"] as const) {
    const margin = field === "participantId" ? problem.participantTransitionMinutes : problem.resourceTransitionMinutes;
    const groups = new Map<string, ScheduledTask[]>();
    for (const task of scheduled) { const value = task[field]; if (value !== undefined) groups.set(value, [...(groups.get(value) ?? []), task]); }
    for (const list of groups.values()) {
      list.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
      for (let index = 1; index < list.length; index += 1) {
        const previous = list[index - 1];
        const current = list[index];
        if (previous && current && previous.spaceId !== current.spaceId && current.start - previous.end < margin) transition += 1;
      }
    }
  }
  for (let first = 0; first < scheduled.length; first += 1) {
    for (let second = first + 1; second < scheduled.length; second += 1) {
      const unorderedA = scheduled[first], unorderedB = scheduled[second];
      if (!unorderedA || !unorderedB) continue;
      const [a, b] = unorderedA.start <= unorderedB.start ? [unorderedA, unorderedB] : [unorderedB, unorderedA];
      const shared = (a.requiredResourceIds ?? []).filter((id) => (b.requiredResourceIds ?? []).includes(id));
      const margin = shared.reduce((maximum, id) => Math.max(maximum, effectiveResourceTransitionMinutes(problem, id)), 0);
      if (shared.length > 0 && a.spaceId !== b.spaceId && b.start - a.end < margin) resourceTransition += 1;
    }
  }
  const mains = scheduled.filter(({ kind }) => kind === "main").sort((a, b) => a.start - b.start);
  const lastMain = mains.at(-1);
  if (mains.length > 0) {
    if (!lastMain || lastMain.end !== problem.mainFlow.preferredEnd) block += 1;
    for (let index = 1; index < mains.length; index += 1) {
      const previous = mains[index - 1];
      const current = mains[index];
      if (!previous || !current || previous.end !== current.start) block += 1;
    }
    const runs: Array<{ key: string; count: number }> = [];
    for (const task of mains) {
      const key = task.blockKey ?? "";
      const prior = runs.at(-1);
      if (prior?.key === key) prior.count += 1;
      else runs.push({ key, count: 1 });
    }
    const counts = new Map<string, number>();
    for (const run of runs) {
      counts.set(run.key, (counts.get(run.key) ?? 0) + 1);
      if (run.count < problem.mainFlow.minTasksPerBlock) block += 1;
    }
    if ([...counts.values()].some((count) => count > problem.mainFlow.maxBlocksByKey)) block += 1;
  }
  for (const space of requiredSecondarySpaces(problem)) {
    const expected = secondaryTasks(problem.tasks, space.id);
    const actual = secondaryTasks(scheduled, space.id);
    if (actual.length !== expected.length || actual.some((task) => !expected.some(({ id }) => id === task.id)) || !hasRequiredSecondaryContinuity(actual)) secondaryContinuity += 1;
  }
  for (const space of setupSpaces(problem)) {
    const expected = setupTasks(problem.tasks, space.id), actual = setupTasks(scheduled, space.id);
    const policy = space.setupPolicy!;
    const invalid = actual.length !== expected.length || actual.some((task) => !expected.some(({ id }) => id === task.id))
      || actual.some((task) => !task.setupFamilyId || task.spaceId !== space.id)
      || !followsSetupOrder(actual, policy.familyOrder) || hasSetupReentry(actual)
      || policy.familyOrder.some((family) => setupBlockCounts(actual)[family] !== 1);
    if (invalid) setup += 1;
  }
  const reasonCodes: string[] = [];
  if (scheduled.length !== problem.tasks.length) reasonCodes.push("UNPLANNED_TASKS");
  if (dependency) reasonCodes.push("DEPENDENCY_VIOLATION");
  if (overlap) reasonCodes.push("OVERLAP_VIOLATION");
  if (transition) reasonCodes.push("TRANSITION_VIOLATION");
  if (availability) reasonCodes.push("AVAILABILITY_VIOLATION");
  if (block) reasonCodes.push("BLOCK_VIOLATION");
  if (resourceAvailability) reasonCodes.push("RESOURCE_AVAILABILITY_VIOLATION");
  if (resourceOverlap) reasonCodes.push("RESOURCE_OVERLAP_VIOLATION");
  if (resourceTransition) reasonCodes.push("RESOURCE_TRANSITION_VIOLATION");
  if (secondaryContinuity) reasonCodes.push("SECONDARY_CONTINUITY_VIOLATION");
  if (setup) reasonCodes.push("SETUP_POLICY_VIOLATION");
  return {
    hardValid: reasonCodes.length === 0,
    dependencyViolationCount: dependency,
    overlapViolationCount: overlap,
    transitionViolationCount: transition,
    availabilityViolationCount: availability,
    blockViolationCount: block,
    resourceAvailabilityViolationCount: resourceAvailability,
    resourceOverlapViolationCount: resourceOverlap,
    resourceTransitionViolationCount: resourceTransition,
    secondaryContinuityViolationCount: secondaryContinuity,
    setupViolationCount: setup,
    reasonCodes,
  };
}
