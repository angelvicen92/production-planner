import type { ExpandedCanonicalFullA2Template, ParticipantId } from "./types";

export const A2_PLANNING_QUALITY_CONTRACT_VERSION = "A2.planning-quality.v1" as const;

export interface NormalizedPlanningInterval {
  readonly taskId: string;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

export interface QualityWindow {
  readonly start: number;
  readonly end: number;
}

export interface NormalizedPlanningPreparation {
  readonly id: string;
  readonly kind: "setup_preparation" | "round_preparation";
  readonly spaceId: string;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

export interface PlanningQualityConfiguration {
  readonly authorizedMainFlowBreaks?: readonly QualityWindow[];
  readonly scheduledPreparations?: readonly NormalizedPlanningPreparation[];
}

export interface AvailableKpi<T> { readonly status: "AVAILABLE"; readonly value: T; }
export interface BlockedKpi { readonly status: "BLOCKED_BY_CONFIGURATION"; readonly missing: readonly string[]; readonly explanation: string; }
export type KpiResult<T> = AvailableKpi<T> | BlockedKpi;

export interface MainFlowQuality {
  readonly firstStart: number; readonly lastEnd: number; readonly productiveMinutes: number; readonly authorizedPauseMinutes: number;
  readonly unauthorizedGapMinutes: number; readonly unauthorizedGapCount: number; readonly maximumUnauthorizedGapMinutes: number; readonly continuityRatio: number;
}

export interface MakespanQuality {
  readonly firstCanonicalObligationStart: number; readonly lastCanonicalObligationEnd: number; readonly makespanMinutes: number;
  readonly mainFlowEnd: number; readonly finalEndBySpaceId: Readonly<Record<string, number>>;
}

export interface ParticipantPresenceQuality {
  readonly totalMinutes: number; readonly meanMinutes: number; readonly medianMinutes: number; readonly p90Minutes: number;
  readonly maximumMinutes: number; readonly byParticipantId: Readonly<Record<ParticipantId, number>>;
}

export interface BlocksSetupsQuality {
  readonly mainBlockCount: number;
  readonly mainBlocksByCoachId: Readonly<Record<string, number>>;
  readonly mainBlockLimitViolationCount: number;
  readonly setupFamilyBlockCount: number;
  readonly setupFamilyBlocksByFamilyId: Readonly<Record<string, number>>;
  readonly setupSwitchCount: number;
  readonly setupReentryCount: number;
  readonly preparationCount: number;
  readonly setupPreparationCount: number;
  readonly roundPreparationCount: number;
  readonly preparationMinutes: number;
  readonly setupPreparationMinutes: number;
  readonly roundPreparationMinutes: number;
}

export interface SpecialOperationQuality {
  readonly anchoredOperationCount: number; readonly anchoredViolationCount: number; readonly jointOperationCount: number; readonly jointViolationCount: number;
  readonly technicalChainCount: number; readonly technicalChainViolationCount: number; readonly synchronizedTotalesRoundCount: number;
  readonly totalesSynchronizationViolationCount: number; readonly residualTotales1RoundCount: number; readonly residualTotalesCoreoRoundCount: number;
  readonly completeAndSynchronized: boolean;
}

export interface PlanningQualityReport {
  readonly contractVersion: typeof A2_PLANNING_QUALITY_CONTRACT_VERSION;
  readonly identity: { readonly expectedTaskCount: number; readonly actualTaskCount: number; readonly exactCanonicalTaskSet: boolean; };
  readonly kpis: {
    readonly P01_MAIN_FLOW_CONTINUITY: KpiResult<MainFlowQuality>;
    readonly P02_MAKESPAN: KpiResult<MakespanQuality>;
    readonly P03_PARTICIPANT_PRESENCE: KpiResult<ParticipantPresenceQuality>;
    readonly P04_AVOIDABLE_PARTICIPANT_WAIT: BlockedKpi;
    readonly P05_CRITICAL_RESOURCE_PRESENCE: BlockedKpi;
    readonly P06_SPACE_CONTINUITY_UTILIZATION: BlockedKpi;
    readonly P07_BLOCKS_SETUPS: KpiResult<BlocksSetupsQuality>;
    readonly P08_MOVES_ZONES: BlockedKpi;
    readonly P09_SPECIAL_SYNCHRONIZATION: KpiResult<SpecialOperationQuality>;
    readonly P10_ROBUSTNESS_SLACK: BlockedKpi;
  };
  readonly comparisonReady: boolean;
}

const available = <T>(value: T): AvailableKpi<T> => Object.freeze({ status: "AVAILABLE" as const, value: deepFreeze(value) });
const blocked = (missing: readonly string[], explanation: string): BlockedKpi => Object.freeze({ status: "BLOCKED_BY_CONFIGURATION" as const, missing: Object.freeze([...missing].sort()), explanation });

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value as Record<string, unknown>).forEach(deepFreeze); }
  return value;
}

