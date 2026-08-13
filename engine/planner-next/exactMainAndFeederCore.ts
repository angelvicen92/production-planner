import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { anchoredTaskIds, materializeAnchoredOperation } from "./anchoredAccompaniment";
import { fingerprint } from "./fingerprint";
import { materializeScheduledItinerantUnitMeals } from "./itinerantUnitMeals";
import { buildTimeline, candidateCuts, hasMainFlowMeal, orderTimelines, type MainFlowTimeline } from "./mainFlowMeal";
import { generateMainFlowPatterns } from "./mainFlowPatterns";
import { canPlaceTask, diagnoseTaskPlacement, type PlacementRejectionReason } from "./placement";
import { effectiveCoachTransitionMinutes, latestFeederEndBeforeMain } from "./coachRouteTransitions";
import { buildRequiredCompositeBlocks, requiredCompositePositions, taskFitsRequiredCompositePosition, type RequiredCompositePosition } from "./requiredCompositeBlock";
import { preflight, validatePlan } from "./validate";

export type ExactMainAndFeederCoreStatus = "COMPLETE" | "PREFLIGHT_FAILED" | "UNSUPPORTED_CORE_SHAPE"
  | "INFEASIBLE" | "BRANCH_BUDGET_EXHAUSTED";

export interface ExactMainAndFeederCoreEvidence {
  branchesExplored: number;
  patternCandidatesExplored: number;
  timelineCandidatesExplored: number;
  mainCandidatesEvaluated: number;
  feederCandidatesEvaluated: number;
  constructiveFeederStartChecks: number;
  matchingFeederStartChecks: number;
  residualMatchingChecks: number;
  residualMatchingInvocations: number;
  residualMatchingFullBuilds: number;
  residualMatchingIncrementalUpdates: number;
  residualMatchingEdgeCacheHits: number;
  residualMatchingEdgeCacheMisses: number;
  residualMatchingPositionChecks: number;
  residualMatchingAugmentTraversals: number;
  residualMatchingBranchesExplored: number;
  residualMatchingPrunes: number;
  residualMatchingRepairs: number;
  residualMatchingRepairFailures: number;
  zeroAlternativePrunes: number;
  backtracks: number;
  maximumDepth: number;
  completeLeafCount: number;
  selectedPattern: string[] | null;
  selectedTimelineKey: string | null;
  selectedMainTaskIds: string[];
  selectedFeederTaskIds: string[];
  coreFingerprint: string | null;
  reasonCodes: string[];
  causalDiagnostic: ExactCoreCausalDiagnostic | null;
}

export type ExactBranchCategory = "MAIN_CANDIDATE" | "FEEDER_START" | "RESIDUAL_MATCHING" | "CONTINUATION"
  | "PARTICIPANT_MEAL" | "STANDALONE_FORWARD" | "OTHER";
export interface ExactDepthWaterfall { mainCandidate:number; feederStart:number; residualMatching:number; continuation:number; participantMeal:number; standaloneForward:number; other:number; total:number }
export interface ExactDepthFeeder { startsConsidered:number; startsCoachEliminated:number; startsEvaluated:number; valid:number; invalid:number; mainChoicesReachingFeeder:number; mainChoicesWithValidFeeder:number }
export interface ExactCriticalFeederRejection { depth:number; mainTaskId:string; feederTaskId:string; participantId:string|null; startsAttempted:number; firstRejectionReason:PlacementRejectionReason; blockingPlacedTaskId:string|null; blockingDecisionDepth:number|null; blockingDecisionMainTaskId:string|null; count:number }
export interface ExactFeederCoachDomainElimination { depth:number; mainTaskId:string; feederTaskId:string; participantId:string|null; reason:"OVERLAP_COACH"|"TRANSITION_COACH"; blockingPlacedTaskId:string; blockingDecisionDepth:number|null; blockingDecisionMainTaskId:string|null; startsEliminated:number }
export interface ExactCoreCausalDiagnostic { waterfallByDepth:Record<string,ExactDepthWaterfall>; feederByDepth:Record<string,ExactDepthFeeder>; feederRejections:ExactCriticalFeederRejection[]; feederCoachDomainEliminations:ExactFeederCoachDomainElimination[] }

export interface ExactMainAndFeederCoreResult {
  status: ExactMainAndFeederCoreStatus;
  complete: boolean;
  scheduledTasks: ScheduledTask[];
  scheduledSpaceMeals: ScheduledSpaceMeal[];
  remainingTaskIds: string[];
  evidence: ExactMainAndFeederCoreEvidence;
}

interface MainChoice {
  task: Task;
  operation: ScheduledTask[];
  feeder: Task;
  participantSlack: number;
  firstObligation: number;
}

interface ResidualMatchingEdge {
  readonly position: number;
  readonly operation: readonly ScheduledTask[];
}

/** A successful, branch-local proof that every remaining main has a distinct position. */
interface ResidualMatchingCertificate {
  readonly taskIds: readonly string[];
  readonly positions: readonly number[];
  readonly validEdges: ReadonlyMap<string, readonly ResidualMatchingEdge[]>;
  readonly invalidPositions: ReadonlyMap<string, ReadonlySet<number>>;
  readonly matching: ReadonlyMap<string, number>;
}

interface ResidualMatchingResult {
  readonly outcome: SearchOutcome;
  readonly certificate?: ResidualMatchingCertificate;
}

/** Immutable, derived view exposed only to experimental candidate-ordering code. */
export interface ExactMainChoiceDescriptor {
  readonly mainTask: Readonly<Task>;
  readonly operationTasks: readonly Readonly<ScheduledTask>[];
  readonly feeder: Readonly<Task>;
  readonly placedTasks: readonly Readonly<ScheduledTask>[];
  readonly meals: readonly Readonly<ScheduledSpaceMeal>[];
  readonly slot: number;
  readonly depth: number;
  readonly pattern: readonly string[];
  readonly participantSlack: number;
  readonly firstObligation: number;
}

type SearchOutcome = "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED";

