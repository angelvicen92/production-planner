import type { EngineInput, LockInput, PlanResourceItemInput, TaskInput, TimeWindow } from "../types";
export type { CognitiveState } from "./cognitive/cognitiveState";
export type { OperationalCriticality } from "./understanding/operationalCriticality";

export type ORCJsonPrimitive = string | number | boolean | null;
export type ORCJsonValue = ORCJsonPrimitive | ReadonlyArray<ORCJsonValue> | { readonly [key: string]: ORCJsonValue };
export type ORCRecord = Record<string, unknown>;

export interface Evidence {
  id: string;
  source: string;
  kind: string;
  subjectId?: string | number | null;
  data: ORCRecord;
  createdAt?: string | null;
}


export interface LearnedSearchPattern {
  patternId: string;
  observations: number;
  averageScore: number;
  lastScore: number;
  explanation: string;
}

export interface OnlineSearchMemory {
  patterns: LearnedSearchPattern[];
}

export interface TranspositionEvidenceData extends ORCRecord {
  branchId: string;
  signature: string;
  equivalenceDetected: boolean;
  originalBranchId: string;
  knownScore: number | null;
  visits: number;
  registeredBestScore?: number | null;
  registeredBestBranchId?: string | null;
}

export interface DominancePruningEvidenceData extends ORCRecord {
  branchId: string;
  signature: string;
  dominantBranchId: string | null;
  dominantScore: number | null;
  candidateScore: number | null;
  pruned: boolean;
  visits: number;
  reason: string;
  evidenceComplete: boolean;
  exactDominance: boolean;
}

export interface ProductionObjectiveScore {
  readonly overallScore: number;
  readonly continuityScore: number;
  readonly availabilityScore: number;
  readonly criticalResourceScore: number;
  readonly waitingTimeScore: number;
  readonly replanningImpactScore: number;
  readonly operationalFeasibilityScore: number;
}

export interface OperationalValue {
  readonly simulatedStateId: string;
  readonly continuity: number;
  readonly makespan: number;
  readonly permanence: number;
  readonly compaction: number;
  readonly resourcePressure: number;
  readonly robustness: number;
  readonly stability: number;
  readonly futureFreedom: number;
  readonly overallScore: number;
  readonly productionObjectiveScore?: ProductionObjectiveScore;
  readonly breakdown: ORCRecord;
  readonly evaluatedAt: string | null;
  readonly evidenceIds: ReadonlyArray<string>;
  readonly metadata: ORCRecord;
}

export interface CandidateLifecycleState {
  status: "draft" | "valid" | "invalid" | "committed" | "rejected";
  reason?: string | null;
  evidenceIds: string[];
  metadata: ORCRecord;
}

export type PlannedTransformationKind =
  | "MOVE_CHAIN"
  | "REORDER_REGION"
  | "REASSIGN_RESOURCE"
  | "COMPACT_REGION"
  | "SCHEDULE_PENDING";

export interface PlannedTransformation {
  readonly kind: PlannedTransformationKind;
  readonly reason: string;
}

export interface CandidateTransformation {
  readonly kind: PlannedTransformationKind;
  readonly reason: string;
  readonly taskIds: ReadonlyArray<number>;
  readonly coordinationRole: "primary" | "supporting" | "protective";
}

export type CandidateStrategyType =
  | "close_gap"
  | "compact_resource"
  | "advance_chain"
  | "reduce_wait"
  | "relieve_pressure"
  | "protect_main_flow";

export interface CandidateStrategy {
  readonly strategyId: string;
  readonly variantId?: string;
  readonly variantIndex?: number;
  readonly variantReason?: string;
  readonly parentStrategy?: string;
  readonly strategyType: CandidateStrategyType;
  readonly originOpportunity: string;
  readonly expectedOperationalImpact: number;
  readonly transformations: ReadonlyArray<CandidateTransformation>;
  readonly generationReason: string;
}

export interface CandidateState {
  readonly id: string;
  readonly candidateId: string;
  readonly strategy: string;
  readonly originOpportunity: string | null;
  readonly plannedTransformations: ReadonlyArray<PlannedTransformation>;
  readonly estimatedImpact: ORCJsonValue;
  readonly estimatedCost: ORCJsonValue;
  readonly confidence: number;
  readonly sourceAssignments: ReadonlyArray<Candidate["assignments"][number]>;
}

