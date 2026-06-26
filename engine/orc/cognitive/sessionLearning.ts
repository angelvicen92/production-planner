import type { Candidate, CandidateState, CognitiveState, OperationalValue, SearchSpace, SimulatedState, CommitDecision, ORCRecord } from "../contracts";
import { recordDiscardedCandidate, recordObservedCommit } from "./cognitiveState";
import { createReasoningBudget } from "./reasoningBudget";

export interface SessionKnowledge {
  learnedPatterns: string[];
  exhaustedRegions: string[];
  usefulCandidates: string[];
  discardedCandidates: string[];
  resolvedOpportunities: string[];
  unproductiveOpportunities: string[];
  repeatedlyUnproductiveTransformations: string[];
  evidence: ORCRecord[];
}

export interface EvaluationLearningInput {
  operationalValues?: readonly OperationalValue[];
  candidateStates?: readonly CandidateState[];
  simulatedStates?: readonly SimulatedState[];
  candidates?: readonly Candidate[];
  searchSpaces?: readonly SearchSpace[];
}

export interface RankingLearningInput {
  rankedOperationalValues?: readonly OperationalValue[];
  candidateStates?: readonly CandidateState[];
  simulatedStates?: readonly SimulatedState[];
}

export interface CommitLearningInput {
  commitDecisions?: readonly CommitDecision[];
  candidateStates?: readonly CandidateState[];
  simulatedStates?: readonly SimulatedState[];
  searchSpaces?: readonly SearchSpace[];
}

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.length > 0))].sort();
const appendUniqueSorted = (left: readonly string[], right: readonly string[]): string[] => uniqueSorted([...left, ...right]);

function cloneKnowledge(value: unknown): SessionKnowledge {
  const knowledge = (value ?? {}) as Partial<SessionKnowledge>;
  return {
    learnedPatterns: uniqueSorted(knowledge.learnedPatterns ?? []),
    exhaustedRegions: uniqueSorted(knowledge.exhaustedRegions ?? []),
    usefulCandidates: uniqueSorted(knowledge.usefulCandidates ?? []),
    discardedCandidates: uniqueSorted(knowledge.discardedCandidates ?? []),
    resolvedOpportunities: uniqueSorted(knowledge.resolvedOpportunities ?? []),
    unproductiveOpportunities: uniqueSorted(knowledge.unproductiveOpportunities ?? []),
    repeatedlyUnproductiveTransformations: uniqueSorted(knowledge.repeatedlyUnproductiveTransformations ?? []),
    evidence: [...(knowledge.evidence ?? [])].map((entry) => ({ ...entry })).sort((a, b) => String(a.kind ?? "").localeCompare(String(b.kind ?? "")) || String(a.subjectId ?? "").localeCompare(String(b.subjectId ?? ""))),
  };
}

export function getSessionKnowledge(state: CognitiveState): SessionKnowledge {
  return cloneKnowledge(state.temporaryKnowledge.sessionLearning);
}

export function getAdaptivePrioritySessionSignals(state: CognitiveState): Pick<SessionKnowledge, "learnedPatterns" | "exhaustedRegions" | "resolvedOpportunities" | "unproductiveOpportunities"> {
  const knowledge = getSessionKnowledge(state);
  return {
    learnedPatterns: knowledge.learnedPatterns,
    exhaustedRegions: knowledge.exhaustedRegions,
    resolvedOpportunities: knowledge.resolvedOpportunities,
    unproductiveOpportunities: knowledge.unproductiveOpportunities,
  };
}

function freezeState(state: CognitiveState): CognitiveState {
  Object.freeze(state.exploredOpportunityIds);
  Object.freeze(state.exhaustedSearchSpaceIds);
  Object.freeze(state.discardedCandidateIds);
  Object.freeze(state.simulatedCandidateIds);
  Object.freeze(state.committedCandidateIds);
  Object.freeze(state.reasoningBudget);
  Object.freeze(state.temporaryKnowledge);
  return Object.freeze(state);
}

function withSessionKnowledge(state: CognitiveState, knowledge: SessionKnowledge): CognitiveState {
  return freezeState({
    ...state,
    exploredOpportunityIds: [...state.exploredOpportunityIds],
    exhaustedSearchSpaceIds: [...state.exhaustedSearchSpaceIds],
    discardedCandidateIds: [...state.discardedCandidateIds],
    simulatedCandidateIds: [...state.simulatedCandidateIds],
    committedCandidateIds: [...state.committedCandidateIds],
    reasoningBudget: createReasoningBudget(state.reasoningBudget),
    temporaryKnowledge: { ...state.temporaryKnowledge, sessionLearning: cloneKnowledge(knowledge) },
  });
}

export function mergeSessionKnowledge(state: CognitiveState, partial: Partial<SessionKnowledge>): CognitiveState {
  const current = getSessionKnowledge(state);
  return withSessionKnowledge(state, {
    learnedPatterns: appendUniqueSorted(current.learnedPatterns, partial.learnedPatterns ?? []),
    exhaustedRegions: appendUniqueSorted(current.exhaustedRegions, partial.exhaustedRegions ?? []),
    usefulCandidates: appendUniqueSorted(current.usefulCandidates, partial.usefulCandidates ?? []),
    discardedCandidates: appendUniqueSorted(current.discardedCandidates, partial.discardedCandidates ?? []),
    resolvedOpportunities: appendUniqueSorted(current.resolvedOpportunities, partial.resolvedOpportunities ?? []),
    unproductiveOpportunities: appendUniqueSorted(current.unproductiveOpportunities, partial.unproductiveOpportunities ?? []),
    repeatedlyUnproductiveTransformations: appendUniqueSorted(current.repeatedlyUnproductiveTransformations, partial.repeatedlyUnproductiveTransformations ?? []),
    evidence: [...current.evidence, ...(partial.evidence ?? []).map((entry) => ({ ...entry }))],
  });
}