export type ExactCoreContinuationOutcome = "ACCEPT" | "REJECT" | "BUDGET_EXHAUSTED";
export type ExactPartialCoreContinuationOutcome = "CONTINUE" | "REJECT" | "BUDGET_EXHAUSTED";
export interface ExactSearchLedger {
  limit: number;
  branchesExplored: number;
  coreBranches: number;
  standaloneBranches: number;
  lastExhaustionPhase: "CORE" | "STANDALONE" | null;
  consume(phase: "CORE" | "STANDALONE", count?: number): boolean;
}
export interface ExactCoreLeafCandidate {
  tasks: ScheduledTask[];
  meals: ScheduledSpaceMeal[];
  remainingTaskIds: string[];
  fingerprint: string;
}
export interface ExactPartialCoreCandidate {
  tasks: ScheduledTask[];
  addedTasks: ScheduledTask[];
  meals: ScheduledSpaceMeal[];
  depth: number;
  mainTaskId: string;
  feederStart: number;
  pattern: string[];
  timelineKey: string | null;
}
export interface ExactMainAndFeederSearchOptions {
  ledger?: ExactSearchLedger;
  onHardValidCoreLeaf?: (candidate: ExactCoreLeafCandidate) => ExactCoreContinuationOutcome;
  onPartialCoreCandidate?: (candidate: ExactPartialCoreCandidate) => ExactPartialCoreContinuationOutcome;
  /** Experimental ordering only: a negative result puts `a` before `b`; no candidate can be removed. */
  mainChoiceComparator?: (a: ExactMainChoiceDescriptor, b: ExactMainChoiceDescriptor) => number;
  onMainChoicesRanked?: (baseline: readonly ExactMainChoiceDescriptor[], ordered: readonly ExactMainChoiceDescriptor[]) => void;
  onMainChoiceEntered?: (candidate: ExactMainChoiceDescriptor) => void;
  onMainChoiceAccepted?: (candidate: ExactMainChoiceDescriptor) => void;
  /** Test oracle: rebuilds every residual graph without changing search semantics. */
  residualMatchingMode?: "INCREMENTAL" | "FULL_RECOMPUTE";
  /** Read-only diagnostic used by exact-certificate tests; it cannot influence the search. */
  onResidualMatchingDerived?: (trace: Readonly<{
    selectedTaskId: string;
    consumedPosition: number;
    selectedTaskPreviousPosition: number | null;
    consumedPositionPreviousOwner: string | null;
    invalidatedMatchedEdges: number;
    invalidatedUnmatchedEdges: number;
    reusedInvalidEdges: number;
    unmatchedBeforeRepair: number;
  }>) => void;
  causalDiagnostic?: boolean;
  onBranchConsumed?: (category:ExactBranchCategory,depth:number,count:number)=>void;
  /** Test oracle: evaluates the unchanged complete grid instead of the coach-derived domain. */
  feederStartDomainMode?: "COACH_DOMAIN" | "FULL_GRID";
}

export interface ExactFeederStartInterval { readonly start: number; readonly end: number }
export interface ExactFeederStartDomain {
  readonly intervals: readonly ExactFeederStartInterval[];
  readonly fullGridStartCount: number;
  readonly eligibleStartCount: number;
  readonly coachEliminatedStartCount: number;
  readonly eliminations: readonly Readonly<{ reason:"OVERLAP_COACH"|"TRANSITION_COACH"; blockingPlacedTaskId:string; startsEliminated:number }>[];
  starts(onProgress?: (considered: number, coachEliminated: number) => void): Generator<number>;
}

const gridCountInInterval = (latestStart: number, interval: ExactFeederStartInterval): number => {
  const firstIndex = Math.max(0, Math.ceil((latestStart - interval.end) / 5));
  const lastIndex = Math.floor((latestStart - interval.start) / 5);
  return Math.max(0, lastIndex - firstIndex + 1);
};
const gridCountInClosedRange = (latestStart:number, intervals:readonly ExactFeederStartInterval[], start:number, end:number):number =>
  start>end?0:intervals.reduce((sum,interval)=>{const intersection={start:Math.max(interval.start,start),end:Math.min(interval.end,end)};
    return sum+(intersection.start<=intersection.end?gridCountInInterval(latestStart,intersection):0);},0);

/** Builds disjoint allowed intervals analytically. Production iteration visits only
 * eligible grid points; FULL_GRID deliberately retains the historical test oracle. */
export function exactFeederStartDomain(problem: PlannerNextProblem, feeder: Task, latestStart: number,
  blockers: readonly ScheduledTask[], mode: "COACH_DOMAIN" | "FULL_GRID" = "COACH_DOMAIN"): ExactFeederStartDomain {
  const fullInterval = { start: problem.day.start, end: latestStart };
  const fullGridStartCount = latestStart < problem.day.start ? 0 : gridCountInInterval(latestStart, fullInterval);
  let intervals: ExactFeederStartInterval[] = fullGridStartCount === 0 ? [] : [fullInterval];
  const eliminations:Array<{reason:"OVERLAP_COACH"|"TRANSITION_COACH";blockingPlacedTaskId:string;startsEliminated:number}>=[];
  if (mode === "COACH_DOMAIN" && feeder.coachId !== undefined) {
    for (const blocker of blockers) {
      if (blocker.coachId !== feeder.coachId) continue;
      const beforeBoundary = blocker.start - feeder.duration - effectiveCoachTransitionMinutes(
        problem, feeder.coachId, feeder.spaceId, blocker.spaceId);
      const afterBoundary = blocker.end + effectiveCoachTransitionMinutes(
        problem, feeder.coachId, blocker.spaceId, feeder.spaceId);
      const transitionBefore=gridCountInClosedRange(latestStart,intervals,beforeBoundary+1,blocker.start-feeder.duration);
      const overlap=gridCountInClosedRange(latestStart,intervals,blocker.start-feeder.duration+1,blocker.end-1);
      const transitionAfter=gridCountInClosedRange(latestStart,intervals,blocker.end,afterBoundary-1);
      if(overlap>0)eliminations.push({reason:"OVERLAP_COACH",blockingPlacedTaskId:blocker.id,startsEliminated:overlap});
      if(transitionBefore+transitionAfter>0)eliminations.push({reason:"TRANSITION_COACH",blockingPlacedTaskId:blocker.id,startsEliminated:transitionBefore+transitionAfter});
      intervals = intervals.flatMap((interval) => {
        const before = { start: interval.start, end: Math.min(interval.end, beforeBoundary) };
        const after = { start: Math.max(interval.start, afterBoundary), end: interval.end };
        return [before, after].filter(({ start, end }) => start <= end);
      });
    }
  }
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const eligibleStartCount = intervals.reduce((sum, interval) => sum + gridCountInInterval(latestStart, interval), 0);
  return {
    intervals: Object.freeze(intervals.map((interval) => Object.freeze(interval))),
    fullGridStartCount,
    eligibleStartCount,
    coachEliminatedStartCount: fullGridStartCount - eligibleStartCount,
    eliminations:Object.freeze(eliminations.map(row=>Object.freeze(row))),
    *starts(onProgress) {
      let nextUnaccountedGridIndex = 0;
      for (let index = intervals.length - 1; index >= 0; index--) {
        const interval = intervals[index]!;
        const firstGridIndex = Math.max(0, Math.ceil((latestStart - interval.end) / 5));
        const lastGridIndex = Math.floor((latestStart - interval.start) / 5);
        for (let gridIndex = firstGridIndex; gridIndex <= lastGridIndex; gridIndex++) {
          const considered = gridIndex - nextUnaccountedGridIndex + 1;
          onProgress?.(considered, considered - 1);
          nextUnaccountedGridIndex = gridIndex + 1;
          yield latestStart - 5 * gridIndex;
        }
      }
      const trailingEliminated = fullGridStartCount - nextUnaccountedGridIndex;
      if (trailingEliminated > 0) onProgress?.(trailingEliminated, trailingEliminated);
    },
  };
}

