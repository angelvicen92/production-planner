import type { EngineInput, LockInput, PlanResourceItemInput, TaskInput, TimeWindow } from "../types";
export type { CognitiveState } from "./cognitive/cognitiveState";

export type ORCJsonPrimitive = string | number | boolean | null;
export type ORCJsonValue = ORCJsonPrimitive | ORCJsonValue[] | { [key: string]: ORCJsonValue };
export type ORCRecord = Record<string, ORCJsonValue>;

export interface Evidence {
  id: string;
  source: string;
  kind: string;
  subjectId?: string | number | null;
  data: ORCRecord;
  createdAt?: string | null;
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

export interface CandidateState {
  readonly id: string;
  readonly candidateId: string;
  readonly strategy: string;
  readonly originOpportunity: string | null;
  readonly plannedTransformations: ReadonlyArray<PlannedTransformation>;
  readonly estimatedImpact: ORCJsonValue;
  readonly estimatedCost: ORCJsonValue;
  readonly confidence: number;
}

export interface Candidate {
  id: string;
  state: CandidateLifecycleState;
  assignments: Array<{
    taskId: number;
    startPlanned?: string | null;
    endPlanned?: string | null;
    spaceId?: number | null;
    resourceIds: number[];
  }>;
  operationalValues: OperationalValue[];
  evidenceIds: string[];
  metadata: ORCRecord;
}

export interface SearchSpace {
  id: string;
  description?: string | null;
  taskIds: number[];
  candidates: Candidate[];
  evidenceIds: string[];
  metadata: ORCRecord;
}

export interface Opportunity {
  id: string;
  kind: string;
  description?: string | null;
  taskIds: number[];
  searchSpaceIds: string[];
  evidenceIds: string[];
  metadata: ORCRecord;
}

export interface SimulatedState {
  readonly id: string;
  readonly candidateStateId: string;
  readonly baseStateId: string;
  readonly operationalStateSnapshot: Readonly<OperationalState>;
  readonly appliedTransformations: ReadonlyArray<PlannedTransformation>;
  readonly simulationMode: "READ_ONLY_BASELINE";
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
