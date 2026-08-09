from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# EngineInput contract: one flexible operational meal can span physical resources and zero or more spaces.
replace_once(
    "engine/types.ts",
    '''export interface EngineInputCoachRouteTransitionInput {\n  coachPlanResourceItemId: number;\n  fromSpaceId: number;\n  toSpaceId: number;\n  minutes: number;\n}\n\nexport interface EngineInput {''',
    '''export interface EngineInputCoachRouteTransitionInput {\n  coachPlanResourceItemId: number;\n  fromSpaceId: number;\n  toSpaceId: number;\n  minutes: number;\n}\n\nexport interface EngineInputOperationalMealPolicyInput {\n  /** Stable identity of one operational meal obligation. */\n  id: string;\n  /** Flexible window selected from effective day configuration. */\n  window: TimeWindow;\n  durationMinutes: number;\n  /** IDs from the plan_resource_items snapshot; never itinerant-unit aliases. */\n  planResourceItemIds: number[];\n  /** Optional physical spaces blocked by the same single meal obligation. */\n  spaceIds?: number[];\n}\n\nexport interface EngineInput {''',
)
replace_once(
    "engine/types.ts",
    '''  /** Directional hard travel time for one concrete coach between two spaces. */\n  coachRouteTransitions?: EngineInputCoachRouteTransitionInput[];\n  workDay: TimeWindow;''',
    '''  /** Directional hard travel time for one concrete coach between two spaces. */\n  coachRouteTransitions?: EngineInputCoachRouteTransitionInput[];\n  /** Flexible operational meals scoped by physical resources/spaces. */\n  operationalMealPolicies?: EngineInputOperationalMealPolicyInput[];\n  workDay: TimeWindow;''',
)

# Planner Next contract. Search support is intentionally fail-closed until the next delta.
replace_once(
    "engine/planner-next/contracts.ts",
    '''  resourceMeals?: ResourceMealBreak[];\n  itinerantUnitMeals?: ItinerantUnitMealBreak[];''',
    '''  resourceMeals?: ResourceMealBreak[];\n  operationalMealPolicies?: OperationalMealPolicy[];\n  itinerantUnitMeals?: ItinerantUnitMealBreak[];''',
)
replace_once(
    "engine/planner-next/contracts.ts",
    '''export interface ResourceMealBreak { id:string; sourceTaskId:string; resourceIds:string[]; interval:Window; status:"pending"|"interrupted"|"done"|"in_progress" }\nexport interface ScheduledResourceMeal { id:string; sourceTaskId:string; resourceIds:string[]; start:Minute; end:Minute; duration:Minute }''',
    '''export interface ResourceMealBreak { id:string; sourceTaskId:string; resourceIds:string[]; interval:Window; status:"pending"|"interrupted"|"done"|"in_progress" }\nexport interface ScheduledResourceMeal { id:string; sourceTaskId:string; resourceIds:string[]; start:Minute; end:Minute; duration:Minute }\n\n/** One flexible operational pause. Physical resources keep this identity across recomposition. */\nexport interface OperationalMealPolicy {\n  id: string;\n  window: Window;\n  duration: Minute;\n  resourceIds: string[];\n  spaceIds: string[];\n}''',
)

# Search-policy capability exists but is unsupported: adaptation can be lossless without accidental execution.
replace_once(
    "engine/planner-next/searchPolicy.ts",
    '''export type PlannerCapability = "ANCHORED_ACCOMPANIMENT" | "TRANSPORT_GROUPING";''',
    '''export type PlannerCapability = "ANCHORED_ACCOMPANIMENT" | "OPERATIONAL_MEAL_POLICY" | "TRANSPORT_GROUPING";''',
)
replace_once(
    "engine/planner-next/searchPolicy.ts",
    '''  TRANSPORT_GROUPING: defineCapabilityRequirement({\n    capability: "TRANSPORT_GROUPING",\n    supportedPolicies: ["EXACT_CONSTRUCTIVE"],\n    requiredPolicy: "EXACT_CONSTRUCTIVE",\n  }),''',
    '''  OPERATIONAL_MEAL_POLICY: defineCapabilityRequirement({\n    capability: "OPERATIONAL_MEAL_POLICY",\n    supportedPolicies: [],\n  }),\n  TRANSPORT_GROUPING: defineCapabilityRequirement({\n    capability: "TRANSPORT_GROUPING",\n    supportedPolicies: ["EXACT_CONSTRUCTIVE"],\n    requiredPolicy: "EXACT_CONSTRUCTIVE",\n  }),''',
)
replace_once(
    "engine/planner-next/searchPolicy.ts",
    '''    ...(problem.anchoredAccompaniments?.length ? ["ANCHORED_ACCOMPANIMENT" as const] : []),\n    ...(problem.transportPolicy ? ["TRANSPORT_GROUPING" as const] : []),''',
    '''    ...(problem.anchoredAccompaniments?.length ? ["ANCHORED_ACCOMPANIMENT" as const] : []),\n    ...(problem.operationalMealPolicies?.length ? ["OPERATIONAL_MEAL_POLICY" as const] : []),\n    ...(problem.transportPolicy ? ["TRANSPORT_GROUPING" as const] : []),''',
)

