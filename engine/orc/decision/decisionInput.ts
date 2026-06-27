import type { Candidate, Evidence } from "../contracts";
import { deepFreeze } from "../immutability";
import type { CandidateBuilderResult } from "../see/candidateBuilder";

export interface DecisionInput {
  candidates: Candidate[];
  evidence: Evidence[];
  metadata: {
    searchSpaces: number;
    opportunities: number;
  };
}

const DECISION_INPUT_SOURCE = "orc-decision-input";

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function countOriginOpportunities(candidates: Candidate[]): number {
  const opportunityIds = new Set<string>();
  for (const candidate of candidates) {
    const sourceOpportunityId = candidate.metadata.sourceOpportunityId;
    if (typeof sourceOpportunityId === "string" && sourceOpportunityId.trim().length > 0) {
      opportunityIds.add(sourceOpportunityId);
    }
  }
  return opportunityIds.size;
}

function buildInputEvidence(candidates: Candidate[], candidateResult: CandidateBuilderResult, searchSpaces: number, opportunities: number): Evidence {
  return deepFreeze({
    id: "evidence:orc-decision-input:contract:v1",
    source: DECISION_INPUT_SOURCE,
    kind: "decision-input-built",
    subjectId: "DecisionInput",
    createdAt: null,
    data: {
      candidateCount: candidates.length,
      searchSpaces,
      opportunities,
      metadata: cloneSerializable(candidateResult.summary),
      candidateIds: candidates.map((candidate) => candidate.id),
      evidenceIds: candidateResult.evidence.map((item) => item.id),
      contractVersion: "DecisionInput-v1",
      readOnly: true,
      mutatesOperationalState: false,
      commitsPlanning: false,
    },
  }) as Evidence;
}

export function buildDecisionInput(candidateResult: CandidateBuilderResult): DecisionInput {
  const candidates = cloneSerializable(candidateResult.candidates ?? []);
  const sourceEvidence = cloneSerializable(candidateResult.evidence ?? []);
  const searchSpaces = candidateResult.summary?.searchSpaceCount ?? 0;
  const opportunities = countOriginOpportunities(candidates);
  const evidence = [
    ...sourceEvidence,
    buildInputEvidence(candidates, candidateResult, searchSpaces, opportunities),
  ];

  return deepFreeze({
    candidates,
    evidence,
    metadata: {
      searchSpaces,
      opportunities,
    },
  }) as DecisionInput;
}
