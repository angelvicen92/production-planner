import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { buildCanonicalFullA2EngineInput } from "../../engine/planner-next/benchmarks/canonicalFullA2EngineInput";
import { executeAssistedPlanning, type AssistedProblem } from "../../engine/planner-next/assistedPlanning";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";
import type { IStorage } from "../storage";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";
import type { AssistedProposalRunAccess } from "../assistedProposalService";
import type { ConfigRefreshCandidate } from "../assistedConfigRefresh";
import { buildEffectivePlanConfigReplaySnapshotV1 } from "../assistedPlanningConfigRevision";
import { normalizePlanOptimizerSnapshotV1 } from "../planOptimizerSnapshot";
import { normalizeTaskTemplateCatalogEntry } from "../taskTemplateSnapshot";

process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "evidence";
process.env.SUPABASE_ANON_KEY ??= "evidence";

const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** ASST-010 product-flow evidence. The database boundary is an in-memory
 * implementation of migrations 078-083; all orchestration, projection, search,
 * validation and lineage decisions run through the production services. */
export async function runA2Assist7Evidence() {
  const [{ AssistedPlanningService, AssistedPlanningError }, { AssistedProposalService, createManualDeltaValidationHarness }, { AssistedConfigRefreshService }] = await Promise.all([
    import("../assistedPlanningService"), import("../assistedProposalService"), import("../assistedConfigRefresh"),
  ]);
  const planId = 710, sessionId = 71, userId = "00000000-0000-0000-0000-000000000010";
  const canonical = buildCanonicalFullA2EngineInput({ planId });
  const sourceObligationCount = canonical.expansion.tasks.filter(task => task.participantId).length;
  assert.equal(sourceObligationCount, 266);
  const input = canonical.input;
  const adapted = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapted.status, "SUPPORTED");
  if (adapted.status !== "SUPPORTED") throw new Error("canonical A2 adapter failed");
  const mains = input.tasks.filter(task => {
    const projectedId = adapted.identityMap.find(item => item.namespace === "task" && Number(item.sourceId) === task.id)?.canonicalId;
    const projected = adapted.problem.tasks.find(row => row.id === projectedId);
    return projected?.kind === "main";
  });
  assert.ok(mains.length >= 5, "canonical data did not expose enough independent scopes");
  const [first, second, third] = mains;
  const validationProblem = structuredClone(adapted.problem);
  const conflictIds = new Set(adapted.identityMap.filter(item => item.namespace === "task" && [first.id, second.id].includes(Number(item.sourceId))).map(item => item.canonicalId));
  validationProblem.tasks = validationProblem.tasks.filter(task => conflictIds.has(task.id)).map(task => ({ ...task, kind: "auxiliary", dependencies: [], blockKey: undefined })) as any;
  validationProblem.mainFlow = { ...validationProblem.mainFlow, spaceId: validationProblem.spaces.find(space => !validationProblem.tasks.some(task => task.spaceId === space.id))!.id };
  validationProblem.anchoredAccompaniments = undefined;
  validationProblem.technicalChains = undefined;
  validationProblem.roundSynchronizations = undefined;
  validationProblem.transportPolicy = undefined;
  validationProblem.participantMeals = undefined;
  validationProblem.operationalMealPolicies = undefined;
  const blank = buildAssistedPlanningSnapshotV1(input.tasks.map(task => ({ id: task.id, startPlanned: null, endPlanned: null, zoneId: task.zoneId ?? null, spaceId: task.spaceId ?? null })));
  let dailyTasks = structuredClone(blank);
  let revisionId = 40, nextRevisionId = 41, nextStageId = 1, nextRunId = 1, nextValidationId = 1, validation: any = null;
  const stages: any[] = [];
  const exceptions: any[] = [];
  const runs = new Map<number, any>();
  const fingerprint = fingerprintAssistedPlanningSnapshotV1(blank);
  const s0 = { id: nextStageId++, sessionId, planId, ordinal: 0, parentStageId: null, archivedAt: null, configRevisionId: revisionId, snapshotJson: blank, snapshotFingerprint: fingerprint };
  stages.push(s0);
  let session: any = { id: sessionId, planId, status: "ACTIVE", activeStageId: s0.id, draftBaseStageId: s0.id, currentConfigRevisionId: revisionId, draftScopeJson: {}, draftSnapshotJson: blank, draftFingerprint: fingerprint, draftValidationId: null };
  const identity = adapted.identityMap;
  const optimizer = normalizePlanOptimizerSnapshotV1({ optimizationMode: "basic", heuristics: {}, groupingZoneIds: [], arrivalGroupingTarget: 0, departureGroupingTarget: 0, arrivalMinGapMinutes: 0, departureMinGapMinutes: 0, vanCapacity: 0, weightArrivalDepartureGrouping: 0, nearHardBreaksMax: 0 }, {}, "INHERITED");
  const targetTemplate = input.tasks.find(task => task.id === third.id)!;
  const oldTemplate = normalizeTaskTemplateCatalogEntry({ id: targetTemplate.templateId, name: "Canonical main", defaultDuration: targetTemplate.durationOverrideMin }, "legacy_backfill");
  const newTemplate = normalizeTaskTemplateCatalogEntry({ id: targetTemplate.templateId, name: "Canonical main", defaultDuration: targetTemplate.durationOverrideMin }, "inherited");
  let materializedTemplate = oldTemplate;
  const authorities: any = { plan_workday: { semanticValue: [], provenance: { authority: "plans", authorityContractVersion: 1 } }, contestant_availability: { semanticValue: [], provenance: { authority: "contestants", authorityContractVersion: 1 } }, spatial_configuration: { semanticValue: [], provenance: { authority: "spaces", authorityContractVersion: 1 } }, resource_configuration: { semanticValue: [], provenance: { authority: "resources", authorityContractVersion: 1 } }, resource_assignments_and_requirements: { semanticValue: [], provenance: { authority: "requirements", authorityContractVersion: 1 } } };
  const replay = (template: typeof oldTemplate) => buildEffectivePlanConfigReplaySnapshotV1({ taskTemplateSnapshots: [template], optimizerSnapshot: optimizer, authorities });
  const configFingerprint = () => `revision-${revisionId}`;
  const storage = new Proxy({}, { get(_target, property: string) { const reads: Record<string, (...args: any[]) => Promise<any>> = {
    getActiveAssistedPlanningSession: async () => session,
    getAssistedPlanningStage: async (id: number) => stages.find(stage => stage.id === id),
    listAssistedPlanningStages: async () => stages,
    getPlanningStageValidation: async () => validation,
    listPlanningAcceptedExceptions: async (stageId: number) => exceptions.filter(item => item.stageId === stageId),
    getTasksForPlan: async () => input.tasks.map(task => ({ id: task.id, status: "pending", templateId: task.templateId, spaceId: task.spaceId })),
    getPlanOptimizerSnapshot: async () => optimizer,
    getPlanTaskTemplateSnapshots: async () => [materializedTemplate],
    getPlanConfigRevision: async (id: number) => ({ id, planId, fingerprint: `revision-${id}`, replaySnapshotJson: replay(materializedTemplate) }),
  }; return reads[property] ?? (async () => { throw new Error(`unexpected storage call:${property}`); }); } }) as IStorage;
  const archiveFuture = (baseId: number) => { const queue = stages.filter(stage => stage.parentStageId === baseId && !stage.archivedAt); while (queue.length) { const stage = queue.shift()!; stage.archivedAt = "archived"; queue.push(...stages.filter(child => child.parentStageId === stage.id && !child.archivedAt)); } };
  const rpc = async (name: string, p: any) => {
    if (name === "assisted_record_proposal_clean_validation") {
      validation = { id: nextValidationId++, sessionId, planId, baseStageId: p.p_expected_base, draftFingerprint: p.p_expected_fingerprint, configRevisionId: revisionId, hardCount: 0, requiredCount: 0, reportJson: { contractVersion: 1, hardCount: 0, requiredCount: 0, newHardCount: 0, newRequiredCount: 0, violations: [] } }; session.draftValidationId = validation.id; return { error: null };
    }
    if (name === "assisted_patch_draft") { const changed = p.p_snapshot.tasks.filter((row: any) => JSON.stringify(row) !== JSON.stringify(session.draftSnapshotJson.tasks.find((old: any) => old.taskId === row.taskId))).map((row: any) => row.taskId); const blockMembers = [...new Set([...(session.draftSnapshotJson.planningBlocks ?? []).flatMap((block: any) => block.memberTaskIds), ...(p.p_snapshot.planningBlocks ?? []).flatMap((block: any) => block.memberTaskIds)])]; session = { ...session, draftSnapshotJson: p.p_snapshot, draftFingerprint: p.p_fingerprint, draftScopeJson: { editKind: "MANUAL", manualTouchedTaskIds: [...new Set([...changed, ...blockMembers])] }, draftValidationId: null }; return { error: null }; }
    if (name === "assisted_record_stage_validation") { validation = { id: nextValidationId++, sessionId, planId, baseStageId: p.p_expected_base, draftFingerprint: p.p_expected_fingerprint, configRevisionId: revisionId, hardCount: p.p_report.hardCount, requiredCount: p.p_report.requiredCount, reportJson: p.p_report }; session.draftValidationId = validation.id; return { error: null }; }
    if (name === "assisted_accept_stage") {
      if (validation.reportJson.newHardCount > 0 && p.p_confirmation !== "HARD_EXCEPTIONS") return { error: { message: "HARD_CONFIRMATION_REQUIRED" } };
      archiveFuture(session.draftBaseStageId);
      const stage = { id: nextStageId++, sessionId, planId, ordinal: stages.length, parentStageId: session.draftBaseStageId, archivedAt: null, configRevisionId: revisionId, snapshotJson: session.draftSnapshotJson, snapshotFingerprint: session.draftFingerprint };
      stages.push(stage);
      for (const violation of validation.reportJson.violations.filter((item: any) => ["HARD", "REQUIRED"].includes(item.severity) && item.inheritedAcceptedExceptionId == null)) exceptions.push({ id: exceptions.length + 1, stageId: stage.id, status: "ACTIVE", configRevisionId: revisionId, snapshotFingerprint: stage.snapshotFingerprint, ...violation, affectedTaskIdsJson: violation.affectedTaskIds, affectedResourceIdsJson: violation.affectedResourceIds, affectedSpaceIdsJson: violation.affectedSpaceIds, detailsJson: violation.details });
      dailyTasks = structuredClone(stage.snapshotJson); session = { ...session, activeStageId: stage.id, draftBaseStageId: stage.id, draftScopeJson: {}, draftValidationId: null }; return { error: null };
    }
    if (name === "assisted_move_stage") {
      const target = p.p_redo ? stages.find(stage => stage.parentStageId === session.activeStageId && !stage.archivedAt) : stages.find(stage => stage.id === p.p_target);
      if (!target) return { error: { message: p.p_redo ? "NO_REDO_AVAILABLE" : "INVALID_STAGE_TARGET" } };
      dailyTasks = structuredClone(target.snapshotJson); session = { ...session, activeStageId: target.id, draftBaseStageId: target.id, draftSnapshotJson: target.snapshotJson, draftFingerprint: target.snapshotFingerprint, draftScopeJson: {}, draftValidationId: null }; return { error: null };
    }
    throw new Error(`unexpected rpc:${name}`);
  };
  const buildInput = async () => structuredClone(input);
  const manualHarness = createManualDeltaValidationHarness(validationProblem, identity);
  const planning = new AssistedPlanningService(storage, rpc as any, { buildInput, buildConfigRevision: ({ planId: id }) => ({ contractVersion: 1, planId: id, components: [], configurationFingerprint: configFingerprint() }), validateManual: manualHarness as any });
  const runAccess: AssistedProposalRunAccess = {
    create: async values => { const id = nextRunId++; runs.set(id, { id, ...values }); return { data: { id }, error: null }; },
    find: async (_plan, id) => ({ data: runs.get(id), error: null }), fail: async () => ({ error: null }),
    finish: async (_plan, id, result) => { Object.assign(runs.get(id), { result_json: result }); return { error: null }; },
    apply: async p => { const run = runs.get(Number(p.p_run_id)); session = { ...session, draftSnapshotJson: run.result_json.proposedDraftSnapshot, draftFingerprint: run.result_json.proposedDraftFingerprint, draftScopeJson: { ...run.scope_json, resolvedTaskIds: run.scope_task_ids_json, includePrerequisites: run.include_prerequisites, proposalRunId: run.id }, draftValidationId: null }; return { error: null }; },
  };
  const consumedRevisions: number[] = [], protectedCounts: number[] = [], acceptedBaselineCounts: number[] = [];
  const proposal = new AssistedProposalService(storage, () => {}, runAccess, (problem: AssistedProblem, options) => { consumedRevisions.push(revisionId); protectedCounts.push(problem.protectedPlacements.length); acceptedBaselineCounts.push(options?.violations.length ?? 0); return executeAssistedPlanning(problem, options); }, { buildInput, buildConfigRevision: ({ planId: id }) => ({ contractVersion: 1, planId: id, components: [], configurationFingerprint: configFingerprint() }) });
  const acceptProposal = async (taskId: number) => { const requested = await proposal.request(planId, { selector: { kind: "TASK_IDS", taskIds: [taskId] }, includePrerequisites: false, expectedDraftFingerprint: session.draftFingerprint, expectedBaseStageId: session.draftBaseStageId }); const result = await proposal.run(planId, requested.runId); assert.equal(result.outcome, "PROPOSAL", JSON.stringify(result.reasonCodes)); await proposal.apply(planId, requested.runId, session.draftFingerprint, session.draftBaseStageId); await planning.validateDraft(planId, session.draftFingerprint, session.draftBaseStageId); await planning.accept(planId, userId, session.draftFingerprint, session.draftBaseStageId); return stages.at(-1)!; };

  const s1 = await acceptProposal(first.id);
  const s1Snapshot = structuredClone(s1.snapshotJson), s1Fingerprint = s1.snapshotFingerprint;
  const currentReplay = replay(oldTemplate), candidateReplay = replay(newTemplate);
  const candidate: ConfigRefreshCandidate = { currentReplay, candidateReplay, preview: { contractVersion: 1, expectedConfigRevisionId: revisionId, unsupportedAuthorities: [], localOverrides: [], changes: [{ key: `task_templates:${oldTemplate.sourceTemplateId}`, authority: "task_templates", kind: "MODIFIED", label: newTemplate.templateName, localOverride: false }] } };
  const refresh = new AssistedConfigRefreshService(storage, async () => { materializedTemplate = newTemplate; revisionId = nextRevisionId; session = { ...session, currentConfigRevisionId: revisionId, draftValidationId: null }; return { data: revisionId, error: null }; }, async () => candidate);
  const preRefreshStages = structuredClone(stages), preRefreshS1 = structuredClone(s1.snapshotJson);
  await refresh.apply(planId, userId, 40, [candidate.preview.changes[0].key]);
  assert.deepEqual(stages, preRefreshStages); assert.deepEqual(s1.snapshotJson, preRefreshS1);
  const s2 = await acceptProposal(second.id);
  assert.equal(s2.configRevisionId, nextRevisionId);
  assert.deepEqual((s2.snapshotJson as AssistedPlanningSnapshotV1).tasks.find(row => row.taskId === first.id), (s1.snapshotJson as AssistedPlanningSnapshotV1).tasks.find(row => row.taskId === first.id));
  const configStage = s2;

  const firstRow = (configStage.snapshotJson as AssistedPlanningSnapshotV1).tasks.find(row => row.taskId === first.id)!;
  const secondRow = (configStage.snapshotJson as AssistedPlanningSnapshotV1).tasks.find(row => row.taskId === second.id)!;
  assert.ok(firstRow.startPlanned && firstRow.endPlanned && secondRow.startPlanned && secondRow.endPlanned);
  const duration = Number(secondRow.endPlanned.slice(0, 2)) * 60 + Number(secondRow.endPlanned.slice(3)) - Number(secondRow.startPlanned.slice(0, 2)) * 60 - Number(secondRow.startPlanned.slice(3));
  await planning.patchDraft(planId, session.draftFingerprint, configStage.id, [{ taskId: second.id, startPlanned: firstRow.startPlanned, endPlanned: time(Number(firstRow.startPlanned.slice(0, 2)) * 60 + Number(firstRow.startPlanned.slice(3)) + duration) }]);
  await planning.validateDraft(planId, session.draftFingerprint, configStage.id);
  const hardReport = validation.reportJson; assert.equal(hardReport.hardValid, false); assert.ok(hardReport.newHardCount > 0);
  await assert.rejects(() => planning.accept(planId, userId, session.draftFingerprint, configStage.id), (error: any) => error instanceof AssistedPlanningError && error.code === "HARD_CONFIRMATION_REQUIRED");
  await planning.accept(planId, userId, session.draftFingerprint, configStage.id, "HARD_EXCEPTIONS");
  const conflictStage = stages.at(-1)!; assert.ok(exceptions.length > 0);
  const followupRequest = await proposal.request(planId, { selector: { kind: "TASK_IDS", taskIds: [third.id] }, includePrerequisites: false, expectedDraftFingerprint: session.draftFingerprint, expectedBaseStageId: session.draftBaseStageId });
  const followupRun = await proposal.run(planId, followupRequest.runId);
  assert.ok(acceptedBaselineCounts.at(-1)! > 0); assert.equal(followupRun.evidence.newHardViolationCount, 0);

  const currentRevision = session.currentConfigRevisionId;
  await planning.rollback(planId, configStage.id);
  assert.deepEqual(dailyTasks, configStage.snapshotJson); assert.equal(session.draftFingerprint, configStage.snapshotFingerprint); assert.equal(session.activeStageId, configStage.id); assert.equal(session.draftBaseStageId, configStage.id); assert.equal(session.currentConfigRevisionId, currentRevision);
  await planning.redo(planId); assert.equal(session.activeStageId, conflictStage.id);
  await planning.rollback(planId, configStage.id);
  const orderedDivergenceMembers = [first.id, second.id].sort((left, right) => {
    const rows = (configStage.snapshotJson as AssistedPlanningSnapshotV1).tasks;
    return rows.find(row => row.taskId === left)!.startPlanned!.localeCompare(rows.find(row => row.taskId === right)!.startPlanned!);
  });
  await planning.editPlanningBlocks(planId, session.draftFingerprint, configStage.id, { kind: "CREATE_BLOCK", memberTaskIds: orderedDivergenceMembers });
  await planning.validateDraft(planId, session.draftFingerprint, configStage.id);
  assert.equal(validation.configRevisionId, currentRevision);
  await planning.accept(planId, userId, session.draftFingerprint, configStage.id);
  const divergentStage = stages.at(-1)!;
  assert.equal(divergentStage.parentStageId, configStage.id); assert.equal(divergentStage.configRevisionId, currentRevision);
  assert.equal(conflictStage.archivedAt, "archived");
  await assert.rejects(() => planning.redo(planId), (error: any) => error instanceof AssistedPlanningError && error.code === "NO_REDO_AVAILABLE");
  const activeState = await planning.state(planId); assert.equal(activeState.acceptedExceptions.length, 0);
  assert.deepEqual(dailyTasks, divergentStage.snapshotJson);

  const evidence = { benchmark: "A2-ASSIST-4-7", status: "PASS", sourceObligationCount, stages: { s0: s0.id, s1: s1.id, s2: s2.id, configStage: configStage.id, conflictStage: conflictStage.id, divergentStage: divergentStage.id }, secondScopeThroughRequestRun: true, s1ProtectedExactly: fingerprintAssistedPlanningSnapshotV1(s1Snapshot) === s1Fingerprint, configRevision: { before: 40, after: currentRevision, rollbackPreservedCurrent: session.currentConfigRevisionId === currentRevision }, proposalConsumedRevisionIds: consumedRevisions, protectedPlacementCounts: protectedCounts, hardConflict: { hardValid: hardReport.hardValid, acceptedExceptionCount: exceptions.length, followupBaselineCount: acceptedBaselineCounts.at(-1), followupNewCount: followupRun.evidence.newHardViolationCount, followupOutcome: followupRun.outcome }, rollback: { exactSnapshot: true, exactDraft: true, exactFingerprint: true, exactActiveAndBaseStage: true, redoOldFutureBeforeDivergence: true }, divergence: { parentIsRestoredCheckpoint: divergentStage.parentStageId === configStage.id, oldFutureArchived: Boolean(conflictStage.archivedAt), oldRedoUnavailable: true, activeAcceptedExceptionCount: activeState.acceptedExceptions.length, dailyTasksAtLatestActiveCheckpoint: JSON.stringify(dailyTasks) === JSON.stringify(divergentStage.snapshotJson) }, productDefectFound: true, productDefects: ["scoped structured-space policies retained absent families/spaces", "resource violation identity rejected adapter namespaces"], migration084: false };
  writeFileSync("docs/evidence/A2-ASSIST-7-assisted-causal-chain.json", `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(await runA2Assist7Evidence(), null, 2));
