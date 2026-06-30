import type { EngineInput } from "../../types";
import type { Evidence, ValidationResult } from "../contracts";
import { buildOperationalStateFromEngineInput } from "../adapters/fromEngineInput";
import { buildDecisionInput } from "../decision/decisionInput";
import { executeDecisionPipeline } from "../decision/decisionPipelineOrchestrator";
import { deepFreeze } from "../immutability";
import type { CandidateBuilderResult } from "../see/candidateBuilder";
import { buildBaselinePreservationCandidate } from "../see/baselinePreservationCandidate";
import { composePartialPlans } from "../see/partialPlanComposer";

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
  // ValidationResult intentionally exposes only summarized constraint codes today.
  // The deterministic task list below is bounded and diagnostic-only, never a snapshot.
  if (validation?.result !== "INVALID") return { ids: [], count: 0 };
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
    if (!input) return finalize({ available: false, hardFeasible: false, reason: "baseline_seed_not_available", operationalStateId: null, plannedTaskCount: 0, candidateId: null, partialPlanId: null, simulatedStateId: null, validationResultId: null, validationResult: null, violatedConstraints: [], violatedConstraintSummary: emptySummary(), affectedTaskIds: [], affectedTaskIdCount: 0, commitCount: 0, validSimulationCount: 0, invalidSimulationCount: 0 }, createdAt);
    const operationalState = buildOperationalStateFromEngineInput(input);
    const plannedTaskCount = operationalState.planning.length;
    if (plannedTaskCount === 0) return finalize({ available: false, hardFeasible: false, reason: "baseline_seed_has_no_planning", operationalStateId: operationalState.id, plannedTaskCount, candidateId: null, partialPlanId: null, simulatedStateId: null, validationResultId: null, validationResult: null, violatedConstraints: [], violatedConstraintSummary: emptySummary(), affectedTaskIds: [], affectedTaskIdCount: 0, commitCount: 0, validSimulationCount: 0, invalidSimulationCount: 0 }, createdAt);
    const baseline = buildBaselinePreservationCandidate(operationalState, createdAt, { safetyCandidate: true, searchSpaceCount: 0 });
    if (!baseline) return finalize({ available: false, hardFeasible: false, reason: "baseline_seed_has_no_planning", operationalStateId: operationalState.id, plannedTaskCount, candidateId: null, partialPlanId: null, simulatedStateId: null, validationResultId: null, validationResult: null, violatedConstraints: [], violatedConstraintSummary: emptySummary(), affectedTaskIds: [], affectedTaskIdCount: 0, commitCount: 0, validSimulationCount: 0, invalidSimulationCount: 0 }, createdAt);
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
        baselineSafety: { generated: true, candidateId: baseline.candidate.id, reason: baseline.summary.generationReason, planningCount: plannedTaskCount, searchSpaceCount: 0, readOnly: true, planningInfluence: "none" },
      },
    };
    const decisionInput = buildDecisionInput(candidateResult);
    const pipeline = executeDecisionPipeline({ ...decisionInput, operationalState, createdAt });
    const validation = pipeline.validation.validationResults[0] ?? null;
    const simulated = pipeline.simulation.simulatedStates[0] ?? null;
    const affected = extractAffectedTaskIds(input, validation, maxAffectedTaskIds);
    const hardFeasible = validation?.result === "VALID";
    return finalize({ available: true, hardFeasible, reason: hardFeasible ? "baseline_seed_hard_feasible" : "baseline_seed_hard_infeasible", operationalStateId: operationalState.id, plannedTaskCount, candidateId: baseline.candidate.id, partialPlanId: composed.partialPlans[0]?.partialPlanId ?? null, simulatedStateId: simulated?.id ?? null, validationResultId: validation?.id ?? null, validationResult: validation?.result ?? null, violatedConstraints: [...(validation?.violatedConstraints ?? [])].sort(), violatedConstraintSummary: summarize(validation?.violatedConstraints ?? []), affectedTaskIds: affected.ids, affectedTaskIdCount: affected.count, commitCount: pipeline.commit.summary.commitCount, validSimulationCount: pipeline.validation.summary.validCount, invalidSimulationCount: pipeline.validation.summary.invalidCount }, createdAt, [...baseline.candidate.evidenceIds, ...pipeline.evidence.map((item) => item.id)]);
  } catch {
    return finalize({ available: false, hardFeasible: false, reason: "baseline_seed_audit_failed", operationalStateId: null, plannedTaskCount: 0, candidateId: null, partialPlanId: null, simulatedStateId: null, validationResultId: null, validationResult: null, violatedConstraints: [], violatedConstraintSummary: emptySummary(), affectedTaskIds: [], affectedTaskIdCount: 0, commitCount: 0, validSimulationCount: 0, invalidSimulationCount: 0 }, createdAt);
  }
}
