import type { Candidate, Evidence, ORCRecord, PartialPlan } from "../contracts";
import { deepFreeze } from "../immutability";

export interface DiscardedPartialPlanComposition {
  readonly candidateIds: ReadonlyArray<string>;
  readonly reason: string;
  readonly compatibilityScore: number;
}

export interface PartialPlanComposerResult {
  readonly partialPlans: ReadonlyArray<PartialPlan>;
  readonly discardedCompositions: ReadonlyArray<DiscardedPartialPlanComposition>;
  readonly evidence: ReadonlyArray<Evidence>;
  readonly summary: {
    readonly candidateCount: number;
    readonly partialPlanCount: number;
    readonly discardedCompositionCount: number;
    readonly averageCompatibilityScore: number;
  };
}

export interface PartialPlanComposerOptions {
  readonly createdAt?: string | null;
  readonly maxPartialPlans?: number | null;
  readonly maxDiscardedCompositions?: number | null;
}

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const DEFAULT_MAX_PARTIAL_PLANS = 20;
const DEFAULT_MAX_DISCARDED_COMPOSITIONS = 50;
const finite = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const stringValue = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const numberArray = (value: unknown): number[] => Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
const timeValue = (value: string | null | undefined): number | null => {
  if (value == null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const overlaps = (aStart: number | null, aEnd: number | null, bStart: number | null, bEnd: number | null): boolean => {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return aStart < bEnd && bStart < aEnd;
};

const searchSpaceId = (candidate: Candidate): string | null => stringValue(candidate.metadata.searchSpaceId) ?? stringValue(candidate.metadata.sourceSearchSpaceId);
const taskIds = (candidate: Candidate): number[] => {
  const fromMetadata = numberArray(candidate.metadata.taskIds);
  return fromMetadata.length > 0 ? fromMetadata : candidate.assignments.map((assignment) => assignment.taskId);
};
const expectedImpact = (candidate: Candidate): number => finite(candidate.metadata.expectedOperationalImpact, finite((candidate.metadata.candidateStrategy as ORCRecord | undefined)?.expectedOperationalImpact, 0));
const isBaselineDecisionCandidate = (candidate: Candidate): boolean => candidate.metadata.baselineSafetyCandidate === true || candidate.metadata.baselinePreservation === true;

function incompatibilityReason(a: Candidate, b: Candidate): string | null {
  const aSpace = searchSpaceId(a);
  const bSpace = searchSpaceId(b);
  const aTasks = new Set(taskIds(a));
  const bTasks = new Set(taskIds(b));
  const overlappingTasks = [...aTasks].filter((taskId) => bTasks.has(taskId));
  if (aSpace != null && bSpace != null && aSpace === bSpace && overlappingTasks.length > 0) return "space-overlap";

  for (const left of a.assignments) {
    for (const right of b.assignments) {
      const sameTask = left.taskId === right.taskId;
      const leftStart = timeValue(left.startPlanned);
      const leftEnd = timeValue(left.endPlanned);
      const rightStart = timeValue(right.startPlanned);
      const rightEnd = timeValue(right.endPlanned);
      if (sameTask) {
        const sameWindow = (left.startPlanned ?? null) === (right.startPlanned ?? null) && (left.endPlanned ?? null) === (right.endPlanned ?? null);
        const sameSpace = (left.spaceId ?? null) === (right.spaceId ?? null);
        const sameResources = JSON.stringify([...left.resourceIds].sort((x, y) => x - y)) === JSON.stringify([...right.resourceIds].sort((x, y) => x - y));
        if (!sameWindow || !sameSpace || !sameResources) return "assignment-conflict";
      }
      const sharedResource = left.resourceIds.some((resourceId) => right.resourceIds.includes(resourceId));
      if (!sameTask && sharedResource && overlaps(leftStart, leftEnd, rightStart, rightEnd)) return "resource-time-overlap";
      if (sameTask && overlaps(leftStart, leftEnd, rightStart, rightEnd) && ((left.spaceId ?? null) !== (right.spaceId ?? null))) return "temporal-space-conflict";
    }
  }
  return null;
}

function compositionReason(candidates: readonly Candidate[]): string | null {
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const reason = incompatibilityReason(candidates[i], candidates[j]);
      if (reason != null) return reason;
    }
  }
  return null;
}

function compatibilityScore(candidates: readonly Candidate[]): number {
  if (candidates.length <= 1) return 1;
  const uniqueSpaces = new Set(candidates.map(searchSpaceId).filter((value): value is string => value != null)).size;
  const totalAssignments = candidates.reduce((sum, candidate) => sum + candidate.assignments.length, 0);
  const coverage = uniqueSpaces / candidates.length;
  const assignmentSignal = totalAssignments === 0 ? 0.8 : 1;
  return round(Math.min(1, 0.7 + coverage * 0.2 + assignmentSignal * 0.1));
}

function planId(candidateIds: readonly string[]): string {
  return `partial-plan:${candidateIds.join("+")}`;
}

