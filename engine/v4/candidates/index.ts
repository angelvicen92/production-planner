import { generatePlanV3 } from "../../v3";
import type { EngineInput, EngineOutput, TaskInput } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import type { V4StrategicAnalysis } from "../analysis";
import { buildV4GuidedInput, type V4GuidedOrderingDiagnostics } from "../guidedInput";
import { improveMainFlowContinuity, type MainFlowImprovementDiagnostics } from "../improvement";
import { buildMainFlowFirstPlan, type MainFlowFirstDiagnostics } from "../mainFlowScheduler";
import { buildProductionWavePlan, type ProductionWaveDiagnostics } from "../productionWaveScheduler";
import { buildV4NativeRemainderPlan, type V4NativeRemainderDiagnostics } from "../nativeScheduler";
import { buildV4NativeCriticalCorePlan, type V4NativeCriticalCoreDiagnostics } from "../nativeCriticalCoreScheduler";
import { evaluateV4PlanQuality, type V4PlanQualityEvaluation } from "../quality";
import { buildMainFlowSequenceVariants, type MainFlowSequenceSearchDiagnostics } from "../mainFlowSequenceSearch";

export type V4CandidateStrategyId =
  | "strategy_baseline_v3_order"
  | "strategy_main_flow_guided"
  | "strategy_critical_resources_first"
  | "strategy_critical_talents_first"
  | "strategy_v4_main_flow_first"
  | "strategy_v4_production_wave"
  | "strategy_v4_native_critical_core"
  | "strategy_v4_native_remainder"
  | `strategy_v4_production_wave__${string}`
  | `strategy_v4_native_critical_core__${string}`;

export interface V4CandidateDiagnostic {
  strategyId: V4CandidateStrategyId;
  sequenceVariantId?: string;
  plannedTasks: number;
  unplannedTasks: number;
  qualityScore: number;
  mainFlowGapMinutes: number;
  makespan: string | null;
  selected: boolean;
  hardFeasible: boolean;
  talentStayMinutes: number;
  guidedOrdering: V4GuidedOrderingDiagnostics;
  qualityBeforeImprovement: V4PlanQualityEvaluation;
  quality: V4PlanQualityEvaluation;
  mainFlowImprovement: MainFlowImprovementDiagnostics;
  mainFlowFirstScheduler?: MainFlowFirstDiagnostics;
  productionWaveScheduler?: ProductionWaveDiagnostics;
  nativeRemainderScheduler?: V4NativeRemainderDiagnostics;
  nativeCriticalCoreScheduler?: V4NativeCriticalCoreDiagnostics;
}

export interface V4CandidateRunnerDiagnostics {
  applied: boolean;
  bestStrategyId: V4CandidateStrategyId | null;
  candidateCount: number;
  candidates: V4CandidateDiagnostic[];
  mainFlowSequenceSearch?: MainFlowSequenceSearchDiagnostics;
}

export interface V4CandidateRunnerResult {
  bestOutput: EngineOutput;
  bestQuality: V4PlanQualityEvaluation;
  bestStrategyId: V4CandidateStrategyId;
  candidatesDiagnostics: V4CandidateRunnerDiagnostics;
  baselineOutput: EngineOutput;
  bestGuidedOrdering: V4GuidedOrderingDiagnostics;
  bestMainFlowImprovement: MainFlowImprovementDiagnostics;
  bestQualityBeforeImprovement: V4PlanQualityEvaluation;
}

const STRATEGY_ORDER: V4CandidateStrategyId[] = [
  "strategy_baseline_v3_order",
  "strategy_main_flow_guided",
  "strategy_critical_resources_first",
  "strategy_critical_talents_first",
  "strategy_v4_main_flow_first",
  "strategy_v4_production_wave",
  "strategy_v4_native_critical_core",
  "strategy_v4_native_remainder",
];
const MAX_DEFAULT_STRATEGIES = 16;
interface V4CandidateRunnerOptions extends EngineV3Options { enabledStrategies?: V4CandidateStrategyId[]; maxRuntimeMs?: number; }
const INF = Number.POSITIVE_INFINITY;

function emptyGuidedOrdering(reason: string): V4GuidedOrderingDiagnostics {
  return { applied: false, reorderedTaskCount: 0, priorityBuckets: [], topOrderedTasks: [], reason };
}

function uniqueNumbers(values: unknown[]): number[] {
  return [...new Set(values.map(Number).filter(Number.isFinite))];
}

