from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f"{path}: expected one match, found {text.count(old)} for {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


def insert_after(path: str, needle: str, addition: str) -> None:
    replace_once(path, needle, needle + addition)


# contracts.ts
insert_after(
    "engine/planner-next/contracts.ts",
    '''export interface OperationalMealPolicy {\n  id: string;\n  window: Window;\n  duration: Minute;\n  resourceIds: string[];\n  spaceIds: string[];\n}\n''',
    '''\nexport interface ScheduledOperationalMeal {\n  id: string;\n  resourceIds: string[];\n  spaceIds: string[];\n  duration: Minute;\n  start: Minute;\n  end: Minute;\n}\n''',
)
replace_once(
    "engine/planner-next/contracts.ts",
    '''  resourceMealViolationCount: number;\n  itinerantUnitMealViolationCount: number;''',
    '''  resourceMealViolationCount: number;\n  operationalMealViolationCount?: number;\n  itinerantUnitMealViolationCount: number;''',
)
replace_once(
    "engine/planner-next/contracts.ts",
    '''  scheduledResourceMeals: ScheduledResourceMeal[];\n  scheduledItinerantUnitMeals: ScheduledItinerantUnitMeal[];\n  metrics: PlanMetrics;''',
    '''  scheduledResourceMeals: ScheduledResourceMeal[];\n  scheduledOperationalMeals?: ScheduledOperationalMeal[];\n  scheduledItinerantUnitMeals: ScheduledItinerantUnitMeal[];\n  metrics: PlanMetrics;''',
)

# searchPolicy.ts: the capability becomes real only for exact constructive search.
replace_once(
    "engine/planner-next/searchPolicy.ts",
    '''  OPERATIONAL_MEAL_POLICY: defineCapabilityRequirement({\n    capability: "OPERATIONAL_MEAL_POLICY",\n    supportedPolicies: [],\n  }),''',
    '''  OPERATIONAL_MEAL_POLICY: defineCapabilityRequirement({\n    capability: "OPERATIONAL_MEAL_POLICY",\n    supportedPolicies: ["EXACT_CONSTRUCTIVE"],\n    requiredPolicy: "EXACT_CONSTRUCTIVE",\n  }),''',
)

# placement.ts: a scheduled space meal also blocks resources physically assigned to that space.
insert_after(
    "engine/planner-next/placement.ts",
    '''export function taskAvoidsItinerantUnitMeals(problem:PlannerNextProblem,task:Task,start:number,end:number):boolean {\n  return !task.itinerantUnitId||(problem.itinerantUnitMeals??[]).every(meal=>meal.itinerantUnitId!==task.itinerantUnitId||!overlaps(meal.interval,{start,end}));\n}\n''',
    '''\nexport function taskAvoidsScheduledSpaceMealResources(problem: PlannerNextProblem, task: Task, start: number, end: number, meals: ScheduledSpaceMeal[]): boolean {\n  const required = new Set(task.requiredResourceIds ?? []);\n  if (required.size === 0) return true;\n  return meals.every((meal) => {\n    if (!overlaps(meal, { start, end })) return true;\n    return !problem.resources.some((resource) => resource.assignedSpaceId === meal.spaceId && required.has(resource.id));\n  });\n}\n''',
)
replace_once(
    "engine/planner-next/placement.ts",
    '''  if(scheduledSpaceMeals.some(meal=>meal.spaceId===task.spaceId&&overlaps(meal,{start,end})))return false;''',
    '''  if(scheduledSpaceMeals.some(meal=>meal.spaceId===task.spaceId&&overlaps(meal,{start,end}))\n    || !taskAvoidsScheduledSpaceMealResources(problem, task, start, end, scheduledSpaceMeals)) return false;''',
)

