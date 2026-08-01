import { createHash } from "node:crypto";
import { anchoredTaskIds } from "./anchoredAccompaniment";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { evaluateParticipantItineraryQuality, type ParticipantItineraryGap, type ParticipantItineraryMetrics } from "./participantItineraryQuality";
import type { ResidualOrderingDecision, ResidualObligationAlignmentKey } from "./residualObligationAlignment";

export type ResidualTaskCategory = "MAIN" | "FEEDER" | "STANDALONE" | "ANCHORED_SEGMENT" | "OTHER";
export type RegressionMechanism = "FIRST_OBLIGATION_EARLIER" | "LAST_OBLIGATION_LATER" | "BOTH_BOUNDARIES_EXPANDED" |
  "INTERNAL_GAP_REDISTRIBUTION" | "MULTIPLE_MECHANISMS" | "UNRESOLVED";
export type HarmVisibility = "VISIBLE_IN_STATIC_BOUND" | "EMERGED_AFTER_SELECTION" | "UNMAPPED";
export type AuditClassification = "VISIBLE_HARM" | "EMERGENT_HARM" | "MIXED" | "INCOMPLETE_TRACE" | "NO_REGRESSIONS";
export type AuditRecommendation = "EXPERIMENT_STATIC_EQUITY_GUARD" | "STUDY_DYNAMIC_CONTEXT" |
  "COMPARE_STATIC_AND_DYNAMIC" | "REPAIR_TRACEABILITY" | "VALIDATE_DOMINANCE";

export interface TaskMovement { taskId: string; kind: ScheduledTask["kind"]; category: ResidualTaskCategory;
  baselineStart: number | null; baselineEnd: number | null; experimentalStart: number | null; experimentalEnd: number | null;
  startDelta: number | null; endDelta: number | null; moved: boolean }
export interface SharedGapChange { participantId: string; beforeTaskId: string; afterTaskId: string;
  baselineDuration: number; experimentalDuration: number; durationDelta: number }
export interface GapChanges { baseline: ParticipantItineraryGap[]; experimental: ParticipantItineraryGap[];
  eliminated: ParticipantItineraryGap[]; added: ParticipantItineraryGap[]; sharedChanged: SharedGapChange[];
  baselineMaximum: number; experimentalMaximum: number }
export interface AcceptedDecisionAudit { stateFingerprint: string; depth: number; slot: number; selectedCandidateId: string;
  selectedParticipantId: string; baselineOrder: string[]; contextualOrder: string[]; baselineRank: number; contextualRank: number;
  selectedKey: ResidualObligationAlignmentKey }
export interface ParticipantOutcomeAudit { participantId: string; baseline: ParticipantItineraryMetrics; experimental: ParticipantItineraryMetrics;
  deltas: { firstObligation: number; lastObligation: number; presence: number; productive: number; idle: number;
    maximumGap: number; gapCount: number; spaceChanges: number }; movements: TaskMovement[]; gapChanges: GapChanges;
  mechanism: RegressionMechanism | null; visibility: HarmVisibility | null; acceptedDecision: AcceptedDecisionAudit | null;
  presenceUnderestimation: number | null; maximumGapUnderestimation: number | null }
export interface ResidualOutcomeAudit {
  participants: ParticipantOutcomeAudit[];
  aggregates: { participantCount: number; improvedParticipantCount: number; worsenedParticipantCount: number; unchangedParticipantCount: number;
    grossImprovementMinutes: number; grossHarmMinutes: number; netIdleImprovementMinutes: number; maximumIndividualImprovement: number;
    maximumIndividualHarm: number; averageImprovementAmongImproved: number; averageHarmAmongWorsened: number;
    totalHarmVisibleInStaticBound: number; totalHarmEmergedAfterSelection: number; totalHarmUnmapped: number;
    participantsVisible: string[]; participantsEmerged: string[]; participantsUnmapped: string[];
    maximumGapRegressionParticipant: string | null; maximumIdleRegressionParticipant: string | null };
  rankings: Record<"idleHarm" | "idleImprovement" | "maximumGapIncrease" | "presenceIncrease" | "presenceUnderestimation" | "maximumGapUnderestimation", string[]>;
  acceptedPathDecisions: AcceptedDecisionAudit[]; classification: AuditClassification; recommendation: AuditRecommendation; auditFingerprint: string;
}

