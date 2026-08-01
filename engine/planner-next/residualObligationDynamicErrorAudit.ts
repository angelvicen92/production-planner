import { createHash } from "node:crypto";
import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, ValidationSummary, Window } from "./contracts";
import { evaluateParticipantItineraryQuality, type ParticipantItineraryMetrics } from "./participantItineraryQuality";
import type { ResidualOutcomeAudit } from "./residualObligationOutcomeAudit";
import type { ResidualOrderingDecision, ResidualObligationCandidateTrace, ResidualTaskStaticEstimate } from "./residualObligationAlignment";
import { validatePlan } from "./validate";

export type DynamicBlockerCategory = "DAY" | "TASK_AVAILABILITY" | "PARTICIPANT_AVAILABILITY" | "SPACE_AVAILABILITY" |
  "COACH_AVAILABILITY" | "RESOURCE_AVAILABILITY" | "PARTICIPANT_OVERLAP" | "SPACE_OVERLAP" | "RESOURCE_OVERLAP" |
  "COACH_OVERLAP" | "MEAL_CONFLICT" | "PARTICIPANT_TRANSITION" | "RESOURCE_TRANSITION" | "VALIDATOR";
export interface DynamicBlocker { readonly category: DynamicBlockerCategory; readonly taskIds: readonly string[];
  readonly resourceIds: readonly string[]; readonly spaceIds: readonly string[]; readonly coachIds: readonly string[] }
export interface DynamicOpportunity { readonly idle: number; readonly presence: number; readonly maximumGap: number; readonly gapCount: number;
  readonly spaceChanges: number; readonly hardValid: boolean; readonly diagnosticOnlyBlocked: boolean;
  readonly reasonCodes: readonly string[]; readonly blockers: readonly DynamicBlocker[] }
export interface FeederDynamicAudit { readonly taskId: string; readonly idealStart: number; readonly idealEnd: number;
  readonly actualStart: number | null; readonly actualEnd: number | null; readonly actualStartDeltaFromIdeal: number | null;
  readonly minutesEarlierThanIdeal: number | null; readonly minutesLaterThanIdeal: number | null; readonly identityMatches: boolean;
  readonly opportunity: DynamicOpportunity | null }
export interface ResidualTaskDynamicAudit { readonly taskId: string; readonly staticEstimate: ResidualTaskStaticEstimate;
  readonly actualStart: number | null; readonly actualEnd: number | null; readonly startDisplacement: number | null;
  readonly absoluteStartDisplacement: number | null; readonly minutesEarlier: number | null; readonly minutesLater: number | null;
  readonly identityMatches: boolean; readonly opportunity: DynamicOpportunity | null }
export type ParticipantDynamicClassification = "FEEDER_DISPLACEMENT_VISIBLE" | "RESIDUAL_DISPLACEMENT_VISIBLE" |
  "MIXED_DYNAMIC_OPPORTUNITY" | "STATIC_TARGETS_BLOCKED" | "NO_STATIC_RECOVERY" | "INCOMPLETE_DYNAMIC_TRACE" | null;
export type DynamicAuditClassification = "FEEDER_DOMINANT" | "STANDALONE_DOMINANT" | "MIXED" |
  "STATIC_TARGETS_BLOCKED" | "NO_STATIC_RECOVERY" | "INCOMPLETE_TRACE";
export type DynamicAuditRecommendation = "EXPERIMENT_DYNAMIC_FEEDER_START_ORDER" | "EXPERIMENT_FAIR_STANDALONE_DFS_ORDER" |
  "COMPARE_FEEDER_AND_STANDALONE_SEPARATELY" | "STUDY_DYNAMIC_COMPETITION_OR_COMPLETE_LEAVES" |
  "STUDY_DIFFERENT_DYNAMIC_MODEL" | "REPAIR_DYNAMIC_TRACEABILITY";
export interface ParticipantDynamicErrorAudit { readonly participantId: string; readonly outcome: "IMPROVED" | "WORSENED" | "UNCHANGED";
  readonly selectedPresenceLowerBound: number | null; readonly selectedMaximumGapLowerBound: number | null;
  readonly finalPresence: number; readonly finalMaximumGap: number; readonly presenceLowerBoundError: number | null;
  readonly maximumGapLowerBoundError: number | null; readonly feeder: FeederDynamicAudit | null;
  readonly residualTasks: readonly ResidualTaskDynamicAudit[]; readonly feederOpportunity: DynamicOpportunity | null;
  readonly combinedResidualOpportunity: DynamicOpportunity | null; readonly completeStaticOpportunity: DynamicOpportunity | null;
  readonly residualTaskDisplacementTotal: number; readonly maximumResidualTaskDisplacement: number;
  readonly hardValidStaticTargetCount: number; readonly blockedStaticTargetCount: number; readonly incomplete: boolean;
  readonly classification: ParticipantDynamicClassification }
