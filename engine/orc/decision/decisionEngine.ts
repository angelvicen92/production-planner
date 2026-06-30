import type { Candidate, Evidence, ORCRecord, PartialPlan } from "../contracts";
import { deepFreeze } from "../immutability";

export interface PartialPlanDecisionUnit {
  readonly partialPlan: PartialPlan;
  readonly candidates: Candidate[];
  readonly syntheticCandidate: Candidate;
}

export interface DecisionEnginePlanPreparation {
  readonly decisionUnits: PartialPlanDecisionUnit[];
  readonly candidates: Candidate[];
  readonly evidence: Evidence[];
  readonly summary: {
    readonly partialPlanCount: number;
    readonly candidateCount: number;
    readonly fallbackToCandidates: boolean;
  };
}

export interface DecisionEngineOptions {
  readonly createdAt?: string | null;
}

const SOURCE = "orc-decision-engine";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function numericMetadata(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function fallbackPartialPlan(candidate: Candidate): PartialPlan {
  return deepFreeze({
    partialPlanId: `partial-plan:fallback:${candidate.id}`,
    candidateIds: [candidate.id],
    compatibilityScore: 1,
    expectedOperationalImpact: numericMetadata(candidate.metadata.expectedOperationalImpact),
  }) as PartialPlan;
}

function mergeCandidateMetadata(plan: PartialPlan, candidates: readonly Candidate[], fallback: boolean): ORCRecord {
  const strategies = candidates.map((candidate) => candidate.metadata.strategy).filter((value): value is string => typeof value === "string");
  const sourceOpportunityIds = candidates.map((candidate) => candidate.metadata.sourceOpportunityId).filter((value): value is string => typeof value === "string");
  const baselinePreservation = candidates.length === 1 && candidates[0].metadata.baselinePreservation === true;
  return {
    ...(baselinePreservation ? candidates[0].metadata : {}),
    strategy: baselinePreservation ? "PRESERVE_BASELINE" : fallback && strategies.length === 1 ? strategies[0] : "PARTIAL_PLAN",
    sourceOpportunityId: sourceOpportunityIds.length === 1 ? sourceOpportunityIds[0] : null,
    partialPlanId: plan.partialPlanId,
    partialPlanCandidateIds: [...plan.candidateIds],
    partialPlanCompatibilityScore: plan.compatibilityScore,
    expectedOperationalImpact: plan.expectedOperationalImpact,
    evaluatesPartialPlan: true,
    fallbackToCandidate: fallback,
  };
}

function syntheticCandidateFor(plan: PartialPlan, candidates: readonly Candidate[], fallback: boolean): Candidate {
  return deepFreeze({
    id: `candidate:${plan.partialPlanId}`,
    state: { status: "draft", evidenceIds: [], metadata: { partialPlanId: plan.partialPlanId } },
    assignments: candidates.flatMap((candidate) => candidate.assignments.map((assignment) => ({ ...assignment, resourceIds: [...assignment.resourceIds] }))),
    operationalValues: [],
    evidenceIds: candidates.flatMap((candidate) => [...candidate.evidenceIds]),
    metadata: mergeCandidateMetadata(plan, candidates, fallback),
  }) as Candidate;
}

export function preparePartialPlanDecisionUnits(
  candidates: readonly Candidate[],
  partialPlans: readonly PartialPlan[] | undefined,
  options: DecisionEngineOptions = {},
): DecisionEnginePlanPreparation {
  const createdAt = options.createdAt ?? null;
  const candidatesById = new Map((candidates ?? []).map((candidate) => [candidate.id, clone(candidate)]));
  const sourcePlans = (partialPlans ?? []).length > 0
    ? [...(partialPlans ?? [])].map(clone)
    : [...(candidates ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map(fallbackPartialPlan);
  const fallbackToCandidates = (partialPlans ?? []).length === 0;

  const decisionUnits = sourcePlans
    .map((plan) => {
      const planCandidates = plan.candidateIds.map((candidateId) => candidatesById.get(candidateId)).filter((candidate): candidate is Candidate => candidate != null);
      return deepFreeze({ partialPlan: plan, candidates: planCandidates, syntheticCandidate: syntheticCandidateFor(plan, planCandidates, fallbackToCandidates) }) as PartialPlanDecisionUnit;
    })
    .filter((unit) => unit.candidates.length > 0)
    .sort((a, b) => a.partialPlan.partialPlanId.localeCompare(b.partialPlan.partialPlanId));

  const evidence = decisionUnits.map((unit, index) => deepFreeze({
    id: `evidence:${SOURCE}:partial-plan:${unit.partialPlan.partialPlanId}`,
    source: SOURCE,
    kind: "partial-plan-decision-unit-built",
    subjectId: unit.partialPlan.partialPlanId,
    createdAt,
    data: {
      position: index + 1,
      partialPlan: unit.partialPlan,
      candidateIds: [...unit.partialPlan.candidateIds],
      syntheticCandidateId: unit.syntheticCandidate.id,
      compatibilityScore: unit.partialPlan.compatibilityScore,
      expectedOperationalImpact: unit.partialPlan.expectedOperationalImpact,
      fallbackToCandidate: fallbackToCandidates,
      explanation: "Decision Engine evaluates the complete Partial Plan as one operational proposal in shadow mode.",
      readOnly: true,
      mutatesOperationalState: false,
      commitsPlanning: false,
    },
  }) as Evidence);

  return deepFreeze({
    decisionUnits,
    candidates: decisionUnits.map((unit) => unit.syntheticCandidate),
    evidence,
    summary: { partialPlanCount: decisionUnits.length, candidateCount: (candidates ?? []).length, fallbackToCandidates },
  }) as DecisionEnginePlanPreparation;
}