# spaceMeals.ts: the reverse direction must also hold when placing the meal after cross-space work.
insert_after(
    "engine/planner-next/spaceMeals.ts",
    '''export const spaceMealAvoidsTasks=(m:ScheduledSpaceMeal,tasks:ScheduledTask[])=>!tasks.some(t=>t.spaceId===m.spaceId&&overlaps(t,m));\n''',
    '''export const assignedResourceIdsForSpace=(problem:PlannerNextProblem,spaceId:string):string[]=>problem.resources.filter(resource=>resource.assignedSpaceId===spaceId).map(({id})=>id).sort();\nexport const spaceMealAvoidsAssignedResourceTasks=(problem:PlannerNextProblem,m:ScheduledSpaceMeal,tasks:ScheduledTask[]):boolean=>{const ids=new Set(assignedResourceIdsForSpace(problem,m.spaceId));return ids.size===0||!tasks.some(task=>(task.requiredResourceIds??[]).some(id=>ids.has(id))&&overlaps(task,m));};\n''',
)
replace_once(
    "engine/planner-next/spaceMeals.ts",
    '''return spaceMealWithinDay(problem,m)&&spaceMealWithinWindow(p,m)&&spaceMealWithinAvailability(s,m)&&spaceMealAvoidsTasks(m,tasks)&&spaceMealAvoidsMeals(m,meals)}''',
    '''return spaceMealWithinDay(problem,m)&&spaceMealWithinWindow(p,m)&&spaceMealWithinAvailability(s,m)&&spaceMealAvoidsTasks(m,tasks)&&spaceMealAvoidsAssignedResourceTasks(problem,m,tasks)&&spaceMealAvoidsMeals(m,meals)}''',
)

# fingerprint.ts: operational meal timing is part of the accepted exact plan identity.
replace_once(
    "engine/planner-next/fingerprint.ts",
    '''import type { ScheduledItinerantUnitMeal, ScheduledRoundPreparation, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask } from "./contracts";''',
    '''import type { ScheduledItinerantUnitMeal, ScheduledOperationalMeal, ScheduledRoundPreparation, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask } from "./contracts";''',
)
replace_once(
    "engine/planner-next/fingerprint.ts",
    '''export function fingerprint(tasks: ScheduledTask[], preparations: ScheduledSetupPreparation[] = [], meals:ScheduledSpaceMeal[]=[], itinerantMeals:ScheduledItinerantUnitMeal[]=[], roundPreparations:ScheduledRoundPreparation[]=[]): string {''',
    '''export function fingerprint(tasks: ScheduledTask[], preparations: ScheduledSetupPreparation[] = [], meals:ScheduledSpaceMeal[]=[], itinerantMeals:ScheduledItinerantUnitMeal[]=[], roundPreparations:ScheduledRoundPreparation[]=[], operationalMeals:ScheduledOperationalMeal[]=[]): string {''',
)
replace_once(
    "engine/planner-next/fingerprint.ts",
    '''  const roundPreparationRecords=[...roundPreparations].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,kind,synchronizationId,spaceId,roundIndex,duration,start,end})=>({id,kind,synchronizationId,spaceId,roundIndex,duration,start,end}));\n  return createHash("sha256").update(JSON.stringify(preparationRecords.length||mealRecords.length||itinerantMealRecords.length||roundPreparationRecords.length ? [...stable,...preparationRecords,...mealRecords,...itinerantMealRecords,...roundPreparationRecords] : stable)).digest("hex");''',
    '''  const roundPreparationRecords=[...roundPreparations].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,kind,synchronizationId,spaceId,roundIndex,duration,start,end})=>({id,kind,synchronizationId,spaceId,roundIndex,duration,start,end}));\n  const operationalMealRecords=[...operationalMeals].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,resourceIds,spaceIds,duration,start,end})=>({id,resourceIds:[...resourceIds].sort(),spaceIds:[...spaceIds].sort(),duration,start,end}));\n  return createHash("sha256").update(JSON.stringify(preparationRecords.length||mealRecords.length||itinerantMealRecords.length||roundPreparationRecords.length||operationalMealRecords.length ? [...stable,...preparationRecords,...mealRecords,...itinerantMealRecords,...roundPreparationRecords,...operationalMealRecords] : stable)).digest("hex");''',
)

