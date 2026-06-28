import type { Evidence, ORCRecord } from "../contracts";
import { deepFreeze } from "../immutability";
import type { DependencyChainOpportunityInfluence } from "./dependencyChainFlowOptimizer";
import type { OperationalGoal } from "./operationalGoalBuilder";
import type { OperationalReasoningScore, OperationalReasoningScoreComponent } from "./operationalReasoningScore";

export type CommitmentSubjectType = "opportunity" | "candidate" | "operational-goal";

export interface CommitmentFactor extends ORCRecord {
  readonly name: string;
  readonly value: number;
  readonly weight: number;
  readonly contribution: number;
  readonly explanation: string;
}

export interface ProgressiveCommitmentDecision extends ORCRecord {
  readonly subjectId: string;
  readonly subjectType: CommitmentSubjectType;
  readonly commitmentScore: number;
  readonly stableDuringSearch: boolean;
  readonly stabilityReason: string;
  readonly factors: readonly CommitmentFactor[];
  readonly explorationRank: number;
  readonly reconsiderationAvoidance: "eligible" | "not-eligible";
  readonly reversibleUntilCommitEngine: true;
  readonly deterministic: true;
  readonly readOnly: true;
}

export interface ProgressiveCommitmentStrategyResult {
  readonly decisions: readonly ProgressiveCommitmentDecision[];
  readonly decisionsBySubjectId: ReadonlyMap<string, ProgressiveCommitmentDecision>;
  readonly stableSubjectIds: readonly string[];
  readonly reconsiderationsAvoidedEstimate: number;
  readonly evidence: readonly Evidence[];
  readonly deterministic: true;
  readonly readOnly: true;
}

export interface ProgressiveCommitmentStrategyOptions {
  readonly operationalReasoningScores?: readonly OperationalReasoningScore[];
  readonly operationalGoals?: readonly OperationalGoal[];
  readonly dependencyChainInfluences?: readonly DependencyChainOpportunityInfluence[];
  readonly createdAt?: string | null;
  readonly stableThreshold?: number;
}

const SOURCE = "orc-progressive-commitment-strategy";
const DEFAULT_STABLE_THRESHOLD = 0.68;
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

function scoreComponentValue(score: OperationalReasoningScore, name: OperationalReasoningScoreComponent["name"]): number {
  return finite(score.components.find((component) => component.name === name)?.value);
}

function factor(name: string, value: number, weight: number, explanation: string): CommitmentFactor {
  const normalized = clamp01(value);
  return deepFreeze({ name, value: round(normalized), weight: round(weight), contribution: round(normalized * weight), explanation }) as CommitmentFactor;
}

type ProgressiveCommitmentDecisionDraft = { readonly subjectId: string; readonly subjectType: CommitmentSubjectType; readonly commitmentScore: number; readonly stableDuringSearch: boolean; readonly stabilityReason: string; readonly factors: readonly CommitmentFactor[]; readonly rankSeed: number; readonly reconsiderationAvoidance: "eligible" | "not-eligible"; readonly reversibleUntilCommitEngine: true; readonly deterministic: true; readonly readOnly: true };

function composeDecision(subjectId: string, subjectType: CommitmentSubjectType, factors: readonly CommitmentFactor[], threshold: number, rankSeed: number): ProgressiveCommitmentDecisionDraft {
  const totalWeight = factors.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  const commitmentScore = totalWeight <= 0 ? 0 : round(factors.reduce((sum, item) => sum + item.contribution, 0) / totalWeight);
  const stableDuringSearch = commitmentScore >= threshold;
  const stabilityReason = stableDuringSearch
    ? `Commitment score ${commitmentScore} is at or above threshold ${threshold}; the decision is stable for search ordering only and remains reversible.`
    : `Commitment score ${commitmentScore} is below threshold ${threshold}; the decision remains fully reconsiderable during search.`;
  return deepFreeze({
    subjectId,
    subjectType,
    commitmentScore,
    stableDuringSearch,
    stabilityReason,
    factors,
    rankSeed,
    reconsiderationAvoidance: stableDuringSearch ? "eligible" : "not-eligible",
    reversibleUntilCommitEngine: true,
    deterministic: true,
    readOnly: true,
  }) as ProgressiveCommitmentDecisionDraft;
}

