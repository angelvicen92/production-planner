import { generatePlanV3 } from "../../v3";
import type { EngineInput, EngineOutput, TaskInput } from "../../types";
import type { EngineV3Options } from "../../v3/types";
import type { V4StrategicAnalysis } from "../analysis";
import { buildV4GuidedInput, type V4GuidedOrderingDiagnostics } from "../guidedInput";
import { improveMainFlowContinuity, type MainFlowImprovementDiagnostics } from "../improvement";
import { buildMainFlowFirstPlan, type MainFlowFirstDiagnostics } from "../mainFlowScheduler";
import { evaluateV4PlanQuality, type V4PlanQualityEvaluation } from "../quality";

export type V4CandidateStrategyId =
  | "strategy_baseline_v3_order"
  | "strategy_main_flow_guided"
  | "strategy_critical_resources_first"
  | "strategy_critical_talents_first"
  | "strategy_v4_main_flow_first";

export interface V4CandidateDiagnostic {
  strategyId: V4CandidateStrategyId;
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
}

export interface V4CandidateRunnerDiagnostics {
  applied: boolean;
  bestStrategyId: V4CandidateStrategyId | null;
  candidateCount: number;
  candidates: V4CandidateDiagnostic[];
}

export interface V4CandidateRunnerResult {
  bestOutput: EngineOutput;
  bestQuality: V4PlanQualityEvaluation;
  bestStrategyId: V4CandidateStrategyId;
  candidatesDiagnostics: V4CandidateRunnerDiagnostics;
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
];
const MAX_DEFAULT_STRATEGIES = 5;
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

function buildStrategyInput(strategyId: V4CandidateStrategyId, input: EngineInput, strategicAnalysis: V4StrategicAnalysis): { input: EngineInput; guidedOrdering: V4GuidedOrderingDiagnostics } {
  if (strategyId === "strategy_baseline_v3_order") {
    return { input, guidedOrdering: emptyGuidedOrdering("Baseline V3 order: original pending task order without V4 guided ordering.") };
  }
  if (strategyId === "strategy_main_flow_guided" || strategyId === "strategy_v4_main_flow_first") return buildV4GuidedInput(input, strategicAnalysis);

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
    || STRATEGY_ORDER.indexOf(a.strategyId) - STRATEGY_ORDER.indexOf(b.strategyId);
}

export function runV4CandidateStrategies(input: EngineInput, strategicAnalysis: V4StrategicAnalysis, options?: EngineV3Options): V4CandidateRunnerResult {
  const strategies = STRATEGY_ORDER.slice(0, MAX_DEFAULT_STRATEGIES);
  const candidates = strategies.map((strategyId) => {
    const candidate = buildStrategyInput(strategyId, input, strategicAnalysis);
    const mainFlowFirst = strategyId === "strategy_v4_main_flow_first" ? buildMainFlowFirstPlan(input, strategicAnalysis, options) : null;
    const candidateInput = mainFlowFirst?.delegatedInput ?? candidate.input;
    const initialOutput = mainFlowFirst?.output ?? generatePlanV3(candidateInput, options);
    const initialQuality = evaluateV4PlanQuality(candidateInput, initialOutput, strategicAnalysis);
    const improved = improveMainFlowContinuity(candidateInput, initialOutput, strategicAnalysis, initialQuality);
    const quality = evaluateV4PlanQuality(candidateInput, improved.output, strategicAnalysis);
    return { strategyId, candidateInput, output: improved.output, guidedOrdering: candidate.guidedOrdering, qualityBeforeImprovement: initialQuality, quality, mainFlowImprovement: improved.improvementDiagnostics, mainFlowFirstScheduler: mainFlowFirst?.diagnostics };
  });

  let bestIndex = 0;
  const diagnostics = candidates.map((candidate): V4CandidateDiagnostic => ({
    strategyId: candidate.strategyId,
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
  }));
  for (let i = 1; i < diagnostics.length; i += 1) if (compareCandidates(diagnostics[i], diagnostics[bestIndex]) < 0) bestIndex = i;
  diagnostics[bestIndex].selected = true;
  const best = candidates[bestIndex];
  return {
    bestOutput: best.output,
    bestQuality: best.quality,
    bestStrategyId: best.strategyId,
    bestGuidedOrdering: best.guidedOrdering,
    bestMainFlowImprovement: best.mainFlowImprovement,
    bestQualityBeforeImprovement: best.qualityBeforeImprovement,
    candidatesDiagnostics: { applied: true, bestStrategyId: best.strategyId, candidateCount: diagnostics.length, candidates: diagnostics },
  };
}