export interface CandidateAssignment {
  taskId: number;
  startPlanned?: string | null;
  endPlanned?: string | null;
  spaceId?: number | null;
  resourceIds: number[];
}

export interface PreselectedCandidate {
  candidateId: string;
  preselectionScore: number;
  accepted: boolean;
  rejectionReason?: string;
}

export interface Candidate {
  id: string;
  state: CandidateLifecycleState;
  assignments: CandidateAssignment[];
  operationalValues: OperationalValue[];
  evidenceIds: string[];
  metadata: ORCRecord;
}

export interface PartialPlan {
  readonly partialPlanId: string;
  readonly candidateIds: ReadonlyArray<string>;
  readonly compatibilityScore: number;
  readonly expectedOperationalImpact: number;
}

export interface GlobalSolution {
  readonly solutionId: string;
  readonly partialPlanIds: ReadonlyArray<string>;
  readonly compatibilityScore: number;
  readonly aggregatedEvaluationScore: number;
  readonly explanation: string;
}

export interface OptimizationIteration {
  readonly iteration: number;
  readonly appliedOperator: string;
  readonly previousScore: number;
  readonly newScore: number;
  readonly accepted: boolean;
}

export interface OptimizedGlobalSolution {
  readonly solution: GlobalSolution;
  readonly iterations: ReadonlyArray<OptimizationIteration>;
}

export interface ExplorationValue {
  searchSpaceId: string;
  expectedValue: number;
  confidence: number;
  explanation: string;
}

export interface AdaptiveSearchSpaceProfile {
  readonly opportunityId: string;
  readonly criticalityLevel: number;
  readonly propagationScore: number;
  readonly reasoningBudget: number;
  readonly maxDepth: number;
  readonly maxBreadth: number;
  readonly expectedExplorationValue: number;
}

export interface ReasoningBudgetProfile {
  readonly opportunityId: string;
  readonly criticalityLevel: number;
  readonly explorationBudget: number;
  readonly maxCandidates: number;
  readonly maxDepth: number;
  readonly maxSearchSpaceSize: number;
  readonly simulationBudget: number;
  readonly reason: string;
}

export interface SearchSpace {
  id: string;
  description?: string | null;
  taskIds: number[];
  candidates: Candidate[];
  explorationValue?: ExplorationValue;
  evidenceIds: string[];
  metadata: ORCRecord;
}

export interface OpportunityImpact {
  opportunityId: string;
  expectedImpact: number;
  confidence: number;
  explanation: string;
}

export interface OpportunityPropagation {
  readonly opportunityId: string;
  readonly propagationScore: number;
  readonly affectedResources: readonly string[];
  readonly affectedChains: readonly string[];
  readonly estimatedConflictReduction: number;
  readonly estimatedFreedomGain: number;
  readonly explanation: string;
}

export interface Opportunity {
  id: string;
  kind: string;
  description?: string | null;
  taskIds: number[];
  searchSpaceIds: string[];
  evidenceIds: string[];
  metadata: ORCRecord;
  opportunityImpact?: OpportunityImpact;
}

export interface SimulatedState {
  readonly id: string;
  readonly candidateStateId: string;
  readonly baseStateId: string;
  readonly operationalStateSnapshot: Readonly<OperationalState>;
  readonly appliedTransformations: ReadonlyArray<PlannedTransformation>;
  readonly simulationMode: "READ_ONLY_BASELINE" | "ASSIGNMENT_APPLICATION_SHADOW";
  readonly readOnly: true;
  readonly createdAt: string | null;
  readonly planningMaterialization?: {
    readonly source: "baseline_seed_preserved" | "candidate_transformations" | "none";
    readonly plannedTaskCount: number;
    readonly changedTaskCount: number;
    readonly warnings: readonly string[];
    readonly preservedAssignedSpaceCount?: number;
    readonly missingAssignedSpaceFieldCount?: number;
    readonly nullAssignedSpaceCount?: number;
    readonly assignedSpaceContractValid?: boolean;
    readonly materializationContractVersion?: "ORC-PLANNING-MATERIALIZATION-ID225";
    readonly readOnly?: true;
  };
}