export function createExactSearchLedger(limit: number): ExactSearchLedger {
  const ledger: ExactSearchLedger = {
    limit, branchesExplored: 0, coreBranches: 0, standaloneBranches: 0, lastExhaustionPhase: null,
    consume(phase, count = 1) {
      if (ledger.branchesExplored + count > ledger.limit) { ledger.lastExhaustionPhase = phase; return false; }
      ledger.branchesExplored += count;
      if (phase === "CORE") ledger.coreBranches += count; else ledger.standaloneBranches += count;
      return true;
    },
  };
  return ledger;
}

const canonical = <T extends { id: string }>(values: readonly T[]): T[] => [...values].sort((a, b) => a.id.localeCompare(b.id));
const readonlyTaskCopy = <T extends Task | ScheduledTask>(task: T): Readonly<T> => Object.freeze({ ...task,
  dependencies: Object.freeze([...task.dependencies]),
  requiredResourceIds: task.requiredResourceIds === undefined ? undefined : Object.freeze([...task.requiredResourceIds]),
  availability: task.availability === undefined ? undefined : Object.freeze(task.availability.map((window) => Object.freeze({ ...window }))),
}) as Readonly<T>;

/** Pure conservative invalidation predicate for a previously valid residual edge. */
export const residualMatchingOperationsMayInteract = (left: readonly ScheduledTask[],
  right: readonly ScheduledTask[]): boolean => left.some((candidate) => right.some((added) => {
  const dependency = candidate.dependencies.includes(added.id) || added.dependencies.includes(candidate.id);
  const participant = candidate.participantId !== undefined && candidate.participantId === added.participantId;
  const coach = candidate.coachId !== undefined && candidate.coachId === added.coachId;
  const sharedResource = (candidate.requiredResourceIds ?? [])
    .some((id) => (added.requiredResourceIds ?? []).includes(id));
  return dependency || participant || coach || candidate.spaceId === added.spaceId || sharedResource;
}));

function latestDepartureStartByParticipant(problem: PlannerNextProblem): ReadonlyMap<string, number> {
  const departureIds = new Set(problem.transportPolicy?.departure.taskIds ?? []);
  const latest = new Map<string, number>();
  for (const task of problem.tasks.filter(({ id }) => departureIds.has(id))) {
    if (!task.participantId) continue;
    const participant = problem.participants.find(({ id }) => id === task.participantId);
    const space = problem.spaces.find(({ id }) => id === task.spaceId);
    const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((resource) => resource.id === id));
    const windowSets = [task.availability, participant?.availability, space?.availability,
      ...resources.map((resource) => resource?.availability)]
      .filter((windows): windows is Array<{ start: number; end: number }> => Array.isArray(windows) && windows.length > 0);
    const latestEnd = Math.min(problem.day.end,
      ...windowSets.map((windows) => Math.max(...windows.map(({ end }) => end))));
    const latestStart = latestEnd - task.duration;
    const previous = latest.get(task.participantId);
    latest.set(task.participantId, previous === undefined ? latestStart : Math.min(previous, latestStart));
  }
  return latest;
}

function emptyEvidence(): ExactMainAndFeederCoreEvidence {
  return { branchesExplored: 0, patternCandidatesExplored: 0, timelineCandidatesExplored: 0,
    mainCandidatesEvaluated: 0, feederCandidatesEvaluated: 0, constructiveFeederStartChecks: 0,
    matchingFeederStartChecks: 0, residualMatchingChecks: 0, residualMatchingInvocations: 0,
    residualMatchingFullBuilds: 0, residualMatchingIncrementalUpdates: 0,
    residualMatchingEdgeCacheHits: 0, residualMatchingEdgeCacheMisses: 0,
    residualMatchingPositionChecks: 0, residualMatchingAugmentTraversals: 0,
    residualMatchingBranchesExplored: 0, residualMatchingPrunes: 0,
    residualMatchingRepairs: 0, residualMatchingRepairFailures: 0,
    zeroAlternativePrunes: 0, backtracks: 0, maximumDepth: 0,
    completeLeafCount: 0, selectedPattern: null, selectedTimelineKey: null,
    selectedMainTaskIds: [], selectedFeederTaskIds: [], coreFingerprint: null, reasonCodes: [], causalDiagnostic:null };
}