export function composePartialPlans(candidates: readonly Candidate[], options: PartialPlanComposerOptions = {}): PartialPlanComposerResult {
  const ordered = [...(candidates ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const baselineCandidates = ordered.filter(isBaselineDecisionCandidate);
  const combinableCandidates = ordered.filter((candidate) => !isBaselineDecisionCandidate(candidate));
  const partialPlans: PartialPlan[] = [];
  const emittedBaselinePlanIds = new Set<string>();
  const discardedCompositions: DiscardedPartialPlanComposition[] = [];
  const maxPartialPlans = Math.max(0, Math.floor(options.maxPartialPlans ?? DEFAULT_MAX_PARTIAL_PLANS));
  const maxDiscardedCompositions = Math.max(0, Math.floor(options.maxDiscardedCompositions ?? DEFAULT_MAX_DISCARDED_COMPOSITIONS));
  let inspectedCompositions = 0;
  let discardedOverflowCount = 0;
  const inspectGroup = (group: Candidate[]): void => {
    if (partialPlans.length >= maxPartialPlans) return;
    const candidateIds = group.map((candidate) => candidate.id);
    const score = compatibilityScore(group);
    const reason = compositionReason(group);
    inspectedCompositions += 1;
    if (reason != null) {
      if (discardedCompositions.length < maxDiscardedCompositions) {
        discardedCompositions.push(deepFreeze({ candidateIds, reason, compatibilityScore: score }) as DiscardedPartialPlanComposition);
      } else {
        discardedOverflowCount += 1;
      }
      return;
    }
    partialPlans.push(deepFreeze({ partialPlanId: planId(candidateIds), candidateIds, compatibilityScore: score, expectedOperationalImpact: round(group.reduce((sum, candidate) => sum + expectedImpact(candidate), 0)) }) as PartialPlan);
  };
  for (const baselineCandidate of baselineCandidates) {
    if (partialPlans.length >= maxPartialPlans) break;
    const candidateIds = [baselineCandidate.id];
    const partialPlanId = planId(candidateIds);
    if (emittedBaselinePlanIds.has(partialPlanId)) continue;
    emittedBaselinePlanIds.add(partialPlanId);
    partialPlans.push(deepFreeze({ partialPlanId, candidateIds, compatibilityScore: 1, expectedOperationalImpact: 0, metadata: { baselineSafetyPartialPlan: true, candidateIds, compatibilityScore: 1, expectedOperationalImpact: 0 } }) as unknown as PartialPlan);
  }
  for (let size = 1; size <= combinableCandidates.length && partialPlans.length < maxPartialPlans; size += 1) {
    const group: Candidate[] = [];
    const visit = (start: number): void => {
      if (partialPlans.length >= maxPartialPlans) return;
      if (group.length === size) {
        inspectGroup(group);
        return;
      }
      for (let index = start; index < combinableCandidates.length && partialPlans.length < maxPartialPlans; index += 1) {
        group.push(combinableCandidates[index]);
        visit(index + 1);
        group.pop();
      }
    };
    visit(0);
  }
  partialPlans.sort((a, b) => b.candidateIds.length - a.candidateIds.length || b.compatibilityScore - a.compatibilityScore || a.partialPlanId.localeCompare(b.partialPlanId));
  const evidence: Evidence[] = [
    ...partialPlans.map((plan) => deepFreeze({ id: `evidence:orc-see:partial-plan:${plan.partialPlanId}`, source: "orc-see", kind: "partial-plan-composed", subjectId: plan.partialPlanId, createdAt: options.createdAt ?? null, data: { ...plan, deterministic: true, readOnly: true } }) as Evidence),
    ...partialPlans.filter((plan) => (plan as unknown as { metadata?: ORCRecord }).metadata?.baselineSafetyPartialPlan === true).map((plan) => deepFreeze({ id: `evidence:orc-see:baseline-safety-partial-plan:${plan.partialPlanId}`, source: "orc-see", kind: "baseline-safety-partial-plan-composed", subjectId: plan.partialPlanId, createdAt: options.createdAt ?? null, data: { partialPlanId: plan.partialPlanId, candidateId: plan.candidateIds[0] ?? null, standalone: true, excludedFromCombination: true, readOnly: true, mutatesOperationalState: false, commitsPlanning: false } }) as Evidence),
    ...discardedCompositions.map((discarded, index) => deepFreeze({ id: `evidence:orc-see:partial-plan:discarded:${index + 1}`, source: "orc-see", kind: "partial-plan-discarded", subjectId: discarded.candidateIds.join("+"), createdAt: options.createdAt ?? null, data: { candidateIds: [...discarded.candidateIds], reason: discarded.reason, compatibilityScore: discarded.compatibilityScore, deterministic: true, readOnly: true } }) as Evidence),
    ...(partialPlans.length >= maxPartialPlans || discardedOverflowCount > 0 ? [deepFreeze({ id: "evidence:orc-see:partial-plan:budget:v1", source: "orc-see", kind: "partial-plan-budget-applied", subjectId: "PartialPlanComposer", createdAt: options.createdAt ?? null, data: { candidateCount: ordered.length, inspectedCompositions, emittedPartialPlans: partialPlans.length, maxPartialPlans, recordedDiscardedCompositions: discardedCompositions.length, discardedOverflowCount, deterministic: true, readOnly: true } }) as Evidence] : []),
  ];
  const averageCompatibilityScore = partialPlans.length === 0 ? 0 : round(partialPlans.reduce((sum, plan) => sum + plan.compatibilityScore, 0) / partialPlans.length);
  return deepFreeze({ partialPlans, discardedCompositions, evidence, summary: { candidateCount: ordered.length, partialPlanCount: partialPlans.length, discardedCompositionCount: discardedCompositions.length, averageCompatibilityScore } }) as PartialPlanComposerResult;
}
