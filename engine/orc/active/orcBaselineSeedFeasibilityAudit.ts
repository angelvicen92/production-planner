import type { EngineInput } from "../../types";
import type { Evidence, ValidationResult, ValidationViolationDetail } from "../contracts";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { buildDecisionInput } from "../decision/decisionInput";
import { executeDecisionPipeline } from "../decision/decisionPipelineOrchestrator";
import { deepFreeze } from "../immutability";
import type { CandidateBuilderResult } from "../see/candidateBuilder";
import { buildBaselinePreservationCandidate } from "../see/baselinePreservationCandidate";
import { composePartialPlans } from "../see/partialPlanComposer";
import { dominantViolationCodes, sampleViolationDetailsByCode } from "../validation/protectedBreakScope";
import { resolveORCMealSemantics } from "../state/mealSemanticsResolver";

export type ORCBaselineSeedHardFeasibilityReason =
  | "baseline_seed_not_available"
  | "baseline_seed_has_no_planning"
  | "baseline_seed_hard_feasible"
  | "baseline_seed_hard_infeasible"
  | "baseline_seed_audit_failed";

export interface ORCBaselineSeedHardFeasibilityAudit {
  available: boolean;
  hardFeasible: boolean;
  reason: ORCBaselineSeedHardFeasibilityReason;
  operationalStateId: string | null;
  plannedTaskCount: number;
  candidateId: string | null;
  partialPlanId: string | null;
  simulatedStateId: string | null;
  validationResultId: string | null;
  validationResult: "VALID" | "INVALID" | null;
  violatedConstraints: string[];
  violatedConstraintSummary: Record<string, number>;
  violationDetailCount: number;
  violationDetailsSample: ValidationViolationDetail[];
  violationDetailsTruncated: boolean;
  mealSemantics?: Record<string, unknown>;
  transportContract?: Record<string, unknown> | null;
  spaceContractSummary?: Record<string, unknown>;
  spaceOccupancySummary?: Record<string, unknown>;
  transportOccupancySummary?: Record<string, unknown>;
  transportOverlapGroups?: Record<string, unknown>[];
  spaceOverlapGroups?: Record<string, unknown>[];
  spaceOverlapRootCauses?: string[];
  hardFeasibilityRootCauses?: string[];
  dominantViolationCodes: string[];
  affectedTaskIds: number[];
  affectedTaskIdCount: number;
  commitCount: number;
  validSimulationCount: number;
  invalidSimulationCount: number;
  evidenceIds: string[];
  readOnly: true;
  mutatesOperationalState: false;
  commitsPlanning: false;
  planningInfluence: "baseline-seed-feasibility-audit-only";
}

export interface ORCBaselineSeedHardFeasibilityAuditResult extends ORCBaselineSeedHardFeasibilityAudit {
  evidence: Evidence[];
}

export interface ORCBaselineSeedHardFeasibilityAuditOptions {
  createdAt?: string | null;
  maxAffectedTaskIds?: number;
}

const AUDIT_EVIDENCE_KIND = "baseline-seed-hard-feasibility-audited";
const PLANNING_INFLUENCE = "baseline-seed-feasibility-audit-only" as const;

const emptySummary = (): Record<string, number> => ({});

function summarize(violations: readonly string[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const violation of violations) summary[violation] = (summary[violation] ?? 0) + 1;
  return Object.fromEntries(Object.entries(summary).sort(([a], [b]) => a.localeCompare(b)));
}

function extractAffectedTaskIds(input: EngineInput, validation: ValidationResult | null, max: number): { ids: number[]; count: number } {
  if (validation?.result !== "INVALID") return { ids: [], count: 0 };
  const detailIds = [...new Set((validation.violationDetails ?? []).flatMap((detail) => detail.taskIds ?? []))].filter(Number.isFinite).sort((a, b) => a - b);
  if (detailIds.length > 0) return { ids: detailIds.slice(0, Math.max(0, max)), count: detailIds.length };
  const ids = [...new Set((input.tasks ?? []).filter((task) => task.startPlanned && task.endPlanned).map((task) => Number(task.id)).filter(Number.isFinite))].sort((a, b) => a - b);
  return { ids: ids.slice(0, Math.max(0, max)), count: ids.length };
}

