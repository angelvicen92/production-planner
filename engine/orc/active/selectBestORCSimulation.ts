import type { Candidate, CandidateState, CommitDecision, OperationalValue, SimulatedState, ValidationResult } from "../contracts";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";

export type ORCSimulationSelectionBucket =
  | "valid-committed-post-repair-main-zone-continuity-transformations-changed"
  | "valid-committed-baseline-repair-transformations-changed"
  | "valid-committed-transformations-changed"
  | "valid-baseline-repair-transformations-changed"
  | "valid-executable-transformations"
  | "valid-baseline-preservation"
  | "valid-other"
  | "invalid-diagnostics-only";

export interface ORCSimulationSelectionDiagnostics {
  selectionPolicy: "valid-committed-repair-and-post-repair-continuity-first-v1";
  selectedBucket: ORCSimulationSelectionBucket | null;
  validSimulationCount: number;
  invalidSimulationCount: number;
  committedSimulationIds: string[];
  baselineRepairSimulationIds: string[];
  postRepairContinuitySimulationIds: string[];
  selectedBecause: string | null;
  selectedSimulatedStateId: string | null;
  readOnly: true;
}

export interface ORCSimulationSelection {
  simulation: SimulatedState | null;
  validation: ValidationResult | null;
  value: number | null;
  candidateState: CandidateState | null;
  candidate: Candidate | null;
  commitDecision: CommitDecision | null;
  diagnostics: ORCSimulationSelectionDiagnostics;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").sort() : [];

function postRepairSimulationIds(summary: unknown): Set<string> {
  if (!isRecord(summary) || !isRecord(summary.postRepairMainZoneContinuityPass)) return new Set();
  const ids = new Set<string>();
  if (summary.postRepairMainZoneContinuityPass.selectedAsCommit !== true) return ids;
  const selected = summary.postRepairMainZoneContinuityPass.selectedSimulatedStateId;
  if (typeof selected === "string") ids.add(selected);
  return ids;
}

function lineageSimulationIds(summary: unknown): Set<string> {
  if (!isRecord(summary)) return new Set();
  const repair = summary.baselineOverlapRepair;
  if (!isRecord(repair)) return new Set();
  const ids = new Set<string>();
  const add = (value: unknown) => stringArray(value).forEach((id) => ids.add(id));
  if (isRecord(repair.lineage)) {
    add(repair.lineage.simulatedStateIds);
    add(repair.lineage.committedSimulatedStateIds);
  }
  const late = repair.lateAuditRepairPass;
  if (isRecord(late)) {
    add(late.simulatedStateIds);
    add(late.committedSimulatedStateIds);
    if (isRecord(late.lineage)) {
      add(late.lineage.simulatedStateIds);
      add(late.lineage.committedSimulatedStateIds);
    }
  }
  return ids;
}

function hardViolationCount(validation: ValidationResult | null): number {
  return validation?.violatedConstraints?.length ?? Number.MAX_SAFE_INTEGER;
}

function isExecutable(candidate: Candidate | null): boolean {
  if (candidate?.metadata?.abstract === true || candidate?.metadata?.readOnly === true) return false;
  return true;
}

export function selectBestORCSimulation(shadow: ORCShadowModeResult | null): ORCSimulationSelection {
  const emptyDiagnostics: ORCSimulationSelectionDiagnostics = { selectionPolicy: "valid-committed-repair-and-post-repair-continuity-first-v1", selectedBucket: null, validSimulationCount: 0, invalidSimulationCount: 0, committedSimulationIds: [], baselineRepairSimulationIds: [], postRepairContinuitySimulationIds: [], selectedBecause: null, selectedSimulatedStateId: null, readOnly: true };
  if (!shadow) return { simulation: null, validation: null, value: null, candidateState: null, candidate: null, commitDecision: null, diagnostics: emptyDiagnostics };
  const validationBySimulatedStateId = new Map((shadow.validationResults ?? []).map((item) => [item.simulatedStateId, item]));
  const operationalValueBySimulatedStateId = new Map((shadow.operationalValues ?? []).map((item) => [item.simulatedStateId, item]));
  const candidateStateById = new Map((shadow.candidateStates ?? []).map((item) => [item.id, item]));
  const candidateById = new Map((shadow.candidates ?? []).map((item) => [item.id, item]));
  const commitDecisionBySimulatedStateId = new Map<string, CommitDecision>();
  for (const decision of shadow.commitDecisions ?? []) if (decision.decision === "COMMIT" && decision.operationalValueId != null) commitDecisionBySimulatedStateId.set(decision.operationalValueId, decision);
  const baselineRepairIds = lineageSimulationIds(shadow.summary);
  const postRepairIds = postRepairSimulationIds(shadow.summary);

  const rows = [...(shadow.simulatedStates ?? [])].map((simulation) => {
    const candidateState = candidateStateById.get(simulation.candidateStateId) ?? null;
    let candidate = candidateState ? candidateById.get(candidateState.candidateId) ?? null : null;
    if (candidate == null && candidateState?.candidateId.startsWith("candidate:partial-plan:")) {
      const sourceCandidateId = candidateState.candidateId.slice("candidate:partial-plan:".length).split("+")[0];
      candidate = candidateById.get(sourceCandidateId) ?? null;
    }
    const validation = validationBySimulatedStateId.get(simulation.id) ?? null;
    const operationalValue = operationalValueBySimulatedStateId.get(simulation.id) ?? null;
    const materialization = simulation.planningMaterialization;
    const committed = commitDecisionBySimulatedStateId.has(simulation.id);
    const baselineRepair = baselineRepairIds.has(simulation.id);
    const postRepair = postRepairIds.has(simulation.id);
    const transformations = materialization?.source === "candidate_transformations";
    const changed = (materialization?.changedTaskCount ?? 0) > 0;
    const executable = isExecutable(candidate);
    let bucket: ORCSimulationSelectionBucket;
    if (validation?.result !== "VALID") bucket = "invalid-diagnostics-only";
    else if (committed && postRepair && transformations && changed) bucket = "valid-committed-post-repair-main-zone-continuity-transformations-changed";
    else if (committed && baselineRepair && transformations && changed) bucket = "valid-committed-baseline-repair-transformations-changed";
    else if (committed && transformations && changed) bucket = "valid-committed-transformations-changed";
    else if (baselineRepair && transformations && changed) bucket = "valid-baseline-repair-transformations-changed";
    else if (executable && transformations) bucket = "valid-executable-transformations";
    else if (materialization?.source === "baseline_seed_preserved") bucket = "valid-baseline-preservation";
    else bucket = "valid-other";
    return { simulation, validation, operationalValue, candidateState, candidate, commitDecision: commitDecisionBySimulatedStateId.get(simulation.id) ?? null, bucket, committed, baselineRepair, changedTaskCount: materialization?.changedTaskCount ?? 0 };
  });
  const validRows = rows.filter((row) => row.validation?.result === "VALID");
  const eligible = validRows.length > 0 ? validRows : rows;
  const bucketOrder: ORCSimulationSelectionBucket[] = ["valid-committed-post-repair-main-zone-continuity-transformations-changed", "valid-committed-baseline-repair-transformations-changed", "valid-committed-transformations-changed", "valid-baseline-repair-transformations-changed", "valid-executable-transformations", "valid-baseline-preservation", "valid-other", "invalid-diagnostics-only"];
  eligible.sort((a, b) => bucketOrder.indexOf(a.bucket) - bucketOrder.indexOf(b.bucket)
    || (b.operationalValue?.overallScore ?? -Infinity) - (a.operationalValue?.overallScore ?? -Infinity)
    || hardViolationCount(a.validation) - hardViolationCount(b.validation)
    || b.changedTaskCount - a.changedTaskCount
    || a.simulation.id.localeCompare(b.simulation.id));
  const selected = eligible[0] ?? null;
  const diagnostics: ORCSimulationSelectionDiagnostics = {
    selectionPolicy: "valid-committed-repair-and-post-repair-continuity-first-v1",
    selectedBucket: selected?.bucket ?? null,
    validSimulationCount: validRows.length,
    invalidSimulationCount: rows.filter((row) => row.validation?.result === "INVALID").length,
    committedSimulationIds: [...commitDecisionBySimulatedStateId.keys()].sort(),
    baselineRepairSimulationIds: [...baselineRepairIds].sort(),
    postRepairContinuitySimulationIds: [...postRepairIds].sort(),
    selectedBecause: selected ? `${selected.bucket}; valid simulations are preferred over invalid diagnostics` : null,
    selectedSimulatedStateId: selected?.simulation.id ?? null,
    readOnly: true,
  };
  return { simulation: selected?.simulation ?? null, validation: selected?.validation ?? null, value: selected?.operationalValue?.overallScore ?? null, candidateState: selected?.candidateState ?? null, candidate: selected?.candidate ?? null, commitDecision: selected?.commitDecision ?? null, diagnostics };
}