export interface ValidationResult {
  readonly id: string;
  readonly simulatedStateId: string;
  readonly result: "VALID" | "INVALID";
  readonly violatedConstraints: ReadonlyArray<string>;
  readonly violationDetails: ReadonlyArray<ValidationViolationDetail>;
  readonly explanation: string;
  readonly validatedAt: string | null;
  readonly evidenceIds: ReadonlyArray<string>;
}

export type ValidationConstraintGroup = "structure" | "time" | "protected_tasks" | "locks" | "contestants_and_teams" | "resources" | "spaces" | "dependencies";

export interface ValidationViolationDetail {
  readonly code: string;
  readonly constraintGroup: ValidationConstraintGroup;
  readonly severity: "hard";
  readonly taskIds: readonly number[];
  readonly resourceIds: readonly number[];
  readonly spaceIds: readonly number[];
  readonly lockIds: readonly string[];
  readonly breakWindow: { readonly start: string; readonly end: string; readonly kind: string } | null;
  readonly timeWindow: { readonly start: string; readonly end: string } | null;
  readonly relatedTimeWindow: { readonly start: string; readonly end: string } | null;
  readonly message: string;
  readonly diagnosticHint: string;
  readonly taskLabels?: readonly string[];
  readonly spaceLabels?: readonly string[];
  readonly resourceLabels?: readonly string[];
  readonly roleLabels?: readonly string[];
  readonly spaceOccupancyModes?: readonly string[];
  readonly blocksSpaceFlags?: readonly boolean[];
  readonly readOnly: true;
}

export interface CommitDecision {
  readonly decision: "COMMIT" | "REJECT";
  readonly operationalValueId: string | null;
  readonly reason: string;
  readonly differences: ReadonlyArray<ORCRecord>;
  readonly evidenceId: string;
  readonly createdAt: string | null;
}

export interface CognitiveArtifacts {
  opportunities: Opportunity[];
  searchSpaces: SearchSpace[];
  candidates: Candidate[];
  candidateStates: CandidateState[];
  simulatedStates: SimulatedState[];
  validationResults: ValidationResult[];
  operationalValues: OperationalValue[];
  commitDecisions: CommitDecision[];
  evidence: Evidence[];
  metadata: ORCRecord;
}

export interface OperationalState {
  id: string;
  planId: number;
  workDay: TimeWindow | null;
  planning: Array<{
    taskId: number;
    startPlanned: string;
    endPlanned: string;
    assignedResourceIds: number[];
    spaceId?: number | null;
    zoneId?: number | null;
    seedSource?: "v4_planned_task" | "protected_existing_planning";
    operationalRole?: "productive_task" | "transport_arrival" | "transport_departure" | "meal_break_placeholder" | "arrival_placeholder" | "call_time_placeholder" | "space_break_placeholder" | "global_break_placeholder" | "non_operational_placeholder" | "unknown";
    blocksSpace?: boolean;
    countsAsWork?: boolean;
    countsForMainFlow?: boolean;
    countsForResourceLoad?: boolean;
    countsForTalentLoad?: boolean;
    allowsSpaceOverlap?: boolean;
    spaceOccupancyMode?: "exclusive" | "shared" | "non_blocking";
  }>;
  tasks: TaskInput[];
  resources: PlanResourceItemInput[];
  spaces: {
    parentById: Record<number, number | null>;
    nameById: Record<number, string>;
    capacityById: Record<number, number>;
    concurrencyById: Record<number, number>;
    exclusiveById: Record<number, boolean>;
    priorityById: Record<number, number>;
    zoneIdBySpaceId?: Record<number, number>;
    spaceIdsByZoneId?: Record<number, number[]>;
  };
  availability: {
    workDay: TimeWindow | null;
    meal: TimeWindow | null;
    mealWindow: TimeWindow | null;
    actualMeal: TimeWindow | null;
    globalHardBreaks: TimeWindow[];
    protectedBreaks: NonNullable<EngineInput["protectedBreaks"]>;
    contestantAvailabilityById: Record<number, TimeWindow>;
  };
  dependencies: Array<{ taskId: number; dependsOnTaskIds: number[]; dependsOnTemplateIds: number[] }>;
  locks: LockInput[];
  constraints: ORCRecord;
  operationalMetrics: ORCRecord;
  cognitive: CognitiveArtifacts;
  source: "EngineInput";
  schemaVersion: "ORC-SPEC-01";
}

