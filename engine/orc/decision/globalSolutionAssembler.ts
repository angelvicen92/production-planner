import type { Candidate, Evidence, GlobalSolution, OptimizedGlobalSolution, ORCRecord, PartialPlan } from "../contracts";
import { optimizeGlobalSolution } from "../optimization/iterativeGlobalOptimizer";
import { deepFreeze } from "../immutability";
import type { PartialPlanDecisionUnit } from "./decisionEngine";

export interface GlobalSolutionAssemblerOptions {
  readonly createdAt?: string | null;
  readonly maxGlobalSolutions?: number | null;
  readonly maxDiscardedCompositions?: number | null;
}

export interface GlobalSolutionAssemblerResult {
  readonly globalSolutions: readonly GlobalSolution[];
  readonly optimizedGlobalSolutions: readonly OptimizedGlobalSolution[];
  readonly evidence: readonly Evidence[];
  readonly summary: {
    readonly partialPlanCount: number;
    readonly globalSolutionCount: number;
    readonly discardedCompositionCount: number;
    readonly winningSolutionId: string | null;
  };
}

interface AssemblyPlan {
  readonly partialPlan: PartialPlan;
  readonly candidates: readonly Candidate[];
  readonly evaluationScore: number;
}

interface CompatibilityResult {
  readonly compatible: boolean;
  readonly reasons: readonly string[];
}

const SOURCE = "orc-global-solution-assembler";
const DEFAULT_MAX_GLOBAL_SOLUTIONS = 20;
const DEFAULT_MAX_DISCARDED_COMPOSITIONS = 50;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function searchSpaceIds(plan: PartialPlan, candidates: readonly Candidate[]): readonly string[] {
  const values = new Set<string>();
  const fromPlan = (plan as PartialPlan & { searchSpaceIds?: readonly string[] }).searchSpaceIds;
  if (Array.isArray(fromPlan)) for (const value of fromPlan) if (typeof value === "string") values.add(value);
  for (const candidate of candidates) {
    const single = candidate.metadata.searchSpaceId;
    if (typeof single === "string") values.add(single);
    const many = candidate.metadata.searchSpaceIds;
    if (Array.isArray(many)) for (const value of many) if (typeof value === "string") values.add(value);
  }
  return [...values].sort();
}

function bestEvaluationScore(operationalValues: readonly Candidate["operationalValues"][number][], fallback: number): number {
  const scores = operationalValues.map((value) => value.overallScore);
  return scores.length > 0 ? Math.max(...scores) : fallback;
}

function planAssignments(plan: AssemblyPlan) {
  return plan.candidates.flatMap((candidate) => candidate.assignments.map((assignment) => ({ ...assignment, planId: plan.partialPlan.partialPlanId })));
}

function compatiblePlans(left: AssemblyPlan, right: AssemblyPlan): CompatibilityResult {
  const reasons: string[] = [];
  const leftAssignments = planAssignments(left);
  const rightAssignments = planAssignments(right);

  for (const leftAssignment of leftAssignments) {
    for (const rightAssignment of rightAssignments) {
      if (leftAssignment.taskId === rightAssignment.taskId) {
        const sameStart = (leftAssignment.startPlanned ?? null) === (rightAssignment.startPlanned ?? null);
        const sameEnd = (leftAssignment.endPlanned ?? null) === (rightAssignment.endPlanned ?? null);
        const sameSpace = (leftAssignment.spaceId ?? null) === (rightAssignment.spaceId ?? null);
        const sameResources = [...leftAssignment.resourceIds].sort((a, b) => a - b).join(",") === [...rightAssignment.resourceIds].sort((a, b) => a - b).join(",");
        if (!sameStart || !sameEnd || !sameSpace || !sameResources) reasons.push(`assignment-conflict:task:${leftAssignment.taskId}`);
      }

      const overlaps = intervalsOverlap(toMillis(leftAssignment.startPlanned), toMillis(leftAssignment.endPlanned), toMillis(rightAssignment.startPlanned), toMillis(rightAssignment.endPlanned));
      if (!overlaps) continue;

      const sharedResources = leftAssignment.resourceIds.filter((resourceId) => rightAssignment.resourceIds.includes(resourceId));
      for (const resourceId of sharedResources) reasons.push(`resource-conflict:${resourceId}`);

      if (leftAssignment.spaceId != null && leftAssignment.spaceId === rightAssignment.spaceId) reasons.push(`space-conflict:${leftAssignment.spaceId}`);
    }
  }

  const leftSpaces = searchSpaceIds(left.partialPlan, left.candidates);
  const rightSpaces = searchSpaceIds(right.partialPlan, right.candidates);
  if (leftSpaces.length > 0 && rightSpaces.length > 0 && !leftSpaces.some((id) => rightSpaces.includes(id))) {
    // Different explicit search spaces are allowed; record that the assembler checked this dimension.
  }

  return deepFreeze({ compatible: reasons.length === 0, reasons: [...new Set(reasons)].sort() }) as CompatibilityResult;
}

function compatibleGroup(plans: readonly AssemblyPlan[]): CompatibilityResult {
  const reasons: string[] = [];
  for (let left = 0; left < plans.length; left += 1) {
    for (let right = left + 1; right < plans.length; right += 1) {
      const result = compatiblePlans(plans[left], plans[right]);
      if (!result.compatible) reasons.push(...result.reasons.map((reason) => `${plans[left].partialPlan.partialPlanId}+${plans[right].partialPlan.partialPlanId}:${reason}`));
    }
  }
  return deepFreeze({ compatible: reasons.length === 0, reasons }) as CompatibilityResult;
}

