import type { Candidate, CandidateAssignment, Evidence, OperationalState, Opportunity, ORCRecord, ReasoningBudgetProfile } from "../contracts";
import { deepFreeze } from "../immutability";

export interface DependencyChainFlowMetrics extends ORCRecord {
  readonly length: number;
  readonly accumulatedSlackMinutes: number;
  readonly temporalPressure: number;
  readonly structuralCriticality: number;
  readonly blockingRisk: number;
  readonly flowScore: number;
}

export interface DependencyChainFlow extends ORCRecord {
  readonly chainId: string;
  readonly taskIds: readonly number[];
  readonly edgeCount: number;
  readonly metrics: DependencyChainFlowMetrics;
  readonly explanation: string;
}

export interface DependencyChainOpportunityInfluence extends ORCRecord {
  readonly opportunityId: string;
  readonly touchedChainIds: readonly string[];
  readonly influenceScore: number;
  readonly reasoningBudgetMultiplier: number;
  readonly explanation: string;
}

export interface DependencyChainFlowOptimizationResult {
  readonly chains: readonly DependencyChainFlow[];
  readonly opportunityInfluences: readonly DependencyChainOpportunityInfluence[];
  readonly evidence: readonly Evidence[];
  readonly deterministic: true;
  readonly readOnly: true;
}

const SOURCE = "orc-dependency-chain-flow-optimizer";
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const uniqueSorted = (values: readonly number[]): number[] => [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);

function parseMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  return Number.isFinite(hours) && Number.isFinite(minutes) && minutes < 60 ? hours * 60 + minutes : null;
}

function taskDuration(state: OperationalState, taskId: number): number {
  const planned = state.planning.find((item) => Number(item.taskId) === taskId);
  const start = parseMinutes(planned?.startPlanned); const end = parseMinutes(planned?.endPlanned);
  if (start !== null && end !== null && end > start) return end - start;
  const task = state.tasks.find((item) => Number(item.id) === taskId);
  return typeof task?.durationOverrideMin === "number" && task.durationOverrideMin > 0 ? task.durationOverrideMin : 30;
}

function slackBetween(state: OperationalState, before: number, after: number): number {
  const beforePlan = state.planning.find((item) => Number(item.taskId) === before);
  const afterPlan = state.planning.find((item) => Number(item.taskId) === after);
  const beforeEnd = parseMinutes(beforePlan?.endPlanned); const afterStart = parseMinutes(afterPlan?.startPlanned);
  return beforeEnd === null || afterStart === null ? 0 : Math.max(0, afterStart - beforeEnd);
}

function buildGraph(state: OperationalState): { children: Map<number, number[]>; indegree: Map<number, number>; outdegree: Map<number, number>; nodes: number[] } {
  const children = new Map<number, number[]>(); const indegree = new Map<number, number>(); const outdegree = new Map<number, number>();
  const nodes = new Set<number>((state.tasks ?? []).map((task) => Number(task.id)).filter(Number.isFinite));
  for (const dep of state.dependencies ?? []) {
    const child = Number(dep.taskId); nodes.add(child);
    for (const parent of uniqueSorted(dep.dependsOnTaskIds ?? [])) {
      nodes.add(parent); children.set(parent, uniqueSorted([...(children.get(parent) ?? []), child]));
      indegree.set(child, (indegree.get(child) ?? 0) + 1); outdegree.set(parent, (outdegree.get(parent) ?? 0) + 1);
      indegree.set(parent, indegree.get(parent) ?? 0); outdegree.set(child, outdegree.get(child) ?? 0);
    }
  }
  return { children: new Map([...children.entries()].sort((a, b) => a[0] - b[0])), indegree, outdegree, nodes: uniqueSorted([...nodes]) };
}

function enumerateChains(state: OperationalState): number[][] {
  const { children, indegree, outdegree, nodes } = buildGraph(state);
  const starts = nodes.filter((id) => (indegree.get(id) ?? 0) === 0 && ((outdegree.get(id) ?? 0) > 0 || nodes.length === 1));
  const chains: number[][] = [];
  const walk = (path: number[], seen: Set<number>): void => {
    const last = path[path.length - 1]!; const next = children.get(last) ?? [];
    if (next.length === 0) { chains.push(path); return; }
    for (const child of next) if (!seen.has(child)) walk([...path, child], new Set([...seen, child]));
  };
  for (const start of starts) walk([start], new Set([start]));
  return chains.sort((a, b) => b.length - a.length || a.join(".").localeCompare(b.join(".")));
}

function chainMetrics(state: OperationalState, taskIds: readonly number[]): DependencyChainFlowMetrics {
  const edgeCount = Math.max(0, taskIds.length - 1);
  const slack = taskIds.slice(1).reduce((sum, taskId, index) => sum + slackBetween(state, taskIds[index]!, taskId), 0);
  const duration = taskIds.reduce((sum, taskId) => sum + taskDuration(state, taskId), 0);
  const workStart = parseMinutes(state.workDay?.start); const workEnd = parseMinutes(state.workDay?.end);
  const workDuration = workStart === null || workEnd === null || workEnd <= workStart ? Math.max(1, duration + slack) : workEnd - workStart;
  const { indegree, outdegree } = buildGraph(state);
  const branching = taskIds.reduce((sum, id) => sum + Math.max(0, (indegree.get(id) ?? 0) - 1) + Math.max(0, (outdegree.get(id) ?? 0) - 1), 0);
  const temporalPressure = clamp01(duration / Math.max(1, duration + slack));
  const structuralCriticality = clamp01((edgeCount + branching) / Math.max(1, (state.dependencies ?? []).length + taskIds.length));
  const blockingRisk = clamp01((temporalPressure * 0.5) + (structuralCriticality * 0.35) + (Math.min(1, taskIds.length / Math.max(1, state.tasks.length)) * 0.15));
  return deepFreeze({ length: taskIds.length, accumulatedSlackMinutes: round(slack), temporalPressure: round(temporalPressure), structuralCriticality: round(structuralCriticality), blockingRisk: round(blockingRisk), flowScore: round((blockingRisk * 0.6) + clamp01(duration / workDuration) * 0.4) }) as DependencyChainFlowMetrics;
}

