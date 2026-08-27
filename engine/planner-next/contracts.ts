export type Minute = number;

export interface Window {
  start: Minute;
  end: Minute;
}

export interface Person {
  id: string;
  availability: Window[];
}

export interface ItinerantUnit {
  id: string;
  availability: Window[];
}

export interface Space {
  id: string;
  availability: Window[];
  secondaryContinuity?: SecondaryContinuity;
  setupPolicy?: SetupPolicy;
  mealPolicy?: SpaceMealPolicy;
}
export interface SpaceMealPolicy { window: Window; duration: Minute }
export interface SetupPolicy {
  /** Canonical allowed families. For explicit policies this is also the required order. */
  familyOrder: string[];
  /** When true, familyOrder is an allowed-family set and search chooses the block order. */
  flexibleFamilyOrder?: boolean;
  reentry: "FORBIDDEN";
  /** Historical/explicit preparation contract keyed by the family that starts. */
  preparationMinutesByFamily?: Record<string, number>;
  /** Flexible-order preparation inserted before every family after the first selected family. */
  preparationMinutesBetweenFamilies?: number;
}

export interface RoundSynchronizationLane {
  spaceId: string;
  taskIds: string[];
  preparationMinutesBetweenRounds: Minute;
}

export interface RoundSynchronizationPolicy {
  id: string;
  lanes: RoundSynchronizationLane[];
  synchronization: "START_TOGETHER_WHILE_ALL_LANES_ACTIVE";
}

export interface CoachRouteTransition {
  coachId: string;
  fromSpaceId: string;
  toSpaceId: string;
  minutes: Minute;
}

export type SecondaryContinuity = "OFF" | "REQUIRED";

export type PreferenceLevel = "OFF" | "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
export type PresenceConcentrationPolicy = "OFF" | "PREFERRED" | "REQUIRED";

export interface Resource {
  id: string;
  availability: Window[];
  presencePreference: PreferenceLevel;
  presenceConcentrationPolicy?: PresenceConcentrationPolicy;
  assignedSpaceId?: string;
  transitionMinutes?: number;
}

interface BaseTask {
  id: string;
  duration: number;
  spaceId: string;
  dependencies: string[];
  requiredResourceIds?: string[];
  availability?: Window[];
  itinerantUnitId?: string;
}
export interface ParticipantTask extends BaseTask {
  kind: "main" | "vocal" | "auxiliary";
  participantId: string;
  coachId?: string;
  blockKey?: string;
  setupFamilyId?: string;
  jointGroupId?: string;
}
export interface TechnicalTask extends BaseTask {
  kind: "technical";
  participantId?: never;
  coachId?: never;
  blockKey?: never;
  setupFamilyId?: never;
  jointGroupId?: never;
}
export type Task = ParticipantTask | TechnicalTask;

export interface SearchBudget {
  bestK: number;
  maxBacktracks: number;
  maxPatterns: number;
  maxBranchExpansions: number;
}
export interface AnchoredAccompaniment {
  id: string;
  anchorTaskId: string;
  beforeTaskIds: string[];
  afterTaskIds: string[];
  adjacency: "REQUIRED";
  internalTransition: "INCLUDED";
  resourceContinuity: "REQUIRED";
  itinerantUnitId?: string;
}

export type PlannerSearchPolicy =
  | "COMPATIBILITY_PRESERVING"
  | "EXACT_CONSTRUCTIVE";

export interface PlannerNextProblem {
  day: Window;
  /** Legacy/global hard meal break. Absent for flexible participant meal windows. */
  protectedMeal?: Window;
  spaces: Space[];
  resources: Resource[];
  participants: Person[];
  coaches: Person[];
  /** Hard availability of itinerant compositions, independently of their members. */
  itinerantUnits?: ItinerantUnit[];
  tasks: Task[];
  mainFlow: {
    spaceId: string;
    preferredEnd: Minute;
    continuity: "REQUIRED";
    maxBlocksByKey: number;
    minTasksPerBlock: number;
  };
  participantTransitionMinutes: number;
  resourceTransitionMinutes: number;
  coachRouteTransitions?: CoachRouteTransition[];
  roundSynchronizations?: RoundSynchronizationPolicy[];
  budget: SearchBudget;
  auxiliaryPolicy?: { participantPresencePreference: PreferenceLevel };
  anchoredAccompaniments?: AnchoredAccompaniment[];
  searchPolicy?: PlannerSearchPolicy;
  participantMeals?: ParticipantMealObligation[];
  participantMealCapacity?: { maxSimultaneous: number };
  resourceMeals?: ResourceMealBreak[];
  operationalMealPolicies?: OperationalMealPolicy[];
  itinerantUnitMeals?: ItinerantUnitMealBreak[];
  transportPolicy?: {
    arrival: TransportGroupingPolicy;
    departure: TransportGroupingPolicy;
  };
}