export function buildProgressiveCommitmentStrategy(options: ProgressiveCommitmentStrategyOptions): ProgressiveCommitmentStrategyResult {
  const threshold = clamp01(options.stableThreshold ?? DEFAULT_STABLE_THRESHOLD);
  const chain = new Map((options.dependencyChainInfluences ?? []).map((item) => [item.opportunityId, item]));
  const goalByOpportunity = new Map<string, OperationalGoal>();
  for (const goal of [...(options.operationalGoals ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const opportunityId of goal.opportunityIds) if (!goalByOpportunity.has(opportunityId)) goalByOpportunity.set(opportunityId, goal);
  }

  const scoreDecisions = [...(options.operationalReasoningScores ?? [])].sort((a, b) => a.subjectId.localeCompare(b.subjectId)).map((score) => {
    const dependencyStability = score.subjectType === "opportunity" ? finite(chain.get(score.subjectId)?.influenceScore) : scoreComponentValue(score, "opportunity-propagation");
    const robustness = (scoreComponentValue(score, "recovery-potential") || scoreComponentValue(score, "dynamic-bottleneck") || scoreComponentValue(score, "future-impact"));
    const costFreedom = scoreComponentValue(score, "opportunity-cost") || clamp01(score.score);
    const goal = goalByOpportunity.get(score.subjectId);
    return composeDecision(score.subjectId, score.subjectType, [
      factor("operational-reasoning-score", score.score, 0.34, "Existing ORS summarizes criticality, propagation, future impact and related SEE signals."),
      factor("dependency-chain-stability", dependencyStability, 0.2, "Existing Dependency Chain Flow/propagation signal estimates whether the decision anchors stable operational flow."),
      factor("estimated-robustness", robustness, 0.18, "Existing recovery, bottleneck or future-impact signal estimates robustness without introducing a new heuristic."),
      factor("opportunity-cost-freedom", costFreedom, 0.16, "Existing opportunity-cost inverse or ORS fallback estimates low regret and remaining freedom."),
      factor("operational-goal-coherence", goal ? goal.aggregateOperationalReasoningScore : 0, 0.12, "Existing Operational Goal association estimates coherence with the current search organization."),
    ], threshold, score.score);
  });

  const goalDecisions = [...(options.operationalGoals ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map((goal) => composeDecision(goal.id, "operational-goal", [
    factor("aggregate-operational-reasoning-score", goal.aggregateOperationalReasoningScore, 0.5, "Existing aggregate ORS for the Operational Goal."),
    factor("association-stability", Math.min(1, goal.associations.length / Math.max(1, goal.opportunityIds.length)), 0.25, "Existing goal associations are deterministic and complete for the grouped opportunities."),
    factor("useful-diversity", Math.min(1, goal.signature.length / 3), 0.25, "Existing goal signature diversity organizes exploration without changing planning."),
  ], threshold, goal.aggregateOperationalReasoningScore));

  const ranked: ProgressiveCommitmentDecisionDraft[] = [...scoreDecisions, ...goalDecisions].sort((a, b) => (b.commitmentScore - a.commitmentScore) || a.subjectType.localeCompare(b.subjectType) || a.subjectId.localeCompare(b.subjectId));
  const decisions = deepFreeze(ranked.map((decision, index) => deepFreeze({ ...decision, explorationRank: index + 1 }) as unknown as ProgressiveCommitmentDecision)) as readonly ProgressiveCommitmentDecision[];
  const stableSubjectIds = deepFreeze(decisions.filter((decision) => decision.stableDuringSearch).map((decision) => decision.subjectId).sort()) as readonly string[];
  const evidence = decisions.map((decision) => deepFreeze({
    id: `evidence:${SOURCE}:${decision.subjectType}:${decision.subjectId}`,
    source: SOURCE,
    kind: "progressive-commitment-score",
    subjectId: decision.subjectId,
    createdAt: options.createdAt ?? null,
    data: { ...decision, factors: decision.factors, reason: decision.stabilityReason, decisionsInfluenced: ["exploration-ordering", "stable-during-search", "reconsideration-avoidance"], planningInfluence: "none", decisionEngineInfluence: "none", commitEngineInfluence: "none" },
  }) as Evidence);

  return deepFreeze({ decisions, decisionsBySubjectId: new Map(decisions.map((decision) => [decision.subjectId, decision])), stableSubjectIds, reconsiderationsAvoidedEstimate: stableSubjectIds.length, evidence, deterministic: true, readOnly: true }) as ProgressiveCommitmentStrategyResult;
}
