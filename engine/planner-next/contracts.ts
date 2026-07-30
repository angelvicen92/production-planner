export type Minute = number;

export interface Window {
  start: Minute;
  end: Minute;
}

export interface Person {
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
export interface SetupPolicy { familyOrder: string[]; reentry: "FORBIDDEN"; preparationMinutesByFamily?: Record<string, number> }

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
}

export interface PlannerNextProblem {
  day: Window;
  protectedMeal: Window;
  spaces: Space[];
  resources: Resource[];
  participants: Person[];
  coaches: Person[];
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
  budget: SearchBudget;
  auxiliaryPolicy?: { participantPresencePreference: PreferenceLevel };
  anchoredAccompaniments?: AnchoredAccompaniment[];
}

export type ScheduledTask = Task & {
  start: Minute;
  end: Minute;
};
export interface ScheduledSetupPreparation { id:string; kind:"setup-preparation"; spaceId:string; setupFamilyId:string; entryIndex:number; duration:number; start:Minute; end:Minute }
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
  jointGroupViolationCount: number;
  technicalOperationViolationCount: number;
  technicalChainViolationCount: number;
  spaceMealViolationCount: number;
  mainFlowMealViolationCount: number;
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
}

export interface PlanResult {
  complete: boolean;
  scheduledTasks: ScheduledTask[];
  scheduledSetupPreparations: ScheduledSetupPreparation[];
  scheduledSpaceMeals: ScheduledSpaceMeal[];
  metrics: PlanMetrics;
}
