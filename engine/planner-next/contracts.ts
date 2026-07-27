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
}

export interface Task {
  id: string;
  kind: "main" | "vocal";
  participantId: string;
  coachId: string;
  duration: number;
  spaceId: string;
  dependencies: string[];
  blockKey?: string;
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
  reasonCodes: string[];
}

export type SearchStopReason =
  | "SOLUTION_FOUND"
  | "PREFLIGHT_FAILED"
  | "NO_COMPLETE_HARD_VALID_PLAN"
  | "PATTERN_BUDGET_EXHAUSTED"
  | "BRANCH_BUDGET_EXHAUSTED"
  | "BACKTRACK_BUDGET_EXHAUSTED";

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
}

export interface PlanResult {
  complete: boolean;
  scheduledTasks: ScheduledTask[];
  metrics: PlanMetrics;
}