function taskResourceIds(task: TaskInput): number[] {
  return uniqueNumbers([
    ...Object.keys(task.resourceRequirements?.byItem ?? {}),
    ...(task.resourceRequirements?.anyOf ?? []).flatMap((group) => group.resourceItemIds ?? []),
    ...(task.assignedResourceIds ?? []),
  ]);
}

function reorderPending(input: EngineInput, compare: (a: TaskInput, b: TaskInput, ai: number, bi: number) => number): EngineInput {
  const pending = (input.tasks ?? []).map((task, index) => ({ task, index })).filter(({ task }) => task.status === "pending");
  const ordered = [...pending].sort((a, b) => compare(a.task, b.task, a.index, b.index)).map(({ task }) => task);
  const queue = [...ordered];
  return { ...input, tasks: (input.tasks ?? []).map((task) => task.status === "pending" ? queue.shift() ?? task : task) };
}

function baseStrategyId(strategyId: V4CandidateStrategyId): V4CandidateStrategyId { return String(strategyId).split("__")[0] as V4CandidateStrategyId; }
function buildStrategyInput(strategyId: V4CandidateStrategyId, input: EngineInput, strategicAnalysis: V4StrategicAnalysis): { input: EngineInput; guidedOrdering: V4GuidedOrderingDiagnostics } {
  strategyId = baseStrategyId(strategyId);
  if (strategyId === "strategy_baseline_v3_order") {
    return { input, guidedOrdering: emptyGuidedOrdering("Baseline V3 order: original pending task order without V4 guided ordering.") };
  }
  if (strategyId === "strategy_main_flow_guided" || strategyId === "strategy_v4_main_flow_first" || strategyId === "strategy_v4_production_wave" || strategyId === "strategy_v4_native_remainder" || strategyId === "strategy_v4_native_critical_core") return buildV4GuidedInput(input, strategicAnalysis);

  const guided = buildV4GuidedInput(input, strategicAnalysis);
  const guidedRank = new Map((guided.input.tasks ?? []).filter((task) => task.status === "pending").map((task, index) => [Number(task.id), index]));
  if (strategyId === "strategy_critical_resources_first") {
    const resourceRank = new Map((strategicAnalysis.criticalResources ?? []).map((item, index) => [item.id, index]));
    const candidateInput = reorderPending(input, (a, b, ai, bi) => {
      const ar = taskResourceIds(a).map((id) => resourceRank.get(id)).filter((rank): rank is number => rank !== undefined);
      const br = taskResourceIds(b).map((id) => resourceRank.get(id)).filter((rank): rank is number => rank !== undefined);
      const amin = ar.length ? Math.min(...ar) : INF;
      const bmin = br.length ? Math.min(...br) : INF;
      return amin - bmin || (guidedRank.get(a.id) ?? INF) - (guidedRank.get(b.id) ?? INF) || ai - bi;
    });
    return { input: candidateInput, guidedOrdering: { ...guided.guidedOrdering, reason: "V4 strategy prioritized tasks consuming critical resources, then main-flow guided order." } };
  }

  const talentRank = new Map((strategicAnalysis.criticalTalents ?? []).map((item, index) => [item.id, index]));
  const candidateInput = reorderPending(input, (a, b, ai, bi) => {
    const ar = talentRank.get(Number(a.contestantId)) ?? INF;
    const br = talentRank.get(Number(b.contestantId)) ?? INF;
    return ar - br || (guidedRank.get(a.id) ?? INF) - (guidedRank.get(b.id) ?? INF) || ai - bi;
  });
  return { input: candidateInput, guidedOrdering: { ...guided.guidedOrdering, reason: "V4 strategy prioritized tasks for critical talents, then main-flow guided order." } };
}

function plannedCount(output: EngineOutput): number { return Array.isArray(output.plannedTasks) ? output.plannedTasks.length : 0; }
function unplannedCount(output: EngineOutput): number { return Array.isArray(output.unplanned) ? output.unplanned.length : 0; }
function minutesFromHHMM(value: string | null): number { const [h, m] = String(value ?? "").split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : INF; }

function compareCandidates(a: V4CandidateDiagnostic, b: V4CandidateDiagnostic): number {
  return Number(b.hardFeasible) - Number(a.hardFeasible)
    || a.unplannedTasks - b.unplannedTasks
    || a.mainFlowGapMinutes - b.mainFlowGapMinutes
    || minutesFromHHMM(a.makespan) - minutesFromHHMM(b.makespan)
    || b.qualityScore - a.qualityScore
    || a.talentStayMinutes - b.talentStayMinutes
    || STRATEGY_ORDER.indexOf(baseStrategyId(a.strategyId)) - STRATEGY_ORDER.indexOf(baseStrategyId(b.strategyId));
}