function overlapMinutes(a: QualityWindow, b: QualityWindow): number { return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)); }

function validateIntervals(expanded: ExpandedCanonicalFullA2Template, intervals: readonly NormalizedPlanningInterval[]): { exact: boolean; byId: Map<string, NormalizedPlanningInterval> } {
  const byId = new Map<string, NormalizedPlanningInterval>();
  for (const interval of intervals) { if (byId.has(interval.taskId)) return { exact: false, byId }; byId.set(interval.taskId, interval); }
  const exact = intervals.length === expanded.taskIds.length && expanded.taskIds.every((id) => byId.has(id)) && intervals.every(({ taskId }) => expanded.taskIds.includes(taskId));
  return { exact, byId };
}

function mainFlowQuality(expanded: ExpandedCanonicalFullA2Template, byId: ReadonlyMap<string, NormalizedPlanningInterval>, breaks: readonly QualityWindow[] | undefined): KpiResult<MainFlowQuality> {
  if (!breaks) return blocked(["authorized_main_flow_breaks"], "P01 cannot distinguish authorized pauses from unauthorized gaps without the effective main-flow break configuration.");
  const main = expanded.tasks.filter(({ type }) => type === "ENSAYO_ESTUDIO_7").map(({ id }) => byId.get(id)).filter((interval): interval is NormalizedPlanningInterval => interval !== undefined).sort((left, right) => left.start - right.start || left.taskId.localeCompare(right.taskId, "en"));
  if (main.length === 0) return available({ firstStart: 0, lastEnd: 0, productiveMinutes: 0, authorizedPauseMinutes: 0, unauthorizedGapMinutes: 0, unauthorizedGapCount: 0, maximumUnauthorizedGapMinutes: 0, continuityRatio: 1 });
  let authorizedPauseMinutes = 0, unauthorizedGapMinutes = 0, unauthorizedGapCount = 0, maximumUnauthorizedGapMinutes = 0;
  for (let index = 1; index < main.length; index += 1) {
    const previous = main[index - 1]!, current = main[index]!, gap = Math.max(0, current.start - previous.end);
    if (gap === 0) continue;
    const gapWindow = { start: previous.end, end: current.start };
    const authorized = Math.min(gap, breaks.reduce((sum, item) => sum + overlapMinutes(gapWindow, item), 0));
    const unauthorized = Math.max(0, gap - authorized);
    authorizedPauseMinutes += authorized; unauthorizedGapMinutes += unauthorized;
    if (unauthorized > 0) { unauthorizedGapCount += 1; maximumUnauthorizedGapMinutes = Math.max(maximumUnauthorizedGapMinutes, unauthorized); }
  }
  const productiveMinutes = main.reduce((sum, interval) => sum + interval.duration, 0), continuityDenominator = productiveMinutes + unauthorizedGapMinutes;
  return available({ firstStart: main[0]!.start, lastEnd: main.at(-1)!.end, productiveMinutes, authorizedPauseMinutes, unauthorizedGapMinutes, unauthorizedGapCount, maximumUnauthorizedGapMinutes, continuityRatio: continuityDenominator === 0 ? 1 : productiveMinutes / continuityDenominator });
}

function makespanQuality(expanded: ExpandedCanonicalFullA2Template, intervals: readonly NormalizedPlanningInterval[], byId: ReadonlyMap<string, NormalizedPlanningInterval>): MakespanQuality {
  const firstCanonicalObligationStart = Math.min(...intervals.map(({ start }) => start));
  const lastCanonicalObligationEnd = Math.max(...intervals.map(({ end }) => end));
  const mainFlowEnd = Math.max(...expanded.tasks.filter(({ type }) => type === "ENSAYO_ESTUDIO_7").map(({ id }) => byId.get(id)!.end));
  const finalEndBySpaceId: Record<string, number> = {}, taskById = new Map(expanded.tasks.map((task) => [task.id, task] as const));
  for (const interval of intervals) { const spaceId = taskById.get(interval.taskId)!.spaceId; finalEndBySpaceId[spaceId] = Math.max(finalEndBySpaceId[spaceId] ?? Number.NEGATIVE_INFINITY, interval.end); }
  return { firstCanonicalObligationStart, lastCanonicalObligationEnd, makespanMinutes: lastCanonicalObligationEnd - firstCanonicalObligationStart, mainFlowEnd, finalEndBySpaceId: Object.fromEntries(Object.entries(finalEndBySpaceId).sort(([left], [right]) => left.localeCompare(right, "en"))) };
}

function percentileNearestRank(values: readonly number[], percentile: number): number { const sorted = [...values].sort((left, right) => left - right); return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)]!; }