# EngineInput preflight: normalize/validate explicit flexible operational meal policies.
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''import { resolveAssignedItinerantUnitMealBreaks } from "./assignedItinerantUnitMealBreaks";''',
    '''import { resolveAssignedItinerantUnitMealBreaks } from "./assignedItinerantUnitMealBreaks";\nimport { resolveFlexibleOperationalMealPolicies } from "./flexibleOperationalMealPolicies";''',
)
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''  | "UNSUPPORTED_BREAK_SCOPE"\n  | "UNSUPPORTED_COACH_ROUTE_TRANSITION"''',
    '''  | "UNSUPPORTED_BREAK_SCOPE"\n  | "UNSUPPORTED_OPERATIONAL_MEAL_POLICY"\n  | "UNSUPPORTED_COACH_ROUTE_TRANSITION"''',
)
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''  "roundSynchronizations",\n]);''',
    '''  "roundSynchronizations", "operationalMealPolicies", "planResourceItemIds",\n]);''',
)
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''    protectedBreaks: input.protectedBreaks?.map((entry) => ({ ...entry, label: undefined })),\n    contestantMealDurationMinutes: input.contestantMealDurationMinutes,''',
    '''    protectedBreaks: input.protectedBreaks?.map((entry) => ({ ...entry, label: undefined })),\n    operationalMealPolicies: input.operationalMealPolicies,\n    contestantMealDurationMinutes: input.contestantMealDurationMinutes,''',
)
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''  const resourceMealTaskIds = new Set(input.tasks.filter(task=>task.breakKind==="resource_meal").map(task=>task.id));\n  const resourceMeals = resolveAssignedResourceMealBreaks(input);''',
    '''  const resourceMealTaskIds = new Set(input.tasks.filter(task=>task.breakKind==="resource_meal").map(task=>task.id));\n  const resourceMeals = resolveAssignedResourceMealBreaks(input);\n  const operationalMealPolicies = resolveFlexibleOperationalMealPolicies(input);''',
)
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''  for (const defect of flexibleParticipantMeals.defects) addIssue(defect.code, "task", defect.taskId, `tasks.${defect.taskId}.participantMeal`, "Flexible participant meal task cannot be represented exactly.", defect.details);\n\n  addIdentity("plan", input.planId, "planId", true);''',
    '''  for (const defect of flexibleParticipantMeals.defects) addIssue(defect.code, "task", defect.taskId, `tasks.${defect.taskId}.participantMeal`, "Flexible participant meal task cannot be represented exactly.", defect.details);\n  for (const policy of operationalMealPolicies) if (policy.status === "UNSUPPORTED") addIssue(\n    "UNSUPPORTED_OPERATIONAL_MEAL_POLICY", "break", policy.id || "missing", `operationalMealPolicies.${policy.id || "missing"}`,\n    "Flexible operational meal policy cannot be represented exactly.", { defects: policy.defects, resourceIds: policy.resourceIds, spaceIds: policy.spaceIds, window: policy.window, duration: policy.duration },\n  );\n\n  addIdentity("plan", input.planId, "planId", true);''',
)
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''  input.planResourceItems.forEach((resource) => {\n    addIdentity("plan-resource", resource.id, `planResourceItems.${resource.id}.id`, true);\n    addIdentity("resource-item", resource.resourceItemId, `planResourceItems.${resource.id}.resourceItemId`, true);\n    addIdentity("resource-type", resource.typeId, `planResourceItems.${resource.id}.typeId`);\n  });''',
    '''  input.planResourceItems.forEach((resource) => {\n    addIdentity("plan-resource", resource.id, `planResourceItems.${resource.id}.id`, true);\n    addIdentity("resource-item", resource.resourceItemId, `planResourceItems.${resource.id}.resourceItemId`, true);\n    addIdentity("resource-type", resource.typeId, `planResourceItems.${resource.id}.typeId`);\n  });\n  (input.operationalMealPolicies ?? []).forEach((policy, index) => {\n    addIdentity("break", policy.id, `operationalMealPolicies.${index}.id`, true);\n    policy.planResourceItemIds?.forEach((id) => addIdentity("plan-resource", id, `operationalMealPolicies.${index}.planResourceItemIds`));\n    policy.spaceIds?.forEach((id) => addIdentity("space", id, `operationalMealPolicies.${index}.spaceIds`));\n  });''',
)
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''  input.protectedBreaks?.forEach((entry) => { if (entry.spaceId != null) referencedSpaceIds.add(String(entry.spaceId)); });\n  if (input.actualMeal?.spaceId != null) referencedSpaceIds.add(String(input.actualMeal.spaceId));''',
    '''  input.protectedBreaks?.forEach((entry) => { if (entry.spaceId != null) referencedSpaceIds.add(String(entry.spaceId)); });\n  input.operationalMealPolicies?.flatMap((policy) => policy.spaceIds ?? []).forEach((id) => referencedSpaceIds.add(String(id)));\n  if (input.actualMeal?.spaceId != null) referencedSpaceIds.add(String(input.actualMeal.spaceId));''',
)
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''  effectiveTaskResourceAssignments.assignments.forEach((assignment) => assignment.effectiveResourceIds\n    .forEach((id) => requireResource(id, assignment.taskId)));\n  coachRouteTransitionResolution.routes.forEach((route) => {''',
    '''  effectiveTaskResourceAssignments.assignments.forEach((assignment) => assignment.effectiveResourceIds\n    .forEach((id) => requireResource(id, assignment.taskId)));\n  operationalMealPolicies.filter((policy) => policy.status === "SUPPORTED").forEach((policy) => policy.resourceIds.forEach((id) => requireResource(id)));\n  coachRouteTransitionResolution.routes.forEach((route) => {''',
)
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''  if ((input.mealMode === "flexible_meal_window" || input.mealWindow || input.mealWindowStart || input.mealWindowEnd) && flexibleParticipantMeals.obligations.length === 0) {\n    addIssue("UNSUPPORTED_BREAK_SCOPE", "plan", input.planId, "mealWindow", "Flexible meal window cannot map exactly to a fixed protected meal.", { scope: "flexible-window" });\n  }''',
    '''  if ((input.mealMode === "flexible_meal_window" || input.mealWindow || input.mealWindowStart || input.mealWindowEnd)\n    && flexibleParticipantMeals.obligations.length === 0 && operationalMealPolicies.length === 0) {\n    addIssue("UNSUPPORTED_BREAK_SCOPE", "plan", input.planId, "mealWindow", "Flexible meal window has no exact participant or operational meal obligation.", { scope: "flexible-window" });\n  }''',
)
replace_once(
    "engine/planner-next/integration/engineInputPreflight.ts",
    '''    + mapKeys(input.spaceMealBreakMinutesByZoneId).length + taskBreakCount;''',
    '''    + mapKeys(input.spaceMealBreakMinutesByZoneId).length + operationalMealPolicies.length + taskBreakCount;''',
)

# Adapter: carry the normalized policy losslessly and include its resources/spaces in canonical identity channels.
replace_once(
    "engine/planner-next/integration/engineInputAdapter.ts",
    '''import { resolveAssignedItinerantUnitMealBreaks } from "./assignedItinerantUnitMealBreaks";''',
    '''import { resolveAssignedItinerantUnitMealBreaks } from "./assignedItinerantUnitMealBreaks";\nimport { resolveFlexibleOperationalMealPolicies } from "./flexibleOperationalMealPolicies";''',
)
replace_once(
    "engine/planner-next/integration/engineInputAdapter.ts",
    '''    ...(problem.resourceMeals ? { resourceMeals: sorted(problem.resourceMeals, (entry) => `${entry.id}\\0${entry.sourceTaskId}`).map(entry=>({...entry,resourceIds:[...entry.resourceIds].sort(compare)})) } : {}),\n    ...(problem.itinerantUnitMeals ? { itinerantUnitMeals: sorted(problem.itinerantUnitMeals, entry=>entry.id) } : {}),''',
    '''    ...(problem.resourceMeals ? { resourceMeals: sorted(problem.resourceMeals, (entry) => `${entry.id}\\0${entry.sourceTaskId}`).map(entry=>({...entry,resourceIds:[...entry.resourceIds].sort(compare)})) } : {}),\n    ...(problem.operationalMealPolicies ? { operationalMealPolicies: sorted(problem.operationalMealPolicies, (entry) => entry.id).map((entry) => ({ ...entry, resourceIds: [...entry.resourceIds].sort(compare), spaceIds: [...entry.spaceIds].sort(compare) })) } : {}),\n    ...(problem.itinerantUnitMeals ? { itinerantUnitMeals: sorted(problem.itinerantUnitMeals, entry=>entry.id) } : {}),''',
)
replace_once(
    "engine/planner-next/integration/engineInputAdapter.ts",
    '''  const resourceMealResolution = resolveAssignedResourceMealBreaks(input);\n  const itinerantUnitMeals = resolveAssignedItinerantUnitMealBreaks(input);''',
    '''  const resourceMealResolution = resolveAssignedResourceMealBreaks(input);\n  const operationalMealPolicies = resolveFlexibleOperationalMealPolicies(input);\n  const itinerantUnitMeals = resolveAssignedItinerantUnitMealBreaks(input);''',
)
replace_once(
    "engine/planner-next/integration/engineInputAdapter.ts",
    '''  const mealResourceIds=new Set(resourceMealResolution.meals.flatMap(meal=>[...meal.resourceIds]));''',
    '''  const mealResourceIds=new Set([\n    ...resourceMealResolution.meals.flatMap(meal=>[...meal.resourceIds]),\n    ...operationalMealPolicies.flatMap((meal) => [...meal.resourceIds]),\n  ]);''',
)
replace_once(
    "engine/planner-next/integration/engineInputAdapter.ts",
    '''    sourceRoundSynchronizations.flatMap((policy) => policy.lanes.map((lane) => lane.spaceId)),\n  ));''',
    '''    sourceRoundSynchronizations.flatMap((policy) => policy.lanes.map((lane) => lane.spaceId)),\n    operationalMealPolicies.flatMap((policy) => [...policy.spaceIds]),\n  ));''',
)
replace_once(
    "engine/planner-next/integration/engineInputAdapter.ts",
    '''    ...(resourceMealResolution.meals.length ? { resourceMeals: resourceMealResolution.meals.map(meal=>({id:canonical("break",meal.breakId),sourceTaskId:canonical("task",meal.sourceTaskId),resourceIds:meal.resourceIds.map(id=>canonical("plan-resource",id)),interval:{...meal.minuteInterval},status:meal.taskStatus as "pending"|"interrupted"|"done"|"in_progress"})) } : {}),\n    ...(itinerantUnitMeals.length ? { itinerantUnitMeals:''',
    '''    ...(resourceMealResolution.meals.length ? { resourceMeals: resourceMealResolution.meals.map(meal=>({id:canonical("break",meal.breakId),sourceTaskId:canonical("task",meal.sourceTaskId),resourceIds:meal.resourceIds.map(id=>canonical("plan-resource",id)),interval:{...meal.minuteInterval},status:meal.taskStatus as "pending"|"interrupted"|"done"|"in_progress"})) } : {}),\n    ...(operationalMealPolicies.length ? { operationalMealPolicies: operationalMealPolicies.map((meal) => ({ id: canonical("break", meal.id), window: { ...meal.window }, duration: meal.duration, resourceIds: meal.resourceIds.map((id) => canonical("plan-resource", id)), spaceIds: meal.spaceIds.map((id) => canonical("space", id)) })) } : {}),\n    ...(itinerantUnitMeals.length ? { itinerantUnitMeals:''',
)

# Canonical Planner Next preflight validates structure while search remains unsupported.
replace_once(
    "engine/planner-next/validate.ts",
    '''  for(let i=0;i<resourceMeals.length;i++)for(let j=i+1;j<resourceMeals.length;j++){const a=resourceMeals[i]!,b=resourceMeals[j]!;if(a.interval.start<b.interval.end&&b.interval.start<a.interval.end&&a.resourceIds.some(id=>b.resourceIds.includes(id)))reasons.add("UNREPRESENTABLE_RESOURCE_BREAK");}\n  const itinerantMeals=''',
    '''  for(let i=0;i<resourceMeals.length;i++)for(let j=i+1;j<resourceMeals.length;j++){const a=resourceMeals[i]!,b=resourceMeals[j]!;if(a.interval.start<b.interval.end&&b.interval.start<a.interval.end&&a.resourceIds.some(id=>b.resourceIds.includes(id)))reasons.add("UNREPRESENTABLE_RESOURCE_BREAK");}\n  const operationalMealPolicies=Array.isArray(problem.operationalMealPolicies)?problem.operationalMealPolicies:[];\n  if(hasDuplicateIds(operationalMealPolicies))reasons.add("INVALID_OPERATIONAL_MEAL_POLICY");\n  const operationalMealResourceOwner=new Set<string>();\n  for(const meal of operationalMealPolicies){\n    if(typeof meal.id!=="string"||!meal.id||!Array.isArray(meal.resourceIds)||meal.resourceIds.length===0||new Set(meal.resourceIds).size!==meal.resourceIds.length||meal.resourceIds.some(id=>!resourceIds.has(id)&&!coachIds.has(id))||!Array.isArray(meal.spaceIds)||new Set(meal.spaceIds).size!==meal.spaceIds.length||meal.spaceIds.some(id=>!spaceIds.has(id))||invalidWindow(meal.window,day)||meal.window.start%PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES!==0||meal.window.end%PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES!==0||!Number.isInteger(meal.duration)||meal.duration<=0||meal.duration%PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES!==0||meal.duration>meal.window.end-meal.window.start)reasons.add("INVALID_OPERATIONAL_MEAL_POLICY");\n    for(const id of meal.resourceIds){if(operationalMealResourceOwner.has(id))reasons.add("INVALID_OPERATIONAL_MEAL_POLICY");operationalMealResourceOwner.add(id);}\n  }\n  const itinerantMeals=''',
)

# Full A2 probe: one scoped space policy plus one Reality resource policy; no unit-alias meal duplication.
p = Path("engine/planner-next/benchmarks/focal-a2/full-day/representability.ts")
text = p.read_text()
pattern = re.compile(r'function runScopedMealPolicyProbe\(expansion: ExpandedCanonicalFullA2Template\): RepresentabilityAnalysis\["scopedMealPolicyProbe"\] \{.*?\n\}\n\nfunction runAdapterTransitionProbe', re.S)
replacement = '''function runScopedMealPolicyProbe(expansion: ExpandedCanonicalFullA2Template): RepresentabilityAnalysis["scopedMealPolicyProbe"] {\n  const config = expansion.effectiveConfiguration.meals;\n  const adapterInput = createSupportedEngineInputAdapterFixture();\n  adapterInput.mealMode = "flexible_meal_window";\n  adapterInput.mealWindow = { ...config.effectiveWindow };\n  adapterInput.operationalMealPolicies = [\n    { id: "operational-space-meal", window: { ...config.effectiveWindow }, durationMinutes: config.operational.defaultDurationMinutes, planResourceItemIds: [504], spaceIds: [301] },\n    { id: "operational-reality-meal", window: { ...config.effectiveWindow }, durationMinutes: config.operational.realityDurationMinutes, planResourceItemIds: [502, 503], spaceIds: [] },\n  ];\n  const adapterSnapshot = structuredClone(adapterInput);\n  const enginePreflight = preflightEngineInputForPlannerNext(adapterInput);\n  const adapted = adaptEngineInputToPlannerNextProblem(adapterInput);\n  const projectedPolicies = adapted.status === "SUPPORTED" ? adapted.problem.operationalMealPolicies ?? [] : [];\n  const projectedSpaceMeal = projectedPolicies.find(({ id }) => id === "break:operational-space-meal");\n  const projectedRealityMeal = projectedPolicies.find(({ id }) => id === "break:operational-reality-meal");\n\n  const problem = spaceMealScenario();\n  const mealSpace = problem.spaces.find(({ id }) => id === "meal-room")!;\n  problem.spaces.push({ id: "cross-meal-room", availability: [{ start: 600, end: 660 }] });\n  problem.resources.push({ id: "assigned-meal-resource", availability: [{ start: 600, end: 660 }], presencePreference: "OFF", transitionMinutes: 0, assignedSpaceId: "meal-room" });\n  const meal = createScheduledSpaceMeal("meal-room", 620, 20);\n  const ownTask = { ...problem.tasks.find(({ spaceId }) => spaceId === "meal-room")!, duration: 20 };\n  const crossSpaceTask = { id: "cross-space-resource-work", kind: "technical" as const, duration: 20, spaceId: "cross-meal-room", dependencies: [] as string[], requiredResourceIds: ["assigned-meal-resource"], start: 620, end: 640 };\n  const ownSpaceControlPlaceableWithoutMeal = canPlaceTask(problem, ownTask, 620, [], []);\n  const ownSpacePlaceableWithMeal = canPlaceTask(problem, ownTask, 620, [], [meal]);\n  const crossSpaceControlPlaceableWithoutMeal = canPlaceTask(problem, crossSpaceTask, 620, [], []);\n  const crossSpacePlaceableWithMeal = canPlaceTask(problem, crossSpaceTask, 620, [], [meal]);\n  const validationSpaces = problem.spaces.filter(({ id }) => [problem.mainFlow.spaceId, "meal-room", "cross-meal-room"].includes(id));\n  const validationBase = { ...problem, participants: [], coaches: [], resources: problem.resources.filter(({ id }) => id === "assigned-meal-resource"), tasks: [crossSpaceTask], spaces: validationSpaces };\n  const validationControlProblem = { ...validationBase, spaces: validationSpaces.map((space) => space.id === "meal-room" ? { id: space.id, availability: space.availability } : space) };\n  const validationControl = validatePlan(validationControlProblem, [crossSpaceTask], [], []);\n  const validationWithMeal = validatePlan(validationBase, [crossSpaceTask], [], [meal]);\n\n  const fixedMealInput = createSupportedEngineInputAdapterFixture();\n  fixedMealInput.protectedBreaks = [{ id: "reality-fixed-meal", kind: "meal", itinerantTeamId: 71, start: "13:00", end: "14:15" }];\n  const fixedMeals = resolveAssignedItinerantUnitMealBreaks(fixedMealInput);\n  const fixedMeal = fixedMeals[0];\n  const fixedRealityMealSupported = fixedMeals.length === 1 && fixedMeal?.status === "SUPPORTED";\n  const fixedRealityMealHasInterval = fixedMeal?.interval.start === 780 && fixedMeal.interval.end === 855;\n  const fixedRealityMealHasFlexibleWindowContract = fixedMeal !== undefined && ("window" in fixedMeal || "duration" in fixedMeal);\n\n  const adapterProjectsFlexibleSpaceMeal = projectedSpaceMeal?.duration === 75\n    && projectedSpaceMeal.window.start === 780 && projectedSpaceMeal.window.end === 990\n    && projectedSpaceMeal.spaceIds.join() === "space:301" && projectedSpaceMeal.resourceIds.join() === "plan-resource:504";\n  const flexibleRealityResourceMealRepresentable = projectedRealityMeal?.duration === 75\n    && projectedRealityMeal.window.start === 780 && projectedRealityMeal.window.end === 990\n    && projectedRealityMeal.spaceIds.length === 0\n    && projectedRealityMeal.resourceIds.join() === "plan-resource:502,plan-resource:503";\n  const recompositionAliasMealCount = projectedPolicies.filter(({ id }) => id === "break:operational-reality-meal").length;\n  const recompositionDoesNotDuplicateMeal = expansion.itinerantUnits.length > 1 && recompositionAliasMealCount === 1;\n\n  return {\n    effectiveWindowPresent: config.effectiveWindow.start === "13:00" && config.effectiveWindow.end === "16:30",\n    durationPresent: config.operational.defaultDurationMinutes === 75 && config.operational.realityDurationMinutes === 75,\n    spaceMealPolicySourceRepresentable: "mealPolicy" in mealSpace && mealSpace.mealPolicy?.duration === 20,\n    engineInputPreflightSupported: enginePreflight.status === "SUPPORTED",\n    adapterProjectsFlexibleSpaceMeal,\n    assignedMealResourceHasOwnSpace: problem.resources.find(({ id }) => id === "assigned-meal-resource")?.assignedSpaceId === "meal-room",\n    ownSpaceControlPlaceableWithoutMeal, ownSpacePlaceableWithMeal, crossSpaceControlPlaceableWithoutMeal, crossSpacePlaceableWithMeal,\n    validationControlHardValid: validationControl.hardValid, validationWithMealHardValid: validationWithMeal.hardValid,\n    spaceMealBlocksOwnSpace: ownSpaceControlPlaceableWithoutMeal && !ownSpacePlaceableWithMeal,\n    spaceMealBlocksAssignedResourcesAcrossOtherSpaces: crossSpaceControlPlaceableWithoutMeal && !crossSpacePlaceableWithMeal,\n    validatorRejectsAssignedResourceWorkDuringMeal: validationControl.hardValid && !validationWithMeal.hardValid,\n    fixedRealityMealSupported, fixedRealityMealHasInterval, fixedRealityMealHasFlexibleWindowContract, recompositionAliasMealCount,\n    flexibleRealityResourceMealRepresentable, recompositionDoesNotDuplicateMeal,\n    participantSodexoIndependent: expansion.tasks.filter(({ type }) => type === "SODEXO" && expansion.effectiveConfiguration.meals.participant.independentFromOperationalMeal).length === expansion.participants.length,\n    deterministic: enginePreflight.sourceFingerprint === preflightEngineInputForPlannerNext(adapterInput).sourceFingerprint,\n    inputImmutable: JSON.stringify(adapterInput) === JSON.stringify(adapterSnapshot),\n  };\n}\n\nfunction runAdapterTransitionProbe'''
text2, n = pattern.subn(replacement, text, count=1)
if n != 1:
    raise SystemExit(f"representability scoped meal function replacement count={n}")
p.write_text(text2)

# Current representability regression now expects only Planner Next search/exclusivity to remain.
replace_once(
    "engine/planner-next/flexibleSetupOrder.spec.ts",
    '''test("full A2 retains only scoped meal blockers after transport support", () => {\n  const analysis = analyzeCanonicalFullA2Representability(expandCanonicalFullA2Template(createCanonicalFullA2Template()));\n  assert.equal(analysis.implementationBlockers.some((item) => item.code === "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED"), false);\n  assert.deepEqual(analysis.implementationBlockers.map((item) => item.code), [\n    "ENGINE_INPUT_FLEXIBLE_SCOPED_MEAL_POLICY_UNSUPPORTED",\n    "PLANNER_NEXT_SCOPED_MEAL_RESOURCE_EXCLUSIVITY_UNSUPPORTED",\n  ]);\n  assert.equal(analysis.nextImplementationBlocker?.code, "ENGINE_INPUT_FLEXIBLE_SCOPED_MEAL_POLICY_UNSUPPORTED");\n  assert.equal(analysis.nextImplementationBlocker?.layer, "ENGINE_INPUT");\n});''',
    '''test("full A2 retains only Planner Next meal exclusivity after flexible scoped meal projection", () => {\n  const analysis = analyzeCanonicalFullA2Representability(expandCanonicalFullA2Template(createCanonicalFullA2Template()));\n  assert.equal(analysis.implementationBlockers.some((item) => item.code === "ENGINE_INPUT_FLEXIBLE_SCOPED_MEAL_POLICY_UNSUPPORTED"), false);\n  assert.deepEqual(analysis.implementationBlockers.map((item) => item.code), [\n    "PLANNER_NEXT_SCOPED_MEAL_RESOURCE_EXCLUSIVITY_UNSUPPORTED",\n  ]);\n  assert.equal(analysis.nextImplementationBlocker?.code, "PLANNER_NEXT_SCOPED_MEAL_RESOURCE_EXCLUSIVITY_UNSUPPORTED");\n  assert.equal(analysis.nextImplementationBlocker?.layer, "PLANNER_NEXT");\n});''',
)

# Focused contract test.
Path("engine/planner-next/flexibleOperationalMealPolicy.spec.ts").write_text('''import assert from "node:assert/strict";\nimport test from "node:test";\nimport { executePlannerNext } from "./executePlannerNext";\nimport { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";\nimport { createSupportedEngineInputAdapterFixture } from "./integration/engineInputAdapter.fixture";\nimport { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";\nimport { resolveFlexibleOperationalMealPolicies } from "./integration/flexibleOperationalMealPolicies";\n\nfunction fixture() {\n  const input = createSupportedEngineInputAdapterFixture();\n  input.mealMode = "flexible_meal_window";\n  input.mealWindow = { start: "13:00", end: "16:30" };\n  input.operationalMealPolicies = [\n    { id: "space-meal", window: { start: "13:00", end: "16:30" }, durationMinutes: 75, planResourceItemIds: [504], spaceIds: [301] },\n    { id: "reality-meal", window: { start: "13:00", end: "16:30" }, durationMinutes: 75, planResourceItemIds: [503, 502], spaceIds: [] },\n  ];\n  return input;\n}\n\ntest("flexible operational meals project losslessly, deterministically, and remain fail-closed before search support", () => {\n  const input = fixture(), snapshot = structuredClone(input);\n  const resolved = resolveFlexibleOperationalMealPolicies(input);\n  assert.deepEqual(resolved.map((meal) => ({ id: meal.id, status: meal.status, resources: meal.resourceIds, spaces: meal.spaceIds, window: meal.window, duration: meal.duration })), [\n    { id: "reality-meal", status: "SUPPORTED", resources: [502, 503], spaces: [], window: { start: 780, end: 990 }, duration: 75 },\n    { id: "space-meal", status: "SUPPORTED", resources: [504], spaces: [301], window: { start: 780, end: 990 }, duration: 75 },\n  ]);\n  const preflight = preflightEngineInputForPlannerNext(input);\n  assert.equal(preflight.status, "SUPPORTED", JSON.stringify(preflight.issues));\n  const adapted = adaptEngineInputToPlannerNextProblem(input);\n  assert.equal(adapted.status, "SUPPORTED", JSON.stringify(adapted.issues));\n  assert.deepEqual(adapted.problem!.operationalMealPolicies, [\n    { id: "break:reality-meal", window: { start: 780, end: 990 }, duration: 75, resourceIds: ["plan-resource:502", "plan-resource:503"], spaceIds: [] },\n    { id: "break:space-meal", window: { start: 780, end: 990 }, duration: 75, resourceIds: ["plan-resource:504"], spaceIds: ["space:301"] },\n  ]);\n  const execution = executePlannerNext(adapted.problem!);\n  assert.equal(execution.kind, "POLICY_REJECTED");\n  assert.ok(execution.policyResolution.unsupportedCapabilities.includes("OPERATIONAL_MEAL_POLICY"));\n\n  const reversed = fixture();\n  reversed.operationalMealPolicies!.reverse();\n  reversed.operationalMealPolicies!.forEach((policy) => { policy.planResourceItemIds.reverse(); policy.spaceIds?.reverse(); });\n  reversed.planResourceItems.reverse();\n  const adaptedReversed = adaptEngineInputToPlannerNextProblem(reversed);\n  assert.equal(adaptedReversed.status, "SUPPORTED");\n  assert.equal(adapted.problemFingerprint, adaptedReversed.problemFingerprint);\n  assert.deepEqual(input, snapshot);\n});\n\ntest("shared resources cannot receive duplicate operational meals", () => {\n  const input = fixture();\n  input.operationalMealPolicies!.push({ id: "duplicate-resource-meal", window: { start: "13:00", end: "16:30" }, durationMinutes: 75, planResourceItemIds: [503], spaceIds: [] });\n  const preflight = preflightEngineInputForPlannerNext(input);\n  assert.equal(preflight.status, "UNSUPPORTED");\n  assert.ok(preflight.reasonCodes.includes("UNSUPPORTED_OPERATIONAL_MEAL_POLICY"));\n});\n''')