function buildAuditEvidence(audit: ORCBaselineSeedHardFeasibilityAudit, createdAt: string | null): Evidence {
  return deepFreeze({
    id: `evidence:orc-active:${AUDIT_EVIDENCE_KIND}:${audit.operationalStateId ?? "unavailable"}:v1`,
    source: "orc-active-baseline-seed-feasibility-audit",
    kind: AUDIT_EVIDENCE_KIND,
    subjectId: audit.operationalStateId ?? "ORC-baseline-seed",
    createdAt,
    data: {
      hardFeasible: audit.hardFeasible,
      reason: audit.reason,
      plannedTaskCount: audit.plannedTaskCount,
      validationResult: audit.validationResult,
      violatedConstraintSummary: audit.violatedConstraintSummary,
      violationDetailCount: audit.violationDetailCount,
      violationDetailsSample: audit.violationDetailsSample,
      violationDetailsTruncated: audit.violationDetailsTruncated,
      sampleStrategy: "stratified_by_violation_code",
      dominantViolationCodes: audit.dominantViolationCodes,
      mealSemantics: audit.mealSemantics ?? null,
      hardFeasibilityRootCauses: audit.hardFeasibilityRootCauses ?? [],
      affectedTaskIds: audit.affectedTaskIds,
      affectedTaskIdCount: audit.affectedTaskIdCount,
      commitCount: audit.commitCount,
      validSimulationCount: audit.validSimulationCount,
      invalidSimulationCount: audit.invalidSimulationCount,
      readOnly: true,
      mutatesOperationalState: false,
      commitsPlanning: false,
      planningInfluence: PLANNING_INFLUENCE,
    },
  }) as Evidence;
}

function finalize(audit: Omit<ORCBaselineSeedHardFeasibilityAudit, "evidenceIds" | "readOnly" | "mutatesOperationalState" | "commitsPlanning" | "planningInfluence">, createdAt: string | null, extraEvidenceIds: string[] = []): ORCBaselineSeedHardFeasibilityAuditResult {
  const core: ORCBaselineSeedHardFeasibilityAudit = {
    ...audit,
    evidenceIds: [],
    readOnly: true,
    mutatesOperationalState: false,
    commitsPlanning: false,
    planningInfluence: PLANNING_INFLUENCE,
  };
  const evidence = buildAuditEvidence(core, createdAt);
  const withIds = { ...core, evidenceIds: [...extraEvidenceIds, evidence.id].sort() };
  return deepFreeze({ ...withIds, evidence: [evidence] }) as ORCBaselineSeedHardFeasibilityAuditResult;
}