# validate.ts: validate both assigned-resource space meals and the new explicit flexible operational witness.
replace_once(
    "engine/planner-next/validate.ts",
    '''  ScheduledParticipantMeal,\n  ScheduledResourceMeal,\n  ScheduledTask,''',
    '''  ScheduledParticipantMeal,\n  ScheduledResourceMeal,\n  ScheduledOperationalMeal,\n  ScheduledTask,''',
)
replace_once(
    "engine/planner-next/validate.ts",
    '''import { createScheduledSpaceMeal, spaceMealAvoidsMeals, spaceMealAvoidsTasks, spaceMealId, spaceMealWithinAvailability, spaceMealWithinDay, spaceMealWithinWindow, spacesWithMealPolicy } from "./spaceMeals";''',
    '''import { createScheduledSpaceMeal, spaceMealAvoidsAssignedResourceTasks, spaceMealAvoidsMeals, spaceMealAvoidsTasks, spaceMealId, spaceMealWithinAvailability, spaceMealWithinDay, spaceMealWithinWindow, spacesWithMealPolicy } from "./spaceMeals";\nimport { operationalMealCandidates } from "./operationalMeals";''',
)
replace_once(
    "engine/planner-next/validate.ts",
    '''export function validatePlan(problem: PlannerNextProblem, scheduled: ScheduledTask[], preparations: ScheduledSetupPreparation[] = [], meals:ScheduledSpaceMeal[]=[], participantMeals: ScheduledParticipantMeal[] = [], resourceMeals: ScheduledResourceMeal[] = [], itinerantUnitMeals: import("./contracts").ScheduledItinerantUnitMeal[] = [], roundPreparations: ScheduledRoundPreparation[] = []): ValidationSummary {''',
    '''export function validatePlan(problem: PlannerNextProblem, scheduled: ScheduledTask[], preparations: ScheduledSetupPreparation[] = [], meals:ScheduledSpaceMeal[]=[], participantMeals: ScheduledParticipantMeal[] = [], resourceMeals: ScheduledResourceMeal[] = [], itinerantUnitMeals: import("./contracts").ScheduledItinerantUnitMeal[] = [], roundPreparations: ScheduledRoundPreparation[] = [], operationalMeals: ScheduledOperationalMeal[] = []): ValidationSummary {''',
)
replace_once(
    "engine/planner-next/validate.ts",
    '''  let resourceMeal = 0;\n  let itinerantUnitMeal = 0;''',
    '''  let resourceMeal = 0;\n  let operationalMeal = 0;\n  let itinerantUnitMeal = 0;''',
)
replace_once(
    "engine/planner-next/validate.ts",
    '''!spaceMealWithinAvailability(space,m)||!spaceMealAvoidsTasks(m,scheduled)||!spaceMealAvoidsMeals(m,meals.filter(x=>x!==m)))''',
    '''!spaceMealWithinAvailability(space,m)||!spaceMealAvoidsTasks(m,scheduled)||!spaceMealAvoidsAssignedResourceTasks(problem,m,scheduled)||!spaceMealAvoidsMeals(m,meals.filter(x=>x!==m)))''',
)
insert_after(
    "engine/planner-next/validate.ts",
    '''  const invalidMealSpaces=new Set<string>();const policyIds=new Set(spacesWithMealPolicy(problem).map(s=>s.id));for(const space of spacesWithMealPolicy(problem)){const policy=space.mealPolicy!,own=meals.filter(m=>m.spaceId===space.id),m=own[0];if(own.length!==1||!m||m.entryIndex!==1||m.id!==spaceMealId(space.id)||m.kind!=="space-meal"||m.spaceId!==space.id||m.duration!==policy.duration||m.end-m.start!==m.duration||m.start%5!==0||!spaceMealWithinDay(problem,m)||!spaceMealWithinWindow(policy,m)||!spaceMealWithinAvailability(space,m)||!spaceMealAvoidsTasks(m,scheduled)||!spaceMealAvoidsAssignedResourceTasks(problem,m,scheduled)||!spaceMealAvoidsMeals(m,meals.filter(x=>x!==m)))invalidMealSpaces.add(space.id)}for(const m of meals)if(!policyIds.has(m.spaceId))invalidMealSpaces.add(m.spaceId);spaceMeal=[...invalidMealSpaces].sort().length;\n''',
    '''\n  const expectedOperationalMeals=new Map((problem.operationalMealPolicies??[]).map(policy=>[policy.id,policy]));\n  const operationalCounts=new Map<string,number>();\n  const invalidOperationalMealIds=new Set<string>();\n  for(const meal of operationalMeals){\n    operationalCounts.set(meal.id,(operationalCounts.get(meal.id)??0)+1);\n    const expected=expectedOperationalMeals.get(meal.id);\n    const canonicalResources=expected?[...expected.resourceIds].sort():[];\n    const canonicalSpaces=expected?[...expected.spaceIds].sort():[];\n    const exactFields=expected!==undefined&&meal.duration===expected.duration&&meal.end-meal.start===meal.duration&&[...meal.resourceIds].sort().join("\\0")===canonicalResources.join("\\0")&&[...meal.spaceIds].sort().join("\\0")===canonicalSpaces.join("\\0");\n    const validCandidate=expected!==undefined&&operationalMealCandidates(problem,expected,scheduled,operationalMeals.filter(candidate=>candidate!==meal)).some(candidate=>candidate.start===meal.start&&candidate.end===meal.end);\n    if(!exactFields||!validCandidate)invalidOperationalMealIds.add(meal.id);\n  }\n  for(const policy of problem.operationalMealPolicies??[])if(operationalCounts.get(policy.id)!==1)invalidOperationalMealIds.add(policy.id);\n  for(const meal of operationalMeals)if(!expectedOperationalMeals.has(meal.id))invalidOperationalMealIds.add(meal.id);\n  operationalMeal=invalidOperationalMealIds.size;\n''',
)
replace_once(
    "engine/planner-next/validate.ts",
    '''  if (resourceMeal) reasonCodes.push("RESOURCE_MEAL_VIOLATION");\n  if (itinerantUnitMeal) reasonCodes.push("ITINERANT_UNIT_MEAL_VIOLATION");''',
    '''  if (resourceMeal) reasonCodes.push("RESOURCE_MEAL_VIOLATION");\n  if (operationalMeal) reasonCodes.push("OPERATIONAL_MEAL_VIOLATION");\n  if (itinerantUnitMeal) reasonCodes.push("ITINERANT_UNIT_MEAL_VIOLATION");''',
)
replace_once(
    "engine/planner-next/validate.ts",
    '''    resourceMealViolationCount: resourceMeal,\n    itinerantUnitMealViolationCount: itinerantUnitMeal,''',
    '''    resourceMealViolationCount: resourceMeal,\n    ...(problem.operationalMealPolicies?.length || operationalMeals.length ? { operationalMealViolationCount: operationalMeal } : {}),\n    itinerantUnitMealViolationCount: itinerantUnitMeal,''',
)

