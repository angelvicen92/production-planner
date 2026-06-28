import type { Evidence, ORCRecord, Opportunity } from "../contracts";
import type { ReasoningBudget } from "../cognitive/reasoningBudget";
import { createReasoningBudget } from "../cognitive/reasoningBudget";
import { deepFreeze } from "../immutability";

export type DecisionFeedbackOutcome = "accepted" | "rejected" | "invalid" | "neutral";

export interface DecisionFeedbackEntry {
  readonly feedbackId: string;
  readonly iteration: number;
  readonly opportunityId: string;
  readonly strategyId: string;
  readonly improvement: number;
  readonly computationalCost: number;
  readonly estimatedFutureImpact: number;
  readonly outcome: DecisionFeedbackOutcome;
  readonly profitability: number;
  readonly explanation: string;
}

export interface DecisionFeedbackInfluence {
  readonly opportunityId: string;
  readonly feedbackIds: readonly string[];
  readonly influence: "promote" | "demote" | "unchanged";
  readonly budgetDelta: number;
  readonly explanation: string;
}

export interface DecisionFeedbackLoop {
  readonly entries: readonly DecisionFeedbackEntry[];
  readonly influences: readonly DecisionFeedbackInfluence[];
  readonly explanation: string;
}

export interface DecisionFeedbackInput {
  readonly iteration: number;
  readonly opportunityId: string | null | undefined;
  readonly strategyId: string | null | undefined;
  readonly previousScore: number | null | undefined;
  readonly newScore: number | null | undefined;
  readonly computationalCost: number | null | undefined;
  readonly estimatedFutureImpact: number | null | undefined;
  readonly outcome: DecisionFeedbackOutcome | boolean | null | undefined;
}

export interface DecisionFeedbackReuseResult<T extends { readonly id: string; readonly metadata?: ORCRecord }> {
  readonly opportunities: readonly T[];
  readonly influences: readonly DecisionFeedbackInfluence[];
  readonly reasoningBudget: ReasoningBudget;
  readonly evidence: readonly Evidence[];
}

