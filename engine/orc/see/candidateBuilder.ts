import type { AdaptiveSearchSpaceProfile, Candidate, Evidence, OperationalState, OpportunityPropagation, SearchSpace } from "../contracts";
import type { OperationalGoal } from "../search/operationalGoalBuilder";
import { preselectCandidates } from "./candidatePreselectionEngine";
import { buildStrategyCandidates } from "./strategyCandidateBuilder";
import { buildBaselinePreservationCandidate } from "./baselinePreservationCandidate";
import { prefilterCandidatesByHardConstraints } from "./candidateHardPrefilter";
import { buildMainFlowGapClosureCandidates, type MainFlowGapClosureSummary } from "./mainFlowGapCandidateBuilder";
import { buildMainZoneGapResourceBlockSwapCandidates, type MainZoneGapResourceBlockSwapSummary, type MainZoneContinuitySummary } from "./mainZoneGapResourceBlockSwapCandidateBuilder";
import { buildBaselineOverlapRepairCandidates, type BaselineOverlapRepairSummary } from "./baselineOverlapRepairCandidateBuilder";
import { assertBaselineRepairRuntimeInvariant } from "./baselineRepairRuntimeInvariant";
import type { ORCBaselineSeedHardFeasibilityAudit } from "../active/orcBaselineSeedFeasibilityAudit";

export interface CandidateBuilderResult {
  candidates: Candidate[];
  evidence: Evidence[];
  summary: {
    searchSpaceCount: number;
    candidateCount: number;
    duplicateCandidatesDiscarded: number;
    truncatedByBudget: boolean;
    candidateBudget: {
      globalBudget: number;
      allocatedBudget: number;
      unusedBudget: number;
      allocations: Array<{ searchSpaceId: string; priority: number; allocatedBudget: number; generatedCandidates: number; unusedBudget: number }>;
    };
    pruning: {
      generatedCount: number;
      keptCount: number;
      prunedCount: number;
      estimatedBudgetSaved: number;
      prunedItems: Candidate[];
    };
    hardPrefilter: {
      receivedCandidateCount: number;
      acceptedCandidateCount: number;
      discardedCandidateCount: number;
      discardedByReason: Record<string, number>;
      overflowDiscardCount: number;
    };
    preselection: {
      generatedCandidates: number;
      acceptedCandidates: number;
      discardedCandidates: number;
      limit: number;
      partialPlans: {
        partialPlanCount: number;
        discardedCompositionCount: number;
        averageCompatibilityScore: number;
      };
    };
    mainFlowGapClosure: MainFlowGapClosureSummary;
    mainZoneContinuity: MainZoneContinuitySummary;
    mainZoneGapResourceBlockSwap: MainZoneGapResourceBlockSwapSummary;
    baselineOverlapRepair: BaselineOverlapRepairSummary;
    baselineSafety: {
      generated: boolean;
      candidateId: string | null;
      reason: string | null;
      planningCount: number;
      searchSpaceCount: number;
      readOnly: true;
      planningInfluence: "none";
    };
  };
}

const GLOBAL_CANDIDATE_BUDGET = 20;

const emptyBaselineOverlapRepairSummary = (skippedReason: string | null = "no_space_overlap_violation"): BaselineOverlapRepairSummary => ({ executed: false, skippedReason: skippedReason as any, generatedCandidateCount: 0, candidateIds: [], conflictingTaskIds: [], movedTaskIds: [], assignmentCount: 0, discardedByPrefilter: 0, prefilterDiscardReasons: {}, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedCandidateId: null, selectedAsBest: false, selectedAsCommit: false, readOnly: true, planningInfluence: "candidate-generation-diagnostics-only", variantCount: 0, variantsGenerated: 0, variantsSkipped: 0, skippedVariantReasons: {}, locallyFeasibleCandidateCount: 0, locallyBlockedCandidateCount: 0, repairWindowStrategy: "both-tasks-before-after-v1", repairableGroupSelection: null, unsupportedGroupCount: 0, unsupportedGroupsSample: [], sourceOfTruth: null, auditSpaceOverlapGroupCount: 0, auditRepairableGroupCount: 0, auditAvailable: false, auditPassedToCandidateBuilder: false, auditPassedToRepairBuilder: false, fallbackSourceUsed: null, runtimeWiringWarnings: [], runtimeInvariant: null, lateAuditRepairPass: { executed: false, reason: null, candidateIds: [], generatedCandidateCount: 0, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedAsCommit: false, warnings: [], readOnly: true } });