export interface InitialDependencyNode { readonly taskId: number; readonly directPrerequisiteTaskIds: ReadonlyArray<number>; readonly transitivePrerequisiteTaskIds: ReadonlyArray<number>; readonly directDependentTaskIds: ReadonlyArray<number>; readonly transitiveDependentTaskIds: ReadonlyArray<number>; readonly totalCriticalPathMinutes: number; readonly unlockCount: number; readonly readOnly: true; }
export interface InitialDependencyGraph { readonly nodes: ReadonlyArray<InitialDependencyNode>; readonly totalUniqueDependencyEdgeCount: number; readonly blockingDependencyIssueCount: number; readonly dependencyCycleCount: number; readonly readOnly: true; }
export interface InitialContestantPressure { readonly contestantId: number; readonly slackMinutes: number | null; readonly workloadRatio: number | null; readonly readOnly: true; }
export interface InitialResourcePressure { readonly resourceId: number; readonly fixedRequiredTaskIds: ReadonlyArray<number>; readonly alternativeConsumerTaskIds: ReadonlyArray<number>; readonly scarcity: number; readonly readOnly: true; }
export interface InitialSpacePressure { readonly spaceId: number; readonly pendingTaskCount: number; readonly readOnly: true; }
export interface InitialZonePressure { readonly zoneId: number; readonly pendingTaskCount: number; readonly readOnly: true; }
export interface InitialItinerantTeamPressure { readonly teamId: number; readonly readOnly: true; }
export interface InitialMainFlowPressure { readonly mainFlowConfigured: boolean; readonly mainFlowProductiveTaskIds: ReadonlyArray<number>; readonly mainFlowProtectedDowntimeTaskIds: ReadonlyArray<number>; readonly mainFlowAnchorEligibleTaskIds: ReadonlyArray<number>; readonly readOnly: true; }
export interface InitialBottleneckRegion { readonly id: string; readonly kind: string; readonly relatedTaskIds: ReadonlyArray<number>; readonly confidence: number; readonly readOnly: true; }
export interface InitialAnchorPriorityKey { readonly blockingHardRiskRank: number; readonly futureInfeasibilityRiskRank: number; readonly knownSlackRank: number; readonly slackMinutes: number; readonly alternativeCount: number; readonly negativeWorkloadRatio: number; readonly negativeCriticalPathMinutes: number; readonly mainFlowPreferenceRank: number; readonly mainFlowFeederPreferenceRank: number; readonly negativeTaskSpecificResourceScarcity: number; readonly structuralPressureRank: number; readonly negativeUnlockCount: number; readonly futureFreedomRiskRank: number; readonly deterministicTaskId: number; }
export interface InitialConstructionAnchor { readonly anchorTaskId: number; readonly priorityKey: InitialAnchorPriorityKey; readonly cognitiveRole: "main_flow_anchor" | "main_flow_feeder" | "critical_non_main_anchor"; readonly readOnly: true; }
export interface InitialConstructionSearchSpace { readonly id: string; readonly anchorTaskId: number; readonly provisionalWindows: ReadonlyArray<ORCRecord>; readonly readOnly: true; }
export interface InitialConstructionMap { readonly version: string; readonly dependencyGraph: InitialDependencyGraph; readonly contestantPressure: ReadonlyArray<InitialContestantPressure>; readonly resourcePressure: ReadonlyArray<InitialResourcePressure>; readonly spacePressure: ReadonlyArray<InitialSpacePressure>; readonly zonePressure: ReadonlyArray<InitialZonePressure>; readonly mainFlowPressure: InitialMainFlowPressure; readonly bottleneckRegions: ReadonlyArray<InitialBottleneckRegion>; readonly readOnly: true; }
