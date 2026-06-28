import type { AdaptiveSearchSpaceProfile, Candidate, Evidence, Opportunity, OpportunityPropagation, ORCRecord, ReasoningBudgetProfile } from "../contracts";
import { deepFreeze } from "../immutability";
import type { DependencyChainOpportunityInfluence } from "./dependencyChainFlowOptimizer";
import type { OpportunityCostEstimate } from "./opportunityCostEstimator";
import type { RecoveryPotentialEstimate } from "./recoveryPotentialEstimator";

export type OperationalReasoningComponentName =
  | "operational-criticality"
  | "opportunity-propagation"
  | "dynamic-bottleneck"
  | "future-impact"
  | "dependency-chain-flow"
  | "opportunity-cost"
  | "recovery-potential";

export interface OperationalReasoningWeightConfig extends Partial<Record<OperationalReasoningComponentName, number>> {}

export interface OperationalReasoningScoreComponent extends ORCRecord {
  readonly name: OperationalReasoningComponentName;
  readonly value: number;
  readonly weight: number;
  readonly contribution: number;
  readonly explanation: string;
}

export interface OperationalReasoningScore extends ORCRecord {
  readonly subjectId: string;
  readonly subjectType: "opportunity" | "candidate";
  readonly score: number;
  readonly components: readonly OperationalReasoningScoreComponent[];
  readonly explanation: string;
  readonly deterministic: true;
  readonly readOnly: true;
}

export interface OperationalReasoningScoreResult {
  readonly scores: readonly OperationalReasoningScore[];
  readonly evidence: readonly Evidence[];
}

export interface OperationalReasoningScoreOptions {
  readonly opportunities?: readonly Opportunity[];
  readonly candidates?: readonly Candidate[];
  readonly reasoningBudgetProfiles?: readonly ReasoningBudgetProfile[];
  readonly adaptiveSearchSpaceProfiles?: readonly AdaptiveSearchSpaceProfile[];
  readonly opportunityPropagation?: readonly OpportunityPropagation[];
  readonly dependencyChainInfluences?: readonly DependencyChainOpportunityInfluence[];
  readonly opportunityCosts?: readonly OpportunityCostEstimate[];
  readonly recoveryPotentials?: readonly RecoveryPotentialEstimate[];
  readonly dynamicBottleneckImpacts?: readonly { readonly opportunityId: string; readonly priorityBoost?: number }[];
  readonly weights?: OperationalReasoningWeightConfig;
  readonly createdAt?: string | null;
}

const SOURCE = "orc-operational-reasoning-score";
const DEFAULT_WEIGHTS: Record<OperationalReasoningComponentName, number> = {
  "operational-criticality": 0.24,
  "opportunity-propagation": 0.18,
  "dynamic-bottleneck": 0.1,
  "future-impact": 0.14,
  "dependency-chain-flow": 0.12,
  "opportunity-cost": 0.1,
  "recovery-potential": 0.12,
};
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const stringValue = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
const byId = <T, K extends keyof T>(items: readonly T[], key: K): ReadonlyMap<string, T> => new Map(items.map((item) => [String(item[key]), item]));

function component(name: OperationalReasoningComponentName, value: number, weights: OperationalReasoningWeightConfig, explanation: string): OperationalReasoningScoreComponent {
  const weight = finite(weights[name], DEFAULT_WEIGHTS[name]);
  const normalized = clamp01(value);
  return deepFreeze({ name, value: round(normalized), weight: round(weight), contribution: round(normalized * weight), explanation }) as OperationalReasoningScoreComponent;
}

function compose(subjectId: string, subjectType: OperationalReasoningScore["subjectType"], components: readonly OperationalReasoningScoreComponent[]): OperationalReasoningScore {
  const totalWeight = components.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  const score = totalWeight <= 0 ? 0 : round(components.reduce((sum, item) => sum + item.contribution, 0) / totalWeight);
  const explanation = `${subjectType} ${subjectId} ORS ${score} from ${components.map((item) => `${item.name}=${item.value}`).join(", ")}.`;
  return deepFreeze({ subjectId, subjectType, score, components, explanation, deterministic: true, readOnly: true }) as OperationalReasoningScore;
}