export function auditORCBaselineSeedHardFeasibility(input: EngineInput | null | undefined, options: ORCBaselineSeedHardFeasibilityAuditOptions = {}): ORCBaselineSeedHardFeasibilityAuditResult {
  const createdAt = options.createdAt ?? null;
  const maxAffectedTaskIds = options.maxAffectedTaskIds ?? 50;
  try {
    const emptyDetails = { violationDetailCount: 0, violationDetailsSample: [], violationDetailsTruncated: false, dominantViolationCodes: [] };
    if (!input) return finalize({ available: false, hardFeasible: false, reason: "baseline_seed_not_available", operationalStateId: null, plannedTaskCount: 0, candidateId: null, partialPlanId: null, simulatedStateId: null, validationResultId: null, validationResult: null, violatedConstraints: [], violatedConstraintSummary: emptySummary(), ...emptyDetails, affectedTaskIds: [], affectedTaskIdCount: 0, commitCount: 0, validSimulationCount: 0, invalidSimulationCount: 0 }, createdAt);
    const operationalState = buildOperationalStateFromEngineInput(input);
    const plannedTaskCount = operationalState.planning.length;
    if (plannedTaskCount === 0) return finalize({ available: false, hardFeasible: false, reason: "baseline_seed_has_no_planning", operationalStateId: operationalState.id, plannedTaskCount, candidateId: null, partialPlanId: null, simulatedStateId: null, validationResultId: null, validationResult: null, violatedConstraints: [], violatedConstraintSummary: emptySummary(), ...emptyDetails, affectedTaskIds: [], affectedTaskIdCount: 0, commitCount: 0, validSimulationCount: 0, invalidSimulationCount: 0 }, createdAt);
    const baseline = buildBaselinePreservationCandidate(operationalState, createdAt, { safetyCandidate: true, searchSpaceCount: 0 });
    if (!baseline) return finalize({ available: false, hardFeasible: false, reason: "baseline_seed_has_no_planning", operationalStateId: operationalState.id, plannedTaskCount, candidateId: null, partialPlanId: null, simulatedStateId: null, validationResultId: null, validationResult: null, violatedConstraints: [], violatedConstraintSummary: emptySummary(), ...emptyDetails, affectedTaskIds: [], affectedTaskIdCount: 0, commitCount: 0, validSimulationCount: 0, invalidSimulationCount: 0 }, createdAt);
    const composed = composePartialPlans([baseline.candidate], { createdAt, maxPartialPlans: 1 });
    const candidateResult: CandidateBuilderResult & { partialPlans?: typeof composed.partialPlans } = {
      candidates: [baseline.candidate],
      evidence: [baseline.evidence, ...composed.evidence],
      partialPlans: [...composed.partialPlans],
      summary: {
        searchSpaceCount: 0,
        candidateCount: 1,
        duplicateCandidatesDiscarded: 0,
        truncatedByBudget: false,
        candidateBudget: { globalBudget: 1, allocatedBudget: 1, unusedBudget: 0, allocations: [] },
        pruning: { generatedCount: 1, keptCount: 1, prunedCount: 0, estimatedBudgetSaved: 0, prunedItems: [] },
        hardPrefilter: { receivedCandidateCount: 1, acceptedCandidateCount: 1, discardedCandidateCount: 0, discardedByReason: {}, overflowDiscardCount: 0 },
        preselection: { generatedCandidates: 1, acceptedCandidates: 1, discardedCandidates: 0, limit: 1, partialPlans: { partialPlanCount: composed.partialPlans.length, discardedCompositionCount: composed.discardedCompositions.length, averageCompatibilityScore: composed.summary.averageCompatibilityScore } },
        mainFlowGapClosure: { executed: false, skippedReason: "baseline_feasibility_audit", mainFlowConfigured: false, mainFlowId: null, generatedCandidateCount: 0, candidateIds: [], candidatesWithAssignments: 0, assignmentCount: 0, discardedByPrefilter: 0, prefilterDiscardReasons: {}, candidateStateCount: 0, simulatedStateCount: 0, validSimulationCount: 0, invalidSimulationCount: 0, selectedCandidateId: null, selectedAsBest: false, selectedAsCommit: false, movedTaskIds: [], gapBeforeMinutes: null, expectedGapAfterMinutes: null, readOnly: true, planningInfluence: "candidate-generation-diagnostics-only", generated: 0, acceptedBeforePrefilter: 0 },
        baselineSafety: { generated: true, candidateId: baseline.candidate.id, reason: baseline.summary.generationReason, planningCount: plannedTaskCount, searchSpaceCount: 0, readOnly: true, planningInfluence: "none" },
      },
    };
    const decisionInput = buildDecisionInput(candidateResult);
    const pipeline = executeDecisionPipeline({ ...decisionInput, operationalState, createdAt });
    const validation = pipeline.validation.validationResults[0] ?? null;
    const simulated = pipeline.simulation.simulatedStates[0] ?? null;
    const affected = extractAffectedTaskIds(input, validation, maxAffectedTaskIds);
    const hardFeasible = validation?.result === "VALID";
    const mealSemantics = resolveORCMealSemantics(operationalState) as any;
    const transportContract = (operationalState.constraints as any).transportContract ?? null;
    const details = validation?.violationDetails ?? [];
    const transportOverlapGroups = details.filter((d: any) => d.code === "TRANSPORT_GROUP_CAPACITY_EXCEEDED").slice(0, 20).map((d: any) => ({ role: d.roleLabels?.[0] ?? null, templateId: null, spaceId: d.spaceIds?.[0] ?? null, timeWindow: d.timeWindow, taskIds: d.taskIds, taskCount: d.transportGroupCount ?? d.taskIds?.length ?? 0, vehicleCapacity: d.transportGroupCapacity ?? transportContract?.vehicleCapacity ?? null, targetGroupSize: null, groupingWeight: transportContract?.groupingWeight ?? null, source: transportContract?.source ?? null, diagnosticHint: d.diagnosticHint }));
    const spaceOverlapGroups = details.filter((d: any) => d.code === "SPACE_OVERLAP").slice(0, 20).map((d: any) => ({ spaceId: d.spaceIds?.[0] ?? null, timeWindow: d.timeWindow, taskIds: d.taskIds, taskCount: d.taskIds?.length ?? 0, spaceCapacity: d.spaceCapacity ?? null, occupancyModes: d.spaceOccupancyModes ?? [], roleLabels: d.roleLabels ?? [], roleSources: d.roleSources ?? [], spaceContractSource: d.spaceContractSource ?? null, diagnosticHint: d.diagnosticHint }));
    const spaceOverlapRootCauses = hardFeasible ? ["valid_after_transport_contract_alignment"] : dominantViolationCodes(details, validation?.violatedConstraints ?? []).map((c) => c === "TRANSPORT_GROUP_CAPACITY_EXCEEDED" ? "transport_group_capacity_exceeded" : c === "SPACE_OVERLAP" ? "preexisting_baseline_overlap" : "unclassified_operational_role");
    return finalize({ available: true, hardFeasible, reason: hardFeasible ? "baseline_seed_hard_feasible" : "baseline_seed_hard_infeasible", operationalStateId: operationalState.id, plannedTaskCount, candidateId: baseline.candidate.id, partialPlanId: composed.partialPlans[0]?.partialPlanId ?? null, simulatedStateId: simulated?.id ?? null, validationResultId: validation?.id ?? null, validationResult: validation?.result ?? null, violatedConstraints: [...(validation?.violatedConstraints ?? [])].sort(), violatedConstraintSummary: summarize(validation?.violatedConstraints ?? []), violationDetailCount: details.length, violationDetailsSample: sampleViolationDetailsByCode(details, { maxTotal: 20 }), violationDetailsTruncated: details.length > 20 || details.some((item) => item.code === "VALIDATION_DETAILS_TRUNCATED"), mealSemantics, transportContract, spaceContractSummary: operationalState.spaces, spaceOccupancySummary: {}, transportOccupancySummary: { transportOverlapGroups }, transportOverlapGroups, spaceOverlapGroups, spaceOverlapRootCauses, hardFeasibilityRootCauses: hardFeasible ? ["valid_after_semantics_alignment"] : dominantViolationCodes(details, validation?.violatedConstraints ?? []).map((c) => c === "SPACE_OVERLAP" ? "productive_space_overlap" : c === "PLANNING_CROSSES_HARD_MEAL_BREAK" ? "explicit_global_meal_break_conflict" : "unclassified_operational_role"), dominantViolationCodes: dominantViolationCodes(details, validation?.violatedConstraints ?? []), affectedTaskIds: affected.ids, affectedTaskIdCount: affected.count, commitCount: pipeline.commit.summary.commitCount, validSimulationCount: pipeline.validation.summary.validCount, invalidSimulationCount: pipeline.validation.summary.invalidCount }, createdAt, [...baseline.candidate.evidenceIds, ...pipeline.evidence.map((item) => item.id)]);
  } catch {
    return finalize({ available: false, hardFeasible: false, reason: "baseline_seed_audit_failed", operationalStateId: null, plannedTaskCount: 0, candidateId: null, partialPlanId: null, simulatedStateId: null, validationResultId: null, validationResult: null, violatedConstraints: [], violatedConstraintSummary: emptySummary(), violationDetailCount: 0, violationDetailsSample: [], violationDetailsTruncated: false, dominantViolationCodes: [], affectedTaskIds: [], affectedTaskIdCount: 0, commitCount: 0, validSimulationCount: 0, invalidSimulationCount: 0 }, createdAt);
  }
}