export interface ResidualObligationDynamicErrorAudit { readonly participants: readonly ParticipantDynamicErrorAudit[];
  readonly aggregates: Readonly<{ harmParticipantCount: number; totalFeederHardValidIdleOpportunity: number;
    totalResidualHardValidIdleOpportunity: number; totalCompleteStaticHardValidIdleOpportunity: number;
    totalFeederBlockedIdleOpportunity: number; totalResidualBlockedIdleOpportunity: number; totalCompleteStaticBlockedIdleOpportunity: number;
    participantsFeederDominant: number; participantsResidualDominant: number; participantsMixed: number; participantsBlocked: number;
    participantsWithoutRecovery: number; participantsIncomplete: number; staticTargetCount: number; hardValidStaticTargetCount: number;
    blockedStaticTargetCount: number; averageStartDisplacement: number; maximumStartDisplacement: number; maximumFeederDisplacement: number }>;
  readonly classification: DynamicAuditClassification; readonly recommendation: DynamicAuditRecommendation;
  readonly nonAdditiveDiagnostic: true; readonly dynamicErrorAuditFingerprint: string }

const fits = (windows: readonly Window[] | undefined, start: number, end: number) => windows === undefined || windows.some((w) => w.start <= start && end <= w.end);
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
const metric = (problem: Readonly<PlannerNextProblem>, tasks: readonly ScheduledTask[], participantId: string) =>
  evaluateParticipantItineraryQuality(problem as PlannerNextProblem, tasks as ScheduledTask[]).participants.find((p) => p.participantId === participantId)!;
const blocker = (category: DynamicBlockerCategory, taskIds: string[] = [], resourceIds: string[] = [], spaceIds: string[] = [], coachIds: string[] = []): DynamicBlocker =>
  ({ category, taskIds: [...new Set(taskIds)].sort(), resourceIds: [...new Set(resourceIds)].sort(), spaceIds: [...new Set(spaceIds)].sort(), coachIds: [...new Set(coachIds)].sort() });