const emptyMainZoneContinuitySummary = (): MainZoneContinuitySummary => ({ mainZoneConfigured: false, mainZoneId: null, mainZoneSource: null, mainZoneGapCount: 0, largestMainZoneGapMinutes: 0, mainZoneGapCandidatesAvailable: false, mainZoneContinuityContractVersion: "ORC-MAIN-ZONE-CONTINUITY-ID226", gaps: [], readOnly: true });
const emptyMainZoneGapResourceBlockSwapSummary = (skippedReason: string | null = "not_executed"): MainZoneGapResourceBlockSwapSummary => ({ executed: false, generatedCandidateCount: 0, candidateIds: [], selectedAsBest: false, selectedAsCommit: false, movedMainZoneTaskIds: [], movedBlockingTaskIds: [], sharedResourceIds: [], gapMinutesBefore: null, expectedGapMinutesAfter: null, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, prefilterDiscardReasons: {}, prefilterDiscardDetails: [], skippedReason, readOnly: true });

const emptyMainFlowGapClosureSummary = (skippedReason: string | null = "no_search_spaces"): MainFlowGapClosureSummary => ({ executed: false, skippedReason, mainFlowConfigured: false, mainFlowId: null, generatedCandidateCount: 0, candidateIds: [], candidatesWithAssignments: 0, assignmentCount: 0, discardedByPrefilter: 0, prefilterDiscardReasons: {}, prefilterDiscardDetails: [], candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedCandidateId: null, selectedAsBest: false, selectedAsCommit: false, movedTaskIds: [], gapBeforeMinutes: null, expectedGapAfterMinutes: null, readOnly: true, planningInfluence: "candidate-generation-diagnostics-only", generated: 0, acceptedBeforePrefilter: 0 });

const baselineSafetySummary = (args: { generated: boolean; candidateId?: string | null; reason?: string | null; planningCount?: number; searchSpaceCount: number }) => ({
  generated: args.generated,
  candidateId: args.candidateId ?? null,
  reason: args.reason ?? null,
  planningCount: args.planningCount ?? 0,
  searchSpaceCount: args.searchSpaceCount,
  readOnly: true as const,
  planningInfluence: "none" as const,
});

const numericMetadata = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

const priorityForSearchSpace = (searchSpace: SearchSpace): number => {
  const sourceOperationalPriority = searchSpace.metadata.sourceOperationalPriority;
  if (sourceOperationalPriority != null && typeof sourceOperationalPriority === "object") {
    const score = numericMetadata((sourceOperationalPriority as Record<string, unknown>).priorityScore);
    if (score != null) return score;
  }
  return numericMetadata(searchSpace.metadata.sourceOpportunityPriority) ?? numericMetadata(searchSpace.metadata.priority) ?? 0;
};

