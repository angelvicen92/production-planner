import type { Candidate, CandidateState, CommitDecision, OperationalValue, SimulatedState, ValidationResult } from "../contracts";
import type { ORCShadowModeResult } from "../shadow/runORCShadowMode";
import { resolveORCCandidateLineage } from "./orcCandidateLineageResolver";

export type ORCSimulationSelectionBucket =
  | "valid-committed-macro-main-zone-block-relayout"
  | "valid-committed-post-continuity-critical-resource-idle-compression-and-continuity" | "valid-committed-continuity-and-resource-compactness"
  | "valid-committed-critical-resource-idle-compression"
  | "valid-committed-post-repair-main-zone-continuity-transformations-changed"
  | "valid-committed-baseline-repair-transformations-changed"
  | "valid-committed-transformations-changed"
  | "valid-baseline-repair-transformations-changed"
  | "valid-executable-transformations"
  | "valid-baseline-preservation"
  | "valid-other"
  | "invalid-diagnostics-only";

export interface ORCSimulationSelectionDiagnostics {
  selectionPolicy: "valid-committed-dominant-macro-main-zone-relayout-first-v3";
  selectedBucket: ORCSimulationSelectionBucket | null;
  validSimulationCount: number;
  invalidSimulationCount: number;
  committedSimulationIds: string[];
  baselineRepairSimulationIds: string[];
  postRepairContinuitySimulationIds: string[];
  criticalResourceIdleCompressionSimulationIds: string[];
  postContinuityResourceCompressionSimulationIds: string[];
  macroMainZoneRelayoutSimulationIds: string[];
  macroProductionWaveDayShapeSimulationIds: string[];
  pureMacroProductionWaveDayShapeSimulationIds: string[];
  compositeMacroProductionWaveDayShapeSimulationIds: string[];
  compositeMacroSimulationIds: string[];
  lineageConsistency: { ok: boolean; warnings: string[]; readOnly: true };
  macroPassSimulationIds: string[];
  macroPassLineageFallbackUsed: boolean;
  macroPassLineageFallbackWarnings: string[];
  macroMainZoneRelayoutAcceptedSimulationIds: string[];
  macroMainZoneRelayoutRejectedSimulationIds: string[];
  macroMainZoneRelayoutRejectReasons: Record<string,string>;
  macroMainZoneRelayoutAcceptedByMacroValueGate: boolean;
  macroMainZoneRelayoutAcceptedByGlobalMacroValueGate: boolean;
  macroMainZoneRelayoutGlobalRejectReasons: Record<string,string>;
  macroMainZoneRelayoutGlobalValueBySimulationId: Record<string,unknown>;
  macroMainZoneRelayoutScoreDelta: number | null;
  baseCompositeSimulationId: string | null;
  selectedBecause: string | null;
  selectedSimulatedStateId: string | null;
  selectedFinalCandidateFamily: string | null;
  selectedFinalCandidateId: string | null;
  selectedFinalSimulatedStateId: string | null;
  selectedFinalIncludesCompositeAncestors: boolean;
  resourceCompressionAcceptedByNetValueGate?: boolean;
  resourceCompressionRejectedSimulationIds?: string[];
  resourceCompressionRejectReasons?: Record<string,string>;
  baseCompositeOverallScore?: number | null;
  resourceCompressionOverallScore?: number | null;
  resourceCompressionScoreDelta?: number | null;
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

function resourceIdleSimulationIds(summary: unknown): Set<string> {
  if (!isRecord(summary) || !isRecord(summary.criticalResourceIdleCompression)) return new Set();
  const ids = new Set<string>();
  const compact = summary.criticalResourceIdleCompression;
  const add = (value: unknown) => stringArray(value).forEach((id) => ids.add(id));
  if (isRecord(compact.lineage)) { add(compact.lineage.simulatedStateIds); add(compact.lineage.committedSimulatedStateIds); }
  const selected = compact.selectedSimulatedStateId; if (typeof selected === "string") ids.add(selected);
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
  const emptyDiagnostics: ORCSimulationSelectionDiagnostics = { selectionPolicy: "valid-committed-dominant-macro-main-zone-relayout-first-v3", selectedBucket: null, validSimulationCount: 0, invalidSimulationCount: 0, committedSimulationIds: [], baselineRepairSimulationIds: [], postRepairContinuitySimulationIds: [], criticalResourceIdleCompressionSimulationIds: [], postContinuityResourceCompressionSimulationIds: [], macroMainZoneRelayoutSimulationIds: [], macroProductionWaveDayShapeSimulationIds: [], pureMacroProductionWaveDayShapeSimulationIds: [], compositeMacroProductionWaveDayShapeSimulationIds: [], compositeMacroSimulationIds: [], lineageConsistency: { ok: true, warnings: [], readOnly: true }, macroPassSimulationIds: [], macroPassLineageFallbackUsed: false, macroPassLineageFallbackWarnings: [], macroMainZoneRelayoutAcceptedSimulationIds: [], macroMainZoneRelayoutRejectedSimulationIds: [], macroMainZoneRelayoutRejectReasons: {}, macroMainZoneRelayoutAcceptedByMacroValueGate: false, macroMainZoneRelayoutAcceptedByGlobalMacroValueGate: false, macroMainZoneRelayoutGlobalRejectReasons: {}, macroMainZoneRelayoutGlobalValueBySimulationId: {}, macroMainZoneRelayoutScoreDelta: null, baseCompositeSimulationId: null, selectedBecause: null, selectedSimulatedStateId: null, selectedFinalCandidateFamily: null, selectedFinalCandidateId: null, selectedFinalSimulatedStateId: null, selectedFinalIncludesCompositeAncestors: false, resourceCompressionAcceptedByNetValueGate: false, resourceCompressionRejectedSimulationIds: [], resourceCompressionRejectReasons: {}, baseCompositeOverallScore: null, resourceCompressionOverallScore: null, resourceCompressionScoreDelta: null, readOnly: true };
  if (!shadow) return { simulation: null, validation: null, value: null, candidateState: null, candidate: null, commitDecision: null, diagnostics: emptyDiagnostics };
  const validationBySimulatedStateId = new Map((shadow.validationResults ?? []).map((item) => [item.simulatedStateId, item]));
  const operationalValueBySimulatedStateId = new Map((shadow.operationalValues ?? []).map((item) => [item.simulatedStateId, item]));
  const candidateStateById = new Map((shadow.candidateStates ?? []).map((item) => [item.id, item]));
  const candidateById = new Map((shadow.candidates ?? []).map((item) => [item.id, item]));
  const commitDecisionBySimulatedStateId = new Map<string, CommitDecision>();
  for (const decision of shadow.commitDecisions ?? []) if (decision.decision === "COMMIT" && decision.operationalValueId != null) commitDecisionBySimulatedStateId.set(decision.operationalValueId, decision);
  const baselineRepairIds = lineageSimulationIds(shadow.summary);
  const postRepairIds = postRepairSimulationIds(shadow.summary);
  const criticalResourceIdleIds = resourceIdleSimulationIds(shadow.summary);
  const postContinuityResourceIdleIds = new Set<string>();
  if (isRecord(shadow.summary) && isRecord(shadow.summary.criticalResourceIdleCompression) && shadow.summary.criticalResourceIdleCompression.executionPhase === "post-continuity-pass") {
    for (const id of criticalResourceIdleIds) postContinuityResourceIdleIds.add(id);
  }

  const lineageBySimulationId = new Map<string, ReturnType<typeof resolveORCCandidateLineage>>();
  for (const simulation of shadow.simulatedStates ?? []) {
    const cs = candidateStateById.get(simulation.candidateStateId) ?? null;
    lineageBySimulationId.set(simulation.id, resolveORCCandidateLineage({ candidateId: cs?.candidateId ?? (simulation as any).metadata?.candidateId ?? simulation.candidateStateId, simulatedStateId: simulation.id, candidateStateId: simulation.candidateStateId }));
  }
  const macroMainLineageIds = new Set([...lineageBySimulationId.entries()].filter(([,l])=>l.containsMacroMainZoneBlockRelayout).map(([id])=>id));
  const dayShapeLineageIds = new Set([...lineageBySimulationId.entries()].filter(([,l])=>l.containsMacroProductionWaveDayShape).map(([id])=>id));
  const pureDayShapeLineageIds = new Set([...lineageBySimulationId.entries()].filter(([,l])=>l.containsMacroProductionWaveDayShape&&!l.compositeFamily).map(([id])=>id));
  const compositeDayShapeLineageIds = new Set([...lineageBySimulationId.entries()].filter(([,l])=>l.containsMacroProductionWaveDayShape&&l.compositeFamily).map(([id])=>id));
  const compositeMacroIds = new Set([...lineageBySimulationId.entries()].filter(([,l])=>l.compositeFamily&&l.candidateFamilies.filter(f=>f.startsWith("macro-")).length>1).map(([id])=>id));
  const macroSummary = isRecord(shadow.summary) && isRecord((shadow.summary as any).macroMainZoneBlockRelayout) ? (shadow.summary as any).macroMainZoneBlockRelayout as Record<string,unknown> : null;
  const macroPassSimulationIds = new Set<string>(macroSummary && isRecord(macroSummary.lineage) ? stringArray((macroSummary.lineage as any).simulatedStateIds) : []);
  if (typeof macroSummary?.selectedSimulatedStateId === "string") macroPassSimulationIds.add(macroSummary.selectedSimulatedStateId);
  const macroPassLineageFallbackWarnings: string[] = [];
  const macroPassLineageFallbackUsed = [...macroPassSimulationIds].some((id) => !lineageBySimulationId.has(id));
  if (macroPassLineageFallbackUsed) macroPassLineageFallbackWarnings.push("macro_pass_contains_simulation_ids_not_present_in_shadow_simulated_states");
  const macroIds = new Set<string>(macroMainLineageIds);
  const macroAccepted = macroSummary?.selectedAsCommit === true && isRecord(macroSummary.netValue) && (macroSummary.netValue as any).acceptedByMacroValueGate === true && (macroSummary.netValue as any).acceptedByGlobalMacroValueGate === true && (macroSummary.netValue as any).acceptedByDominanceGate === true && (macroSummary.netValue as any).macroMaterializationSourceComplete !== false;
  const macroLocalAccepted = isRecord(macroSummary?.netValue) && (macroSummary!.netValue as any).acceptedByMacroValueGate === true;
  const macroGlobalAccepted = isRecord(macroSummary?.netValue) && (macroSummary!.netValue as any).acceptedByGlobalMacroValueGate === true;
  const idleSummary = isRecord(shadow.summary) && isRecord(shadow.summary.criticalResourceIdleCompression) ? shadow.summary.criticalResourceIdleCompression : null;
  const idleNetValue = isRecord(idleSummary?.netValue) ? idleSummary.netValue : null;
  const resourceCompressionAcceptedByNetValueGate = idleNetValue?.acceptedByNetValueGate === true;
  const baseCompositeSimulationId = idleSummary ? (typeof idleSummary.sourceSimulationId === "string" ? idleSummary.sourceSimulationId : null) : null;

  const lineageWarnings: string[] = [];
  const localDayShape = isRecord(macroSummary?.macroProductionWaveDayShape) ? macroSummary!.macroProductionWaveDayShape as Record<string, unknown> : null;
  const localDayShapeCount = Number(localDayShape?.simulatedStateCount ?? localDayShape?.validSimulationCount ?? 0);
  for (const id of macroMainLineageIds) { const l = lineageBySimulationId.get(id); if (id.includes("macro-production-wave-day-shape") && l && !l.containsMacroMainZoneBlockRelayout) lineageWarnings.push(`macro_main_contains_pure_day_shape:${id}`); }
  for (const [id, l] of lineageBySimulationId) {
    if (id.includes("macro-production-wave-day-shape") && !l.containsMacroProductionWaveDayShape) lineageWarnings.push(`day_shape_text_not_resolved:${id}`);
  }
  if (localDayShapeCount > 0 && dayShapeLineageIds.size === 0) lineageWarnings.push("local_day_shape_simulations_missing_from_global_selection");
  const textualCompositeMacro = [...lineageBySimulationId.entries()].filter(([id,l]) => id.includes("+") && l.candidateFamilies.filter(f=>f.startsWith("macro-")).length > 1);
  if (textualCompositeMacro.length > 0 && compositeMacroIds.size === 0) lineageWarnings.push("textual_composite_macro_ids_missing_from_composite_selection");

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
    const macroMainZoneRelayout = macroIds.has(simulation.id) || candidate?.metadata?.strategy === "MACRO_MAIN_ZONE_BLOCK_RELAYOUT";
    const criticalResourceIdle = criticalResourceIdleIds.has(simulation.id) || candidate?.metadata?.strategy === "CRITICAL_RESOURCE_IDLE_COMPRESSION";
    const postContinuityCriticalResourceIdle = postContinuityResourceIdleIds.has(simulation.id);
    const idleReduction = idleSummary ? Number(idleSummary.targetLocalGapReductionMinutes ?? idleSummary.targetResourceIdleReductionMinutes ?? 0) : 0;
    const idlePreservesContinuity = idleSummary ? idleSummary.mainZoneContinuityPreserved !== false : true;
    const contractsOk = materialization?.assignedSpaceContractValid !== false && !((materialization as Record<string, unknown> | undefined)?.summaryContractValid === false);
    const transformations = materialization?.source === "candidate_transformations";
    const changed = (materialization?.changedTaskCount ?? 0) > 0;
    const executable = isExecutable(candidate);
    let bucket: ORCSimulationSelectionBucket;
    if (validation?.result !== "VALID" || !contractsOk) bucket = "invalid-diagnostics-only";
    else if (committed && macroMainZoneRelayout && transformations && changed && macroAccepted) bucket = "valid-committed-macro-main-zone-block-relayout";
    else if (committed && postContinuityCriticalResourceIdle && postRepair && transformations && changed && idleReduction > 0 && idlePreservesContinuity && resourceCompressionAcceptedByNetValueGate) bucket = "valid-committed-post-continuity-critical-resource-idle-compression-and-continuity";
    else if (committed && postRepair && criticalResourceIdle && transformations && changed && resourceCompressionAcceptedByNetValueGate) bucket = "valid-committed-continuity-and-resource-compactness";
    else if (committed && criticalResourceIdle && transformations && changed && resourceCompressionAcceptedByNetValueGate) bucket = "valid-committed-critical-resource-idle-compression";
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
  const bucketOrder: ORCSimulationSelectionBucket[] = ["valid-committed-macro-main-zone-block-relayout", "valid-committed-post-continuity-critical-resource-idle-compression-and-continuity", "valid-committed-continuity-and-resource-compactness", "valid-committed-critical-resource-idle-compression", "valid-committed-post-repair-main-zone-continuity-transformations-changed", "valid-committed-baseline-repair-transformations-changed", "valid-committed-transformations-changed", "valid-baseline-repair-transformations-changed", "valid-executable-transformations", "valid-baseline-preservation", "valid-other", "invalid-diagnostics-only"];
  eligible.sort((a, b) => bucketOrder.indexOf(a.bucket) - bucketOrder.indexOf(b.bucket)
    || (b.operationalValue?.overallScore ?? -Infinity) - (a.operationalValue?.overallScore ?? -Infinity)
    || hardViolationCount(a.validation) - hardViolationCount(b.validation)
    || b.changedTaskCount - a.changedTaskCount
    || a.simulation.id.localeCompare(b.simulation.id));
  const selected = eligible[0] ?? null;
  const diagnostics: ORCSimulationSelectionDiagnostics = {
    selectionPolicy: "valid-committed-dominant-macro-main-zone-relayout-first-v3",
    selectedBucket: selected?.bucket ?? null,
    validSimulationCount: validRows.length,
    invalidSimulationCount: rows.filter((row) => row.validation?.result === "INVALID").length,
    committedSimulationIds: [...commitDecisionBySimulatedStateId.keys()].sort(),
    baselineRepairSimulationIds: [...baselineRepairIds].sort(),
    postRepairContinuitySimulationIds: [...postRepairIds].sort(),
    criticalResourceIdleCompressionSimulationIds: [...criticalResourceIdleIds].sort(),
    postContinuityResourceCompressionSimulationIds: [...postContinuityResourceIdleIds].sort(),
    macroMainZoneRelayoutSimulationIds: [...macroIds].sort(),
    macroProductionWaveDayShapeSimulationIds: [...dayShapeLineageIds].sort(),
    pureMacroProductionWaveDayShapeSimulationIds: [...pureDayShapeLineageIds].sort(),
    compositeMacroProductionWaveDayShapeSimulationIds: [...compositeDayShapeLineageIds].sort(),
    compositeMacroSimulationIds: [...compositeMacroIds].sort(),
    lineageConsistency: { ok: lineageWarnings.length === 0, warnings: lineageWarnings.sort(), readOnly: true },
    macroPassSimulationIds: [...macroPassSimulationIds].sort(),
    macroPassLineageFallbackUsed,
    macroPassLineageFallbackWarnings,
    macroMainZoneRelayoutAcceptedSimulationIds: macroAccepted ? [...macroIds].sort() : [],
    macroMainZoneRelayoutRejectedSimulationIds: macroAccepted ? [] : [...macroIds].sort(),
    macroMainZoneRelayoutRejectReasons: macroAccepted ? {} : Object.fromEntries([...macroIds].sort().map(id => [id, String((macroSummary?.netValue as any)?.rejectionReason ?? "macro_main_zone_relayout_not_positive")])),
    macroMainZoneRelayoutAcceptedByMacroValueGate: macroLocalAccepted,
    macroMainZoneRelayoutAcceptedByGlobalMacroValueGate: macroGlobalAccepted,
    macroMainZoneRelayoutGlobalRejectReasons: macroGlobalAccepted ? {} : Object.fromEntries([...macroIds].sort().map(id => [id, String((macroSummary?.netValue as any)?.globalMacroRejectionReason ?? (macroSummary?.netValue as any)?.rejectionReason ?? "macro_global_visible_idle_not_reduced")])),
    macroMainZoneRelayoutGlobalValueBySimulationId: Object.fromEntries([...macroIds].sort().map(id => [id, (macroSummary?.netValue as any)?.globalMacroValue ?? macroSummary?.netValue ?? null])),
    macroMainZoneRelayoutScoreDelta: typeof (macroSummary?.netValue as any)?.visibleMainZoneIdleReductionMinutes === "number" ? (macroSummary?.netValue as any).visibleMainZoneIdleReductionMinutes : null,
    baseCompositeSimulationId,
    selectedBecause: selected ? (selected.bucket === "valid-committed-macro-main-zone-block-relayout" ? `${selected.bucket}; macro main-zone relayout accepted by ID238 local, ID241 global, and ID243 dominance gates` : `${selected.bucket}; no viable macro main-zone relayout selected; resource compression requires net-positive ID234 gate`) : (macroIds.size === 0 ? "no macro main-zone relayout candidates were simulated" : null),
    selectedSimulatedStateId: selected?.simulation.id ?? null,
    selectedFinalCandidateFamily: selected?.bucket === "valid-committed-macro-main-zone-block-relayout" || selected?.candidate?.metadata?.strategy === "MACRO_MAIN_ZONE_BLOCK_RELAYOUT" ? "macro-main-zone-block-relayout" : selected?.bucket === "valid-committed-critical-resource-idle-compression" || selected?.bucket === "valid-committed-continuity-and-resource-compactness" || selected?.bucket === "valid-committed-post-continuity-critical-resource-idle-compression-and-continuity" ? "critical-resource-idle-compression" : selected?.bucket === "valid-committed-post-repair-main-zone-continuity-transformations-changed" ? "post-repair-main-zone-continuity" : selected?.bucket === "valid-committed-baseline-repair-transformations-changed" || selected?.bucket === "valid-baseline-repair-transformations-changed" ? "baseline-overlap-repair" : null,
    selectedFinalCandidateId: selected?.candidate?.id ?? null,
    selectedFinalSimulatedStateId: selected?.simulation.id ?? null,
    selectedFinalIncludesCompositeAncestors: baseCompositeSimulationId != null,
    resourceCompressionAcceptedByNetValueGate,
    resourceCompressionRejectedSimulationIds: resourceCompressionAcceptedByNetValueGate ? [] : [...criticalResourceIdleIds].sort(),
    resourceCompressionRejectReasons: resourceCompressionAcceptedByNetValueGate ? {} : Object.fromEntries([...criticalResourceIdleIds].sort().map(id => [id, String(idleNetValue?.rejectionReason ?? idleSummary?.rejectionReason ?? "resource_idle_net_value_not_positive")])),
    baseCompositeOverallScore: typeof idleNetValue?.baseCompositeOverallScore === "number" ? idleNetValue.baseCompositeOverallScore : null,
    resourceCompressionOverallScore: typeof idleNetValue?.resourceCompressionOverallScore === "number" ? idleNetValue.resourceCompressionOverallScore : null,
    resourceCompressionScoreDelta: typeof idleNetValue?.resourceCompressionScoreDelta === "number" ? idleNetValue.resourceCompressionScoreDelta : null,
    readOnly: true,
  };
  return { simulation: selected?.simulation ?? null, validation: selected?.validation ?? null, value: selected?.operationalValue?.overallScore ?? null, candidateState: selected?.candidateState ?? null, candidate: selected?.candidate ?? null, commitDecision: selected?.commitDecision ?? null, diagnostics };
}
