import { createHash } from "node:crypto";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { evaluateParticipantItineraryQuality, type ParticipantItineraryQualityEvaluation } from "./participantItineraryQuality";

export interface StandaloneCompletionMetrics {
  fullFingerprint: string; qualityFingerprint: string; totalPresence: number; productive: number; totalIdle: number;
  idleRatio: number; maximumPresence: number; maximumIdle: number; maximumGap: number; gapCount: number;
  spaceChanges: number; improvedParticipants: number; worsenedParticipants: number; unchangedParticipants: number;
  grossImprovement: number; grossHarm: number; netIdleImprovement: number; maximumIndividualImprovement: number;
  maximumIndividualHarm: number; idleByParticipant: Readonly<Record<string, number>>;
  standaloneStarts: Readonly<Record<string, number>>; selectionOrder: readonly string[];
}
export interface CompletionFlags { operationalDominance: boolean; baselineSafe: boolean; harmReducing: boolean; equityDominant: boolean }
export interface StandaloneCompletionPoint { metrics: StandaloneCompletionMetrics; flags: CompletionFlags }
export type FixedCoreExplorationClassification = "CASE_1_FIXED_CORE_DOMINANCE" | "CASE_2_CONTROLLED_EQUITY_IMPROVEMENT"
  | "CASE_3_ALTERNATIVES_WITHOUT_RELEVANT_IMPROVEMENT" | "CASE_4_UNIQUE_STANDALONE_COMPLETION"
  | "CASE_5_INCONCLUSIVE_BUDGET" | "CASE_6_NO_COMPLETION";

const vector = (p: StandaloneCompletionPoint) => [p.metrics.grossHarm, p.metrics.maximumIndividualHarm, p.metrics.totalIdle,
  p.metrics.maximumIdle, p.metrics.maximumGap, p.metrics.gapCount, p.metrics.spaceChanges];
const dominates = (a: StandaloneCompletionPoint, b: StandaloneCompletionPoint) => {
  const av = vector(a), bv = vector(b); return av.every((value, i) => value <= bv[i]!) && av.some((value, i) => value < bv[i]!);
};
export function updateStandaloneParetoFrontier(frontier: readonly StandaloneCompletionPoint[], point: StandaloneCompletionPoint) {
  if (frontier.some(({ metrics }) => metrics.fullFingerprint === point.metrics.fullFingerprint) || frontier.some((item) => dominates(item, point))) return [...frontier];
  return [...frontier.filter((item) => !dominates(point, item)), point].sort((a, b) => a.metrics.fullFingerprint.localeCompare(b.metrics.fullFingerprint));
}