const delta = (a: number | null, b: number | null) => (a ?? 0) - (b ?? 0);
const gapKey = (participantId: string, gap: ParticipantItineraryGap) => `${participantId}\0${gap.beforeTaskId}\0${gap.afterTaskId}`;
const rank = (items: ParticipantOutcomeAudit[], score: (item: ParticipantOutcomeAudit) => number) => [...items]
  .filter((item) => score(item) > 0).sort((a, b) => score(b) - score(a) || a.participantId.localeCompare(b.participantId)).map(({ participantId }) => participantId);
const maximumParticipant = (items: ParticipantOutcomeAudit[], score: (item: ParticipantOutcomeAudit) => number) => rank(items, score)[0] ?? null;
function accepted(decision: ResidualOrderingDecision): AcceptedDecisionAudit | null {
  if (!decision.acceptedPath || decision.selectedCandidateId === null || decision.selectedParticipantId === null) return null;
  const key = decision.keys.find(({ candidateId }) => candidateId === decision.selectedCandidateId);
  if (!key) return null;
  return { stateFingerprint: decision.stateFingerprint, depth: decision.depth, slot: decision.slot,
    selectedCandidateId: decision.selectedCandidateId, selectedParticipantId: decision.selectedParticipantId,
    baselineOrder: [...decision.baselineOrder], contextualOrder: [...decision.contextualOrder],
    baselineRank: decision.baselineOrder.indexOf(decision.selectedCandidateId), contextualRank: decision.contextualOrder.indexOf(decision.selectedCandidateId),
    selectedKey: { ...key } };
}