export function runV4CandidateStrategies(input: EngineInput, strategicAnalysis: V4StrategicAnalysis, options?: V4CandidateRunnerOptions): V4CandidateRunnerResult {
  const started = Date.now();
  const maxRuntimeMs = Number(options?.maxRuntimeMs ?? Number.POSITIVE_INFINITY);
  const sequenceSearch = buildMainFlowSequenceVariants(input, strategicAnalysis, { maxSequenceVariants: (options as any)?.v4Profile === "aggressive" ? 6 : 4 });
  const variantById = new Map(sequenceSearch.variants.map((variant) => [variant.id, variant]));
  const enabled = Array.isArray(options?.enabledStrategies) && options.enabledStrategies.length ? options.enabledStrategies : STRATEGY_ORDER;
  const expanded: V4CandidateStrategyId[] = [];
  for (const strategy of enabled) {
    if (strategy === "strategy_v4_production_wave") {
      expanded.push(strategy);
      for (const id of ["pressure_default", "earliest_deadline_first", "critical_resources_first", ...(((options as any)?.v4Profile === "aggressive") ? sequenceSearch.variants.map((v) => v.id) : [])]) if (variantById.has(id)) expanded.push(`strategy_v4_production_wave__${id}` as V4CandidateStrategyId);
    } else if (strategy === "strategy_v4_native_critical_core") {
      expanded.push(strategy);
      for (const id of ["balanced_hybrid", ...(((options as any)?.v4Profile === "aggressive") ? sequenceSearch.variants.map((v) => v.id) : [])]) if (variantById.has(id)) expanded.push(`strategy_v4_native_critical_core__${id}` as V4CandidateStrategyId);
    } else expanded.push(strategy);
  }
  const strategies = [...new Set(expanded)].filter((strategy) => STRATEGY_ORDER.includes(baseStrategyId(strategy))).slice(0, MAX_DEFAULT_STRATEGIES);
  const candidates: Array<any> = [];
  for (const strategyId of strategies) {
    if (Date.now() - started >= maxRuntimeMs && candidates.length > 0) break;
    const candidate = buildStrategyInput(strategyId, input, strategicAnalysis);
    const base = baseStrategyId(strategyId);
    const sequenceVariantId = String(strategyId).includes("__") ? String(strategyId).split("__")[1] : undefined;
    const sequenceOverride = sequenceVariantId ? variantById.get(sequenceVariantId) : undefined;
    const strategyOptions = sequenceOverride ? { ...(options as any), sequenceOverride } : options;
    const mainFlowFirst = base === "strategy_v4_main_flow_first" ? buildMainFlowFirstPlan(input, strategicAnalysis, options) : null;
    const productionWave = base === "strategy_v4_production_wave" ? buildProductionWavePlan(input, strategicAnalysis, strategyOptions) : null;
    const nativeCriticalCore = base === "strategy_v4_native_critical_core" ? buildV4NativeCriticalCorePlan(input, strategicAnalysis, strategyOptions as any) : null;
    const nativeRemainder = base === "strategy_v4_native_remainder" ? buildV4NativeRemainderPlan(input, strategicAnalysis, options) : null;
    const candidateInput = nativeCriticalCore?.delegatedInput ?? productionWave?.delegatedInput ?? mainFlowFirst?.delegatedInput ?? candidate.input;
    const initialOutput = nativeCriticalCore?.output ?? nativeRemainder?.output ?? productionWave?.output ?? mainFlowFirst?.output ?? generatePlanV3(candidateInput, options);
    const initialQuality = evaluateV4PlanQuality(candidateInput, initialOutput, strategicAnalysis);
    const improved = improveMainFlowContinuity(candidateInput, initialOutput, strategicAnalysis, initialQuality);
    const quality = evaluateV4PlanQuality(candidateInput, improved.output, strategicAnalysis);
    candidates.push({ strategyId, sequenceVariantId, candidateInput, output: improved.output, guidedOrdering: candidate.guidedOrdering, qualityBeforeImprovement: initialQuality, quality, mainFlowImprovement: improved.improvementDiagnostics, mainFlowFirstScheduler: mainFlowFirst?.diagnostics, productionWaveScheduler: productionWave?.diagnostics, nativeRemainderScheduler: nativeRemainder?.diagnostics, nativeCriticalCoreScheduler: nativeCriticalCore?.diagnostics });
  }

  let bestIndex = 0;
  const diagnostics = candidates.map((candidate): V4CandidateDiagnostic => ({
    strategyId: candidate.strategyId,
    sequenceVariantId: candidate.sequenceVariantId,
    plannedTasks: plannedCount(candidate.output),
    unplannedTasks: unplannedCount(candidate.output),
    qualityScore: candidate.quality.qualityScore,
    mainFlowGapMinutes: candidate.quality.mainFlowQuality?.internalGapMinutes ?? 0,
    makespan: candidate.quality.makespan.lastTaskEnd,
    selected: false,
    hardFeasible: candidate.output.hardFeasible !== false,
    talentStayMinutes: candidate.quality.talentStayTime.totalStayMinutes,
    guidedOrdering: candidate.guidedOrdering,
    qualityBeforeImprovement: candidate.qualityBeforeImprovement,
    quality: candidate.quality,
    mainFlowImprovement: candidate.mainFlowImprovement,
    mainFlowFirstScheduler: candidate.mainFlowFirstScheduler,
    productionWaveScheduler: candidate.productionWaveScheduler,
    nativeRemainderScheduler: candidate.nativeRemainderScheduler,
    nativeCriticalCoreScheduler: candidate.nativeCriticalCoreScheduler,
  }));
  const baseline = diagnostics.find((item) => item.strategyId === "strategy_baseline_v3_order");
  for (const item of diagnostics) {
    if (!baseline) continue;
    const itemBaseStrategy = baseStrategyId(item.strategyId);
    const isNativeRemainder = itemBaseStrategy === "strategy_v4_native_remainder";
    const isNativeCriticalCore = itemBaseStrategy === "strategy_v4_native_critical_core";
    if (!isNativeRemainder && !isNativeCriticalCore) continue;
    const makespanAllowance = isNativeCriticalCore ? 15 : 30;
    const worseThanBaseline = item.unplannedTasks > baseline.unplannedTasks
      || item.mainFlowGapMinutes > baseline.mainFlowGapMinutes
      || minutesFromHHMM(item.makespan) > minutesFromHHMM(baseline.makespan) + makespanAllowance
      || item.hardFeasible === false;
    if (worseThanBaseline && item.nativeCriticalCoreScheduler) {
      item.hardFeasible = false;
      item.nativeCriticalCoreScheduler = {
        ...item.nativeCriticalCoreScheduler,
        applied: false,
        discarded: true,
        infeasible: item.nativeCriticalCoreScheduler.infeasible || item.hardFeasible === false,
        reason: item.nativeCriticalCoreScheduler.reason ?? "Native critical core discarded by candidate runner acceptance gate.",
        warnings: [...(item.nativeCriticalCoreScheduler.warnings ?? []), "Native critical core discarded: worse than V3 baseline on unplanned tasks, main-flow continuity, makespan or hard feasibility."],
      };
    }
    if (worseThanBaseline && item.nativeRemainderScheduler) {
      item.hardFeasible = false;
      item.nativeRemainderScheduler = {
        ...item.nativeRemainderScheduler,
        applied: false,
        discarded: true,
        infeasible: item.nativeRemainderScheduler.infeasible || item.hardFeasible === false,
        reason: item.nativeRemainderScheduler.reason ?? "Native remainder discarded by candidate runner quality gate.",
        warnings: [...(item.nativeRemainderScheduler.warnings ?? []), "Native remainder discarded: worse than V3 baseline on unplanned tasks, main-flow continuity, makespan or hard feasibility."],
      };
    }
  }
  for (let i = 1; i < diagnostics.length; i += 1) if (compareCandidates(diagnostics[i], diagnostics[bestIndex]) < 0) bestIndex = i;
  diagnostics[bestIndex].selected = true;
  const best = candidates[bestIndex];
  const baselineOutput = candidates.find((candidate) => candidate.strategyId === "strategy_baseline_v3_order")?.output ?? best.output;
  return {
    bestOutput: best.output,
    bestQuality: best.quality,
    bestStrategyId: best.strategyId,
    bestGuidedOrdering: best.guidedOrdering,
    bestMainFlowImprovement: best.mainFlowImprovement,
    bestQualityBeforeImprovement: best.qualityBeforeImprovement,
    baselineOutput,
    candidatesDiagnostics: { applied: true, bestStrategyId: best.strategyId, candidateCount: diagnostics.length, candidates: diagnostics, mainFlowSequenceSearch: { ...sequenceSearch.diagnostics, selectedVariantId: diagnostics[bestIndex].sequenceVariantId ?? null } },
  };
}
