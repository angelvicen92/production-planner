import { createHash } from "node:crypto";
import type { EngineInput } from "../../types";
import type { Candidate, CandidateAssignment, OperationalState, ReasoningBudgetProfile } from "../contracts";
import { deepFreeze } from "../immutability";
import { stableStringify } from "../structuralEquality";
import { buildCandidateStates } from "../transformation/transformationEngine";
import { simulateCandidateStates } from "../simulation/simulationEngine";
import { validateSimulatedStates } from "../validation/validationEngine";
import { materializeInitialConstructionAnchorAttempt, initialConstructionAssignmentFingerprint } from "./materializeInitialConstructionAnchorAttempt";

const sample = (a: readonly any[]) => [...(a ?? [])].slice(0, 10);
const mins = (v?: string | null) => /^\d{2}:\d{2}$/.test(String(v ?? "")) ? Number(String(v).slice(0, 2)) * 60 + Number(String(v).slice(3)) : null;

function candidate(id: string, assignments: CandidateAssignment[]): Candidate {
  return { id, assignments, state: { status: "draft", evidenceIds: [], metadata: { readOnly: true } }, metadata: { strategy: "SCHEDULE_PENDING_TASKS", planningInfluence: "candidate-assignments", initialConstructionStage: "two-cycle-combined", executesTransformations: assignments.length > 0, commitsPlanning: false, readOnly: true }, evidenceIds: [], operationalValues: [] };
}

