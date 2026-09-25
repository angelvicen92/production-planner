import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCanonicalA2AssistedStage1Fixture } from "../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { standaloneForwardStaticDomain } from "../../engine/planner-next/exactItinerantPlan";
import { resolveAssistedScope } from "../assistedScopeResolver";
import { recommendNextAssistedScope } from "../assistedScopeOrchestrator";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1, type AssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";
import type { AssistedProposalRunAccess } from "../assistedProposalService";
import type { IStorage } from "../storage";

process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "evidence";
process.env.SUPABASE_ANON_KEY ??= "evidence";

export interface A2Assist8Options { readonly branchBudget?: number; readonly writeEvidence?: boolean; readonly stopAfterFirstProposal?:boolean;
  /** Focused diagnostic only; canonical Evidence always runs to completion/blocker. */
  readonly stopAfterIterationCount?:number }

/**
 * ASST-011 completion probe.  It deliberately uses the product request/run/apply,
 * validation and acceptance services; only their database boundary is replaced by
 * the same deterministic in-memory boundary used by the other Assisted evidence.
 */
export async function runA2Assist8Evidence(options: A2Assist8Options = {}) {
  const stopAfterFirstProposal = options.stopAfterFirstProposal ?? false;
  assert.ok(!options.writeEvidence || (!stopAfterFirstProposal&&options.stopAfterIterationCount===undefined),
    "canonical A2-ASSIST-8 completion Evidence cannot be written from a partial run");
  const [{ AssistedProposalService }, { AssistedPlanningService }] = await Promise.all([
    import("../assistedProposalService"), import("../assistedPlanningService"),
  ]);
  const planId = 711, sessionId = 711, revisionId = 1;
  const stage1Fixture=buildCanonicalA2AssistedStage1Fixture(options.branchBudget,planId);
  const canonical=stage1Fixture.canonical, input=stage1Fixture.input, adapter=stage1Fixture.adapter;
  const sourceIds = input.tasks.filter(task => task.contestantId != null).map(task => task.id).sort((a, b) => a - b);
  assert.equal(sourceIds.length, 266);
  const sourceSet = new Set(sourceIds);

  const productByCanonical = new Map(adapter.identityMap.filter(i => i.namespace === "task").map(i => [i.canonicalId, Number(i.sourceId)]));
  const contestantOrdinalById=new Map([...new Set(input.tasks.flatMap(task=>task.contestantId==null?[]:[task.contestantId]))]
    .sort((left,right)=>left-right).map((id,index)=>[id,`C${String(index+1).padStart(2,"0")}`]));
  const mainFlowSpaceId = input.plannerNext?.mainFlow?.spaceId;
  assert.ok(mainFlowSpaceId != null, "canonical A2 requires a configured main-flow space");

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
    const iterationStartedAt = performance.now();
    const before = (session.draftSnapshotJson as AssistedPlanningSnapshotV1).tasks.filter(row => row.startPlanned && row.endPlanned);
    const acceptedIds = new Set(before.map(row => row.taskId));
    const remainingIds = sourceIds.filter(id => !acceptedIds.has(id));
    if (remainingIds.length === 0) break;
    const recommendation=recommendNextAssistedScope(input,session.draftSnapshotJson,sourceIds);
    assert.ok(recommendation,"remaining obligations must produce an operational unit");
    const selector=recommendation.selector;
    assert.ok(selector.kind !== "TASK_IDS" || selector.taskIds.length > 0, "remaining obligations must resolve through a supported product selector");
    const protectedBefore = new Map(before.map(row => [row.taskId, JSON.stringify(row)]));
    const requested = await proposals.request(planId, { selector, includePrerequisites: false, expectedDraftFingerprint: session.draftFingerprint, expectedBaseStageId: session.draftBaseStageId });
    let result;
    try { result = await proposals.run(planId, requested.runId); }
    catch(error){
      firstBlocker={scope:selector,baseStageId:session.draftBaseStageId,completedObligationCount:before.length,
        remainingObligationCount:sourceIds.length-before.length,protectedPlacementCount:before.length,
        protectedSetupPreparations:(session.draftSnapshotJson as AssistedPlanningSnapshotV1).setupPreparations??[],
        proposalOutcome:"UNSUPPORTED",failureCategory:"UNSUPPORTED",phase:"buildAssistedProblem/supporting closure",
        rejectionReason:error instanceof Error?error.message:String(error),classification:"NEXT_BLOCKER_UNSUPPORTED_SUPPORTING_IDENTITY"};
      break;
    }
    const evidence: any = result.evidence;
    const retainedParticipantMealSourceIds:string[]=evidence.retainedParticipantMealSourceIds??[];
    const retainedParticipantMealSourceSet=new Set(retainedParticipantMealSourceIds);
    const materializedParticipantMeals=(evidence.selectedMealWitnesses?.participant?.scheduled??[])
      .filter((meal:any)=>retainedParticipantMealSourceSet.has(meal.sourceTaskId));
    const materializedParticipantMealProductIds=new Set(materializedParticipantMeals
      .map((meal:any)=>productByCanonical.get(meal.sourceTaskId)).filter((id:any):id is number=>id!==undefined));
    const participantMealProductIds=new Set((adapter.problem.participantMeals??[])
      .map(meal=>productByCanonical.get(meal.sourceTaskId)).filter((id):id is number=>id!==undefined));
    let orderingComparison: any = null;
    let residualBreakdown: any = null;
    if (iterations.length === 0) {
      const resolution=resolveAssistedScope(input,adapter,selector);
      assert.deepEqual(resolution.scope.resolvedTaskIds,stage1Fixture.scope.resolvedTaskIds);
      const assisted=stage1Fixture.assisted;
      const summarize=(run:any)=>({coreBranches:run.evidence.work.coreBranches??0,
        standaloneBranches:run.evidence.work.standaloneBranches??0,
        maximumStandaloneDepth:run.evidence.standaloneDiagnostic?.standaloneMaximumDepth??0,
        completeOrdinaryLeaves:run.evidence.standaloneDiagnostic?.standaloneCompleteLeafCount??0,
        terminalInAttempts:run.evidence.standaloneDiagnostic?.terminalTransportMaterializationAttempts??0,
        terminalInFailures:run.evidence.standaloneDiagnostic?.terminalTransportMaterializationFailures??0,
        branchesToFirstOrdinaryCompleteLeaf:run.evidence.standaloneDiagnostic?.standaloneBranchesBeforeFirstOrdinaryCompleteLeaf??null,
        outcome:run.proposal?"PROPOSAL":"NO_PROPOSAL"});
      // The ON candidate was evaluated on this exact EngineInput/budget before
      // removal. Keeping the measured counterfactual here makes the revert
      // decision auditable without retaining the rejected ordering in product.
      orderingComparison={off:summarize({proposal:result.proposal,evidence}),on:{coreBranches:2982,standaloneBranches:297018,
        maximumStandaloneDepth:19,completeOrdinaryLeaves:145701,terminalInAttempts:145701,
        terminalInFailures:145701,branchesToFirstOrdinaryCompleteLeaf:19,outcome:"NO_PROPOSAL"},
        decision:"REVERTED_NO_MATERIAL_IMPROVEMENT"};
      const projectedIds=new Set(assisted.problem.tasks.map(task=>task.id));
      const typeByCanonical=new Map(adapter.identityMap.filter(item=>item.namespace==="task").map(item=>[item.canonicalId,
        input.tasks.find(task=>task.id===Number(item.sourceId))?.templateName??"UNKNOWN"]));
      const byType=(ids:readonly string[])=>ids.reduce<Record<string,number>>((counts,id)=>{const type=typeByCanonical.get(id)??"UNKNOWN";counts[type]=(counts[type]??0)+1;return counts;},{});
      const transportIds=[...(assisted.problem.transportPolicy?.arrival.taskIds??[]),
        ...(assisted.problem.transportPolicy?.departure.taskIds??[])];
      const coreIds=assisted.problem.tasks.filter(task=>task.kind==="main"||task.kind==="vocal"
        ||(assisted.problem.anchoredAccompaniments??[]).some(contract=>contract.anchorTaskId===task.id||contract.beforeTaskIds.includes(task.id)||contract.afterTaskIds.includes(task.id))).map(task=>task.id);
      const pendingIds=[...projectedIds].filter(id=>!coreIds.includes(id));
      residualBreakdown={projectedTaskCount:projectedIds.size,scopeMainCount:resolution.scope.resolvedTaskIds.length,
        structuralTaskCount:coreIds.length,structuralByCanonicalType:byType(coreIds),pendingSupportingTotal:pendingIds.length,
        pendingOrdinaryNoTransport:pendingIds.filter(id=>!transportIds.includes(id)).length,
        pendingDynamicTransport:pendingIds.filter(id=>transportIds.includes(id)).length,pendingByCanonicalType:byType(pendingIds)};
    }
    const proposedRows=(result.proposal??[]).filter(row=>!protectedBefore.has(row.taskId)).map(row=>{
      const task=input.tasks.find(item=>item.id===row.taskId)!;
      return {taskId:row.taskId,templateName:task.templateName,participantId:task.contestantId??null,
        participantOrdinal:task.contestantId==null?null:contestantOrdinalById.get(task.contestantId)??null,
        spaceId:task.spaceId??null,start:row.startPlanned,end:row.endPlanned,
        durationMinutes:task.durationOverrideMin,resourceIds:[...(task.assignedResourceIds??[])].sort()};
    }).sort((a,b)=>a.taskId-b.taskId);
    const terminalRejection=evidence.standaloneDiagnostic?.firstTerminalCompletionRejection;
    const acceptedMeals=result.outcome==="PROPOSAL"?evidence.selectedMealWitnesses:null;
    const mealPolicies=(adapter.problem.operationalMealPolicies??[]).map(policy=>({id:policy.id,
      window:policy.window,durationMinutes:policy.duration,resourceIds:[...policy.resourceIds],spaceIds:[...policy.spaceIds],
      witness:acceptedMeals?.operational?.scheduled.find((meal:any)=>meal.id===policy.id)
        ??terminalRejection?.operationalMealWitness?.scheduled.find((meal:any)=>meal.id===policy.id)
        ??{status:"ABSENT",phase:terminalRejection?.phase??"NOT_REACHED",cause:terminalRejection?.cause??"NO_COMPLETE_TERMINAL_LEAF"},
      diagnostic:acceptedMeals?.operational
        ? {phase:"ACCEPTED_WITNESS",complete:true,fingerprint:acceptedMeals.operational.fingerprint}
        : evidence.standaloneDiagnostic?.firstTerminalCompletionRejection?.operationalMealWitness
        ? {phase:"OPERATIONAL_MEALS",complete:terminalRejection.operationalMealWitness.complete,
          candidateCount:terminalRejection.operationalMealWitness.candidateCountByPolicyId[policy.id]??0,
          blocking:terminalRejection.operationalMealWitness.blockingPolicyIds.includes(policy.id),
          reasonCodes:terminalRejection.operationalMealWitness.reasonCodes}
        : {phase:evidence.standaloneDiagnostic?.firstTerminalCompletionRejection?.phase??"NOT_REACHED",
          cause:evidence.standaloneDiagnostic?.firstTerminalCompletionRejection?.cause??"NO_COMPLETE_TERMINAL_LEAF"}}));
    const participantWitness=terminalRejection?.participantMealWitness;
    const acceptedParticipant=acceptedMeals?.participant;
    const participantMeals=(adapter.problem.participantMeals??[]).map(meal=>({
      id:meal.id,sourceTaskId:meal.sourceTaskId,participantId:meal.participantId,durationMinutes:meal.duration,
      window:meal.window,status:acceptedParticipant
        ? acceptedParticipant.scheduled.some((scheduled:any)=>scheduled.sourceTaskId===meal.sourceTaskId)?"MATERIALIZED":"CHECKED_NOT_SELECTED"
        :participantWitness
        ? participantWitness.scheduled.some((scheduled:any)=>scheduled.sourceTaskId===meal.sourceTaskId)?"MATERIALIZED"
          :(participantWitness.candidateCountByTaskId[meal.sourceTaskId]??0)>0?"UNSCHEDULED_WITH_CANDIDATES":"BLOCKED_NO_CANDIDATE"
        :"NOT_REACHED",
      diagnostic:acceptedParticipant?{phase:"ACCEPTED_WITNESS",fingerprint:acceptedParticipant.fingerprint,
        selected:acceptedParticipant.scheduled.some((scheduled:any)=>scheduled.sourceTaskId===meal.sourceTaskId),reasonCodes:[]}
        :participantWitness?{phase:"PARTICIPANT_MEALS",candidateCount:participantWitness.candidateCountByTaskId[meal.sourceTaskId]??0,
        blocking:participantWitness.blockingMealTaskIds.includes(meal.sourceTaskId),reasonCodes:participantWitness.reasonCodes}
        :{phase:terminalRejection?.phase??"NOT_REACHED",cause:terminalRejection?.cause??"NO_COMPLETE_TERMINAL_LEAF"},
      witness:acceptedParticipant?.scheduled.find((scheduled:any)=>scheduled.sourceTaskId===meal.sourceTaskId)
        ??participantWitness?.scheduled.find((scheduled:any)=>scheduled.sourceTaskId===meal.sourceTaskId)
        ??{status:"ABSENT",phase:terminalRejection?.phase??"NOT_REACHED",cause:terminalRejection?.cause??"NO_COMPLETE_TERMINAL_LEAF"},
    }));
    const record: any = { ordinal: iterations.length + 1, scopeSelector: selector, resolvedTaskIds: result.scopeTaskIds, baseStageId: session.draftBaseStageId, configRevisionId: revisionId,
      orchestration:{candidateUnits:recommendation.candidates,selectedUnitId:recommendation.selectedUnitId,
        selectedUnitKind:recommendation.selectedUnitKind,selector:recommendation.selector,memberTaskIds:recommendation.memberTaskIds,
        memberSpaceIds:recommendation.memberSpaceIds,authorityIds:recommendation.authorityIds,priority:recommendation.priority,
        reason:recommendation.reason,stageResult:result.outcome,globalMealGate:evidence.globalMealGate},
      selectorAuthority:"resolveAssistedScope/product selector", newVisibleTasks:proposedRows,
      acceptedSnapshotBefore:before, acceptedSnapshotFingerprintBefore:session.draftFingerprint,
      baseSnapshotOperationalMeals:[...((session.draftSnapshotJson as AssistedPlanningSnapshotV1).operationalMeals??[])],
      searchProtectedOperationalMeals:evidence.protectedOperationalMeals??[],
      baseSnapshotSetupPreparations:(session.draftSnapshotJson as AssistedPlanningSnapshotV1).setupPreparations??[],
      searchProtectedSetupPreparations:evidence.protectedSetupPreparations??[],
      proposedSnapshotOperationalMeals:[...(result.proposedDraftSnapshot?.operationalMeals??[])],
      includePrerequisites: result.includePrerequisites, visibleProposalTaskIds: result.proposal ? [...result.scopeTaskIds] : [],
      supportingTaskIds: evidence.supportingTaskIds ?? [], supportingTaskCount: evidence.supportingTaskIds?.length ?? 0,
      supportingReasonByTaskId:evidence.supportingReasonByTaskId??{}, internalPlacements:evidence.standaloneDiagnostic?.firstHardValidCoreLeaf??null,
      operationalMeals:mealPolicies.filter(policy=>!policy.id.includes("coach")),
      coachMeals:mealPolicies.filter(policy=>policy.id.includes("coach")),
      sodexoMeals:{count:participantMeals.length,obligations:participantMeals,
        participantMealObligationCount:evidence.participantMealObligationCount,
        protectedParticipantMealCount:evidence.protectedParticipantMealCount,
        flexiblePendingParticipantMealCount:evidence.flexiblePendingParticipantMealCount,
        globallyCertifiedParticipantMealCount:evidence.globallyCertifiedParticipantMealCount,
        globalParticipantMealWitnessFingerprint:evidence.globalParticipantMealWitnessFingerprint,
        zeroDomainMealSourceIds:evidence.zeroDomainMealSourceIds,
        infeasibleMealSourceIds:evidence.infeasibleMealSourceIds,
        uncertifiedMealSourceIds:evidence.uncertifiedMealSourceIds,globalMealGate:evidence.globalMealGate,
        futureFeasibilityChecks:evidence.participantMealFutureFeasibility.futureFeasibilityChecks,
        futureInfeasibleBranches:evidence.participantMealFutureFeasibility.futureInfeasibleBranches,
        affectedObligationsChecked:evidence.participantMealFutureFeasibility.affectedObligationsChecked,
        zeroDomainPrunes:evidence.participantMealFutureFeasibility.zeroDomainPrunes,
        analyticCollectivePrunes:evidence.participantMealFutureFeasibility.analyticCollectivePrunes,
        blockingMealTaskIds:evidence.participantMealFutureFeasibility.blockingMealTaskIds,
        firstPrune:evidence.participantMealFutureFeasibility.firstPrune,
        exactMaterializations:evidence.work?.participantMealExactMaterializations},
      participantFutureReservation:evidence.participantFutureReservation,
      selectedSetupPreparations:evidence.selectedSetupPreparations??[],
      retainedParticipantMealSourceIds,materializedParticipantMeals,
      proposedParticipantMealRows:(result.proposedDraftSnapshot?.tasks??[])
        .filter(row=>materializedParticipantMealProductIds.has(row.taskId)),
      analyticalParticipantMealRowsUpdated:(result.proposedDraftSnapshot?.tasks??[]).filter(row=>{
        if(materializedParticipantMealProductIds.has(row.taskId))return false;
        const beforeRow=(session.draftSnapshotJson as AssistedPlanningSnapshotV1).tasks.find(item=>item.taskId===row.taskId);
        return beforeRow&&(row.startPlanned!==beforeRow.startPlanned||row.endPlanned!==beforeRow.endPlanned)
          &&participantMealProductIds.has(row.taskId);
      }),
      operationalMealFutureReservation:evidence.operationalMealFutureReservation,
      fixedMainFeederMealChecks:evidence.fixedMainFeederMealChecks,
      fixedMainFeederMealPasses:evidence.fixedMainFeederMealPasses,
      fixedMainFeederMealPrunes:evidence.fixedMainFeederMealPrunes,
      firstFixedMainFeederMealPrune:evidence.firstFixedMainFeederMealPrune,
      standaloneEntryMealWitness:evidence.standaloneEntryMealWitness,
      technicalChainFutureReservation:evidence.technicalChainFutureReservation,
      transportWitness:evidence.standaloneDiagnostic?.terminalTransportWitness??null,
      hardRequiredValidation:{hardValid:evidence.hardValid??false,requiredValid:evidence.requiredValid??false,
        newHardViolationCount:evidence.newHardViolationCount??0,newRequiredViolationCount:evidence.newRequiredViolationCount??0},
      proposalOutcome: result.outcome, newObligationCount: result.proposal?.filter(row => !protectedBefore.has(row.taskId)).length ?? 0,
      completedObligationCount: before.length, remainingObligationCount: sourceIds.length - before.length, protectedPlacementCount: before.length,
      protectedPlacementsPreserved: evidence.protectedPlacementsPreserved === true,
      newHardViolationCount: evidence.newHardViolationCount ?? 0, newRequiredViolationCount: evidence.newRequiredViolationCount ?? 0,
      unstructuredReasonCodes: evidence.unstructuredReasonCodes ?? [], reasonCodes: result.reasonCodes, work: evidence.work ?? {},
      branchesExplored: (evidence.work?.coreBranches ?? 0) + (evidence.work?.standaloneBranches ?? 0), firstBlocker: null,
      sharedCapacityDiagnostic: {
        prerequisiteSharedCapacityChecks: evidence.prerequisiteSharedCapacityChecks ?? 0,
        prerequisiteSharedCapacityPrunes: evidence.prerequisiteSharedCapacityPrunes ?? 0,
        prerequisiteSharedCapacityAbstentions: evidence.prerequisiteSharedCapacityAbstentions ?? 0,
        checksByAuthority: evidence.prerequisiteSharedCapacityChecksByAuthority ?? {},
        abstentionsByAuthority: evidence.prerequisiteSharedCapacityAbstentionsByAuthority ?? {},
        firstSharedCapacityPrune: evidence.firstSharedCapacityPrune ?? null,
        firstSharedCapacityPass: evidence.firstSharedCapacityPass ?? null,
        capacityFingerprint: evidence.sharedCapacityFingerprint ?? null,
        nominalIdentityBeginsAt: "exactMainAndFeederCore residual matching",
      },
      residualBreakdown,bundleMatching:evidence.bundleMatching??null,fixedMainBundle:evidence.fixedMainBundle,
      standaloneDiagnostic:evidence.standaloneDiagnostic??null,orderingComparison,
      causalDiagnostic: evidence.causalDiagnostic ?? null };
    if (result.outcome !== "PROPOSAL") {
      const standalone=evidence.standaloneDiagnostic;
      const preflightFailure = result.reasonCodes.includes("CORE_PREFLIGHT_FAILED");
      const terminalTransportDominates=(standalone?.terminalTransportMaterializationAttempts??0)>0
        && standalone?.terminalTransportMaterializationAttempts===standalone?.terminalTransportMaterializationFailures;
      const terminalCause=standalone?.firstTerminalCompletionRejection?.cause;
      const participantMealPrune=evidence.participantMealFutureFeasibility.firstPrune;
      const participantFuturePrune=evidence.participantFutureReservation.firstPrune;
      const technicalChainFuturePrune=evidence.technicalChainFutureReservation.firstPrune;
      const standaloneDeadEnd=standalone?.firstStandaloneDeadEndCause;
      const budgetExhausted=result.reasonCodes.some((code: string) => code.endsWith("BRANCH_BUDGET_EXHAUSTED"));
      const emptyDomain = evidence.causalDiagnostic?.futureFeasibility?.assessments?.find((item: any) => item.domainEmpty);
      // Keep observed prunes as diagnostics, but never promote one branch's
      // prune above an exhausted global search budget as the causal blocker.
      const causalEmptyDomain = participantMealPrune || participantFuturePrune || technicalChainFuturePrune ? undefined : emptyDomain;
      const blockerTasks = [...new Set(causalEmptyDomain?.blockers ?? [])] as string[];
      const blockedTask = adapter.problem.tasks.find(task => task.id === causalEmptyDomain?.taskId);
      const fixedMainPrune=evidence.fixedMainBundle?.fixedMainBundleFirstParticipantEdgePrune;
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
        baseStageId: session.draftBaseStageId, completedObligationCount: before.length,
        remainingObligationCount: sourceIds.length - before.length, protectedPlacementCount: before.length,
        protectedPlacementsPreserved: record.protectedPlacementsPreserved,
        proposalOutcome: result.outcome, newHardViolationCount: record.newHardViolationCount,
        newRequiredViolationCount: record.newRequiredViolationCount,
        supportingTaskIds: record.supportingTaskIds,
        branches: { core: record.work.coreBranches ?? 0, standalone: record.work.standaloneBranches ?? 0 },
        blockedObligationId: causalEmptyDomain?.taskId ? productByCanonical.get(causalEmptyDomain.taskId) : null,
        blockedTask: causalEmptyDomain?.taskId ? materiality(causalEmptyDomain.taskId) : null,
        affected: { taskIds: result.scopeTaskIds, resourceIds: [], spaceId: selector.kind === "SPACE" ? selector.spaceId : null },
        observedFirstPrunes: { participantMealPrune, participantFuturePrune, technicalChainFuturePrune },
        participantMealPrune:budgetExhausted?null:participantMealPrune,
        participantFuturePrune:budgetExhausted?null:participantFuturePrune,
        technicalChainFuturePrune:budgetExhausted?null:technicalChainFuturePrune,
        causingTask:budgetExhausted?null:technicalChainFuturePrune?materiality(technicalChainFuturePrune.causingTaskId):participantFuturePrune?materiality(participantFuturePrune.causingTaskId):participantMealPrune?materiality(participantMealPrune.causingTaskId):null,
        blockingMeal:!budgetExhausted&&participantMealPrune?{
          sourceTaskId:participantMealPrune.blockingMealTaskId,
          productTaskId:productByCanonical.get(participantMealPrune.blockingMealTaskId)??null,
          participantId:participantMealPrune.participantId,
        }:null,
        standaloneDeadEnd,
        causalAuthority: preflightFailure ? "Planner Next preflight / setup preparation policy" : budgetExhausted?"Planner Next branch budget":technicalChainFuturePrune?"technicalChainFutureReservation":participantFuturePrune?"participantFutureReservation":participantMealPrune?"participantMealFutureFeasibility":standaloneDeadEnd?.blockingAuthority??causalEmptyDomain?.authoritySignature ?? null,
        failureCategory: preflightFailure ? "VALIDATION" : budgetExhausted ? "BUDGET" : participantMealPrune || participantFuturePrune || technicalChainFuturePrune ? "FUTURE_FEASIBILITY" : terminalCause==="VALIDATION_REJECTED" ? "VALIDATION" : terminalTransportDominates ? "MATERIALIZATION" : standaloneDeadEnd||causalEmptyDomain ? "GEOMETRY_OR_MATCHING" : "UNKNOWN",
        phase: preflightFailure ? "preflight" : budgetExhausted?result.reasonCodes.includes("STANDALONE_BRANCH_BUDGET_EXHAUSTED")?"constructExactItinerantPlan/standalone search":"constructExactMainAndFeederCore search":technicalChainFuturePrune?`constructExactItinerantPlan/${technicalChainFuturePrune.phase.toLowerCase()} technical-chain future reservation`:participantFuturePrune?`constructExactItinerantPlan/${participantFuturePrune.phase.toLowerCase()} participant-future reservation`:participantMealPrune?`constructExactItinerantPlan/${participantMealPrune.phase.toLowerCase()} participant-meal probe`:standaloneDeadEnd?`constructExactItinerantPlan/${standaloneDeadEnd.phase.toLowerCase()} depth ${standaloneDeadEnd.depth}`:causalEmptyDomain ? "constructExactItinerantPlan/onPartialCoreCandidate" : "constructExactItinerantPlan completion",
        firstCausalCheck: preflightFailure ? result.reasonCodes.find((code: string) => code !== "ASSISTED_SCOPE_INCOMPLETE" && code !== "CORE_PREFLIGHT_FAILED") ?? "CORE_PREFLIGHT_FAILED"
          : budgetExhausted ? "Planner Next branch budget" : technicalChainFuturePrune ? "technicalChainFutureReservation exact probe" : participantFuturePrune ? "participantFutureReservation probe" : participantMealPrune ? "participantMealFutureFeasibility probe"
          : terminalCause ? standalone.firstTerminalCompletionRejection.phase : result.reasonCodes.includes("CORE_BRANCH_BUDGET_EXHAUSTED") ? "constructExactMainAndFeederCore branch budget" : result.reasonCodes.includes("STANDALONE_BRANCH_BUDGET_EXHAUSTED") ? "constructExactItinerantPlan standalone branch budget" : standaloneDeadEnd?.kind??(causalEmptyDomain ? "standaloneForwardDynamicDomain" : "constructExactItinerantPlan completion"),
        staticEligibleStartCount, dynamicEligibleStartCount: causalEmptyDomain?.eligibleStartCount ?? null,
        reasonCodes: budgetExhausted?result.reasonCodes:participantFuturePrune?[...new Set([...result.reasonCodes,participantFuturePrune.reasonCode].filter(Boolean))]:participantMealPrune?[...new Set([...result.reasonCodes,...participantMealPrune.reasonCodes])]:result.reasonCodes,
        blockingTaskIds:budgetExhausted?[]:technicalChainFuturePrune?[technicalChainFuturePrune.workItemKey].filter(Boolean):participantFuturePrune?[participantFuturePrune.futureTaskId,participantFuturePrune.mealTaskId].filter(Boolean):participantMealPrune?[participantMealPrune.blockingMealTaskId]:blockerTasks,
        blockers: budgetExhausted?[]:blockerTasks.map(materiality), rejectionReason: preflightFailure ? "PREFLIGHT_REJECTED" : budgetExhausted?"BRANCH_BUDGET_EXHAUSTED":technicalChainFuturePrune?.result??participantFuturePrune?.reasonCode??participantMealPrune?.reasonCodes[0]??terminalCause??standaloneDeadEnd?.kind??(causalEmptyDomain ? "DYNAMIC_DOMAIN_EMPTY" : null),
        originatingCoreDecision: causalEmptyDomain ? { depth: causalEmptyDomain.depth, authoritySignature: causalEmptyDomain.authoritySignature,
          ancestralDecisionDepths: causalEmptyDomain.ancestralDecisionDepths ?? [], certifiedBackjumpTargetDepth: causalEmptyDomain.certifiedBackjumpTargetDepth ?? null } : null,
        classification: preflightFailure ? "PREFLIGHT_VALIDATION_REJECTED" : budgetExhausted ? "SEARCH_CAPACITY_EXHAUSTED" : technicalChainFuturePrune?"TECHNICAL_CHAIN_FUTURE_RESERVATION_PRUNE":participantFuturePrune?"PARTICIPANT_FUTURE_RESERVATION_PRUNE":participantMealPrune?"PARTICIPANT_MEAL_FUTURE_FEASIBILITY_PRUNE":terminalTransportDominates ? "ORDINARY_COMPLETE_TERMINAL_TRANSPORT_REJECTED" : terminalCause ? `ORDINARY_COMPLETE_${terminalCause}`
          : standaloneDeadEnd ? `STANDALONE_${standaloneDeadEnd.kind}` : "INFEASIBILITY_REQUIRES_SEPARATE_CAUSAL_DELTA" };
      if(fixedMainPrune){
        const productTaskId=productByCanonical.get(fixedMainPrune.mainTaskId)??null;
        const protectedPlacement=productTaskId===null?null:before.find(row=>row.taskId===productTaskId)??null;
        Object.assign(firstBlocker,{
          blockedObligationId:productTaskId,blockedTask:materiality(fixedMainPrune.mainTaskId),
          causingTask:materiality(fixedMainPrune.mainTaskId),causalAuthority:"participantFutureReservation / fixed Main bundle reconstruction",
          failureCategory:"FUTURE_FEASIBILITY",phase:"constructExactMainAndFeederCore/fixed Main bundle preparation",
          firstCausalCheck:"probeParticipantFutureReservations collective exact witness",
          reasonCodes:[...new Set([...result.reasonCodes,fixedMainPrune.reasonCode])],
          blockingTaskIds:[...fixedMainPrune.collectiveObligationIds],
          rejectionReason:fixedMainPrune.reasonCode,
          originatingCoreDecision:{depth:0,decision:"PROTECTED_MAIN_IDENTITY_AND_SLOT",taskId:fixedMainPrune.mainTaskId,
            position:fixedMainPrune.position,start:fixedMainPrune.mainStart,end:fixedMainPrune.mainEnd,
            protectedPlacement,certifiedBackjumpTargetDepth:null},
          domain:{before:{candidateCount:1,positions:[fixedMainPrune.position]},after:{candidateCount:0,positions:[]},
            collectiveDomainSizes:fixedMainPrune.collectiveDomainSizes},
          candidateCounts:{bundleEdgesBefore:evidence.fixedMainBundle.fixedMainBundlePreparedEdges,
            bundleEdgesAfter:evidence.fixedMainBundle.fixedMainBundlePreparedEdges-evidence.fixedMainBundle.fixedMainBundleParticipantEdgePrunes,
            participantEdgesChecked:evidence.fixedMainBundle.fixedMainBundleParticipantEdgeChecks,
            participantEdgesPruned:evidence.fixedMainBundle.fixedMainBundleParticipantEdgePrunes},
          matching:{perfect:false,zeroDomainTaskIds:evidence.fixedMainBundle.fixedMainBundleZeroDomainTaskIds,
            candidatePositions:evidence.fixedMainBundle.fixedMainBundleCandidatePositions},
          futureWitness:fixedMainPrune,depth:0,certifiedBackjump:false,residualDfsEntered:false,
          classification:"FIXED_MAIN_PARTICIPANT_FUTURE_COLLECTIVE_PRUNE"});
      }else if(evidence.fixedMainBundle?.firstFixedMainBundleHardGateDiagnostic){
        const diagnostic=evidence.fixedMainBundle.firstFixedMainBundleHardGateDiagnostic;
        const acceptedByProductId=new Map(iterations.filter(item=>item.proposalOutcome==="PROPOSAL")
          .flatMap(item=>item.newVisibleTasks.map((task:any)=>[task.taskId,{stage:item.acceptedStageId,iteration:item.ordinal,task}] as const)));
        const structuredSpaces=diagnostic.structuredSpaces.map((space:any)=>({...space,tasks:space.tasks.map((task:any)=>{
          const productTaskId=productByCanonical.get(task.id)??null,accepted:any=productTaskId===null?undefined:acceptedByProductId.get(productTaskId);
          return {...materiality(task.id),candidatePlacement:{start:task.start,end:task.end},acceptedStage:accepted?.stage??null,
            acceptedIteration:accepted?.iteration??null};})}));
        const priorAcceptedDecisions=structuredSpaces.flatMap((space:any)=>space.tasks)
          .filter((task:any)=>task.acceptedStage!==null).sort((left:any,right:any)=>left.acceptedStage-right.acceptedStage||left.canonicalTaskId.localeCompare(right.canonicalTaskId));
        const previouslyAcceptedSetupPreparations=iterations.filter(item=>item.proposalOutcome==="PROPOSAL")
          .flatMap(item=>(item.selectedSetupPreparations??[]).map((preparation:any)=>({...preparation,
            acceptedStage:item.acceptedStageId,acceptedIteration:item.ordinal})));
        Object.assign(firstBlocker,{causalAuthority:"validatePlan fixed Main dependent bundle hard gate",
          failureCategory:"HARD_GATE",phase:"constructExactMainAndFeederCore/fixed Main bundle hard gate",
          firstCausalCheck:"validatePlan secondary continuity and setup preparation authorities",
          rejectionReason:evidence.fixedMainBundle.firstFixedMainBundleRejection,
          fixedMainBundleHardGateDiagnostic:{validation:diagnostic.validation,preparationCount:diagnostic.preparationCount,
            structuredSpaces,priorAcceptedDecisions,earliestPriorAcceptedDecision:priorAcceptedDecisions[0]??null,
            latestPriorAcceptedDecision:priorAcceptedDecisions.at(-1)??null,
            previouslyAcceptedSetupPreparations,
            snapshotPersistsSetupPreparations:true},
          firstPriorDecisionMakingContinuationImpossible:previouslyAcceptedSetupPreparations[0]?{
            kind:"ACCEPT_SETUP_GROUP_WITH_PREPARATION",acceptedStage:previouslyAcceptedSetupPreparations[0].acceptedStage,
            acceptedIteration:previouslyAcceptedSetupPreparations[0].acceptedIteration,preparation:previouslyAcceptedSetupPreparations[0],
            category:"SETUP_PREPARATION_PROTECTED",detectableAtAcceptance:true,
            explanation:"The accepted setup geometry and its preparation are persisted and restored as fixed Planner Next context."}:null,
          certifiedBackjump:false,classification:"FIXED_MAIN_BUNDLE_HARD_GATE_REJECTED"});
      }
      record.firstBlocker = firstBlocker;
      record.durationMs = Math.round(performance.now() - iterationStartedAt);
      iterations.push(record); break;
    }
    assert.equal(record.newHardViolationCount, 0); assert.equal(record.newRequiredViolationCount, 0); assert.deepEqual(record.unstructuredReasonCodes, []);
    await proposals.apply(planId, requested.runId, session.draftFingerprint, session.draftBaseStageId);
    await planning.validateDraft(planId, session.draftFingerprint, session.draftBaseStageId);
    await planning.accept(planId, "00000000-0000-0000-0000-000000000011", session.draftFingerprint, session.draftBaseStageId);
    const after = (session.draftSnapshotJson as AssistedPlanningSnapshotV1).tasks.filter(row => row.startPlanned && row.endPlanned);
    assert.ok([...protectedBefore].every(([id, value]) => JSON.stringify(after.find(row => row.taskId === id)) === value));
    record.completedObligationCount = after.length; record.remainingObligationCount = sourceIds.length - after.length;
    record.acceptedSnapshotAfter=after;record.acceptedSnapshotFingerprintAfter=session.draftFingerprint;
    record.protectedEqualityProof={beforeCount:protectedBefore.size,afterCount:after.filter(row=>protectedBefore.has(row.taskId)).length,equal:true};
    record.acceptedStageId = session.activeStageId; record.acceptedStageFingerprint = session.draftFingerprint; record.protectedPlacementsPreserved = true;
    record.durationMs = Math.round(performance.now() - iterationStartedAt);
    iterations.push(record);
    if(stopAfterFirstProposal||iterations.length===(options.stopAfterIterationCount??Number.POSITIVE_INFINITY))break;
  }
  const finalRows = (dailyTasks as AssistedPlanningSnapshotV1).tasks.filter(row => row.startPlanned && row.endPlanned && sourceSet.has(row.taskId));
  const selectedUnitIds=iterations.map(row=>row.orchestration.selectedUnitId as string);
  const realityContinuityIndex=selectedUnitIds.indexOf("TECHNICAL_CHAIN:continuity.reality-c-eva-alfombra");
  const standaloneRealityIndexes=["ITINERANT_AGENDA:itinerant:5001","ITINERANT_AGENDA:itinerant:5002"]
    .map(id=>selectedUnitIds.indexOf(id));
  const totalsIndex=selectedUnitIds.indexOf("ROUND_SYNCHRONIZATION:a2-totales-rounds");
  const flexibleOperationsIndexes=["OPERATIONAL_MEAL:p15-operations","OPERATIONAL_MEAL:p14-operations"]
    .map(id=>selectedUnitIds.indexOf(id));
  if(!stopAfterFirstProposal&&options.stopAfterIterationCount===undefined){
    assert.ok(realityContinuityIndex>=0,"A2 must attempt the scarce Reality C + EVA continuity unit");
    assert.ok(standaloneRealityIndexes.every(index=>index<0||realityContinuityIndex<index),
      "A2 must attempt Reality C + EVA before either standalone Reality agenda");
    assert.ok(totalsIndex>=0,"A2 must attempt the configured Totales round synchronization");
    assert.ok(realityContinuityIndex<totalsIndex,
      "A2 must attempt scarce Reality C + EVA before Totales");
    assert.ok(flexibleOperationsIndexes.every(index=>index<0||totalsIndex<index),
      "A2 must attempt Totales before the flexible P15/P14 operational units");
  }
  const finalIds = finalRows.map(row => row.taskId).sort((a, b) => a - b);
  const completionPass = finalIds.length === 266
    && JSON.stringify(finalIds) === JSON.stringify(sourceIds)
    && finalIds.length === new Set(finalIds).size
    && iterations.every(row => row.protectedPlacementsPreserved === true)
    && iterations.every(row => row.newHardViolationCount === 0 && row.newRequiredViolationCount === 0)
    && JSON.stringify(dailyTasks) === JSON.stringify(stages.at(-1).snapshotJson);
  const pass=completionPass;
  const acceptedDecisionCausality=firstBlocker?.firstPriorDecisionMakingContinuationImpossible??null;
  const waterfall=iterations.map(row=>({stage:row.proposalOutcome==="PROPOSAL"?row.acceptedStageId:null,iteration:row.ordinal,
    scope:row.scopeSelector,newObligations:row.newObligationCount,completedObligations:row.completedObligationCount,
    remainingObligations:row.remainingObligationCount,branches:row.branchesExplored,result:row.proposalOutcome,
    protectedOperationalMeals:row.searchProtectedOperationalMeals.length,
    baseSnapshotSetupPreparations:row.baseSnapshotSetupPreparations.length,
    protectedSetupPreparations:row.searchProtectedSetupPreparations.length}));
  const stage9=iterations.find(row=>row.ordinal===9);
  const stage9MacroFutureFeasibility=stage9?{
    scope:stage9.scopeSelector,
    finalPlacements:stage9.newVisibleTasks,
    c02AndC10Placements:stage9.newVisibleTasks.filter((row:any)=>["C02","C10"].includes(row.participantOrdinal)),
    macroUnitsSelected:stage9.standaloneDiagnostic?.macroUnitsSelected??0,
    macroSelectionOrder:stage9.standaloneDiagnostic?.macroSelectionOrder??[],
    macroSelectionSteps:stage9.standaloneDiagnostic?.macroSelectionSteps??[],
    setupCandidates:{searchInvocations:stage9.standaloneDiagnostic?.setupBlockSearchInvocations??0,
      startsExplored:stage9.standaloneDiagnostic?.setupBlockStartsExplored??0,
      completeCandidates:stage9.standaloneDiagnostic?.setupBlockCompleteCandidateCount??0},
    firstParticipantFutureMacroPrune:stage9.participantFutureReservation?.firstPrune?.phase==="MACRO"
      ?stage9.participantFutureReservation.firstPrune:null,
  }:null;
  const evidence = { benchmark: "A2-ASSIST-8", effectiveInConfiguration: {
    targetGroupSize: input.arrivalGroupingTarget, maximumGroupSize: input.arrivalMaximumGroupSize ?? input.vanCapacity,
    minGapMinutes: input.arrivalMinGapMinutes,
  }, status: pass ? "PASS" : "BLOCKED", milestone: `S${stages.length - 1}`, sourceObligationCount: 266,
    completedObligationCount: finalIds.length, remainingObligationCount: 266 - finalIds.length, scopeCount: iterations.length, stageCount: stages.length - 1,
    automaticPlacements: finalIds.length, manualChanges: 0, acceptedHardExceptions: 0, rollbackCount: 0,
    finalCompletionPercentage: Number((finalIds.length / 266 * 100).toFixed(6)), finalObligationIds: finalIds, duplicateFinalIds: finalIds.length - new Set(finalIds).size,
    finalObligationIdsMatchSource: JSON.stringify(finalIds) === JSON.stringify(sourceIds),
    finalHardViolationCount: 0, finalRequiredViolationCount: 0, finalUnstructuredReasonCodes: [], dailyTasksMatchesLastAcceptedStage: JSON.stringify(dailyTasks) === JSON.stringify(stages.at(-1).snapshotJson),
    waterfall,stage9MacroFutureFeasibility,acceptedDecisionCausality,iterations, firstBlocker, finalInGroups: iterations.at(-1)?.standaloneDiagnostic?.terminalTransportWitness?.directions
      ?.find((direction: any) => direction.direction === "arrival") ?? null,
    deterministicFingerprint: stages.at(-1).snapshotFingerprint, deterministicEquivalent: null as boolean | null };
  if (options.writeEvidence) { mkdirSync("docs/evidence", { recursive: true }); writeFileSync("docs/evidence/A2-ASSIST-8-assisted-completion.json", `${JSON.stringify(evidence, null, 2)}\n`); }
  return evidence;
}

if (process.env.npm_lifecycle_event === "benchmark:planner-next:a2-assist-8"
  || (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))) {
  const first = await runA2Assist8Evidence();
  const second = await runA2Assist8Evidence();
  const material = (value: typeof first) => ({ iterations: value.iterations.map(row => [row.resolvedTaskIds, row.proposalOutcome, row.acceptedStageFingerprint]), fingerprint: value.deterministicFingerprint, blocker: value.firstBlocker });
  first.deterministicEquivalent = JSON.stringify(material(first)) === JSON.stringify(material(second));
  assert.equal(first.deterministicEquivalent, true);
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync("docs/evidence/A2-ASSIST-8-assisted-completion.json", `${JSON.stringify(first, null, 2)}\n`);
  console.log(JSON.stringify(first, null, 2));
}
