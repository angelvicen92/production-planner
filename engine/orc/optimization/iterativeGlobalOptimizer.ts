import type { Candidate, Evidence, GlobalSolution, OptimizedGlobalSolution, OptimizationIteration, ORCRecord, PartialPlan } from "../contracts";
import { deepFreeze } from "../immutability";
import type { PartialPlanDecisionUnit } from "../decision/decisionEngine";

export interface IterativeGlobalOptimizerOptions {
  readonly createdAt?: string | null;
  readonly maxIterations?: number;
}

export interface IterativeGlobalOptimizerResult extends OptimizedGlobalSolution {
  readonly evidence: readonly Evidence[];
}

interface OptimizationPlan {
  readonly partialPlan: PartialPlan;
  readonly candidates: readonly Candidate[];
  readonly evaluationScore: number;
}

interface CompatibilityResult {
  readonly compatible: boolean;
  readonly reasons: readonly string[];
}

const SOURCE = "orc-iterative-global-optimizer";
const INCORPORATE_OPERATOR = "incorporate-compatible-discarded-partial-plan";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bestEvaluationScore(operationalValues: readonly Candidate["operationalValues"][number][], fallback: number): number {
  const scores = operationalValues.map((value) => value.overallScore);
  return scores.length > 0 ? Math.max(...scores) : fallback;
}