export function runInitialConstructionTwoCycleSession(args: { originInput: EngineInput; originOperationalState: OperationalState; stage2: any; stage3: any; reasoningBudget?: ReasoningBudgetProfile | null; createdAt?: string | null }) {
  if (args.stage3?.executed !== true || !args.stage3?.selectedAnchor || !args.stage2?.selectedAssignments?.length) return deepFreeze({ version: "INITIAL-CONSTRUCTION-TWO-CYCLE-SESSION-V1", executed: false, reason: "second_residual_anchor_required", readOnly: true }) as any;
  const first = [...args.stage2.selectedAssignments].map((a: any) => ({ taskId: a.taskId, startPlanned: a.startPlanned, endPlanned: a.endPlanned, spaceId: a.spaceId ?? null, resourceIds: [...(a.resourceIds ?? a.assignedResourceIds ?? [])].sort((x: number, y: number) => x - y) })).sort((a, b) => a.taskId - b.taskId);
  const firstIds = new Set(first.map((a) => a.taskId));
  const anchor = args.stage3.selectedAnchor;
  const allPre = [...(anchor.allPrerequisiteTaskIds ?? [])].map(Number).sort((a, b) => a - b);
  const sat = allPre.filter((id) => firstIds.has(id));
  const rem = allPre.filter((id) => !firstIds.has(id));
  const residualClosure = [...rem, Number(anchor.anchorTaskId)].filter((id, i, arr) => Number.isFinite(id) && arr.indexOf(id) === i);
  const stage = { ...args.stage3, selectedAnchor: anchor, selectedAnchorTaskId: anchor.anchorTaskId, searchSpaces: args.stage3.residualSearchSpaces ?? args.stage3.searchSpaces ?? args.stage3.residualMap?.searchSpaces ?? args.stage3.stage1?.searchSpaces ?? [], initialConstructionMap: args.stage3.residualMap };
  if (!stage.searchSpaces?.length && args.stage3.residualAnchors) stage.searchSpaces = args.stage3.searchSpaces ?? [];
  const attempt = materializeInitialConstructionAnchorAttempt({ originInput: args.originInput, originOperationalState: args.originOperationalState, stage, anchor, baseProvisionalAssignments: first, provisionallySatisfiedTaskIds: sat, closureTaskIds: residualClosure, maxBranches: Math.max(2, Math.min(8, args.reasoningBudget?.maxCandidates ?? 6)), reasoningBudget: args.reasoningBudget, createdAt: args.createdAt ?? null });
  let selected: any = null, combinedValidation: any = null, combinedSimulation: any = null;
  let transformationsExecuted = attempt.transformationsExecuted, simulationsExecuted = attempt.simulationsExecuted, validationsExecuted = attempt.validationsExecuted;
  const branchAttempts = [] as any[];
  for (const option of attempt.selectable ?? []) {
    const second = option.branch.assignments.filter((a: CandidateAssignment) => !firstIds.has(a.taskId));
    const byId = new Map(first.map((a) => [a.taskId, a]));
    for (const a of second) byId.set(a.taskId, a);
    const combined = [...byId.values()].sort((a, b) => a.taskId - b.taskId);
    const c = candidate(`candidate:two-cycle:${option.branch.branchId}`, combined);
    const tr = buildCandidateStates(args.originOperationalState, [c], { createdAt: args.createdAt ?? null, maxTransformations: 1 });
    const sim = simulateCandidateStates(args.originOperationalState, tr.candidateStates, { createdAt: args.createdAt ?? null, maxSimulations: 1 });
    const val = validateSimulatedStates(sim.simulatedStates, { createdAt: args.createdAt ?? null });
    transformationsExecuted += tr.summary.transformedCount; simulationsExecuted += sim.summary.simulatedCount; validationsExecuted += val.validationResults.length;
    const validation = val.validationResults[0] ?? null;
    branchAttempts.push({ branchId: option.branch.branchId, combinedValidationResult: validation?.result ?? "INVALID", combinedViolationCodes: sample(validation?.violatedConstraints ?? []) });
    if (validation?.result === "VALID") { selected = { ...option, secondAssignments: second, combinedAssignments: combined, combinedPartialPlanId: `combined-initial-construction:${createHash("sha256").update(initialConstructionAssignmentFingerprint(combined)).digest("hex").slice(0, 16)}` }; combinedValidation = validation; combinedSimulation = sim.simulatedStates[0] ?? null; break; }
  }
  const duplicateTaskIds = selected ? selected.combinedAssignments.map((a: CandidateAssignment) => a.taskId).filter((id: number, i: number, arr: number[]) => arr.indexOf(id) !== i) : [];
  const firstPreserved = selected ? stableStringify(first) === stableStringify(selected.combinedAssignments.filter((a: CandidateAssignment) => firstIds.has(a.taskId)).sort((a: any, b: any) => a.taskId - b.taskId)) : false;
  const coherent = !!selected && firstPreserved && duplicateTaskIds.length === 0 && selected.secondAssignments.every((a: CandidateAssignment) => sat.every((id) => { const pre = first.find((x) => x.taskId === id); return !pre || (mins(pre.endPlanned) ?? 0) <= (mins(a.startPlanned) ?? -1); }));
  const combinedFingerprint = selected ? initialConstructionAssignmentFingerprint(selected.combinedAssignments) : null;
  return deepFreeze({ version: "INITIAL-CONSTRUCTION-TWO-CYCLE-SESSION-V1", executed: true, executedBeforeV4: true, inputSource: "original-engine-input", v4SeedUsed: false, firstAnchorTaskId: args.stage2.selectedAnchorTaskId ?? null, secondAnchorTaskId: anchor.anchorTaskId ?? null, firstClosureTaskIds: args.stage2.closureTaskIds ?? [], secondAllPrerequisiteTaskIds: allPre, secondSatisfiedPrerequisiteTaskIds: sat, secondRemainingPrerequisiteTaskIds: rem, secondResidualClosureTaskIds: residualClosure, firstAssignments: first, secondAssignments: selected?.secondAssignments ?? [], combinedPartialPlan: selected ? { kind: "CombinedInitialConstructionPartialPlan", basePartialPlanId: args.stage2.selectedPartialPlanId ?? null, secondPartialPlanId: selected.partialPlanId ?? null, combinedPartialPlanId: selected.combinedPartialPlanId, assignments: selected.combinedAssignments, lineage: { firstBranchId: args.stage2.selectedBranchId ?? null, secondBranchId: selected.branch.branchId }, combinedAssignmentsFingerprint: combinedFingerprint, readOnly: true } : null, selectedSecondBranchId: selected?.branch.branchId ?? null, selectedSecondPartialPlanId: selected?.partialPlanId ?? null, combinedPartialPlanId: selected?.combinedPartialPlanId ?? null, combinedValidationResult: combinedValidation?.result ?? "INVALID", combinedViolationCodes: sample(combinedValidation?.violatedConstraints ?? []), combinedSimulationId: combinedSimulation?.id ?? null, secondAttempt: attempt, evidence: { version: "INITIAL-CONSTRUCTION-TWO-CYCLE-EVIDENCE-V1", executed: true, executedBeforeV4: true, inputSource: "original_engine_input", v4SeedUsed: false, firstAnchorTaskId: args.stage2.selectedAnchorTaskId ?? null, secondAnchorTaskId: anchor.anchorTaskId ?? null, firstClosureTaskIds: sample(args.stage2.closureTaskIds ?? []), secondAllPrerequisiteTaskIds: sample(allPre), secondSatisfiedPrerequisiteTaskIds: sample(sat), secondRemainingPrerequisiteTaskIds: sample(rem), secondResidualClosureTaskIds: sample(residualClosure), firstAssignmentCount: first.length, secondAssignmentCount: selected?.secondAssignments.length ?? 0, combinedAssignmentCount: selected?.combinedAssignments.length ?? 0, duplicateAssignmentTaskIds: sample(duplicateTaskIds), secondBranchCandidateCount: attempt.branches?.length ?? 0, secondAttemptedBranchCount: attempt.attempts?.length ?? 0, secondHardValidBranchCount: attempt.hardValidBranchCount ?? 0, selectedSecondBranchId: selected?.branch.branchId ?? null, selectedSecondPartialPlanId: selected?.partialPlanId ?? null, combinedPartialPlanId: selected?.combinedPartialPlanId ?? null, combinedValidationResult: combinedValidation?.result ?? "INVALID", combinedViolationCodes: sample(combinedValidation?.violatedConstraints ?? []), resourceReservationIdentityAudit: args.stage3.residualContext?.resourceReservationIdentityAudit ?? null, firstAssignmentsPreserved: firstPreserved, combinedLineageCoherent: coherent, combinedAssignmentsFingerprint: combinedFingerprint, transformationsExecuted, simulationsExecuted, validationsExecuted, commitsExecuted: 0, publicPlanningUsesCombinedPartialPlan: false, warnings: selected ? [] : ["no_combined_valid_second_branch_selected"], readOnly: true }, transformationsExecuted, simulationsExecuted, validationsExecuted, commitsExecuted: 0, publicPlanningUsesCombinedPartialPlan: false, readOnly: true }) as any;
}
