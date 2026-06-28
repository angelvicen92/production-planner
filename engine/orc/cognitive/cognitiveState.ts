import type { OperationalCriticality } from "../understanding/operationalCriticality";
import type { OpportunityPropagation } from "../contracts";
import type { ReasoningBudget } from "./reasoningBudget";
import type { DecisionFeedbackLoop } from "../analysis/decisionFeedbackLoop";
import { createReasoningBudget, remainingBudget } from "./reasoningBudget";

export interface CognitiveState {
  exploredOpportunityIds: string[];
  exhaustedSearchSpaceIds: string[];
  discardedCandidateIds: string[];
  simulatedCandidateIds: string[];
  committedCandidateIds: string[];
  reasoningBudget: ReasoningBudget;
  decisionFeedbackLoop?: DecisionFeedbackLoop;
  temporaryKnowledge: Record<string, unknown>;
  operationalCriticality?: OperationalCriticality;
  opportunityPropagation?: readonly OpportunityPropagation[];
  confidence: number;
  createdAt: string | null;
}

export interface SessionMemory {
  cognitiveState: CognitiveState;
}

export type RemainingBudget = ReturnType<typeof remainingBudget>;

const uniqueAppend = (values: string[], id: string): string[] => (values.includes(id) ? [...values] : [...values, id]);

const cloneKnowledge = (temporaryKnowledge: Record<string, unknown>): Record<string, unknown> => ({ ...temporaryKnowledge });

const freezeCognitiveState = (state: CognitiveState): CognitiveState => {
  Object.freeze(state.exploredOpportunityIds);
  Object.freeze(state.exhaustedSearchSpaceIds);
  Object.freeze(state.discardedCandidateIds);
  Object.freeze(state.simulatedCandidateIds);
  Object.freeze(state.committedCandidateIds);
  Object.freeze(state.reasoningBudget);
  if (state.decisionFeedbackLoop != null) Object.freeze(state.decisionFeedbackLoop);
  Object.freeze(state.temporaryKnowledge);
  return Object.freeze(state);
};

export function createInitialCognitiveState(createdAt: string | null = null): CognitiveState {
  return freezeCognitiveState({
    exploredOpportunityIds: [],
    exhaustedSearchSpaceIds: [],
    discardedCandidateIds: [],
    simulatedCandidateIds: [],
    committedCandidateIds: [],
    reasoningBudget: createReasoningBudget(),
    temporaryKnowledge: {},
    confidence: 0,
    createdAt,
  });
}

export function createInitialSessionMemory(createdAt: string | null = null): SessionMemory {
  return Object.freeze({ cognitiveState: createInitialCognitiveState(createdAt) });
}

export function recordExploredOpportunity(state: CognitiveState, opportunityId: string): CognitiveState {
  return freezeCognitiveState({
    ...state,
    exploredOpportunityIds: uniqueAppend(state.exploredOpportunityIds, opportunityId),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
    reasoningBudget: createReasoningBudget(state.reasoningBudget),
  });
}

export function recordExhaustedSearchSpace(state: CognitiveState, searchSpaceId: string): CognitiveState {
  return freezeCognitiveState({
    ...state,
    exhaustedSearchSpaceIds: uniqueAppend(state.exhaustedSearchSpaceIds, searchSpaceId),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
    reasoningBudget: createReasoningBudget(state.reasoningBudget),
  });
}

export function recordDiscardedCandidate(state: CognitiveState, candidateId: string): CognitiveState {
  return freezeCognitiveState({
    ...state,
    discardedCandidateIds: uniqueAppend(state.discardedCandidateIds, candidateId),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
    reasoningBudget: createReasoningBudget(state.reasoningBudget),
  });
}

export function recordSimulatedCandidate(state: CognitiveState, candidateId: string): CognitiveState {
  return freezeCognitiveState({
    ...state,
    simulatedCandidateIds: uniqueAppend(state.simulatedCandidateIds, candidateId),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
    reasoningBudget: createReasoningBudget(state.reasoningBudget),
  });
}

export function recordObservedCommit(state: CognitiveState, candidateId: string): CognitiveState {
  return freezeCognitiveState({
    ...state,
    committedCandidateIds: uniqueAppend(state.committedCandidateIds, candidateId),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
    reasoningBudget: createReasoningBudget(state.reasoningBudget),
  });
}

export function updateDecisionFeedbackLoop(state: CognitiveState, decisionFeedbackLoop: DecisionFeedbackLoop): CognitiveState {
  return freezeCognitiveState({
    ...state,
    decisionFeedbackLoop,
    reasoningBudget: createReasoningBudget(state.reasoningBudget),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
  });
}

export function updateReasoningBudget(state: CognitiveState, reasoningBudget: ReasoningBudget): CognitiveState {
  return freezeCognitiveState({
    ...state,
    reasoningBudget: createReasoningBudget(reasoningBudget),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
  });
}

export function updateRemainingBudget(state: CognitiveState, _remainingBudget: Partial<RemainingBudget>): CognitiveState {
  return freezeCognitiveState({
    ...state,
    reasoningBudget: createReasoningBudget(state.reasoningBudget),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
  });
}