export function auditResidualObligationOutcomes(problem: Readonly<PlannerNextProblem>, baselineTasks: readonly Readonly<ScheduledTask>[],
  experimentalTasks: readonly Readonly<ScheduledTask>[], decisions: readonly Readonly<ResidualOrderingDecision>[]): ResidualOutcomeAudit {
  const baseline = evaluateParticipantItineraryQuality(problem as PlannerNextProblem, baselineTasks as ScheduledTask[]);
  const experiment = evaluateParticipantItineraryQuality(problem as PlannerNextProblem, experimentalTasks as ScheduledTask[]);
  const acceptedPathDecisions = decisions.map((item) => accepted(item as ResidualOrderingDecision)).filter((item): item is AcceptedDecisionAudit => item !== null)
    .sort((a, b) => a.depth - b.depth || a.stateFingerprint.localeCompare(b.stateFingerprint));
  const anchored = anchoredTaskIds(problem as PlannerNextProblem);
  const taskById = new Map(problem.tasks.map((task) => [task.id, task]));
  const decisionByParticipant = new Map<string, AcceptedDecisionAudit[]>();
  for (const item of acceptedPathDecisions) decisionByParticipant.set(item.selectedParticipantId, [...(decisionByParticipant.get(item.selectedParticipantId) ?? []), item]);
  const participants = baseline.participants.map((before): ParticipantOutcomeAudit => {
    const after = experiment.participants.find(({ participantId }) => participantId === before.participantId)!;
    const deltas = { firstObligation: delta(after.firstTaskStart, before.firstTaskStart), lastObligation: delta(after.lastTaskEnd, before.lastTaskEnd),
      presence: after.presenceSpanMinutes - before.presenceSpanMinutes, productive: after.productiveMinutes - before.productiveMinutes,
      idle: after.idleMinutes - before.idleMinutes, maximumGap: after.maximumGapMinutes - before.maximumGapMinutes,
      gapCount: after.gapCount - before.gapCount, spaceChanges: after.spaceChangeCount - before.spaceChangeCount };
    const ids = [...new Set([...before.taskIds, ...after.taskIds])].sort();
    const movements = ids.map((taskId): TaskMovement => { const a = baselineTasks.find(({ id }) => id === taskId), b = experimentalTasks.find(({ id }) => id === taskId);
      const task = taskById.get(taskId) ?? a ?? b!; const category: ResidualTaskCategory = anchored.has(taskId) ? "ANCHORED_SEGMENT"
        : task.kind === "main" ? "MAIN" : task.kind === "vocal" ? "FEEDER" : task.kind === "auxiliary" ? "STANDALONE" : "OTHER";
      return { taskId, kind: task.kind, category, baselineStart: a?.start ?? null, baselineEnd: a?.end ?? null,
        experimentalStart: b?.start ?? null, experimentalEnd: b?.end ?? null, startDelta: a && b ? b.start - a.start : null,
        endDelta: a && b ? b.end - a.end : null, moved: !a || !b || a.start !== b.start || a.end !== b.end }; });
    const bg = new Map(before.gaps.map((gap) => [gapKey(before.participantId, gap), gap]));
    const eg = new Map(after.gaps.map((gap) => [gapKey(after.participantId, gap), gap]));
    const gapChanges: GapChanges = { baseline: before.gaps.map((g) => ({ ...g })), experimental: after.gaps.map((g) => ({ ...g })),
      eliminated: [...bg].filter(([key]) => !eg.has(key)).map(([, g]) => ({ ...g })), added: [...eg].filter(([key]) => !bg.has(key)).map(([, g]) => ({ ...g })),
      sharedChanged: [...bg].filter(([key, g]) => eg.has(key) && eg.get(key)!.duration !== g.duration).map(([key, g]) => ({ participantId: before.participantId,
        beforeTaskId: g.beforeTaskId, afterTaskId: g.afterTaskId, baselineDuration: g.duration, experimentalDuration: eg.get(key)!.duration,
        durationDelta: eg.get(key)!.duration - g.duration })), baselineMaximum: before.maximumGapMinutes, experimentalMaximum: after.maximumGapMinutes };
    let mechanism: RegressionMechanism | null = null;
    if (deltas.idle > 0) { const early = deltas.firstObligation < 0, late = deltas.lastObligation > 0;
      mechanism = early && late ? "BOTH_BOUNDARIES_EXPANDED" : early ? "FIRST_OBLIGATION_EARLIER" : late ? "LAST_OBLIGATION_LATER"
        : deltas.maximumGap > 0 || gapChanges.eliminated.length + gapChanges.added.length + gapChanges.sharedChanged.length > 0 ? "INTERNAL_GAP_REDISTRIBUTION" : "UNRESOLVED"; }
    const choices = decisionByParticipant.get(before.participantId) ?? [], choice = choices.length === 1 ? choices[0]! : null;
    let visibility: HarmVisibility | null = null;
    if (deltas.idle > 0) visibility = !choice ? "UNMAPPED" : choice.selectedKey.projectedPresenceLowerBound > before.presenceSpanMinutes
      || choice.selectedKey.projectedMaximumGapLowerBound > before.maximumGapMinutes ? "VISIBLE_IN_STATIC_BOUND" : "EMERGED_AFTER_SELECTION";
    return { participantId: before.participantId, baseline: structuredClone(before), experimental: structuredClone(after), deltas, movements, gapChanges,
      mechanism, visibility, acceptedDecision: choice, presenceUnderestimation: choice ? after.presenceSpanMinutes - choice.selectedKey.projectedPresenceLowerBound : null,
      maximumGapUnderestimation: choice ? after.maximumGapMinutes - choice.selectedKey.projectedMaximumGapLowerBound : null };
  }).sort((a, b) => a.participantId.localeCompare(b.participantId));
  const withTasks = participants.filter((p) => p.baseline.taskCount > 0 || p.experimental.taskCount > 0), improved = withTasks.filter((p) => p.deltas.idle < 0), worsened = withTasks.filter((p) => p.deltas.idle > 0);
  const visible = worsened.filter((p) => p.visibility === "VISIBLE_IN_STATIC_BOUND"), emerged = worsened.filter((p) => p.visibility === "EMERGED_AFTER_SELECTION"), unmapped = worsened.filter((p) => p.visibility === "UNMAPPED");
  const grossImprovementMinutes = -improved.reduce((s, p) => s + p.deltas.idle, 0), grossHarmMinutes = worsened.reduce((s, p) => s + p.deltas.idle, 0);
  const aggregates = { participantCount: withTasks.length, improvedParticipantCount: improved.length, worsenedParticipantCount: worsened.length,
    unchangedParticipantCount: withTasks.length - improved.length - worsened.length, grossImprovementMinutes, grossHarmMinutes,
    netIdleImprovementMinutes: grossImprovementMinutes - grossHarmMinutes, maximumIndividualImprovement: Math.max(0, ...improved.map((p) => -p.deltas.idle)),
    maximumIndividualHarm: Math.max(0, ...worsened.map((p) => p.deltas.idle)), averageImprovementAmongImproved: improved.length ? grossImprovementMinutes / improved.length : 0,
    averageHarmAmongWorsened: worsened.length ? grossHarmMinutes / worsened.length : 0,
    totalHarmVisibleInStaticBound: visible.reduce((s, p) => s + p.deltas.idle, 0), totalHarmEmergedAfterSelection: emerged.reduce((s, p) => s + p.deltas.idle, 0),
    totalHarmUnmapped: unmapped.reduce((s, p) => s + p.deltas.idle, 0), participantsVisible: visible.map((p) => p.participantId),
    participantsEmerged: emerged.map((p) => p.participantId), participantsUnmapped: unmapped.map((p) => p.participantId),
    maximumGapRegressionParticipant: maximumParticipant(withTasks, (p) => p.deltas.maximumGap), maximumIdleRegressionParticipant: maximumParticipant(withTasks, (p) => p.deltas.idle) };
  const rankings = { idleHarm: rank(withTasks, (p) => p.deltas.idle), idleImprovement: rank(withTasks, (p) => -p.deltas.idle),
    maximumGapIncrease: rank(withTasks, (p) => p.deltas.maximumGap), presenceIncrease: rank(withTasks, (p) => p.deltas.presence),
    presenceUnderestimation: rank(withTasks, (p) => p.presenceUnderestimation ?? 0), maximumGapUnderestimation: rank(withTasks, (p) => p.maximumGapUnderestimation ?? 0) };
  const classification: AuditClassification = worsened.length === 0 ? "NO_REGRESSIONS" : unmapped.length > 0 ? "INCOMPLETE_TRACE"
    : aggregates.totalHarmVisibleInStaticBound === aggregates.totalHarmEmergedAfterSelection ? "MIXED"
    : aggregates.totalHarmVisibleInStaticBound > aggregates.totalHarmEmergedAfterSelection ? "VISIBLE_HARM" : "EMERGENT_HARM";
  const recommendation: AuditRecommendation = classification === "NO_REGRESSIONS" ? "VALIDATE_DOMINANCE" : classification === "INCOMPLETE_TRACE" ? "REPAIR_TRACEABILITY"
    : classification === "MIXED" ? "COMPARE_STATIC_AND_DYNAMIC" : classification === "VISIBLE_HARM" ? "EXPERIMENT_STATIC_EQUITY_GUARD" : "STUDY_DYNAMIC_CONTEXT";
  const canonical = { participants, aggregates, rankings, acceptedPathDecisions, classification, recommendation };
  return { ...canonical, auditFingerprint: createHash("sha256").update(JSON.stringify(canonical)).digest("hex") };
}
