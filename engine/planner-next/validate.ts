import type {
  Person,
  PlannerNextProblem,
  ScheduledSetupPreparation,
  ScheduledSpaceMeal,
  ScheduledParticipantMeal,
  ScheduledResourceMeal,
  ScheduledTask,
  Space,
  Resource,
  Task,
  ValidationSummary,
  Window,
} from "./contracts";
import { contains, overlaps } from "./time";
import { occupationAvoidsProtectedMeal } from "./spaceMeals";
import { effectiveResourceTransitionMinutes } from "./placement";
import { hasRequiredSecondaryContinuity, requiredSecondarySpaces, secondaryTasks } from "./secondaryContinuity";
import { preparationAvoidsMeal, preparationAvoidsOccupations, preparationWithinAvailability, preparationWithinDay, setupPreparationId, setupPreparationSequence, spaceOccupations } from "./setupPreparation";
import { followsSetupPolicy, hasSetupReentry, setupBlockCounts, setupFamilySequence, setupSpaces, setupTasks } from "./setupGrouping";
import { canonicalResourceIds, jointGroupIds, jointGroupMembers, synchronizedJointTasks } from "./jointTasks";
import { hasOwnTechnicalField, technicalIdentityMatches, technicalTasks } from "./technicalOperations";
import { canPlaceTask } from "./placement";
import { createScheduledSpaceMeal, spaceMealAvoidsMeals, spaceMealAvoidsTasks, spaceMealId, spaceMealWithinAvailability, spaceMealWithinDay, spaceMealWithinWindow, spacesWithMealPolicy } from "./spaceMeals";
import { mainFlowMealAligned, hasMainFlowMeal } from "./mainFlowMeal";
import { getTechnicalChains, technicalChainHasBranching, technicalChainHasCycle } from "./technicalChains";
import { evaluateResourcePresence } from "./resourcePresence";
import { anchoredAccompanimentPreflight, anchoredSequence, isInternalAnchoredPair } from "./anchoredAccompaniment";
import { taskFitsAvailability, validateTaskAvailability } from "./taskAvailability";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES } from "./integration/plannerNextCapabilities";
import {
  coachRouteTransitionPreflightReasons,
  effectiveCoachTransitionMinutes,
} from "./coachRouteTransitions";

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
  const reasons = new Set<string>(anchoredAccompanimentPreflight(problem));
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
  if (resources.some((resource) => resource.presenceConcentrationPolicy !== undefined
    && resource.presenceConcentrationPolicy !== "OFF"
    && resource.presenceConcentrationPolicy !== "PREFERRED"
    && resource.presenceConcentrationPolicy !== "REQUIRED")) reasons.add("INVALID_RESOURCE_PRESENCE_CONCENTRATION_POLICY");
  const auxiliaries = tasks.filter((task) => task?.kind === "auxiliary");
  if (auxiliaries.length > 0 && !problem.auxiliaryPolicy) reasons.add("MISSING_AUXILIARY_POLICY");
  if (problem.auxiliaryPolicy && !preferenceLevels.has(problem.auxiliaryPolicy.participantPresencePreference)) reasons.add("INVALID_AUXILIARY_POLICY");

  const participantIds = new Set(participants.map(({ id }) => id));
  const coachIds = new Set(coaches.map(({ id }) => id));
  const spaceIds = new Set(spaces.map(({ id }) => id));
  coachRouteTransitionPreflightReasons(problem).forEach((reason) => reasons.add(reason));
  if (resources.some((resource) => resource.assignedSpaceId !== undefined
    && (typeof resource.assignedSpaceId !== "string" || !spaceIds.has(resource.assignedSpaceId)))) {
    reasons.add("MISSING_RESOURCE_ASSIGNED_SPACE_REFERENCE");
  }
  const taskIds = new Set(tasks.map(({ id }) => id));
  const resourceIds = new Set(resources.map(({ id }) => id));
  const technicalIds = new Set(tasks.filter(t=>t?.kind==="technical").map(t=>t.id));
  const mainSpaceId = problem.mainFlow?.spaceId;
  const participantMeals = Array.isArray(problem.participantMeals) ? problem.participantMeals : [];
  if (hasDuplicateIds(participantMeals)) reasons.add("DUPLICATE_PARTICIPANT_MEAL_ID");
  if (new Set(participantMeals.map((meal) => meal.sourceTaskId)).size !== participantMeals.length) reasons.add("PARTICIPANT_MEAL_IDENTITY_CONFLICT");
  if (participantMeals.length > 0 && (!problem.participantMealCapacity || !Number.isInteger(problem.participantMealCapacity.maxSimultaneous) || problem.participantMealCapacity.maxSimultaneous <= 0)) reasons.add("INVALID_PARTICIPANT_MEAL_CAPACITY");
  for (const meal of participantMeals) {
    if (!participantIds.has(meal.participantId)) reasons.add("MISSING_PARTICIPANT_REFERENCE");
    if (!Number.isInteger(meal.duration) || meal.duration <= 0 || meal.duration%PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES!==0 || invalidWindow(meal.window, day) || meal.window.start%PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES!==0 || meal.window.end%PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES!==0 || meal.duration > meal.window.end - meal.window.start) reasons.add("INVALID_PARTICIPANT_MEAL_OBLIGATION");
    if (meal.status!=="pending"&&meal.status!=="interrupted"&&meal.status!=="done"&&meal.status!=="in_progress") reasons.add("INVALID_PARTICIPANT_MEAL_STATUS");
    if ((meal.status==="done"||meal.status==="in_progress")&&!meal.fixedInterval) reasons.add("PROTECTED_PARTICIPANT_MEAL_WITHOUT_FIXED_INTERVAL");
    if ((meal.status==="pending"||meal.status==="interrupted")&&meal.fixedInterval) reasons.add("FLEXIBLE_PARTICIPANT_MEAL_WITH_FIXED_INTERVAL");
    if (meal.fixedInterval && (invalidWindow(meal.fixedInterval, day) || meal.fixedInterval.end - meal.fixedInterval.start !== meal.duration || meal.fixedInterval.start < meal.window.start || meal.fixedInterval.end > meal.window.end)) reasons.add("INVALID_PROTECTED_PARTICIPANT_MEAL");
  }
  const resourceMeals=Array.isArray(problem.resourceMeals)?problem.resourceMeals:[];
  if(hasDuplicateIds(resourceMeals)||new Set(resourceMeals.map(meal=>meal.sourceTaskId)).size!==resourceMeals.length)reasons.add("RESOURCE_MEAL_IDENTITY_CONFLICT");
  for(const meal of resourceMeals){if(typeof meal.id!=="string"||!meal.id||typeof meal.sourceTaskId!=="string"||!meal.sourceTaskId||!Array.isArray(meal.resourceIds)||meal.resourceIds.length===0||new Set(meal.resourceIds).size!==meal.resourceIds.length||meal.resourceIds.some(id=>!resourceIds.has(id)&&!coachIds.has(id)))reasons.add("UNREPRESENTABLE_RESOURCE_BREAK");if(invalidWindow(meal.interval,day)||meal.interval.start%PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES!==0||meal.interval.end%PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES!==0)reasons.add("UNREPRESENTABLE_RESOURCE_BREAK");if(!["pending","interrupted","done","in_progress"].includes(meal.status))reasons.add("UNREPRESENTABLE_RESOURCE_BREAK");}
  for(let i=0;i<resourceMeals.length;i++)for(let j=i+1;j<resourceMeals.length;j++){const a=resourceMeals[i]!,b=resourceMeals[j]!;if(a.interval.start<b.interval.end&&b.interval.start<a.interval.end&&a.resourceIds.some(id=>b.resourceIds.includes(id)))reasons.add("UNREPRESENTABLE_RESOURCE_BREAK");}
  const itinerantMeals=Array.isArray(problem.itinerantUnitMeals)?problem.itinerantUnitMeals:[];
  if(hasDuplicateIds(itinerantMeals))reasons.add("ITINERANT_UNIT_MEAL_IDENTITY_CONFLICT");
  for(const meal of itinerantMeals)if(typeof meal.id!=="string"||!meal.id||!/^itinerant-team:[1-9]\d*$/.test(meal.itinerantUnitId)||invalidWindow(meal.interval,day)||meal.interval.start%PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES!==0||meal.interval.end%PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES!==0)reasons.add("UNREPRESENTABLE_ITINERANT_UNIT_BREAK");
  for(let i=0;i<itinerantMeals.length;i++)for(let j=i+1;j<itinerantMeals.length;j++){const a=itinerantMeals[i]!,b=itinerantMeals[j]!;if(a.itinerantUnitId===b.itinerantUnitId&&a.interval.start<b.interval.end&&b.interval.start<a.interval.end)reasons.add("UNREPRESENTABLE_ITINERANT_UNIT_BREAK");}
  const usedUnitIds=new Set([...tasks.map(task=>task.itinerantUnitId),...itinerantMeals.map(meal=>meal.itinerantUnitId)].filter((id):id is string=>id!==undefined));
  if(tasks.some(task=>task.itinerantUnitId!==undefined&&(task.requiredResourceIds??[]).includes(task.itinerantUnitId))||resources.some(resource=>usedUnitIds.has(resource.id)))reasons.add("ITINERANT_UNIT_RESOURCE_ALIAS_NOT_ALLOWED");
  if (!mainSpaceId || !spaceIds.has(mainSpaceId)) reasons.add("MISSING_MAIN_FLOW_SPACE");
  for (const space of spaces) {
    if(Object.prototype.hasOwnProperty.call(space,"mealPolicy")){const p=(space as {mealPolicy?:unknown}).mealPolicy;const validObject=p!==null&&typeof p==="object"&&!Array.isArray(p);const policy=validObject?p as {window?:unknown;duration?:unknown}:undefined;const w=policy?.window as {start?:unknown;end?:unknown}|undefined;const duration=policy?.duration;const validWindow=w!==null&&typeof w==="object"&&Number.isFinite(w.start)&&Number.isInteger(w.start)&&Number.isFinite(w.end)&&Number.isInteger(w.end)&&(w.start as number)<(w.end as number)&&(w.start as number)>=day.start&&(w.end as number)<=day.end;const validDuration=typeof duration==="number"&&Number.isFinite(duration)&&Number.isInteger(duration)&&duration>0&&validWindow&&duration<=(w!.end as number)-(w!.start as number);const fits=validDuration&&Math.ceil((w!.start as number)/5)*5+duration<=(w!.end as number);const available=validWindow&&space.availability.some(a=>a.start<=(w!.start as number)&&(w!.end as number)<=a.end);if(!validObject||!validWindow||!validDuration||!fits||!available)reasons.add("INVALID_SPACE_MEAL_POLICY");if(space.id===mainSpaceId){if(!mainFlowMealAligned(problem))reasons.add("MAIN_FLOW_MEAL_ALIGNMENT_INVALID");if(space.setupPolicy!==undefined||space.secondaryContinuity!==undefined&&space.secondaryContinuity!=="OFF")reasons.add("SPACE_MEAL_IN_STRUCTURED_SPACE_UNSUPPORTED");const own=tasks.filter(t=>t?.spaceId===space.id);if(own.some(t=>t.kind!=="main"||!t.participantId||!t.coachId||!t.blockKey))reasons.add("SPACE_MEAL_TASK_KIND_UNSUPPORTED");}else{if(space.setupPolicy!==undefined)reasons.add("SPACE_MEAL_IN_STRUCTURED_SPACE_UNSUPPORTED");const own=tasks.filter(t=>t?.spaceId===space.id);if(own.some(t=>t.kind!=="auxiliary"||t.jointGroupId!==undefined||t.setupFamilyId!==undefined||!Array.isArray(t.dependencies)||t.dependencies.length>0||t.coachId!==undefined)||(space.secondaryContinuity==="REQUIRED"&&own.length<2))reasons.add("SPACE_MEAL_TASK_KIND_UNSUPPORTED");}}
    if (space.setupPolicy !== undefined) {
      const policy = space.setupPolicy as { familyOrder?: unknown; flexibleFamilyOrder?: unknown; reentry?: unknown; preparationMinutesByFamily?: unknown; preparationMinutesBetweenFamilies?: unknown };
      if (!policy || typeof policy !== "object" || !Array.isArray(policy.familyOrder) || policy.familyOrder.length === 0 || policy.familyOrder.some((x) => typeof x !== "string" || x.length === 0)) reasons.add("INVALID_SETUP_POLICY");
      const order = Array.isArray(policy?.familyOrder) ? policy.familyOrder.filter((x): x is string => typeof x === "string") : [];
      if (new Set(order).size !== order.length) reasons.add("DUPLICATE_SETUP_FAMILY");
      if (policy?.flexibleFamilyOrder !== undefined && typeof policy.flexibleFamilyOrder !== "boolean") reasons.add("INVALID_SETUP_POLICY");
      if (policy?.reentry !== "FORBIDDEN") reasons.add("UNSUPPORTED_SETUP_REENTRY");
      if (policy.flexibleFamilyOrder === true) {
        if (Object.prototype.hasOwnProperty.call(policy, "preparationMinutesByFamily")) reasons.add("INVALID_SETUP_PREPARATION_POLICY");
        const minutes = policy.preparationMinutesBetweenFamilies;
        if (typeof minutes !== "number" || !Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes <= 0 || minutes % PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES !== 0) reasons.add("INVALID_SETUP_PREPARATION_POLICY");
      } else {
        if (Object.prototype.hasOwnProperty.call(policy, "preparationMinutesBetweenFamilies")) reasons.add("INVALID_SETUP_PREPARATION_POLICY");
        if (Object.prototype.hasOwnProperty.call(policy, "preparationMinutesByFamily")) {
          const record = policy.preparationMinutesByFamily;
          const plain = record !== null && typeof record === "object" && !Array.isArray(record) && Object.getPrototypeOf(record) === Object.prototype;
          if (!plain) reasons.add("INVALID_SETUP_PREPARATION_POLICY");
          else {
            const entries = Object.entries(record as Record<string, unknown>);
            const suffixFamilies = order.slice(1);
            const validFull = entries.length === order.length && entries.every(([family, value]) => order.includes(family) && typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0) && order.every(family => Object.prototype.hasOwnProperty.call(record, family));
            const validSuffix = entries.length === suffixFamilies.length && entries.every(([family, value]) => suffixFamilies.includes(family) && typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0) && suffixFamilies.every(family => Object.prototype.hasOwnProperty.call(record, family));
            if (!validFull && !validSuffix) reasons.add("INVALID_SETUP_PREPARATION_POLICY");
          }
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
    if (usableDay && !validateTaskAvailability(task, day)) reasons.add(`INVALID_TASK_AVAILABILITY:${task.id}`);
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
      if (!Array.isArray(task.dependencies) || (task.jointGroupId === undefined && task.dependencies.length > 0)) reasons.add("AUXILIARY_DEPENDENCY_UNSUPPORTED");
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
    const memberIds=new Set(members.map(t=>t.id));
    if(members.some(t=>t.dependencies.some(dep=>memberIds.has(dep)))) reasons.add("JOINT_GROUP_INTERNAL_DEPENDENCY_UNSUPPORTED");
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

export function validatePlan(problem: PlannerNextProblem, scheduled: ScheduledTask[], preparations: ScheduledSetupPreparation[] = [], meals:ScheduledSpaceMeal[]=[], participantMeals: ScheduledParticipantMeal[] = [], resourceMeals: ScheduledResourceMeal[] = [], itinerantUnitMeals: import("./contracts").ScheduledItinerantUnitMeal[] = []): ValidationSummary {
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
  let spaceMeal = 0;
  let participantMeal = 0;
  let resourceMeal = 0;
  let itinerantUnitMeal = 0;
  let itinerantUnitResourceAlias = false;
  const publishedResourceMeals=resourceMeals;
  const byId = new Map(scheduled.map((task) => [task.id, task]));
  const participants = new Map(problem.participants.map((item) => [item.id, item]));
  const coaches = new Map(problem.coaches.map((item) => [item.id, item]));
  const spaces = new Map(problem.spaces.map((item) => [item.id, item]));
  const resources = new Map(problem.resources.map((item) => [item.id, item]));
  const taskAvailabilityIds=new Set<string>();
  const expectedTaskById=new Map(problem.tasks.map(task=>[task.id,task]));

  for (const task of scheduled) {
    if(expectedTaskById.get(task.id)?.itinerantUnitId!==task.itinerantUnitId)itinerantUnitMeal+=1;
    if(task.itinerantUnitId!==undefined&&(task.requiredResourceIds??[]).includes(task.itinerantUnitId))itinerantUnitResourceAlias=true;
    const participant = participants.get(task.participantId);
    const coach = task.coachId === undefined ? undefined : coaches.get(task.coachId);
    const space = spaces.get(task.spaceId);
    if (task.end - task.start !== task.duration
      || task.start < problem.day.start || task.end > problem.day.end
      || !occupationAvoidsProtectedMeal(problem,task.spaceId,task.start,task.end)
      || (task.kind !== "technical" && (!participant || !contains(participant.availability, task.start, task.end)))
      || (task.coachId !== undefined && (!coach || !contains(coach.availability, task.start, task.end)))
      || !space || !contains(space.availability, task.start, task.end)) availability += 1;
    if (!taskFitsAvailability(task,task.start,task.end)) taskAvailabilityIds.add(task.id);
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
    const groups = new Map<string, ScheduledTask[]>();
    for (const task of scheduled) {
      const value = task[field];
      if (value !== undefined) groups.set(value, [...(groups.get(value) ?? []), task]);
    }
    for (const [identity, list] of groups) {
      list.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
      for (let index = 1; index < list.length; index += 1) {
        const previous = list[index - 1];
        const current = list[index];
        if (!previous || !current || previous.spaceId === current.spaceId) continue;
        const margin = field === "participantId"
          ? problem.participantTransitionMinutes
          : effectiveCoachTransitionMinutes(problem, identity, previous.spaceId, current.spaceId);
        if (current.start - previous.end < margin
          && !isInternalAnchoredPair(problem, previous, current)) transition += 1;
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
      if (shared.length > 0 && a.spaceId !== b.spaceId && b.start - a.end < margin && !isInternalAnchoredPair(problem,a,b)) resourceTransition += 1;
    }
  }
  const mains = scheduled.filter(({ kind }) => kind === "main").sort((a, b) => a.start - b.start);
  const mainFlowOccupations=[...mains];
  const lastMain = mains.at(-1);
  let mainFlowMeal = 0;
  const mainPolicy = problem.spaces.find(x=>x.id===problem.mainFlow.spaceId)?.mealPolicy;
  const ownMeals = meals.filter(x=>x.spaceId===problem.mainFlow.spaceId);
  if (mainPolicy) {
    const meal=ownMeals[0], morning=mainFlowOccupations.filter(x=>x.end<=problem.protectedMeal.start), afternoon=mainFlowOccupations.filter(x=>x.start>=problem.protectedMeal.end);
    const consecutive=(xs:ScheduledTask[])=>xs.slice(1).every((x,i)=>xs[i]?.end===x.start);
    const morningMains=mains.filter(x=>x.end<=meal!.start),afternoonMains=mains.filter(x=>x.start>=meal!.end);const invalid=ownMeals.length!==1||!meal||meal.id!==spaceMealId(problem.mainFlow.spaceId)||meal.kind!=="space-meal"||meal.entryIndex!==1||meal.duration!==mainPolicy.duration||meal.start!==problem.mainFlow.preferredEnd||meal.start!==problem.protectedMeal.start||meal.end!==problem.protectedMeal.end||!spaceMealWithinDay(problem,meal)||!spaceMealWithinAvailability(problem.spaces.find(x=>x.id===problem.mainFlow.spaceId)!,meal)||!spaceMealAvoidsTasks(meal,mainFlowOccupations)||morning.length===0||morning.at(-1)?.end!==meal.start||(afternoon.length>0&&afternoon[0]?.start!==meal.end)||!consecutive(morning)||!consecutive(afternoon)||(afternoonMains.length>0&&morningMains.at(-1)?.blockKey===afternoonMains[0]?.blockKey)||morning.length+afternoon.length!==mainFlowOccupations.length;
    if(invalid)mainFlowMeal=1;
  }
  if (mains.length > 0) {
    if (!mainPolicy && (!lastMain || lastMain.end !== problem.mainFlow.preferredEnd)) block += 1;
    for (let index = 1; index < mains.length; index += 1) {
      const previous = mains[index - 1]; const current = mains[index];
      const between=previous&&current?mainFlowOccupations.filter(x=>previous.start<=x.start&&x.end<=current.end):[];const connected=between.slice(1).every((x,i)=>between[i]!.end===x.start)||(mainPolicy&&between.some(x=>x.end===problem.protectedMeal.start)&&between.some(x=>x.start===problem.protectedMeal.end));if (!previous || !current || !connected) block += 1;
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
    const occupations = spaceOccupations(actual, preparations, space.id, meals);
    if (actual.length !== expected.length || actual.some((task) => !expected.some(({ id }) => id === task.id)) || !hasRequiredSecondaryContinuity(occupations)) secondaryContinuity += 1;
  }
  for (const space of setupSpaces(problem)) {
    const expected = setupTasks(problem.tasks, space.id), actual = setupTasks(scheduled, space.id);
    const policy = space.setupPolicy!;
    const invalid = actual.length !== expected.length || actual.some((task) => !expected.some(({ id }) => id === task.id))
      || actual.some((task) => !task.setupFamilyId || task.spaceId !== space.id)
      || !followsSetupPolicy(actual, policy) || hasSetupReentry(actual)
      || policy.familyOrder.some((family) => setupBlockCounts(actual)[family] !== 1);
    if (invalid) setup += 1;
  }
  for (const space of setupSpaces(problem).filter((candidate) => candidate.setupPolicy?.preparationMinutesByFamily !== undefined || candidate.setupPolicy?.preparationMinutesBetweenFamilies !== undefined)) {
    const policy = space.setupPolicy!;
    const ownTasks = setupTasks(scheduled, space.id);
    const ownPreparations = preparations.filter((item) => item.spaceId === space.id);
    const occupied = spaceOccupations(scheduled, preparations, space.id);
    const sequence = setupFamilySequence(ownTasks);
    const durationByFamily: Record<string, number> = policy.flexibleFamilyOrder === true
      ? Object.fromEntries(sequence.slice(1).map((family) => [family, policy.preparationMinutesBetweenFamilies!]))
      : { ...(policy.preparationMinutesByFamily ?? {}) };
    const expectedPreparationSequence = sequence.filter((family) => Object.prototype.hasOwnProperty.call(durationByFamily, family));
    for (const family of expectedPreparationSequence) {
      const familyIndex = sequence.indexOf(family);
      const previousFamily = familyIndex > 0 ? sequence[familyIndex - 1] : undefined;
      const matches = ownPreparations.filter((item) => item.setupFamilyId === family);
      const preparation = matches[0];
      const familyTasks = ownTasks.filter((task) => task.setupFamilyId === family).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
      const previousTasks = previousFamily === undefined ? [] : ownTasks.filter((task) => task.setupFamilyId === previousFamily).sort((a,b)=>a.end-b.end||a.id.localeCompare(b.id));
      const expectedStart = previousFamily === undefined ? occupied[0]?.start : previousTasks.at(-1)?.end;
      const invalid = matches.length !== 1 || !preparation || preparation.entryIndex !== 1 || preparation.id !== setupPreparationId(space.id,family,1)
        || preparation.kind !== "setup-preparation" || preparation.duration !== durationByFamily[family] || preparation.end-preparation.start !== preparation.duration
        || !preparationWithinDay(problem,preparation) || !preparationWithinAvailability(space.availability,preparation) || !occupationAvoidsProtectedMeal(problem,preparation.spaceId,preparation.start,preparation.end)
        || !preparationAvoidsOccupations(preparation,occupied) || !familyTasks[0] || preparation.end !== familyTasks[0].start
        || preparation.start !== expectedStart;
      if (invalid) setupPreparation += 1;
    }
    const extras = ownPreparations.filter((item) => !expectedPreparationSequence.includes(item.setupFamilyId));
    setupPreparation += extras.length;
    const actualPreparationSequence = setupPreparationSequence(ownPreparations);
    if (actualPreparationSequence.length !== expectedPreparationSequence.length || actualPreparationSequence.some((family,index)=>family!==expectedPreparationSequence[index])) setupPreparation += 1;
  }
  setupPreparation += preparations.filter((item) => !problem.spaces.some((space) => space.id === item.spaceId && (space.setupPolicy?.preparationMinutesByFamily !== undefined || space.setupPolicy?.preparationMinutesBetweenFamilies !== undefined))).length;

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
  const expectedById=new Map(problem.tasks.map(task=>[task.id,task]));
  const scheduledById=new Map(scheduled.map(task=>[task.id,task]));
  const scheduledCountById=new Map<string,number>();
  for(const task of scheduled)scheduledCountById.set(task.id,(scheduledCountById.get(task.id)??0)+1);
  const invalidTechnicalChainRootIds=new Set<string>();
  for(const chain of getTechnicalChains(problem.tasks)) {
    const rootTaskId=chain[0]?.id;if(!rootTaskId)continue;let invalid=false;
    const memberIds=new Set(chain.map(task=>task.id));
    for(let i=0;i<chain.length;i++){
      const expected=chain[i]!,actual=scheduledById.get(expected.id),prior=i>0?chain[i-1]:undefined;
      if(scheduledCountById.get(expected.id)!==1||!actual||actual.kind!=="technical"||!technicalIdentityMatches(expected,actual))invalid=true;
      if(!prior){if(expected.dependencies.length!==0)invalid=true;}
      else {
        if(expected.dependencies.length!==1||expected.dependencies[0]!==prior.id)invalid=true;
        const predecessor=scheduledById.get(prior.id);
        if(!predecessor||!actual)invalid=true;
        else if(predecessor.end>actual.start)invalid=true;
      }
    }
    for(const actual of scheduled.filter(task=>task.kind==="technical"&&!memberIds.has(task.id))){
      const dependencies=Array.isArray(actual.dependencies)?actual.dependencies:[];
      if(dependencies.some(id=>memberIds.has(id))||chain.some(member=>member.dependencies.includes(actual.id)))invalid=true;
    }
    for(const member of chain){const actual=scheduledById.get(member.id);if(actual&&actual.dependencies.some(id=>!memberIds.has(id)&&!expectedById.has(id)))invalid=true;}
    if(invalid)invalidTechnicalChainRootIds.add(rootTaskId);
  }
  technicalChain=[...invalidTechnicalChainRootIds].sort().length;

  const invalidMealSpaces=new Set<string>();const policyIds=new Set(spacesWithMealPolicy(problem).map(s=>s.id));for(const space of spacesWithMealPolicy(problem)){const policy=space.mealPolicy!,own=meals.filter(m=>m.spaceId===space.id),m=own[0];if(own.length!==1||!m||m.entryIndex!==1||m.id!==spaceMealId(space.id)||m.kind!=="space-meal"||m.spaceId!==space.id||m.duration!==policy.duration||m.end-m.start!==m.duration||m.start%5!==0||!spaceMealWithinDay(problem,m)||!spaceMealWithinWindow(policy,m)||!spaceMealWithinAvailability(space,m)||!spaceMealAvoidsTasks(m,scheduled)||!spaceMealAvoidsMeals(m,meals.filter(x=>x!==m)))invalidMealSpaces.add(space.id)}for(const m of meals)if(!policyIds.has(m.spaceId))invalidMealSpaces.add(m.spaceId);spaceMeal=[...invalidMealSpaces].sort().length;

  const expectedParticipantMeals = new Map((problem.participantMeals ?? []).map((meal) => [meal.sourceTaskId, meal]));
  const actualCounts = new Map<string, number>();
  for (const meal of participantMeals) {
    actualCounts.set(meal.sourceTaskId, (actualCounts.get(meal.sourceTaskId) ?? 0) + 1);
    const expected = expectedParticipantMeals.get(meal.sourceTaskId);
    const person = participants.get(meal.participantId);
    if (!expected || meal.id !== expected.id || meal.participantId !== expected.participantId || meal.duration !== expected.duration || meal.end - meal.start !== expected.duration
      || meal.start < expected.window.start || meal.end > expected.window.end || !person || !contains(person.availability, meal.start, meal.end)
      || (expected.fixedInterval && (meal.start !== expected.fixedInterval.start || meal.end !== expected.fixedInterval.end))
      || scheduled.some((task) => task.participantId === meal.participantId && overlaps(task, meal))) participantMeal += 1;
  }
  for (const expected of expectedParticipantMeals.values()) if (actualCounts.get(expected.sourceTaskId) !== 1) participantMeal += 1;
  const points = participantMeals.flatMap((meal) => [{ minute: meal.start, delta: 1 }, { minute: meal.end, delta: -1 }]).sort((a,b)=>a.minute-b.minute||a.delta-b.delta);
  let concurrent=0;for(const point of points){concurrent+=point.delta;if(concurrent>(problem.participantMealCapacity?.maxSimultaneous??0)){participantMeal+=1;break;}}
  const expectedResourceMeals=problem.resourceMeals??[];
  const key=(meal:{id:string;sourceTaskId:string;resourceIds:string[];start:number;end:number;duration:number})=>JSON.stringify({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds].sort(),start:meal.start,end:meal.end,duration:meal.duration});
  const expectedKeys=expectedResourceMeals.map(meal=>key({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:meal.resourceIds,start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
  const actualKeys=publishedResourceMeals.map(key);resourceMeal+=expectedKeys.filter((value,index)=>actualKeys.filter(x=>x===value).length!==1||expectedKeys.indexOf(value)!==index).length;resourceMeal+=actualKeys.filter(value=>!expectedKeys.includes(value)).length;
  for(const meal of publishedResourceMeals)for(const task of scheduled)if(task.start<meal.end&&meal.start<task.end&&((task.requiredResourceIds??[]).some(id=>meal.resourceIds.includes(id))||(task.coachId!==undefined&&meal.resourceIds.includes(task.coachId))))resourceMeal++;
  const itinerantKey=(meal:{id:string;itinerantUnitId:string;start:number;end:number;duration:number})=>JSON.stringify(meal);
  const expectedItinerant=(problem.itinerantUnitMeals??[]).map(meal=>itinerantKey({id:meal.id,itinerantUnitId:meal.itinerantUnitId,start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
  const actualItinerant=itinerantUnitMeals.map(itinerantKey);
  itinerantUnitMeal+=expectedItinerant.filter((value,index)=>actualItinerant.filter(x=>x===value).length!==1||expectedItinerant.indexOf(value)!==index).length;
  itinerantUnitMeal+=actualItinerant.filter(value=>!expectedItinerant.includes(value)).length;
  for(const meal of itinerantUnitMeals)for(const task of scheduled)if(task.itinerantUnitId===meal.itinerantUnitId&&task.start<meal.end&&meal.start<task.end)itinerantUnitMeal++;
  const usedScheduledUnitIds=new Set([...scheduled.map(task=>task.itinerantUnitId),...itinerantUnitMeals.map(meal=>meal.itinerantUnitId)].filter((id):id is string=>id!==undefined));
  if(problem.resources.some(resource=>usedScheduledUnitIds.has(resource.id)))itinerantUnitResourceAlias=true;

  let anchoredAccompaniment=0;
  for(const contract of problem.anchoredAccompaniments??[]){const sequence=anchoredSequence(contract);const actual=sequence.map(id=>scheduled.filter(t=>t.id===id));let invalid=actual.some(xs=>xs.length!==1);const flat=actual.map(xs=>xs[0]).filter((x):x is ScheduledTask=>Boolean(x));if(flat.length===sequence.length){invalid ||= flat.slice(1).some((t,i)=>flat[i]!.end!==t.start)||flat.some((t,i)=>t.end-t.start!==problem.tasks.find(x=>x.id===sequence[i])?.duration||t.participantId!==flat[0]!.participantId||t.spaceId!==problem.tasks.find(x=>x.id===t.id)?.spaceId||JSON.stringify([...(t.requiredResourceIds??[])].sort())!==JSON.stringify([...(problem.tasks.find(x=>x.id===t.id)?.requiredResourceIds??[])].sort()));if(contract.itinerantUnitId)invalid||=(problem.itinerantUnitMeals??[]).some(meal=>meal.itinerantUnitId===contract.itinerantUnitId&&flat[0]!.start<meal.interval.end&&meal.interval.start<flat.at(-1)!.end);}if(invalid)anchoredAccompaniment+=1;}
  const reasonCodes: string[] = [];
  if (scheduled.length !== problem.tasks.length) reasonCodes.push("UNPLANNED_TASKS");
  if (dependency) reasonCodes.push("DEPENDENCY_VIOLATION");
  if (overlap) reasonCodes.push("OVERLAP_VIOLATION");
  if (transition) reasonCodes.push("TRANSITION_VIOLATION");
  if (availability) reasonCodes.push("AVAILABILITY_VIOLATION");
  for(const id of [...taskAvailabilityIds].sort()) reasonCodes.push(`TASK_AVAILABILITY:${id}`);
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
  if (spaceMeal) reasonCodes.push("SPACE_MEAL_VIOLATION");
  if (mainFlowMeal) reasonCodes.push("MAIN_FLOW_MEAL_VIOLATION");
  if (anchoredAccompaniment) reasonCodes.push("ANCHORED_ACCOMPANIMENT_VIOLATION");
  if (participantMeal) reasonCodes.push("PARTICIPANT_MEAL_VIOLATION");
  if (resourceMeal) reasonCodes.push("RESOURCE_MEAL_VIOLATION");
  if (itinerantUnitMeal) reasonCodes.push("ITINERANT_UNIT_MEAL_VIOLATION");
  if(itinerantUnitResourceAlias)reasonCodes.push("ITINERANT_UNIT_RESOURCE_ALIAS_NOT_ALLOWED");
  for (const resource of [...problem.resources].sort((a, b) => a.id.localeCompare(b.id))) {
    if (resource?.presenceConcentrationPolicy !== "REQUIRED") continue;
    const presence = evaluateResourcePresence(resource, scheduled, meals,publishedResourceMeals);
    if (!presence.requiredPolicySatisfied) reasonCodes.push(`RESOURCE_REQUIRED_PRESENCE_VIOLATION:${resource.id}`);
  }
  return {
    hardValid: reasonCodes.length === 0,
    dependencyViolationCount: dependency,
    overlapViolationCount: overlap,
    transitionViolationCount: transition,
    availabilityViolationCount: availability,
    taskAvailabilityViolationCount: taskAvailabilityIds.size,
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
    spaceMealViolationCount:spaceMeal,
    mainFlowMealViolationCount:mainFlowMeal,
    anchoredAccompanimentViolationCount:anchoredAccompaniment,
    participantMealViolationCount: participantMeal,
    resourceMealViolationCount: resourceMeal,
    itinerantUnitMealViolationCount: itinerantUnitMeal,
    reasonCodes: reasonCodes.sort(),
  };
}