const allocateCandidateBudget = (searchSpaces: SearchSpace[], globalBudget = GLOBAL_CANDIDATE_BUDGET): Map<string, number> => {
  const budget = Math.max(0, Math.floor(globalBudget));
  if (searchSpaces.length === 0 || budget === 0) return new Map(searchSpaces.map((space) => [space.id, 0]));
  const weights = searchSpaces.map((space) => Math.max(0, priorityForSearchSpace(space)) + 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const floors = weights.map((weight) => Math.floor((budget * weight) / totalWeight));
  let remaining = budget - floors.reduce((sum, value) => sum + value, 0);
  const rankedRemainders = searchSpaces
    .map((space, index) => ({ id: space.id, index, remainder: (budget * weights[index]) / totalWeight - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const item of rankedRemainders) {
    if (remaining <= 0) break;
    floors[item.index] += 1;
    remaining -= 1;
  }
  return new Map(searchSpaces.map((space, index) => [space.id, floors[index]]));
};

const cloneCandidate = (candidate: Candidate): Candidate => ({
  ...candidate,
  evidenceIds: [...candidate.evidenceIds],
  state: { ...candidate.state, evidenceIds: [...candidate.state.evidenceIds], metadata: { ...candidate.state.metadata } },
  metadata: { ...candidate.metadata },
  assignments: candidate.assignments.map((assignment) => ({ ...assignment, resourceIds: [...assignment.resourceIds] })),
  operationalValues: [],
});

const searchSpaceEvidencePayload = (searchSpace: SearchSpace): Record<string, unknown> => ({
  id: searchSpace.id,
  taskIds: [...searchSpace.taskIds],
  evidenceIds: [...searchSpace.evidenceIds],
  metadata: { ...searchSpace.metadata },
});

const candidateEvidencePayload = (candidate: Candidate): Record<string, unknown> => ({
  id: candidate.id,
  evidenceIds: [...candidate.evidenceIds],
  metadata: { ...candidate.metadata },
});

export interface CandidateBuilderOptions {
  readonly adaptiveSearchSpaceProfiles?: readonly AdaptiveSearchSpaceProfile[];
  readonly opportunityPropagation?: readonly OpportunityPropagation[];
  readonly operationalState?: OperationalState | null;
  readonly maxPreselectedCandidates?: number | null;
  readonly createdAt?: string | null;
  readonly operationalGoals?: readonly OperationalGoal[];
  readonly baselineSeedHardFeasibility?: ORCBaselineSeedHardFeasibilityAudit | null;
}

export function buildCandidates(searchSpaces: SearchSpace[], options: CandidateBuilderOptions = {}): CandidateBuilderResult {
  const sourceSearchSpaces = [...(searchSpaces ?? [])].filter((searchSpace) => {
    const selection = searchSpace.metadata?.searchSpaceSelection;
    return !(selection != null && typeof selection === "object" && (selection as Record<string, unknown>).selected === false);
  });
  if (sourceSearchSpaces.length === 0) {
    const baselineOverlapRepair = buildBaselineOverlapRepairCandidates(options.operationalState ?? null, { createdAt: options.createdAt ?? null, baselineSeedHardFeasibility: options.baselineSeedHardFeasibility ?? null, auditPassedToCandidateBuilder: options.baselineSeedHardFeasibility != null });
    const baselineOverlapRepairSummary = { ...baselineOverlapRepair.summary, runtimeInvariant: assertBaselineRepairRuntimeInvariant({ baselineSeedHardFeasibility: options.baselineSeedHardFeasibility ?? null, baselineOverlapRepairSummary: baselineOverlapRepair.summary as unknown as Record<string, unknown>, operationalState: options.operationalState ?? null }) };
    const baselinePreservation = buildBaselinePreservationCandidate(options.operationalState, options.createdAt ?? null);
    if (baselineOverlapRepair.candidates.length > 0) {
      const generatedCandidates = baselineOverlapRepair.candidates.map(cloneCandidate);
      const hardPrefilterResult = prefilterCandidatesByHardConstraints(generatedCandidates, options.operationalState ?? null, { createdAt: options.createdAt ?? null });
      const preselectionResult = preselectCandidates(hardPrefilterResult.candidates, { maxCandidates: options.maxPreselectedCandidates, createdAt: options.createdAt ?? null, operationalState: options.operationalState ?? null });
      const candidates = [...preselectionResult.candidates.map(cloneCandidate), ...(baselinePreservation ? [cloneCandidate(baselinePreservation.candidate)] : [])];
      return { candidates, evidence: [...baselineOverlapRepair.evidence, ...hardPrefilterResult.evidence, ...preselectionResult.evidence, ...(baselinePreservation ? [baselinePreservation.evidence] : [])], summary: { searchSpaceCount: 0, candidateCount: candidates.length, duplicateCandidatesDiscarded: 0, truncatedByBudget: false, candidateBudget: { globalBudget: GLOBAL_CANDIDATE_BUDGET, allocatedBudget: generatedCandidates.length, unusedBudget: Math.max(0, GLOBAL_CANDIDATE_BUDGET - generatedCandidates.length), allocations: [] }, pruning: { generatedCount: generatedCandidates.length, keptCount: preselectionResult.candidates.length, prunedCount: generatedCandidates.length - preselectionResult.candidates.length, estimatedBudgetSaved: generatedCandidates.length - preselectionResult.candidates.length, prunedItems: generatedCandidates.filter((candidate) => !preselectionResult.candidates.some((selected) => selected.id === candidate.id)).map(cloneCandidate) }, hardPrefilter: { receivedCandidateCount: hardPrefilterResult.summary.receivedCandidateCount, acceptedCandidateCount: hardPrefilterResult.summary.acceptedCandidateCount, discardedCandidateCount: hardPrefilterResult.summary.discardedCandidateCount, discardedByReason: hardPrefilterResult.summary.discardedByReason, overflowDiscardCount: hardPrefilterResult.summary.overflowDiscardCount }, preselection: preselectionResult.summary, mainFlowGapClosure: emptyMainFlowGapClosureSummary(), mainZoneContinuity: emptyMainZoneContinuitySummary(), mainZoneGapResourceBlockSwap: emptyMainZoneGapResourceBlockSwapSummary(), baselineOverlapRepair: { ...baselineOverlapRepairSummary, discardedByPrefilter: baselineOverlapRepair.candidates.filter((candidate) => !hardPrefilterResult.candidates.some((accepted) => accepted.id === candidate.id)).length, prefilterDiscardReasons: hardPrefilterResult.summary.discardedByReason }, baselineSafety: baselineSafetySummary({ generated: baselinePreservation != null, candidateId: baselinePreservation?.candidate.id ?? null, reason: baselinePreservation?.summary.generationReason ?? null, searchSpaceCount: 0, planningCount: baselinePreservation?.summary.plannedTaskCount ?? 0 }) } };
    }
    if (baselinePreservation) {
      return { candidates: [baselinePreservation.candidate], evidence: [baselinePreservation.evidence], summary: { searchSpaceCount: 0, candidateCount: 1, duplicateCandidatesDiscarded: 0, truncatedByBudget: false, candidateBudget: { globalBudget: GLOBAL_CANDIDATE_BUDGET, allocatedBudget: 1, unusedBudget: GLOBAL_CANDIDATE_BUDGET - 1, allocations: [] }, pruning: { generatedCount: 1, keptCount: 1, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] }, hardPrefilter: { receivedCandidateCount: 1, acceptedCandidateCount: 1, discardedCandidateCount: 0, discardedByReason: {}, overflowDiscardCount: 0 }, preselection: { generatedCandidates: 1, acceptedCandidates: 1, discardedCandidates: 0, limit: 1, partialPlans: { partialPlanCount: 0, discardedCompositionCount: 0, averageCompatibilityScore: 0 } }, mainFlowGapClosure: emptyMainFlowGapClosureSummary(), mainZoneContinuity: emptyMainZoneContinuitySummary(), mainZoneGapResourceBlockSwap: emptyMainZoneGapResourceBlockSwapSummary(), baselineOverlapRepair: baselineOverlapRepairSummary, baselineSafety: baselineSafetySummary({ generated: false, searchSpaceCount: 0, planningCount: baselinePreservation.summary.plannedTaskCount }) } };
    }
    return { candidates: [], evidence: [], summary: { searchSpaceCount: 0, candidateCount: 0, duplicateCandidatesDiscarded: 0, truncatedByBudget: false, candidateBudget: { globalBudget: GLOBAL_CANDIDATE_BUDGET, allocatedBudget: 0, unusedBudget: GLOBAL_CANDIDATE_BUDGET, allocations: [] }, pruning: { generatedCount: 0, keptCount: 0, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] }, hardPrefilter: { receivedCandidateCount: 0, acceptedCandidateCount: 0, discardedCandidateCount: 0, discardedByReason: {}, overflowDiscardCount: 0 }, preselection: { generatedCandidates: 0, acceptedCandidates: 0, discardedCandidates: 0, limit: 0, partialPlans: { partialPlanCount: 0, discardedCompositionCount: 0, averageCompatibilityScore: 0 } }, mainFlowGapClosure: emptyMainFlowGapClosureSummary(), mainZoneContinuity: emptyMainZoneContinuitySummary(), mainZoneGapResourceBlockSwap: emptyMainZoneGapResourceBlockSwapSummary(), baselineOverlapRepair: baselineOverlapRepairSummary, baselineSafety: baselineSafetySummary({ generated: false, searchSpaceCount: 0 }) } };
  }

  const candidateBudgetBySearchSpaceId = allocateCandidateBudget(sourceSearchSpaces);
  const result = buildStrategyCandidates(sourceSearchSpaces, undefined, { candidateBudgetBySearchSpaceId, adaptiveSearchSpaceProfiles: options.adaptiveSearchSpaceProfiles, opportunityPropagation: options.opportunityPropagation, operationalState: options.operationalState, operationalGoals: options.operationalGoals });
  const baselineOverlapRepair = buildBaselineOverlapRepairCandidates(options.operationalState ?? null, { createdAt: options.createdAt ?? null, baselineSeedHardFeasibility: options.baselineSeedHardFeasibility ?? null, auditPassedToCandidateBuilder: options.baselineSeedHardFeasibility != null });
  const baselineOverlapRepairSummary = { ...baselineOverlapRepair.summary, runtimeInvariant: assertBaselineRepairRuntimeInvariant({ baselineSeedHardFeasibility: options.baselineSeedHardFeasibility ?? null, baselineOverlapRepairSummary: baselineOverlapRepair.summary as unknown as Record<string, unknown>, operationalState: options.operationalState ?? null }) };
  const shouldDelayMainFlow = baselineOverlapRepair.summary.generatedCandidateCount > 0;
  const mainZoneGapResourceBlockSwap = shouldDelayMainFlow ? { candidates: [], evidence: [], summary: emptyMainZoneGapResourceBlockSwapSummary("baseline_overlap_repair_priority"), mainZoneContinuity: emptyMainZoneContinuitySummary() } : buildMainZoneGapResourceBlockSwapCandidates(options.operationalState ?? null, options.createdAt ?? null);
  const mainFlowGapClosure = shouldDelayMainFlow ? { candidates: [], evidence: [], summary: emptyMainFlowGapClosureSummary("baseline_overlap_repair_priority") } : buildMainFlowGapClosureCandidates(options.operationalState ?? null, sourceSearchSpaces, options.createdAt ?? null);
  const generatedCandidates = [...result.candidates, ...baselineOverlapRepair.candidates, ...mainZoneGapResourceBlockSwap.candidates, ...mainFlowGapClosure.candidates].map(cloneCandidate);
  const hardPrefilterResult = prefilterCandidatesByHardConstraints(generatedCandidates, options.operationalState ?? null, { createdAt: options.createdAt ?? null });
  const preselectionResult = preselectCandidates(hardPrefilterResult.candidates, { adaptiveSearchSpaceProfiles: options.adaptiveSearchSpaceProfiles, opportunityPropagation: options.opportunityPropagation, maxCandidates: options.maxPreselectedCandidates, createdAt: options.createdAt ?? null, operationalState: options.operationalState ?? null });
  const baselineSafety = buildBaselinePreservationCandidate(options.operationalState, options.createdAt ?? null, { safetyCandidate: true, searchSpaceCount: sourceSearchSpaces.length });
  const candidates = [...preselectionResult.candidates.map(cloneCandidate), ...(baselineSafety ? [cloneCandidate(baselineSafety.candidate)] : [])];
  const candidatesById = new Map(generatedCandidates.map((candidate) => [candidate.id, candidate]));
  const searchSpacesById = new Map(sourceSearchSpaces.map((searchSpace) => [searchSpace.id, searchSpace]));
  const evidence: Evidence[] = [];
  const generatedBySearchSpaceId = new Map<string, number>();
  for (const candidate of generatedCandidates) {
    const searchSpaceId = typeof candidate.metadata.searchSpaceId === "string" ? candidate.metadata.searchSpaceId : "";
    generatedBySearchSpaceId.set(searchSpaceId, (generatedBySearchSpaceId.get(searchSpaceId) ?? 0) + 1);
  }
  const budgetAllocations = sourceSearchSpaces.map((searchSpace) => {
    const allocatedBudget = candidateBudgetBySearchSpaceId.get(searchSpace.id) ?? 0;
    const generatedCandidates = generatedBySearchSpaceId.get(searchSpace.id) ?? 0;
    return { searchSpaceId: searchSpace.id, priority: priorityForSearchSpace(searchSpace), allocatedBudget, generatedCandidates, unusedBudget: Math.max(0, allocatedBudget - generatedCandidates) };
  });

  for (const allocation of budgetAllocations) {
    evidence.push({
      id: `evidence:orc-see:candidate-budget:${allocation.searchSpaceId}`,
      source: "orc-see",
      kind: "candidate-budget-allocated",
      subjectId: allocation.searchSpaceId,
      createdAt: null,
      data: { ...allocation, readOnly: true },
    });
  }

  for (const item of [...result.evidence, ...baselineOverlapRepair.evidence, ...mainZoneGapResourceBlockSwap.evidence, ...mainFlowGapClosure.evidence]) {
    if (item.kind === "strategy-candidate-diversity") continue;
    if (item.kind === "main-flow-gap-closure-candidate-generated" || item.kind === "main-zone-gap-resource-block-swap-candidate-generated" || item.kind === "baseline-overlap-repair-candidate-generated") { evidence.push({ ...item, createdAt: item.createdAt ?? null }); continue; }
    if (item.kind === "strategy-candidate-generated") {
      const candidate = candidatesById.get(String(item.subjectId));
      const searchSpaceId = typeof item.data.searchSpaceId === "string" ? item.data.searchSpaceId : String(item.data.searchSpaceId ?? "");
      const searchSpace = searchSpacesById.get(searchSpaceId);
      const traceableData = {
        ...item.data,
        searchSpacePriority: budgetAllocations.find((allocation) => allocation.searchSpaceId === searchSpaceId)?.priority ?? 0,
        allocatedCandidateBudget: budgetAllocations.find((allocation) => allocation.searchSpaceId === searchSpaceId)?.allocatedBudget ?? 0,
        generatedCandidatesForSearchSpace: budgetAllocations.find((allocation) => allocation.searchSpaceId === searchSpaceId)?.generatedCandidates ?? 0,
        unusedCandidateBudget: budgetAllocations.find((allocation) => allocation.searchSpaceId === searchSpaceId)?.unusedBudget ?? 0,
        originSearchSpace: searchSpace ? searchSpaceEvidencePayload(searchSpace) : { id: searchSpaceId },
        generatedCandidate: candidate ? candidateEvidencePayload(candidate) : { id: item.subjectId },
      };
      evidence.push({ ...item, kind: "candidate-generated", createdAt: null, data: traceableData });
      evidence.push({ ...item, createdAt: null, data: traceableData });
      continue;
    }
    if (item.kind === "strategy-variants-generated" || item.kind === "strategy-variant-discarded") {
      evidence.push({
        ...item,
        createdAt: null,
        data: {
          ...item.data,
          originSearchSpace: searchSpacesById.has(String(item.subjectId)) ? searchSpaceEvidencePayload(searchSpacesById.get(String(item.subjectId)) as SearchSpace) : { id: item.subjectId },
        },
      });
      continue;
    }
    if (item.kind === "strategy-candidate-discarded" && item.data.reason === "equivalent-candidate") {
      evidence.push({
        ...item,
        id: String(item.id).replace("strategy-candidate:discarded:equivalent", "candidate:duplicate"),
        kind: "candidate-duplicate-discarded",
        createdAt: null,
        data: {
          ...item.data,
          originSearchSpace: searchSpacesById.has(String(item.subjectId)) ? searchSpaceEvidencePayload(searchSpacesById.get(String(item.subjectId)) as SearchSpace) : { id: item.subjectId },
        },
      });
    }
  }

  const prunedItems = generatedCandidates.filter((candidate) => !preselectionResult.candidates.some((selected) => selected.id === candidate.id)).map(cloneCandidate);

  return {
    candidates,
    evidence: [...evidence, ...hardPrefilterResult.evidence, ...preselectionResult.evidence, ...(baselineSafety ? [baselineSafety.evidence] : [])],
    summary: {
      searchSpaceCount: sourceSearchSpaces.length,
      candidateCount: candidates.length,
      duplicateCandidatesDiscarded: result.summary.discardedEquivalentCandidates,
      truncatedByBudget: false,
      candidateBudget: { globalBudget: GLOBAL_CANDIDATE_BUDGET, allocatedBudget: budgetAllocations.reduce((sum, allocation) => sum + allocation.allocatedBudget, 0), unusedBudget: budgetAllocations.reduce((sum, allocation) => sum + allocation.unusedBudget, 0), allocations: budgetAllocations },
      pruning: { generatedCount: generatedCandidates.length, keptCount: preselectionResult.candidates.length, prunedCount: prunedItems.length, estimatedBudgetSaved: prunedItems.length, prunedItems },
      hardPrefilter: { receivedCandidateCount: hardPrefilterResult.summary.receivedCandidateCount, acceptedCandidateCount: hardPrefilterResult.summary.acceptedCandidateCount, discardedCandidateCount: hardPrefilterResult.summary.discardedCandidateCount, discardedByReason: hardPrefilterResult.summary.discardedByReason, overflowDiscardCount: hardPrefilterResult.summary.overflowDiscardCount },
      preselection: preselectionResult.summary,
      baselineOverlapRepair: { ...baselineOverlapRepairSummary, discardedByPrefilter: baselineOverlapRepair.candidates.filter((candidate) => !hardPrefilterResult.candidates.some((accepted) => accepted.id === candidate.id)).length, prefilterDiscardReasons: Object.fromEntries(hardPrefilterResult.discardedCandidates.filter((d) => baselineOverlapRepair.candidates.some((c) => c.id === d.candidateId)).reduce((m, d) => m.set(d.reason, (m.get(d.reason) ?? 0) + 1), new Map<string, number>())) },
      mainZoneContinuity: mainZoneGapResourceBlockSwap.mainZoneContinuity,
      mainZoneGapResourceBlockSwap: { ...mainZoneGapResourceBlockSwap.summary, acceptedBeforePrefilter: mainZoneGapResourceBlockSwap.candidates.filter((candidate) => hardPrefilterResult.candidates.some((accepted) => accepted.id === candidate.id)).length, discardedByPrefilter: mainZoneGapResourceBlockSwap.candidates.filter((candidate) => !hardPrefilterResult.candidates.some((accepted) => accepted.id === candidate.id)).length, prefilterDiscardReasons: Object.fromEntries(hardPrefilterResult.discardedCandidates.filter((d) => mainZoneGapResourceBlockSwap.candidates.some((c) => c.id === d.candidateId)).reduce((m, d) => m.set(d.reason, (m.get(d.reason) ?? 0) + 1), new Map<string, number>())), prefilterDiscardDetails: hardPrefilterResult.discardedCandidates.filter((d) => mainZoneGapResourceBlockSwap.candidates.some((c) => c.id === d.candidateId)).map((d) => ({ candidateId: d.candidateId, reason: d.reason, conflictingTaskIds: d.conflictingTaskIds ?? d.affectedTaskIds, spaceIds: d.spaceIds ?? [], timeWindow: d.timeWindow ?? null, relatedTimeWindow: d.relatedTimeWindow ?? null, roleLabels: d.roleLabels ?? [], spaceOccupancyModes: d.spaceOccupancyModes ?? [], diagnosticHint: d.diagnosticHint ?? null })), candidateStateCount: 0, simulatedStateCount: 0 },
      mainFlowGapClosure: { ...mainFlowGapClosure.summary, candidatesWithAssignments: mainFlowGapClosure.candidates.filter((candidate) => candidate.assignments.length > 0).length, assignmentCount: mainFlowGapClosure.candidates.reduce((sum, candidate) => sum + candidate.assignments.length, 0), acceptedBeforePrefilter: mainFlowGapClosure.candidates.filter((candidate) => hardPrefilterResult.candidates.some((accepted) => accepted.id === candidate.id)).length, discardedByPrefilter: mainFlowGapClosure.candidates.filter((candidate) => !hardPrefilterResult.candidates.some((accepted) => accepted.id === candidate.id)).length, prefilterDiscardReasons: hardPrefilterResult.summary.discardedByReason, prefilterDiscardDetails: hardPrefilterResult.discardedCandidates.map((d) => ({ candidateId: d.candidateId, reason: d.reason, conflictingTaskIds: d.conflictingTaskIds ?? d.affectedTaskIds, spaceIds: d.spaceIds ?? [], timeWindow: d.timeWindow ?? null, relatedTimeWindow: d.relatedTimeWindow ?? null, roleLabels: d.roleLabels ?? [], spaceOccupancyModes: d.spaceOccupancyModes ?? [], diagnosticHint: d.diagnosticHint ?? null })), candidateStateCount: 0, simulatedStateCount: 0 },
      baselineSafety: baselineSafetySummary({ generated: baselineSafety != null, candidateId: baselineSafety?.candidate.id ?? null, reason: baselineSafety?.summary.generationReason ?? null, planningCount: baselineSafety?.summary.plannedTaskCount ?? 0, searchSpaceCount: sourceSearchSpaces.length }),
    },
  };
}

export const buildCandidatesFromSearchSpaces = buildCandidates;
