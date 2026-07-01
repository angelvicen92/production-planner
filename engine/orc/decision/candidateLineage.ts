import type { Candidate, CandidateState, CommitDecision, OperationalValue, PartialPlan, SimulatedState } from "../contracts";

export interface CandidateLineageInput {
  readonly rawCandidateIds: ReadonlySet<string>;
  readonly decisionInputCandidates: readonly Candidate[];
  readonly candidateStates: readonly CandidateState[];
  readonly simulatedStates: readonly SimulatedState[];
  readonly operationalValues: readonly OperationalValue[];
  readonly commitDecisions: readonly CommitDecision[];
  readonly partialPlans?: readonly PartialPlan[];
  readonly rankedBestSimulatedStateId?: string | null;
}

export interface CandidateLineageResult {
  readonly rawCandidateIds: string[];
  readonly syntheticCandidateIds: string[];
  readonly partialPlanIds: string[];
  readonly candidateStateIds: string[];
  readonly simulatedStateIds: string[];
  readonly operationalValueIds: string[];
  readonly committedSimulatedStateIds: string[];
  readonly rankedBestSimulatedStateId: string | null;
  readonly selectedRawCandidateIds: string[];
  readonly readOnly: true;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").sort() : [];
}

function addAll(target: Set<string>, values: Iterable<string>): void {
  for (const value of values) target.add(value);
}

export function resolveCandidateLineage(input: CandidateLineageInput): CandidateLineageResult {
  const rawIds = new Set([...input.rawCandidateIds].filter((id) => id.length > 0));
  const partialPlanById = new Map((input.partialPlans ?? []).map((plan) => [plan.partialPlanId, plan]));
  const matchingSyntheticCandidateIds = new Set<string>();
  const matchingPartialPlanIds = new Set<string>();
  const selectedRawCandidateIds = new Set<string>();

  for (const candidate of input.decisionInputCandidates) {
    const metadataRawIds = stringArray(candidate.metadata.partialPlanCandidateIds).filter((id) => rawIds.has(id));
    const partialPlanId = typeof candidate.metadata.partialPlanId === "string" ? candidate.metadata.partialPlanId : null;
    const partialPlanRawIds = partialPlanId != null ? [...(partialPlanById.get(partialPlanId)?.candidateIds ?? [])].filter((id) => rawIds.has(id)) : [];
    const matchedRawIds = rawIds.has(candidate.id) ? [candidate.id] : [...metadataRawIds, ...partialPlanRawIds].sort();
    if (matchedRawIds.length === 0) continue;
    if (!rawIds.has(candidate.id)) matchingSyntheticCandidateIds.add(candidate.id);
    if (partialPlanId != null) matchingPartialPlanIds.add(partialPlanId);
    addAll(selectedRawCandidateIds, matchedRawIds);
  }

  for (const plan of input.partialPlans ?? []) {
    const matched = [...plan.candidateIds].filter((id) => rawIds.has(id));
    if (matched.length > 0) {
      matchingPartialPlanIds.add(plan.partialPlanId);
      matchingSyntheticCandidateIds.add(`candidate:${plan.partialPlanId}`);
      addAll(selectedRawCandidateIds, matched);
    }
  }

  const candidateStateIds = new Set<string>();
  for (const state of input.candidateStates) {
    if (rawIds.has(state.candidateId) || matchingSyntheticCandidateIds.has(state.candidateId)) candidateStateIds.add(state.id);
  }

  const simulatedStateIds = new Set(input.simulatedStates.filter((state) => candidateStateIds.has(state.candidateStateId)).map((state) => state.id));
  const operationalValueIds = new Set(input.operationalValues.filter((value) => simulatedStateIds.has(value.simulatedStateId)).map((value) => value.simulatedStateId));
  const committedSimulatedStateIds = new Set<string>();
  for (const decision of input.commitDecisions) {
    if (decision.decision !== "COMMIT" || decision.operationalValueId == null) continue;
    if (operationalValueIds.has(decision.operationalValueId) || simulatedStateIds.has(decision.operationalValueId)) committedSimulatedStateIds.add(decision.operationalValueId);
  }

  const rankedBest = input.rankedBestSimulatedStateId != null && simulatedStateIds.has(input.rankedBestSimulatedStateId) ? input.rankedBestSimulatedStateId : null;
  if (committedSimulatedStateIds.size === 0 && rankedBest == null && candidateStateIds.size === 0) selectedRawCandidateIds.clear();

  return {
    rawCandidateIds: [...rawIds].sort(),
    syntheticCandidateIds: [...matchingSyntheticCandidateIds].sort(),
    partialPlanIds: [...matchingPartialPlanIds].sort(),
    candidateStateIds: [...candidateStateIds].sort(),
    simulatedStateIds: [...simulatedStateIds].sort(),
    operationalValueIds: [...operationalValueIds].sort(),
    committedSimulatedStateIds: [...committedSimulatedStateIds].sort(),
    rankedBestSimulatedStateId: rankedBest,
    selectedRawCandidateIds: [...selectedRawCandidateIds].sort(),
    readOnly: true,
  };
}
