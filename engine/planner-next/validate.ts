import type {
  Person,
  PlannerNextProblem,
  ScheduledSetupPreparation,
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
import { preparationAvoidsMeal, preparationAvoidsOccupations, preparationWithinAvailability, preparationWithinDay, setupPreparationId, setupPreparationSequence, spaceOccupations } from "./setupPreparation";
import { followsSetupOrder, hasSetupReentry, setupBlockCounts, setupSpaces, setupTasks } from "./setupGrouping";
import { canonicalResourceIds, jointGroupIds, jointGroupMembers, synchronizedJointTasks } from "./jointTasks";
import { hasOwnTechnicalField, technicalIdentityMatches, technicalTasks } from "./technicalOperations";
import { canPlaceTask } from "./placement";
import { getTechnicalChains, technicalChainHasBranching, technicalChainHasCycle } from "./technicalChains";

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
  if (tasks.some(task=>task && Object.prototype.hasOwnProperty.call(task,"jointGroupId") && (typeof task.jointGroupId!=="string" || task.jointGroupId.trim()===""))) reasons.add("INVALID_JOINT_GROUP_ID");
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
  const technicalIds = new Set(tasks.filter(t=>t?.kind==="technical").map(t=>t.id));
  const mainSpaceId = problem.mainFlow?.spaceId;
  if (!mainSpaceId || !spaceIds.has(mainSpaceId)) reasons.add("MISSING_MAIN_FLOW_SPACE");
  for (const space of spaces) {
    if (space.setupPolicy !== undefined) {
      const policy = space.setupPolicy as { familyOrder?: unknown; reentry?: unknown };
      if (!policy || typeof policy !== "object" || !Array.isArray(policy.familyOrder) || policy.familyOrder.length === 0 || policy.familyOrder.some((x) => typeof x !== "string" || x.length === 0)) reasons.add("INVALID_SETUP_POLICY");
      const order = Array.isArray(policy?.familyOrder) ? policy.familyOrder.filter((x): x is string => typeof x === "string") : [];
      if (new Set(order).size !== order.length) reasons.add("DUPLICATE_SETUP_FAMILY");
      if (policy?.reentry !== "FORBIDDEN") reasons.add("UNSUPPORTED_SETUP_REENTRY");
      if (Object.prototype.hasOwnProperty.call(policy, "preparationMinutesByFamily")) {
        const record = (policy as { preparationMinutesByFamily?: unknown }).preparationMinutesByFamily;
        const plain = record !== null && typeof record === "object" && !Array.isArray(record) && Object.getPrototypeOf(record) === Object.prototype;
        if (!plain) reasons.add("INVALID_SETUP_PREPARATION_POLICY");
        else {
          const entries = Object.entries(record as Record<string, unknown>);
          if (entries.length !== order.length || entries.some(([family, value]) => !order.includes(family) || typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) || order.some(family => !Object.prototype.hasOwnProperty.call(record, family))) reasons.add("INVALID_SETUP_PREPARATION_POLICY");
        }
      }
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
    if (task.kind !== "main" && task.kind !== "vocal" && task.kind !== "auxiliary" && task.kind !== "technical") reasons.add("UNSUPPORTED_TASK_KIND");
    if (task.kind === "technical") {
      if (hasOwnTechnicalField(task, "participantId")) reasons.add("TECHNICAL_PARTICIPANT_UNSUPPORTED");
      if (hasOwnTechnicalField(task, "coachId")) reasons.add("TECHNICAL_COACH_UNSUPPORTED");
      const deps=(task as {dependencies?:unknown}).dependencies;
      if (!Array.isArray(deps) || deps.some(id=>typeof id!=="string"||id.trim()===""||!taskIds.has(id)||!technicalIds.has(id)) || (Array.isArray(deps)&&new Set(deps).size!==deps.length)) reasons.add("TECHNICAL_DEPENDENCY_UNSUPPORTED");
      if (hasOwnTechnicalField(task, "blockKey") || hasOwnTechnicalField(task, "setupFamilyId") || hasOwnTechnicalField(task, "jointGroupId")) reasons.add("TECHNICAL_GROUPING_UNSUPPORTED");
      const technicalSpace = spaces.find((space) => space.id === task.spaceId);
      if (task.spaceId === mainSpaceId || technicalSpace?.secondaryContinuity === "REQUIRED" || technicalSpace?.setupPolicy !== undefined) reasons.add("TECHNICAL_IN_STRUCTURED_SPACE_UNSUPPORTED");
    } else if (!participantIds.has(task.participantId)) reasons.add("MISSING_PARTICIPANT_REFERENCE");
    if (task.kind === "main" && (!task.coachId || !coachIds.has(task.coachId))) reasons.add("MAIN_COACH_REQUIRED");
    if (task.kind === "vocal" && (!task.coachId || !coachIds.has(task.coachId))) reasons.add("VOCAL_COACH_REQUIRED");
    if (task.kind !== "auxiliary" && task.kind !== "technical" && (!task.coachId || !coachIds.has(task.coachId))) reasons.add("MISSING_COACH_REFERENCE");
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
  if (technicalChainHasBranching(tasks)) reasons.add("TECHNICAL_CHAIN_BRANCHING_UNSUPPORTED");
  if (technicalChainHasCycle(tasks)) reasons.add("TECHNICAL_CHAIN_CYCLE");
  for(const id of jointGroupIds(tasks)) {
    const members=jointGroupMembers(tasks,id); const first=members[0];
    if(members.length<2) reasons.add("JOINT_GROUP_TOO_SMALL");
    if(members.some(t=>t.kind!=="auxiliary")) reasons.add("JOINT_GROUP_NON_AUXILIARY_UNSUPPORTED");
    if(members.some(t=>t.coachId!==undefined)) reasons.add("JOINT_GROUP_COACH_UNSUPPORTED");
    if(new Set(members.map(t=>t.participantId)).size!==members.length) reasons.add("JOINT_GROUP_DUPLICATE_PARTICIPANT");
    if(first && members.some(t=>t.duration!==first.duration)) reasons.add("JOINT_GROUP_DURATION_MISMATCH");
    if(first && members.some(t=>t.spaceId!==first.spaceId)) reasons.add("JOINT_GROUP_SPACE_MISMATCH");
    if(first && members.some(t=>canonicalResourceIds(t).join("\0")!==canonicalResourceIds(first).join("\0"))) reasons.add("JOINT_GROUP_RESOURCE_MISMATCH");
    if(first && members.some(t=>t.setupFamilyId!==first.setupFamilyId)) reasons.add("JOINT_GROUP_SETUP_MISMATCH");
    const structured=members.some(t=>t.setupFamilyId!==undefined || spaces.find(s=>s.id===t.spaceId)?.secondaryContinuity==="REQUIRED" || spaces.find(s=>s.id===t.spaceId)?.setupPolicy!==undefined);
    if(structured) reasons.add("JOINT_GROUP_IN_STRUCTURED_SPACE_UNSUPPORTED");
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

export function validatePlan(problem: PlannerNextProblem, scheduled: ScheduledTask[], preparations: ScheduledSetupPreparation[] = []): ValidationSummary {
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
  let setupPreparation = 0;
  let jointGroup = 0;
  let technicalOperation = 0;
  let technicalChain = 0;
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
      || (task.kind !== "technical" && (!participant || !contains(participant.availability, task.start, task.end)))
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
      const internal=synchronizedJointTasks(a,b) && jointGroupMembers(problem.tasks,a.jointGroupId!).some(t=>t.id===a.id) && jointGroupMembers(problem.tasks,a.jointGroupId!).some(t=>t.id===b.id);
      const sharedParticipant = a.participantId !== undefined && b.participantId !== undefined && a.participantId === b.participantId;
      if (!internal && (sharedParticipant || (a.coachId !== undefined && a.coachId === b.coachId) || a.spaceId === b.spaceId)) overlap += 1;
      if (!internal && (a.requiredResourceIds ?? []).some((id) => (b.requiredResourceIds ?? []).includes(id))) resourceOverlap += 1;
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
    const occupations = spaceOccupations(actual, preparations, space.id);
    if (actual.length !== expected.length || actual.some((task) => !expected.some(({ id }) => id === task.id)) || !hasRequiredSecondaryContinuity(occupations)) secondaryContinuity += 1;
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
  for (const space of setupSpaces(problem).filter(candidate => candidate.setupPolicy?.preparationMinutesByFamily !== undefined)) {
    const policy = space.setupPolicy!;
    const record = policy.preparationMinutesByFamily!;
    const ownTasks = setupTasks(scheduled, space.id);
    const ownPreparations = preparations.filter(item => item.spaceId === space.id);
    const occupied = spaceOccupations(scheduled, preparations, space.id);
    for (let index = 0; index < policy.familyOrder.length; index += 1) {
      const family = policy.familyOrder[index]!;
      const matches = ownPreparations.filter(item => item.setupFamilyId === family);
      const preparation = matches[0];
      const familyTasks = ownTasks.filter(task => task.setupFamilyId === family).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
      const previousTasks = index === 0 ? [] : ownTasks.filter(task=>task.setupFamilyId===policy.familyOrder[index-1]).sort((a,b)=>a.end-b.end||a.id.localeCompare(b.id));
      const invalid = matches.length !== 1 || !preparation || preparation.entryIndex !== 1 || preparation.id !== setupPreparationId(space.id,family,1)
        || preparation.kind !== "setup-preparation" || preparation.duration !== record[family] || preparation.end-preparation.start !== preparation.duration
        || !preparationWithinDay(problem,preparation) || !preparationWithinAvailability(space.availability,preparation) || !preparationAvoidsMeal(problem.protectedMeal,preparation)
        || !preparationAvoidsOccupations(preparation,occupied) || !familyTasks[0] || preparation.end !== familyTasks[0].start
        || (index === 0 ? preparation.start !== occupied[0]?.start : preparation.start !== previousTasks.at(-1)?.end);
      if (invalid) setupPreparation += 1;
    }
    const extras = ownPreparations.filter(item=>!policy.familyOrder.includes(item.setupFamilyId));
    setupPreparation += extras.length;
    if (setupPreparationSequence(ownPreparations).some((family,index)=>family!==policy.familyOrder[index])) setupPreparation += setupPreparation === 0 ? 1 : 0;
  }
  setupPreparation += preparations.filter(item => !problem.spaces.some(space=>space.id===item.spaceId && space.setupPolicy?.preparationMinutesByFamily !== undefined)).length;

  const originalById=new Map(problem.tasks.map(task=>[task.id,task]));
  const expectedJointGroupIdByTaskId=new Map(problem.tasks.map(task=>[task.id,task.jointGroupId]));
  const expectedGroupIds=new Set(jointGroupIds(problem.tasks));
  const scheduledGroupIds=new Set(scheduled.flatMap(task=>task.jointGroupId===undefined?[]:[task.jointGroupId]));
  const invalidGroupIds=new Set<string>();
  for(const task of scheduled){
    const expected=expectedJointGroupIdByTaskId.get(task.id), original=originalById.get(task.id);
    if(!original || task.jointGroupId!==expected){
      if(expected!==undefined)invalidGroupIds.add(expected);
      if(task.jointGroupId!==undefined)invalidGroupIds.add(task.jointGroupId);
    }
  }
  for(const id of [...new Set([...expectedGroupIds,...scheduledGroupIds])].sort()){
    const expected=jointGroupMembers(problem.tasks,id), actual=scheduled.filter(task=>task.jointGroupId===id), first=actual[0], expectedIds=new Set(expected.map(task=>task.id));
    const invalid=!expectedGroupIds.has(id)||actual.length!==expected.length||actual.some(task=>!expectedIds.has(task.id))
      ||expected.some(task=>scheduled.filter(item=>item.id===task.id).length!==1||scheduled.find(item=>item.id===task.id)?.jointGroupId!==id)
      ||!first||actual.some(task=>task.start!==first.start||task.end!==first.end||task.spaceId!==first.spaceId||task.end-task.start!==first.end-first.start||task.setupFamilyId!==first.setupFamilyId||canonicalResourceIds(task).join("\0")!==canonicalResourceIds(first).join("\0"))
      ||new Set(actual.map(task=>task.participantId)).size!==actual.length;
    if(invalid)invalidGroupIds.add(id);
  }
  jointGroup=invalidGroupIds.size;

  const invalidTechnicalIds = new Set<string>();
  const expectedTechnical = technicalTasks(problem.tasks);
  const expectedTechnicalIds = new Set(expectedTechnical.map(({ id }) => id));
  for (const expected of expectedTechnical) {
    const matches = scheduled.filter(({ id }) => id === expected.id);
    const actual = matches[0];
    if (matches.length !== 1 || !actual || !technicalIdentityMatches(expected, actual)
      || !canPlaceTask(problem, expected, actual?.start ?? Number.NaN, scheduled.filter(({ id }) => id !== expected.id))) invalidTechnicalIds.add(expected.id);
  }
  for (const actual of scheduled.filter(({ kind }) => kind === "technical")) {
    if (!expectedTechnicalIds.has(actual.id) || problem.tasks.find(({ id }) => id === actual.id)?.kind !== "technical") invalidTechnicalIds.add(actual.id);
  }
  for (const expected of problem.tasks.filter(({ kind }) => kind !== "technical")) {
    if (scheduled.find(({ id }) => id === expected.id)?.kind === "technical") invalidTechnicalIds.add(expected.id);
  }
  technicalOperation = invalidTechnicalIds.size;
  for(const chain of getTechnicalChains(problem.tasks)) {
    let invalid=false;
    for(let i=0;i<chain.length;i++){const expected=chain[i]!,matches=scheduled.filter(t=>t.id===expected.id),actual=matches[0];if(matches.length!==1||!actual||!technicalIdentityMatches(expected,actual))invalid=true;if(i===0&&expected.dependencies.length!==0)invalid=true;if(i>0){const prior=chain[i-1]!;if(expected.dependencies.length!==1||expected.dependencies[0]!==prior.id||!actual||scheduled.find(t=>t.id===prior.id)!.end>actual.start)invalid=true;}}
    if(invalid)technicalChain+=1;
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
  if (setupPreparation) reasonCodes.push("SETUP_PREPARATION_VIOLATION");
  if (jointGroup) reasonCodes.push("JOINT_GROUP_VIOLATION");
  if (technicalOperation) reasonCodes.push("TECHNICAL_OPERATION_VIOLATION");
  if (technicalChain) reasonCodes.push("TECHNICAL_CHAIN_VIOLATION");
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
    setupPreparationViolationCount: setupPreparation,
    jointGroupViolationCount: jointGroup,
    technicalOperationViolationCount: technicalOperation,
    technicalChainViolationCount: technicalChain,
    reasonCodes: reasonCodes.sort(),
  };
}