function participantPresenceQuality(expanded: ExpandedCanonicalFullA2Template, intervals: readonly NormalizedPlanningInterval[]): ParticipantPresenceQuality {
  const taskById = new Map(expanded.tasks.map((task) => [task.id, task] as const));
  const byParticipantId = Object.fromEntries(expanded.participants.map((participantId) => {
    const owned = intervals.filter(({ taskId }) => taskById.get(taskId)?.participantId === participantId);
    return [participantId, Math.max(...owned.map((interval) => interval.end)) - Math.min(...owned.map((interval) => interval.start))];
  })) as Record<ParticipantId, number>;
  const values = Object.values(byParticipantId).sort((left, right) => left - right), totalMinutes = values.reduce((sum, value) => sum + value, 0), middle = Math.floor(values.length / 2);
  return { totalMinutes, meanMinutes: totalMinutes / values.length, medianMinutes: values.length % 2 === 1 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2, p90Minutes: percentileNearestRank(values, 0.9), maximumMinutes: Math.max(...values), byParticipantId };
}

function countRuns(values: readonly string[]): { total: number; byValue: Record<string, number>; switches: number; reentries: number } {
  const byValue: Record<string, number> = {}, seen = new Set<string>(); let previous: string | null = null, total = 0, switches = 0, reentries = 0;
  for (const value of values) {
    if (value === previous) continue;
    total += 1; byValue[value] = (byValue[value] ?? 0) + 1; if (previous !== null) switches += 1; if (seen.has(value)) reentries += 1; seen.add(value); previous = value;
  }
  return { total, byValue, switches, reentries };
}

function blocksSetupsQuality(expanded: ExpandedCanonicalFullA2Template, byId: ReadonlyMap<string, NormalizedPlanningInterval>, preparations: readonly NormalizedPlanningPreparation[] | undefined): KpiResult<BlocksSetupsQuality> {
  if (!preparations) return blocked(["scheduled_setup_preparations", "scheduled_round_preparations"], "P07 requires explicit scheduled preparation occupations; it does not infer setup work from idle gaps.");
  const mainCoachSequence = expanded.tasks.filter(({ type }) => type === "ENSAYO_ESTUDIO_7").map((task) => ({ task, interval: byId.get(task.id)! })).sort((left, right) => left.interval.start - right.interval.start || left.task.id.localeCompare(right.task.id, "en")).map(({ task }) => task.blockKey ?? "UNASSIGNED");
  const mainRuns = countRuns(mainCoachSequence);
  const mainBlockLimitViolationCount = 0;
  const setupSequence = expanded.tasks.filter((task) => task.setupFamilyId !== undefined).map((task) => ({ task, interval: byId.get(task.id)! })).sort((left, right) => left.interval.start - right.interval.start || left.task.id.localeCompare(right.task.id, "en")).map(({ task }) => task.setupFamilyId!);
  const setupRuns = countRuns(setupSequence), setupPreparations = preparations.filter(({ kind }) => kind === "setup_preparation"), roundPreparations = preparations.filter(({ kind }) => kind === "round_preparation");
  return available({
    mainBlockCount: mainRuns.total,
    mainBlocksByCoachId: Object.fromEntries(Object.entries(mainRuns.byValue).sort(([left], [right]) => left.localeCompare(right, "en"))),
    mainBlockLimitViolationCount,
    setupFamilyBlockCount: setupRuns.total,
    setupFamilyBlocksByFamilyId: Object.fromEntries(Object.entries(setupRuns.byValue).sort(([left], [right]) => left.localeCompare(right, "en"))),
    setupSwitchCount: setupRuns.switches,
    setupReentryCount: setupRuns.reentries,
    preparationCount: preparations.length,
    setupPreparationCount: setupPreparations.length,
    roundPreparationCount: roundPreparations.length,
    preparationMinutes: preparations.reduce((sum, preparation) => sum + preparation.duration, 0),
    setupPreparationMinutes: setupPreparations.reduce((sum, preparation) => sum + preparation.duration, 0),
    roundPreparationMinutes: roundPreparations.reduce((sum, preparation) => sum + preparation.duration, 0),
  });
}

