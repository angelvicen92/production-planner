import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildCanonicalFullA2EngineInput } from "../../engine/planner-next/benchmarks/canonicalFullA2EngineInput";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";
import { standaloneForwardStaticDomain } from "../../engine/planner-next/exactItinerantPlan";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";
import type { AssistedProposalRunAccess } from "../assistedProposalService";
import type { IStorage } from "../storage";

process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "evidence";
process.env.SUPABASE_ANON_KEY ??= "evidence";

export interface A2Assist8Options { readonly branchBudget?: number; readonly writeEvidence?: boolean }

/**
 * ASST-011 completion probe.  It deliberately uses the product request/run/apply,
 * validation and acceptance services; only their database boundary is replaced by
 * the same deterministic in-memory boundary used by the other Assisted evidence.
 */
export async function runA2Assist8Evidence(options: A2Assist8Options = {}) {
  const [{ AssistedProposalService }, { AssistedPlanningService }] = await Promise.all([
    import("../assistedProposalService"), import("../assistedPlanningService"),
  ]);
  const planId = 711, sessionId = 711, revisionId = 1;
  const canonical = buildCanonicalFullA2EngineInput({ planId, branchBudget: options.branchBudget });
  const input = canonical.input;
  const sourceIds = input.tasks.filter(task => task.contestantId != null).map(task => task.id).sort((a, b) => a - b);
  assert.equal(sourceIds.length, 266);
  const adapter = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapter.status, "SUPPORTED");
  if (adapter.status !== "SUPPORTED") throw new Error("canonical A2 adapter is unsupported");

  const productByCanonical = new Map(adapter.identityMap.filter(i => i.namespace === "task").map(i => [i.canonicalId, Number(i.sourceId)]));
  const sourceSet = new Set(sourceIds);
  const productSpaceIds = [...new Set(input.tasks.filter(task => sourceSet.has(task.id) && task.spaceId != null).map(task => task.spaceId!))].sort((a, b) => a - b);
  const mainFlowSpaceId = input.plannerNext?.mainFlow?.spaceId;
  assert.ok(mainFlowSpaceId != null, "canonical A2 requires a configured main-flow space");
  assert.ok(productSpaceIds.includes(mainFlowSpaceId), "main-flow space must contain canonical obligations");
  const orderedSpaceIds = [mainFlowSpaceId, ...productSpaceIds.filter(id => id !== mainFlowSpaceId)];

  const blank = buildAssistedPlanningSnapshotV1(input.tasks.map(task => ({ id: task.id, startPlanned: null, endPlanned: null, zoneId: task.zoneId ?? null, spaceId: task.spaceId ?? null })));
  let nextStageId = 1, nextRunId = 1, nextValidationId = 1;
  const stages: any[] = [{ id: nextStageId++, sessionId, planId, ordinal: 0, parentStageId: null, archivedAt: null, configRevisionId: revisionId, snapshotJson: blank, snapshotFingerprint: fingerprintAssistedPlanningSnapshotV1(blank) }];
  let dailyTasks = structuredClone(blank), validation: any = null;
  let session: any = { id: sessionId, planId, status: "ACTIVE", activeStageId: 1, draftBaseStageId: 1, currentConfigRevisionId: revisionId, draftScopeJson: {}, draftSnapshotJson: blank, draftFingerprint: stages[0].snapshotFingerprint, draftValidationId: null };
  const runs = new Map<number, any>();
  const configFingerprint = "asst-011-canonical-config";
  const storage = new Proxy({}, { get(_target, property: string) { const reads: Record<string, (...args: any[]) => Promise<any>> = {
    getActiveAssistedPlanningSession: async () => session,
    getAssistedPlanningStage: async (id: number) => stages.find(stage => stage.id === id),
    listAssistedPlanningStages: async () => stages,
    getPlanningStageValidation: async () => validation,
    listPlanningAcceptedExceptions: async () => [],
    getPlanOptimizerSnapshot: async () => ({}), getPlanTaskTemplateSnapshots: async () => [],
    getPlanConfigRevision: async () => ({ id: revisionId, planId, fingerprint: configFingerprint }),
    getTasksForPlan: async () => input.tasks.map(task => ({ id: task.id, status: task.status, templateId: task.templateId, spaceId: task.spaceId })),
  }; return reads[property] ?? (async () => { throw new Error(`unexpected storage call:${property}`); }); } }) as IStorage;
  const rpc = async (name: string, p: any) => {
    if (name === "assisted_record_proposal_clean_validation") {
      validation = { id: nextValidationId++, sessionId, planId, baseStageId: p.p_expected_base, draftFingerprint: p.p_expected_fingerprint, configRevisionId: revisionId, hardCount: 0, requiredCount: 0, reportJson: { contractVersion: 1, hardCount: 0, requiredCount: 0, newHardCount: 0, newRequiredCount: 0, violations: [] } };
      session.draftValidationId = validation.id; return { error: null };
    }
    if (name === "assisted_accept_stage") {
      const stage = { id: nextStageId++, sessionId, planId, ordinal: stages.length, parentStageId: session.draftBaseStageId, archivedAt: null, configRevisionId: revisionId, snapshotJson: session.draftSnapshotJson, snapshotFingerprint: session.draftFingerprint };
      stages.push(stage); dailyTasks = structuredClone(stage.snapshotJson);
      session = { ...session, activeStageId: stage.id, draftBaseStageId: stage.id, draftScopeJson: {}, draftValidationId: null };
      return { error: null };
    }
    throw new Error(`unexpected rpc:${name}`);
  };
  const runAccess: AssistedProposalRunAccess = {
    create: async values => { const id = nextRunId++; runs.set(id, { id, ...values }); return { data: { id }, error: null }; },
    find: async (_plan, id) => ({ data: runs.get(id), error: null }), fail: async () => ({ error: null }),
    finish: async (_plan, id, result) => { Object.assign(runs.get(id), { result_json: result }); return { error: null }; },
    apply: async p => { const run = runs.get(Number(p.p_run_id)); session = { ...session, draftSnapshotJson: run.result_json.proposedDraftSnapshot, draftFingerprint: run.result_json.proposedDraftFingerprint, draftScopeJson: { ...run.scope_json, resolvedTaskIds: run.scope_task_ids_json, proposalRunId: run.id }, draftValidationId: null }; return { error: null }; },
  };
  const dependencies = { buildInput: async () => structuredClone(input), buildConfigRevision: () => ({ contractVersion: 1, planId, components: [], configurationFingerprint: configFingerprint }) as any };
  const proposals = new AssistedProposalService(storage, () => {}, runAccess, undefined, dependencies);
  const planning = new AssistedPlanningService(storage, rpc as any, dependencies);
  const iterations: any[] = [];
  let firstBlocker: any = null;

  while (true) {
    const before = (session.draftSnapshotJson as AssistedPlanningSnapshotV1).tasks.filter(row => row.startPlanned && row.endPlanned);
    const acceptedIds = new Set(before.map(row => row.taskId));
    const remainingIds = sourceIds.filter(id => !acceptedIds.has(id));
    if (remainingIds.length === 0) break;
    let selector: { kind: "SPACE"; spaceId: number } | { kind: "TASK_IDS"; taskIds: number[] } | null = null;
    for (const spaceId of orderedSpaceIds) {
      const pendingInSpace = remainingIds.filter(id => input.tasks.find(task => task.id === id)?.spaceId === spaceId);
      if (pendingInSpace.length === 0) continue;
      // The human-visible scope is the pending production obligations in the
      // selected space. Supporting closure remains internal to Planner Next.
      selector = { kind: "TASK_IDS", taskIds: pendingInSpace };
      break;
    }
    selector ??= { kind: "TASK_IDS", taskIds: remainingIds.filter(id => input.tasks.find(task => task.id === id)?.spaceId == null) };
    assert.ok(selector.kind !== "TASK_IDS" || selector.taskIds.length > 0, "remaining obligations must resolve through a supported product selector");
    const protectedBefore = new Map(before.map(row => [row.taskId, JSON.stringify(row)]));
    const requested = await proposals.request(planId, { selector, includePrerequisites: false, expectedDraftFingerprint: session.draftFingerprint, expectedBaseStageId: session.draftBaseStageId });
    const result = await proposals.run(planId, requested.runId);
    const evidence: any = result.evidence;
    const record: any = { scopeSelector: selector, resolvedTaskIds: result.scopeTaskIds, baseStageId: session.draftBaseStageId, configRevisionId: revisionId,
      includePrerequisites: result.includePrerequisites, visibleProposalTaskIds: result.proposal?.map(row => row.taskId).sort((a, b) => a - b) ?? [],
      supportingTaskIds: evidence.supportingTaskIds ?? [], supportingTaskCount: evidence.supportingTaskIds?.length ?? 0,
      proposalOutcome: result.outcome, newObligationCount: result.proposal?.filter(row => !protectedBefore.has(row.taskId)).length ?? 0,
      completedObligationCount: before.length, remainingObligationCount: sourceIds.length - before.length, protectedPlacementCount: before.length,
      protectedPlacementsPreserved: evidence.protectedPlacementsPreserved === true,
      newHardViolationCount: evidence.newHardViolationCount ?? 0, newRequiredViolationCount: evidence.newRequiredViolationCount ?? 0,
      unstructuredReasonCodes: evidence.unstructuredReasonCodes ?? [], reasonCodes: result.reasonCodes, work: evidence.work ?? {}, causalDiagnostic: evidence.causalDiagnostic ?? null };
    if (result.outcome !== "PROPOSAL") {
      const emptyDomain = evidence.causalDiagnostic?.futureFeasibility?.assessments?.find((item: any) => item.domainEmpty);
      const blockerTasks = [...new Set(emptyDomain?.blockers ?? [])] as string[];
      const blockedTask = adapter.problem.tasks.find(task => task.id === emptyDomain?.taskId);
      const materiality = (id: string) => {
        const task: any = adapter.problem.tasks.find(row => row.id === id);
        if (!task) return { canonicalTaskId: id, productTaskId: productByCanonical.get(id) ?? null, missing: true };
        const productId = productByCanonical.get(id) ?? null;
        const protectedRow = productId == null ? undefined : before.find(row => row.taskId === productId);
        return { canonicalTaskId: id, productTaskId: productId, kind: task.kind, participantId: task.participantId ?? null,
          spaceId: task.spaceId ?? null, duration: task.duration, dependencies: task.dependencies ?? [], requiredResourceIds: task.requiredResourceIds ?? [],
          placementAuthority: protectedRow ? "PROTECTED" : "AUTOMATIC", placement: protectedRow ?? null };
      };
      const staticEligibleStartCount = blockedTask ? standaloneForwardStaticDomain(adapter.problem, blockedTask, []).eligibleStartCount : null;
      firstBlocker = { scope: selector, obligationIds: result.scopeTaskIds,
        blockedObligationId: emptyDomain?.taskId ? productByCanonical.get(emptyDomain.taskId) : null,
        blockedTask: emptyDomain?.taskId ? materiality(emptyDomain.taskId) : null,
        phase: result.reasonCodes.includes("STANDALONE_BRANCH_BUDGET_EXHAUSTED") ? "constructExactItinerantPlan/standalone search" : emptyDomain ? "constructExactItinerantPlan/onPartialCoreCandidate" : "constructExactItinerantPlan completion",
        firstCausalCheck: result.reasonCodes.includes("CORE_BRANCH_BUDGET_EXHAUSTED") ? "constructExactMainAndFeederCore branch budget" : result.reasonCodes.includes("STANDALONE_BRANCH_BUDGET_EXHAUSTED") ? "constructExactItinerantPlan standalone branch budget" : emptyDomain ? "standaloneForwardDynamicDomain" : "constructExactItinerantPlan completion",
        staticEligibleStartCount, dynamicEligibleStartCount: emptyDomain?.eligibleStartCount ?? null,
        reasonCodes: result.reasonCodes, blockingTaskIds: blockerTasks,
        blockers: blockerTasks.map(materiality), rejectionReason: emptyDomain ? "DYNAMIC_DOMAIN_EMPTY" : null,
        originatingCoreDecision: emptyDomain ? { depth: emptyDomain.depth, authoritySignature: emptyDomain.authoritySignature,
          ancestralDecisionDepths: emptyDomain.ancestralDecisionDepths ?? [], certifiedBackjumpTargetDepth: emptyDomain.certifiedBackjumpTargetDepth ?? null } : null,
        classification: result.reasonCodes.some((code: string) => code.endsWith("BRANCH_BUDGET_EXHAUSTED")) ? "SEARCH_CAPACITY_EXHAUSTED" : "INFEASIBILITY_REQUIRES_SEPARATE_CAUSAL_DELTA" };
      iterations.push(record); break;
    }
    assert.equal(record.newHardViolationCount, 0); assert.equal(record.newRequiredViolationCount, 0); assert.deepEqual(record.unstructuredReasonCodes, []);
    await proposals.apply(planId, requested.runId, session.draftFingerprint, session.draftBaseStageId);
    await planning.validateDraft(planId, session.draftFingerprint, session.draftBaseStageId);
    await planning.accept(planId, "00000000-0000-0000-0000-000000000011", session.draftFingerprint, session.draftBaseStageId);
    const after = (session.draftSnapshotJson as AssistedPlanningSnapshotV1).tasks.filter(row => row.startPlanned && row.endPlanned);
    assert.ok([...protectedBefore].every(([id, value]) => JSON.stringify(after.find(row => row.taskId === id)) === value));
    record.completedObligationCount = after.length; record.remainingObligationCount = sourceIds.length - after.length;
    record.acceptedStageId = session.activeStageId; record.acceptedStageFingerprint = session.draftFingerprint; record.protectedPlacementsPreserved = true;
    iterations.push(record);
  }
  const finalRows = (dailyTasks as AssistedPlanningSnapshotV1).tasks.filter(row => row.startPlanned && row.endPlanned && sourceSet.has(row.taskId));
  const finalIds = finalRows.map(row => row.taskId).sort((a, b) => a - b);
  const evidence = { benchmark: "A2-ASSIST-8", status: finalIds.length === 266 ? "PASS" : "BLOCKED", sourceObligationCount: 266,
    completedObligationCount: finalIds.length, remainingObligationCount: 266 - finalIds.length, scopeCount: iterations.length, stageCount: stages.length - 1,
    automaticPlacements: finalIds.length, manualChanges: 0, acceptedHardExceptions: 0, rollbackCount: 0,
    finalCompletionPercentage: Number((finalIds.length / 266 * 100).toFixed(6)), finalObligationIds: finalIds, duplicateFinalIds: finalIds.length - new Set(finalIds).size,
    finalObligationIdsMatchSource: JSON.stringify(finalIds) === JSON.stringify(sourceIds),
    finalHardViolationCount: 0, finalRequiredViolationCount: 0, finalUnstructuredReasonCodes: [], dailyTasksMatchesLastAcceptedStage: JSON.stringify(dailyTasks) === JSON.stringify(stages.at(-1).snapshotJson),
    iterations, firstBlocker, deterministicFingerprint: stages.at(-1).snapshotFingerprint, deterministicEquivalent: null as boolean | null };
  if (options.writeEvidence) { mkdirSync("docs/evidence", { recursive: true }); writeFileSync("docs/evidence/A2-ASSIST-8-assisted-completion.json", `${JSON.stringify(evidence, null, 2)}\n`); }
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const first = await runA2Assist8Evidence();
  const second = await runA2Assist8Evidence();
  const material = (value: typeof first) => ({ iterations: value.iterations.map(row => [row.resolvedTaskIds, row.proposalOutcome, row.acceptedStageFingerprint]), fingerprint: value.deterministicFingerprint, blocker: value.firstBlocker });
  first.deterministicEquivalent = JSON.stringify(material(first)) === JSON.stringify(material(second));
  assert.equal(first.deterministicEquivalent, true);
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync("docs/evidence/A2-ASSIST-8-assisted-completion.json", `${JSON.stringify(first, null, 2)}\n`);
  console.log(JSON.stringify(first, null, 2));
}
