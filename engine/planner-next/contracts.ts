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
}

export type SecondaryContinuity = "OFF" | "REQUIRED";

export type PreferenceLevel = "OFF" | "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";

export interface Resource {
  id: string;
  availability: Window[];
  presencePreference: PreferenceLevel;
  transitionMinutes?: number;
}

export interface Task {
  id: string;
  kind: "main" | "vocal" | "auxiliary";
  participantId: string;
  coachId?: string;
  duration: number;
  spaceId: string;
  dependencies: string[];
  blockKey?: string;
  requiredResourceIds?: string[];
}

export interface SearchBudget {
  bestK: number;
  maxBacktracks: number;
  maxPatterns: number;
  maxBranchExpansions: number;
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
}

export interface ScheduledTask extends Task {
  start: Minute;
  end: Minute;
}

export interface ValidationSummary {
  hardValid: boolean;
  dependencyViolationCount: number;
  overlapViolationCount: number;
  transitionViolationCount: number;
  availabilityViolationCount: number;
  blockViolationCount: number;
  resourceAvailabilityViolationCount: number;
  resourceOverlapViolationCount: number;
  resourceTransitionViolationCount: number;
  secondaryContinuityViolationCount: number;
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
  blockSequence: string[];
  blockCountByKey: Record<string, number>;
  participantPresenceMinutesById: Record<string, number>;
  totalParticipantPresenceMinutes: number;
  maxParticipantPresenceMinutes: number;
  resourcePresenceMinutesById: Record<string, number>;
  resourceInternalGapMinutesById: Record<string, number>;
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
  searchStopReason: SearchStopReason;
  runtimeMs: number;
  planFingerprint: string;
  auxiliaryTaskCount: number;
  auxiliaryPlannedTaskCount: number;
  auxiliaryBranchesExplored: number;
  auxiliarySelectionOrder: string[];
  auxiliaryCandidateCountWhenSelectedByTaskId: Record<string, number>;
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
}

export interface PlanResult {
  complete: boolean;
  scheduledTasks: ScheduledTask[];
  metrics: PlanMetrics;
}