# exactItinerantPlan.ts: operational meal is an exact leaf witness sharing the same branch ledger.
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''import type { PlannerNextProblem, ScheduledItinerantUnitMeal, ScheduledParticipantMeal, ScheduledResourceMeal, ScheduledRoundPreparation, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";''',
    '''import type { PlannerNextProblem, ScheduledItinerantUnitMeal, ScheduledOperationalMeal, ScheduledParticipantMeal, ScheduledResourceMeal, ScheduledRoundPreparation, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";''',
)
insert_after(
    "engine/planner-next/exactItinerantPlan.ts",
    '''import { assessParticipantMealFutureFeasibility, participantMealWitnessFingerprint, type ParticipantMealWitness } from "./participantMeals";\n''',
    '''import { assessOperationalMealFutureFeasibility, operationalMealWitnessFingerprint, type OperationalMealWitness } from "./operationalMeals";\n''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''  scheduledResourceMeals: ScheduledResourceMeal[];\n  scheduledItinerantUnitMeals: ScheduledItinerantUnitMeal[];''',
    '''  scheduledResourceMeals: ScheduledResourceMeal[];\n  scheduledOperationalMeals: ScheduledOperationalMeal[];\n  scheduledItinerantUnitMeals: ScheduledItinerantUnitMeal[];''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''interface StandaloneSearchResult { outcome: StandaloneOutcome; tasks: ScheduledTask[] | null; preparations: ScheduledSetupPreparation[]; roundPreparations: ScheduledRoundPreparation[]; selectionOrder: string[]; participantMeals: ParticipantMealWitness | null }''',
    '''interface StandaloneSearchResult { outcome: StandaloneOutcome; tasks: ScheduledTask[] | null; preparations: ScheduledSetupPreparation[]; roundPreparations: ScheduledRoundPreparation[]; selectionOrder: string[]; participantMeals: ParticipantMealWitness | null; operationalMeals: OperationalMealWitness | null }''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''  let found: ScheduledTask[] | null = null, foundOrder: string[] = [], foundParticipantMeals: ParticipantMealWitness | null = null;''',
    '''  let found: ScheduledTask[] | null = null, foundOrder: string[] = [], foundParticipantMeals: ParticipantMealWitness | null = null, foundOperationalMeals: OperationalMealWitness | null = null;''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''    const fixedResourceMeals=(problem.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));\n    const fixedItinerantMeals=materializeScheduledItinerantUnitMeals(problem);\n    if (exact && mealWitness?.complete && validatePlan(problem, candidate, preparations, coreMeals,[...mealWitness.scheduled],fixedResourceMeals,fixedItinerantMeals,roundPreparations).hardValid) {''',
    '''    const operationalMealBudget={remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)};\n    const operationalMealWitness=exact?assessOperationalMealFutureFeasibility(problem,candidate,operationalMealBudget,"MATERIALIZE"):null;\n    if(operationalMealWitness?.reasonCodes.includes("OPERATIONAL_MEAL_BRANCH_BUDGET_EXHAUSTED"))return "BUDGET_EXHAUSTED";\n    const fixedResourceMeals=(problem.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));\n    const fixedItinerantMeals=materializeScheduledItinerantUnitMeals(problem);\n    if (exact && mealWitness?.complete && operationalMealWitness?.complete && validatePlan(problem, candidate, preparations, coreMeals,[...mealWitness.scheduled],fixedResourceMeals,fixedItinerantMeals,roundPreparations,[...operationalMealWitness.scheduled]).hardValid) {''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''      const candidateFingerprint = fingerprint(candidate,preparations,coreMeals,fixedItinerantMeals,roundPreparations);''',
    '''      const candidateFingerprint = fingerprint(candidate,preparations,coreMeals,fixedItinerantMeals,roundPreparations,[...operationalMealWitness.scheduled]);''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''        found = candidate; foundPreparations = [...preparations]; foundRoundPreparations = [...roundPreparations]; foundOrder = selectionOrder; foundParticipantMeals=mealWitness; evidence.firstCompleteFingerprint = candidateFingerprint;''',
    '''        found = candidate; foundPreparations = [...preparations]; foundRoundPreparations = [...roundPreparations]; foundOrder = selectionOrder; foundParticipantMeals=mealWitness; foundOperationalMeals=operationalMealWitness; evidence.firstCompleteFingerprint = candidateFingerprint;''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''        found = candidate; foundPreparations = [...preparations]; foundRoundPreparations = [...roundPreparations]; foundOrder = selectionOrder; foundParticipantMeals=mealWitness; evidence.completeIncumbentReplacements += 1;''',
    '''        found = candidate; foundPreparations = [...preparations]; foundRoundPreparations = [...roundPreparations]; foundOrder = selectionOrder; foundParticipantMeals=mealWitness; foundOperationalMeals=operationalMealWitness; evidence.completeIncumbentReplacements += 1;''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''  return { outcome, tasks: found, preparations: foundPreparations, roundPreparations: foundRoundPreparations, selectionOrder: foundOrder, participantMeals: foundParticipantMeals };''',
    '''  return { outcome, tasks: found, preparations: foundPreparations, roundPreparations: foundRoundPreparations, selectionOrder: foundOrder, participantMeals: foundParticipantMeals, operationalMeals: foundOperationalMeals };''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''  let selectedTasks: ScheduledTask[] | null = null, selectedPreparations: ScheduledSetupPreparation[] = [], selectedRoundPreparations: ScheduledRoundPreparation[] = [], selectedMeals: ScheduledSpaceMeal[] = [], selectedParticipantMeals: ParticipantMealWitness | null = null, selectedCoreIds = new Set<string>();''',
    '''  let selectedTasks: ScheduledTask[] | null = null, selectedPreparations: ScheduledSetupPreparation[] = [], selectedRoundPreparations: ScheduledRoundPreparation[] = [], selectedMeals: ScheduledSpaceMeal[] = [], selectedParticipantMeals: ParticipantMealWitness | null = null, selectedOperationalMeals: OperationalMealWitness | null = null, selectedCoreIds = new Set<string>();''',
)
# Add empty operational meal publication to every exact failure literal.
text_path=Path("engine/planner-next/exactItinerantPlan.ts")
text=text_path.read_text()
text=text.replace('scheduledResourceMeals:[],scheduledItinerantUnitMeals:[],', 'scheduledResourceMeals:[],scheduledOperationalMeals:[],scheduledItinerantUnitMeals:[],')
text_path.write_text(text)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''      selectedTasks = standalone.tasks; selectedPreparations = [...standalone.preparations]; selectedRoundPreparations = [...standalone.roundPreparations]; selectedMeals = candidate.meals; selectedParticipantMeals=standalone.participantMeals; selectedCoreIds = coreIds;''',
    '''      selectedTasks = standalone.tasks; selectedPreparations = [...standalone.preparations]; selectedRoundPreparations = [...standalone.roundPreparations]; selectedMeals = candidate.meals; selectedParticipantMeals=standalone.participantMeals; selectedOperationalMeals=standalone.operationalMeals; selectedCoreIds = coreIds;''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''  const scheduledItinerantUnitMeals=materializeScheduledItinerantUnitMeals(problem);evidence.fullFingerprint=fingerprint(scheduledTasks,scheduledSetupPreparations,selectedMeals,scheduledItinerantUnitMeals,scheduledRoundPreparations); evidence.remainingTaskIds = []; evidence.reasonCodes = [];''',
    '''  const scheduledItinerantUnitMeals=materializeScheduledItinerantUnitMeals(problem);const scheduledOperationalMeals=[...(selectedOperationalMeals?.scheduled??[])];evidence.fullFingerprint=fingerprint(scheduledTasks,scheduledSetupPreparations,selectedMeals,scheduledItinerantUnitMeals,scheduledRoundPreparations,scheduledOperationalMeals); evidence.remainingTaskIds = []; evidence.reasonCodes = [];''',
)
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''scheduledResourceMeals,scheduledItinerantUnitMeals,remainingTaskIds: [], evidence };''',
    '''scheduledResourceMeals,scheduledOperationalMeals,scheduledItinerantUnitMeals,remainingTaskIds: [], evidence };''',
)
# The early round-shape dead-end must satisfy the extended result type.
replace_once(
    "engine/planner-next/exactItinerantPlan.ts",
    '''return { outcome: "DEAD_END", tasks: null, preparations: [], roundPreparations: [], selectionOrder: [], participantMeals: null };''',
    '''return { outcome: "DEAD_END", tasks: null, preparations: [], roundPreparations: [], selectionOrder: [], participantMeals: null, operationalMeals: null };''',
)

