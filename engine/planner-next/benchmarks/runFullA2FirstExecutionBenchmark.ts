import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EngineInput, TaskInput } from "../../types";
import { executePlannerNext } from "../executePlannerNext";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { createSupportedEngineInputAdapterFixture } from "../integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";
import {
  createCanonicalFullA2Template,
  expandCanonicalFullA2Template,
  validateExpandedCanonicalFullA2Template,
} from "./focal-a2/full-day/canonicalFullA2Template";
import { EXPECTED_COACH_BY_PARTICIPANT } from "./focal-a2/full-day/manifest";

const PLAN_ID = 27001;
const EVIDENCE_PATH = "docs/evidence/A2-FULL-EXEC-001-first-execution.json";

function writeStable(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const template = createCanonicalFullA2Template();
const expansion = expandCanonicalFullA2Template(template);
const validation = validateExpandedCanonicalFullA2Template(expansion);
const config = expansion.effectiveConfiguration;

const participantId = new Map(expansion.participants.map((id, index) => [id, 201 + index] as const));
const spaceId = new Map(expansion.spaces.map((space, index) => [space.id, 3001 + index] as const));
const resourceId = new Map(expansion.resources.map((resource, index) => [resource.id, 4001 + index] as const));
const itinerantUnitId = new Map(expansion.itinerantUnits.map((unit, index) => [unit.id, 5001 + index] as const));
const taskId = new Map(expansion.tasks.map((task, index) => [task.id, 10001 + index] as const));
const templateId = new Map([...new Set(expansion.tasks.map((task) => task.type))].sort().map((type, index) => [type, 20001 + index] as const));
const zoneId = new Map(expansion.spaces.map((space, index) => [space.id, 6001 + index] as const));

const tasks: TaskInput[] = expansion.tasks.map((task) => {
  const participant = task.participantId ? participantId.get(task.participantId)! : null;
  const isMeal = task.type === "SODEXO";
  const plannerNextKind = task.operationalKind === "technical" ? "technical"
    : task.operationalKind === "main" ? "main"
    : task.operationalKind === "vocal" ? "vocal"
    : "auxiliary";
  return {
    id: taskId.get(task.id)!,
    planId: PLAN_ID,
    templateId: templateId.get(task.type)!,
    templateName: task.type,
    status: "pending",
    durationOverrideMin: task.duration,
    contestantId: participant,
    ...(isMeal ? {} : {
      spaceId: spaceId.get(task.spaceId)!,
      zoneId: zoneId.get(task.spaceId)!,
    }),
    plannerNextKind,
    operationalRole: isMeal ? "meal_break_placeholder"
      : task.transport?.direction === "arrival" ? "transport_arrival"
      : task.transport?.direction === "departure" ? "transport_departure"
      : "productive_task",
    ...(isMeal ? { breakKind: "participant_meal", mealOccupiesSpace: false } : {}),
    ...(task.requiredResourceIds.length ? { assignedResourceIds: task.requiredResourceIds.map((id) => resourceId.get(id)!) } : {}),
    ...(task.dependencies.length ? { dependsOnTaskIds: task.dependencies.map((id) => taskId.get(id)!) } : {}),
    ...(task.jointGroupId ? { jointGroupId: task.jointGroupId } : {}),
    ...(task.setupFamilyId ? { setupFamilyId: task.setupFamilyId } : {}),
    ...(task.itinerantUnitId ? { itinerantTeamId: itinerantUnitId.get(task.itinerantUnitId)! } : {}),
  };
});

const input: EngineInput = createSupportedEngineInputAdapterFixture();
input.planId = PLAN_ID;
input.workDay = { start: config.effectiveDayWindow.start, end: config.effectiveDayWindow.end };
input.mealMode = "flexible_meal_window";
input.meal = { ...config.meals.effectiveWindow };
input.mealWindow = { ...config.meals.effectiveWindow };
input.mealWindowStart = config.meals.effectiveWindow.start;
input.mealWindowEnd = config.meals.effectiveWindow.end;
input.contestantMealDurationMinutes = config.meals.participant.sodexoDurationMinutes;
input.contestantMealMaxSimultaneous = config.meals.participant.maxSimultaneous;
input.mealTaskTemplateId = templateId.get("SODEXO")!;
input.tasks = tasks;
input.locks = [];
input.planZoneSettings = expansion.spaces.map((space) => ({ zoneId: zoneId.get(space.id)!, availabilityStart: null, availabilityEnd: null, source: "A2-FULL-EXEC-001" }));
input.planSpaceSettings = expansion.spaces.map((space) => ({ spaceId: spaceId.get(space.id)!, zoneId: zoneId.get(space.id)!, availabilityStart: null, availabilityEnd: null, source: "A2-FULL-EXEC-001" }));
input.contestantAvailabilityById = Object.fromEntries(expansion.participants.map((id) => [participantId.get(id)!, { ...config.participantAvailability[id] }]));
input.planResourceItems = expansion.resources.map((resource, index) => ({
  id: resourceId.get(resource.id)!, resourceItemId: 7001 + index, typeId: 8001 + index,
  name: resource.id, isAvailable: true, availabilityStart: null, availabilityEnd: null,
}));
input.vocalCoachPlanResourceItemIdByContestantId = Object.fromEntries(expansion.participants.map((id) => [participantId.get(id)!, resourceId.get(EXPECTED_COACH_BY_PARTICIPANT[id])!]));
input.coachResourceIds = [resourceId.get("coach-lucia")!, resourceId.get("coach-jose-maria")!];
input.zoneResourceAssignments = {};
input.spaceResourceAssignments = {};
input.zoneResourceTypeRequirements = {};
input.spaceResourceTypeRequirements = {};
input.resourceItemComponents = {};
input.groupingZoneIds = [];
input.plannerNext = {
  searchPolicy: "EXACT_CONSTRUCTIVE",
  searchBudget: { bestK: 5, maxBacktracks: 200, maxPatterns: 200, maxBranchExpansions: 300000 },
  timeGridMinutes: 5,
  participantTransitionMinutes: 0,
  resourceTransitionMinutes: 0,
  mainFlow: {
    spaceId: spaceId.get(expansion.rules.mainFlow.spaceId)!,
    preferredEnd: config.meals.effectiveWindow.start,
    continuity: "REQUIRED",
    maxBlocksByKey: expansion.rules.mainFlow.maxBlocksPerCoach,
    minTasksPerBlock: 1,
  },
};
input.anchoredAccompaniments = expansion.anchoredOperations.map((operation) => ({
  id: operation.id,
  anchorTaskId: taskId.get(operation.anchorTaskId)!,
  beforeTaskIds: operation.beforeTaskIds.map((id) => taskId.get(id)!),
  afterTaskIds: operation.afterTaskIds.map((id) => taskId.get(id)!),
  adjacency: "REQUIRED",
  internalTransition: "INCLUDED",
  resourceContinuity: "REQUIRED",
}));
input.setupPolicies = [{
  spaceId: spaceId.get(expansion.rules.setup.spaceId)!,
  families: [...expansion.rules.setup.families],
  oneBlockPerFamily: true,
  orderConstraint: "UNSPECIFIED",
  reentry: "FORBIDDEN",
  preparationMinutesBetweenFamilies: expansion.rules.setup.preparationMinutesBetweenFamilies,
}];
input.roundSynchronizations = [{
  id: "a2-totales-rounds",
  synchronization: "START_TOGETHER_WHILE_ALL_LANES_ACTIVE",
  lanes: ["TOTALES_1", "TOTALES_COREO"].map((type) => ({
    spaceId: spaceId.get(type === "TOTALES_1" ? "totales-1" : "totales-coreo")!,
    taskIds: expansion.tasks.filter((task) => task.type === type).map((task) => taskId.get(task.id)!),
    preparationMinutesBetweenRounds: expansion.rules.totalesSynchronization.microphoneChangeMinutesBetweenRounds,
  })),
}];
input.coachRouteTransitions = [
  ["coach-lucia", "caracola-lucia"],
  ["coach-jose-maria", "caracola-jose-maria"],
].map(([coach, from]) => ({
  coachPlanResourceItemId: resourceId.get(coach)!,
  fromSpaceId: spaceId.get(from)!,
  toSpaceId: spaceId.get("estudio-7")!,
  minutes: expansion.rules.coachTransition.minutes,
}));
const operationalMealGroups: Array<[string, string[]]> = [
  ["reality-operations", ["cam-3", "cam-4", "son-1", "son-2"]],
  ["cam2-operations", ["cam-2"]],
  ["eva-operations", ["eva"]],
  ["coach-lucia", ["coach-lucia"]],
  ["coach-jose-maria", ["coach-jose-maria"]],
];
input.operationalMealPolicies = operationalMealGroups.map(([id, resources]) => ({
  id,
  window: { ...config.meals.effectiveWindow },
  durationMinutes: config.meals.operational.defaultDurationMinutes,
  planResourceItemIds: resources.map((resource) => resourceId.get(resource)!),
}));
input.itinerantTeamAvailability = Object.entries(config.itinerantUnitAvailability).map(([canonicalId, availability]) => ({
  itinerantTeamId: itinerantUnitId.get(canonicalId)!,
  windows: [{ start: availability.start, end: availability.end }],
}));
input.arrivalGroupingTarget = config.transportPolicy.arrival.minimumGroupSize;
input.departureGroupingTarget = config.transportPolicy.departure.minimumGroupSize;
input.arrivalMinGapMinutes = config.transportPolicy.arrival.minGapMinutes;
input.departureMinGapMinutes = config.transportPolicy.departure.minGapMinutes;
input.vanCapacity = config.transportPolicy.arrival.maximumGroupSize;
input.transportVanCapacity = config.transportPolicy.arrival.maximumGroupSize;
input.transportSettings = {
  arrivalTargetGroupSize: config.transportPolicy.arrival.minimumGroupSize,
  departureTargetGroupSize: config.transportPolicy.departure.minimumGroupSize,
  arrivalMinGapMinutes: config.transportPolicy.arrival.minGapMinutes,
  departureMinGapMinutes: config.transportPolicy.departure.minGapMinutes,
  vanCapacity: config.transportPolicy.arrival.maximumGroupSize,
  vehicleCapacity: config.transportPolicy.arrival.maximumGroupSize,
  groupingWeight: config.transportPolicy.arrival.groupingWeight,
  source: "engine-buildInput-optimizer-transport",
};

const preflight = preflightEngineInputForPlannerNext(input);
const adapted = adaptEngineInputToPlannerNextProblem(input);
const execution = adapted.status === "SUPPORTED" ? executePlannerNext(adapted.problem,{causalDiagnostic:true}) : null;
const exactResult = execution?.kind === "EXACT_CONSTRUCTIVE" ? execution.result : null;
const scheduledCanonicalObligations = exactResult
  ? exactResult.scheduledTasks.length + exactResult.scheduledParticipantMeals.length
  : 0;
const publishedCanonicalObligations = exactResult?.complete ? scheduledCanonicalObligations : 0;
const projectedItinerantAvailability = adapted.status === "SUPPORTED"
  ? adapted.problem.itinerantUnits ?? []
  : [];
const itineraryAvailabilityProjected = expansion.itinerantUnits.every((unit) => {
  const source = config.itinerantUnitAvailability[unit.id as keyof typeof config.itinerantUnitAvailability];
  const projected = projectedItinerantAvailability.find((entry) => entry.id === `itinerant-team:${itinerantUnitId.get(unit.id)}`);
  return Boolean(source && projected?.availability.some((window) => window.start === Number(source.start.slice(0, 2)) * 60 + Number(source.start.slice(3)) && window.end === Number(source.end.slice(0, 2)) * 60 + Number(source.end.slice(3))));
});

const diagnostic = exactResult?.evidence.causalDiagnostic ?? null;
const criticalDepth = exactResult?.evidence.coreMaximumDepth ?? null;
const criticalRejections = diagnostic?.feederRejections.filter((row) => row.depth === criticalDepth) ?? [];
const top = (key: (row: typeof criticalRejections[number]) => string | null) => Object.entries(criticalRejections.reduce<Record<string,number>>((counts,row)=>{const value=key(row);if(value)counts[value]=(counts[value]??0)+row.count;return counts;},{})).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10).map(([id,count])=>({id,count}));
const criticalRejectionCount = criticalRejections.reduce((sum, row) => sum + row.count, 0);
const leadingBlocker = top((row) => row.blockingPlacedTaskId)[0] ?? null;
const recommendation = leadingBlocker && criticalRejectionCount > 0
  ? `Next PR: run one feeder-aware core-ordering experiment around blocker ${leadingBlocker.id}, which accounts for ${new Intl.NumberFormat("en-US").format(leadingBlocker.count)} of ${new Intl.NumberFormat("en-US").format(criticalRejectionCount)} (${(leadingBlocker.count / criticalRejectionCount * 100).toFixed(1)}%) depth-${criticalDepth} feeder rejections, while preserving every hard constraint and the ${new Intl.NumberFormat("en-US").format(exactResult!.evidence.branchesExplored)}-branch budget.`
  : null;