/** Internal exact runner; a continuation may reject a hard-valid leaf and resume core DFS. */
export function runExactMainAndFeederSearch(problem: PlannerNextProblem,
  options: ExactMainAndFeederSearchOptions = {}): ExactMainAndFeederCoreResult {
  const evidence = emptyEvidence();
  const ledger = options.ledger ?? createExactSearchLedger(problem.budget.maxBranchExpansions);
  const diagnostic:ExactCoreCausalDiagnostic|null=options.causalDiagnostic?{waterfallByDepth:{},feederByDepth:{},feederRejections:[],feederCoachDomainEliminations:[]}:null;
  const rejectionByKey=new Map<string,ExactCriticalFeederRejection>();
  const eliminationByKey=new Map<string,ExactFeederCoachDomainElimination>();
  evidence.causalDiagnostic=diagnostic;
  const waterfall=(depth:number):ExactDepthWaterfall=>diagnostic!.waterfallByDepth[String(depth)]??=( {mainCandidate:0,feederStart:0,residualMatching:0,continuation:0,participantMeal:0,standaloneForward:0,other:0,total:0});
  const recordBranch=(category:ExactBranchCategory,depth:number,count=1):void=>{if(diagnostic){const row=waterfall(depth);const key={MAIN_CANDIDATE:"mainCandidate",FEEDER_START:"feederStart",RESIDUAL_MATCHING:"residualMatching",CONTINUATION:"continuation",PARTICIPANT_MEAL:"participantMeal",STANDALONE_FORWARD:"standaloneForward",OTHER:"other"}[category] as keyof ExactDepthWaterfall;row[key]+=count;row.total+=count;}options.onBranchConsumed?.(category,depth,count);};
  const allTaskIds = canonical(Array.isArray(problem.tasks) ? problem.tasks : []).map(({ id }) => id);
  const fail = (status: Exclude<ExactMainAndFeederCoreStatus, "COMPLETE">, reasons: string[], coreIds: Set<string> = new Set()): ExactMainAndFeederCoreResult => {
    evidence.reasonCodes = [...new Set(reasons)].sort();
    return { status, complete: false, scheduledTasks: [], scheduledSpaceMeals: [],
      remainingTaskIds: allTaskIds.filter((id) => !coreIds.has(id)), evidence };
  };
  const mains = canonical(problem.tasks.filter((task) => task.kind === "main"));
  const vocals = canonical(problem.tasks.filter((task) => task.kind === "vocal"));
  const feederByMain = new Map<string, Task>();
  const unsupported: string[] = [];
  for (const main of mains) {
    const matching = vocals.filter((task) => task.participantId === main.participantId);
    if (matching.length !== 1) unsupported.push(`${matching.length === 0 ? "MISSING" : "MULTIPLE"}_VOCAL_FEEDER:${main.id}`);
    else if (!main.dependencies.includes(matching[0]!.id)
      || matching[0]!.dependencies.some((dependencyId) => mains.some(({ id }) => id === dependencyId)))
      unsupported.push(`UNSUPPORTED_FEEDER_DEPENDENCY:${main.id}`);
    else feederByMain.set(main.id, { ...matching[0]!, dependencies: [...matching[0]!.dependencies] });
  }
  if (unsupported.length > 0 || mains.length === 0)
    return fail("UNSUPPORTED_CORE_SHAPE", unsupported.length ? unsupported : ["MISSING_MAIN_TASK"]);
  const preflightReasons = preflight(problem);
  if (preflightReasons.length > 0) return fail("PREFLIGHT_FAILED", preflightReasons);
  const anchoredIds = anchoredTaskIds(problem);
  const mainIds = new Set(mains.map(({ id }) => id));
  const applicableContracts = canonical((problem.anchoredAccompaniments ?? []).filter((contract) => mainIds.has(contract.anchorTaskId)));
  const coreIds = new Set([...mainIds, ...feederByMain.values()].map((value) => typeof value === "string" ? value : value.id));
  for (const contract of applicableContracts) for (const id of [...contract.beforeTaskIds, ...contract.afterTaskIds]) coreIds.add(id);
  if ([...anchoredIds].some((id) => !coreIds.has(id))) return fail("UNSUPPORTED_CORE_SHAPE", ["UNSUPPORTED_NON_MAIN_ANCHORED_OPERATION"], coreIds);

  let exhaustionReason = "BRANCH_BUDGET_EXHAUSTED";
  const consumeBranch = (reason: string,category:ExactBranchCategory="OTHER",depth=0): boolean => {
    if (!ledger.consume("CORE")) { exhaustionReason = reason; return false; }
    recordBranch(category,depth);
    evidence.branchesExplored = ledger.coreBranches;
    return true;
  };
  let matchingDiagnosticDepth=0;
  const consumeMatchingBranch = (): boolean => {
    if (!consumeBranch("MATCHING_SEARCH_BUDGET_EXHAUSTED","RESIDUAL_MATCHING",matchingDiagnosticDepth)) return false;
    evidence.residualMatchingBranchesExplored += 1;
    return true;
  };
  const duration = mains[0]!.duration;
  const patterns = generateMainFlowPatterns(mains, problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey, problem.budget.maxPatterns);
  if (patterns.exhausted) return fail("BRANCH_BUDGET_EXHAUSTED", ["PATTERN_SEARCH_BUDGET_EXHAUSTED"], coreIds);
  const requiredBlocks = buildRequiredCompositeBlocks(problem, mains);
  const latestDepartureStart = latestDepartureStartByParticipant(problem);
  let selected: { tasks: ScheduledTask[]; meals: ScheduledSpaceMeal[]; pattern: string[]; timeline?: MainFlowTimeline } | null = null;

  const feederMainById=new Map([...feederByMain].map(([mainId,feeder])=>[feeder.id,mainId]));
  const introducedBy=(id:string,placed:ScheduledTask[]):{mainTaskId:string|null;depth:number|null}=>{const direct=mains.some(x=>x.id===id)?id:feederMainById.get(id)??applicableContracts.find(c=>[...c.beforeTaskIds,...c.afterTaskIds].includes(id))?.anchorTaskId??null;if(!direct)return {mainTaskId:null,depth:null};return {mainTaskId:direct,depth:placed.filter(x=>x.kind==="main").findIndex(x=>x.id===direct)+1};};
  const checkFeederStart = (choice:MainChoice, start: number, placed: ScheduledTask[], meals: ScheduledSpaceMeal[],depth:number): "VALID" | "INVALID" | "BUDGET_EXHAUSTED" => {
    if (!consumeBranch("CONSTRUCTIVE_FEEDER_START_SEARCH_BUDGET_EXHAUSTED","FEEDER_START",depth)) return "BUDGET_EXHAUSTED";
    evidence.feederCandidatesEvaluated += 1;
    evidence.constructiveFeederStartChecks += 1;
    const assessed=diagnostic?diagnoseTaskPlacement(problem,choice.feeder,start,[...placed,...choice.operation],meals):null;
    const valid=assessed?assessed.valid:canPlaceTask(problem,choice.feeder,start,[...placed,...choice.operation],meals);
    if(!valid&&diagnostic&&assessed?.firstRejectionReason){const blocker=assessed.blockingPlacedTaskId;const prior=blocker?introducedBy(blocker,placed):{mainTaskId:null,depth:null};const key=[depth,choice.task.id,choice.feeder.id,choice.task.participantId??"",assessed.firstRejectionReason,blocker??"",prior.depth??"",prior.mainTaskId??""].join("|");const existing=rejectionByKey.get(key);if(existing){existing.count++;existing.startsAttempted++;}else{const row={depth,mainTaskId:choice.task.id,feederTaskId:choice.feeder.id,participantId:choice.task.participantId??null,startsAttempted:1,firstRejectionReason:assessed.firstRejectionReason,blockingPlacedTaskId:blocker,blockingDecisionDepth:prior.depth&&prior.depth>0?prior.depth:null,blockingDecisionMainTaskId:prior.mainTaskId,count:1};rejectionByKey.set(key,row);diagnostic.feederRejections.push(row);}}
    return valid?"VALID":"INVALID";
  };

  const search = (pattern: string[], slots: number[], composite: RequiredCompositePosition,
    meals: ScheduledSpaceMeal[], placed: ScheduledTask[], used: Set<string>, depth: number,
    timelineKey: string | null, certificate?: ResidualMatchingCertificate): SearchOutcome => {
    evidence.maximumDepth = Math.max(evidence.maximumDepth, depth);
    if (depth === mains.length) {
      if (!consumeBranch("LEAF_VALIDATION_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
      evidence.completeLeafCount += 1;
      const reducedTasks = problem.tasks.filter(({ id }) => coreIds.has(id)).map((task) => ({
        ...task, dependencies: task.dependencies.filter((dependencyId) => coreIds.has(dependencyId)),
      }));
      const deferredSetupSpaceIds = new Set(problem.spaces.filter((space) => space.setupPolicy !== undefined
        && !reducedTasks.some((task) => task.spaceId === space.id)).map(({ id }) => id));
      const reduced: PlannerNextProblem = { ...problem, tasks: reducedTasks,
        spaces: problem.spaces.map((space) => deferredSetupSpaceIds.has(space.id)
          ? { ...space, secondaryContinuity: "OFF" as const, setupPolicy: undefined } : space),
        anchoredAccompaniments: applicableContracts, roundSynchronizations: undefined,
        participantMeals: undefined, participantMealCapacity: undefined, operationalMealPolicies: undefined,
        transportPolicy: undefined };
      const expected = [...coreIds].sort(), actual = placed.map(({ id }) => id).sort();
      const validShape = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
      const fixedResourceMeals=(reduced.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
      const fixedItinerantMeals=materializeScheduledItinerantUnitMeals(reduced);
      const reducedPlaced = placed.map((task) => ({ ...task,
        dependencies: task.dependencies.filter((dependencyId) => coreIds.has(dependencyId)) }));
      const validation = validatePlan(reduced, reducedPlaced, [], meals,[],fixedResourceMeals,fixedItinerantMeals);
      if (validShape && validation.hardValid) {
        const originalById = new Map(problem.tasks.map((task) => [task.id, task]));
        const ordered = placed.map((task) => ({ ...task,
          dependencies: [...(originalById.get(task.id)?.dependencies ?? task.dependencies)],
        })).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
        const orderedMeals = [...meals].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
        const continuation = options.onHardValidCoreLeaf?.({ tasks: ordered, meals: orderedMeals,
          remainingTaskIds: allTaskIds.filter((id) => !coreIds.has(id)), fingerprint: fingerprint(ordered, [], orderedMeals) }) ?? "ACCEPT";
        if (continuation === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (continuation === "ACCEPT") { selected = { tasks: ordered, meals, pattern }; return "FOUND"; }
      }
      return "DEAD_END";
    }

    // A contiguous pattern run is the structural unit: choose and place every main first,
    // then close the whole feeder cohort before exposing the candidate to secondary search.
    let runEnd = depth + 1;
    while (runEnd < pattern.length && pattern[runEnd] === pattern[depth]) runEnd += 1;
    const descriptors: ExactMainChoiceDescriptor[] = [];

    const assignMains = (position: number, blockPlaced: ScheduledTask[], blockUsed: Set<string>,
      cohort: MainChoice[], blockCertificate: ResidualMatchingCertificate | undefined): SearchOutcome => {
      evidence.maximumDepth = Math.max(evidence.maximumDepth, position);
      if (position === runEnd) {
        const blockOperations = cohort.flatMap(({ operation }) => operation);
        const scheduleFeeders = (scheduled: ScheduledTask[], remaining: MainChoice[]): SearchOutcome => {
          if (remaining.length === 0) {
            const nextPlaced = [...blockPlaced, ...scheduled];
            matchingDiagnosticDepth=runEnd;
            const matching = residualMatching(pattern, slots, composite, meals, nextPlaced, blockUsed, runEnd,
              options.residualMatchingMode === "FULL_RECOMPUTE" ? undefined : blockCertificate,
              cohort.at(-1)!.task.id, scheduled);
            if (matching.outcome !== "FOUND") {
              if (matching.outcome === "DEAD_END") { evidence.residualMatchingPrunes += 1; evidence.backtracks += 1; }
              return matching.outcome;
            }
            const partial = options.onPartialCoreCandidate?.({ tasks: nextPlaced,
              addedTasks: [...blockOperations, ...scheduled], meals, depth: runEnd,
              mainTaskId: cohort.at(-1)!.task.id, feederStart: Math.min(...scheduled.map(({ start }) => start)),
              pattern: [...pattern], timelineKey }) ?? "CONTINUE";
            if (partial === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
            if (partial === "REJECT") { evidence.backtracks += 1; return "DEAD_END"; }
            if (!consumeBranch("FUTURE_FEASIBILITY_SEARCH_BUDGET_EXHAUSTED","CONTINUATION",runEnd)) return "BUDGET_EXHAUSTED";
            const child = search(pattern, slots, composite, meals, nextPlaced, blockUsed, runEnd, timelineKey,
              matching.certificate);
            if (child === "FOUND") for (const descriptor of descriptors) options.onMainChoiceAccepted?.(descriptor);
            else if (child === "DEAD_END") evidence.backtracks += 1;
            return child;
          }
          const firstMainStart = Math.min(...blockOperations.map(({ start }) => start));
          const ranked = remaining.map((choice) => {
            const deadline = latestFeederEndBeforeMain(problem, choice.feeder, choice.task.spaceId,
              firstMainStart, firstMainStart);
            const blockers = [...blockPlaced, ...blockOperations, ...scheduled];
            const domain = exactFeederStartDomain(problem, choice.feeder,
              deadline - choice.feeder.duration, blockers, options.feederStartDomainMode);
            return { choice, domain };
          }).sort((a,b)=>a.domain.eligibleStartCount-b.domain.eligibleStartCount
            || a.choice.task.id.localeCompare(b.choice.task.id));
          const { choice, domain: startDomain } = ranked[0]!;
          if (diagnostic) for (const elimination of startDomain.eliminations) {
            const prior = introducedBy(elimination.blockingPlacedTaskId, [...blockPlaced, ...blockOperations, ...scheduled]);
            const row: ExactFeederCoachDomainElimination = {
              depth: position,
              mainTaskId: choice.task.id,
              feederTaskId: choice.feeder.id,
              participantId: choice.task.participantId ?? null,
              ...elimination,
              blockingDecisionDepth: prior.depth && prior.depth > 0 ? prior.depth : null,
              blockingDecisionMainTaskId: prior.mainTaskId,
            };
            const key = [row.depth, row.mainTaskId, row.feederTaskId, row.participantId ?? "", row.reason,
              row.blockingPlacedTaskId, row.blockingDecisionDepth ?? "", row.blockingDecisionMainTaskId ?? ""].join("|");
            const existing = eliminationByKey.get(key);
            if (existing) existing.startsEliminated += row.startsEliminated;
            else { eliminationByKey.set(key, row); diagnostic.feederCoachDomainEliminations.push(row); }
          }
          const feederRow=diagnostic?(diagnostic.feederByDepth[String(position)]??={startsConsidered:0,startsCoachEliminated:0,startsEvaluated:0,valid:0,invalid:0,mainChoicesReachingFeeder:0,mainChoicesWithValidFeeder:0}):null;
          if(feederRow)feederRow.mainChoicesReachingFeeder++;
          let validStartFound = false;
          const starts = startDomain.starts((considered, eliminated) => {
            if (feederRow) { feederRow.startsConsidered += considered; feederRow.startsCoachEliminated += eliminated; }
          });
          for (const start of starts) {
            const check = checkFeederStart(choice,start,[...blockPlaced,...blockOperations,...scheduled],meals,position);
            if (check === "BUDGET_EXHAUSTED") return check;
            if(feederRow){feederRow.startsEvaluated++;if(check==="VALID")feederRow.valid++;else feederRow.invalid++;}
            if (check === "INVALID") continue;
            if (!validStartFound && feederRow) feederRow.mainChoicesWithValidFeeder++;
            validStartFound = true;
            const feeder = { ...choice.feeder, start, end: start + choice.feeder.duration };
            const child = scheduleFeeders([...scheduled, feeder], remaining.filter(({ task }) => task.id !== choice.task.id));
            if (child !== "DEAD_END") return child;
            evidence.backtracks += 1;
          }
          if (!validStartFound) evidence.zeroAlternativePrunes += 1;
          return "DEAD_END";
        };
        return scheduleFeeders([], cohort);
      }

      const slot = slots[position]!, choices: MainChoice[] = [];
      for (const task of mains) {
        if (blockUsed.has(task.id) || task.blockKey !== pattern[position]
          || !taskFitsRequiredCompositePosition(task, position, requiredBlocks, composite)) continue;
        if (!consumeBranch("MAIN_CANDIDATE_SEARCH_BUDGET_EXHAUSTED","MAIN_CANDIDATE",position)) return "BUDGET_EXHAUSTED";
        evidence.mainCandidatesEvaluated += 1;
        const operation = materializeAnchoredOperation(problem, task, slot, blockPlaced, meals);
        if (!operation) continue;
        const departureDeadline = latestDepartureStart.get(task.participantId);
        if (departureDeadline !== undefined && operation.end > departureDeadline) continue;
        const participant = problem.participants.find(({ id }) => id === task.participantId)!;
        const containing = participant.availability.filter(({ start, end }) => start <= operation.start && operation.end <= end);
        const slack = containing.length ? Math.min(...containing.map(({ start, end }) => (operation.start-start)+(end-operation.end))) : 0;
        choices.push({ task, operation: operation.tasks, feeder: feederByMain.get(task.id)!, participantSlack: slack,
          firstObligation: operation.start });
      }
      choices.sort((a,b)=>a.participantSlack-b.participantSlack||a.firstObligation-b.firstObligation||a.task.id.localeCompare(b.task.id));
      if (choices.length === 0) { evidence.zeroAlternativePrunes += 1; return "DEAD_END"; }
      const describe = (choice: MainChoice): ExactMainChoiceDescriptor => Object.freeze({
        mainTask: readonlyTaskCopy(choice.task), operationTasks:Object.freeze(choice.operation.map(readonlyTaskCopy)),
        feeder:readonlyTaskCopy(choice.feeder), placedTasks:Object.freeze(blockPlaced.map(readonlyTaskCopy)),
        meals:Object.freeze(meals.map(meal=>Object.freeze({...meal}))), slot, depth:position,
        pattern:Object.freeze([...pattern]), participantSlack:choice.participantSlack, firstObligation:choice.firstObligation });
      const byId=new Map(choices.map(choice=>[choice.task.id,describe(choice)]));
      const baseline=choices.map(choice=>byId.get(choice.task.id)!);
      if(options.mainChoiceComparator)choices.sort((a,b)=>options.mainChoiceComparator!(byId.get(a.task.id)!,byId.get(b.task.id)!));
      options.onMainChoicesRanked?.(Object.freeze([...baseline]),Object.freeze(choices.map(choice=>byId.get(choice.task.id)!)));
      for(const choice of choices){
        const descriptor=byId.get(choice.task.id)!; options.onMainChoiceEntered?.(descriptor); descriptors.push(descriptor);
        const nextPlaced=[...blockPlaced,...choice.operation], nextUsed=new Set(blockUsed).add(choice.task.id);
        matchingDiagnosticDepth=position;
        const matching=residualMatching(pattern,slots,composite,meals,nextPlaced,nextUsed,position+1,
          options.residualMatchingMode === "FULL_RECOMPUTE" ? undefined : blockCertificate,
          choice.task.id,choice.operation);
        if(matching.outcome === "BUDGET_EXHAUSTED") return matching.outcome;
        if(matching.outcome === "DEAD_END") { evidence.residualMatchingPrunes += 1; evidence.backtracks += 1; descriptors.pop(); continue; }
        const child=assignMains(position+1,nextPlaced,nextUsed,[...cohort,choice],matching.certificate);
        if(child!=="DEAD_END")return child;
        descriptors.pop(); evidence.backtracks+=1;
      }
      return "DEAD_END";
    };
    return assignMains(depth, placed, used, [], certificate);
  };

  const residualMatching = (pattern: string[], slots: number[], composite: RequiredCompositePosition,
    meals: ScheduledSpaceMeal[], placed: ScheduledTask[], used: Set<string>, nextDepth: number,
    parent: ResidualMatchingCertificate | undefined, selectedTaskId: string,
    addedTasks: readonly ScheduledTask[]): ResidualMatchingResult => {
    if (!consumeMatchingBranch()) return { outcome: "BUDGET_EXHAUSTED" };
    evidence.residualMatchingChecks += 1;
    evidence.residualMatchingInvocations += 1;
    const remaining = mains.filter(({ id }) => !used.has(id));
    const remainingIds = remaining.map(({ id }) => id);
    const remainingIdSet = new Set(remainingIds);
    const positions = Array.from({ length: mains.length - nextDepth }, (_, index) => nextDepth + index);
    const positionSet = new Set(positions);
    const validEdges = new Map<string, ResidualMatchingEdge[]>();
    const invalidPositions = new Map<string, Set<number>>();

    const evaluate = (task: Task, position: number): ResidualMatchingEdge | null | "BUDGET_EXHAUSTED" => {
      if (!consumeMatchingBranch()) return "BUDGET_EXHAUSTED";
      evidence.residualMatchingPositionChecks += 1;
      const operation = materializeAnchoredOperation(problem, task, slots[position]!, placed, meals);
      if (!operation) return null;
      const departureDeadline = latestDepartureStart.get(task.participantId);
      if (departureDeadline !== undefined && operation.end > departureDeadline) return null;
      return { position, operation: operation.tasks.map((item) => ({ ...item,
        dependencies: [...item.dependencies], requiredResourceIds: item.requiredResourceIds === undefined
          ? undefined : [...item.requiredResourceIds] })) };
    };

    if (parent === undefined) {
      evidence.residualMatchingFullBuilds += 1;
      for (const task of remaining) {
        const taskEdges: ResidualMatchingEdge[] = [];
        const taskInvalid = new Set<number>();
        for (const position of positions) {
          if (task.blockKey !== pattern[position]
            || !taskFitsRequiredCompositePosition(task, position, requiredBlocks, composite)) continue;
          const edge = evaluate(task, position);
          if (edge === "BUDGET_EXHAUSTED") return { outcome: "BUDGET_EXHAUSTED" };
          if (edge) taskEdges.push(edge); else taskInvalid.add(position);
        }
        validEdges.set(task.id, taskEdges);
        invalidPositions.set(task.id, taskInvalid);
        if (taskEdges.length === 0) return { outcome: "DEAD_END" };
      }
    } else {
      evidence.residualMatchingIncrementalUpdates += 1;
      const consumedPosition = nextDepth - 1;
      let invalidatedMatchedEdges = 0;
      let invalidatedUnmatchedEdges = 0;
      let reusedInvalidEdges = 0;
      // Both vertices are removed independently: the parent's matching need not pair them together.
      for (const task of remaining) {
        const parentInvalid = parent.invalidPositions.get(task.id) ?? new Set<number>();
        const retainedInvalid = [...parentInvalid].filter((position) => positionSet.has(position));
        reusedInvalidEdges += retainedInvalid.length;
        invalidPositions.set(task.id, new Set(retainedInvalid));
        const taskEdges: ResidualMatchingEdge[] = [];
        for (const edge of parent.validEdges.get(task.id) ?? []) {
          if (edge.position === consumedPosition || !positionSet.has(edge.position)) continue;
          if (!residualMatchingOperationsMayInteract(edge.operation, addedTasks)) {
            evidence.residualMatchingEdgeCacheHits += 1;
            taskEdges.push(edge);
            continue;
          }
          evidence.residualMatchingEdgeCacheMisses += 1;
          const refreshed = evaluate(task, edge.position);
          if (refreshed === "BUDGET_EXHAUSTED") return { outcome: "BUDGET_EXHAUSTED" };
          if (refreshed) taskEdges.push(refreshed);
          else {
            invalidPositions.get(task.id)!.add(edge.position);
            if (parent.matching.get(task.id) === edge.position) invalidatedMatchedEdges += 1;
            else invalidatedUnmatchedEdges += 1;
          }
        }
        validEdges.set(task.id, taskEdges);
        if (taskEdges.length === 0) return { outcome: "DEAD_END" };
      }
      // Assert the requested removal in the derivation rather than relying only on `used`.
      if (parent.taskIds.includes(selectedTaskId) && remainingIdSet.has(selectedTaskId))
        throw new Error("RESIDUAL_MATCHING_SELECTED_TASK_NOT_REMOVED");

      if (options.onResidualMatchingDerived) {
        const retainedTaskIds = new Set<string>();
        for (const [taskId, position] of parent.matching) {
          if (remainingIdSet.has(taskId) && positionSet.has(position)
            && (validEdges.get(taskId) ?? []).some((edge) => edge.position === position)) retainedTaskIds.add(taskId);
        }
        options.onResidualMatchingDerived(Object.freeze({
          selectedTaskId,
          consumedPosition,
          selectedTaskPreviousPosition: parent.matching.get(selectedTaskId) ?? null,
          consumedPositionPreviousOwner: [...parent.matching]
            .find(([, position]) => position === consumedPosition)?.[0] ?? null,
          invalidatedMatchedEdges,
          invalidatedUnmatchedEdges,
          reusedInvalidEdges,
          unmatchedBeforeRepair: remainingIds.filter((id) => !retainedTaskIds.has(id)).length,
        }));
      }
    }

    const matching = new Map<string, number>();
    const positionOwner = new Map<number, string>();
    if (parent !== undefined) {
      for (const [taskId, position] of parent.matching) {
        if (!remainingIdSet.has(taskId) || !positionSet.has(position)) continue;
        if (!(validEdges.get(taskId) ?? []).some((edge) => edge.position === position)) continue;
        matching.set(taskId, position);
        positionOwner.set(position, taskId);
      }
    }
    const augment = (taskId: string, seen: Set<number>): "MATCHED" | "UNMATCHED" | "BUDGET_EXHAUSTED" => {
      for (const { position } of validEdges.get(taskId) ?? []) {
        if (seen.has(position)) continue;
        if (!consumeMatchingBranch()) return "BUDGET_EXHAUSTED";
        evidence.residualMatchingAugmentTraversals += 1;
        seen.add(position);
        const owner = positionOwner.get(position);
        if (owner === undefined) {
          positionOwner.set(position, taskId);
          matching.set(taskId, position);
          return "MATCHED";
        }
        const displaced = augment(owner, seen);
        if (displaced === "BUDGET_EXHAUSTED") return displaced;
        if (displaced === "MATCHED") {
          positionOwner.set(position, taskId);
          matching.set(taskId, position);
          return "MATCHED";
        }
      }
      return "UNMATCHED";
    };
    const unmatched = remainingIds.filter((id) => !matching.has(id));
    if (parent !== undefined && unmatched.length > 0) evidence.residualMatchingRepairs += 1;
    for (const taskId of unmatched) {
      const result = augment(taskId, new Set());
      if (result === "BUDGET_EXHAUSTED") return { outcome: result };
      if (result === "UNMATCHED") {
        if (parent !== undefined) evidence.residualMatchingRepairFailures += 1;
        return { outcome: "DEAD_END" };
      }
    }
    const certificate: ResidualMatchingCertificate = {
      taskIds: remainingIds, positions, validEdges, invalidPositions, matching,
    };
    return { outcome: "FOUND", certificate };
  };

  outer: for (const pattern of patterns.patterns) {
    if (!consumeBranch("PATTERN_SEARCH_BUDGET_EXHAUSTED"))
      return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
    evidence.patternCandidatesExplored += 1;
    const compositeAllowance = ledger.limit - ledger.branchesExplored;
    const positionsResult = requiredCompositePositions(requiredBlocks, mains, pattern, compositeAllowance);
    if (!ledger.consume("CORE", positionsResult.rawCombinationCount))
      return fail("BRANCH_BUDGET_EXHAUSTED", ["COMPOSITE_SEARCH_BUDGET_EXHAUSTED"], coreIds);
    recordBranch("OTHER",0,positionsResult.rawCombinationCount);
    evidence.branchesExplored = ledger.coreBranches;
    if (positionsResult.exhausted)
      return fail("BRANCH_BUDGET_EXHAUSTED", ["COMPOSITE_SEARCH_BUDGET_EXHAUSTED"], coreIds);
    const positions = positionsResult.positions.length ? positionsResult.positions : [{ startIndexByResourceId: {}, signature: "" }];
    const timelines: Array<MainFlowTimeline | undefined> = hasMainFlowMeal(problem)
      ? orderTimelines(candidateCuts(pattern).map((cut) => buildTimeline(problem, pattern, duration, cut))) : [undefined];
    for (const timeline of timelines) {
      const departureEnds = [...latestDepartureStart.values()];
      const candidateEnds = timeline
        ? [problem.mainFlow.preferredEnd]
        : [...new Set([
          problem.mainFlow.preferredEnd,
          ...departureEnds
            .filter((deadline) => problem.mainFlow.preferredEnd < deadline && deadline <= problem.day.end)
            .sort((left, right) => left - right),
          ...(problem.day.end > problem.mainFlow.preferredEnd ? [problem.day.end] : []),
          ...departureEnds
            .filter((deadline) => deadline < problem.mainFlow.preferredEnd)
            .sort((left, right) => right - left),
        ])];
      for (const candidateEnd of candidateEnds) {
        if (!consumeBranch("TIMELINE_SEARCH_BUDGET_EXHAUSTED"))
          return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
        evidence.timelineCandidatesExplored += 1;
        const slots = timeline?.slots ?? pattern.map((_, index) => candidateEnd - pattern.length * duration + index * duration);
        if (slots.length > 0 && slots[0]! < problem.day.start) continue;
        for (const composite of positions) {
          if (!consumeBranch("COMPOSITE_POSITION_SEARCH_BUDGET_EXHAUSTED"))
            return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
          const result = search(pattern, slots, composite, timeline ? [timeline.meal] : [], [], new Set(), 0,
            timeline?.key ?? null);
          if (result === "BUDGET_EXHAUSTED")
            return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
          if (result === "FOUND") {
            if (selected) selected.timeline = timeline;
            break outer;
          }
        }
      }
    }
  }
  if (!selected) return fail("INFEASIBLE", ["NO_COMPLETE_HARD_VALID_CORE"], coreIds);
  const ordered = [...selected.tasks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const meals = [...selected.meals].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  evidence.selectedPattern = [...selected.pattern];
  evidence.selectedTimelineKey = selected.timeline?.key ?? null;
  evidence.selectedMainTaskIds = ordered.filter(({ kind }) => kind === "main").map(({ id }) => id);
  evidence.selectedFeederTaskIds = ordered.filter(({ kind }) => kind === "vocal").map(({ id }) => id);
  evidence.coreFingerprint = fingerprint(ordered, [], meals);
  evidence.reasonCodes = [];
  return { status: "COMPLETE", complete: true, scheduledTasks: ordered, scheduledSpaceMeals: meals,
    remainingTaskIds: allTaskIds.filter((id) => !coreIds.has(id)), evidence };
}

/** Constructs only the first exact main-flow, direct vocal-feeder and main-anchored hard-valid leaf. */
export function constructExactMainAndFeederCore(problem: PlannerNextProblem): ExactMainAndFeederCoreResult {
  return runExactMainAndFeederSearch(problem);
}
