import type { Candidate, CandidateAssignment, Evidence, OperationalState, ORCRecord } from "../contracts";
import { deepFreeze } from "../immutability";
import { candidateDependencyChainFlowRisk, optimizeDependencyChainFlow } from "./dependencyChainFlowOptimizer";

export interface RecoveryPotentialFactor extends ORCRecord {
  readonly name: "residual-slack" | "remaining-alternative-diversity" | "future-resource-pressure" | "reordering-capacity" | "dependency-chain-resilience";
  readonly value: number;
  readonly weight: number;
  readonly contribution: number;
  readonly explanation: string;
}

export interface RecoveryPotentialEstimate extends ORCRecord {
  readonly candidateId: string;
  readonly estimatedPotential: number;
  readonly factors: readonly RecoveryPotentialFactor[];
  readonly deterministic: true;
  readonly readOnly: true;
}

export interface RecoveryPotentialEstimationResult {
  readonly estimates: readonly RecoveryPotentialEstimate[];
  readonly evidence: readonly Evidence[];
}

const SOURCE = "orc-recovery-potential-estimator";
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function parseMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  return Number.isFinite(hours) && Number.isFinite(minutes) && minutes < 60 ? hours * 60 + minutes : null;
}

function durationMinutes(assignment: CandidateAssignment): number {
  const start = parseMinutes(assignment.startPlanned);
  const end = parseMinutes(assignment.endPlanned);
  return start === null || end === null || end <= start ? 0 : end - start;
}

function estimateCandidate(candidate: Candidate, state?: OperationalState | null, dependencyRisk = 0): RecoveryPotentialEstimate {
  const assignments = [...(candidate.assignments ?? [])];
  const totalDuration = assignments.reduce((sum, assignment) => sum + durationMinutes(assignment), 0);
  const workStart = parseMinutes(state?.workDay?.start ?? null);
  const workEnd = parseMinutes(state?.workDay?.end ?? null);
  const workDuration = workStart === null || workEnd === null || workEnd <= workStart ? 8 * 60 : workEnd - workStart;
  const assignedTaskIds = new Set(assignments.map((assignment) => Number(assignment.taskId)).filter(Number.isFinite));
  const remainingTasks = (state?.tasks ?? []).filter((task) => !assignedTaskIds.has(Number(task.id)));
  const remainingSpaces = new Set(remainingTasks.map((task: any) => Number(task.spaceId)).filter(Number.isFinite));
  const remainingResourceKinds = new Set(remainingTasks.flatMap((task: any) => Object.keys(task.resourceRequirements?.byType ?? task.resourceRequirements?.byItem ?? {})).sort());
  const assignedResourceMinutes = new Map<number, number>();
  for (const assignment of assignments) for (const resourceId of assignment.resourceIds ?? []) assignedResourceMinutes.set(resourceId, (assignedResourceMinutes.get(resourceId) ?? 0) + durationMinutes(assignment));
  const fixedAssignments = assignments.filter((assignment) => parseMinutes(assignment.startPlanned) !== null && parseMinutes(assignment.endPlanned) !== null).length;
  const residualSlack = clamp01((workDuration - totalDuration) / Math.max(1, workDuration));
  const remainingAlternativeDiversity = clamp01((remainingSpaces.size + remainingResourceKinds.size + Math.max(0, remainingTasks.length - assignments.length)) / Math.max(1, (state?.tasks?.length ?? assignments.length) + 2));
  const futureResourcePressure = 1 - clamp01(Math.max(0, ...assignedResourceMinutes.values()) / Math.max(1, workDuration));
  const reorderingCapacity = 1 - clamp01(fixedAssignments / Math.max(1, assignments.length || 1));
  const dependencyChainResilience = 1 - clamp01(dependencyRisk);
  const raw: Array<[RecoveryPotentialFactor["name"], number, number, string]> = [
    ["residual-slack", residualSlack, 0.3, "Remaining deterministic operating-window slack before simulation."],
    ["remaining-alternative-diversity", remainingAlternativeDiversity, 0.22, "Diversity of unscheduled tasks, spaces and resource requirement categories preserved for future recovery."],
    ["future-resource-pressure", futureResourcePressure, 0.2, "Inverse of deterministic resource pressure introduced by the candidate."],
    ["reordering-capacity", reorderingCapacity, 0.16, "Share of candidate assignments still reorderable because they are not fixed to a full time interval."],
    ["dependency-chain-resilience", dependencyChainResilience, 0.12, "Inverse of dependency-chain flow risk touched by the candidate."],
  ];
  const factors = raw.map(([name, value, weight, explanation]) => deepFreeze({ name, value: round(value), weight, contribution: round(value * weight), explanation }) as RecoveryPotentialFactor);
  return deepFreeze({ candidateId: candidate.id, estimatedPotential: round(factors.reduce((sum, factor) => sum + factor.contribution, 0)), factors, deterministic: true, readOnly: true }) as RecoveryPotentialEstimate;
}

export function estimateRecoveryPotential(candidates: readonly Candidate[], state?: OperationalState | null, createdAt: string | null = null): RecoveryPotentialEstimationResult {
  const chainFlow = state ? optimizeDependencyChainFlow(state, state.cognitive?.opportunities ?? [], createdAt) : null;
  const estimates = [...(candidates ?? [])].map((candidate) => estimateCandidate(candidate, state, chainFlow ? candidateDependencyChainFlowRisk(candidate, chainFlow.chains) : 0));
  const evidence = estimates.map((estimate) => deepFreeze({ id: `evidence:${SOURCE}:${estimate.candidateId}`, source: SOURCE, kind: "candidate-recovery-potential-estimated", subjectId: estimate.candidateId, createdAt, data: { ...estimate, explorationInfluence: "higher recovery potential can improve exploration ordering, preselection and reasoning-budget allocation only", planningInfluence: "none", decisionEngineInfluence: "none" } }) as Evidence);
  return deepFreeze({ estimates, evidence }) as RecoveryPotentialEstimationResult;
}

export function recoveryPotentialByCandidateId(estimates: readonly RecoveryPotentialEstimate[]): ReadonlyMap<string, RecoveryPotentialEstimate> {
  return new Map(estimates.map((estimate) => [estimate.candidateId, estimate]));
}