export interface TransportGroupingPolicy {
  taskIds: string[];
  /** Preferred deterministic contiguous group size. When absent, direction defaults apply. */
  targetGroupSize?: number;
  /** @deprecated Compatibility field only; transport has no independent hard minimum. */
  minimumGroupSize: number;
  maximumGroupSize: number;
  minGapMinutes: Minute;
  groupingWeight: number;
}

export interface ItinerantUnitMealBreak { id:string; itinerantUnitId:string; interval:Window }
export interface ScheduledItinerantUnitMeal { id:string; itinerantUnitId:string; start:Minute; end:Minute; duration:Minute }

export interface ResourceMealBreak { id:string; sourceTaskId:string; resourceIds:string[]; interval:Window; status:"pending"|"interrupted"|"done"|"in_progress" }
export interface ScheduledResourceMeal { id:string; sourceTaskId:string; resourceIds:string[]; start:Minute; end:Minute; duration:Minute }

/** One flexible operational pause. Physical resources keep this identity across recomposition. */
export interface OperationalMealPolicy {
  id: string;
  window: Window;
  duration: Minute;
  resourceIds: string[];
  spaceIds: string[];
}

export interface ScheduledOperationalMeal {
  id: string;
  resourceIds: string[];
  spaceIds: string[];
  duration: Minute;
  start: Minute;
  end: Minute;
}

export interface ParticipantMealObligation {
  id: string;
  sourceTaskId: string;
  participantId: string;
  duration: Minute;
  window: Window;
  status: "pending" | "interrupted" | "done" | "in_progress";
  /** Canonical predecessor identities; may reference tasks or other participant-meal sourceTaskIds. */
  dependencies?: string[];
  fixedInterval?: Window;
}

export interface ScheduledParticipantMeal {
  id: string;
  sourceTaskId: string;
  participantId: string;
  duration: Minute;
  start: Minute;
  end: Minute;
}

export type ScheduledTask = Task & {
  start: Minute;
  end: Minute;
};
export interface ScheduledSetupPreparation { id:string; kind:"setup-preparation"; spaceId:string; setupFamilyId:string; entryIndex:number; duration:number; start:Minute; end:Minute }
export interface ScheduledRoundPreparation { id:string; kind:"round-preparation"; synchronizationId:string; spaceId:string; roundIndex:number; duration:Minute; start:Minute; end:Minute }
export interface ScheduledSpaceMeal { id:string; kind:"space-meal"; spaceId:string; entryIndex:number; duration:Minute; start:Minute; end:Minute }

export interface ValidationSummary {
  hardValid: boolean;
  dependencyViolationCount: number;
  overlapViolationCount: number;
  transitionViolationCount: number;
  availabilityViolationCount: number;
  taskAvailabilityViolationCount: number;
  blockViolationCount: number;
  resourceAvailabilityViolationCount: number;
  resourceOverlapViolationCount: number;
  resourceTransitionViolationCount: number;
  secondaryContinuityViolationCount: number;
  setupViolationCount: number;
  setupPreparationViolationCount: number;
  roundSynchronizationViolationCount?: number;
  roundPreparationViolationCount?: number;
  jointGroupViolationCount: number;
  transportGroupingViolationCount?: number;
  technicalOperationViolationCount: number;
  technicalChainViolationCount: number;
  spaceMealViolationCount: number;
  mainFlowMealViolationCount: number;
  anchoredAccompanimentViolationCount: number;
  participantMealViolationCount: number;
  resourceMealViolationCount: number;
  operationalMealViolationCount?: number;
  itinerantUnitMealViolationCount: number;
  reasonCodes: string[];
}

