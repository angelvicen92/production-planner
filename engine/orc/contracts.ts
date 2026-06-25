import type { EngineInput, EngineOutput, LockInput, PlanResourceItemInput, TaskInput, TimeWindow } from "../types";

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
  id: string;
  name: string;
  value: number | string | boolean | null;
  unit?: string | null;
  evidenceIds: string[];
  metadata: ORCRecord;
}

export interface CandidateState {
  status: "draft" | "valid" | "invalid" | "committed" | "rejected";
  reason?: string | null;
  evidenceIds: string[];
  metadata: ORCRecord;
}

export interface Candidate {
  id: string;
  state: CandidateState;
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
  id: string;
  candidateId: string;
  operationalStateId: string;
  plannedTasks: NonNullable<EngineOutput["plannedTasks"]>;
  metrics: ORCRecord;
  evidenceIds: string[];
  metadata: ORCRecord;
}

export interface ValidationResult {
  id: string;
  candidateId?: string | null;
  valid: boolean;
  severity: "info" | "warning" | "error";
  reasons: string[];
  evidenceIds: string[];
  metadata: ORCRecord;
}

export interface CommitDecision {
  id: string;
  candidateId?: string | null;
  decision: "commit" | "reject" | "defer";
  reason?: string | null;
  evidenceIds: string[];
  metadata: ORCRecord;
}

export interface CognitiveState {
  opportunities: Opportunity[];
  searchSpaces: SearchSpace[];
  candidates: Candidate[];
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
  cognitive: CognitiveState;
  source: "EngineInput";
  schemaVersion: "ORC-SPEC-01";
}