const stateBySimulatedId = (simulatedStates: readonly SimulatedState[] = []) => new Map(simulatedStates.map((state) => [state.id, state.candidateStateId]));
const candidateStateById = (candidateStates: readonly CandidateState[] = []) => new Map(candidateStates.map((state) => [state.id, state]));

function patternFor(candidateState: CandidateState | undefined): string[] {
  return uniqueSorted((candidateState?.plannedTransformations ?? []).map((transformation) => transformation.kind));
}

export function learnFromEvaluation(state: CognitiveState, input: EvaluationLearningInput = {}): CognitiveState {
  const simulatedToCandidateState = stateBySimulatedId(input.simulatedStates);
  const byCandidateState = candidateStateById(input.candidateStates);
  const evaluatedCandidateStateIds = uniqueSorted((input.operationalValues ?? []).map((value) => simulatedToCandidateState.get(value.simulatedStateId) ?? value.simulatedStateId));
  const evaluatedCandidateIds = uniqueSorted(evaluatedCandidateStateIds.map((id) => byCandidateState.get(id)?.candidateId ?? id));
  const allCandidateIds = uniqueSorted((input.candidates ?? []).map((candidate) => candidate.id));
  const discardedCandidateIds = allCandidateIds.filter((id) => !evaluatedCandidateIds.includes(id));
  const exhaustedRegions = uniqueSorted((input.searchSpaces ?? []).map((searchSpace) => searchSpace.id));
  const patterns = uniqueSorted(evaluatedCandidateStateIds.flatMap((id) => patternFor(byCandidateState.get(id))));
  const next = discardedCandidateIds.reduce((current, id) => recordDiscardedCandidate(current, id), state);
  return mergeSessionKnowledge(next, {
    learnedPatterns: patterns,
    exhaustedRegions,
    usefulCandidates: evaluatedCandidateIds,
    discardedCandidates: discardedCandidateIds,
    evidence: [{ kind: "session-learning:evaluation", usefulCount: evaluatedCandidateIds.length, discardedCount: discardedCandidateIds.length, exhaustedRegionCount: exhaustedRegions.length }],
  });
}

export function learnFromRanking(state: CognitiveState, input: RankingLearningInput = {}): CognitiveState {
  const simulatedToCandidateState = stateBySimulatedId(input.simulatedStates);
  const byCandidateState = candidateStateById(input.candidateStates);
  const rankedIds = uniqueSorted((input.rankedOperationalValues ?? []).map((value) => simulatedToCandidateState.get(value.simulatedStateId) ?? value.simulatedStateId));
  const candidateIds = uniqueSorted(rankedIds.map((id) => byCandidateState.get(id)?.candidateId ?? id));
  return mergeSessionKnowledge(state, {
    usefulCandidates: candidateIds,
    learnedPatterns: uniqueSorted(rankedIds.flatMap((id) => patternFor(byCandidateState.get(id)))),
    evidence: [{ kind: "session-learning:ranking", rankedCount: candidateIds.length, topCandidateId: candidateIds[0] ?? null }],
  });
}

export function learnFromCommit(state: CognitiveState, input: CommitLearningInput = {}): CognitiveState {
  const simulatedToCandidateState = stateBySimulatedId(input.simulatedStates);
  const byCandidateState = candidateStateById(input.candidateStates);
  const committedStateIds = uniqueSorted((input.commitDecisions ?? []).filter((decision) => decision.decision === "COMMIT" && decision.operationalValueId != null).map((decision) => simulatedToCandidateState.get(String(decision.operationalValueId)) ?? String(decision.operationalValueId)));
  const committedCandidateIds = uniqueSorted(committedStateIds.map((id) => byCandidateState.get(id)?.candidateId ?? id));
  const resolvedOpportunities = uniqueSorted(committedStateIds.map((id) => byCandidateState.get(id)?.originOpportunity ?? "").filter(Boolean));
  const allOpportunities = uniqueSorted((input.searchSpaces ?? []).flatMap((space) => space.metadata.opportunityId == null ? [] : [String(space.metadata.opportunityId)]));
  const unproductiveOpportunities = allOpportunities.filter((id) => !resolvedOpportunities.includes(id));
  const repeatedlyUnproductiveTransformations = uniqueSorted(committedStateIds.length === 0 ? (input.candidateStates ?? []).flatMap((candidateState) => patternFor(candidateState)) : []);
  const next = committedCandidateIds.reduce((current, id) => recordObservedCommit(current, id), state);
  return mergeSessionKnowledge(next, {
    usefulCandidates: committedCandidateIds,
    resolvedOpportunities,
    unproductiveOpportunities,
    repeatedlyUnproductiveTransformations,
    evidence: [{ kind: "session-learning:commit", committedCount: committedCandidateIds.length, resolvedOpportunityCount: resolvedOpportunities.length, unproductiveOpportunityCount: unproductiveOpportunities.length }],
  });
}