const SOURCE = "orc-decision-feedback-loop";
const round = (value: number): number => Number(value.toFixed(6));
const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const normalizeOutcome = (outcome: DecisionFeedbackInput["outcome"]): DecisionFeedbackOutcome => {
  if (outcome === true) return "accepted";
  if (outcome === false) return "rejected";
  return outcome === "accepted" || outcome === "rejected" || outcome === "invalid" || outcome === "neutral" ? outcome : "neutral";
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function freezeLoop(entries: readonly DecisionFeedbackEntry[], influences: readonly DecisionFeedbackInfluence[] = []): DecisionFeedbackLoop {
  return deepFreeze({
    entries: [...entries].sort((a, b) => a.iteration - b.iteration || a.feedbackId.localeCompare(b.feedbackId)),
    influences: [...influences].sort((a, b) => a.opportunityId.localeCompare(b.opportunityId)),
    explanation: entries.length === 0 ? "No decision feedback has been generated for this execution." : `Decision Feedback Loop contains ${entries.length} deterministic in-execution observations.`,
  }) as DecisionFeedbackLoop;
}

export function createDecisionFeedbackLoop(entries: readonly DecisionFeedbackEntry[] = []): DecisionFeedbackLoop {
  return freezeLoop(entries.map((entry) => ({ ...clone(entry) })));
}

export function recordDecisionFeedback(loop: DecisionFeedbackLoop, input: DecisionFeedbackInput): DecisionFeedbackLoop {
  const iteration = Math.max(1, Math.floor(finite(input.iteration, loop.entries.length + 1)));
  const opportunityId = String(input.opportunityId ?? "unknown-opportunity");
  const strategyId = String(input.strategyId ?? "unknown-strategy");
  const improvement = round(finite(input.newScore) - finite(input.previousScore));
  const computationalCost = Math.max(0, round(finite(input.computationalCost)));
  const estimatedFutureImpact = round(finite(input.estimatedFutureImpact));
  const outcome = normalizeOutcome(input.outcome);
  const denominator = Math.max(1, computationalCost);
  const outcomeWeight = outcome === "accepted" ? 1 : outcome === "rejected" || outcome === "invalid" ? -1 : 0;
  const profitability = round((improvement + estimatedFutureImpact * 0.1 + outcomeWeight * 0.05) / denominator);
  const feedbackId = `decision-feedback:${iteration}:${opportunityId}:${strategyId}`;
  const entry: DecisionFeedbackEntry = {
    feedbackId,
    iteration,
    opportunityId,
    strategyId,
    improvement,
    computationalCost,
    estimatedFutureImpact,
    outcome,
    profitability,
    explanation: `Iteration ${iteration} applied ${strategyId} to ${opportunityId}: improvement=${improvement}, cost=${computationalCost}, futureImpact=${estimatedFutureImpact}, outcome=${outcome}, profitability=${profitability}.`,
  };
  const entries = [...loop.entries.filter((item) => item.feedbackId !== feedbackId), entry];
  return freezeLoop(entries, loop.influences);
}

function influenceFor(opportunityId: string, entries: readonly DecisionFeedbackEntry[]): DecisionFeedbackInfluence {
  const related = entries.filter((entry) => entry.opportunityId === opportunityId).sort((a, b) => a.feedbackId.localeCompare(b.feedbackId));
  const averageProfitability = related.length === 0 ? 0 : round(related.reduce((sum, entry) => sum + entry.profitability, 0) / related.length);
  const influence = averageProfitability > 0.02 ? "promote" : averageProfitability < -0.02 ? "demote" : "unchanged";
  const budgetDelta = influence === "promote" ? 1 : influence === "demote" ? -1 : 0;
  return deepFreeze({
    opportunityId,
    feedbackIds: related.map((entry) => entry.feedbackId),
    influence,
    budgetDelta,
    explanation: related.length === 0 ? "No related feedback; opportunity order and budget remain unchanged." : `Related feedback average profitability ${averageProfitability}; influence=${influence}; budgetDelta=${budgetDelta}.`,
  }) as DecisionFeedbackInfluence;
}

export function reuseDecisionFeedback<T extends { readonly id: string; readonly metadata?: ORCRecord }>(loop: DecisionFeedbackLoop, opportunities: readonly T[], reasoningBudget: ReasoningBudget, createdAt: string | null = null): DecisionFeedbackReuseResult<T> {
  const cloned = opportunities.map((opportunity) => clone(opportunity));
  const influences = cloned.map((opportunity) => influenceFor(opportunity.id, loop.entries));
  const influenceById = new Map(influences.map((influence) => [influence.opportunityId, influence]));
  const opportunitiesWithFeedback = cloned.map((opportunity) => ({
    ...opportunity,
    metadata: { ...(opportunity.metadata ?? {}), decisionFeedback: influenceById.get(opportunity.id) },
  }));
  const ordered = opportunitiesWithFeedback.sort((a, b) => {
    const left = influenceById.get(a.id)?.budgetDelta ?? 0;
    const right = influenceById.get(b.id)?.budgetDelta ?? 0;
    return right - left || a.id.localeCompare(b.id);
  });
  const demotions = influences.filter((influence) => influence.influence === "demote").length;
  const promotions = influences.filter((influence) => influence.influence === "promote").length;
  const reasoningBudgetAdjusted = createReasoningBudget({
    ...reasoningBudget,
    maxCandidates: Math.max(0, reasoningBudget.maxCandidates + promotions - demotions),
    maxSimulations: Math.max(0, reasoningBudget.maxSimulations + promotions - demotions),
  });
  const evidence = buildDecisionFeedbackEvidence(createDecisionFeedbackLoop(loop.entries), influences, createdAt);
  return deepFreeze({ opportunities: ordered, influences, reasoningBudget: reasoningBudgetAdjusted, evidence }) as DecisionFeedbackReuseResult<T>;
}

export function buildDecisionFeedbackEvidence(loop: DecisionFeedbackLoop, influences: readonly DecisionFeedbackInfluence[] = loop.influences, createdAt: string | null = null): Evidence[] {
  const generated: Evidence = deepFreeze({
    id: "evidence:orc-decision-feedback-loop:generated",
    source: SOURCE,
    kind: "decision-feedback-generated",
    subjectId: "current-execution",
    createdAt,
    data: { entries: clone(loop.entries), explanation: loop.explanation, readOnly: true, shadowModeOnly: true, persistentLearning: false, mutatesOperationalState: false, commitsPlanning: false },
  }) as Evidence;
  const influenced = influences.map((influence): Evidence => deepFreeze({
    id: `evidence:orc-decision-feedback-loop:influence:${influence.opportunityId}`,
    source: SOURCE,
    kind: "decision-feedback-influence",
    subjectId: influence.opportunityId,
    createdAt,
    data: { ...clone(influence), readOnly: true, shadowModeOnly: true, persistentLearning: false, mutatesOperationalState: false, commitsPlanning: false },
  }) as Evidence);
  return [generated, ...influenced];
}

export function buildDecisionFeedbackFromDecisions(input: {
  readonly opportunities: readonly Pick<Opportunity, "id">[];
  readonly operationalValues: readonly { readonly simulatedStateId: string; readonly overallScore: number; readonly futureFreedom?: number; readonly metadata?: ORCRecord }[];
  readonly commitDecisions: readonly { readonly candidateId?: string; readonly operationalValueId?: string | null; readonly committed?: boolean; readonly accepted?: boolean; readonly decision?: string; readonly reason?: string | null }[];
}): DecisionFeedbackLoop {
  let loop = createDecisionFeedbackLoop();
  const baseline = input.operationalValues.length === 0 ? 0 : Math.min(...input.operationalValues.map((value) => value.overallScore));
  const commits = new Map(input.commitDecisions.map((decision) => [decision.candidateId ?? decision.operationalValueId ?? "", decision]));
  input.operationalValues.forEach((value, index) => {
    const opportunityId = input.opportunities[index % Math.max(1, input.opportunities.length)]?.id ?? "unknown-opportunity";
    const decision = commits.get(value.simulatedStateId);
    loop = recordDecisionFeedback(loop, {
      iteration: index + 1,
      opportunityId,
      strategyId: value.simulatedStateId,
      previousScore: baseline,
      newScore: value.overallScore,
      computationalCost: 1,
      estimatedFutureImpact: finite(value.futureFreedom),
      outcome: decision?.committed === true || decision?.accepted === true || decision?.decision === "commit" || decision?.decision === "COMMIT" ? "accepted" : "rejected",
    });
  });
  return loop;
}