function toMillis(value: string | null | undefined): number | null {
  if (value == null) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function intervalsOverlap(leftStart: number | null, leftEnd: number | null, rightStart: number | null, rightEnd: number | null): boolean {
  if (leftStart == null || leftEnd == null || rightStart == null || rightEnd == null) return false;
  return leftStart < rightEnd && rightStart < leftEnd;
}

function planAssignments(plan: OptimizationPlan) {
  return plan.candidates.flatMap((candidate) => candidate.assignments.map((assignment) => ({ ...assignment, planId: plan.partialPlan.partialPlanId })));
}

function compatiblePlans(left: OptimizationPlan, right: OptimizationPlan): CompatibilityResult {
  const reasons: string[] = [];
  for (const leftAssignment of planAssignments(left)) {
    for (const rightAssignment of planAssignments(right)) {
      if (leftAssignment.taskId === rightAssignment.taskId) {
        const sameStart = (leftAssignment.startPlanned ?? null) === (rightAssignment.startPlanned ?? null);
        const sameEnd = (leftAssignment.endPlanned ?? null) === (rightAssignment.endPlanned ?? null);
        const sameSpace = (leftAssignment.spaceId ?? null) === (rightAssignment.spaceId ?? null);
        const sameResources = [...leftAssignment.resourceIds].sort((a, b) => a - b).join(",") === [...rightAssignment.resourceIds].sort((a, b) => a - b).join(",");
        if (!sameStart || !sameEnd || !sameSpace || !sameResources) reasons.push(`assignment-conflict:task:${leftAssignment.taskId}`);
      }

      const overlaps = intervalsOverlap(toMillis(leftAssignment.startPlanned), toMillis(leftAssignment.endPlanned), toMillis(rightAssignment.startPlanned), toMillis(rightAssignment.endPlanned));
      if (!overlaps) continue;
      for (const resourceId of leftAssignment.resourceIds.filter((resourceId) => rightAssignment.resourceIds.includes(resourceId))) reasons.push(`resource-conflict:${resourceId}`);
      if (leftAssignment.spaceId != null && leftAssignment.spaceId === rightAssignment.spaceId) reasons.push(`space-conflict:${leftAssignment.spaceId}`);
    }
  }
  return deepFreeze({ compatible: reasons.length === 0, reasons: [...new Set(reasons)].sort() }) as CompatibilityResult;
}

function compatibleGroup(plans: readonly OptimizationPlan[]): CompatibilityResult {
  const reasons: string[] = [];
  for (let left = 0; left < plans.length; left += 1) {
    for (let right = left + 1; right < plans.length; right += 1) {
      const result = compatiblePlans(plans[left], plans[right]);
      if (!result.compatible) reasons.push(...result.reasons.map((reason) => `${plans[left].partialPlan.partialPlanId}+${plans[right].partialPlan.partialPlanId}:${reason}`));
    }
  }
  return deepFreeze({ compatible: reasons.length === 0, reasons }) as CompatibilityResult;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildSolution(plans: readonly OptimizationPlan[]): GlobalSolution {
  const ordered = [...plans].sort((a, b) => a.partialPlan.partialPlanId.localeCompare(b.partialPlan.partialPlanId));
  const partialPlanIds = ordered.map((plan) => plan.partialPlan.partialPlanId);
  const aggregatedEvaluationScore = ordered.reduce((sum, plan) => sum + plan.evaluationScore, 0);
  const solutionId = `global-solution:${partialPlanIds.join("+")}`;
  return deepFreeze({
    solutionId,
    partialPlanIds,
    compatibilityScore: average(ordered.map((plan) => plan.partialPlan.compatibilityScore)),
    aggregatedEvaluationScore,
    explanation: `Optimized Global Solution ${solutionId} combines compatible Partial Plans ${partialPlanIds.join(", ")} with aggregated score ${aggregatedEvaluationScore}.`,
  }) as GlobalSolution;
}

function evidence(id: string, kind: string, subjectId: string, createdAt: string | null, data: ORCRecord): Evidence {
  return deepFreeze({ id, source: SOURCE, kind, subjectId, createdAt, data: { ...data, readOnly: true, shadowModeOnly: true, mutatesOperationalState: false, commitsPlanning: false } }) as Evidence;
}

export function optimizeGlobalSolution(solution: GlobalSolution, decisionUnits: readonly PartialPlanDecisionUnit[], options: IterativeGlobalOptimizerOptions = {}): IterativeGlobalOptimizerResult {
  const createdAt = options.createdAt ?? null;
  const maxIterations = Math.max(0, options.maxIterations ?? decisionUnits.length);
  const plans: OptimizationPlan[] = [...decisionUnits].map((unit): OptimizationPlan => ({ partialPlan: clone(unit.partialPlan), candidates: clone(unit.candidates), evaluationScore: bestEvaluationScore(unit.syntheticCandidate.operationalValues, unit.partialPlan.expectedOperationalImpact) })).sort((a, b) => a.partialPlan.partialPlanId.localeCompare(b.partialPlan.partialPlanId));
  const byId = new Map(plans.map((plan) => [plan.partialPlan.partialPlanId, plan]));
  let currentPlans: OptimizationPlan[] = [];
  for (const id of solution.partialPlanIds) {
    const plan = byId.get(id);
    if (plan != null) currentPlans.push(plan);
  }
  let current = clone(solution);
  const iterations: OptimizationIteration[] = [];
  const emittedEvidence: Evidence[] = [];

  for (let index = 0; index < maxIterations; index += 1) {
    const candidate = plans.find((plan) => !current.partialPlanIds.includes(plan.partialPlan.partialPlanId));
    if (!candidate) break;
    const previousScore = current.aggregatedEvaluationScore;
    const proposedPlans = [...currentPlans, candidate].sort((a, b) => a.partialPlan.partialPlanId.localeCompare(b.partialPlan.partialPlanId));
    const compatibility = compatibleGroup(proposedPlans);
    const proposed = compatibility.compatible ? buildSolution(proposedPlans) : null;
    const newScore = proposed?.aggregatedEvaluationScore ?? previousScore;
    const accepted = compatibility.compatible && proposed != null && newScore > previousScore;
    const reason = !compatibility.compatible ? "rejected-incompatible" : accepted ? "accepted-score-improved" : "rejected-non-improving";
    const iteration = deepFreeze({ iteration: index + 1, appliedOperator: INCORPORATE_OPERATOR, previousScore, newScore, accepted }) as OptimizationIteration;
    iterations.push(iteration);
    emittedEvidence.push(evidence(`evidence:${SOURCE}:iteration:${index + 1}:${candidate.partialPlan.partialPlanId}`, "global-solution-optimization-iteration", current.solutionId, createdAt, { ...iteration, candidatePartialPlanId: candidate.partialPlan.partialPlanId, reason, incompatibilities: compatibility.reasons }));
    if (accepted && proposed != null) {
      currentPlans = proposedPlans;
      current = proposed;
    }
  }

  emittedEvidence.push(evidence(`evidence:${SOURCE}:summary:${solution.solutionId}`, "global-solution-optimization-summary", solution.solutionId, createdAt, { initialSolutionId: solution.solutionId, finalSolutionId: current.solutionId, initialScore: solution.aggregatedEvaluationScore, finalScore: current.aggregatedEvaluationScore, totalIterations: iterations.length, acceptedIterations: iterations.filter((iteration) => iteration.accepted).length, deterministic: true }));
  return deepFreeze({ solution: current, iterations, evidence: emittedEvidence }) as IterativeGlobalOptimizerResult;
}