export function optimizeDependencyChainFlow(state: OperationalState, opportunities: readonly Opportunity[] = state.cognitive?.opportunities ?? [], createdAt: string | null = null): DependencyChainFlowOptimizationResult {
  const chains = enumerateChains(state).map((taskIds) => {
    const metrics = chainMetrics(state, taskIds); const chainId = `dependency-chain:${taskIds.join("->")}`;
    return deepFreeze({ chainId, taskIds, edgeCount: Math.max(0, taskIds.length - 1), metrics, explanation: `Dependency chain ${taskIds.join(" -> ")} has length ${metrics.length}, ${metrics.accumulatedSlackMinutes} slack minutes, temporal pressure ${metrics.temporalPressure}, structural criticality ${metrics.structuralCriticality}, and blocking risk ${metrics.blockingRisk}.` }) as DependencyChainFlow;
  });
  const opportunityInfluences = [...opportunities].sort((a, b) => a.id.localeCompare(b.id)).map((opportunity) => {
    const taskSet = new Set(opportunity.taskIds ?? []);
    const touched = chains.filter((chain) => chain.taskIds.some((id) => taskSet.has(id)));
    const influenceScore = round(clamp01(touched.reduce((sum, chain) => sum + chain.metrics.flowScore, 0) / Math.max(1, chains.length)));
    return deepFreeze({ opportunityId: opportunity.id, touchedChainIds: touched.map((chain) => chain.chainId).sort(), influenceScore, reasoningBudgetMultiplier: round(1 + influenceScore * 0.25), explanation: `Opportunity ${opportunity.id} touches ${touched.length} dependency chain(s); influence score ${influenceScore} can order exploration and adjust reasoning budget without rejecting candidates.` }) as DependencyChainOpportunityInfluence;
  });
  const evidence: Evidence[] = [
    { id: `evidence:${SOURCE}:chains`, source: SOURCE, kind: "dependency-chain-flow-analysis", createdAt, data: { stateId: state.id, chains, deterministic: true, readOnly: true, pipelineInfluence: "none", decisionEngineInfluence: "none" } },
    ...opportunityInfluences.map((influence) => ({ id: `evidence:${SOURCE}:opportunity:${influence.opportunityId}`, source: SOURCE, kind: "dependency-chain-flow-opportunity-influence", subjectId: influence.opportunityId, createdAt, data: { ...influence, decisionsInfluenced: ["opportunity-ordering", "reasoning-budget", "variant-priority"], deterministic: true, readOnly: true } })),
  ];
  return deepFreeze({ chains, opportunityInfluences, evidence, deterministic: true, readOnly: true }) as DependencyChainFlowOptimizationResult;
}

export function dependencyChainInfluenceByOpportunityId(influences: readonly DependencyChainOpportunityInfluence[]): ReadonlyMap<string, DependencyChainOpportunityInfluence> {
  return new Map(influences.map((item) => [item.opportunityId, item]));
}

export function applyDependencyChainFlowToReasoningBudgets(profiles: readonly ReasoningBudgetProfile[], influences: readonly DependencyChainOpportunityInfluence[]): readonly ReasoningBudgetProfile[] {
  const byId = dependencyChainInfluenceByOpportunityId(influences);
  return deepFreeze([...profiles].sort((a, b) => a.opportunityId.localeCompare(b.opportunityId)).map((profile) => {
    const influence = byId.get(profile.opportunityId); if (!influence || influence.influenceScore <= 0) return { ...profile };
    const extra = Math.ceil(influence.influenceScore * 2);
    return { ...profile, explorationBudget: profile.explorationBudget + extra, maxCandidates: profile.maxCandidates + extra, maxDepth: profile.maxDepth + (influence.influenceScore >= 0.5 ? 1 : 0), maxSearchSpaceSize: profile.maxSearchSpaceSize + extra, simulationBudget: profile.simulationBudget + extra, reason: `${profile.reason} Dependency-chain flow influence ${influence.influenceScore} preserves operational dependency flow.` };
  })) as readonly ReasoningBudgetProfile[];
}

export function candidateDependencyChainFlowRisk(candidate: Candidate, chains: readonly DependencyChainFlow[]): number {
  const assigned = new Set((candidate.assignments ?? []).map((assignment: CandidateAssignment) => Number(assignment.taskId)));
  return round(clamp01(chains.filter((chain) => chain.taskIds.some((id) => assigned.has(id))).reduce((sum, chain) => sum + chain.metrics.blockingRisk, 0) / Math.max(1, chains.length)));
}
