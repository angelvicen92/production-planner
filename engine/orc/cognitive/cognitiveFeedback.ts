import type { Candidate, CognitiveState, Opportunity, SearchSpace } from "../contracts";
import { recordDiscardedCandidate, recordExhaustedSearchSpace, recordExploredOpportunity } from "./cognitiveState";

export interface CognitiveFeedbackStats {
  repeatedOpportunities: number;
  repeatedSearchSpaces: number;
  repeatedCandidates: number;
  potentialSavings: number;
}

const hasId = (ids: ReadonlyArray<string>, id: string | null | undefined): boolean => typeof id === "string" && ids.includes(id);

export function shouldSkipOpportunity(state: CognitiveState, opportunity: Pick<Opportunity, "id"> | string): boolean {
  const id = typeof opportunity === "string" ? opportunity : opportunity.id;
  return hasId(state.exploredOpportunityIds, id);
}

export function shouldSkipSearchSpace(state: CognitiveState, searchSpace: Pick<SearchSpace, "id"> | string): boolean {
  const id = typeof searchSpace === "string" ? searchSpace : searchSpace.id;
  return hasId(state.exhaustedSearchSpaceIds, id);
}

export function shouldSkipCandidate(state: CognitiveState, candidate: Pick<Candidate, "id"> | string): boolean {
  const id = typeof candidate === "string" ? candidate : candidate.id;
  return hasId(state.discardedCandidateIds, id);
}

export function registerExploration(state: CognitiveState, opportunity: Pick<Opportunity, "id"> | string): CognitiveState {
  const id = typeof opportunity === "string" ? opportunity : opportunity.id;
  return recordExploredOpportunity(state, id);
}

export function registerDiscard(state: CognitiveState, candidate: Pick<Candidate, "id"> | string): CognitiveState {
  const id = typeof candidate === "string" ? candidate : candidate.id;
  return recordDiscardedCandidate(state, id);
}

export function registerExhaustedSearchSpace(state: CognitiveState, searchSpace: Pick<SearchSpace, "id"> | string): CognitiveState {
  const id = typeof searchSpace === "string" ? searchSpace : searchSpace.id;
  return recordExhaustedSearchSpace(state, id);
}

export function createCognitiveFeedbackStats(partial: Partial<CognitiveFeedbackStats> = {}): CognitiveFeedbackStats {
  const repeatedOpportunities = partial.repeatedOpportunities ?? 0;
  const repeatedSearchSpaces = partial.repeatedSearchSpaces ?? 0;
  const repeatedCandidates = partial.repeatedCandidates ?? 0;
  return Object.freeze({
    repeatedOpportunities,
    repeatedSearchSpaces,
    repeatedCandidates,
    potentialSavings: partial.potentialSavings ?? repeatedOpportunities + repeatedSearchSpaces + repeatedCandidates,
  });
}
