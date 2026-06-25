export interface CognitiveState {
  exploredOpportunityIds: string[];
  exhaustedSearchSpaceIds: string[];
  discardedCandidateIds: string[];
  simulatedCandidateIds: string[];
  committedCandidateIds: string[];
  remainingBudget: {
    opportunities: number;
    searchSpaces: number;
    candidates: number;
    simulations: number;
  };
  temporaryKnowledge: Record<string, unknown>;
  confidence: number;
  createdAt: string | null;
}

export interface SessionMemory {
  cognitiveState: CognitiveState;
}

export type RemainingBudget = CognitiveState["remainingBudget"];

const uniqueAppend = (values: string[], id: string): string[] => (values.includes(id) ? [...values] : [...values, id]);

const cloneKnowledge = (temporaryKnowledge: Record<string, unknown>): Record<string, unknown> => ({ ...temporaryKnowledge });

const freezeCognitiveState = (state: CognitiveState): CognitiveState => {
  Object.freeze(state.exploredOpportunityIds);
  Object.freeze(state.exhaustedSearchSpaceIds);
  Object.freeze(state.discardedCandidateIds);
  Object.freeze(state.simulatedCandidateIds);
  Object.freeze(state.committedCandidateIds);
  Object.freeze(state.remainingBudget);
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
    remainingBudget: {
      opportunities: 0,
      searchSpaces: 0,
      candidates: 0,
      simulations: 0,
    },
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
    remainingBudget: { ...state.remainingBudget },
  });
}

export function recordExhaustedSearchSpace(state: CognitiveState, searchSpaceId: string): CognitiveState {
  return freezeCognitiveState({
    ...state,
    exhaustedSearchSpaceIds: uniqueAppend(state.exhaustedSearchSpaceIds, searchSpaceId),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
    remainingBudget: { ...state.remainingBudget },
  });
}

export function recordDiscardedCandidate(state: CognitiveState, candidateId: string): CognitiveState {
  return freezeCognitiveState({
    ...state,
    discardedCandidateIds: uniqueAppend(state.discardedCandidateIds, candidateId),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
    remainingBudget: { ...state.remainingBudget },
  });
}

export function recordSimulatedCandidate(state: CognitiveState, candidateId: string): CognitiveState {
  return freezeCognitiveState({
    ...state,
    simulatedCandidateIds: uniqueAppend(state.simulatedCandidateIds, candidateId),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
    remainingBudget: { ...state.remainingBudget },
  });
}

export function recordObservedCommit(state: CognitiveState, candidateId: string): CognitiveState {
  return freezeCognitiveState({
    ...state,
    committedCandidateIds: uniqueAppend(state.committedCandidateIds, candidateId),
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
    remainingBudget: { ...state.remainingBudget },
  });
}

export function updateRemainingBudget(state: CognitiveState, remainingBudget: Partial<RemainingBudget>): CognitiveState {
  return freezeCognitiveState({
    ...state,
    remainingBudget: { ...state.remainingBudget, ...remainingBudget },
    temporaryKnowledge: cloneKnowledge(state.temporaryKnowledge),
  });
}
