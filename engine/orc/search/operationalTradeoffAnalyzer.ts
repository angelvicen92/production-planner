import type { Candidate, Evidence, ORCRecord } from "../contracts";
import { deepFreeze } from "../immutability";
import type { OpportunityCostEstimate } from "./opportunityCostEstimator";
import type { OperationalReasoningScore, OperationalReasoningScoreComponent } from "./operationalReasoningScore";
import type { RecoveryPotentialEstimate } from "./recoveryPotentialEstimator";

export interface OperationalTradeoff extends ORCRecord {
  readonly candidateId: string;
  readonly favoredDimensions: readonly string[];
  readonly penalizedDimensions: readonly string[];
  readonly intensity: number;
  readonly explanation: string;
  readonly deterministic: true;
  readonly readOnly: true;
}

export interface OperationalTradeoffAnalysisResult {
  readonly tradeoffs: readonly OperationalTradeoff[];
  readonly tradeoffsByCandidateId: ReadonlyMap<string, readonly OperationalTradeoff[]>;
  readonly evidence: readonly Evidence[];
}

export interface OperationalTradeoffAnalysisOptions {
  readonly candidates: readonly Candidate[];
  readonly operationalReasoningScores?: readonly OperationalReasoningScore[];
  readonly opportunityCosts?: readonly OpportunityCostEstimate[];
  readonly recoveryPotentials?: readonly RecoveryPotentialEstimate[];
  readonly createdAt?: string | null;
}

const SOURCE = "orc-operational-tradeoff-analyzer";
const HIGH = 0.65;
const LOW = 0.35;
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const byId = <T, K extends keyof T>(items: readonly T[], key: K): ReadonlyMap<string, T> => new Map(items.map((item) => [String(item[key]), item]));

function addDimension(target: Map<string, number>, name: string, value: number): void {
  const normalized = Math.max(0, Math.min(1, finite(value)));
  target.set(name, Math.max(target.get(name) ?? 0, normalized));
}

function collectDimensions(score: OperationalReasoningScore | undefined, cost: OpportunityCostEstimate | undefined, recovery: RecoveryPotentialEstimate | undefined) {
  const favored = new Map<string, number>();
  const penalized = new Map<string, number>();
  for (const component of score?.components ?? []) {
    const value = finite((component as OperationalReasoningScoreComponent).value);
    if (value >= HIGH) addDimension(favored, component.name, value);
    if (value <= LOW) addDimension(penalized, component.name, 1 - value);
  }
  if (finite(cost?.estimatedCost) >= HIGH) addDimension(penalized, "opportunity-cost", finite(cost?.estimatedCost));
  if (finite(cost?.estimatedCost) <= LOW) addDimension(favored, "low-opportunity-cost", 1 - finite(cost?.estimatedCost));
  if (finite(recovery?.estimatedPotential) >= HIGH) addDimension(favored, "recovery-potential", finite(recovery?.estimatedPotential));
  if (finite(recovery?.estimatedPotential) <= LOW) addDimension(penalized, "recovery-potential", 1 - finite(recovery?.estimatedPotential));
  return { favored, penalized };
}

function composeTradeoff(candidateId: string, favored: Map<string, number>, penalized: Map<string, number>): OperationalTradeoff | null {
  if (favored.size === 0 || penalized.size === 0) return null;
  const favoredDimensions = [...favored.keys()].sort();
  const penalizedDimensions = [...penalized.keys()].sort();
  const strongestFavored = Math.max(...favored.values());
  const strongestPenalized = Math.max(...penalized.values());
  const intensity = round(Math.min(strongestFavored, strongestPenalized));
  const explanation = `Candidate ${candidateId} favors ${favoredDimensions.join(", ")} while penalizing ${penalizedDimensions.join(", ")}; trade-off intensity ${intensity} is derived only from existing ORS, Opportunity Cost and Recovery Potential signals.`;
  return deepFreeze({ candidateId, favoredDimensions, penalizedDimensions, intensity, explanation, deterministic: true, readOnly: true }) as OperationalTradeoff;
}

export function analyzeOperationalTradeoffs(options: OperationalTradeoffAnalysisOptions): OperationalTradeoffAnalysisResult {
  const scores = byId((options.operationalReasoningScores ?? []).filter((score) => score.subjectType === "candidate"), "subjectId");
  const costs = byId(options.opportunityCosts ?? [], "candidateId");
  const recoveries = byId(options.recoveryPotentials ?? [], "candidateId");
  const tradeoffs = [...options.candidates]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((candidate) => {
      const dimensions = collectDimensions(scores.get(candidate.id), costs.get(candidate.id), recoveries.get(candidate.id));
      return composeTradeoff(candidate.id, dimensions.favored, dimensions.penalized);
    })
    .filter((tradeoff): tradeoff is OperationalTradeoff => tradeoff !== null)
    .sort((a, b) => (b.intensity - a.intensity) || a.candidateId.localeCompare(b.candidateId));
  const grouped = new Map<string, readonly OperationalTradeoff[]>();
  for (const tradeoff of tradeoffs) grouped.set(tradeoff.candidateId, deepFreeze([...(grouped.get(tradeoff.candidateId) ?? []), tradeoff]) as readonly OperationalTradeoff[]);
  const evidence = tradeoffs.map((tradeoff) => deepFreeze({
    id: `evidence:${SOURCE}:${tradeoff.candidateId}`,
    source: SOURCE,
    kind: "operational-tradeoff-detected",
    subjectId: tradeoff.candidateId,
    createdAt: options.createdAt ?? null,
    data: { ...tradeoff, planningInfluence: "none", decisionEngineInfluence: "none", commitEngineInfluence: "none", explorationInfluence: "explanation-and-near-tie-ordering-only" },
  }) as Evidence);
  return deepFreeze({ tradeoffs, tradeoffsByCandidateId: grouped, evidence }) as OperationalTradeoffAnalysisResult;
}