function diagnose(problem: Readonly<PlannerNextProblem>, moved: readonly ScheduledTask[], all: readonly ScheduledTask[], meals: readonly ScheduledSpaceMeal[], validation: ValidationSummary): DynamicBlocker[] {
  const found: DynamicBlocker[] = [];
  for (const task of moved) {
    if (task.start < problem.day.start || task.end > problem.day.end) found.push(blocker("DAY", [task.id]));
    if (!fits(task.availability, task.start, task.end)) found.push(blocker("TASK_AVAILABILITY", [task.id]));
    const participant = problem.participants.find((p) => p.id === task.participantId);
    if (participant && !fits(participant.availability, task.start, task.end)) found.push(blocker("PARTICIPANT_AVAILABILITY", [task.id]));
    const space = problem.spaces.find((p) => p.id === task.spaceId);
    if (!space || !fits(space.availability, task.start, task.end)) found.push(blocker("SPACE_AVAILABILITY", [task.id], [], [task.spaceId]));
    const coach = task.coachId && problem.coaches.find((p) => p.id === task.coachId);
    if (task.coachId && (!coach || !fits(coach.availability, task.start, task.end))) found.push(blocker("COACH_AVAILABILITY", [task.id], [], [], [task.coachId]));
    for (const id of task.requiredResourceIds ?? []) { const resource = problem.resources.find((r) => r.id === id);
      if (!resource || !fits(resource.availability, task.start, task.end)) found.push(blocker("RESOURCE_AVAILABILITY", [task.id], [id])); }
    for (const other of all) if (other.id !== task.id && overlaps(task, other)) {
      if (task.participantId && task.participantId === other.participantId) found.push(blocker("PARTICIPANT_OVERLAP", [task.id, other.id]));
      if (task.spaceId === other.spaceId) found.push(blocker("SPACE_OVERLAP", [task.id, other.id], [], [task.spaceId]));
      if (task.coachId && task.coachId === other.coachId) found.push(blocker("COACH_OVERLAP", [task.id, other.id], [], [], [task.coachId]));
      const shared = (task.requiredResourceIds ?? []).filter((id) => (other.requiredResourceIds ?? []).includes(id));
      if (shared.length) found.push(blocker("RESOURCE_OVERLAP", [task.id, other.id], shared));
    }
    if (overlaps(task, problem.protectedMeal) || meals.some((meal) => meal.spaceId === task.spaceId && overlaps(task, meal)))
      found.push(blocker("MEAL_CONFLICT", [task.id], [], [task.spaceId]));
  }
  if (validation.transitionViolationCount) found.push(blocker("PARTICIPANT_TRANSITION", moved.map((t) => t.id)));
  if (validation.resourceTransitionViolationCount) found.push(blocker("RESOURCE_TRANSITION", moved.map((t) => t.id), moved.flatMap((t) => t.requiredResourceIds ?? [])));
  if (validation.reasonCodes.length && !found.length) found.push(blocker("VALIDATOR", moved.map((t) => t.id)));
  const keyed = new Map(found.map((b) => [JSON.stringify(b), b]));
  return [...keyed.values()].sort((a, b) => a.category.localeCompare(b.category) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function counterfactual(problem: Readonly<PlannerNextProblem>, real: readonly ScheduledTask[], meals: readonly ScheduledSpaceMeal[], participantId: string,
  replacements: readonly ScheduledTask[]): DynamicOpportunity {
  const ids = new Set(replacements.map((t) => t.id)); const tasks = [...real.filter((t) => !ids.has(t.id)).map((t) => ({ ...t })), ...replacements.map((t) => ({ ...t }))];
  const before = metric(problem, real as ScheduledTask[], participantId), after = metric(problem, tasks, participantId);
  const validation = validatePlan(problem as PlannerNextProblem, tasks, [], meals.map((m) => ({ ...m })));
  return { idle: before.idleMinutes - after.idleMinutes, presence: before.presenceSpanMinutes - after.presenceSpanMinutes,
    maximumGap: before.maximumGapMinutes - after.maximumGapMinutes, gapCount: before.gapCount - after.gapCount,
    spaceChanges: before.spaceChangeCount - after.spaceChangeCount, hardValid: validation.hardValid,
    diagnosticOnlyBlocked: !validation.hardValid, reasonCodes: [...validation.reasonCodes].sort(),
    blockers: validation.hardValid ? [] : diagnose(problem, replacements, tasks, meals, validation) };
}
const positiveValid = (o: DynamicOpportunity | null) => o?.hardValid && o.idle > 0 ? o.idle : 0;
const positiveBlocked = (o: DynamicOpportunity | null) => o && !o.hardValid && o.idle > 0 ? o.idle : 0;
export function classifyDynamicOpportunities(incomplete: boolean, feeder: DynamicOpportunity | null, residual: DynamicOpportunity | null, complete: DynamicOpportunity | null): Exclude<ParticipantDynamicClassification, null> {
  if (incomplete) return "INCOMPLETE_DYNAMIC_TRACE";
  const f = positiveValid(feeder), r = positiveValid(residual);
  if (f > r) return "FEEDER_DISPLACEMENT_VISIBLE"; if (r > f) return "RESIDUAL_DISPLACEMENT_VISIBLE";
  if (f > 0) return "MIXED_DYNAMIC_OPPORTUNITY";
  if (positiveBlocked(feeder) + positiveBlocked(residual) + positiveBlocked(complete) > 0) return "STATIC_TARGETS_BLOCKED";
  return "NO_STATIC_RECOVERY";
}

export function auditResidualObligationDynamicError(problem: Readonly<PlannerNextProblem>, experimentalTasks: readonly Readonly<ScheduledTask>[],
  meals: readonly Readonly<ScheduledSpaceMeal>[], outcomeAudit: Readonly<ResidualOutcomeAudit>, decisions: readonly Readonly<ResidualOrderingDecision>[]): ResidualObligationDynamicErrorAudit {
  const real = experimentalTasks.map((t) => ({ ...t })) as ScheduledTask[], safeMeals = meals.map((m) => ({ ...m })) as ScheduledSpaceMeal[];
  const traces = new Map<string, ResidualObligationCandidateTrace>();
  for (const d of decisions) if (d.acceptedPath && d.selectedParticipantId && d.selectedTrace) traces.set(d.selectedParticipantId, structuredClone(d.selectedTrace));
  const participants = outcomeAudit.participants.filter((p) => p.baseline.taskCount || p.experimental.taskCount).map((outcome): ParticipantDynamicErrorAudit => {
    const trace = traces.get(outcome.participantId), final = metric(problem, real, outcome.participantId);
    let incomplete = !trace || trace.participantId !== outcome.participantId || trace.candidateId !== outcome.acceptedDecision?.selectedCandidateId || trace.stateFingerprint !== outcome.acceptedDecision?.stateFingerprint;
    let feeder: FeederDynamicAudit | null = null, feederOpportunity: DynamicOpportunity | null = null;
    if (trace) { const actual = real.find((t) => t.id === trace.feeder.taskId), identityMatches = !!actual && actual.duration === trace.feeder.duration;
      incomplete ||= !identityMatches; if (actual && identityMatches) feederOpportunity = counterfactual(problem, real, safeMeals, outcome.participantId,
        [{ ...actual, start: trace.feeder.idealStart, end: trace.feeder.idealEnd }]);
      const displacement = actual ? actual.start - trace.feeder.idealStart : null;
      feeder = { taskId: trace.feeder.taskId, idealStart: trace.feeder.idealStart, idealEnd: trace.feeder.idealEnd,
        actualStart: actual?.start ?? null, actualEnd: actual?.end ?? null, actualStartDeltaFromIdeal: displacement,
        minutesEarlierThanIdeal: displacement === null ? null : Math.max(0, -displacement), minutesLaterThanIdeal: displacement === null ? null : Math.max(0, displacement),
        identityMatches, opportunity: feederOpportunity }; }
    const residualTasks: ResidualTaskDynamicAudit[] = (trace?.residualTasks ?? []).map((estimate) => { const actual = real.find((t) => t.id === estimate.taskId);
      const identityMatches = !!actual && actual.duration === estimate.duration && actual.participantId === estimate.participantId;
      if (!identityMatches || estimate.bestStaticStart === null) incomplete = true;
      const displacement = actual && estimate.bestStaticStart !== null ? actual.start - estimate.bestStaticStart : null;
      const opportunity = actual && identityMatches && estimate.bestStaticStart !== null && estimate.bestStaticEnd !== null ? counterfactual(problem, real, safeMeals,
        outcome.participantId, [{ ...actual, start: estimate.bestStaticStart, end: estimate.bestStaticEnd }]) : null;
      return { taskId: estimate.taskId, staticEstimate: structuredClone(estimate), actualStart: actual?.start ?? null, actualEnd: actual?.end ?? null,
        startDisplacement: displacement, absoluteStartDisplacement: displacement === null ? null : Math.abs(displacement),
        minutesEarlier: displacement === null ? null : Math.max(0, -displacement), minutesLater: displacement === null ? null : Math.max(0, displacement), identityMatches, opportunity }; });
    const movable = residualTasks.filter((r) => r.identityMatches && r.staticEstimate.bestStaticStart !== null).map((r) => ({ ...real.find((t) => t.id === r.taskId)!,
      start: r.staticEstimate.bestStaticStart!, end: r.staticEstimate.bestStaticEnd! }));
    const combinedResidualOpportunity = trace ? counterfactual(problem, real, safeMeals, outcome.participantId, movable) : null;
    const complete = [...movable]; if (trace) { const actual = real.find((t) => t.id === trace.feeder.taskId); if (actual) complete.push({ ...actual, start: trace.feeder.idealStart, end: trace.feeder.idealEnd }); }
    const completeStaticOpportunity = trace ? counterfactual(problem, real, safeMeals, outcome.participantId, complete) : null;
    const displacements = residualTasks.flatMap((r) => r.absoluteStartDisplacement === null ? [] : [r.absoluteStartDisplacement]);
    const hardValidStaticTargetCount = residualTasks.filter((r) => r.opportunity?.hardValid).length, blockedStaticTargetCount = residualTasks.filter((r) => r.opportunity && !r.opportunity.hardValid).length;
    const worsened = outcome.deltas.idle > 0;
    return { participantId: outcome.participantId, outcome: worsened ? "WORSENED" : outcome.deltas.idle < 0 ? "IMPROVED" : "UNCHANGED",
      selectedPresenceLowerBound: trace?.key.projectedPresenceLowerBound ?? null, selectedMaximumGapLowerBound: trace?.key.projectedMaximumGapLowerBound ?? null,
      finalPresence: final.presenceSpanMinutes, finalMaximumGap: final.maximumGapMinutes,
      presenceLowerBoundError: trace ? final.presenceSpanMinutes - trace.key.projectedPresenceLowerBound : null,
      maximumGapLowerBoundError: trace ? final.maximumGapMinutes - trace.key.projectedMaximumGapLowerBound : null, feeder, residualTasks,
      feederOpportunity, combinedResidualOpportunity, completeStaticOpportunity, residualTaskDisplacementTotal: displacements.reduce((a, b) => a + b, 0),
      maximumResidualTaskDisplacement: Math.max(0, ...displacements), hardValidStaticTargetCount, blockedStaticTargetCount, incomplete,
      classification: worsened ? classifyDynamicOpportunities(incomplete, feederOpportunity, combinedResidualOpportunity, completeStaticOpportunity) : null };
  }).sort((a, b) => a.participantId.localeCompare(b.participantId));
  const harm = participants.filter((p) => p.outcome === "WORSENED"), allDisplacements = harm.flatMap((p) => p.residualTasks.flatMap((r) => r.absoluteStartDisplacement === null ? [] : [r.absoluteStartDisplacement]));
  const sum = (field: "feederOpportunity" | "combinedResidualOpportunity" | "completeStaticOpportunity", valid: boolean) => harm.reduce((s, p) => { const o = p[field]; return s + (o && o.hardValid === valid && o.idle > 0 ? o.idle : 0); }, 0);
  const aggregates = { harmParticipantCount: harm.length, totalFeederHardValidIdleOpportunity: sum("feederOpportunity", true),
    totalResidualHardValidIdleOpportunity: sum("combinedResidualOpportunity", true), totalCompleteStaticHardValidIdleOpportunity: sum("completeStaticOpportunity", true),
    totalFeederBlockedIdleOpportunity: sum("feederOpportunity", false), totalResidualBlockedIdleOpportunity: sum("combinedResidualOpportunity", false),
    totalCompleteStaticBlockedIdleOpportunity: sum("completeStaticOpportunity", false),
    participantsFeederDominant: harm.filter((p) => p.classification === "FEEDER_DISPLACEMENT_VISIBLE").length,
    participantsResidualDominant: harm.filter((p) => p.classification === "RESIDUAL_DISPLACEMENT_VISIBLE").length,
    participantsMixed: harm.filter((p) => p.classification === "MIXED_DYNAMIC_OPPORTUNITY").length,
    participantsBlocked: harm.filter((p) => p.classification === "STATIC_TARGETS_BLOCKED").length,
    participantsWithoutRecovery: harm.filter((p) => p.classification === "NO_STATIC_RECOVERY").length,
    participantsIncomplete: harm.filter((p) => p.incomplete).length, staticTargetCount: harm.reduce((s, p) => s + p.residualTasks.filter((r) => r.staticEstimate.bestStaticStart !== null).length, 0),
    hardValidStaticTargetCount: harm.reduce((s, p) => s + p.hardValidStaticTargetCount, 0), blockedStaticTargetCount: harm.reduce((s, p) => s + p.blockedStaticTargetCount, 0),
    averageStartDisplacement: allDisplacements.length ? allDisplacements.reduce((a, b) => a + b, 0) / allDisplacements.length : 0,
    maximumStartDisplacement: Math.max(0, ...allDisplacements), maximumFeederDisplacement: Math.max(0, ...harm.map((p) => Math.abs(p.feeder?.actualStartDeltaFromIdeal ?? 0))) };
  const classification: DynamicAuditClassification = aggregates.participantsIncomplete ? "INCOMPLETE_TRACE"
    : aggregates.totalFeederHardValidIdleOpportunity > aggregates.totalResidualHardValidIdleOpportunity && aggregates.totalFeederHardValidIdleOpportunity > 0 ? "FEEDER_DOMINANT"
    : aggregates.totalResidualHardValidIdleOpportunity > aggregates.totalFeederHardValidIdleOpportunity && aggregates.totalResidualHardValidIdleOpportunity > 0 ? "STANDALONE_DOMINANT"
    : aggregates.totalFeederHardValidIdleOpportunity > 0 ? "MIXED"
    : aggregates.totalFeederBlockedIdleOpportunity + aggregates.totalResidualBlockedIdleOpportunity + aggregates.totalCompleteStaticBlockedIdleOpportunity > 0 ? "STATIC_TARGETS_BLOCKED" : "NO_STATIC_RECOVERY";
  const recommendations: Record<DynamicAuditClassification, DynamicAuditRecommendation> = { FEEDER_DOMINANT: "EXPERIMENT_DYNAMIC_FEEDER_START_ORDER", STANDALONE_DOMINANT: "EXPERIMENT_FAIR_STANDALONE_DFS_ORDER",
    MIXED: "COMPARE_FEEDER_AND_STANDALONE_SEPARATELY", STATIC_TARGETS_BLOCKED: "STUDY_DYNAMIC_COMPETITION_OR_COMPLETE_LEAVES",
    NO_STATIC_RECOVERY: "STUDY_DIFFERENT_DYNAMIC_MODEL", INCOMPLETE_TRACE: "REPAIR_DYNAMIC_TRACEABILITY" };
  const canonical = { participants, aggregates, classification, recommendation: recommendations[classification], nonAdditiveDiagnostic: true as const };
  return { ...canonical, dynamicErrorAuditFingerprint: createHash("sha256").update(JSON.stringify(canonical)).digest("hex") };
}
