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
}

export interface ValidationResult {
  readonly id: string;
  readonly simulatedStateId: string;
  readonly result: "VALID" | "INVALID";
  readonly violatedConstraints: ReadonlyArray<string>;
  readonly explanation: string;
  readonly validatedAt: string | null;
  readonly evidenceIds: ReadonlyArray<string>;
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