export function evaluateStandaloneCompletion(problem: PlannerNextProblem, tasks: readonly ScheduledTask[], fullFingerprint: string,
  baseline: ParticipantItineraryQualityEvaluation, current: ParticipantItineraryQualityEvaluation,
  standaloneStarts: Readonly<Record<string, number>> = {}, selectionOrder: readonly string[] = []): StandaloneCompletionPoint {
  const quality = evaluateParticipantItineraryQuality(problem, tasks);
  const baselineIdle = new Map(baseline.participants.map((p) => [p.participantId, p.idleMinutes]));
  const currentIdle = new Map(current.participants.map((p) => [p.participantId, p.idleMinutes]));
  const deltas = quality.participants.map((p) => (p.idleMinutes - (baselineIdle.get(p.participantId) ?? 0)));
  const idleByParticipant = Object.fromEntries(quality.participants.map((p) => [p.participantId, p.idleMinutes]));
  const s = quality.summary, bs = baseline.summary, cs = current.summary;
  const metrics: StandaloneCompletionMetrics = { fullFingerprint, qualityFingerprint: s.qualityFingerprint,
    totalPresence: s.totalPresenceSpanMinutes, productive: s.totalProductiveMinutes, totalIdle: s.totalIdleMinutes,
    idleRatio: s.overallIdleRatio, maximumPresence: s.maximumParticipantPresenceSpanMinutes,
    maximumIdle: s.maximumParticipantIdleMinutes, maximumGap: s.maximumSingleGapMinutes, gapCount: s.totalGapCount,
    spaceChanges: s.totalSpaceChangeCount, improvedParticipants: deltas.filter((d) => d < 0).length,
    worsenedParticipants: deltas.filter((d) => d > 0).length, unchangedParticipants: deltas.filter((d) => d === 0).length,
    grossImprovement: -deltas.filter((d) => d < 0).reduce((a, b) => a + b, 0),
    grossHarm: deltas.filter((d) => d > 0).reduce((a, b) => a + b, 0), netIdleImprovement: bs.totalIdleMinutes - s.totalIdleMinutes,
    maximumIndividualImprovement: Math.max(0, ...deltas.map((d) => -d)), maximumIndividualHarm: Math.max(0, ...deltas),
    idleByParticipant, standaloneStarts: Object.freeze({ ...standaloneStarts }), selectionOrder: Object.freeze([...selectionOrder]) };
  const noMoreIdleThan = (reference: Map<string, number>) => quality.participants.every((p) => p.idleMinutes <= (reference.get(p.participantId) ?? 0));
  const operationalStrict = s.totalIdleMinutes < cs.totalIdleMinutes || s.maximumParticipantIdleMinutes < cs.maximumParticipantIdleMinutes
    || s.maximumSingleGapMinutes < cs.maximumSingleGapMinutes || quality.participants.some((p) => p.idleMinutes < (currentIdle.get(p.participantId) ?? 0));
  const flags = { operationalDominance: s.totalIdleMinutes <= cs.totalIdleMinutes && s.maximumParticipantIdleMinutes <= cs.maximumParticipantIdleMinutes
      && s.maximumSingleGapMinutes <= cs.maximumSingleGapMinutes && noMoreIdleThan(currentIdle) && operationalStrict,
    baselineSafe: s.totalIdleMinutes < 2615 && s.maximumParticipantIdleMinutes <= 380 && s.maximumSingleGapMinutes <= 225 && noMoreIdleThan(baselineIdle),
    harmReducing: metrics.grossHarm < 375 && metrics.maximumIndividualHarm <= 120 && s.totalIdleMinutes <= 2480
      && s.maximumParticipantIdleMinutes <= 435 && s.maximumSingleGapMinutes <= 315,
    equityDominant: metrics.grossHarm < 375 && metrics.maximumIndividualHarm <= 120 && s.totalIdleMinutes <= cs.totalIdleMinutes
      && s.maximumParticipantIdleMinutes <= cs.maximumParticipantIdleMinutes && s.maximumSingleGapMinutes <= cs.maximumSingleGapMinutes };
  return { metrics, flags };
}

export function classifyFixedCoreExploration(points: readonly StandaloneCompletionPoint[], naturallyExhausted: boolean,
  budgetExhausted: boolean, firstFingerprint: string): FixedCoreExplorationClassification {
  if (points.length === 0) return "CASE_6_NO_COMPLETION";
  if (points.some((p) => p.flags.operationalDominance || p.flags.baselineSafe)) return "CASE_1_FIXED_CORE_DOMINANCE";
  if (points.some((p) => p.flags.harmReducing || p.flags.equityDominant)) return "CASE_2_CONTROLLED_EQUITY_IMPROVEMENT";
  if (budgetExhausted) return "CASE_5_INCONCLUSIVE_BUDGET";
  const unique = new Set(points.map((p) => p.metrics.fullFingerprint));
  if (naturallyExhausted && unique.size === 1 && unique.has(firstFingerprint)) return "CASE_4_UNIQUE_STANDALONE_COMPLETION";
  return "CASE_3_ALTERNATIVES_WITHOUT_RELEVANT_IMPROVEMENT";
}

export function fixedCoreStandaloneExplorationFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
