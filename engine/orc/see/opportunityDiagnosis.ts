import type { CognitiveState, Evidence, OperationalState, Opportunity, ORCRecord } from "../contracts";

export interface OpportunityDiagnosis {
  opportunityId: string;
  primaryCause: string;
  contributingFactors: string[];
  affectedRegion: string;
  confidence: number;
  explanation: string;
}

export interface OpportunityDiagnosisResult {
  diagnoses: OpportunityDiagnosis[];
  evidence: Evidence[];
  summary: {
    diagnosed: number;
    averageConfidence: number;
  };
}

const asNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const asString = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

function factorsFor(opportunity: Opportunity, state: OperationalState, cognitiveState: CognitiveState): string[] {
  const factors = new Set<string>();
  const metadata = opportunity.metadata ?? {};
  for (const key of Object.keys(metadata).sort()) {
    const value = metadata[key];
    if (key === "cause" || key === "affectedRegion" || key === "priority" || key === "confidence") continue;
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    factors.add(`metadata:${key}`);
  }
  if ((opportunity.taskIds ?? []).length > 0) factors.add(`opportunity-task-count:${new Set(opportunity.taskIds).size}`);
  if ((state.locks ?? []).some((lock) => opportunity.taskIds.includes(Number(lock.taskId)))) factors.add("operational-state:affected-task-has-lock");
  if ((state.planning ?? []).some((item) => opportunity.taskIds.includes(Number(item.taskId)) && (item.assignedResourceIds ?? []).length > 0)) factors.add("operational-state:affected-task-has-resource-assignment");
  if (cognitiveState.exploredOpportunityIds.includes(opportunity.id)) factors.add("cognitive-state:opportunity-already-explored");
  const linkedSearchSpaceIds = [`orc-see:search-space:${opportunity.id}`, `orc-see:adaptive-search-space:${opportunity.id}:region-focus`, ...opportunity.searchSpaceIds];
  if (linkedSearchSpaceIds.some((id) => cognitiveState.exhaustedSearchSpaceIds.includes(id))) factors.add("cognitive-state:linked-search-space-exhausted");
  return [...factors].sort();
}

function diagnoseOpportunity(opportunity: Opportunity, state: OperationalState, cognitiveState: CognitiveState): OpportunityDiagnosis {
  const metadata = opportunity.metadata ?? {};
  const primaryCause = asString(metadata.cause) ?? opportunity.kind ?? "UNKNOWN_OPERATIONAL_CAUSE";
  const affectedRegion = asString(metadata.affectedRegion) ?? "operational-state";
  const contributingFactors = factorsFor(opportunity, state, cognitiveState);
  const metadataConfidence = asNumber(metadata.confidence);
  const confidence = round(Math.max(0, Math.min(1, (metadataConfidence ?? 0.7) + Math.min(0.2, contributingFactors.length * 0.025))));
  const explanation = `Opportunity ${opportunity.id} is diagnosed as ${primaryCause} in ${affectedRegion} using operational and cognitive state evidence only.`;
  return { opportunityId: opportunity.id, primaryCause, contributingFactors, affectedRegion, confidence, explanation };
}

function evidenceFor(diagnosis: OpportunityDiagnosis, opportunity: Opportunity): Evidence {
  const data: ORCRecord = {
    opportunityId: opportunity.id,
    opportunityKind: opportunity.kind,
    diagnosis,
    primaryCause: diagnosis.primaryCause,
    contributingFactors: diagnosis.contributingFactors,
    affectedRegion: diagnosis.affectedRegion,
    confidence: diagnosis.confidence,
    explanation: diagnosis.explanation,
    sourceEvidenceIds: [...(opportunity.evidenceIds ?? [])].sort(),
    readOnly: true,
    proposesSolution: false,
  };
  return {
    id: `evidence:orc-see:opportunity-diagnosis:${opportunity.id}`,
    source: "orc-see",
    kind: "opportunity-diagnosis-generated",
    subjectId: opportunity.id,
    createdAt: null,
    data,
  };
}

export function diagnoseOpportunities(
  opportunities: Opportunity[],
  operationalState: OperationalState,
  cognitiveState: CognitiveState,
): OpportunityDiagnosisResult {
  const diagnoses = [...(opportunities ?? [])].map((opportunity) => diagnoseOpportunity(opportunity, operationalState, cognitiveState));
  const byId = new Map((opportunities ?? []).map((opportunity) => [opportunity.id, opportunity]));
  const evidence = diagnoses.map((diagnosis) => evidenceFor(diagnosis, byId.get(diagnosis.opportunityId)!));
  const averageConfidence = diagnoses.length === 0 ? 0 : round(diagnoses.reduce((sum, diagnosis) => sum + diagnosis.confidence, 0) / diagnoses.length);
  return { diagnoses, evidence, summary: { diagnosed: diagnoses.length, averageConfidence } };
}
