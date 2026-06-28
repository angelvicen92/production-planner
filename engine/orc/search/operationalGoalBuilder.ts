import type { Evidence, Opportunity } from "../contracts";
import { deepFreeze } from "../immutability";
import type { DependencyChainOpportunityInfluence } from "./dependencyChainFlowOptimizer";
import type { OperationalReasoningScore } from "./operationalReasoningScore";

export interface OperationalGoalSignal {
  readonly name: string;
  readonly value: number;
}

export interface OperationalGoalOpportunityAssociation {
  readonly opportunityId: string;
  readonly operationalReasoningScore: number;
  readonly signals: readonly OperationalGoalSignal[];
  readonly explanation: string;
}

export interface OperationalGoal {
  readonly id: string;
  readonly signature: readonly string[];
  readonly opportunityIds: readonly string[];
  readonly aggregateOperationalReasoningScore: number;
  readonly associations: readonly OperationalGoalOpportunityAssociation[];
  readonly prioritizationExplanation: string;
  readonly deterministic: true;
  readonly readOnly: true;
}

export interface OperationalGoalBuilderResult {
  readonly goals: readonly OperationalGoal[];
  readonly opportunityGoalIdByOpportunityId: ReadonlyMap<string, string>;
  readonly evidence: readonly Evidence[];
}

export interface OperationalGoalBuilderOptions {
  readonly opportunities?: readonly Opportunity[];
  readonly operationalReasoningScores?: readonly OperationalReasoningScore[];
  readonly dependencyChainInfluences?: readonly DependencyChainOpportunityInfluence[];
  readonly createdAt?: string | null;
}

const SOURCE = "orc-operational-goal-builder";
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9:_-]/g, "-");
const signalName = (value: string): string => sanitize(value.toLowerCase());

function goalSignature(score: OperationalReasoningScore, chainInfluence: DependencyChainOpportunityInfluence | undefined): readonly string[] {
  const components = [...score.components]
    .filter((component) => component.value > 0)
    .sort((a, b) => (b.contribution - a.contribution) || a.name.localeCompare(b.name));
  const signature = components.slice(0, 2).map((component) => signalName(component.name));
  if (chainInfluence != null && chainInfluence.influenceScore > 0 && !signature.includes("dependency-chain-flow")) signature.push("dependency-chain-flow");
  return deepFreeze(signature.length > 0 ? signature.slice(0, 3) : ["baseline-operational-signal"]) as readonly string[];
}

export function buildOperationalGoals(options: OperationalGoalBuilderOptions): OperationalGoalBuilderResult {
  const opportunities = [...(options.opportunities ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const scores = new Map((options.operationalReasoningScores ?? []).filter((score) => score.subjectType === "opportunity").map((score) => [score.subjectId, score]));
  const chain = new Map((options.dependencyChainInfluences ?? []).map((item) => [item.opportunityId, item]));
  const buckets = new Map<string, OperationalGoalOpportunityAssociation[]>();

  for (const opportunity of opportunities) {
    const score = scores.get(opportunity.id);
    if (score == null) continue;
    const signature = goalSignature(score, chain.get(opportunity.id));
    const key = signature.join("+");
    const signals = score.components
      .filter((component) => component.value > 0)
      .sort((a, b) => (b.contribution - a.contribution) || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((component) => ({ name: signalName(component.name), value: round(component.value) }));
    const association = deepFreeze({
      opportunityId: opportunity.id,
      operationalReasoningScore: round(score.score),
      signals,
      explanation: `Opportunity ${opportunity.id} is associated by its dominant existing ORS signals: ${signature.join(", ")}.`,
    }) as OperationalGoalOpportunityAssociation;
    buckets.set(key, [...(buckets.get(key) ?? []), association]);
  }

  const goals = [...buckets.entries()].map(([key, associations]) => {
    const sortedAssociations = [...associations].sort((a, b) => (b.operationalReasoningScore - a.operationalReasoningScore) || a.opportunityId.localeCompare(b.opportunityId));
    const aggregate = sortedAssociations.length === 0 ? 0 : round(sortedAssociations.reduce((sum, item) => sum + item.operationalReasoningScore, 0) / sortedAssociations.length);
    const signature = key.split("+");
    const opportunityIds = sortedAssociations.map((item) => item.opportunityId);
    return deepFreeze({
      id: `orc-operational-goal:${sanitize(key)}`,
      signature,
      opportunityIds,
      aggregateOperationalReasoningScore: aggregate,
      associations: sortedAssociations,
      prioritizationExplanation: `Prioritized ${opportunityIds.length} opportunity/opportunities sharing existing signals ${signature.join(", ")} with aggregate ORS ${aggregate}.`,
      deterministic: true,
      readOnly: true,
    }) as OperationalGoal;
  }).sort((a, b) => (b.aggregateOperationalReasoningScore - a.aggregateOperationalReasoningScore) || a.id.localeCompare(b.id));

  const opportunityGoalIdByOpportunityId = new Map<string, string>();
  for (const goal of goals) for (const opportunityId of goal.opportunityIds) opportunityGoalIdByOpportunityId.set(opportunityId, goal.id);
  const evidence = goals.map((goal) => deepFreeze({
    id: `evidence:${SOURCE}:${goal.id}`,
    source: SOURCE,
    kind: "operational-goal-generated",
    subjectId: goal.id,
    createdAt: options.createdAt ?? null,
    data: { goal, generatedGoal: goal.id, opportunities: goal.opportunityIds, aggregateOperationalReasoningScore: goal.aggregateOperationalReasoningScore, prioritizationExplanation: goal.prioritizationExplanation, deterministic: true, planningInfluence: "none", decisionEngineInfluence: "none", readOnly: true },
  }) as Evidence);

  return deepFreeze({ goals, opportunityGoalIdByOpportunityId, evidence }) as OperationalGoalBuilderResult;
}
