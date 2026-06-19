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
  runtimeMs: number;
  skipped: boolean;
  skipReason: string | null;
  timedOut: boolean;
}

export interface V4StrategyPortfolioDiagnostics {
  profile: string;
  requestedMaxStrategies: number;
  finalStrategies: V4CandidateStrategyId[];
  mustRunStrategies: V4CandidateStrategyId[];
  missingMustRunStrategies: V4CandidateStrategyId[];
}

export interface V4CandidateRunnerDiagnostics {
  applied: boolean;
  bestStrategyId: V4CandidateStrategyId | null;
  candidateCount: number;
  skippedCount: number;
  budgetExceeded: boolean;
  candidates: V4CandidateDiagnostic[];
  mainFlowSequenceSearch?: MainFlowSequenceSearchDiagnostics;
  portfolio?: V4StrategyPortfolioDiagnostics;
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
const PROFILE_MAX_STRATEGIES: Record<string, number> = { safe: 4, balanced: 6, aggressive: 12 };
const PROFILE_SEQUENCE_VARIANTS: Record<string, number> = { safe: 1, balanced: 3, aggressive: 6 };
const MIN_STRATEGY_BUDGET_MS = 250;
const STRATEGY_MIN_BUDGET_MS: Partial<Record<V4CandidateStrategyId, number>> = {
  strategy_v4_native_critical_core: 800,
  strategy_v4_native_remainder: 1500,
  strategy_v4_production_wave: 600,
};
interface V4CandidateRunnerOptions extends EngineV3Options { enabledStrategies?: V4CandidateStrategyId[]; maxRuntimeMs?: number; maxStrategies?: number; enableNativeRemainder?: boolean; minStrategyBudgetMs?: number; }
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

interface V4StrategyPortfolioOptions { maxStrategies?: number; enableNativeRemainder?: boolean; }

const variantStrategy = (base: "strategy_v4_production_wave" | "strategy_v4_native_critical_core", id: string): V4CandidateStrategyId => `${base}__${id}` as V4CandidateStrategyId;
const hasBaseEnabled = (enabled: Set<V4CandidateStrategyId>, base: V4CandidateStrategyId): boolean => enabled.has(base) || [...enabled].some((item) => baseStrategyId(item) === base);

function addUnique(target: V4CandidateStrategyId[], strategy: V4CandidateStrategyId, enabled: Set<V4CandidateStrategyId>, variantById: Map<string, unknown>, nativeRemainderAllowed: boolean): boolean {
  const base = baseStrategyId(strategy);
  if (!hasBaseEnabled(enabled, base)) return false;
  if (base === "strategy_v4_native_remainder" && !nativeRemainderAllowed) return false;
  const variant = String(strategy).includes("__") ? String(strategy).split("__")[1] : null;
  const exactVariantEnabled = enabled.has(strategy);
  if (variant && !variantById.has(variant) && !exactVariantEnabled) return false;
  const finalStrategy = variant && !variantById.has(variant) ? base : strategy;
  if (!target.includes(finalStrategy)) target.push(finalStrategy);
  return true;
}

function addVariantWithFallback(target: V4CandidateStrategyId[], base: "strategy_v4_production_wave" | "strategy_v4_native_critical_core", ids: string[], enabled: Set<V4CandidateStrategyId>, variantById: Map<string, unknown>, nativeRemainderAllowed: boolean): boolean {
  for (const id of ids) if (addUnique(target, variantStrategy(base, id), enabled, variantById, nativeRemainderAllowed)) return true;
  return addUnique(target, base, enabled, variantById, nativeRemainderAllowed);
}

export function buildV4StrategyPortfolio(profile: string, enabledStrategies: V4CandidateStrategyId[], sequenceVariants: Array<{ id: string }>, options: V4StrategyPortfolioOptions = {}): { strategies: V4CandidateStrategyId[]; diagnostics: V4StrategyPortfolioDiagnostics } {
  const requestedMaxStrategies = Math.max(1, Number(options.maxStrategies ?? PROFILE_MAX_STRATEGIES[profile] ?? PROFILE_MAX_STRATEGIES.balanced));
  const maxStrategies = Math.min(requestedMaxStrategies, PROFILE_MAX_STRATEGIES[profile] ?? requestedMaxStrategies);
  const enabled = new Set(enabledStrategies.length ? enabledStrategies : STRATEGY_ORDER);
  const variantById = new Map(sequenceVariants.map((variant) => [variant.id, variant]));
  const nativeRemainderAllowed = profile === "aggressive" || options.enableNativeRemainder === true;
  const strategies: V4CandidateStrategyId[] = [];
  const mustRunStrategies: V4CandidateStrategyId[] = [];

  if (profile === "safe") {
    addUnique(strategies, "strategy_baseline_v3_order", enabled, variantById, nativeRemainderAllowed);
    addUnique(strategies, "strategy_main_flow_guided", enabled, variantById, nativeRemainderAllowed);
    addVariantWithFallback(strategies, "strategy_v4_production_wave", ["pressure_default"], enabled, variantById, nativeRemainderAllowed);
    addVariantWithFallback(strategies, "strategy_v4_production_wave", ["balanced_hybrid"], enabled, variantById, nativeRemainderAllowed);
  } else if (profile === "balanced") {
    addUnique(strategies, "strategy_baseline_v3_order", enabled, variantById, nativeRemainderAllowed);
    addUnique(strategies, "strategy_main_flow_guided", enabled, variantById, nativeRemainderAllowed);
    addUnique(strategies, "strategy_critical_resources_first", enabled, variantById, nativeRemainderAllowed);
    addVariantWithFallback(strategies, "strategy_v4_production_wave", ["balanced_hybrid", "pressure_default", "earliest_deadline_first"], enabled, variantById, nativeRemainderAllowed);
    const firstNative = addVariantWithFallback(strategies, "strategy_v4_native_critical_core", ["balanced_hybrid", "pressure_default", "earliest_deadline_first"], enabled, variantById, nativeRemainderAllowed);
    if (firstNative) mustRunStrategies.push(strategies[strategies.length - 1]);
    addVariantWithFallback(strategies, "strategy_v4_native_critical_core", ["earliest_deadline_first", "balanced_hybrid", "pressure_default"], enabled, variantById, nativeRemainderAllowed);
  } else {
    const aggressiveVariantIds = sequenceVariants.map((v) => v.id);
    for (const strategy of enabledStrategies.length ? enabledStrategies : STRATEGY_ORDER) {
      if (strategy === "strategy_v4_production_wave") {
        addUnique(strategies, strategy, enabled, variantById, nativeRemainderAllowed);
        for (const id of aggressiveVariantIds) addUnique(strategies, variantStrategy(strategy, id), enabled, variantById, nativeRemainderAllowed);
      } else if (strategy === "strategy_v4_native_critical_core") {
        addUnique(strategies, strategy, enabled, variantById, nativeRemainderAllowed);
        for (const id of aggressiveVariantIds) addUnique(strategies, variantStrategy(strategy, id), enabled, variantById, nativeRemainderAllowed);
      } else addUnique(strategies, strategy, enabled, variantById, nativeRemainderAllowed);
    }
  }

  let finalStrategies = strategies.slice(0, maxStrategies);
  if (profile === "aggressive" && nativeRemainderAllowed && hasBaseEnabled(enabled, "strategy_v4_native_remainder") && !finalStrategies.includes("strategy_v4_native_remainder")) {
    finalStrategies = [...finalStrategies.slice(0, Math.max(0, maxStrategies - 1)), "strategy_v4_native_remainder"];
  }
  const missingMustRunStrategies = mustRunStrategies.filter((strategy) => !finalStrategies.includes(strategy));
  return { strategies: finalStrategies, diagnostics: { profile, requestedMaxStrategies, finalStrategies, mustRunStrategies, missingMustRunStrategies } };
}

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
  const profile = String((options as any)?.v4Profile ?? "balanced");
  const maxRuntimeMs = Number(options?.maxRuntimeMs ?? Number.POSITIVE_INFINITY);
  const maxStrategies = Math.max(1, Number(options?.maxStrategies ?? PROFILE_MAX_STRATEGIES[profile] ?? PROFILE_MAX_STRATEGIES.balanced));
  const maxSequenceVariants = PROFILE_SEQUENCE_VARIANTS[profile] ?? PROFILE_SEQUENCE_VARIANTS.balanced;
  const minStrategyBudgetMs = Number(options?.minStrategyBudgetMs ?? MIN_STRATEGY_BUDGET_MS);
  const sequenceSearch = buildMainFlowSequenceVariants(input, strategicAnalysis, { maxSequenceVariants });
  const variantById = new Map(sequenceSearch.variants.map((variant) => [variant.id, variant]));
  const enabled = Array.isArray(options?.enabledStrategies) && options.enabledStrategies.length ? options.enabledStrategies : STRATEGY_ORDER;
  const portfolio = buildV4StrategyPortfolio(profile, enabled, sequenceSearch.variants, { maxStrategies, enableNativeRemainder: options?.enableNativeRemainder });
  const strategies = portfolio.strategies;
  const candidates: Array<any> = [];
  const skippedDiagnostics: V4CandidateDiagnostic[] = [];
  const makeSkipped = (strategyId: V4CandidateStrategyId, reason: string, timedOut = false): V4CandidateDiagnostic => ({
    strategyId,
    sequenceVariantId: String(strategyId).includes("__") ? String(strategyId).split("__")[1] : undefined,
    plannedTasks: 0,
    unplannedTasks: 0,
    qualityScore: 0,
    mainFlowGapMinutes: 0,
    makespan: null,
    selected: false,
    hardFeasible: false,
    talentStayMinutes: 0,
    guidedOrdering: emptyGuidedOrdering(reason),
    qualityBeforeImprovement: null as any,
    quality: null as any,
    mainFlowImprovement: null as any,
    runtimeMs: 0,
    skipped: true,
    skipReason: reason,
    timedOut,
  });
  for (const strategyId of strategies) {
    const base = baseStrategyId(strategyId);
    const remainingBefore = maxRuntimeMs - (Date.now() - started);
    const requiredBudget = Math.max(minStrategyBudgetMs, Number(STRATEGY_MIN_BUDGET_MS[base] ?? 0));
    if (remainingBefore < requiredBudget && candidates.length > 0) {
      skippedDiagnostics.push(makeSkipped(strategyId, "Runtime budget exceeded before strategy execution.", remainingBefore <= 0));
      continue;
    }
    const strategyStarted = Date.now();
    const sequenceVariantId = String(strategyId).includes("__") ? String(strategyId).split("__")[1] : undefined;
    try {
      const candidate = buildStrategyInput(strategyId, input, strategicAnalysis);
      const sequenceOverride = sequenceVariantId ? variantById.get(sequenceVariantId) : undefined;
      const remainingForStrategy = Math.max(0, maxRuntimeMs - (Date.now() - started));
      const strategyOptions = { ...(options as any), ...(sequenceOverride ? { sequenceOverride } : {}), maxRuntimeMs: remainingForStrategy };
      const mainFlowFirst = base === "strategy_v4_main_flow_first" ? buildMainFlowFirstPlan(input, strategicAnalysis, strategyOptions) : null;
      const productionWave = base === "strategy_v4_production_wave" ? buildProductionWavePlan(input, strategicAnalysis, strategyOptions) : null;
      const nativeCriticalCore = base === "strategy_v4_native_critical_core" ? buildV4NativeCriticalCorePlan(input, strategicAnalysis, strategyOptions as any) : null;
      const nativeRemainder = base === "strategy_v4_native_remainder" ? buildV4NativeRemainderPlan(input, strategicAnalysis, strategyOptions) : null;
      const candidateInput = nativeCriticalCore?.delegatedInput ?? productionWave?.delegatedInput ?? mainFlowFirst?.delegatedInput ?? candidate.input;
      const initialOutput = nativeCriticalCore?.output ?? nativeRemainder?.output ?? productionWave?.output ?? mainFlowFirst?.output ?? generatePlanV3(candidateInput, strategyOptions);
      const initialQuality = evaluateV4PlanQuality(candidateInput, initialOutput, strategicAnalysis);
      const remainingForImprovement = maxRuntimeMs - (Date.now() - started);
      const improved = remainingForImprovement >= 750
        ? improveMainFlowContinuity(candidateInput, initialOutput, strategicAnalysis, initialQuality)
        : { output: initialOutput, improvementDiagnostics: { applied: false, movesAttempted: 0, movesAccepted: 0, warnings: ["Improvement engine skipped: runtime budget below 750ms."], reason: "Runtime budget below 750ms." } } as any;
      const quality = evaluateV4PlanQuality(candidateInput, improved.output, strategicAnalysis);
      candidates.push({ strategyId, sequenceVariantId, candidateInput, output: improved.output, guidedOrdering: candidate.guidedOrdering, qualityBeforeImprovement: initialQuality, quality, mainFlowImprovement: improved.improvementDiagnostics, mainFlowFirstScheduler: mainFlowFirst?.diagnostics, productionWaveScheduler: productionWave?.diagnostics, nativeRemainderScheduler: nativeRemainder?.diagnostics, nativeCriticalCoreScheduler: nativeCriticalCore?.diagnostics, runtimeMs: Date.now() - strategyStarted, timedOut: Date.now() - started >= maxRuntimeMs });
    } catch (error) {
      skippedDiagnostics.push(makeSkipped(strategyId, `Strategy execution failed: ${(error as Error).message}`));
    }
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
    runtimeMs: candidate.runtimeMs,
    skipped: false,
    skipReason: null,
    timedOut: candidate.timedOut,
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
      item.nativeCriticalCoreScheduler = { ...item.nativeCriticalCoreScheduler, applied: false, discarded: true, infeasible: item.nativeCriticalCoreScheduler.infeasible || item.hardFeasible === false, reason: item.nativeCriticalCoreScheduler.reason ?? "Native critical core discarded by candidate runner acceptance gate.", warnings: [...(item.nativeCriticalCoreScheduler.warnings ?? []), "Native critical core discarded: worse than V3 baseline on unplanned tasks, main-flow continuity, makespan or hard feasibility."] };
    }
    if (worseThanBaseline && item.nativeRemainderScheduler) {
      item.hardFeasible = false;
      item.nativeRemainderScheduler = { ...item.nativeRemainderScheduler, applied: false, discarded: true, infeasible: item.nativeRemainderScheduler.infeasible || item.hardFeasible === false, reason: item.nativeRemainderScheduler.reason ?? "Native remainder discarded by candidate runner quality gate.", warnings: [...(item.nativeRemainderScheduler.warnings ?? []), "Native remainder discarded: worse than V3 baseline on unplanned tasks, main-flow continuity, makespan or hard feasibility."] };
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
    candidatesDiagnostics: { applied: true, bestStrategyId: best.strategyId, candidateCount: diagnostics.length, skippedCount: skippedDiagnostics.length, budgetExceeded: Date.now() - started >= maxRuntimeMs || skippedDiagnostics.some((d) => d.timedOut), candidates: [...diagnostics, ...skippedDiagnostics], mainFlowSequenceSearch: { ...sequenceSearch.diagnostics, selectedVariantId: diagnostics[bestIndex].sequenceVariantId ?? null }, portfolio: portfolio.diagnostics },
  };
}