# flexibleOperationalMealPolicy.spec.ts: capability is no longer expected to fail closed.
replace_once(
    "engine/planner-next/flexibleOperationalMealPolicy.spec.ts",
    '''import { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";\nimport { resolveFlexibleOperationalMealPolicies } from "./integration/flexibleOperationalMealPolicies";''',
    '''import { preflightEngineInputForPlannerNext } from "./integration/engineInputPreflight";\nimport { resolveFlexibleOperationalMealPolicies } from "./integration/flexibleOperationalMealPolicies";\nimport { validatePlan } from "./validate";''',
)
replace_once(
    "engine/planner-next/flexibleOperationalMealPolicy.spec.ts",
    '''test("flexible operational meals project losslessly, deterministically, and remain fail-closed before search support", () => {''',
    '''test("flexible operational meals project losslessly and exact search publishes a hard-valid witness", () => {''',
)
replace_once(
    "engine/planner-next/flexibleOperationalMealPolicy.spec.ts",
    '''  const execution = executePlannerNext(adapted.problem!);\n  assert.equal(execution.kind, "POLICY_REJECTED");\n  assert.ok(execution.policyResolution.unsupportedCapabilities.includes("OPERATIONAL_MEAL_POLICY"));''',
    '''  adapted.problem!.searchPolicy = "EXACT_CONSTRUCTIVE";\n  adapted.problem!.budget.maxBranchExpansions = Math.max(adapted.problem!.budget.maxBranchExpansions, 300000);\n  const execution = executePlannerNext(adapted.problem!);\n  assert.equal(execution.kind, "EXACT_CONSTRUCTIVE");\n  assert.ok(execution.policyResolution.supportedCapabilities.includes("OPERATIONAL_MEAL_POLICY"));\n  assert.equal(execution.result?.complete, true);\n  const result = execution.result!;\n  assert.equal(result.scheduledOperationalMeals.length, 2);\n  assert.equal(validatePlan(adapted.problem!, result.scheduledTasks, result.scheduledSetupPreparations, result.scheduledSpaceMeals, result.scheduledParticipantMeals, result.scheduledResourceMeals, result.scheduledItinerantUnitMeals, result.scheduledRoundPreparations, result.scheduledOperationalMeals).hardValid, true);''',
)

print("scoped operational meal patch applied")