function solutionId(plans: readonly AssemblyPlan[]): string {
  return `global-solution:${plans.map((plan) => plan.partialPlan.partialPlanId).join("+")}`;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function assembleGlobalSolutions(
  decisionUnits: readonly PartialPlanDecisionUnit[],
  options: GlobalSolutionAssemblerOptions = {},
): GlobalSolutionAssemblerResult {
  const createdAt = options.createdAt ?? null;
  const plans: AssemblyPlan[] = [...decisionUnits]
    .map((unit) => ({ partialPlan: clone(unit.partialPlan), candidates: clone(unit.candidates), evaluationScore: bestEvaluationScore(unit.syntheticCandidate.operationalValues, unit.partialPlan.expectedOperationalImpact) }))
    .sort((a, b) => a.partialPlan.partialPlanId.localeCompare(b.partialPlan.partialPlanId));

  const evidence: Evidence[] = [];
  const accepted: GlobalSolution[] = [];
  const maxGlobalSolutions = Math.max(0, Math.floor(options.maxGlobalSolutions ?? DEFAULT_MAX_GLOBAL_SOLUTIONS));
  const maxDiscardedCompositions = Math.max(0, Math.floor(options.maxDiscardedCompositions ?? DEFAULT_MAX_DISCARDED_COMPOSITIONS));
  let discardedCompositionCount = 0;
  let inspectedCompositions = 0;
  let discardedEvidenceOverflowCount = 0;

  const inspectGroup = (group: AssemblyPlan[]): void => {
    if (accepted.length >= maxGlobalSolutions) return;
    inspectedCompositions += 1;
    const compatibility = compatibleGroup(group);
    const id = solutionId(group);
    if (!compatibility.compatible) {
      discardedCompositionCount += 1;
      if (discardedCompositionCount <= maxDiscardedCompositions) {
        evidence.push(deepFreeze({ id: `evidence:${SOURCE}:discarded:${id}`, source: SOURCE, kind: "global-solution-composition-discarded", subjectId: id, createdAt, data: { partialPlanIds: group.map((plan) => plan.partialPlan.partialPlanId), incompatibilities: compatibility.reasons.slice(0, 10), incompatibilityCount: compatibility.reasons.length, readOnly: true, mutatesOperationalState: false, commitsPlanning: false } }) as Evidence);
      } else {
        discardedEvidenceOverflowCount += 1;
      }
      return;
    }

    const partialPlanIds = group.map((plan) => plan.partialPlan.partialPlanId);
    const compatibilityScore = average(group.map((plan) => plan.partialPlan.compatibilityScore));
    const aggregatedEvaluationScore = group.reduce((sum, plan) => sum + plan.evaluationScore, 0);
    const explanation = `Global Solution ${id} combines compatible Partial Plans ${partialPlanIds.join(", ")} with aggregated score ${aggregatedEvaluationScore}.`;
    const solution = deepFreeze({ solutionId: id, partialPlanIds, compatibilityScore, aggregatedEvaluationScore, explanation }) as GlobalSolution;
    accepted.push(solution);
    evidence.push(deepFreeze({ id: `evidence:${SOURCE}:accepted:${id}`, source: SOURCE, kind: "global-solution-built", subjectId: id, createdAt, data: { solution, partialPlanIds, candidateIds: group.flatMap((plan) => [...plan.partialPlan.candidateIds]), compatibilityChecks: ["assignments", "temporal", "resources", "spaces"], score: aggregatedEvaluationScore, explanation, readOnly: true, mutatesOperationalState: false, commitsPlanning: false } satisfies ORCRecord }) as Evidence);
  };
  for (let size = 1; size <= plans.length && accepted.length < maxGlobalSolutions; size += 1) {
    const group: AssemblyPlan[] = [];
    const visit = (start: number): void => {
      if (accepted.length >= maxGlobalSolutions) return;
      if (group.length === size) {
        inspectGroup(group);
        return;
      }
      for (let index = start; index < plans.length && accepted.length < maxGlobalSolutions; index += 1) {
        group.push(plans[index]);
        visit(index + 1);
        group.pop();
      }
    };
    visit(0);
  }
  if (accepted.length >= maxGlobalSolutions || discardedEvidenceOverflowCount > 0) evidence.push(deepFreeze({ id: `evidence:${SOURCE}:budget:v1`, source: SOURCE, kind: "global-solution-budget-applied", subjectId: "GlobalSolutionAssembler", createdAt, data: { partialPlanCount: plans.length, inspectedCompositions, emittedGlobalSolutions: accepted.length, maxGlobalSolutions, discardedCompositionCount, recordedDiscardedEvidence: Math.min(discardedCompositionCount, maxDiscardedCompositions), discardedEvidenceOverflowCount, readOnly: true, mutatesOperationalState: false, commitsPlanning: false } }) as Evidence);

  accepted.sort((a, b) => b.aggregatedEvaluationScore - a.aggregatedEvaluationScore || b.compatibilityScore - a.compatibilityScore || a.solutionId.localeCompare(b.solutionId));
  const optimized = accepted.map((solution) => optimizeGlobalSolution(solution, decisionUnits, { createdAt }));
  evidence.push(...optimized.flatMap((item) => [...item.evidence]));
  const optimizedGlobalSolutions = optimized.map(({ solution, iterations }) => deepFreeze({ solution, iterations }) as OptimizedGlobalSolution);
  return deepFreeze({ globalSolutions: accepted, optimizedGlobalSolutions, evidence, summary: { partialPlanCount: plans.length, globalSolutionCount: accepted.length, discardedCompositionCount, winningSolutionId: accepted[0]?.solutionId ?? null } }) as GlobalSolutionAssemblerResult;
}