const diagnosticReport = diagnostic ? {
  waterfallByDepth: diagnostic.waterfallByDepth,
  waterfallReconciles: Object.values(diagnostic.waterfallByDepth).reduce((sum,row)=>sum+row.total,0) === exactResult!.evidence.branchesExplored,
  feederByDepth: diagnostic.feederByDepth,
  criticalDepth,
  criticalRejectionReasons: top((row)=>row.firstRejectionReason),
  topMainTasks: top((row)=>row.mainTaskId),
  topFeederTasks: top((row)=>row.feederTaskId),
  topBlockingPlacedTasks: top((row)=>row.blockingPlacedTaskId),
  topFeederBlockerPairs: top((row)=>row.blockingPlacedTaskId?`${row.feederTaskId} + ${row.blockingPlacedTaskId}`:null),
  criticalRejectionCount,
  recommendation,
} : null;

const evidence = {
  evidenceId: "A2-FULL-EXEC-001-first-execution",
  canonicalObligationCount: expansion.tasks.length,
  canonicalValidationStatus: validation.status,
  engineInput: {
    taskCount: input.tasks.length,
    participantCount: expansion.participants.length,
    sourceHumanTimesUsed: false,
    searchBudgetIsTechnicalExecutionConfiguration: true,
    genericTransitionMinutes: { participant: 0, resource: 0 },
    operationalMealProjection: operationalMealGroups,
    itineraryAvailabilityProjected,
    ...(!itineraryAvailabilityProjected ? { itineraryAvailabilityGap: "Not every referenced itinerant unit has its source availability represented losslessly in Planner Next." } : {}),
  },
  preflight: {
    status: preflight.status,
    reasonCodes: preflight.reasonCodes,
    issues: preflight.issues.map(({ code, entityKind, entityId, path, message, details }) => ({ code, entityKind, entityId, path, message, details })),
  },
  adapter: {
    status: adapted.status,
    reasonCodes: adapted.reasonCodes,
    issues: adapted.issues.map(({ code, entityKind, entityId, path, message, details }) => ({ code, entityKind, entityId, path, message, details })),
    problemFingerprint: adapted.problemFingerprint,
  },
  execution: execution ? {
    kind: execution.kind,
    reasonCodes: execution.reasonCodes,
    status: exactResult?.status ?? null,
    complete: exactResult?.complete ?? false,
    scheduledTaskCount: exactResult?.scheduledTasks.length ?? 0,
    scheduledParticipantMealCount: exactResult?.scheduledParticipantMeals.length ?? 0,
    scheduledOperationalMealCount: exactResult?.scheduledOperationalMeals.length ?? 0,
    remainingTaskIds: exactResult?.remainingTaskIds ?? [],
    evidence: exactResult?.evidence ?? null,
    diagnosticReport,
  } : null,
  result: {
    publishedCanonicalObligations,
    diagnosticScheduledCanonicalObligations: scheduledCanonicalObligations,
    targetCanonicalObligations: expansion.tasks.length,
    fullHardValidEligible: Boolean(exactResult?.complete && publishedCanonicalObligations === expansion.tasks.length && itineraryAvailabilityProjected),
  },
};

writeStable(EVIDENCE_PATH, evidence);
console.log(JSON.stringify(evidence));