export type SearchStopReason =
  | "SOLUTION_FOUND"
  | "PREFLIGHT_FAILED"
  | "NO_COMPLETE_HARD_VALID_PLAN"
  | "PATTERN_BUDGET_EXHAUSTED"
  | "BRANCH_BUDGET_EXHAUSTED"
  | "BACKTRACK_BUDGET_EXHAUSTED"
  | "AUXILIARY_BRANCH_BUDGET_EXHAUSTED"
  | "SECONDARY_BLOCK_BRANCH_BUDGET_EXHAUSTED"
  | "FUTURE_FEASIBILITY_BRANCH_BUDGET_EXHAUSTED";

export interface PlanMetrics extends ValidationSummary {
  complete: boolean;
  plannedTaskCount: number;
  unplannedTaskCount: number;
  mainFlowStart: Minute | null;
  mainFlowEnd: Minute | null;
  mainFlowGapMinutes: number;
  mainFlowMealStart: Minute | null;
  mainFlowMealEnd: Minute | null;
  mainFlowMorningTaskCount: number;
  mainFlowAfternoonTaskCount: number;
  mainFlowSelectedSplitIndex: number | null;
  mainFlowTimelineCandidateCount: number;
  mainFlowAllMorningAlternativeCount: number;
  mainFlowSplitAlternativeCount: number;
  blockSequence: string[];
  blockCountByKey: Record<string, number>;
  participantPresenceMinutesById: Record<string, number>;
  totalParticipantPresenceMinutes: number;
  maxParticipantPresenceMinutes: number;
  resourcePresenceMinutesById: Record<string, number>;
  resourceInternalGapMinutesById: Record<string, number>;
  resourceOperationalBlockCountById: Record<string, number>;
  resourceAuthorizedMealMinutesById: Record<string, number>;
  resourceMoveCountById: Record<string, number>;
  resourceTransitionSlackMinutesById: Record<string, number>;
  totalResourcePresenceMinutes: number;
  maxResourcePresenceMinutes: number;
  alternativesGenerated: number;
  alternativesRetained: number;
  branchesExplored: number;
  backtracks: number;
  patternsGenerated: number;
  patternsEvaluated: number;
  branchBudgetConsumed: number;
  feederClosureFallbackUsed: boolean;
  feederClosureBranchesExplored: number;
  feederClosureCompleteCandidateCount: number;
  feederClosureMaximumPartialStates: number;
  feederClosureSelectedOrder: string[];
  feederClosureZeroAlternativeTaskIds: string[];
  feederClosureRejectedStateBlockerIds: string[];
  searchStopReason: SearchStopReason;
  runtimeMs: number;
  planFingerprint: string;
  auxiliaryTaskCount: number;
  auxiliaryPlannedTaskCount: number;
  auxiliaryBranchesExplored: number;
  auxiliarySelectionOrder: string[];
  auxiliaryCandidateCountWhenSelectedByTaskId: Record<string, number>;
  saturatedResourceWindowBlockCount: number;
  saturatedResourceWindowBlockPlannedCount: number;
  saturatedResourceWindowBlockBranchesExplored: number;
  saturatedResourceWindowBlockCandidateCountByKey: Record<string, number>;
  saturatedResourceWindowBlockTaskIdsByKey: Record<string, string[]>;
  saturatedResourceWindowBlockResourceIdsByKey: Record<string, string[]>;
  saturatedResourceWindowBlockStartByKey: Record<string, Minute>;
  saturatedResourceWindowBlockEndByKey: Record<string, Minute>;
  saturatedResourceWindowBlockSelectedOrderByKey: Record<string, string[]>;
  secondaryBlockBranchesExplored: number;
  futureFeasibilityChecks: number;
  futureFeasibilityBranchesExplored: number;
  futureInfeasibleCandidatesPruned: number;
  futureTopRankedCandidatesPruned: number;
  futureBlockerCountByWorkItemKey: Record<string, number>;
  acceptedPathMinimumFutureAlternativeCount: number;
  auxiliaryWorkItemSelectionOrder: string[];
  secondaryBlockCandidateCountWhenSelectedBySpaceId: Record<string, number>;
  secondarySpaceStartById: Record<string, Minute | null>;
  secondarySpaceEndById: Record<string, Minute | null>;
  secondarySpaceGapMinutesById: Record<string, number>;
  secondarySpaceBlockCountById: Record<string, number>;
  setupFamilySequenceBySpaceId: Record<string, string[]>;
  setupBlockCountBySpaceAndFamily: Record<string, number>;
  setupSwitchCountBySpaceId: Record<string, number>;
  setupPreparationCount: number;
  setupPreparationMinutesBySpaceId: Record<string, number>;
  setupPreparationCountBySpaceAndFamily: Record<string, number>;
  setupPreparationSequenceBySpaceId: Record<string, string[]>;
  jointGroupCount: number;
  jointScheduledTaskCount: number;
  jointGroupCandidateCountWhenSelectedById: Record<string, number>;
  jointGroupStartById: Record<string, Minute | null>;
  jointGroupEndById: Record<string, Minute | null>;
  jointGroupParticipantIdsById: Record<string, string[]>;
  technicalOperationCount: number;
  technicalOperationPlannedCount: number;
  technicalOperationCandidateCountWhenSelectedById: Record<string, number>;
  technicalOperationStartById: Record<string, Minute | null>;
  technicalOperationEndById: Record<string, Minute | null>;
  technicalChainCount: number;
  technicalChainPlannedCount: number;
  technicalChainScheduledTaskCount: number;
  technicalChainCandidateCountWhenSelectedByRootId: Record<string, number>;
  technicalChainTaskIdsByRootId: Record<string, string[]>;
  technicalChainStartByRootId: Record<string, Minute | null>;
  technicalChainEndByRootId: Record<string, Minute | null>;
  technicalChainBranchesExplored: number;
  spaceMealCount:number; spaceMealPlannedCount:number; spaceMealCandidateCountWhenSelectedBySpaceId:Record<string,number>; spaceMealStartBySpaceId:Record<string,Minute>; spaceMealEndBySpaceId:Record<string,Minute>; spaceMealMinutesBySpaceId:Record<string,number>; spaceMealBranchesExplored:number;
  anchoredAccompanimentCount:number; anchoredAccompanimentPlannedCount:number; anchoredAccompanimentScheduledSegmentCount:number; anchoredAccompanimentCandidatePositionsEvaluated:number; anchoredAccompanimentRejectedPositionCount:number;
  anchoredAccompanimentAnchorTaskIdById:Record<string,string>; anchoredAccompanimentBeforeTaskIdsById:Record<string,string[]>; anchoredAccompanimentAfterTaskIdsById:Record<string,string[]>;
  anchoredAccompanimentOperationStartById:Record<string,Minute|null>; anchoredAccompanimentAnchorStartById:Record<string,Minute|null>; anchoredAccompanimentAnchorEndById:Record<string,Minute|null>; anchoredAccompanimentOperationEndById:Record<string,Minute|null>; anchoredAccompanimentTotalDurationById:Record<string,number>;
  anchoredAccompanimentAdjacencySatisfiedById:Record<string,boolean>; anchoredAccompanimentParticipantSatisfiedById:Record<string,boolean>; anchoredAccompanimentSpacesSatisfiedById:Record<string,boolean>; anchoredAccompanimentResourcesSatisfiedById:Record<string,boolean>; anchoredAccompanimentTaskWindowsSatisfiedById:Record<string,boolean>; anchoredAccompanimentCompleteById:Record<string,boolean>; anchoredAccompanimentRejectedReasonCountByCode:Record<string,number>;
  participantMealCount: number; participantMealPlannedCount: number; participantMealProtectedCount: number; participantMealCandidateCount: number; participantMealBranchesExplored: number; participantMealFutureFeasibilityChecks: number; participantMealFutureInfeasibleBranches: number; participantMealMaximumSimultaneous: number; participantMealCapacityLimit: number; participantMealStartByTaskId: Record<string,Minute>; participantMealEndByTaskId: Record<string,Minute>; participantMealRejectedReasonCountByCode: Record<string,number>;
  participantMealBlockingTaskIds: string[]; participantMealAcceptedWitnessFingerprint: string|null;
}

export interface PlanResult {
  complete: boolean;
  scheduledTasks: ScheduledTask[];
  scheduledSetupPreparations: ScheduledSetupPreparation[];
  scheduledRoundPreparations: ScheduledRoundPreparation[];
  scheduledSpaceMeals: ScheduledSpaceMeal[];
  scheduledParticipantMeals: ScheduledParticipantMeal[];
  scheduledResourceMeals: ScheduledResourceMeal[];
  scheduledOperationalMeals?: ScheduledOperationalMeal[];
  scheduledItinerantUnitMeals: ScheduledItinerantUnitMeal[];
  metrics: PlanMetrics;
}