function specialOperationQuality(expanded: ExpandedCanonicalFullA2Template, byId: ReadonlyMap<string, NormalizedPlanningInterval>): SpecialOperationQuality {
  let anchoredViolationCount = 0;
  for (const operation of expanded.anchoredOperations) {
    const ordered = operation.orderedTaskIds.map((id) => byId.get(id));
    if (ordered.some((interval) => interval === undefined)) { anchoredViolationCount += 1; continue; }
    for (let index = 1; index < ordered.length; index += 1) if (ordered[index - 1]!.end !== ordered[index]!.start) anchoredViolationCount += 1;
  }
  let jointViolationCount = 0;
  for (const operation of expanded.jointOperations) {
    const intervals = operation.taskIds.map((id) => byId.get(id)), first = intervals[0];
    if (!first || intervals.some((interval) => !interval || interval.start !== first.start || interval.end !== first.end)) jointViolationCount += 1;
    if (operation.sequenceAfterJointGroupId) {
      const previous = expanded.jointOperations.find(({ id }) => id === operation.sequenceAfterJointGroupId);
      const previousEnd = previous?.taskIds.map((id) => byId.get(id)?.end).find((value) => value !== undefined);
      if (previousEnd === undefined || first === undefined || previousEnd !== first.start) jointViolationCount += 1;
    }
  }
  let technicalChainViolationCount = 0;
  for (const chain of expanded.technicalChains) {
    const ordered = chain.orderedTaskIds.map((id) => byId.get(id));
    if (ordered.some((interval) => interval === undefined)) { technicalChainViolationCount += 1; continue; }
    for (let index = 1; index < ordered.length; index += 1) if (ordered[index - 1]!.end !== ordered[index]!.start) technicalChainViolationCount += 1;
  }
  const starts = (type: "TOTALES_1" | "TOTALES_COREO") => expanded.tasks.filter((task) => task.type === type).map(({ id }) => byId.get(id)!.start).sort((left, right) => left - right);
  const totales1 = starts("TOTALES_1"), coreo = starts("TOTALES_COREO"), paired = Math.min(totales1.length, coreo.length); let totalesSynchronizationViolationCount = 0;
  for (let index = 0; index < paired; index += 1) if (totales1[index] !== coreo[index]) totalesSynchronizationViolationCount += 1;
  return {
    anchoredOperationCount: expanded.anchoredOperations.length, anchoredViolationCount,
    jointOperationCount: expanded.jointOperations.length, jointViolationCount,
    technicalChainCount: expanded.technicalChains.length, technicalChainViolationCount,
    synchronizedTotalesRoundCount: paired - totalesSynchronizationViolationCount, totalesSynchronizationViolationCount,
    residualTotales1RoundCount: Math.max(0, totales1.length - paired), residualTotalesCoreoRoundCount: Math.max(0, coreo.length - paired),
    completeAndSynchronized: anchoredViolationCount === 0 && jointViolationCount === 0 && technicalChainViolationCount === 0 && totalesSynchronizationViolationCount === 0,
  };
}

export function evaluatePlanningQuality(expanded: ExpandedCanonicalFullA2Template, intervals: readonly NormalizedPlanningInterval[], configuration: PlanningQualityConfiguration = {}): PlanningQualityReport {
  const identity = validateIntervals(expanded, intervals);
  if (!identity.exact) throw new Error("Planning quality evaluator requires the exact canonical task identity set before KPI computation.");
  const kpis = {
    P01_MAIN_FLOW_CONTINUITY: mainFlowQuality(expanded, identity.byId, configuration.authorizedMainFlowBreaks),
    P02_MAKESPAN: available(makespanQuality(expanded, intervals, identity.byId)),
    P03_PARTICIPANT_PRESENCE: available(participantPresenceQuality(expanded, intervals)),
    P04_AVOIDABLE_PARTICIPANT_WAIT: blocked(["avoidable_wait_classification"], "P04 requires an explicit breakdown of mandatory meal, hard transition, hard preparation and structurally unavoidable waiting before avoidable waiting can be measured."),
    P05_CRITICAL_RESOURCE_PRESENCE: blocked(["effective_resource_assignments", "relevant_resource_policy", "avoidable_resource_wait_classification"], "P05 is blocked until effective resource assignments and relevance/presence policy are supplied for the evaluated planning."),
    P06_SPACE_CONTINUITY_UTILIZATION: blocked(["effective_space_capacity", "space_continuity_policy", "authorized_space_occupations"], "P06 must not infer capacity or continuity from labels; effective day configuration is required."),
    P07_BLOCKS_SETUPS: blocksSetupsQuality(expanded, identity.byId, configuration.scheduledPreparations),
    P08_MOVES_ZONES: blocked(["effective_zone_by_space", "transition_contracts"], "P08 requires effective spatial hierarchy and transition contracts to distinguish mandatory from avoidable moves."),
    P09_SPECIAL_SYNCHRONIZATION: available(specialOperationQuality(expanded, identity.byId)),
    P10_ROBUSTNESS_SLACK: blocked(["robustness_threshold", "effective_transition_slack"], "P10 requires the configured robustness threshold and effective hard-transition slack; no A2-specific threshold is assumed."),
  } as const;
  const comparisonReady = Object.values(kpis).every((kpi) => kpi.status === "AVAILABLE");
  return deepFreeze({ contractVersion: A2_PLANNING_QUALITY_CONTRACT_VERSION, identity: { expectedTaskCount: expanded.taskIds.length, actualTaskCount: intervals.length, exactCanonicalTaskSet: identity.exact }, kpis, comparisonReady });
}