function opportunityScore(opportunity: Opportunity, options: OperationalReasoningScoreOptions, maps: ReturnType<typeof buildMaps>): OperationalReasoningScore {
  const profile = maps.profile.get(opportunity.id);
  const adaptive = maps.adaptive.get(opportunity.id);
  const propagation = maps.propagation.get(opportunity.id);
  const chain = maps.chain.get(opportunity.id);
  const bottleneck = maps.bottleneck.get(opportunity.id);
  const impact = opportunity.opportunityImpact;
  return compose(opportunity.id, "opportunity", [
    component("operational-criticality", finite(profile?.criticalityLevel, finite(adaptive?.criticalityLevel)) / 3, options.weights ?? {}, "Normalized existing operational criticality level."),
    component("opportunity-propagation", finite(propagation?.propagationScore, finite(adaptive?.propagationScore)), options.weights ?? {}, "Existing opportunity propagation score."),
    component("dynamic-bottleneck", finite(bottleneck?.priorityBoost) / 10, options.weights ?? {}, "Existing dynamic bottleneck priority boost normalized without new heuristics."),
    component("future-impact", impact ? finite(impact.expectedImpact) * finite(impact.confidence, 1) : finite(opportunity.metadata?.priority) / 3, options.weights ?? {}, "Existing opportunity impact or priority metadata normalized."),
    component("dependency-chain-flow", finite(chain?.influenceScore), options.weights ?? {}, "Existing dependency-chain flow influence score."),
  ]);
}

function candidateOpportunityId(candidate: Candidate): string {
  return stringValue(candidate.metadata.sourceOpportunityId) ?? stringValue(candidate.metadata.originOpportunity) ?? stringValue((candidate.metadata.candidateStrategy as ORCRecord | undefined)?.originOpportunity) ?? "";
}

function candidateScore(candidate: Candidate, options: OperationalReasoningScoreOptions, maps: ReturnType<typeof buildMaps>, opportunityScores: ReadonlyMap<string, OperationalReasoningScore>): OperationalReasoningScore {
  const opportunityId = candidateOpportunityId(candidate);
  const profile = maps.profile.get(opportunityId);
  const adaptive = maps.adaptive.get(opportunityId);
  const propagation = maps.propagation.get(opportunityId);
  const base = opportunityScores.get(opportunityId)?.score;
  const cost = maps.cost.get(candidate.id)?.estimatedCost ?? 0;
  const recovery = maps.recovery.get(candidate.id)?.estimatedPotential ?? 0;
  return compose(candidate.id, "candidate", [
    component("operational-criticality", base ?? (finite(profile?.criticalityLevel, finite(adaptive?.criticalityLevel)) / 3), options.weights ?? {}, `Inherited ORS context from source opportunity ${opportunityId || "unknown"}.`),
    component("opportunity-propagation", finite(propagation?.propagationScore, finite(adaptive?.propagationScore)), options.weights ?? {}, "Existing source-opportunity propagation context."),
    component("future-impact", (finite(candidate.metadata.expectedOperationalImpact, finite((candidate.metadata.candidateStrategy as ORCRecord | undefined)?.expectedOperationalImpact)) / 5) + (finite(candidate.metadata.confidence) / 5), options.weights ?? {}, "Existing candidate expected impact and confidence metadata."),
    component("opportunity-cost", 1 - finite(cost), options.weights ?? {}, "Inverse of existing opportunity-cost estimate."),
    component("recovery-potential", finite(recovery), options.weights ?? {}, "Existing recovery-potential estimate."),
  ]);
}

function buildMaps(options: OperationalReasoningScoreOptions) {
  return {
    profile: byId(options.reasoningBudgetProfiles ?? [], "opportunityId"),
    adaptive: byId(options.adaptiveSearchSpaceProfiles ?? [], "opportunityId"),
    propagation: byId(options.opportunityPropagation ?? [], "opportunityId"),
    chain: byId(options.dependencyChainInfluences ?? [], "opportunityId"),
    cost: byId(options.opportunityCosts ?? [], "candidateId"),
    recovery: byId(options.recoveryPotentials ?? [], "candidateId"),
    bottleneck: byId(options.dynamicBottleneckImpacts ?? [], "opportunityId"),
  };
}

export function calculateOperationalReasoningScores(options: OperationalReasoningScoreOptions): OperationalReasoningScoreResult {
  const maps = buildMaps(options);
  const opportunities = [...(options.opportunities ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const opportunityScores = opportunities.map((opportunity) => opportunityScore(opportunity, options, maps));
  const opportunityById = byId(opportunityScores, "subjectId");
  const candidateScores = [...(options.candidates ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map((candidate) => candidateScore(candidate, options, maps, opportunityById));
  const scores = deepFreeze([...opportunityScores, ...candidateScores]) as readonly OperationalReasoningScore[];
  const evidence = scores.map((score) => deepFreeze({ id: `evidence:${SOURCE}:${score.subjectType}:${score.subjectId}`, source: SOURCE, kind: "operational-reasoning-score", subjectId: score.subjectId, createdAt: options.createdAt ?? null, data: { ...score, explanation: score.explanation, componentContributions: score.components, planningInfluence: "none", decisionEngineInfluence: "none" } }) as Evidence);
  return deepFreeze({ scores, evidence }) as OperationalReasoningScoreResult;
}

export function operationalReasoningScoreBySubjectId(scores: readonly OperationalReasoningScore[]): ReadonlyMap<string, OperationalReasoningScore> {
  return new Map(scores.map((score) => [score.subjectId, score]));
}
