import type { PlannerNextProblem, ScheduledItinerantUnitMeal, ScheduledOperationalMeal, ScheduledParticipantMeal, ScheduledResourceMeal, ScheduledRoundPreparation, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { createHash } from "node:crypto";
import { anchoredTaskIds } from "./anchoredAccompaniment";
import {
  createExactSearchLedger,
  runExactMainAndFeederSearch,
  type ExactMainAndFeederCoreStatus,
  type ExactSearchLedger,
  type ExactMainAndFeederSearchOptions,
  type ExactCoreCausalDiagnostic,
  type ExactCoreContinuationOutcome,
  type ExactFutureFeasibilityCausalAssessment,
} from "./exactMainAndFeederCore";
import type { MainFeederArchitecture, MainFeederStructuralRejection } from "./mainFlowPatterns";
import { generateExactSetupBlockCandidates, probeExactSetupMacroDomain } from "./exactSetupBlocks";
import { fingerprint } from "./fingerprint";
import { materializeScheduledItinerantUnitMeals } from "./itinerantUnitMeals";
import { canPlaceTask, diagnoseTaskPlacement, effectiveResourceTransitionMinutes, exactStartDomainFromIntervals,
  exactStartDomainContains, exactTaskDynamicStartDomain, exactTaskStartDomain, exactTaskStaticStartDomain, intersectExactStartIntervals } from "./placement";
import { effectiveCoachTransitionMinutes } from "./coachRouteTransitions";
import { participantGapMinutes } from "./participantTransition";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { evaluateParticipantItineraryQuality, type ParticipantItineraryQualitySummary } from "./participantItineraryQuality";
import { createResidualObligationMainOrderer } from "./residualObligationAlignment";
import { validatePlan } from "./validate";
import { assessParticipantMealFutureFeasibility, probeParticipantMealFutureFeasibility, participantMealWitnessFingerprint, type ParticipantMealWitness } from "./participantMeals";
import { PreparedFutureCollectiveParticipantClosure, createFutureCollectiveClosureEvidence,
  type FutureCollectiveClosureEvidence, type FutureCollectiveClosureResult } from "./futureCollectiveParticipantClosure";
import { probeParticipantFutureReservations, type ParticipantFutureReservationProbe } from "./participantFutureFeasibility";
import { PreparedFutureTechnicalChainAuthority, probeTechnicalChainFutureReservations, type PreparedFutureTechnicalChainEvidence, type TechnicalChainFutureReservationProbe } from "./technicalChainFutureFeasibility";
import { operationalMealWitnessFingerprint, type OperationalMealWitness } from "./operationalMeals";
import { PreparedOperationalMealAuthority, type PreparedOperationalMealEvidence } from "./preparedOperationalMealAuthority";
import { createMainFlowMeal, mainFlowMealPolicy, materializeMainFlowOperationalMeals } from "./mainFlowMeal";
import { setupFamilySequence } from "./setupGrouping";
import { roundSynchronizationTaskIds, validateRoundSynchronizations } from "./roundSynchronization";
import { exploreExactRoundSynchronizationPolicy, revalidateFutureRoundSynchronizationWitness, probeExactRoundSynchronizationMacroDomain, type ExactRoundSynchronizationEvidence } from "./exactRoundSynchronization";
import { assessCoreArrivalTransportFeasibility, materializeTerminalTransportDetailed, transportTaskIds, type TransportMaterializationEvidence } from "./transportGrouping";
import { canPlaceJointGroup, jointGroupIds, jointGroupMembers, jointWorkItemKey, scheduleJointGroup } from "./jointTasks";
import { createTechnicalChainExplorer, getTechnicalChains, partialTechnicalChainContext, probeExactTechnicalChainMacroDomain, technicalChainWorkItemKey, type TechnicalChainStartDomainMode } from "./technicalChains";
import { selectMostConstrainedUnit } from "./macroScheduling";
import { exploreExactPreferredResourceUnit } from "./exactPreferredResourceUnit";
import { checkIndividualPendingPrerequisiteReservations, checkMacroPendingPrerequisites, type MacroPendingPrerequisiteForwardCache } from "./macroPendingPrerequisiteForwardCheck";
import { authorizedPipelineArchitectureMaterializations, materializeFirstNominalPipelineWitness, materializePipelineBundleMatching,
  futureStructuralWitnessFromMaterialization, materializePreparedPipelineBundleMatching, pipelineWitnessAuthorityDiagnostic, preparePipelineBundleGraph,
  futureStructuralWitnessV2FromAcceptedPipeline,
  type AnonymousPipelineWitnessDiagnostic, type FutureStructuralWitness, type FutureStructuralWitnessV1, type FutureRoundSynchronizationWitnessV1, type FutureItinerantAgendaWitnessV1, type PipelineWitnessAuthorityDiagnostic,
  type PipelineWitnessObservation } from "./anonymousPipelineWitness";
import { materializeItinerantUnitAssignment } from "./itinerantUnitAssignment";
import { revalidateJointCompletionWitness } from "./jointCompletionWitness";
import { itinerantAgendaStructuralFrontier } from "./itinerantAgendaAuthority";
import { certifyFutureStructuralWitnessSet, createFutureWitnessSetEvidence, type FutureWitnessContext,
  type FutureWitnessUnit, type FutureWitnessSetEvidence } from "./futureStructuralWitnessSet";

export type StandaloneCompletionSelection = "FIRST_HARD_VALID" | "BEST_DOMINATING_WITHIN_BUDGET";
export interface ExactItinerantAgendaSearchResult {outcome:"FOUND"|"DEAD_END"|"BUDGET_EXHAUSTED";branches:number;candidates:number;mealPrunes:number}
export type ItinerantAgendaWitnessRevalidation =
  |{status:"PASS";agenda:ScheduledTask[];prerequisites:ScheduledTask[]}
  |{status:"STALE"|"REJECT";reason:string}
  |{status:"BUDGET_EXHAUSTED";reason:"BUDGET_EXHAUSTED"};

const witnessFingerprint=(witness:Omit<FutureItinerantAgendaWitnessV1,"fingerprint">)=>
  createHash("sha256").update(JSON.stringify(witness)).digest("hex");

/** Replays the concrete certificate only. It never searches an alternative geometry. */
export function revalidateFutureItinerantAgendaWitness(problem:PlannerNextProblem,identity:string,unitIds:readonly string[],
  members:readonly Task[],prerequisites:readonly Task[],context:readonly ScheduledTask[],meals:readonly ScheduledSpaceMeal[],
  supportingFingerprint:string|null,witness:FutureStructuralWitness):ItinerantAgendaWitnessRevalidation {
  if(witness.kind!=="ITINERANT_AGENDA"||witness.version!==1)return{status:"REJECT",reason:"INVALID_KIND_OR_VERSION"};
  const {fingerprint:actual,...unsigned}=witness;if(witnessFingerprint(unsigned)!==actual)return{status:"REJECT",reason:"FINGERPRINT_MISMATCH"};
  if(witness.identity!==identity)return{status:"STALE",reason:"STRUCTURAL_IDENTITY_MISMATCH"};
  if(JSON.stringify([...witness.unitIds])!==JSON.stringify([...unitIds].sort()))return{status:"STALE",reason:"UNIT_DOMAIN_MISMATCH"};
  if(witness.supportingFingerprint!==supportingFingerprint)return{status:"STALE",reason:"SUPPORTING_FINGERPRINT_MISMATCH"};
  const memberById=new Map(members.map(task=>[task.id,task])),prerequisiteById=new Map(prerequisites.map(task=>[task.id,task]));
  if(JSON.stringify([...memberById.keys()].sort())!==JSON.stringify(witness.scheduledTaskPlacements.map(item=>item.id).sort()))
    return{status:"STALE",reason:"MEMBER_SET_MISMATCH"};
  if(JSON.stringify([...prerequisiteById.keys()].sort())!==JSON.stringify(witness.prerequisiteTaskPlacements.map(item=>item.id).sort()))
    return{status:"STALE",reason:"PREREQUISITE_SET_MISMATCH"};
  const frontier=itinerantAgendaStructuralFrontier(problem,unitIds,context);
  if(witness.structuralFrontier!==frontier)return{status:"STALE",reason:"FRONTIER_MISMATCH"};
  const placed:ScheduledTask[]=[];
  const replay=(certificate:readonly Pick<ScheduledTask,"id"|"start"|"end"|"spaceId">[],source:ReadonlyMap<string,Task>,agenda:boolean):string|null=>{
    const pending=[...certificate].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
    while(pending.length){const nextIndex=pending.findIndex(item=>(source.get(item.id)?.dependencies??[]).every(id=>
      !source.has(id)||placed.some(task=>task.id===id)||context.some(task=>task.id===id)));
      if(nextIndex<0)return "PREREQUISITE_ORDER_INVALID";const item=pending.splice(nextIndex,1)[0]!,base=source.get(item.id);
      if(!base)return agenda?"MEMBER_SET_MISMATCH":"PREREQUISITE_SET_MISMATCH";
      const task=agenda?materializeItinerantUnitAssignment(problem,base,(item as typeof witness.scheduledTaskPlacements[number]).itinerantUnitId??""):base;
      if(!task)return "UNIT_ASSIGNMENT_INVALID";
      if(item.spaceId!==task.spaceId||item.end-item.start!==task.duration||item.end>frontier)return "PLACEMENT_AUTHORITY_CHANGED";
      const fixed=context.find(other=>other.id===item.id);if(fixed){if(fixed.start!==item.start||fixed.end!==item.end||fixed.spaceId!==item.spaceId)return "PROTECTED_PREREQUISITE_MISMATCH";
        placed.push(fixed);continue;}
      const domain=standaloneForwardDynamicDomain(problem,task,[...context,...placed],standaloneForwardStaticDomain(problem,task,[...meals]));
      if(!exactStartDomainContains(problem,domain,item.start))return "PLACEMENT_REJECTED";
      placed.push({...task,start:item.start,end:item.end});
    }return null;
  };
  const prerequisiteReason=replay(witness.prerequisiteTaskPlacements,prerequisiteById,false);
  if(prerequisiteReason)return{status:"REJECT",reason:prerequisiteReason};
  const prerequisitePlacements=[...placed];const memberReason=replay(witness.scheduledTaskPlacements,memberById,true);
  if(memberReason)return{status:"REJECT",reason:memberReason};
  return{status:"PASS",prerequisites:prerequisitePlacements,agenda:placed.slice(prerequisitePlacements.length)};
}

/** One exact MRV agenda authority shared by current materialization, future proof, and replay. */
export function searchExactItinerantAgenda(problem:PlannerNextProblem,tasks:readonly Task[],unitIds:readonly string[],
  context:readonly ScheduledTask[],meals:readonly ScheduledSpaceMeal[],frontier:number,
  consume:()=>boolean,continuation:(scheduled:readonly ScheduledTask[])=>"FOUND"|"DEAD_END"|"BUDGET_EXHAUSTED",
  preferred:readonly ScheduledTask[]=[]):ExactItinerantAgendaSearchResult {
  let branches=0,candidates=0,mealPrunes=0;
  const mealsAuthority=new PreparedOperationalMealAuthority(problem);
  const visit=(remaining:readonly Task[],scheduled:ScheduledTask[]):"FOUND"|"DEAD_END"|"BUDGET_EXHAUSTED"=>{
    if(!remaining.length){candidates++;return continuation(scheduled);}
    const choicesByTask=new Map<string,Array<{task:Task;assigned:Task;unitId:string;domain:StandaloneForwardDynamicDomain}>>();
    for(const task of [...remaining].sort(byId))for(const unitId of [...unitIds].filter(id=>(task.allowedItinerantUnitIds??[]).includes(id)).sort()){
      const assigned=materializeItinerantUnitAssignment(problem,task,unitId);if(!assigned)continue;
      const domain=standaloneForwardDynamicDomain(problem,assigned,[...context,...scheduled],standaloneForwardStaticDomain(problem,assigned,[...meals]));
      const row=choicesByTask.get(task.id)??[];row.push({task,assigned,unitId,domain});choicesByTask.set(task.id,row);
    }
    const ready=[...remaining].filter(task=>!task.dependencies.some(id=>remaining.some(candidate=>candidate.id===id)));
    const selected=[...(ready.length?ready:remaining)].sort((a,b)=>
      (choicesByTask.get(a.id)??[]).reduce((n,x)=>n+x.domain.eligibleStartCount,0)-(choicesByTask.get(b.id)??[]).reduce((n,x)=>n+x.domain.eligibleStartCount,0)||a.id.localeCompare(b.id))[0];
    const preferredById=new Map(preferred.map(item=>[item.id,item]));
    const alternatives=(selected?[...(choicesByTask.get(selected.id)??[])]:[]).flatMap(choice=>[...choice.domain.starts()].map(start=>({choice,start})))
      .filter(({choice,start})=>start+choice.assigned.duration<=frontier).sort((a,b)=>{
        const ap=preferredById.get(a.choice.task.id),bp=preferredById.get(b.choice.task.id);
        const am=ap?.start===a.start&&ap.itinerantUnitId===a.choice.unitId?0:1,bm=bp?.start===b.start&&bp.itinerantUnitId===b.choice.unitId?0:1;
        return am-bm||a.start-b.start||a.choice.unitId.localeCompare(b.choice.unitId);
      });
    for(const {choice,start} of alternatives){if(!consume())return "BUDGET_EXHAUSTED";branches++;
      const next=scoreAuxiliaryTask(problem,choice.assigned,start,[...context,...scheduled]).scheduled;
      const meal=mealsAuthority.assess([...context,...scheduled,next],[next],{remaining:Number.MAX_SAFE_INTEGER,
        consume:(count=1)=>{for(let i=0;i<count;i++){if(!consume())return false;branches++;}return true;}},"STANDALONE",scheduled.length);
      if(meal.status==="ABSTAIN")return "BUDGET_EXHAUSTED";
      if(meal.status==="PRUNE"){mealPrunes++;continue;}
      const outcome=visit(remaining.filter(item=>item.id!==choice.task.id),[...scheduled,next]);if(outcome!=="DEAD_END")return outcome;
    }return "DEAD_END";
  };
  const outcome=visit(tasks,[]);return {outcome,branches,candidates,mealPrunes};
}

function searchExactPrerequisiteClosure(problem:PlannerNextProblem,tasks:readonly Task[],context:readonly ScheduledTask[],
  meals:readonly ScheduledSpaceMeal[],frontier:number,consume:()=>boolean,
  continuation:(scheduled:readonly ScheduledTask[])=>"FOUND"|"DEAD_END"|"BUDGET_EXHAUSTED"):
  {outcome:"FOUND"|"DEAD_END"|"BUDGET_EXHAUSTED";branches:number} {
  let branches=0;const ids=new Set(tasks.map(task=>task.id));
  const visit=(remaining:readonly Task[],scheduled:ScheduledTask[]):"FOUND"|"DEAD_END"|"BUDGET_EXHAUSTED"=>{
    if(!remaining.length)return continuation(scheduled);
    const ready=remaining.filter(task=>task.dependencies.filter(id=>ids.has(id)).every(id=>scheduled.some(item=>item.id===id)));
    const choices=(ready.length?ready:remaining).map(task=>({task,domain:standaloneForwardDynamicDomain(problem,task,[...context,...scheduled],standaloneForwardStaticDomain(problem,task,[...meals]))}))
      .sort((a,b)=>a.domain.eligibleStartCount-b.domain.eligibleStartCount||a.task.id.localeCompare(b.task.id));
    const selected=choices[0];if(!selected)return "DEAD_END";
    for(const start of selected.domain.starts()){if(start+selected.task.duration>frontier)continue;if(!consume())return "BUDGET_EXHAUSTED";branches++;
      const next=scoreAuxiliaryTask(problem,selected.task,start,[...context,...scheduled]).scheduled;
      const outcome=visit(remaining.filter(task=>task.id!==selected.task.id),[...scheduled,next]);if(outcome!=="DEAD_END")return outcome;
    }return "DEAD_END";
  };return{outcome:visit(tasks,[]),branches};
}
export type CompleteParticipantQuality = Pick<ParticipantItineraryQualitySummary,
  "maximumParticipantIdleMinutes" | "maximumSingleGapMinutes" | "totalIdleMinutes" | "totalGapCount" | "totalSpaceChangeCount">;

/** Returns 1 only when candidate dominates incumbent across the five operational metrics. */
export function compareCompleteParticipantQuality(candidate: CompleteParticipantQuality,
  incumbent: CompleteParticipantQuality): -1 | 0 | 1 {
  const keys: Array<keyof CompleteParticipantQuality> = ["maximumParticipantIdleMinutes", "maximumSingleGapMinutes",
    "totalIdleMinutes", "totalGapCount", "totalSpaceChangeCount"];
  if (keys.some((key) => candidate[key] > incumbent[key])) return 0;
  return keys.some((key) => candidate[key] < incumbent[key]) ? 1 : -1;
}

export type ExactItinerantPlanStatus = "COMPLETE" | "CORE_FAILED" | "UNSUPPORTED_STANDALONE_SHAPE"
  | "INFEASIBLE" | "BRANCH_BUDGET_EXHAUSTED";

export type TerminalCompletionRejectionCause = "SUBSTANTIVE_IDENTITY_INCOMPLETE"
  | "PARTICIPANT_MEAL_WITNESS_INCOMPLETE" | "OPERATIONAL_MEAL_WITNESS_INCOMPLETE"
  | "TRANSPORT_MATERIALIZATION_FAILED" | "CANDIDATE_IDENTITY_MISMATCH" | "VALIDATION_REJECTED";

export interface TerminalCompletionRejection {
  readonly cause: TerminalCompletionRejectionCause;
  readonly phase: "SUBSTANTIVE_IDENTITY" | "PARTICIPANT_MEALS" | "OPERATIONAL_MEALS"
    | "TRANSPORT_MATERIALIZATION" | "CANDIDATE_IDENTITY" | "VALIDATION";
  readonly expectedTaskCount: number;
  readonly actualTaskCount: number;
  readonly participantMealWitness: ParticipantMealWitness | null;
  readonly operationalMealWitness: OperationalMealWitness | null;
  readonly transportWitness: TransportMaterializationEvidence | null;
  readonly validation: { readonly hardValid: boolean; readonly reasonCodes: readonly string[];
    readonly violations: readonly import("./contracts").ValidationViolationDetail[] } | null;
}

export type StandaloneDeadEndCauseKind = "MACRO_ZERO_DOMAIN" | "MACRO_CANDIDATES_EXHAUSTED"
  | "PREREQUISITE_RESERVATION_PRUNE" | "ORDINARY_ZERO_DYNAMIC_DOMAIN" | "ORDINARY_STARTS_REJECTED";

/** First material DFS dead-end. This is diagnostic only and never participates in search decisions. */
export interface StandaloneDeadEndCause {
  readonly kind: StandaloneDeadEndCauseKind;
  readonly phase: "MACRO" | "ORDINARY";
  readonly depth: number;
  readonly workItemId: string;
  readonly workItemKind: string;
  readonly taskIds: readonly string[];
  readonly domainBefore: number | null;
  readonly domainAfter: number;
  readonly candidatesEvaluated: number;
  readonly blockingTaskId: string | null;
  readonly blockingAuthority: string | null;
  readonly firstPlacementRejection: { readonly start: number; readonly reason: string;
    readonly blockingPlacedTaskId: string | null } | null;
  readonly ancestralDecisions: readonly { readonly taskId: string; readonly start: number }[];
  readonly technicalChainPolicyId?: string;
  readonly technicalChainPendingTaskIds?: readonly string[];
  readonly technicalChainFixedTaskIds?: readonly string[];
  readonly technicalChainContradiction?: "NO_FEASIBLE_PENDING_MATERIALIZATION";
}

export interface ExactItinerantPlanEvidence extends FutureCollectiveClosureEvidence {
  branchesExplored: number;
  coreBranches: number;
  standaloneBranches: number;
  jointGroupFullGridStarts: number;
  jointGroupAnalyticEligibleStarts: number;
  jointGroupAnalyticallyEliminatedStarts: number;
  jointGroupStartsEvaluated: number;
  technicalChainFullGridStarts:number;
  technicalChainAnalyticEligibleStarts:number;
  technicalChainAnalyticallyEliminatedStarts:number;
  technicalChainStartsEvaluated:number;
  technicalChainPreparedAuthorityBuilds:number;
  technicalChainPreparedAuthorityHits:number;
  technicalChainFixedPlacedScansAvoided:number;
  technicalChainDomainBuildMs:number;
  technicalChainFinalPlacementCheckMs:number;
  technicalChainCompleteCandidates:number;
  technicalChainActiveFrontierPeak:number;
  technicalChainAlternativesDeferred:number;
  technicalChainAlternativesRevisited:number;
  technicalChainDeferredQueuePeak:number;
  technicalChainDeferredPushes:number;
  technicalChainDeferredPops:number;
  technicalChainMacroDomainQueries:number;technicalChainMacroDomainCandidates:number;technicalChainMacroDomainCacheHits:number;technicalChainMacroDomainCacheMisses:number;
  technicalChainRootStartsConsidered:number;technicalChainRootStartsFeasible:number;technicalChainBranchesExplored:number;
  standaloneStartChecks: number;
  standaloneTaskSelections: number;
  standaloneZeroAlternativePrunes: number;
  standaloneBacktracks: number;
  standaloneMaximumDepth: number;
  standaloneCompleteLeafCount: number;
  macroCandidateCausalTraces: MacroCandidateCausalTrace[];
  macroCandidateCausalReconciliation: MacroCandidateCausalReconciliation;
  standaloneBranchesByDepth: Record<string, number>;
  standaloneSelectionsByTaskId: Record<string, number>;
  standaloneCandidateStartsByTaskId: Record<string, number>;
  standaloneFirstSelectedTaskId: string | null;
  standaloneDominantPathFirst20: Array<{ taskId: string; start: number }>;
  standaloneFirstDominantBlocker: { taskId: string; count: number } | null;
  standaloneBranchesBeforeFirstOrdinaryCompleteLeaf: number | null;
  standaloneBranchesAfterFirstOrdinaryCompleteLeaf: number;
  terminalTransportMaterializationAttempts: number;
  terminalTransportMaterializationFailures: number;
  terminalTransportWitness: TransportMaterializationEvidence | null;
  terminalCompletionRejectionsByCause: Record<TerminalCompletionRejectionCause, number>;
  firstTerminalCompletionRejection: TerminalCompletionRejection | null;
  terminalDeparturePrerequisitePhaseEntered:boolean;
  terminalDeparturePrerequisiteTaskIds:string[];
  terminalDeparturePrerequisiteBranches:number;
  terminalDeparturePrerequisiteFirstCompleteCandidateAtBranch:number|null;
  terminalDeparturePrerequisiteTerminalRejectsByCause:Record<string,number>;
  coreLeafTransportPrunes: number;
  transportContiguousStates: number;
  membershipFallbackEntered: number;
  coreLeafArrivalEvidence: TransportMaterializationEvidence["directions"][number] | null;
  firstHardValidCoreLeaf: {
    coreTaskCount: number;
    pipelineMaterializedTaskCount: number;
    immutableCoreTaskCount: number;
    protectedTaskCount: number;
    pipelineOnlySupportingExcludedCount: number;
    coreTasksByKind: Record<string, number>;
    pendingSupportingTotal: number;
    pendingOrdinaryNoTransport: number;
    pendingDynamicTransport: number;
    pendingTasksByKind: Record<string, number>;
  } | null;
  /** Read-only causal snapshot of the first core passed to standalone search. */
  firstHardValidCoreTasks: Array<{ id:string; kind:string; participantId?:string; spaceId:string; start:number; end:number; protected:boolean }>;
  supportingGeometryRepairAttempts: number;
  supportingGeometryRepairSuccesses: number;
  firstSupportingGeometryRepair: {
    capacityBlockedTaskId: string;
    deferredTaskIds: string[];
    protectedTaskIds: string[];
    branchesBefore: number;
    branchesConsumed: number;
    standaloneInvocations: number;
    outcome: string;
    /** Last authority observation; ABSTAIN can be nonfatal and is not a rejection proof. */
    lastAuthorityObservation: { authority: string; reason: string | null; taskIds: string[] } | null;
  } | null;
  coreCompleteLeavesEvaluated: number;
  coreLeavesRejectedByStandalone: number;
  standaloneSearchInvocations: number;
  standaloneBlockingTaskCounts: Record<string, number>;
  standaloneForwardChecks: number;
  standaloneForwardStartChecks: number;
  standaloneForwardWitnessesFound: number;
  standaloneForwardPrunes: number;
  standaloneForwardBlockingTaskCounts: Record<string, number>;
  standaloneForwardPrunesByDepth: Record<string, number>;
  standaloneForwardImpactedTaskChecks: number;
  standaloneForwardStaticEligibleStarts: number;
  standaloneForwardStaticEliminatedStarts: number;
  standaloneForwardFullGridStarts: number;
  standaloneForwardDynamicEligibleStarts: number;
  standaloneForwardDynamicEliminatedStarts: number;
  standaloneForwardDynamicNonemptyCertificates: number;
  standaloneForwardOracleChecks: number;
  standaloneForwardOracleFallbacks: number;
  standaloneForwardOracleFallbackReasons: Record<string, number>;
  standaloneForwardAnalyticEmptyDomainPrunes: number;
  standaloneForwardWitnessCacheHits: number;
  standaloneForwardWitnessCacheMisses: number;
  standaloneForwardWitnessCacheEntries: number;
  standaloneForwardWitnessBranchesAvoided: number;
  standaloneLeafSearchBranches: number;
  standaloneForwardBranches: number;
  firstStandaloneForwardPruneDepth: number | null;
  lastStandaloneForwardPruneDepth: number | null;
  lastStandaloneForwardBlockingTaskId: string | null;
  lastStandaloneForwardCausingCoreTaskIds: string[];
  lastStandaloneForwardCausingMainTaskId: string | null;
  lastStandaloneForwardCausingFeederStart: number | null;
  /** Canonical stable-ID list of the standalone tasks in the accepted plan, not DFS order. */
  selectedStandaloneTaskIds: string[];
  selectedStandaloneStarts: Record<string, number>;
  /** Actual dynamic DFS selection order along the accepted standalone path. */
  selectedStandaloneSelectionOrder: string[];
  coreFingerprint: string | null;
  selectedCoreFingerprint: string | null;
  defaultCoreFingerprint: string | null;
  fullFingerprint: string | null;
  remainingTaskIds: string[];
  coreStatus: ExactMainAndFeederCoreStatus;
  coreReasonCodes: string[];
  reasonCodes: string[];
  coreBacktracks: number;
  coreMaximumDepth: number;
  coreCompleteLeafCount: number;
  patternCandidatesExplored:number;
  timelineCandidatesExplored:number;
  mainCandidatesEvaluated:number;
  feederCandidatesEvaluated:number;
  /** Deepest block-closed, hard-valid partial frontier observed; unlike coreMaximumDepth,
   * this never counts an open main run whose feeder cohort has not closed. */
  deepestCoreDepthReached: number;
  deepestPartialScheduledTaskCount: number;
  deepestPartialMainRunsClosed: number;
  deepestPartialFeederRunsClosed: number;
  deepestPartialCoreTasksRemaining: number;
  deepestPartialFrontierFingerprint: string | null;
  architecturesChecked: number;
  architecturesStructurallyRejected: number;
  structuralRejectionsByReason: Partial<Record<MainFeederStructuralRejection, number>>;
  firstExactArchitecture: string | null;
  firstFeedableRunSizes: number[];
  feederOrderBranchesByArchitecture: Record<string, number>;
  feederOrderBranches: number;
  feederSlotAnalyticChecks: number;
  feederSlotAnalyticPrunes: number;
  feederSlotAnalyticAbstentions: number;
  feederSlotMatchingChecks: number;
  feederSlotMatchingPrunes: number;
  feederSlotMatchingEdgeChecks: number;
  feederSlotMatchingAugmentTraversals: number;
  feederSlotMatchingBranchesExplored: number;
  feederCohortCapacityChecks: number;
  feederCohortPrefixCapacityPrunes: number;
  feederCohortEddChecks: number;
  feederCohortEddEmptyPrunes: number;
  blockStartsEliminatedByCohortBound: number;
  feederCohortContiguousWindowChecks: number;
  feederCohortContiguousWindowPrunes: number;
  blockStartsEliminatedByContiguousWindowBound: number;
  contiguousWindowSkippedByTransition: number;
  contiguousWindowSkippedByAuthorizedMeal: number;
  feederRunOptimisticChecks: number;
  feederRunOptimisticPrunes: number;
  feederRunOptimisticPrunesByDepth: Record<string, number>;
  feederRunPrePartialChecks: number;
  feederRunPrePartialPrunes: number;
  feederRunPrePartialPrunesByDepth: Record<string, number>;
  feederRunPreFeederChecks: number;
  feederRunPreFeederPrunes: number;
  feederRunPreFeederPrunesByDepth: Record<string, number>;
  feederRunOptimisticSkippedByTransition: number;
  feederRunOptimisticSkippedByAuthorizedMeal: number;
  residualMatchingInvocations: number;
  residualMatchingFullBuilds: number;
  residualMatchingIncrementalUpdates: number;
  residualMatchingEdgeCacheHits: number;
  residualMatchingEdgeCacheMisses: number;
  residualMatchingPositionChecks: number;
  residualMatchingAugmentTraversals: number;
  residualMatchingBranchesExplored: number;
  residualMatchingPrunes: number;
  residualMatchingRepairs: number;
  residualMatchingRepairFailures: number;
  futureReservationStructures:number;futureReservationWitnessesEvaluated:number;futureReservationRootOrdersEvaluated:number;
  futureReservationCandidatesRejectedByOtherReservations:number;futureReservationCandidatesRejectedByNoBundleMatching:number;
  futureReservationBundleMatchingAttempts:number;futureReservationPerfectMatchings:number;futureReservationSelectedFingerprint:string|null;
  architecturesTriedWithFutureReservation:number;bundleEdgesBeforeReservation:number;bundleEdgesRejectedByReservation:number;
  bundleEdgesAfterReservation:number;residualDfsEntered:boolean;residualDfsBranchesBeforeFirstSolution:number|null;
  architecturesEnumerated:number;architecturesPrepared:number;futureWitnessesTriedByArchitecture:Record<string,number>;
  preparedBundleEdges:number;reservationFilteredEdges:number;perfectMatchingsByArchitecture:Record<string,number>;
  hardGateRejectsByArchitecture:Record<string,number>;structuralSearchExhausted:boolean;branchesBeforeResidualDfs:number|null;
  structuralSearchBudgetExhausted:boolean;structuralArchitecturesFullyVisited:number;structuralFutureDomainsFullyVisited:number;
  structuralCandidatesProducedBeforeBudgetExhaustion:number;
  conditionedLeafFutureRevalidations:number;conditionedLeafFutureRevalidationPasses:number;
  conditionedLeafFutureRevalidationRejects:number;genericFutureAssessSkippedForConditionedLeaf:number;
  structuralCandidateFingerprintAtHardGate:string|null;structuralCandidateFingerprintAtContinuation:string|null;
  structuralCandidateFingerprintBeforeStandalone:string|null;
  selectedArchitectureFingerprint:string|null;selectedFutureReservationFingerprint:string|null;
  mainPatternCountGenerated:number;mainPatternGenerationExhausted:boolean;mainPatternsVisited:number;timelinesGenerated:number;
  architectureStructuralProofChecks:number;architectureStructuralProofRejects:number;architectureStructuralRejectsByReason:Record<string,number>;
  nominalPipelineWitnessChecks:number;nominalPipelineWitnessFeasible:number;nominalPipelineWitnessInfeasible:number;
  nominalPipelineWitnessInconclusive:number;nominalPipelineWitnessRejectsByReason:Record<string,number>;
  selectedPipelineWitnessDiagnostic:AnonymousPipelineWitnessDiagnostic|null;
  selectedPipelineWitnessAuthority:PipelineWitnessAuthorityDiagnostic|null;
  continuityRejects:number;authorizedArchitecturesYielded:number;
  participantBundleEdgesChecked:number;participantBundleEdgesPruned:number;participantBundleEdgesAbstained:number;
  firstParticipantBundleEdgePrune:({mainTaskId:string;position:number;mainStart:number;mainEnd:number}&ParticipantFutureReservationProbe)|null;
  mainWitnessChoicesFollowed: number;
  mainWitnessFallbacks: number;
  mainRunWitnessAttempts: number;
  mainRunWitnessRepairs: number;
  mainRunEquivalentOrdersCollapsed: number;
  bundleMatchingAttempts: number;
  bundleMatchingRepairs: number;
  bundleMatchingMaterializations: number;
  bundleHardValidationRejects: number;
  bundleCertifiedRepairs: number;
  bundleForbiddenEdges: string[];
  bundleRepairSequence: Array<{causingTaskId:string;oldPosition:number;forbiddenEdge:string;newPosition:number|null}>;
  bundleTerminalCause: string | null;
  bundleNogoodsCreated:number; bundleNogoodBranches:number; bundleNogoodDeduplications:number; bundleNogoodRepairsSucceeded:number;
  conflictEdges:string[]; conflictBackjumps:number; suffixDepthsSkipped:number;
  fixedMainBundlePathEntered:boolean;protectedMainCount:number;protectedMainArchitectureFingerprint:string|null;
  protectedMainSlots:number[];fixedMainBundleGraphPrepared:boolean;fixedMainBundlePreparedEdges:number;
  fixedMainBundleCandidatePositions:Record<string,number[]>;fixedMainBundleZeroDomainTaskIds:string[];
  fixedMainBundleParticipantEdgeChecks:number;fixedMainBundleParticipantEdgePrunes:number;
  fixedMainBundleFirstParticipantEdgePrune:unknown;
  fixedMainBundleMatchingAttempts:number;fixedMainBundlePerfectMatchingFound:boolean;fixedMainBundleHardGatePasses:number;
  fixedMainBundleHardGateRejects:number;fixedMainBundleTaskCount:number;fixedMainBundleTasksByKind:Record<string,number>;
  fixedSupportingGeometryFingerprint:string|null;fixedSupportingMatchingAttempts:number;fixedSupportingEdges:number;
  fixedSupportingZeroDomainTaskIds:string[];fixedSupportingPerfectMatchingFound:boolean;fixedSupportingRematchedIdentityCount:number;
  fixedSupportingArrivalResult:string|null;fixedSupportingArrivalPacketCount:number;fixedSupportingSameGeometryRescued:boolean;
  fixedSupportingGeometriesAttempted:import("./exactMainAndFeederCore").ExactMainAndFeederCoreEvidence["fixedSupportingGeometriesAttempted"];
  fixedSupportingGeometryFailure:string|null;fixedSupportingGlobalFailure:string|null;
  fixedSupportingWitnessDiagnostic:PipelineWitnessObservation|null;
  fixedSupportingWitnessAuthority:PipelineWitnessAuthorityDiagnostic|null;
  priorFutureStructuralWitnessFound:boolean;priorFutureStructuralWitnessFingerprint:string|null;
  priorFutureStructuralWitnessRevalidation:"PASS"|"REJECT"|"STALE"|null;priorFutureStructuralWitnessReused:boolean;
  priorFutureStructuralWitnessRejectCause:import("./anonymousPipelineWitness").FutureStructuralWitnessRejectCause|null;
  priorFutureStructuralWitnessRejectDetails:Readonly<Record<string,unknown>>|null;
  priorFutureStructuralWitnessFallbackEntered:boolean;
  futureStructuralWitnesses:import("./anonymousPipelineWitness").FutureStructuralWitness[];
  futureWitnessSet:FutureWitnessSetEvidence;
  futureWitnessSetCandidateTraces:Array<{geometryFingerprint:string;frontiers:Record<string,number>;outcome:import("./futureStructuralWitnessSet").FutureWitnessOutcome;
    attempts:number;roundAlternatives:number;itineraryAlternatives:number;mealPrunes:number;branches:number;setFingerprint:string|null}>;
  futureRoundWitnessSearchInvocations:number;futureRoundWitnessStructuralCandidates:number;
  futureRoundWitnessCompleteMatchings:number;futureRoundWitnessParticipantFutureChecks:number;
  futureRoundWitnessPrerequisiteChecks:number;futureRoundWitnessBranchesConsumed:number;
  futureItinerantWitnessSearchInvocations:number;futureItinerantWitnessCandidates:number;
  futureItinerantWitnessBranchesConsumed:number;futureItinerantWitnessesFound:number;
  futureItinerantWitnessFingerprint:string|null;futureItinerantWitnessSupportingFingerprint:string|null;
  futureItinerantWitnessRejectsByAuthority:Record<string,number>;futureItinerantWitnessFirstReject:Readonly<Record<string,unknown>>|null;
  futureItinerantPriorRevalidation:"PASS"|"STALE"|"REJECT"|"BUDGET_EXHAUSTED"|null;
  futureItinerantPriorRejectCause:string|null;futureItinerantPriorPreviousFrontier:number|null;futureItinerantPriorCurrentFrontier:number|null;
  futureItinerantPriorRevalidationMs:number;futureItinerantPrerequisiteSearchMs:number;futureItinerantStructuralSearchMs:number;
  futureItinerantParticipantFutureMs:number;futureItinerantTechnicalFutureMs:number;futureItinerantParticipantMealsMs:number;
  futureItinerantOperationalMealsMs:number;
  priorItinerantWitnessFound:boolean;priorItinerantWitnessRevalidation:"PASS"|"STALE"|"REJECT"|"BUDGET_EXHAUSTED"|null;
  priorItinerantWitnessRejectCause:string|null;priorItinerantWitnessReused:boolean;priorItinerantWitnessFallbackEntered:boolean;
  ephemeralSupportingPlacements:import("./anonymousPipelineWitness").FutureStructuralWitnessV1["ephemeralSupportingPlacements"];
  acceptedSupportingPlacements:ScheduledTask[];branchesBeforeCurrentContinuation:number|null;
  protectedMainSlotChecks:number;protectedMainSlotMismatches:number;pipelineTasksRemovedFromStandalone:number;
  pendingBeforeFixedMainBundle:number;pendingAfterFixedMainBundle:number;legacyFixedFeederFallbackEntered:boolean;
  legacyFixedFeederFallbackReason:string|null;firstFixedMainBundleRejection:string|null;
  firstFixedMainBundleHardGateDiagnostic:import("./exactMainAndFeederCore").ExactMainAndFeederCoreEvidence["firstFixedMainBundleHardGateDiagnostic"];
  feederMatchingWitnessMaterializations: number;
  feederMatchingWitnessRepairs: number;
  feederMatchingEquivalentOrdersCollapsed: number;
  feederOrderFallbacks: number;
  forcedMainSingletonChecks: number;
  forcedMainSingletonChoices: number;
  forcedMainSiblingAlternativesEliminated: number;
  forcedMainSingletonDeadEnds: number;
  mainCandidatesExploredBeforeCohort: Record<string, number>;
  lastExhaustionPhase: "CORE" | "STANDALONE" | null;
  completePlansObserved: number;
  completeIncumbentReplacements: number;
  completeSelectionMode: StandaloneCompletionSelection;
  completeSelectionStoppedByBudget: boolean;
  firstCompleteFingerprint: string | null;
  selectedCompleteFingerprint: string | null;
  firstCompleteQuality: CompleteParticipantQuality | null;
  selectedCompleteQuality: CompleteParticipantQuality | null;
  setupBlockBranchesExplored: number;
  setupBlockSearchInvocations: number;
  setupBlockStartsExplored: number;
  setupBlockCompleteCandidateCount: number;
  setupBlockBudgetExhaustions: number;
  setupBlockMatchingAttempts: number;
  setupBlockMatchingSuccesses: number;
  setupBlockPermutationBranchesAvoided: number;
  preferredResourceUnit: { unitId:string; memberTaskCount:number; resourceTaskCount:number; setupTaskCount:number;
    sharedResourceId:string; geometryCount:number; matchingAttempts:number; matchingSuccesses:number;
    supportingRematches:number; selectedPresence:[number,number,number]|null;rawCompatibleEdges:number;futureEdgeChecks:number;
    analyticPrunedEdges:number;matchingTraversals:number;causalForbiddenEdges:number;incrementalRepairs:number;
    mealEdgeChecks:number;mealPrunedEdges:number;
    mealAwareGeometries:number;mealReservationVariants:number;
    selectedOperationalMealReservations:Array<{id:string;start:number;end:number}>;
    firstMealPrunedEdge:{taskId:string;spotId:string;start:number;blockingMealTaskId:string|null}|null;
    blockingMealTaskId:string|null;
    geometriesRescuedByRematching:number;firstMatchingWitness:Record<string,string>|null;
    selectedMatchingWitness:Record<string,string>|null;terminalFutureResult:"PASS"|"PRUNE"|"ABSTAIN"|"NOT_CHECKED" } | null;
  setupFamilyOrderCandidateCountsBySpaceId: Record<string, Record<string, number>>;
  selectedSetupFamilySequenceBySpaceId: Record<string, string[]>;
  selectedSetupPreparationIds: string[];
  roundSynchronizationSearchInvocations: number;
  roundSynchronizationStartCandidates: number;
  roundSynchronizationAssignmentBranches: number;
  roundSynchronizationAssignmentChecks: number;
  roundSynchronizationCompleteAssignments: number;
  roundSynchronizationBacktracks: number;
  roundSynchronizationZeroAlternativePrunes: number;
  roundSynchronizationSharedOperationalMealPolicyIds:string[];
  roundSynchronizationBreakVariantsConsidered:number;
  roundSynchronizationSelectedBreakIntervals:Array<{policyId:string;start:number;end:number}>;
  roundSynchronizationMealAwareShapesFeasible:number;
  roundSynchronizationNoBreakHolePrunes:number;
  roundSynchronizationRawCompatibleEdges:number;
  roundSynchronizationFutureEdgeChecks:number;
  roundSynchronizationAnalyticPrunedEdges:number;
  roundSynchronizationCausalForbiddenEdges:number;
  roundSynchronizationIncrementalRepairs:number;
  roundSynchronizationShapesRescuedByRematching:number;
  roundSynchronizationMatchingTraversals:number;
  roundSynchronizationTerminalFutureResult:"PASS"|"PRUNE"|"ABSTAIN"|"NOT_CHECKED";
  roundSynchronizationMatchingWitnesses:ExactRoundSynchronizationEvidence["matchingWitnesses"];
  totalesMacroCandidates: number;
  totalesMatchingAttempts: number;
  totalesMatchingSuccesses: number;
  totalesAssignmentBranchesAvoided: number;
  criticalResourceBranches: number;
  criticalResourceMacroCandidates: number;
  criticalResourceAssignments: number;
  macroUnitsSelected: number;
  macroSelectionOrder: string[];
  macroSelectionReason: string[];
  macroDomainSizes: Record<string, number>;
  macroSelectionSteps: Array<{ selected: string; reason: string; candidates: Array<{ id: string; kind: string; domainSize: number; domainMeasure: string; domainExact: boolean; hardResourceAvailabilityMinutes: number; totalDuration: number; affectedTaskCount: number; structuralCandidateCount?: number; matchingFeasibleCandidateCount?: number }> }>;
  macroPendingPrerequisiteForwardChecks:number;macroPendingPrerequisiteTasksChecked:number;macroPendingPrerequisiteIndividualDomainChecks:number;
  macroPendingPrerequisiteCollectiveCapacityChecks:number;macroPendingPrerequisiteObligationsChecked:number;macroPendingPrerequisiteCollectiveCapacityPrunes:number;
  macroPendingPrerequisiteJointChecks:number;macroPendingPrerequisiteCacheHits:number;macroPendingPrerequisiteCacheMisses:number;
  macroPendingPrerequisitePrunes:number;macroPendingPrerequisiteIndividualZeroDomainPrunes:number;macroPendingPrerequisiteJointInfeasiblePrunes:number;
  macroPendingPrerequisiteWitnesses:number;macroPendingPrerequisiteChecksByDepth:Record<string,number>;
  macroPendingPrerequisiteBlockingTaskCounts:Record<string,number>;macroPendingPrerequisiteCausingMacroUnitCounts:Record<string,number>;
  macroPendingPrerequisiteFirstPrune:{causingMacroUnitId:string;blockingTaskId:string;macroDepth:number;deadline:number|null;failure:string;authorityId:string|null;demandMinutes:number|null;freeCapacityMinutes:number|null}|null;
  ordinaryDomainQueries: number;
  ordinaryAnalyticDomainBuilds: number;
  ordinaryAnalyticEligibleStarts: number;
  ordinaryExactStartEnumerations: number;
  ordinaryExactStartChecks: number;
  ordinaryDomainCacheHits: number;
  ordinaryDomainCacheMisses: number;
  ordinaryDomainRecomputations: number;
  ordinaryMRVSelections: number;
  ordinaryBranchesExplored: number;
  itinerantAgendaPoolOperations:number;
  itinerantAgendaUnitVariantsByTaskId:Record<string,number>;
  itinerantAgendaStaticStarts:number;
  itinerantAgendaDynamicStarts:number;
  itinerantAgendaBranchesBeforeSelection:number|null;
  itinerantAgendaBranches:number;
  itinerantAgendaCandidates:number;
  itinerantAgendaAssignmentsAndOrders:number;
  itinerantAgendaEventBoundaryStarts:number;
  itinerantAgendaFirstCompleteBranch:number|null;
  ordinaryIndividualForwardChecks: number;
  ordinaryIndividualForwardTasksChecked: number;
  ordinaryIndividualForwardExactDomainChecks: number;
  ordinaryIndividualForwardStartsChecked: number;
  ordinaryIndividualForwardZeroDomainPrunes: number;
  ordinaryIndividualForwardUnrelatedSkips: number;
  ordinaryIndividualForwardWitnesses: number;
  ordinaryIndividualForwardCausingTaskCounts: Record<string, number>;
  ordinaryIndividualForwardBlockingTaskCounts: Record<string, number>;
  ordinaryIndividualForwardChecksByDepth: Record<string, number>;
  ordinaryIndividualForwardFirstPrune: { causingTaskId: string; blockingTaskId: string; depth: number } | null;
  corePrerequisiteReservationChecks: number;
  corePrerequisiteReservationPrunes: number;
  ordinaryPrerequisiteReservationChecks: number;
  ordinaryPrerequisiteReservationPrunes: number;
  firstPrerequisiteReservationPrune: { phase:"CORE"|"ORDINARY"; causingTaskId:string; blockingPrerequisiteId:string; depth:number; deadline:number; duration:number; earliestFeasibleStart:number|null; latestFeasibleStart:number|null; failure:"INDIVIDUAL_ZERO_DOMAIN" } | null;
  firstStandaloneDeadEndCause: StandaloneDeadEndCause | null;
  standaloneBlockingTaskDetails: Record<string, { taskId: string; participantId: string | null; spaceId: string; duration: number; requiredResourceIds: string[]; setupFamilyId: string | null; kind: string }>;
  selectedRoundPreparationIds: string[];
  participantMealBranchesExplored:number; participantMealFutureFeasibilityChecks:number; participantMealFutureInfeasibleBranches:number; participantMealCheapProbes:number; participantMealAffectedObligationsChecked:number; participantMealAnalyticDomainBuilds:number; participantMealLogicalGridStarts:number; participantMealAnalyticallyEliminatedStarts:number; participantMealActuallyEvaluatedStarts:number; participantMealZeroDomainPrunes:number; participantMealAnalyticCollectivePrunes:number; participantMealExactSearchesAvoided:number; participantMealExactMaterializations:number; participantMealBlockingTaskIds:string[]; participantMealAcceptedWitnessFingerprint:string|null; participantMealFinalSelectionOrder:string[]; participantMealAttemptedSelectionTrace:string[];
  firstParticipantMealFuturePrune:{ phase:"CORE"|"STANDALONE"|"MACRO"; causingTaskId:string; scheduledCandidateStart:number;
    blockingMealTaskId:string; participantId:string; candidateCount:number; domainResult:"ZERO_DOMAIN"|"ANALYTIC_COLLECTIVE_INFEASIBLE";
    reasonCodes:string[] }|null;
  participantFutureReservationChecks:number; participantFutureReservationPasses:number; participantFutureReservationPrunes:number;
  participantFutureReservationAbstentions:number; participantFutureAffectedParticipants:number;
  participantFutureTasksChecked:number; participantFutureMealsChecked:number; participantFutureIndividualDomainChecks:number;
  participantFutureIndividualZeroDomainPrunes:number; participantFutureJointTaskMealChecks:number;
  participantFutureJointTaskMealPrunes:number; participantFutureCollectiveChecks:number; participantFutureCollectivePrunes:number;
  participantFutureCollectivePasses:number;
  participantFutureCompatiblePairChecks:number; participantFutureAnalyticChecks:number; participantFutureBranchesConsumed:number;
  participantFutureDominatedLaterStartsSkipped:number;participantFutureEarliestDominanceBranches:number;
  participantFutureMacroAnalyticChecks:number;participantFutureMacroAnalyticPrunes:number;participantFutureMacroAnalyticAbstentions:number;
  participantFutureTerminalExactChecks:number;participantFutureTerminalExactPasses:number;participantFutureTerminalExactPrunes:number;
  participantFutureTerminalExactAbstentions:number;participantFutureTerminalExactBranches:number;
  firstParticipantFutureTerminalExact:ParticipantFutureReservationProbe|null;
  firstParticipantFutureReservationPrune:({phase:"CORE"|"STANDALONE"|"MACRO";causingTaskId:string;causingCandidateStart:number;depth:number;
    macroUnitId?:string;addedTaskIds?:string[];branchesAtPrune?:number} & ParticipantFutureReservationProbe)|null;
  participantFutureUnreachableDependencyIds:string[];
  technicalChainFutureReservationChecks:number; technicalChainFutureReservationPasses:number;
  technicalChainFutureReservationPrunes:number; technicalChainFutureReservationAbstentions:number;
  technicalChainFutureBranchesConsumed:number;
  firstTechnicalChainFutureReservationPrune:({phase:"CORE"|"STANDALONE"|"MACRO";causingTaskId:string|null;causingCandidateStart:number|null;depth:number} & TechnicalChainFutureReservationProbe)|null;
  firstMultiDecisionConflict:TechnicalChainFutureReservationProbe|null;
  preparedFutureTechnicalChainEvidence:PreparedFutureTechnicalChainEvidence;
  operationalMealFutureReservation:PreparedOperationalMealEvidence;
  fixedMainFeederMealChecks:number;fixedMainFeederMealPasses:number;fixedMainFeederMealPrunes:number;
  firstFixedMainFeederMealPrune:{feederTaskId:string;mainTaskId:string;participantId:string|null;coachId:string|null;
    feederStart:number;feederEnd:number;policyId:string;candidateCountBefore:number|null;candidateCountAfter:number|null;
    remainingIntervalsBefore:readonly {start:number;end:number}[];remainingIntervalsAfter:readonly {start:number;end:number}[];
    witnessBefore:string|null;depth:number}|null;
  standaloneEntryMealWitness:string|null;
  causalDiagnostic:ExactCoreCausalDiagnostic|null;
}

export interface MacroCandidateCausalTrace {
  readonly fingerprint:string;readonly macroUnitId:string;readonly macroUnitKind:string;readonly depth:number;
  readonly candidate:{readonly starts:readonly {taskId:string;start:number;end:number}[];readonly domainSize:number;
    readonly structuralCandidateCount:number|null;readonly matchingFeasibleCandidateCount:number|null;readonly roundMatchingResult:"MATCHING_FEASIBLE"|"NOT_APPLICABLE"};
  pendingPrerequisiteReservation:{status:"PASS"|"PRUNE";cause:string|null;blockingTaskId:string|null;authorityId:string|null};
  participantFuture:{status:"PASS"|"PRUNE"|"ABSTAIN"|"NOT_CHECKED";cause:string|null};
  participantMealFuture:{status:"PASS"|"PRUNE"|"NOT_CHECKED";cause:string|null};
  operationalMealFuture:{status:"PASS"|"PRUNE"|"ABSTAIN"|"NOT_CHECKED";cause:string|null};
  enteredRecurseAfterMacro:boolean;selectedAnotherMacroUnit:boolean;enteredOrdinarySearch:boolean;
  firstDescendantDeadEnd:StandaloneDeadEndCause|null;firstOrdinaryRejection:StandaloneDeadEndCause|null;reachedCompleteLeaf:boolean;
  terminalParticipantFuture:{status:"PASS"|"PRUNE"|"ABSTAIN"|"NOT_CHECKED";cause:string|null};
  outcome:"PRUNED"|"DEAD_ENDED_BY_AUTHORITY"|"ENTERED_RESIDUAL_OR_TERMINAL";
}
export interface MacroCandidateCausalReconciliation {total:number;pruned:number;deadEndedByAuthority:number;enteredResidualOrTerminal:number}

export interface ExactItinerantPlanResult {
  status: ExactItinerantPlanStatus;
  complete: boolean;
  scheduledTasks: ScheduledTask[];
  scheduledSetupPreparations: ScheduledSetupPreparation[];
  scheduledRoundPreparations: ScheduledRoundPreparation[];
  scheduledSpaceMeals: ScheduledSpaceMeal[];
  scheduledParticipantMeals: ScheduledParticipantMeal[];
  scheduledResourceMeals: ScheduledResourceMeal[];
  scheduledOperationalMeals: ScheduledOperationalMeal[];
  scheduledItinerantUnitMeals: ScheduledItinerantUnitMeal[];
  remainingTaskIds: string[];
  evidence: ExactItinerantPlanEvidence;
}

function recordParticipantFutureReservation(evidence:ExactItinerantPlanEvidence,probe:ParticipantFutureReservationProbe):void {
  evidence.participantFutureReservationChecks++;
  evidence.participantFutureReservationPasses+=Number(probe.status==="PASS");
  evidence.participantFutureReservationPrunes+=Number(probe.status==="PRUNE");
  evidence.participantFutureReservationAbstentions+=Number(probe.status==="ABSTAIN");
  evidence.participantFutureAffectedParticipants+=probe.affectedParticipants.length;
  evidence.participantFutureTasksChecked+=probe.affectedFutureTasksChecked;
  evidence.participantFutureMealsChecked+=probe.affectedMealsChecked;
  evidence.participantFutureIndividualDomainChecks+=probe.individualDomainChecks;
  evidence.participantFutureIndividualZeroDomainPrunes+=probe.individualZeroDomainPrunes;
  evidence.participantFutureJointTaskMealChecks+=probe.jointTaskMealChecks;
  evidence.participantFutureJointTaskMealPrunes+=probe.jointTaskMealPrunes;
  evidence.participantFutureCollectiveChecks+=probe.collectiveChecks;
  evidence.participantFutureCollectivePasses+=probe.collectivePasses;
  evidence.participantFutureCollectivePrunes+=probe.collectivePrunes;
  evidence.participantFutureCompatiblePairChecks+=probe.compatiblePairChecks;
  evidence.participantFutureAnalyticChecks+=probe.analyticChecks;
  evidence.participantFutureBranchesConsumed+=probe.branchesConsumed;
  evidence.participantFutureDominatedLaterStartsSkipped+=probe.dominatedLaterStartsSkipped;
  evidence.participantFutureEarliestDominanceBranches+=probe.earliestDominanceBranches;
}
function recordTechnicalChainFutureReservation(evidence:ExactItinerantPlanEvidence,probe:TechnicalChainFutureReservationProbe):void {
  evidence.technicalChainFutureReservationChecks++;
  evidence.technicalChainFutureReservationPasses+=Number(probe.status==="PASS");
  evidence.technicalChainFutureReservationPrunes+=Number(probe.status==="PRUNE");
  evidence.technicalChainFutureReservationAbstentions+=Number(probe.status==="ABSTAIN");
  evidence.technicalChainFutureBranchesConsumed+=probe.branchesConsumed;
}

type StandaloneOutcome = "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED";
interface Positions { task: Task; variants: Array<{ task:Task; starts:number[] }>; starts: number[]; effectiveDeadline: number }
export type StandaloneForwardStartDomainMode = "STATIC_DOMAIN" | "FULL_GRID";
export type JointGroupStartDomainMode = "ANALYTIC_DOMAIN" | "FULL_GRID";
type ClosedStartInterval = { start: number; end: number };
export interface StandaloneForwardStaticDomain {
  readonly intervals: ReadonlyArray<Readonly<ClosedStartInterval>>;
  readonly eligibleStartCount: number;
  starts(): Generator<number, void, undefined>;
}
export type StandaloneForwardDynamicDomain = StandaloneForwardStaticDomain;
interface StandaloneSearchResult { outcome: StandaloneOutcome | "INCONCLUSIVE"; tasks: ScheduledTask[] | null; preparations: ScheduledSetupPreparation[]; roundPreparations: ScheduledRoundPreparation[]; selectionOrder: string[]; participantMeals: ParticipantMealWitness | null; operationalMeals: OperationalMealWitness | null; futureRoundWitnesses:FutureRoundSynchronizationWitnessV1[];futureItinerantWitnesses:FutureItinerantAgendaWitnessV1[] }

const byId = <T extends { id: string }>(a: T, b: T): number => a.id.localeCompare(b.id);
const orderScheduled = (tasks: ScheduledTask[]): ScheduledTask[] =>
  [...tasks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

const causalHash=(value:unknown):string=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonicalIntervals=(intervals:ReadonlyArray<Readonly<ClosedStartInterval>>)=>intervals.map(({start,end})=>({start,end}));

/** Complete projection of the authorities read by the block-closed standalone placement check. */
export function standaloneForwardAuthoritySignature(problem:PlannerNextProblem,task:Task,placed:ScheduledTask[],meals:ScheduledSpaceMeal[],staticDomain:StandaloneForwardStaticDomain,startDomainMode:StandaloneForwardStartDomainMode):string{
  const resourceIds=[...(task.requiredResourceIds??[])].sort();
  const relevant=placed.filter(other=>task.dependencies.includes(other.id)||other.dependencies.includes(task.id)
    ||(task.participantId!==undefined&&other.participantId===task.participantId)
    ||(task.coachId!==undefined&&other.coachId===task.coachId)||task.spaceId===other.spaceId
    ||resourceIds.some(id=>(other.requiredResourceIds??[]).includes(id))).sort(byId).map(other=>{const sharedResources=resourceIds.filter(id=>(other.requiredResourceIds??[]).includes(id));return {
      id:other.id,start:other.start,end:other.end,spaceId:other.spaceId,participantId:other.participantId??null,
      coachId:other.coachId??null,requiredResourceIds:[...(other.requiredResourceIds??[])].sort(),dependencies:[...other.dependencies].sort(),kind:other.kind,
      participantTransition:task.participantId!==undefined&&other.participantId===task.participantId
        ?[participantGapMinutes(problem,task,other),participantGapMinutes(problem,other,task)]:[0,0],
      coachTransitions:task.spaceId!==other.spaceId&&task.coachId!==undefined&&other.coachId===task.coachId
        ?[effectiveCoachTransitionMinutes(problem,task.coachId,task.spaceId,other.spaceId),effectiveCoachTransitionMinutes(problem,task.coachId,other.spaceId,task.spaceId)]:[0,0],
      resourceTransitions:task.spaceId===other.spaceId?[]:sharedResources.map(id=>[id,effectiveResourceTransitionMinutes(problem,id)]),
    }});
  const canonicalAvailability=task.availability?.map(({start,end})=>({start,end})).sort((a,b)=>a.start-b.start||a.end-b.end);
  return causalHash({task:{id:task.id,kind:task.kind,duration:task.duration,spaceId:task.spaceId,
    participantId:task.participantId??null,coachId:task.coachId??null,itinerantUnitId:task.itinerantUnitId??null,
    requiredResourceIds:resourceIds,dependencies:[...task.dependencies].sort(),availability:canonicalAvailability},
    staticDomain:canonicalIntervals(staticDomain.intervals),gridAnchor:problem.day.start,startDomainMode,
    occupations:relevant,meals:meals.filter(meal=>meal.spaceId===task.spaceId||problem.resources.some(resource=>resourceIds.includes(resource.id)&&resource.assignedSpaceId===meal.spaceId)).sort(byId)});
}

/** Exact placed-independent interval domain with a lazy projection onto the original day-relative grid. */
export function standaloneForwardStaticDomain(problem: PlannerNextProblem, task: Task,
  scheduledSpaceMeals: ScheduledSpaceMeal[] = []): StandaloneForwardStaticDomain {
  return exactTaskStaticStartDomain(problem, task, scheduledSpaceMeals);
}

/** Exact interval projection of every placed-task authority in canonical placement. */
export function standaloneForwardDynamicDomain(problem: PlannerNextProblem, task: Task,
  placed: ScheduledTask[], staticDomain = standaloneForwardStaticDomain(problem, task)): StandaloneForwardDynamicDomain {
  return exactTaskDynamicStartDomain(problem, task, placed, staticDomain);
}

/** Exact common start domain for synchronized members against all materialized authorities. */
export function standaloneJointGroupStartDomain(problem: PlannerNextProblem, tasks: Task[],
  placed: ScheduledTask[], scheduledSpaceMeals: ScheduledSpaceMeal[] = []): StandaloneForwardDynamicDomain {
  if (tasks.length === 0) return exactStartDomainFromIntervals(problem, []);
  let common = standaloneForwardDynamicDomain(problem, tasks[0]!, placed,
    standaloneForwardStaticDomain(problem, tasks[0]!, scheduledSpaceMeals)).intervals.map((interval) => ({ ...interval }));
  for (const task of tasks.slice(1)) {
    const member = standaloneForwardDynamicDomain(problem, task, placed,
      standaloneForwardStaticDomain(problem, task, scheduledSpaceMeals));
    common = intersectExactStartIntervals(common, member.intervals.map((interval) => ({ ...interval })));
  }
  return exactStartDomainFromIntervals(problem, common);
}

function effectiveDeadline(problem: PlannerNextProblem, task: Task): number {
  const participant = task.kind === "technical" ? undefined : problem.participants.find(({ id }) => id === task.participantId);
  const space = problem.spaces.find(({ id }) => id === task.spaceId);
  const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((resource) => resource.id === id));
  const windows = [task.availability, participant?.availability, space?.availability, ...resources.map((resource) => resource?.availability)]
    .filter((value): value is Array<{ start: number; end: number }> => Array.isArray(value));
  return Math.min(problem.day.end, ...windows.flat().map(({ end }) => end));
}

function unsupportedShapeReasons(problem: PlannerNextProblem, pending: Task[], coreIds: Set<string>): string[] {
  const anchoredIds = anchoredTaskIds(problem), reasons: string[] = [];
  void coreIds;
  const technicalChainIds = new Set(getTechnicalChains(pending,problem.technicalChains).flat().map(({ id }) => id));
  for (const task of [...pending].sort(byId)) {
    const space = problem.spaces.find(({ id }) => id === task.spaceId);
    const isSetupTask = task.setupFamilyId !== undefined;
    if (task.kind !== "auxiliary" && !technicalChainIds.has(task.id)) reasons.push(`UNSUPPORTED_STANDALONE_TASK_KIND:${task.id}`);
    if (anchoredIds.has(task.id)) reasons.push(`UNSUPPORTED_PENDING_ANCHORED_TASK:${task.id}`);
    if (isSetupTask && space?.setupPolicy === undefined) reasons.push(`UNSUPPORTED_STANDALONE_SETUP:${task.id}`);
    if (space?.secondaryContinuity === "REQUIRED" && !isSetupTask)
      reasons.push(`UNSUPPORTED_STANDALONE_REQUIRED_BLOCK:${task.id}`);
    if (space?.mealPolicy !== undefined)
      reasons.push(`UNSUPPORTED_STANDALONE_SECONDARY_MEAL:${task.id}`);
  }
  return [...new Set(reasons)].sort();
}

/** Pure impact filter only; canPlaceTask remains the authority for actual validity. */
export function tasksCanAffectEachOther(a: Task, b: Task): boolean {
  const aParticipant = a.kind === "technical" ? undefined : a.participantId;
  const bParticipant = b.kind === "technical" ? undefined : b.participantId;
  const aCoach = a.kind === "technical" ? undefined : a.coachId;
  const bCoach = b.kind === "technical" ? undefined : b.coachId;
  return (aParticipant !== undefined && aParticipant === bParticipant)
    || (aCoach !== undefined && aCoach === bCoach)
    || a.spaceId === b.spaceId
    || (a.requiredResourceIds ?? []).some((id) => (b.requiredResourceIds ?? []).includes(id))
    || a.dependencies.includes(b.id) || b.dependencies.includes(a.id);
}

function searchStandaloneForCoreCandidate(sourceProblem: PlannerNextProblem, coreTasks: ScheduledTask[], coreMeals: ScheduledSpaceMeal[],
  pending: Task[], ledger: ExactSearchLedger, evidence: ExactItinerantPlanEvidence,
  selection: StandaloneCompletionSelection, jointGroupStartDomainMode: JointGroupStartDomainMode,
  technicalChainStartDomainMode:TechnicalChainStartDomainMode,
  acceptsValidation?:ExactItinerantPlanSearchOptions["acceptsValidation"],initialOperationalMealWitness:OperationalMealWitness|null=null,
  fixedSetupPreparations:readonly ScheduledSetupPreparation[]=[],fixedRoundPreparations:readonly ScheduledRoundPreparation[]=[],
  selectedMainMealStart?:number,priorWitnesses:readonly FutureStructuralWitness[]=[],
  preparedTechnicalChains?:PreparedFutureTechnicalChainAuthority,currentSupportingFingerprint:string|null=null): StandaloneSearchResult {
  const problem={...sourceProblem};
  let reservedParticipantMeals:readonly ScheduledParticipantMeal[]=[];
  const substantiveContext=(tasks:readonly ScheduledTask[])=>tasks.filter(task=>!reservedParticipantMeals.some(meal=>meal.sourceTaskId===task.id));
  evidence.standaloneSearchInvocations += 1;
  const mainMealAuthority=mainFlowMealPolicy(problem);
  // A fully protected Main stage has no newly constructed core meal. The
  // effective (possibly Assisted-narrowed) authority is nevertheless fixed
  // context for standalone completion and terminal validation.
  const effectiveMainMealStart=mainMealAuthority
    ?selectedMainMealStart??coreMeals[0]?.start??createMainFlowMeal(problem).start:undefined;
  const fixedMainOperationalMeals:ScheduledOperationalMeal[]=effectiveMainMealStart===undefined
    ?[]:materializeMainFlowOperationalMeals(problem,effectiveMainMealStart);
  const operationalMeals=new PreparedOperationalMealAuthority(problem,fixedMainOperationalMeals,initialOperationalMealWitness);
  evidence.standaloneEntryMealWitness=initialOperationalMealWitness?.complete
    ?operationalMealWitnessFingerprint(initialOperationalMealWitness.scheduled):null;
  const invocationStartBranches = ledger.standaloneBranches;
  const collectiveClosure = new PreparedFutureCollectiveParticipantClosure(problem);
  const inconclusiveLeavesBefore = evidence.futureCollectiveClosureInconclusiveLeaves;
  let beforeClosureMatching: number | null = null;
  const closureCheck = (tasks: readonly ScheduledTask[], meals: readonly import("./contracts").ScheduledParticipantMeal[],
    complete: boolean): FutureCollectiveClosureResult => {
    const result = collectiveClosure.evaluate(substantiveContext(tasks), meals.length?meals:reservedParticipantMeals, () => ledger.consume("STANDALONE"),
      complete ? "CERTIFY" : "NECESSARY_ONLY", coreMeals);
    evidence.futureCollectiveClosureChecks += Number(!result.cacheHit);
    evidence.futureCollectiveClosureCacheHits += Number(result.cacheHit);
    evidence.futureCollectiveClosureBranchesConsumed += result.branchesConsumed;
    evidence.futureCollectiveClosureMatchingTraversals += result.matchingTraversals;
    evidence.futureCollectiveClosureRequiredCount = result.requiredCount;
    evidence.futureCollectiveClosureMaximumMatching = result.maximumMatching;
    evidence.futureCollectiveClosurePendingPredecessorTaskIds = result.pendingPredecessorTaskIds;
    if (result.status === "ABSTAIN") evidence.futureCollectiveClosureAbstentions[result.reason!]
      = (evidence.futureCollectiveClosureAbstentions[result.reason!] ?? 0) + 1;
    if(result.uncertifiedPlacement)evidence.futureCollectiveClosureFirstUncertifiedPlacement??=result.uncertifiedPlacement;
    if (result.hall) {
      evidence.futureCollectiveClosureHall = result.hall;
      evidence.futureCollectiveClosureFirstPrune ??= { beforeMatchingCardinality: beforeClosureMatching ?? result.requiredCount,
        afterMatchingCardinality: result.maximumMatching, affectedParticipantIds: result.hall.participantIds,
        causingTaskIds: tasks.filter(task => !coreTasks.some(base => base.id === task.id)
          && result.hall!.participantIds.includes(task.participantId ?? "")).map(task => task.id).sort(),
        blockingClosureTaskIds: result.hall.closureTaskIds };
    }
    if (result.certified) {
      evidence.futureCollectiveClosureWitnessFingerprint = result.witnessFingerprint;
      evidence.futureCollectiveClosureLastCertificate = { fingerprint: result.witnessFingerprint!,
        contextTaskIds: tasks.map(task => task.id).sort(), closureTaskIds: Object.keys(result.matching).sort(),
        mealTaskIds: meals.map(meal => meal.sourceTaskId).sort(),
        departureTaskIds: [...(problem.analyticalFutureParticipantClosure?.departure.taskIds ?? problem.transportPolicy?.departure.taskIds ?? [])].sort() };
    }
    return result;
  };
  const closureMealCheck = (tasks: readonly ScheduledTask[]) =>
    (meals: readonly import("./contracts").ScheduledParticipantMeal[], complete: boolean) => {
      const result = closureCheck(tasks, meals, complete);
      return result.reason === "BUDGET_EXHAUSTED" ? "BUDGET_EXHAUSTED" as const
        : result.status === "INFEASIBLE" ? "REJECT" as const
        : result.status === "ABSTAIN" ? "ABSTAIN" as const : "ACCEPT" as const;
    };
  const necessaryEdgeProbe=problem.analyticalFutureCollectiveContinuation
    ?(state:readonly ScheduledTask[],added:readonly ScheduledTask[]):"PASS"|"PRUNE"|"BUDGET_EXHAUSTED"=>{
      const result=collectiveClosure.evaluateIndividualContinuation(state,added,()=>ledger.consume("STANDALONE"),coreMeals);
      evidence.futureCollectiveClosureChecks+=Number(!result.cacheHit);evidence.futureCollectiveClosureCacheHits+=Number(result.cacheHit);
      evidence.futureCollectiveClosureBranchesConsumed+=result.branchesConsumed;evidence.futureCollectiveClosureMatchingTraversals+=result.matchingTraversals;
      return result.reason==="BUDGET_EXHAUSTED"?"BUDGET_EXHAUSTED":result.status==="INFEASIBLE"?"PRUNE":"PASS";
    }:undefined;
  let found: ScheduledTask[] | null = null, foundOrder: string[] = [], foundParticipantMeals: ParticipantMealWitness | null = null, foundOperationalMeals: OperationalMealWitness | null = null;
  let foundPreparations: ScheduledSetupPreparation[] = [];
  let foundRoundPreparations: ScheduledRoundPreparation[] = [];
  let foundFutureRoundWitnesses:FutureRoundSynchronizationWitnessV1[]=[];
  let foundFutureItinerantWitnesses:FutureItinerantAgendaWitnessV1[]=[];
  let foundFutureWitnessSet:FutureWitnessSetEvidence["finalSet"]=null;
  let foundPriorReusedIdentities:string[]=[];
  const ordinaryDomainCache = new Map<string, StandaloneForwardDynamicDomain>();
  const ordinaryStaticDomainCache = new Map<string, StandaloneForwardStaticDomain>();
  const ordinaryStaticDomain = (task: Task): StandaloneForwardStaticDomain => {
    const key=`${task.id}|${task.itinerantUnitId??"-"}`;
    const cached = ordinaryStaticDomainCache.get(key);
    if (cached) return cached;
    const domain = standaloneForwardStaticDomain(problem, task, coreMeals);
    ordinaryStaticDomainCache.set(key, domain);
    return domain;
  };
  const macroDomainCache = new Map<string, { domainSize:number; structuralCandidateCount?:number; matchingFeasibleCandidateCount?:number }>();
  const macroPendingPrerequisiteCache:MacroPendingPrerequisiteForwardCache=new Map();
  const staticMacroDomains = new Map<string, StandaloneForwardStaticDomain>();
  let activeMacroCandidateTrace:MacroCandidateCausalTrace|null=null;
  let activeRoundOperationalMealReservations:readonly {policyId:string;start:number;end:number}[]=[];
  const preservesRoundOperationalMealReservations=(task:ScheduledTask):boolean=>activeRoundOperationalMealReservations.every(reservation=>{
    const policy=problem.operationalMealPolicies?.find(item=>item.id===reservation.policyId);if(!policy)return true;
    const resources=task.coachId===undefined?(task.requiredResourceIds??[]):[...(task.requiredResourceIds??[]),task.coachId];
    const affected=policy.spaceIds.includes(task.spaceId)||resources.some(id=>policy.resourceIds.includes(id));
    return !affected||task.end<=reservation.start||reservation.end<=task.start;
  });
  const preparationsPreserveRoundOperationalMealReservations=(items:readonly {spaceId:string;start:number;end:number}[]):boolean=>
    activeRoundOperationalMealReservations.every(reservation=>{const policy=problem.operationalMealPolicies?.find(item=>item.id===reservation.policyId);
      return !policy||items.every(item=>!policy.spaceIds.includes(item.spaceId)||item.end<=reservation.start||reservation.end<=item.start);});
  const recordDeadEnd = (cause: StandaloneDeadEndCause): void => {
    evidence.firstStandaloneDeadEndCause ??= cause;
    if(activeMacroCandidateTrace&&cause.depth>activeMacroCandidateTrace.depth&&!activeMacroCandidateTrace.firstDescendantDeadEnd)
      activeMacroCandidateTrace.firstDescendantDeadEnd=cause;
    if(activeMacroCandidateTrace?.enteredOrdinarySearch&&!activeMacroCandidateTrace.firstOrdinaryRejection
      &&cause.phase==="ORDINARY")activeMacroCandidateTrace.firstOrdinaryRejection=cause;
  };
  const ancestors = (selectionOrder: readonly string[], placed: readonly ScheduledTask[]) => selectionOrder
    .map((taskId) => placed.find((task) => task.id === taskId))
    .filter((task): task is ScheduledTask => task !== undefined)
    .map(({ id: taskId, start }) => ({ taskId, start }));
  const recordBlockingTask = (task: Task): void => {
    evidence.standaloneBlockingTaskCounts[task.id] = (evidence.standaloneBlockingTaskCounts[task.id] ?? 0) + 1;
    evidence.standaloneBlockingTaskDetails[task.id] ??= {
      taskId: task.id, participantId: task.participantId ?? null, spaceId: task.spaceId,
      duration: task.duration, requiredResourceIds: [...(task.requiredResourceIds ?? [])].sort(),
      setupFamilyId: task.setupFamilyId ?? null, kind: task.kind,
    };
  };
  const consumeLeafBranch = (depth: number): boolean => {
    if (!ledger.consume("STANDALONE")) return false;
    evidence.standaloneLeafSearchBranches += 1;
    evidence.standaloneBranchesByDepth[String(depth)] = (evidence.standaloneBranchesByDepth[String(depth)] ?? 0) + 1;
    return true;
  };
  const completeLeaf = (placed: ScheduledTask[], preparations: ScheduledSetupPreparation[], roundPreparations: ScheduledRoundPreparation[], selectionOrder: string[]): StandaloneOutcome => {
    if(activeMacroCandidateTrace)activeMacroCandidateTrace.reachedCompleteLeaf=true;
    evidence.standaloneBranchesBeforeFirstOrdinaryCompleteLeaf ??= ledger.standaloneBranches - invocationStartBranches;
    if (!consumeLeafBranch(selectionOrder.length)) return "BUDGET_EXHAUSTED";
    evidence.standaloneCompleteLeafCount += 1;
    const substantive = orderScheduled(substantiveContext([...coreTasks, ...placed]));
    const participantMealSourceIds=new Set((problem.participantMeals??[]).map(({sourceTaskId})=>sourceTaskId));
    const expected = problem.tasks.filter(({id})=>!participantMealSourceIds.has(id)).sort(byId).map(({ id }) => id);
    const actualSubstantive = [...substantive].sort(byId).map(({ id }) => id);
    const materializedIds=new Set(actualSubstantive),allTransportIds=transportTaskIds(problem);
    const expectedSubstantive = problem.tasks.filter(({ id }) => (!allTransportIds.has(id)||materializedIds.has(id))
      &&!participantMealSourceIds.has(id)).sort(byId).map(({ id }) => id);
    const transportAlreadyMaterialized=actualSubstantive.length===expected.length
      &&actualSubstantive.every((id,index)=>id===expected[index]);
    const exactSubstantive = transportAlreadyMaterialized||(actualSubstantive.length === expectedSubstantive.length
      && actualSubstantive.every((id, index) => id === expectedSubstantive[index]));
    if (exactSubstantive) {
      if (beforeClosureMatching === null) {
        const before = closureCheck(coreTasks, [], false);
        if (before.reason === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        beforeClosureMatching = before.maximumMatching;
      }
      const necessary = closureCheck(substantive, [], false);
      if (necessary.reason === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
      if (necessary.status === "INFEASIBLE") return "DEAD_END";
      // An abstention cannot prune this scope candidate. Joint future context
      // and meal continuations may discharge it; otherwise the result is inconclusive.
    }
    if(exactSubstantive&&(problem.analyticalFutureParticipantTasks?.length??0)>0){
      const terminalReservation=probeParticipantFutureReservations(problem,substantive,substantive,{consume:()=>ledger.consume("STANDALONE")},"EXACT");
      recordParticipantFutureReservation(evidence,terminalReservation);evidence.participantFutureTerminalExactChecks+=1;
      evidence.participantFutureTerminalExactPasses+=Number(terminalReservation.status==="PASS");
      evidence.participantFutureTerminalExactPrunes+=Number(terminalReservation.status==="PRUNE");
      evidence.participantFutureTerminalExactAbstentions+=Number(terminalReservation.status==="ABSTAIN");
      evidence.participantFutureTerminalExactBranches+=terminalReservation.branchesConsumed;
      evidence.firstParticipantFutureTerminalExact??=terminalReservation;
      if(activeMacroCandidateTrace)activeMacroCandidateTrace.terminalParticipantFuture={status:terminalReservation.status,
        cause:terminalReservation.reasonCode??terminalReservation.abstainCause??null};
      if(terminalReservation.abstainCause==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
      if(terminalReservation.status!=="PASS")return "DEAD_END";
    }
    const mealBudget={remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)};
    // Before future units supply their joint context, require only sound necessary
    // capacity. The full collective certificate remains mandatory in globalGate.
    const hasStructuralFutureContext = Boolean(problem.analyticalFutureRoundSynchronizations?.length || problem.analyticalFutureItinerantAgendas?.length);
    const mealWitness=exactSubstantive?assessParticipantMealFutureFeasibility(problem,substantive,mealBudget,"MATERIALIZE",hasStructuralFutureContext ? (meals) => {
      const result = closureCheck(substantive, meals, false);
      return result.reason === "BUDGET_EXHAUSTED" ? "BUDGET_EXHAUSTED"
        : result.status === "INFEASIBLE" ? "REJECT" : "ACCEPT";
    } : closureMealCheck(substantive)):null;
    if (mealWitness?.reasonCodes.includes("PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED")) return "BUDGET_EXHAUSTED";
    if (mealWitness?.reasonCodes.includes("PARTICIPANT_MEAL_TERMINAL_ABSTAIN")) {
      evidence.futureCollectiveClosureInconclusiveLeaves++; return "DEAD_END"; // try other scope candidates; not a negative proof
    }
    if(mealWitness){evidence.participantMealFutureFeasibilityChecks+=1;evidence.participantMealExactMaterializations+=1;evidence.participantMealLogicalGridStarts+=mealWitness.logicalGridStarts;evidence.participantMealActuallyEvaluatedStarts+=mealWitness.actuallyEvaluatedStarts;evidence.participantMealBranchesExplored+=mealWitness.branchesExplored;if(!mealWitness.complete)evidence.participantMealFutureInfeasibleBranches+=1;for(const id of mealWitness.blockingMealTaskIds)if(!evidence.participantMealBlockingTaskIds.includes(id))evidence.participantMealBlockingTaskIds.push(id);}
    const operationalMealBudget={remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)};
    const operationalMealWitness=exactSubstantive?operationalMeals.materialize(substantive,operationalMealBudget):null;
    if(operationalMealWitness?.reasonCodes.includes("OPERATIONAL_MEAL_BRANCH_BUDGET_EXHAUSTED"))return "BUDGET_EXHAUSTED";
    const fixedResourceMeals=(problem.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
    const fixedItinerantMeals=materializeScheduledItinerantUnitMeals(problem);
    if (mealWitness?.complete&&!transportAlreadyMaterialized) evidence.terminalTransportMaterializationAttempts += 1;
    let terminalTransportWitness: TransportMaterializationEvidence | null = null;
    let transportFallbackBranches=0;
    const transportResult = transportAlreadyMaterialized ? null : mealWitness?.complete ? materializeTerminalTransportDetailed(problem, substantive, mealWitness.scheduled, {
      consumeFallbackBranch: () => {transportFallbackBranches+=1;return ledger.consume("STANDALONE");},
      onEvidence: (witness) => { terminalTransportWitness = witness; },
    }) : null;
    if(transportResult?.status==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
    const transport=transportAlreadyMaterialized?[]:transportResult?.scheduled??null;
    const observedTerminalTransportWitness = terminalTransportWitness as TransportMaterializationEvidence | null;
    if (observedTerminalTransportWitness) {
      evidence.transportContiguousStates += observedTerminalTransportWitness.directions
        .reduce((sum, item) => sum + item.contiguousStatesExplored, 0);
      evidence.membershipFallbackEntered += observedTerminalTransportWitness.directions
        .filter((item) => item.membershipFallbackEntered).length;
    }
    if (mealWitness?.complete && !transportAlreadyMaterialized && transport === null) evidence.terminalTransportMaterializationFailures += 1;
    const candidate = transport === null ? substantive : orderScheduled([...substantive, ...transport]);
    const actual = [...candidate].sort(byId).map(({ id }) => id);
    const exact = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
    const validationCoreMeals=mainMealAuthority?.source==="OPERATIONAL_MEAL_POLICY"?[]:coreMeals;
    const validation = validatePlan(problem, candidate, preparations, validationCoreMeals,[...mealWitness?.scheduled ?? []],fixedResourceMeals,fixedItinerantMeals,roundPreparations,[...operationalMealWitness?.scheduled ?? []]);
    const validationAccepted=validation.hardValid||Boolean(transport!==null&&exact&&mealWitness?.complete
      &&operationalMealWitness?.complete&&acceptsValidation?.(validation));
    const futureRoundWitnesses:FutureRoundSynchronizationWitnessV1[]=[];
    const futureItinerantWitnesses:FutureItinerantAgendaWitnessV1[]=[];
    if(transport!==null&&exact&&mealWitness?.complete&&operationalMealWitness?.complete&&validationAccepted){
      const futuresRound=problem.analyticalFutureRoundSynchronizations??[],futuresAgenda=problem.analyticalFutureItinerantAgendas??[];
      const allFutureTasks=[...futuresRound.flatMap(future=>future.tasks),...futuresAgenda.flatMap(future=>[...future.tasks,...future.prerequisiteTasks])];
      const uniqueTasks=(tasks:readonly Task[])=>[...new Map(tasks.map(task=>[task.id,task])).values()];
      const initial:FutureWitnessContext={tasks:candidate,roundPreparations,mealReservations:[]};
      const analyticalProblem=(context:FutureWitnessContext):PlannerNextProblem=>{
        const placedIds=new Set(context.tasks.map(task=>task.id));
        const constrain=(task:Task):Task=>{const scheduled=context.tasks.find(item=>item.id===task.id);
          if(!scheduled)return task;const {start,end,...assigned}=scheduled;
          return {...assigned,availability:[{start,end}]};};
        return {...problem,tasks:uniqueTasks([...problem.tasks,...allFutureTasks]).map(constrain),
          analyticalFutureTechnicalChains:problem.analyticalFutureTechnicalChains?.map(chain=>({...chain,tasks:chain.tasks.map(constrain)})),
          analyticalFutureParticipantTasks:(problem.analyticalFutureParticipantTasks??[]).filter(task=>!placedIds.has(task.id)),
          operationalMealPolicies:problem.operationalMealPolicies?.map(policy=>{
            const reservation=context.mealReservations.find(item=>item.policyId===policy.id);
            return reservation?{...policy,window:{start:reservation.start,end:reservation.end}}:policy;
          })};
      };
      const occupiedContext=(context:FutureWitnessContext):ScheduledTask[]=>[...context.tasks,...context.roundPreparations.map(prep=>({
        id:prep.id,kind:"technical" as const,spaceId:prep.spaceId,duration:prep.duration,dependencies:[],start:prep.start,end:prep.end}))];
      const extend=(context:FutureWitnessContext,tasks:readonly ScheduledTask[],preps:readonly ScheduledRoundPreparation[]=[],
        reservations:FutureWitnessContext["mealReservations"]=[]):FutureWitnessContext=>({
        tasks:[...new Map([...context.tasks,...tasks].map(task=>[task.id,task])).values()],
        roundPreparations:[...context.roundPreparations,...preps],mealReservations:[...context.mealReservations,...reservations]});
      const ordering=(tasks:readonly Task[],lanes:number,frontier=problem.day.end):number[]=>{
        const deadline=Math.min(frontier,...tasks.map(task=>Math.max(...(task.availability??[problem.day]).map(window=>window.end))));
        const load=tasks.reduce((sum,task)=>sum+task.duration,0)/Math.max(1,lanes);
        const resources=new Set(tasks.flatMap(task=>[...(task.requiredResourceIds??[]),...(task.allowedItinerantUnitIds??[])
          .flatMap(id=>problem.itinerantUnits?.find(unit=>unit.id===id)?.resourceIds??[])]));
        const mealPressure=(problem.operationalMealPolicies??[]).filter(policy=>policy.resourceIds.some(id=>resources.has(id)))
          .reduce((sum,policy)=>sum+policy.duration,0);
        return [deadline,deadline-problem.day.start-load-mealPressure,-load];
      };
      const reject=(authority:string,details:Readonly<Record<string,unknown>>={}):StandaloneOutcome=>{
        evidence.futureItinerantWitnessRejectsByAuthority[authority]=(evidence.futureItinerantWitnessRejectsByAuthority[authority]??0)+1;
        evidence.futureItinerantWitnessFirstReject??={authority,...details};
        for(const row of Object.values(evidence.futureWitnessSet.byIdentity))if(row.candidateCount)row.rejectAuthority=`GLOBAL:${authority}`;
        return "DEAD_END";
      };
      let roundAlternatives=0,itineraryAlternatives=0,mealPrunes=0;
      let jointMeals:FutureWitnessContext["mealReservations"]=[];
      const globalGate=(context:FutureWitnessContext):import("./futureStructuralWitnessSet").FutureWitnessOutcome=>{
        const joint=analyticalProblem(context),state=occupiedContext(context);
        const necessary = closureCheck(state, [], false);
        if (necessary.reason === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (necessary.status === "INFEASIBLE") return reject("COLLECTIVE_CLOSURE_HALL", { hall: necessary.hall });
        // Missing task ancestors cannot be repaired by choosing a different meal:
        // preserve the scope/future alternatives and report missing joint proof.
        if (necessary.pendingPredecessorTaskIds.length) {
          evidence.futureCollectiveClosureAbstentions.PENDING_PREDECESSORS
            = (evidence.futureCollectiveClosureAbstentions.PENDING_PREDECESSORS ?? 0) + 1;
          evidence.futureCollectiveClosureInconclusiveLeaves++;
          return "INCONCLUSIVE";
        }
        if (!futuresRound.length && !futuresAgenda.length) {
          return "FOUND"; // certified by the scope's exact meal continuation above
        }
        if(context.mealReservations.some(reservation=>context.mealReservations.some(other=>other.policyId===reservation.policyId
          &&(other.start!==reservation.start||other.end!==reservation.end))))return reject("MEAL_RESERVATION_CONFLICT");
        // Placements and dependency edges are replayed against the complete combination.
        for(const task of context.tasks.filter(task=>!candidate.some(base=>base.id===task.id))){
          const placement=diagnoseTaskPlacement(joint,task,task.start,state.filter(other=>other.id!==task.id),validationCoreMeals);
          if(!placement.valid)return reject("PLACEMENT",{taskId:task.id,reason:placement.firstRejectionReason,blockingTaskId:placement.blockingPlacedTaskId});
          if(task.dependencies.some(id=>{const dependency=context.tasks.find(other=>other.id===id);
            return dependency?dependency.end>task.start:allFutureTasks.some(other=>other.id===id);}))return reject("PREREQUISITE",{taskId:task.id});
        }
        const participantStarted=performance.now();
        evidence.futureRoundWitnessParticipantFutureChecks+=Number(futuresRound.length>0);
        const participant=probeParticipantFutureReservations(joint,state,state,{consume:()=>ledger.consume("STANDALONE")},"EXACT");
        evidence.futureItinerantParticipantFutureMs+=performance.now()-participantStarted;
        if(participant.status==="ABSTAIN")return "BUDGET_EXHAUSTED";
        if(participant.status!=="PASS")return reject("PARTICIPANT",{reason:participant.reasonCode});
        const technicalStarted=performance.now();
        const technical=(joint.analyticalFutureTechnicalChains?.length??0)>0
          ?probeTechnicalChainFutureReservations(joint,state,state,Math.max(0,ledger.limit-ledger.branchesExplored)):null;
        evidence.futureItinerantTechnicalFutureMs+=performance.now()-technicalStarted;
        if(technical?.branchesConsumed&&!ledger.consume("STANDALONE",technical.branchesConsumed))return "BUDGET_EXHAUSTED";
        if(technical?.status==="ABSTAIN")return "BUDGET_EXHAUSTED";
        if(technical?.status==="PRUNE")return reject("TECHNICAL",{taskId:technical.certifiedCausingTaskId});
        const participantMealsStarted=performance.now();
        const participantMeals=assessParticipantMealFutureFeasibility(joint,context.tasks,
          {remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)},"MATERIALIZE",closureMealCheck(state));
        evidence.futureItinerantParticipantMealsMs+=performance.now()-participantMealsStarted;
        if(participantMeals.reasonCodes.includes("PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED"))return "BUDGET_EXHAUSTED";
        if (participantMeals.reasonCodes.includes("PARTICIPANT_MEAL_TERMINAL_ABSTAIN")) {
          evidence.futureCollectiveClosureInconclusiveLeaves++; return "INCONCLUSIVE";
        }
        if(!participantMeals.complete)return reject("PARTICIPANT_MEAL",{blocking:participantMeals.blockingMealTaskIds});
        const operationalStarted=performance.now();
        const operational=new PreparedOperationalMealAuthority(joint,fixedMainOperationalMeals,operationalMeals.currentWitness())
          .materialize(state,{remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)});
        evidence.futureItinerantOperationalMealsMs+=performance.now()-operationalStarted;
        if(operational.reasonCodes.includes("OPERATIONAL_MEAL_BRANCH_BUDGET_EXHAUSTED"))return "BUDGET_EXHAUSTED";
        if(!operational.complete)return reject("OPERATIONAL_MEAL",{blocking:operational.blockingPolicyIds});
        jointMeals=operational.scheduled.map(({id:policyId,start,end})=>({policyId,start,end}));
        const rounds=validateRoundSynchronizations({...joint,roundSynchronizations:[...(problem.roundSynchronizations??[]),...futuresRound.map(future=>future.policy)]},
          [...context.tasks],[...context.roundPreparations],operational.scheduled.flatMap(meal=>meal.spaceIds.map(spaceId=>({spaceId,start:meal.start,end:meal.end}))));
        if(rounds.synchronizationViolationCount||rounds.preparationViolationCount)return reject("ROUND_GEOMETRY");
        return "FOUND";
      };
      const units:FutureWitnessUnit[]=[];
      for(const future of futuresRound){
        const identity=`ROUND_SYNCHRONIZATION:${future.policy.id}`;
        const memberIds=new Set(future.policy.lanes.flatMap(lane=>lane.taskIds));
        const prior=priorWitnesses.find((item):item is FutureRoundSynchronizationWitnessV1=>item.kind==="ROUND_SYNCHRONIZATION"&&item.policyId===future.policy.id);
        units.push({identity,ordering:ordering(future.tasks.filter(task=>memberIds.has(task.id)),future.policy.lanes.length),priorFound:Boolean(prior),
          revalidate:context=>{
            const replay=revalidateFutureRoundSynchronizationWitness(analyticalProblem(context),future.policy,occupiedContext(context),
              context.roundPreparations,validationCoreMeals,prior!);
            return replay.status==="PASS"?{status:"PASS",candidate:{witness:prior!,context:extend(context,[...replay.prerequisites,...replay.candidate.tasks],
              replay.candidate.preparations,replay.candidate.operationalMealReservations)}}:replay;
          },
          explore:(context,continuation)=>{
            const branchesBefore=ledger.branchesExplored;let continuationBranches=0;
            evidence.futureRoundWitnessSearchInvocations++;
            const witnessProblem=analyticalProblem(context),base=occupiedContext(context);
            const prerequisiteTasks=future.tasks.filter(task=>!memberIds.has(task.id)&&!context.tasks.some(item=>item.id===task.id));
            const explored=exploreExactRoundSynchronizationPolicy(witnessProblem,future.policy,base,preparations,
              [...context.roundPreparations],validationCoreMeals,ledger,round=>{
                roundAlternatives++;evidence.futureRoundWitnessCompleteMatchings++;evidence.futureRoundWitnessPrerequisiteChecks++;
                const check=checkMacroPendingPrerequisites(witnessProblem,prerequisiteTasks,base,round.tasks,validationCoreMeals,new Map());
                if(!check.feasible){const blocker=check.blockingTaskId,taskById=new Map(witnessProblem.tasks.map(task=>[task.id,task]));
                  const dependsOn=(task:Task,target:string,seen=new Set<string>()):boolean=>task.dependencies.some(id=>id===target||
                    (!seen.has(id)&&(seen.add(id),taskById.has(id)&&dependsOn(taskById.get(id)!,target,seen))));
                  const causalTaskIds=blocker?round.tasks.filter(task=>dependsOn(task,blocker)).map(task=>task.id):[];
                  return {outcome:"DEAD_END",matchingReject:{authority:"PREREQUISITE",causalTaskIds},terminalFutureResult:"PRUNE"};}
                const closure=searchExactPrerequisiteClosure(witnessProblem,prerequisiteTasks,[...base,...round.tasks],validationCoreMeals,problem.day.end,
                  ()=>ledger.consume("STANDALONE"),prerequisites=>{
                    const body={kind:"ROUND_SYNCHRONIZATION" as const,version:1 as const,policyId:future.policy.id,
                      scheduledTaskPlacements:round.tasks.slice().sort(byId).map(({id,start,end,spaceId})=>({id,start,end,spaceId})),
                      prerequisiteTaskPlacements:prerequisites.slice().sort(byId).map(({id,start,end,spaceId})=>({id,start,end,spaceId})),
                      roundPreparations:round.preparations.slice().sort(byId).map(({id,spaceId,start,end})=>({id,spaceId,start,end})),
                      operationalMealReservations:round.operationalMealReservations.slice().sort((a,b)=>a.policyId.localeCompare(b.policyId)),
                      matchingWitness:round.matchingWitness,futureFeasibility:{participant:"PASS" as const,
                        technicalChain:(witnessProblem.analyticalFutureTechnicalChains?.length??0)>0?"PASS" as const:"NOT_APPLICABLE" as const,
                        participantMeals:(witnessProblem.participantMeals?.length??0)>0?"PASS" as const:"NOT_APPLICABLE" as const,
                        operationalMeals:round.operationalMealReservations.length?"PASS" as const:"NOT_APPLICABLE" as const}};
                    const before=ledger.branchesExplored;
                    const outcome=continuation({witness:{...body,fingerprint:createHash("sha256").update(JSON.stringify(body)).digest("hex")},
                      context:extend(context,[...prerequisites,...round.tasks],round.preparations,round.operationalMealReservations)});
                    continuationBranches+=ledger.branchesExplored-before;return outcome;
                  });
                return {outcome:closure.outcome,terminalFutureResult:closure.outcome==="FOUND"?"PASS":closure.outcome==="BUDGET_EXHAUSTED"?"ABSTAIN":"PRUNE"};
              },{futureEdgePruning:"DEFER_TO_COMPLETE_MATCHING",jointContinuation:true});
            evidence.futureRoundWitnessStructuralCandidates+=explored.evidence.mealAwareShapesFeasible;
            evidence.futureRoundWitnessBranchesConsumed+=ledger.branchesExplored-branchesBefore-continuationBranches;
            return explored.outcome;
          }});
      }
      for(const future of futuresAgenda){
        const identity=`ITINERANT_AGENDA:${future.identity}`;
        const prior=priorWitnesses.find((item):item is FutureItinerantAgendaWitnessV1=>item.kind==="ITINERANT_AGENDA"&&item.identity===future.identity);
        const initialFrontier=itinerantAgendaStructuralFrontier(problem,future.unitIds,candidate);
        units.push({identity,ordering:ordering(future.tasks,future.unitIds.length,initialFrontier),priorFound:Boolean(prior),
          revalidate:context=>{
            const started=performance.now(),witnessProblem=analyticalProblem(context);
            const replay=revalidateFutureItinerantAgendaWitness(witnessProblem,future.identity,future.unitIds,future.tasks,future.prerequisiteTasks,
              occupiedContext(context),validationCoreMeals,currentSupportingFingerprint,prior!);
            evidence.futureItinerantPriorRevalidationMs+=performance.now()-started;
            evidence.futureItinerantPriorRevalidation??=replay.status;
            evidence.futureItinerantPriorPreviousFrontier??=prior!.structuralFrontier;
            evidence.futureItinerantPriorCurrentFrontier??=itinerantAgendaStructuralFrontier(witnessProblem,future.unitIds,context.tasks);
            if(replay.status!=="PASS")evidence.futureItinerantPriorRejectCause??=replay.reason;
            return replay.status==="PASS"?{status:"PASS",candidate:{witness:prior!,context:extend(context,[...replay.prerequisites,...replay.agenda])}}:replay;
          },
          explore:(context,continuation)=>{
            const before=ledger.branchesExplored;let continuationBranches=0;
            evidence.futureItinerantWitnessSearchInvocations++;
            const witnessProblem=analyticalProblem(context),base=occupiedContext(context);
            const frontier=itinerantAgendaStructuralFrontier(witnessProblem,future.unitIds,context.tasks);
            const prerequisitesPending=future.prerequisiteTasks.filter(task=>!context.tasks.some(item=>item.id===task.id));
            const started=performance.now();
            const prerequisiteSearch=searchExactPrerequisiteClosure(witnessProblem,prerequisitesPending,base,validationCoreMeals,frontier,
              ()=>ledger.consume("STANDALONE"),prerequisites=>{
                const structuralStarted=performance.now();
                const explored=searchExactItinerantAgenda(witnessProblem,future.tasks,future.unitIds,[...base,...prerequisites],validationCoreMeals,frontier,
                  ()=>ledger.consume("STANDALONE"),scheduled=>{
                    itineraryAlternatives++;
                    const placements=scheduled.slice().sort(byId).map(({id,start,end,spaceId,itinerantUnitId})=>({id,start,end,spaceId,itinerantUnitId}));
                    const allPrerequisites=[...context.tasks.filter(task=>future.prerequisiteTasks.some(item=>item.id===task.id)),...prerequisites];
                    const body={kind:"ITINERANT_AGENDA" as const,version:1 as const,identity:future.identity,unitIds:[...future.unitIds].sort(),
                      scheduledTaskPlacements:placements,prerequisiteTaskPlacements:allPrerequisites.slice().sort(byId).map(({id,start,end,spaceId})=>({id,start,end,spaceId})),
                      structuralFrontier:frontier,laneOrder:Object.fromEntries([...future.unitIds].sort().map(unitId=>[unitId,placements.filter(item=>item.itinerantUnitId===unitId)
                        .sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id)).map(item=>item.id)])),supportingFingerprint:null,
                      futureFeasibility:{prerequisites:"PASS" as const,participant:"PASS" as const,
                        technicalChain:(witnessProblem.analyticalFutureTechnicalChains?.length??0)>0?"PASS" as const:"NOT_APPLICABLE" as const,
                        participantMeals:(witnessProblem.participantMeals?.length??0)>0?"PASS" as const:"NOT_APPLICABLE" as const,
                        itinerantUnitMeals:witnessProblem.itinerantUnitMeals?.some(meal=>future.unitIds.includes(meal.itinerantUnitId))?"PASS" as const:"NOT_APPLICABLE" as const,
                        operationalMeals:(witnessProblem.operationalMealPolicies?.length??0)>0?"PASS" as const:"NOT_APPLICABLE" as const}};
                    const nestedBefore=ledger.branchesExplored;
                    const outcome=continuation({witness:{...body,fingerprint:witnessFingerprint(body)},context:extend(context,[...prerequisites,...scheduled])});
                    continuationBranches+=ledger.branchesExplored-nestedBefore;return outcome;
                  });
                evidence.futureItinerantStructuralSearchMs+=performance.now()-structuralStarted;
                evidence.futureItinerantWitnessCandidates+=explored.candidates;mealPrunes+=explored.mealPrunes;return explored.outcome;
              });
            evidence.futureItinerantPrerequisiteSearchMs+=performance.now()-started;
            evidence.futureItinerantWitnessBranchesConsumed+=ledger.branchesExplored-before-continuationBranches;
            return prerequisiteSearch.outcome;
          }});
      }
      const branchBefore=ledger.branchesExplored,attemptsBefore=evidence.futureWitnessSet.futureWitnessSetCombinationsAttempted;
      const result=certifyFutureStructuralWitnessSet(units,initial,globalGate,()=>ledger.branchesExplored,evidence.futureWitnessSet);
      evidence.futureWitnessSetCandidateTraces.push({geometryFingerprint:fingerprint(candidate,preparations,coreMeals,fixedItinerantMeals,roundPreparations),
        frontiers:Object.fromEntries(futuresAgenda.map(future=>[future.identity,itinerantAgendaStructuralFrontier(problem,future.unitIds,candidate)])),
        outcome:result.outcome,attempts:evidence.futureWitnessSet.futureWitnessSetCombinationsAttempted-attemptsBefore,
        roundAlternatives,itineraryAlternatives,mealPrunes,branches:ledger.branchesExplored-branchBefore,
        setFingerprint:result.outcome==="FOUND"?result.evidence.finalSet?.fingerprint??null:null});
      if (result.outcome === "INCONCLUSIVE") return "DEAD_END"; // continue scope DFS; retained in the invocation result below
      if(result.outcome!=="FOUND")return result.outcome;
      if(result.evidence.finalSet)result.evidence.finalSet.mealReservations=structuredClone(jointMeals);
      for(const witness of result.witnesses){
        if(witness.kind==="ROUND_SYNCHRONIZATION")futureRoundWitnesses.push(witness);
        if(witness.kind==="ITINERANT_AGENDA"){futureItinerantWitnesses.push(witness);evidence.futureItinerantWitnessesFound++;
          evidence.futureItinerantWitnessFingerprint=witness.fingerprint;}
      }
    }
    const rejectionCause:TerminalCompletionRejectionCause|null=!exactSubstantive?"SUBSTANTIVE_IDENTITY_INCOMPLETE"
      :!mealWitness?.complete?"PARTICIPANT_MEAL_WITNESS_INCOMPLETE"
      :!operationalMealWitness?.complete?"OPERATIONAL_MEAL_WITNESS_INCOMPLETE"
      :transport===null?"TRANSPORT_MATERIALIZATION_FAILED"
      :!exact?"CANDIDATE_IDENTITY_MISMATCH"
      :!validationAccepted?"VALIDATION_REJECTED":null;
    if(rejectionCause){
      evidence.terminalCompletionRejectionsByCause[rejectionCause]+=1;
      evidence.firstTerminalCompletionRejection??={cause:rejectionCause,phase:({
        SUBSTANTIVE_IDENTITY_INCOMPLETE:"SUBSTANTIVE_IDENTITY",PARTICIPANT_MEAL_WITNESS_INCOMPLETE:"PARTICIPANT_MEALS",
        OPERATIONAL_MEAL_WITNESS_INCOMPLETE:"OPERATIONAL_MEALS",TRANSPORT_MATERIALIZATION_FAILED:"TRANSPORT_MATERIALIZATION",
        CANDIDATE_IDENTITY_MISMATCH:"CANDIDATE_IDENTITY",VALIDATION_REJECTED:"VALIDATION",
      } as const)[rejectionCause],expectedTaskCount:expected.length,actualTaskCount:actual.length,
      participantMealWitness:mealWitness,operationalMealWitness,transportWitness:observedTerminalTransportWitness,
      validation:{hardValid:validation.hardValid,reasonCodes:[...validation.reasonCodes],violations:[...(validation.violations??[])]}};
    }
    if (transport !== null && exact && mealWitness?.complete && operationalMealWitness?.complete && validationAccepted) {
      evidence.terminalTransportWitness = terminalTransportWitness;
      const quality = evaluateParticipantItineraryQuality(problem, candidate).summary;
      const compact: CompleteParticipantQuality = { maximumParticipantIdleMinutes: quality.maximumParticipantIdleMinutes,
        maximumSingleGapMinutes: quality.maximumSingleGapMinutes, totalIdleMinutes: quality.totalIdleMinutes,
        totalGapCount: quality.totalGapCount, totalSpaceChangeCount: quality.totalSpaceChangeCount };
      const candidateFingerprint = fingerprint(candidate,preparations,coreMeals,fixedItinerantMeals,roundPreparations,[...operationalMealWitness.scheduled]);
      evidence.completePlansObserved += 1;
      if (!found) {
        found = candidate; foundPreparations = [...preparations]; foundRoundPreparations = [...roundPreparations]; foundOrder = selectionOrder; foundParticipantMeals=mealWitness; foundOperationalMeals=operationalMealWitness; evidence.firstCompleteFingerprint = candidateFingerprint;
        evidence.selectedCompleteFingerprint = candidateFingerprint; evidence.firstCompleteQuality = compact; evidence.selectedCompleteQuality = compact;foundFutureRoundWitnesses=futureRoundWitnesses;foundFutureItinerantWitnesses=futureItinerantWitnesses;
        foundFutureWitnessSet=structuredClone(evidence.futureWitnessSet.finalSet);
        foundPriorReusedIdentities=Object.entries(evidence.futureWitnessSet.byIdentity).filter(([,row])=>row.priorReused).map(([identity])=>identity);
      } else if (compareCompleteParticipantQuality(compact, evidence.selectedCompleteQuality!) === 1) {
        found = candidate; foundPreparations = [...preparations]; foundRoundPreparations = [...roundPreparations]; foundOrder = selectionOrder; foundParticipantMeals=mealWitness; foundOperationalMeals=operationalMealWitness; evidence.completeIncumbentReplacements += 1;
        evidence.selectedCompleteFingerprint = candidateFingerprint; evidence.selectedCompleteQuality = compact;foundFutureRoundWitnesses=futureRoundWitnesses;foundFutureItinerantWitnesses=futureItinerantWitnesses;
        foundFutureWitnessSet=structuredClone(evidence.futureWitnessSet.finalSet);
        foundPriorReusedIdentities=Object.entries(evidence.futureWitnessSet.byIdentity).filter(([,row])=>row.priorReused).map(([identity])=>identity);
      }
      return selection === "FIRST_HARD_VALID" ? "FOUND" : "DEAD_END";
    }
    return "DEAD_END";
  };
  let completeAfterOrdinary = completeLeaf;
  const jointMacroConflict:{value:{unitId:string;taskIds:string[]}|null}={value:null};
  const currentJointMacroConflict=()=>jointMacroConflict.value;
  type FutureGateContext={phase:"STANDALONE"|"MACRO";depth:number;reachableTaskIds:ReadonlySet<string>;macroUnitId?:string};
  const assessFutureAuthorities=(placed:ScheduledTask[],addedTasks:ScheduledTask[],context:FutureGateContext):StandaloneOutcome|"PASS"=>{
    const state=[...coreTasks,...placed,...addedTasks];
    if(problem.analyticalFutureCollectiveContinuation){
      const necessary=closureCheck(state,[],false);
      if(necessary.reason==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
      if(necessary.status==="INFEASIBLE"){
        if(context.phase==="MACRO"&&context.macroUnitId&&necessary.hall){
          const relevant=addedTasks.filter(task=>necessary.hall!.participantIds.includes(task.participantId??""));
          if(relevant.length){
            const reduced=closureCheck([...coreTasks,...placed,...relevant],[],false);
            if(reduced.reason==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
            if(reduced.status==="INFEASIBLE")jointMacroConflict.value={unitId:context.macroUnitId,taskIds:relevant.map(task=>task.id)};
          }
        }
        return "DEAD_END";
      }
    }
    const causing=(participantId:string|null=null)=>[...addedTasks].sort(byId).find(task=>participantId===null||task.participantId===participantId)??[...addedTasks].sort(byId)[0]!;
    if((problem.analyticalFutureTechnicalChains?.length??0)>0){
      const reservation=preparedTechnicalChains?.assess(state,addedTasks)
        ??probeTechnicalChainFutureReservations(problem,state,addedTasks,Math.max(0,ledger.limit-ledger.branchesExplored));
      if(!preparedTechnicalChains&&reservation.branchesConsumed>0&&!ledger.consume("STANDALONE",reservation.branchesConsumed))return "BUDGET_EXHAUSTED";
      recordTechnicalChainFutureReservation(evidence,reservation);
      if(reservation.status==="ABSTAIN")return "BUDGET_EXHAUSTED";
      if(reservation.status==="PRUNE"){
        const task=causing();
        evidence.firstTechnicalChainFutureReservationPrune??={phase:context.phase,causingTaskId:task?.id??null,
          causingCandidateStart:task?.start??null,depth:context.depth,...reservation};
        return "DEAD_END";
      }
    }
    if((problem.analyticalFutureParticipantTasks?.length??0)>0){
      const macro=context.phase==="MACRO";
      const reservation=probeParticipantFutureReservations(problem,substantiveContext(state),addedTasks,macro?undefined:{consume:()=>ledger.consume("STANDALONE")},macro?"ANALYTIC_ONLY":"EXACT");
      recordParticipantFutureReservation(evidence,reservation);
      if(macro&&activeMacroCandidateTrace&&context.depth===activeMacroCandidateTrace.depth)activeMacroCandidateTrace.participantFuture={status:reservation.status,
        cause:reservation.reasonCode??reservation.abstainCause};
      if(macro){evidence.participantFutureMacroAnalyticChecks+=1;
        evidence.participantFutureMacroAnalyticPrunes+=Number(reservation.status==="PRUNE");
        evidence.participantFutureMacroAnalyticAbstentions+=Number(reservation.status==="ABSTAIN");}
      if(reservation.abstainCause==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
      if(reservation.status==="ABSTAIN"){
        if(!macro){
          const outside=reservation.unresolvedDependencyIds.filter(id=>!context.reachableTaskIds.has(id)
            &&!problem.participantMeals?.some(meal=>meal.sourceTaskId===id));
          if(outside.length){
            evidence.participantFutureUnreachableDependencyIds=[...new Set([...evidence.participantFutureUnreachableDependencyIds,...outside])].sort();
            return "DEAD_END";
          }
        }
      }
      if(reservation.status==="PRUNE"){
        const task=causing(reservation.participantId);
        evidence.firstParticipantFutureReservationPrune??={phase:context.phase,causingTaskId:task.id,
          causingCandidateStart:task.start,depth:context.depth,
          ...(context.macroUnitId?{macroUnitId:context.macroUnitId,addedTaskIds:addedTasks.map(({id})=>id).sort(),branchesAtPrune:ledger.branchesExplored}:{}),...reservation};
        return "DEAD_END";
      }
    }
    if((problem.participantMeals?.length??0)>0){
      const probe=probeParticipantMealFutureFeasibility(problem,substantiveContext(state),addedTasks);
      if(context.phase==="MACRO"&&activeMacroCandidateTrace&&context.depth===activeMacroCandidateTrace.depth)activeMacroCandidateTrace.participantMealFuture={status:probe.feasible?"PASS":"PRUNE",
        cause:probe.feasible?null:probe.reasonCodes[0]??"PARTICIPANT_MEAL_INFEASIBLE"};
      evidence.participantMealFutureFeasibilityChecks+=1;evidence.participantMealCheapProbes+=1;
      evidence.participantMealAffectedObligationsChecked+=probe.affectedObligationsChecked;evidence.participantMealAnalyticDomainBuilds+=probe.analyticDomainBuilds;
      evidence.participantMealLogicalGridStarts+=probe.logicalGridStarts;evidence.participantMealAnalyticallyEliminatedStarts+=probe.analyticallyEliminatedStarts;
      evidence.participantMealActuallyEvaluatedStarts+=probe.actuallyEvaluatedStarts;evidence.participantMealZeroDomainPrunes+=probe.zeroDomainPrunes;
      evidence.participantMealAnalyticCollectivePrunes+=probe.analyticCollectivePrunes;evidence.participantMealExactSearchesAvoided+=1;
      if(!probe.feasible){evidence.participantMealFutureInfeasibleBranches+=1;for(const id of probe.blockingMealTaskIds)if(!evidence.participantMealBlockingTaskIds.includes(id))evidence.participantMealBlockingTaskIds.push(id);
        const blockingId=probe.blockingMealTaskIds[0],obligation=problem.participantMeals?.find(meal=>meal.sourceTaskId===blockingId),task=causing(obligation?.participantId??null);
        if(blockingId&&obligation)evidence.firstParticipantMealFuturePrune??={phase:context.phase,causingTaskId:task.id,scheduledCandidateStart:task.start,
          blockingMealTaskId:blockingId,participantId:obligation.participantId,candidateCount:probe.candidateCountByTaskId[blockingId]??0,
          domainResult:probe.zeroDomainPrunes>0?"ZERO_DOMAIN":"ANALYTIC_COLLECTIVE_INFEASIBLE",reasonCodes:[...probe.reasonCodes]};
        return "DEAD_END";}
    }
    if((problem.operationalMealPolicies?.length??0)>0){const probe=operationalMeals.assess(state,addedTasks,
      {remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("STANDALONE",count)},context.phase,context.depth);
      if(context.phase==="MACRO"&&activeMacroCandidateTrace&&context.depth===activeMacroCandidateTrace.depth)activeMacroCandidateTrace.operationalMealFuture={status:probe.status,
        cause:probe.status==="PRUNE"?`${probe.causality??"UNKNOWN_CAUSALITY"}:${probe.blockingPolicyId??"UNKNOWN_POLICY"}:CANDIDATES_${probe.candidateCountBefore??"UNKNOWN"}_TO_${probe.candidateCountAfter??"UNKNOWN"}`
          :probe.status==="ABSTAIN"?"BUDGET_EXHAUSTED":null};
      if(probe.status==="ABSTAIN")return "BUDGET_EXHAUSTED";if(probe.status==="PRUNE")return "DEAD_END";}
    return "PASS";
  };
  const search = (remaining: Task[], placed: ScheduledTask[], preparations: ScheduledSetupPreparation[], roundPreparations: ScheduledRoundPreparation[], depth: number, selectionOrder: string[]): StandaloneOutcome => {
    if(activeMacroCandidateTrace)activeMacroCandidateTrace.enteredOrdinarySearch=true;
    evidence.standaloneMaximumDepth = Math.max(evidence.standaloneMaximumDepth, depth);
    if (remaining.length === 0) {
      return completeAfterOrdinary(placed, preparations, roundPreparations, selectionOrder);
    }
    const alternatives: Positions[] = [];
    const allPlaced = [...coreTasks, ...placed];
    for (const task of [...remaining].sort(byId)) {
      const variants=(task.allowedItinerantUnitIds?.length&&!task.itinerantUnitId
        ?[...task.allowedItinerantUnitIds].sort().map(itinerantUnitId=>({...task,itinerantUnitId}))
        :[task]);
      const variantDomains:Array<{task:Task;starts:number[]}>=[];
      let largestStaticDomain=0;
      evidence.ordinaryDomainQueries += 1;
      for(const variant of variants){
        const staticDomain = ordinaryStaticDomain(variant);
        largestStaticDomain=Math.max(largestStaticDomain,staticDomain.eligibleStartCount);
        const signature = standaloneForwardAuthoritySignature(problem, variant, allPlaced, coreMeals, staticDomain, "STATIC_DOMAIN");
        let domain = ordinaryDomainCache.get(signature);
        if (domain) evidence.ordinaryDomainCacheHits += 1;
        else {
          evidence.ordinaryDomainCacheMisses += 1;
          evidence.ordinaryAnalyticDomainBuilds += 1;
          evidence.ordinaryDomainRecomputations += 1;
          domain = standaloneForwardDynamicDomain(problem, variant, allPlaced, staticDomain);
          if (ordinaryDomainCache.size >= 2048) ordinaryDomainCache.delete(ordinaryDomainCache.keys().next().value!);
          ordinaryDomainCache.set(signature, domain);
        }
        evidence.ordinaryAnalyticEligibleStarts += domain.eligibleStartCount;
        if(domain.eligibleStartCount>0)variantDomains.push({task:variant,starts:[...domain.starts()]});
      }
      if (variantDomains.length === 0) {
        recordDeadEnd({kind:"ORDINARY_ZERO_DYNAMIC_DOMAIN",phase:"ORDINARY",depth,
          workItemId:task.id,workItemKind:task.kind,taskIds:[task.id],domainBefore:largestStaticDomain,
          domainAfter:0,candidatesEvaluated:0,blockingTaskId:null,blockingAuthority:"exactTaskDynamicStartDomain",
          firstPlacementRejection:null,ancestralDecisions:ancestors(selectionOrder,placed)});
        evidence.standaloneZeroAlternativePrunes += 1;
        recordBlockingTask(task);
        return "DEAD_END";
      }
      alternatives.push({ task, variants:variantDomains, starts:variantDomains.flatMap(item=>item.starts),
        effectiveDeadline: Math.min(...variantDomains.map(item=>effectiveDeadline(problem,item.task))) });
    }
    alternatives.sort((a, b) => a.starts.length - b.starts.length || a.effectiveDeadline - b.effectiveDeadline
      || b.task.duration - a.task.duration
      || (b.task.requiredResourceIds?.length ?? 0) - (a.task.requiredResourceIds?.length ?? 0)
      || a.task.id.localeCompare(b.task.id));
    const choice = alternatives[0]!;
    // Prepare the lightweight set of still-pending hard predecessors once for
    // this ordinary node, not once per candidate start.
    evidence.standaloneTaskSelections += 1;
    evidence.standaloneFirstSelectedTaskId ??= choice.task.id;
    evidence.standaloneSelectionsByTaskId[choice.task.id] = (evidence.standaloneSelectionsByTaskId[choice.task.id] ?? 0) + 1;
    evidence.ordinaryMRVSelections += 1;
    evidence.ordinaryExactStartEnumerations += 1;
    const feasibleAssignments = choice.variants.flatMap(variant=>variant.starts.flatMap(start => {
      evidence.ordinaryExactStartChecks += 1;
      evidence.standaloneStartChecks += 1;
      return canPlaceTask(problem, variant.task, start, allPlaced, coreMeals)
        &&preservesRoundOperationalMealReservations({...variant.task,start,end:start+variant.task.duration})
        ?[{task:variant.task,start}]:[];
    }));
    const feasibleStarts=feasibleAssignments.map(item=>item.start);
    evidence.standaloneCandidateStartsByTaskId[choice.task.id]
      = (evidence.standaloneCandidateStartsByTaskId[choice.task.id] ?? 0) + feasibleStarts.length;
    if (feasibleStarts.length === 0) {
      const firstStart=choice.starts[0]!;
      const rejection=diagnoseTaskPlacement(problem,choice.task,firstStart,allPlaced,coreMeals);
      recordDeadEnd({kind:"ORDINARY_STARTS_REJECTED",phase:"ORDINARY",depth,workItemId:choice.task.id,
        workItemKind:choice.task.kind,taskIds:[choice.task.id],domainBefore:ordinaryStaticDomain(choice.task).eligibleStartCount,
        domainAfter:choice.starts.length,candidatesEvaluated:choice.starts.length,
        blockingTaskId:rejection.blockingPlacedTaskId,blockingAuthority:rejection.firstRejectionReason,
        firstPlacementRejection:{start:firstStart,reason:rejection.firstRejectionReason??"UNKNOWN",
          blockingPlacedTaskId:rejection.blockingPlacedTaskId},ancestralDecisions:ancestors(selectionOrder,placed)});
      evidence.standaloneZeroAlternativePrunes += 1;
      recordBlockingTask(choice.task);
      return "DEAD_END";
    }
    const orderedStarts = feasibleAssignments.map(({task,start}) => scoreAuxiliaryTask(problem, task, start,
      allPlaced)).sort((a, b) => a.cost - b.cost || a.scheduled.start - b.scheduled.start
        ||(a.scheduled.itinerantUnitId??"").localeCompare(b.scheduled.itinerantUnitId??"")
        || a.scheduled.id.localeCompare(b.scheduled.id));
    const ordinaryForwardObligations = remaining
      .filter((task) => task.id !== choice.task.id)
      .sort(byId);
    const pendingReservationPrerequisites=[...ordinaryForwardObligations,
      ...pending.filter(task=>transportTaskIds(problem).has(task.id)&&!allPlaced.some(placedTask=>placedTask.id===task.id))]
      .filter((task,index,tasks)=>tasks.findIndex(other=>other.id===task.id)===index).sort(byId);
    for (const { scheduled } of orderedStarts) {
      if (!consumeLeafBranch(depth)) return "BUDGET_EXHAUSTED";
      if (depth + 1 > evidence.standaloneDominantPathFirst20.length && depth < 20) {
        evidence.standaloneDominantPathFirst20 = [...selectionOrder.map((taskId) => ({ taskId, start: placed.find(task=>task.id===taskId)!.start })),
          { taskId: choice.task.id, start: scheduled.start }].slice(0, 20);
      }
      evidence.ordinaryBranchesExplored += 1;
      evidence.ordinaryPrerequisiteReservationChecks += 1;
      const reservation=checkIndividualPendingPrerequisiteReservations(problem,pendingReservationPrerequisites,allPlaced,[scheduled],coreMeals);
      if(!reservation.feasible){
        recordDeadEnd({kind:"PREREQUISITE_RESERVATION_PRUNE",phase:"ORDINARY",depth,
          workItemId:choice.task.id,workItemKind:choice.task.kind,taskIds:[choice.task.id],
          domainBefore:choice.starts.length,domainAfter:feasibleStarts.length,candidatesEvaluated:1,
          blockingTaskId:reservation.blockingTaskId??null,blockingAuthority:"pending-prerequisite-reservation",
          firstPlacementRejection:null,ancestralDecisions:ancestors(selectionOrder,placed)});
        evidence.ordinaryPrerequisiteReservationPrunes += 1;
        evidence.ordinaryIndividualForwardChecks += 1;
        evidence.ordinaryIndividualForwardChecksByDepth[String(depth)]
          = (evidence.ordinaryIndividualForwardChecksByDepth[String(depth)] ?? 0) + 1;
        evidence.ordinaryIndividualForwardTasksChecked += reservation.tasksChecked;
        evidence.ordinaryIndividualForwardExactDomainChecks += reservation.tasksChecked;
        evidence.ordinaryIndividualForwardZeroDomainPrunes += 1;
        evidence.ordinaryIndividualForwardCausingTaskCounts[choice.task.id]
          = (evidence.ordinaryIndividualForwardCausingTaskCounts[choice.task.id] ?? 0) + 1;
        evidence.ordinaryIndividualForwardBlockingTaskCounts[reservation.blockingTaskId!]
          = (evidence.ordinaryIndividualForwardBlockingTaskCounts[reservation.blockingTaskId!] ?? 0) + 1;
        evidence.ordinaryIndividualForwardFirstPrune ??= {causingTaskId:choice.task.id,blockingTaskId:reservation.blockingTaskId!,depth};
        evidence.firstPrerequisiteReservationPrune??={phase:"ORDINARY",causingTaskId:choice.task.id,blockingPrerequisiteId:reservation.blockingTaskId!,depth,
          deadline:reservation.deadline!,duration:reservation.duration!,earliestFeasibleStart:reservation.earliestFeasibleStart,
          latestFeasibleStart:reservation.latestFeasibleStart,failure:"INDIVIDUAL_ZERO_DOMAIN"};
        evidence.standaloneBacktracks += 1;
        continue;
      }
      evidence.ordinaryIndividualForwardChecks += 1;
      evidence.ordinaryIndividualForwardChecksByDepth[String(depth)]
        = (evidence.ordinaryIndividualForwardChecksByDepth[String(depth)] ?? 0) + 1;
      const affectedObligations = ordinaryForwardObligations.filter((task) =>
        tasksCanAffectEachOther(task, choice.task));
      evidence.ordinaryIndividualForwardUnrelatedSkips += ordinaryForwardObligations.length - affectedObligations.length;
      let zeroDomainObligation: Task | null = null;
      const provisionalPlaced = [...allPlaced, scheduled];
      for (const obligation of affectedObligations) {
        evidence.ordinaryIndividualForwardTasksChecked += 1;
        evidence.ordinaryIndividualForwardExactDomainChecks += 1;
        const domain = standaloneForwardDynamicDomain(problem, obligation, provisionalPlaced,
          ordinaryStaticDomain(obligation));
        if (domain.eligibleStartCount > 0) evidence.ordinaryIndividualForwardWitnesses += 1;
        else { zeroDomainObligation = obligation; break; }
      }
      if (zeroDomainObligation) {
        evidence.ordinaryIndividualForwardZeroDomainPrunes += 1;
        evidence.ordinaryIndividualForwardCausingTaskCounts[choice.task.id]
          = (evidence.ordinaryIndividualForwardCausingTaskCounts[choice.task.id] ?? 0) + 1;
        evidence.ordinaryIndividualForwardBlockingTaskCounts[zeroDomainObligation.id]
          = (evidence.ordinaryIndividualForwardBlockingTaskCounts[zeroDomainObligation.id] ?? 0) + 1;
        evidence.ordinaryIndividualForwardFirstPrune ??= {
          causingTaskId: choice.task.id, blockingTaskId: zeroDomainObligation.id, depth,
        };
        evidence.standaloneBacktracks += 1;
        continue;
      }
      const future=assessFutureAuthorities(placed,[scheduled],{phase:"STANDALONE",depth,
        reachableTaskIds:new Set(remaining.filter(({id})=>id!==choice.task.id).map(({id})=>id))});
      if(future==="BUDGET_EXHAUSTED")return future;if(future==="DEAD_END"){evidence.standaloneBacktracks++;continue;}
      const child = search(remaining.filter(({ id }) => id !== choice.task.id), [...placed, scheduled], preparations, roundPreparations, depth + 1,
        [...selectionOrder, choice.task.id]);
      if (child !== "DEAD_END") return child;
      evidence.standaloneBacktracks += 1;
    }
    return "DEAD_END";
  };
const setupSpaceIds = [...new Set(pending.filter((task) => task.setupFamilyId !== undefined).map(({ spaceId }) => spaceId))].sort();
const setupGroups = setupSpaceIds.map((spaceId) => ({
  spaceId,
  tasks: pending.filter((task) => task.spaceId === spaceId && task.setupFamilyId !== undefined).sort(byId),
}));
const mergeSetupOrderCounts = (spaceId: string, counts: Record<string, number>): void => {
  const merged = { ...(evidence.setupFamilyOrderCandidateCountsBySpaceId[spaceId] ?? {}) };
  for (const [key, count] of Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
    merged[key] = (merged[key] ?? 0) + count;
  evidence.setupFamilyOrderCandidateCountsBySpaceId[spaceId] = merged;
};
const synchronizedTaskIds = roundSynchronizationTaskIds(problem);
const roundPolicies = [...(problem.roundSynchronizations ?? [])].sort((left, right) => left.id.localeCompare(right.id));
const roundTaskIds = new Set(roundPolicies.flatMap((policy) => policy.lanes.flatMap((lane) => lane.taskIds)));
const roundPendingIds = new Set(pending.filter((task) => roundTaskIds.has(task.id)).map((task) => task.id));
const roundPlacedIds = new Set(coreTasks.filter((task) => roundTaskIds.has(task.id)).map((task) => task.id));
if ([...roundTaskIds].some((id) => !roundPendingIds.has(id) && !roundPlacedIds.has(id))
  || [...synchronizedTaskIds].some((id) => !roundTaskIds.has(id))) {
  return { outcome: "DEAD_END", tasks: null, preparations: [], roundPreparations: [], selectionOrder: [], participantMeals: null, operationalMeals: null,futureRoundWitnesses:[],futureItinerantWitnesses:[] };
}
const mergeRoundEvidence = (delta: ExactRoundSynchronizationEvidence): void => {
  evidence.roundSynchronizationStartCandidates += delta.startCandidates;
  evidence.roundSynchronizationAssignmentBranches += delta.assignmentBranches;
  evidence.roundSynchronizationAssignmentChecks += delta.assignmentChecks;
  evidence.roundSynchronizationCompleteAssignments += delta.completeAssignments;
  evidence.roundSynchronizationBacktracks += delta.backtracks;
  evidence.roundSynchronizationZeroAlternativePrunes += delta.zeroAlternativePrunes;
  evidence.roundSynchronizationSharedOperationalMealPolicyIds=[...new Set([...evidence.roundSynchronizationSharedOperationalMealPolicyIds,
    ...delta.sharedOperationalMealPolicyIds])].sort();
  evidence.roundSynchronizationBreakVariantsConsidered+=delta.breakVariantsConsidered;
  if(delta.selectedBreakIntervals.length)evidence.roundSynchronizationSelectedBreakIntervals=delta.selectedBreakIntervals;
  evidence.roundSynchronizationMealAwareShapesFeasible+=delta.mealAwareShapesFeasible;
  evidence.roundSynchronizationNoBreakHolePrunes+=delta.noBreakHolePrunes;
  evidence.roundSynchronizationRawCompatibleEdges+=delta.rawCompatibleEdges;
  evidence.roundSynchronizationFutureEdgeChecks+=delta.futureEdgeChecks;
  evidence.roundSynchronizationAnalyticPrunedEdges+=delta.analyticPrunedEdges;
  evidence.roundSynchronizationCausalForbiddenEdges+=delta.causalForbiddenEdges;
  evidence.roundSynchronizationIncrementalRepairs+=delta.incrementalRepairs;
  evidence.roundSynchronizationShapesRescuedByRematching+=delta.shapesRescuedByRematching;
  evidence.roundSynchronizationMatchingTraversals+=delta.matchingTraversals;
  if(delta.terminalFutureResult!=="NOT_CHECKED")evidence.roundSynchronizationTerminalFutureResult=delta.terminalFutureResult;
  evidence.roundSynchronizationMatchingWitnesses.push(...delta.matchingWitnesses);
  evidence.totalesMacroCandidates += delta.startCandidates;
  evidence.totalesMatchingAttempts += delta.matchingAttempts;
  evidence.totalesMatchingSuccesses += delta.matchingSuccesses;
  evidence.totalesAssignmentBranchesAvoided += delta.assignmentBranchesAvoided;
};
const dynamicTransportIds = transportTaskIds(problem);
const pendingById=new Map(pending.map(task=>[task.id,task]));
const departureIds=new Set(problem.transportPolicy?.departure?.taskIds??[]);
const directDeparturePrerequisiteCandidates=new Set(problem.tasks
  .filter(task=>departureIds.has(task.id))
  .flatMap(task=>task.dependencies)
  .filter(id=>pendingById.has(id)&&!dynamicTransportIds.has(id)));
const technicalItems = getTechnicalChains(pending,problem.technicalChains).map((tasks) => ({ id: technicalChainWorkItemKey(tasks[0]!.id), kind: "TECHNICAL_CHAIN" as const, tasks }));
const technicalRepresentativeIds=new Set(technicalItems.flatMap(({tasks})=>tasks.map(({id})=>id)));
const jointItems = jointGroupIds(pending).filter((id)=>!jointGroupMembers(pending,id).some(({id:taskId})=>technicalRepresentativeIds.has(taskId))).map((id) => ({ id: jointWorkItemKey(id), kind: "JOINT" as const, tasks: jointGroupMembers(pending, id) }));
const coupledTaskIds = new Set([...jointItems, ...technicalItems].flatMap(({ tasks }) => tasks.flatMap((task) => task.jointGroupId ? jointGroupMembers(pending,task.jointGroupId).map(({id})=>id) : [task.id])));
const preferredResourceIds=new Set(problem.resources.filter(resource=>resource.presenceConcentrationPolicy==="PREFERRED").map(resource=>resource.id));
const agendaGroups=new Map<string,Task[]>();
for(const task of pending.filter(task=>(task.allowedItinerantUnitIds?.length??0)>1)){
  const key=[...task.allowedItinerantUnitIds!].sort().join("+");agendaGroups.set(key,[...(agendaGroups.get(key)??[]),task]);
}
const agendaItems=[...agendaGroups].map(([domain,tasks])=>({id:`itinerant-agenda:${domain}`,kind:"ITINERANT_AGENDA" as const,
  unitIds:domain.split("+"),tasks:tasks.sort(byId)}));
const agendaTaskIds=new Set(agendaItems.flatMap(item=>item.tasks.map(task=>task.id)));
const rawResourceTasks = pending.filter((task) => (task.requiredResourceIds?.length ?? 0) > 0
  && !coupledTaskIds.has(task.id) && !agendaTaskIds.has(task.id) && !roundTaskIds.has(task.id) && task.setupFamilyId === undefined
  && !dynamicTransportIds.has(task.id));
const preferredGroups=new Map<string,Task[]>();
const individualResourceTasks:Task[]=[];
for(const task of rawResourceTasks){const key=(task.requiredResourceIds??[]).filter(id=>preferredResourceIds.has(id)).sort().join("+");
  if(key)preferredGroups.set(key,[...(preferredGroups.get(key)??[]),task]);else individualResourceTasks.push(task);}
const resourceItems = [...individualResourceTasks.map((task) => ({ id: `resource:${task.id}`, kind: "RESOURCE_TASK" as const, tasks: [task] })),
  ...[...preferredGroups].map(([key,tasks])=>tasks.length===1?({id:`resource:${tasks[0]!.id}`,kind:"RESOURCE_TASK" as const,tasks})
    :({id:`preferred-resource:${key}`,kind:"RESOURCE_GROUP" as const,tasks:tasks.sort(byId)}))];
const roundItems = roundPolicies.filter((policy)=>policy.lanes.some((lane)=>lane.taskIds.some((id)=>roundPendingIds.has(id))))
  .map((policy) => ({ id: `round:${policy.id}`, kind: "ROUND_SYNCHRONIZATION" as const, policy,
  tasks: policy.lanes.flatMap((lane) => lane.taskIds.map((id) => problem.tasks.find((task) => task.id === id)!)).filter(Boolean).sort(byId) }));
const setupItems = setupGroups.map((group) => ({ id: `setup:${group.spaceId}`, kind: "SETUP_GROUP" as const, ...group }));
const absorbedResourceIds=new Set<string>(),absorbedSetupIds=new Set<string>();
const preferredResourceUnits=[...preferredResourceIds].sort().flatMap(resourceId=>{
  const resource=resourceItems.find(item=>item.tasks.every(task=>task.requiredResourceIds?.includes(resourceId)));
  const setup=setupItems.find(item=>item.tasks.length>0&&item.tasks.every(task=>task.requiredResourceIds?.includes(resourceId)));
  if(!resource||!setup)return [];
  absorbedResourceIds.add(resource.id);absorbedSetupIds.add(setup.id);
  return [{id:`preferred-resource-unit:${resourceId}`,kind:"PREFERRED_RESOURCE_UNIT" as const,resourceId,
    resourceTasks:resource.tasks,setupTasks:setup.tasks,tasks:[...resource.tasks,...setup.tasks]}];
});
type MacroUnit = typeof jointItems[number] | typeof technicalItems[number] | typeof resourceItems[number]
  | typeof roundItems[number] | typeof setupItems[number] | typeof preferredResourceUnits[number] | typeof agendaItems[number];
const macroUnits: MacroUnit[] = [...jointItems, ...technicalItems,...agendaItems,
  ...resourceItems.filter(item=>!absorbedResourceIds.has(item.id)),...roundItems,
  ...setupItems.filter(item=>!absorbedSetupIds.has(item.id)),...preferredResourceUnits]
  .sort((left, right) => left.id.localeCompare(right.id));
const macroTaskIds = new Set(macroUnits.flatMap(({ tasks }) => tasks.flatMap((task) => task.jointGroupId ? jointGroupMembers(pending,task.jointGroupId).map(({id})=>id) : [task.id])));
const terminalDeparturePrerequisites=pending.filter(({id})=>directDeparturePrerequisiteCandidates.has(id)&&!macroTaskIds.has(id)).sort(byId);
const terminalDeparturePrerequisiteIds=new Set(terminalDeparturePrerequisites.map(({id})=>id));
const ordinaryPending = pending.filter(({ id }) => !macroTaskIds.has(id) && !dynamicTransportIds.has(id)
  &&!terminalDeparturePrerequisiteIds.has(id)).sort(byId);
if(terminalDeparturePrerequisites.length){
  evidence.terminalDeparturePrerequisiteTaskIds=terminalDeparturePrerequisites.map(({id})=>id);
  completeAfterOrdinary=(placed,preparations,roundPreparations,selectionOrder)=>{
    evidence.terminalDeparturePrerequisitePhaseEntered=true;
    const materialize=(remaining:Task[],terminalPlaced:ScheduledTask[],order:string[]):StandaloneOutcome=>{
      if(!remaining.length){
        const rejectionBefore={...evidence.terminalCompletionRejectionsByCause};
        const result=completeLeaf([...placed,...terminalPlaced],preparations,roundPreparations,[...selectionOrder,...order]);
        if(result==="FOUND")evidence.terminalDeparturePrerequisiteFirstCompleteCandidateAtBranch??=
          evidence.terminalDeparturePrerequisiteBranches;
        else for(const [cause,count] of Object.entries(evidence.terminalCompletionRejectionsByCause)){
          const delta=count-(rejectionBefore[cause as TerminalCompletionRejectionCause]??0);
          if(delta>0)evidence.terminalDeparturePrerequisiteTerminalRejectsByCause[cause]=
            (evidence.terminalDeparturePrerequisiteTerminalRejectsByCause[cause]??0)+delta;
        }
        return result;
      }
      const allPlaced=[...coreTasks,...placed,...terminalPlaced];
      const departureTasks=(problem.transportPolicy?.departure.taskIds??[]).map(id=>problem.tasks.find(task=>task.id===id)).filter((task):task is Task=>Boolean(task));
      const outLatestStart=(task:Task)=>{const out=departureTasks.find(candidate=>candidate.participantId===task.participantId);if(!out)return Number.POSITIVE_INFINITY;const values=[...exactTaskStartDomain(problem,out,allPlaced,coreMeals).starts()];return values.at(-1)??Number.NEGATIVE_INFINITY;};
      const domains=remaining.map(task=>({task,starts:[...exactTaskStartDomain(problem,task,allPlaced,coreMeals).starts()]
        .filter(start=>canPlaceTask(problem,task,start,allPlaced,coreMeals))}))
        .sort((a,b)=>outLatestStart(a.task)-outLatestStart(b.task)||a.starts.length-b.starts.length||effectiveDeadline(problem,a.task)-effectiveDeadline(problem,b.task)
          ||b.task.duration-a.task.duration||a.task.id.localeCompare(b.task.id));
      const choice=domains[0]!;
      if(!choice.starts.length)return "DEAD_END";
      for(const start of [...choice.starts].sort((a,b)=>b-a)){
        if(!ledger.consume("STANDALONE"))return "BUDGET_EXHAUSTED";
        evidence.terminalDeparturePrerequisiteBranches+=1;
        const scheduled=scoreAuxiliaryTask(problem,choice.task,start,allPlaced).scheduled;
        const future=assessFutureAuthorities([...placed,...terminalPlaced],[scheduled],{phase:"STANDALONE",
          depth:selectionOrder.length+order.length,reachableTaskIds:new Set(remaining.filter(task=>task.id!==choice.task.id).map(({id})=>id))});
        if(future==="BUDGET_EXHAUSTED")return future;
        if(future==="DEAD_END")continue;
        const child=materialize(remaining.filter(task=>task.id!==choice.task.id),[...terminalPlaced,scheduled],[...order,choice.task.id]);
        if(child!=="DEAD_END")return child;
      }
      return "DEAD_END";
    };
    return materialize(terminalDeparturePrerequisites,[],[]);
  };
}
const resourceAvailabilityMinutes = (tasks: readonly Task[]): number => {
  const ids = [...new Set(tasks.flatMap((task) => task.requiredResourceIds ?? []))].sort();
  if (ids.length === 0) return problem.day.end - problem.day.start;
  return ids.flatMap((id) => problem.resources.find((resource) => resource.id === id)?.availability ?? [])
    .reduce((sum, interval) => sum + interval.end - interval.start, 0);
};
const macroConstrainedness = (unit: MacroUnit, placed: ScheduledTask[], preparations: ScheduledSetupPreparation[] = [], roundPreparations: ScheduledRoundPreparation[] = []) => {
  const allPlaced = [...coreTasks, ...placed];
  const taskDomain = (task:Task) => {
    let staticDomain=staticMacroDomains.get(task.id);
    if(!staticDomain){staticDomain=standaloneForwardStaticDomain(problem,task,coreMeals);staticMacroDomains.set(task.id,staticDomain);}
    const signature=standaloneForwardAuthoritySignature(problem,task,allPlaced,coreMeals,staticDomain,"STATIC_DOMAIN");
    const cached=macroDomainCache.get(`task:${signature}`);if(cached!==undefined)return cached.domainSize;
    const count=standaloneForwardDynamicDomain(problem,task,allPlaced,staticDomain).eligibleStartCount;
    if(macroDomainCache.size>=4096)macroDomainCache.delete(macroDomainCache.keys().next().value!);
    macroDomainCache.set(`task:${signature}`,{domainSize:count});return count;
  };
  const authoritySignatures=unit.tasks.map((task)=>{let staticDomain=staticMacroDomains.get(task.id);if(!staticDomain){staticDomain=standaloneForwardStaticDomain(problem,task,coreMeals);staticMacroDomains.set(task.id,staticDomain);}return standaloneForwardAuthoritySignature(problem,task,allPlaced,coreMeals,staticDomain,"STATIC_DOMAIN");}).sort();
  const macroSignature=causalHash({id:unit.id,authoritySignatures,preparations:[...preparations].sort(byId),roundPreparations:[...roundPreparations].sort(byId)});
  let measure=macroDomainCache.get(macroSignature);
  if(unit.kind==="TECHNICAL_CHAIN"){evidence.technicalChainMacroDomainQueries+=1;if(measure)evidence.technicalChainMacroDomainCacheHits+=1;else evidence.technicalChainMacroDomainCacheMisses+=1;}
  if(!measure){
    if(unit.kind==="ITINERANT_AGENDA")measure={domainSize:unit.tasks.reduce((sum,task)=>sum+(task.allowedItinerantUnitIds?.length??0),0)};
    else if(unit.kind==="RESOURCE_TASK")measure={domainSize:taskDomain(unit.tasks[0]!)};
    else if(unit.kind==="RESOURCE_GROUP")measure={domainSize:Math.min(...unit.tasks.map(taskDomain))};
    else if(unit.kind==="PREFERRED_RESOURCE_UNIT")measure={domainSize:Math.min(...unit.tasks.map(taskDomain))};
    else if(unit.kind==="JOINT")measure={domainSize:standaloneJointGroupStartDomain(problem,unit.tasks,allPlaced,coreMeals).eligibleStartCount};
    else if(unit.kind==="ROUND_SYNCHRONIZATION")measure=probeExactRoundSynchronizationMacroDomain(problem,unit.policy,allPlaced,preparations,roundPreparations,coreMeals);
    else if(unit.kind==="SETUP_GROUP")measure=probeExactSetupMacroDomain(problem,unit.tasks,allPlaced,preparations,coreMeals);
    else measure={domainSize:probeExactTechnicalChainMacroDomain(problem,unit.tasks,allPlaced,technicalChainStartDomainMode,coreMeals)};
    if(macroDomainCache.size>=4096)macroDomainCache.delete(macroDomainCache.keys().next().value!);macroDomainCache.set(macroSignature,measure);
  }
  if(unit.kind==="TECHNICAL_CHAIN")evidence.technicalChainMacroDomainCandidates+=measure.domainSize;
  const resourceIds = [...new Set(unit.tasks.flatMap((task) => task.requiredResourceIds ?? []))];
  const synchronizedSlotCount = unit.kind === "ROUND_SYNCHRONIZATION"
    ? Math.min(...unit.policy.lanes.map((lane) => lane.taskIds.length))
    : unit.kind === "JOINT" ? unit.tasks.length : 0;
  return { unit, id: unit.id, domainSize:measure.domainSize, domainMeasure:"hard-valid-top-level-macro-placements", domainExact:true,
    structuralCandidateCount:measure.structuralCandidateCount,matchingFeasibleCandidateCount:measure.matchingFeasibleCandidateCount,
    hardResourceAvailabilityMinutes: resourceAvailabilityMinutes(unit.tasks),
    exclusiveResourceCount: resourceIds.length, synchronizedSlotCount,
    totalDuration: unit.tasks.reduce((sum, task) => sum + task.duration, 0), affectedTaskCount: unit.tasks.length };
};
const selectionReason = (selected: ReturnType<typeof macroConstrainedness>, candidates: ReturnType<typeof macroConstrainedness>[]): string => {
  const peers = candidates.filter(({ id }) => id !== selected.id);
  if (peers.some((item) => item.domainSize !== selected.domainSize)) return "minimum-macro-domain";
  if (peers.some((item) => item.hardResourceAvailabilityMinutes !== selected.hardResourceAvailabilityMinutes)) return "resource-availability-tiebreak";
  if (peers.some((item) => item.exclusiveResourceCount !== selected.exclusiveResourceCount)) return "exclusive-resource-tiebreak";
  if (peers.some((item) => item.synchronizedSlotCount !== selected.synchronizedSlotCount)) return "synchronization-tiebreak";
  if (peers.some((item) => item.totalDuration !== selected.totalDuration)) return "duration-tiebreak";
  if (peers.some((item) => item.affectedTaskCount !== selected.affectedTaskCount)) return "affected-task-count-tiebreak";
  return "canonical-id-tiebreak";
};
const recordMacroDecision = (depth: number, selected: ReturnType<typeof macroConstrainedness>, candidates: ReturnType<typeof macroConstrainedness>[]): void => {
  evidence.macroDomainSizes[selected.id] = selected.domainSize;
  if (evidence.macroSelectionSteps.length > depth) return;
  const reason = selectionReason(selected, candidates);
  evidence.macroUnitsSelected += 1;
  evidence.macroSelectionOrder.push(`${selected.unit.kind}:${selected.id}`);
  evidence.macroSelectionReason.push(reason);
  evidence.macroSelectionSteps.push({ selected: selected.id, reason, candidates: candidates.map((candidate) => ({
    id: candidate.id, kind: candidate.unit.kind, domainSize: candidate.domainSize,
    domainMeasure:candidate.domainMeasure,domainExact:candidate.domainExact,
    hardResourceAvailabilityMinutes: candidate.hardResourceAvailabilityMinutes,totalDuration:candidate.totalDuration,
    affectedTaskCount:candidate.affectedTaskCount,structuralCandidateCount:candidate.structuralCandidateCount,
    matchingFeasibleCandidateCount:candidate.matchingFeasibleCandidateCount,
  })).sort((left, right) => left.id.localeCompare(right.id)) });
};
const mergeTechnicalDiagnostics = (explorer: ReturnType<typeof createTechnicalChainExplorer>, accounted: {
  consumed:number;full:number;eligible:number;eliminated:number;complete:number;deferred:number;revisited:number;pushes:number;pops:number;builds:number;hits:number;scans:number;domainMs:number;checkMs:number;rootStarts:number;
}): boolean => {
  const diagnostics=explorer.diagnostics;
  const consumedDelta=explorer.consumed-accounted.consumed;
  if(consumedDelta>0&&!ledger.consume("STANDALONE",consumedDelta))return false;
  evidence.technicalChainFullGridStarts+=diagnostics.fullGridStarts-accounted.full;
  evidence.technicalChainAnalyticEligibleStarts+=diagnostics.analyticEligibleStarts-accounted.eligible;
  evidence.technicalChainAnalyticallyEliminatedStarts+=diagnostics.analyticallyEliminatedStarts-accounted.eliminated;
  evidence.technicalChainStartsEvaluated+=diagnostics.startsEvaluated-accounted.consumed;
  evidence.technicalChainPreparedAuthorityBuilds+=diagnostics.preparedAuthorityBuilds-accounted.builds;
  evidence.technicalChainPreparedAuthorityHits+=diagnostics.preparedAuthorityHits-accounted.hits;
  evidence.technicalChainFixedPlacedScansAvoided+=diagnostics.fixedPlacedScansAvoided-accounted.scans;
  evidence.technicalChainDomainBuildMs+=diagnostics.domainBuildMs-accounted.domainMs;
  evidence.technicalChainFinalPlacementCheckMs+=diagnostics.finalPlacementCheckMs-accounted.checkMs;
  evidence.technicalChainCompleteCandidates+=diagnostics.completeCandidatesYielded-accounted.complete;
  evidence.technicalChainAlternativesDeferred+=diagnostics.alternativesDeferred-accounted.deferred;
  evidence.technicalChainAlternativesRevisited+=diagnostics.alternativesRevisited-accounted.revisited;
  evidence.technicalChainActiveFrontierPeak=Math.max(evidence.technicalChainActiveFrontierPeak,diagnostics.activeFrontierPeak);
  evidence.technicalChainDeferredQueuePeak=Math.max(evidence.technicalChainDeferredQueuePeak,diagnostics.deferredQueuePeak);
  evidence.technicalChainDeferredPushes+=diagnostics.deferredPushes-accounted.pushes;
  evidence.technicalChainDeferredPops+=diagnostics.deferredPops-accounted.pops;
  evidence.technicalChainRootStartsConsidered+=diagnostics.startsExplored-accounted.rootStarts;
  evidence.technicalChainRootStartsFeasible+=diagnostics.completeCandidatesYielded-accounted.complete;
  evidence.technicalChainBranchesExplored+=consumedDelta;
  Object.assign(accounted,{consumed:explorer.consumed,full:diagnostics.fullGridStarts,eligible:diagnostics.analyticEligibleStarts,
    eliminated:diagnostics.analyticallyEliminatedStarts,complete:diagnostics.completeCandidatesYielded,
    deferred:diagnostics.alternativesDeferred,revisited:diagnostics.alternativesRevisited,pushes:diagnostics.deferredPushes,
    pops:diagnostics.deferredPops,builds:diagnostics.preparedAuthorityBuilds,hits:diagnostics.preparedAuthorityHits,
    scans:diagnostics.fixedPlacedScansAvoided,domainMs:diagnostics.domainBuildMs,checkMs:diagnostics.finalPlacementCheckMs,rootStarts:diagnostics.startsExplored});
  return true;
};
const searchMacroUnits = (remainingUnits: MacroUnit[], placed: ScheduledTask[], preparations: ScheduledSetupPreparation[],
  roundPreparations: ScheduledRoundPreparation[], depth: number, selectionOrder: string[]): StandaloneOutcome => {
  if(remainingUnits.length===0&&problem.analyticalFutureCollectiveContinuation&&(problem.participantMeals?.length??0)>0){
    const originalMeals=problem.participantMeals!,coreLength=coreTasks.length;
    let result:StandaloneOutcome="DEAD_END";
    const witness=assessParticipantMealFutureFeasibility(problem,[...coreTasks,...placed],
      {remaining:ledger.limit-ledger.branchesExplored,consume:(count=1)=>ledger.consume("STANDALONE",count)},"MATERIALIZE",(meals,complete)=>{
        const gate=closureCheck([...coreTasks,...placed],meals,false);
        if(gate.reason==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
        if(gate.status==="INFEASIBLE")return "REJECT";
        if(!complete)return "ACCEPT";
        reservedParticipantMeals=meals;
        problem.participantMeals=originalMeals.map(obligation=>{
          const reserved=meals.find(meal=>meal.sourceTaskId===obligation.sourceTaskId)!;
          return {...obligation,fixedInterval:{start:reserved.start,end:reserved.end}};
        });
        coreTasks.push(...meals.map(meal=>({id:meal.sourceTaskId,kind:"auxiliary" as const,spaceId:"",participantId:meal.participantId,
          duration:meal.duration,start:meal.start,end:meal.end,dependencies:originalMeals.find(item=>item.sourceTaskId===meal.sourceTaskId)?.dependencies??[],
          participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0})));
        try{result=search(ordinaryPending,placed,preparations,roundPreparations,placed.length,selectionOrder);}
        finally{coreTasks.splice(coreLength);reservedParticipantMeals=[];problem.participantMeals=originalMeals;}
        return result==="FOUND"?"ACCEPT":result==="BUDGET_EXHAUSTED"?"BUDGET_EXHAUSTED":"REJECT";
      });
    evidence.participantMealBranchesExplored+=witness.branchesExplored;
    evidence.participantMealExactMaterializations++;
    return witness.reasonCodes.includes("PARTICIPANT_MEAL_BRANCH_BUDGET_EXHAUSTED")?"BUDGET_EXHAUSTED":result;
  }
  if (remainingUnits.length === 0) return search(ordinaryPending, placed, preparations, roundPreparations, placed.length, selectionOrder);
  if(activeMacroCandidateTrace&&depth>activeMacroCandidateTrace.depth)activeMacroCandidateTrace.selectedAnotherMacroUnit=true;
  const constrained = remainingUnits.map((unit) => macroConstrainedness(unit, placed, preparations, roundPreparations));
  const selected = selectMostConstrainedUnit(constrained)!;
  recordMacroDecision(depth, selected, constrained);
  const unit = selected.unit;
  const rest = remainingUnits.filter(({ id }) => id !== unit.id);
  let candidatesEvaluated=0;
  const macroDomainAuthority=({JOINT:"standaloneJointGroupStartDomain",RESOURCE_TASK:"standaloneForwardDynamicDomain",RESOURCE_GROUP:"preferredResourceGroupDomain",PREFERRED_RESOURCE_UNIT:"exactPreferredResourceUnit",
    ROUND_SYNCHRONIZATION:"probeExactRoundSynchronizationMacroDomain",SETUP_GROUP:"probeExactSetupMacroDomain",ITINERANT_AGENDA:"exactItinerantAgenda",
    TECHNICAL_CHAIN:"probeExactTechnicalChainMacroDomain"} as const)[unit.kind];
  const chainContext=unit.kind==="TECHNICAL_CHAIN"?partialTechnicalChainContext(problem,unit.tasks,[...coreTasks,...placed]):null;
  if(selected.domainSize===0)recordDeadEnd({kind:"MACRO_ZERO_DOMAIN",phase:"MACRO",depth,
    workItemId:unit.id,workItemKind:unit.kind,taskIds:unit.tasks.map(({id})=>id).sort(),
    domainBefore:selected.structuralCandidateCount??selected.domainSize,
    domainAfter:0,candidatesEvaluated:0,blockingTaskId:null,blockingAuthority:macroDomainAuthority,
    firstPlacementRejection:null,ancestralDecisions:ancestors(selectionOrder,placed),
    ...(chainContext?{technicalChainPolicyId:chainContext.policyId,technicalChainPendingTaskIds:chainContext.pendingTaskIds,
      technicalChainFixedTaskIds:chainContext.fixedTaskIds,technicalChainContradiction:"NO_FEASIBLE_PENDING_MATERIALIZATION" as const}:{})});
  const recurse = (tasks: ScheduledTask[], nextPreparations = preparations, nextRoundPreparations = roundPreparations,
    operationalMealReservations:readonly {policyId:string;start:number;end:number}[]=[]): StandaloneOutcome => {
    if(activeRoundOperationalMealReservations.length&&(!tasks.every(preservesRoundOperationalMealReservations)
      ||!preparationsPreserveRoundOperationalMealReservations(nextPreparations)
      ||!preparationsPreserveRoundOperationalMealReservations(nextRoundPreparations)))return "DEAD_END";
    const rootTrace:MacroCandidateCausalTrace|null=depth===0&&!activeMacroCandidateTrace?{
      fingerprint:causalHash({macroUnitId:unit.id,tasks:[...tasks].sort(byId).map(({id,start,end})=>({id,start,end}))}),
      macroUnitId:unit.id,macroUnitKind:unit.kind,depth,
      candidate:{starts:[...tasks].sort(byId).map(({id:taskId,start,end})=>({taskId,start,end})),domainSize:selected.domainSize,
        structuralCandidateCount:selected.structuralCandidateCount??null,matchingFeasibleCandidateCount:selected.matchingFeasibleCandidateCount??null,
        roundMatchingResult:unit.kind==="ROUND_SYNCHRONIZATION"?"MATCHING_FEASIBLE" as const:"NOT_APPLICABLE" as const},
      pendingPrerequisiteReservation:{status:"PASS" as const,cause:null,blockingTaskId:null,authorityId:null},
      participantFuture:{status:"NOT_CHECKED" as const,cause:null},participantMealFuture:{status:"PASS" as const,cause:"NO_APPLICABLE_OBLIGATION"},
      operationalMealFuture:{status:"PASS" as const,cause:"NO_APPLICABLE_POLICY"},enteredRecurseAfterMacro:false,selectedAnotherMacroUnit:false,
      enteredOrdinarySearch:false,firstDescendantDeadEnd:null,firstOrdinaryRejection:null,reachedCompleteLeaf:false,
      terminalParticipantFuture:{status:"NOT_CHECKED" as const,cause:null},outcome:"DEAD_ENDED_BY_AUTHORITY" as const,
    }:null;
    const previousOperationalMealReservations=activeRoundOperationalMealReservations;
    activeRoundOperationalMealReservations=[...previousOperationalMealReservations,...operationalMealReservations];
    if(rootTrace)activeMacroCandidateTrace=rootTrace;
    const finish=(result:StandaloneOutcome,pruned=false):StandaloneOutcome=>{activeRoundOperationalMealReservations=previousOperationalMealReservations;if(!rootTrace)return result;
      rootTrace.outcome=pruned?"PRUNED":rootTrace.enteredOrdinarySearch||rootTrace.reachedCompleteLeaf
        ?"ENTERED_RESIDUAL_OR_TERMINAL":"DEAD_ENDED_BY_AUTHORITY";
      evidence.macroCandidateCausalTraces.push(rootTrace);const reconciliation=evidence.macroCandidateCausalReconciliation;
      reconciliation.total+=1;if(rootTrace.outcome==="PRUNED")reconciliation.pruned+=1;
      else if(rootTrace.outcome==="DEAD_ENDED_BY_AUTHORITY")reconciliation.deadEndedByAuthority+=1;
      else reconciliation.enteredResidualOrTerminal+=1;activeMacroCandidateTrace=null;return result;};
    const pendingForCheck=[...ordinaryPending,...rest.flatMap(item=>item.tasks)].filter((task,index,array)=>array.findIndex(item=>item.id===task.id)===index);
    const checked=checkMacroPendingPrerequisites(problem,pendingForCheck,[...coreTasks,...placed],tasks,coreMeals,macroPendingPrerequisiteCache);
    evidence.macroPendingPrerequisiteForwardChecks+=1;evidence.macroPendingPrerequisiteTasksChecked+=checked.tasksChecked;
    evidence.macroPendingPrerequisiteIndividualDomainChecks+=checked.individualDomainChecks;evidence.macroPendingPrerequisiteJointChecks+=checked.jointChecks;
    evidence.macroPendingPrerequisiteCollectiveCapacityChecks+=checked.collectiveCapacityChecks;evidence.macroPendingPrerequisiteObligationsChecked+=checked.obligationsChecked;evidence.macroPendingPrerequisiteCollectiveCapacityPrunes+=checked.collectiveCapacityPrunes;
    evidence.macroPendingPrerequisiteWitnesses+=checked.witnesses;evidence.macroPendingPrerequisiteChecksByDepth[String(depth)]=(evidence.macroPendingPrerequisiteChecksByDepth[String(depth)]??0)+1;
    if(checked.cacheHit)evidence.macroPendingPrerequisiteCacheHits+=1;else evidence.macroPendingPrerequisiteCacheMisses+=1;
    if(rootTrace)rootTrace.pendingPrerequisiteReservation={status:checked.feasible?"PASS":"PRUNE",cause:checked.failure,
      blockingTaskId:checked.blockingTaskId,authorityId:checked.authorityId};
    if(!checked.feasible){evidence.macroPendingPrerequisitePrunes+=1;if(checked.failure==="INDIVIDUAL_ZERO_DOMAIN")evidence.macroPendingPrerequisiteIndividualZeroDomainPrunes+=1;else if(checked.failure==="JOINT_INFEASIBLE")evidence.macroPendingPrerequisiteJointInfeasiblePrunes+=1;
      recordDeadEnd({kind:"PREREQUISITE_RESERVATION_PRUNE",phase:"MACRO",depth,workItemId:unit.id,
        workItemKind:unit.kind,taskIds:unit.tasks.map(({id})=>id).sort(),domainBefore:selected.domainSize,
        domainAfter:selected.domainSize,candidatesEvaluated,blockingTaskId:checked.blockingTaskId??null,
        blockingAuthority:checked.authorityId??checked.failure??"pending-prerequisite-reservation",
        firstPlacementRejection:null,ancestralDecisions:ancestors(selectionOrder,placed)});
      if(checked.blockingTaskId)evidence.macroPendingPrerequisiteBlockingTaskCounts[checked.blockingTaskId]=(evidence.macroPendingPrerequisiteBlockingTaskCounts[checked.blockingTaskId]??0)+1;
      evidence.macroPendingPrerequisiteCausingMacroUnitCounts[unit.id]=(evidence.macroPendingPrerequisiteCausingMacroUnitCounts[unit.id]??0)+1;
      evidence.macroPendingPrerequisiteFirstPrune??={causingMacroUnitId:unit.id,blockingTaskId:checked.blockingTaskId??"unknown",macroDepth:depth,deadline:checked.deadline,failure:checked.failure??"unknown",authorityId:checked.authorityId,demandMinutes:checked.demandMinutes,freeCapacityMinutes:checked.freeCapacityMinutes};return finish("DEAD_END",true);}
    const future=assessFutureAuthorities(placed,tasks,{phase:"MACRO",depth,macroUnitId:unit.id,
      reachableTaskIds:new Set(pendingForCheck.map(({id})=>id))});
    if(future!=="PASS")return finish(future,true);
    if(rootTrace)rootTrace.enteredRecurseAfterMacro=true;
    return finish(searchMacroUnits(rest, [...placed, ...tasks], nextPreparations, nextRoundPreparations, depth + 1,[...selectionOrder, ...tasks.map(({ id }) => id)]));
  };
  if(unit.kind==="ITINERANT_AGENDA"){
    evidence.itinerantAgendaPoolOperations+=unit.tasks.length;
    evidence.itinerantAgendaBranchesBeforeSelection??=ledger.branchesExplored;
    for(const task of unit.tasks)evidence.itinerantAgendaUnitVariantsByTaskId[task.id]=task.allowedItinerantUnitIds?.length??0;
    const frontier=itinerantAgendaStructuralFrontier(problem,unit.unitIds,[...coreTasks,...placed]);
    const identity=[...unit.unitIds].sort().join("+");
    const candidatePrior=priorWitnesses.find((item):item is Extract<FutureStructuralWitness,{kind:"ITINERANT_AGENDA"}>=>(item.kind==="ITINERANT_AGENDA"&&item.identity===identity));
    const supporting=priorWitnesses.find(item=>item.kind==="FIXED_SUPPORTING_PIPELINE");
    evidence.priorItinerantWitnessFound=Boolean(candidatePrior);
    if(candidatePrior){
      const prerequisiteTasks=candidatePrior.prerequisiteTaskPlacements.map(item=>problem.tasks.find(task=>task.id===item.id)).filter((task):task is Task=>Boolean(task));
      const revalidated=revalidateFutureItinerantAgendaWitness(problem,identity,unit.unitIds,unit.tasks,prerequisiteTasks,
        [...coreTasks,...placed],coreMeals,supporting?.fingerprint??null,candidatePrior);
      evidence.priorItinerantWitnessRevalidation=revalidated.status==="PASS"?"PASS":revalidated.status;
      if(revalidated.status==="PASS"){
        const outcome=recurse([...revalidated.agenda]);
        if(outcome==="FOUND"){evidence.priorItinerantWitnessReused=true;return outcome;}
        if(outcome==="BUDGET_EXHAUSTED")return outcome;
        evidence.priorItinerantWitnessRevalidation="REJECT";evidence.priorItinerantWitnessRejectCause="CONTINUATION_REJECTED";
      }else evidence.priorItinerantWitnessRejectCause=revalidated.reason;
      evidence.priorItinerantWitnessFallbackEntered=true;
    }
    const searched=searchExactItinerantAgenda(problem,unit.tasks,unit.unitIds,[...coreTasks,...placed],coreMeals,frontier,
      ()=>ledger.consume("STANDALONE"),scheduled=>{evidence.itinerantAgendaCandidates++;
        evidence.itinerantAgendaFirstCompleteBranch??=evidence.itinerantAgendaBranches+scheduled.length;
        return recurse([...scheduled]) as "FOUND"|"DEAD_END"|"BUDGET_EXHAUSTED";});
    evidence.itinerantAgendaBranches+=searched.branches;evidence.itinerantAgendaAssignmentsAndOrders+=searched.branches;
    evidence.itinerantAgendaEventBoundaryStarts+=searched.branches;
    if(searched.outcome!=="DEAD_END")return searched.outcome==="FOUND"?"FOUND":searched.outcome;
  } else if(unit.kind==="PREFERRED_RESOURCE_UNIT"){
    let selectedPresence:[number,number,number]|null=null;
    const explored=exploreExactPreferredResourceUnit({problem,resourceId:unit.resourceId,
      resourceTasks:unit.resourceTasks,setupTasks:unit.setupTasks,placed:[...coreTasks,...placed],preparations,meals:coreMeals,ledger,
      continuation:(candidate)=>{candidatesEvaluated+=1;
        jointMacroConflict.value=null;
        const exactPrunesBefore=evidence.participantFutureTerminalExactPrunes;
        const exactPassesBefore=evidence.participantFutureTerminalExactPasses;
        const exactAbstentionsBefore=evidence.participantFutureTerminalExactAbstentions;
        const mealPrunesBefore=evidence.participantMealFutureInfeasibleBranches;
        const outcome=recurse([...candidate.tasks],[...preparations,...candidate.preparations],roundPreparations,
          candidate.operationalMealReservations.map(({id,start,end})=>({policyId:id,start,end})));
        const terminalFutureResult=evidence.participantFutureTerminalExactPrunes>exactPrunesBefore?"PRUNE"
          :evidence.participantFutureTerminalExactPasses>exactPassesBefore?"PASS"
          :evidence.participantFutureTerminalExactAbstentions>exactAbstentionsBefore?"ABSTAIN":"NOT_CHECKED";
        if(outcome!=="DEAD_END")selectedPresence=[...candidate.presence];
        const conflict=currentJointMacroConflict();
        return{outcome,participantFutureExactPrune:terminalFutureResult==="PRUNE",
          participantMealPrune:evidence.participantMealFutureInfeasibleBranches>mealPrunesBefore,terminalFutureResult,
          jointConflictTaskIds:conflict?.unitId===unit.id?conflict.taskIds:undefined};
      },authorities:{necessaryEdgeProbe}});
    evidence.setupBlockSearchInvocations+=1;
    evidence.preferredResourceUnit={unitId:unit.id,memberTaskCount:unit.tasks.length,resourceTaskCount:unit.resourceTasks.length,
      setupTaskCount:unit.setupTasks.length,sharedResourceId:unit.resourceId,geometryCount:explored.evidence.geometryCount,
      matchingAttempts:explored.evidence.matchingAttempts,matchingSuccesses:explored.evidence.matchingSuccesses,supportingRematches:0,selectedPresence,
      rawCompatibleEdges:explored.evidence.rawCompatibleEdges,futureEdgeChecks:explored.evidence.futureEdgeChecks,
      analyticPrunedEdges:explored.evidence.analyticPrunedEdges,matchingTraversals:explored.evidence.matchingTraversals,
      mealEdgeChecks:explored.evidence.mealEdgeChecks,mealPrunedEdges:explored.evidence.mealPrunedEdges,
      mealAwareGeometries:explored.evidence.mealAwareGeometries,mealReservationVariants:explored.evidence.mealReservationVariants,
      selectedOperationalMealReservations:explored.evidence.selectedOperationalMealReservations.map(({id,start,end})=>({id,start,end})),
      firstMealPrunedEdge:explored.evidence.firstMealPrunedEdge,blockingMealTaskId:explored.evidence.blockingMealTaskId,
      causalForbiddenEdges:explored.evidence.causalForbiddenEdges,incrementalRepairs:explored.evidence.incrementalRepairs,
      geometriesRescuedByRematching:explored.evidence.geometriesRescuedByRematching,
      firstMatchingWitness:explored.evidence.firstMatchingWitness,selectedMatchingWitness:explored.evidence.selectedMatchingWitness,
      terminalFutureResult:explored.evidence.terminalFutureResult};
    evidence.setupBlockCompleteCandidateCount+=explored.evidence.matchingSuccesses;
    if(explored.outcome!=="DEAD_END")return explored.outcome;
  } else if(unit.kind==="RESOURCE_GROUP"){
    const scheduleGroup=(remaining:readonly Task[],scheduled:ScheduledTask[]):StandaloneOutcome=>{
      if(!remaining.length)return recurse(scheduled);
      const domains=remaining.map(task=>({task,domain:standaloneForwardDynamicDomain(problem,task,[...coreTasks,...placed,...scheduled],standaloneForwardStaticDomain(problem,task,coreMeals))}))
        .sort((a,b)=>a.domain.eligibleStartCount-b.domain.eligibleStartCount||a.task.id.localeCompare(b.task.id));
      const selectedTask=domains[0]!;
      for(const start of selectedTask.domain.starts()){
        if(!ledger.consume("STANDALONE"))return "BUDGET_EXHAUSTED";
        candidatesEvaluated++;const next=scoreAuxiliaryTask(problem,selectedTask.task,start,[...coreTasks,...placed,...scheduled]).scheduled;
        const outcome=scheduleGroup(remaining.filter(task=>task.id!==selectedTask.task.id),[...scheduled,next]);
        if(outcome!=="DEAD_END")return outcome;evidence.standaloneBacktracks++;
      }
      return "DEAD_END";
    };
    const outcome=scheduleGroup(unit.tasks,[]);if(outcome!=="DEAD_END")return outcome;
  } else if (unit.kind === "JOINT" || unit.kind === "RESOURCE_TASK") {
    const duration = unit.tasks[0]!.duration;
    const fullGridCount = Math.max(0, Math.floor((problem.day.end - duration - problem.day.start) / 5) + 1);
    const domain = unit.kind === "JOINT" ? standaloneJointGroupStartDomain(problem, unit.tasks, [...coreTasks, ...placed], coreMeals)
      : standaloneForwardDynamicDomain(problem, unit.tasks[0]!, [...coreTasks, ...placed], standaloneForwardStaticDomain(problem, unit.tasks[0]!, coreMeals));
    evidence.jointGroupFullGridStarts += fullGridCount;
    evidence.jointGroupAnalyticEligibleStarts += domain.eligibleStartCount;
    evidence.jointGroupAnalyticallyEliminatedStarts += fullGridCount-domain.eligibleStartCount;
    const starts = unit.kind === "JOINT" && jointGroupStartDomainMode === "FULL_GRID"
      ? (function* () { for (let start=problem.day.start;start+duration<=problem.day.end;start+=5) yield start; })()
      : domain.starts();
    for (const start of starts) {
      if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
      evidence.jointGroupStartsEvaluated += 1; evidence.criticalResourceBranches += 1;
      candidatesEvaluated += 1;
      if (unit.kind === "JOINT" && !canPlaceJointGroup(problem, unit.tasks, start, [...coreTasks, ...placed])) continue;
      if (unit.kind === "RESOURCE_TASK" && !canPlaceTask(problem, unit.tasks[0]!, start, [...coreTasks, ...placed], coreMeals)) continue;
      const scheduled = unit.kind === "JOINT" ? scheduleJointGroup(unit.tasks, start)
        : [scoreAuxiliaryTask(problem, unit.tasks[0]!, start, [...coreTasks, ...placed]).scheduled];
      evidence.criticalResourceMacroCandidates += 1; evidence.criticalResourceAssignments += scheduled.length;
      const child = recurse(scheduled); if (child !== "DEAD_END") return child; evidence.standaloneBacktracks += 1;
    }
  } else if (unit.kind === "SETUP_GROUP") {
    evidence.setupBlockSearchInvocations += 1;
    const generated = generateExactSetupBlockCandidates(problem, unit.tasks, [...coreTasks, ...placed], preparations, coreMeals, ledger);
    evidence.setupBlockBranchesExplored += generated.evidence.branchesExplored;
    evidence.setupBlockStartsExplored += generated.evidence.startsExplored;
    evidence.setupBlockCompleteCandidateCount += generated.evidence.completeCandidateCount;
    evidence.setupBlockMatchingAttempts += generated.evidence.matchingAttempts;
    evidence.setupBlockMatchingSuccesses += generated.evidence.matchingSuccesses;
    evidence.setupBlockPermutationBranchesAvoided += generated.evidence.permutationBranchesAvoided;
    mergeSetupOrderCounts(unit.spaceId, generated.evidence.familyOrderCandidateCounts);
    if (generated.outcome === "BUDGET_EXHAUSTED") { evidence.setupBlockBudgetExhaustions += 1; return "BUDGET_EXHAUSTED"; }
    for (const candidate of generated.candidates) {
      candidatesEvaluated += 1;
      const child = recurse(candidate.tasks, [...preparations, ...candidate.preparations]);
      if (child !== "DEAD_END") return child; evidence.standaloneBacktracks += 1;
    }
  } else if (unit.kind === "ROUND_SYNCHRONIZATION") {
    evidence.roundSynchronizationSearchInvocations += 1;
    const explored = exploreExactRoundSynchronizationPolicy(problem, unit.policy, [...coreTasks, ...placed], preparations,
      roundPreparations, coreMeals, ledger, (candidate) => {
        jointMacroConflict.value=null;
        const exactPrunesBefore=evidence.participantFutureTerminalExactPrunes;
        const exactPassesBefore=evidence.participantFutureTerminalExactPasses;
        const exactAbstentionsBefore=evidence.participantFutureTerminalExactAbstentions;
        const outcome=recurse(candidate.tasks, preparations,[...roundPreparations, ...candidate.preparations],candidate.operationalMealReservations);
        const terminalFutureResult=evidence.participantFutureTerminalExactPrunes>exactPrunesBefore?"PRUNE"
          :evidence.participantFutureTerminalExactPasses>exactPassesBefore?"PASS"
          :evidence.participantFutureTerminalExactAbstentions>exactAbstentionsBefore?"ABSTAIN":"NOT_CHECKED";
        const conflict=currentJointMacroConflict();
        return {outcome,participantFutureExactPrune:terminalFutureResult==="PRUNE",terminalFutureResult,
          ...(conflict?.unitId===unit.id?{matchingReject:{authority:"COLLECTIVE_CLOSURE" as const,causalTaskIds:conflict.taskIds}}:{})};
      },{jointContinuation:Boolean(problem.analyticalFutureCollectiveContinuation),necessaryEdgeProbe});
    candidatesEvaluated=explored.evidence.completeAssignments;
    mergeRoundEvidence(explored.evidence);
    if(explored.outcome!=="DEAD_END")return explored.outcome;
  } else {
    const explorer=createTechnicalChainExplorer(problem,unit.tasks,[...coreTasks,...placed],Math.max(0,ledger.limit-ledger.branchesExplored),
      technicalChainStartDomainMode,coreMeals,"INCREMENTAL_HEAP",false);
    const accounted={consumed:0,full:0,eligible:0,eliminated:0,complete:0,deferred:0,revisited:0,pushes:0,pops:0,builds:0,hits:0,scans:0,domainMs:0,checkMs:0,rootStarts:0};
    while(true){const candidate=explorer.nextCandidate();if(!mergeTechnicalDiagnostics(explorer,accounted))return "BUDGET_EXHAUSTED";
      if(explorer.exhausted){ledger.consume("STANDALONE");return "BUDGET_EXHAUSTED";}
      if(!candidate)break;candidatesEvaluated+=1;const child=recurse(candidate.tasks);if(child!=="DEAD_END")return child;evidence.standaloneBacktracks+=1;}
  }
  recordDeadEnd({kind:selected.domainSize===0?"MACRO_ZERO_DOMAIN":"MACRO_CANDIDATES_EXHAUSTED",phase:"MACRO",depth,
    workItemId:unit.id,workItemKind:unit.kind,taskIds:unit.tasks.map(({id})=>id).sort(),domainBefore:selected.domainSize,
    domainAfter:selected.domainSize,candidatesEvaluated,blockingTaskId:null,blockingAuthority:macroDomainAuthority,
    firstPlacementRejection:null,ancestralDecisions:ancestors(selectionOrder,placed),
    ...(selected.domainSize===0&&chainContext?{technicalChainPolicyId:chainContext.policyId,technicalChainPendingTaskIds:chainContext.pendingTaskIds,
      technicalChainFixedTaskIds:chainContext.fixedTaskIds,technicalChainContradiction:"NO_FEASIBLE_PENDING_MATERIALIZATION" as const}:{})});
  for (const task of unit.tasks) recordBlockingTask(task);
  return "DEAD_END";
};
const searchOutcome = searchMacroUnits(macroUnits, [], [...fixedSetupPreparations], [...fixedRoundPreparations], 0, []);
const outcome = searchOutcome === "DEAD_END" && found !== null ? "FOUND"
  : searchOutcome === "DEAD_END" && evidence.futureCollectiveClosureInconclusiveLeaves > inconclusiveLeavesBefore ? "INCONCLUSIVE" : searchOutcome;
evidence.futureWitnessSet.finalSet=foundFutureWitnessSet;
for(const [identity,row] of Object.entries(evidence.futureWitnessSet.byIdentity))row.priorReused=foundPriorReusedIdentities.includes(identity);
evidence.standaloneBranchesAfterFirstOrdinaryCompleteLeaf = evidence.standaloneBranchesBeforeFirstOrdinaryCompleteLeaf === null
  ? 0 : ledger.standaloneBranches - invocationStartBranches - evidence.standaloneBranchesBeforeFirstOrdinaryCompleteLeaf;
const dominantBlocker = Object.entries(evidence.standaloneBlockingTaskCounts)
  .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
evidence.standaloneFirstDominantBlocker = dominantBlocker ? { taskId: dominantBlocker[0], count: dominantBlocker[1] } : null;
return { outcome, tasks: found, preparations: foundPreparations, roundPreparations: foundRoundPreparations, selectionOrder: foundOrder, participantMeals: foundParticipantMeals, operationalMeals: foundOperationalMeals,futureRoundWitnesses:foundFutureRoundWitnesses,futureItinerantWitnesses:foundFutureItinerantWitnesses };
}

/** Continues every hard-valid exact-core leaf with exact standalone DFS under one shared budget. */
export interface ExactItinerantPlanSearchOptions {
  coreOrderer?: Pick<ExactMainAndFeederSearchOptions, "mainChoiceComparator" | "futureEdgeIntrusion" | "onMainChoicesRanked" | "onMainChoiceEntered" | "onMainChoiceAccepted" | "feederStartDomainMode">;
  standaloneCompletionSelection?: StandaloneCompletionSelection;
  /** Test oracle only; production always uses the exact analytic static domain. */
  standaloneForwardStartDomainMode?: StandaloneForwardStartDomainMode;
  /** Test oracle only; production intersects exact member domains before projecting grid starts. */
  jointGroupStartDomainMode?: JointGroupStartDomainMode;
  /** Test oracle only; production removes exact technical-chain impossibility regions analytically. */
  technicalChainStartDomainMode?:TechnicalChainStartDomainMode;
  /** Test oracle only; production memoizes positive block-closed witnesses locally. */
  standaloneForwardWitnessMemoization?: boolean;
  causalDiagnostic?: boolean;
  /** Assisted-only exact violation baseline; never relaxes placement feasibility. */
  acceptsValidation?: (validation: import("./contracts").ValidationSummary) => boolean;
  /** Immutable Assisted placements, materialized before residual search. */
  fixedPlacements?: readonly ScheduledTask[];
  fixedPlacementsAsContext?: boolean;
  fixedSetupPreparations?: readonly ScheduledSetupPreparation[];
  fixedRoundPreparations?: readonly ScheduledRoundPreparation[];
  priorFutureStructuralWitnesses?:readonly import("./anonymousPipelineWitness").FutureStructuralWitness[];
  priorFutureStructuralWitness?:Extract<import("./anonymousPipelineWitness").FutureStructuralWitness,{kind:"FIXED_SUPPORTING_PIPELINE"}>;
  /** Identity-free anonymous pipeline architecture to evaluate before normal enumeration. */
  preferredArchitecture?: MainFeederArchitecture;
  preferredBundleCandidate?: Readonly<{scheduledTasks:readonly ScheduledTask[];matching:ReadonlyMap<string,number>;
    forbiddenEdges:ReadonlySet<string>}>
  repairPreferredBundleCandidate?: ExactMainAndFeederSearchOptions["repairPreferredBundleCandidate"];
}

export function runExactItinerantPlanSearch(problem: PlannerNextProblem,
  options: ExactItinerantPlanSearchOptions = {}): ExactItinerantPlanResult {
  const completeSelectionMode = options.standaloneCompletionSelection ?? "FIRST_HARD_VALID";
  const ledger = createExactSearchLedger(problem.budget.maxBranchExpansions);
  // One authority per execution: core callbacks reuse the current witness, known
  // alternatives, and the resumable explorer instead of restarting factorial work.
  const futureTechnicalChains=new PreparedFutureTechnicalChainAuthority(problem,
    ()=>Math.max(0,ledger.limit-ledger.branchesExplored),count=>ledger.consume("CORE",count),options.fixedPlacements??[]);
  const coreMainMealAuthority=mainFlowMealPolicy(problem);
  const coreOperationalMealProblem:PlannerNextProblem=coreMainMealAuthority?.source==="OPERATIONAL_MEAL_POLICY"
    ?{...problem,operationalMealPolicies:(problem.operationalMealPolicies??[]).filter(policy=>!coreMainMealAuthority.sourceIds.includes(policy.id))}:problem;
  const operationalMeals=new PreparedOperationalMealAuthority(coreOperationalMealProblem);
  const acceptedContinuation={witness:null as Extract<FutureStructuralWitness,{kind:"FIXED_SUPPORTING_PIPELINE"}>|null};
  const evidence: ExactItinerantPlanEvidence = {
    branchesExplored: 0, coreBranches: 0, standaloneBranches: 0, standaloneStartChecks: 0,
    jointGroupFullGridStarts: 0, jointGroupAnalyticEligibleStarts: 0,
    jointGroupAnalyticallyEliminatedStarts: 0, jointGroupStartsEvaluated: 0,
    technicalChainFullGridStarts:0,technicalChainAnalyticEligibleStarts:0,
    technicalChainAnalyticallyEliminatedStarts:0,technicalChainStartsEvaluated:0,
    technicalChainPreparedAuthorityBuilds:0,technicalChainPreparedAuthorityHits:0,
    technicalChainFixedPlacedScansAvoided:0,technicalChainDomainBuildMs:0,technicalChainFinalPlacementCheckMs:0,
    technicalChainCompleteCandidates:0,technicalChainActiveFrontierPeak:0,
    technicalChainAlternativesDeferred:0,technicalChainAlternativesRevisited:0,
    technicalChainDeferredQueuePeak:0,technicalChainDeferredPushes:0,technicalChainDeferredPops:0,
    technicalChainMacroDomainQueries:0,technicalChainMacroDomainCandidates:0,technicalChainMacroDomainCacheHits:0,technicalChainMacroDomainCacheMisses:0,
    technicalChainRootStartsConsidered:0,technicalChainRootStartsFeasible:0,technicalChainBranchesExplored:0,
    standaloneTaskSelections: 0, standaloneZeroAlternativePrunes: 0, standaloneBacktracks: 0,
    standaloneMaximumDepth: 0, standaloneCompleteLeafCount: 0, macroCandidateCausalTraces:[],
    macroCandidateCausalReconciliation:{total:0,pruned:0,deadEndedByAuthority:0,enteredResidualOrTerminal:0}, coreCompleteLeavesEvaluated: 0,
    standaloneBranchesByDepth:{},standaloneSelectionsByTaskId:{},standaloneCandidateStartsByTaskId:{},
    standaloneFirstSelectedTaskId:null,standaloneDominantPathFirst20:[],standaloneFirstDominantBlocker:null,
    standaloneBranchesBeforeFirstOrdinaryCompleteLeaf:null,standaloneBranchesAfterFirstOrdinaryCompleteLeaf:0,
    terminalTransportMaterializationAttempts:0,terminalTransportMaterializationFailures:0,terminalTransportWitness:null,
    terminalCompletionRejectionsByCause:{SUBSTANTIVE_IDENTITY_INCOMPLETE:0,PARTICIPANT_MEAL_WITNESS_INCOMPLETE:0,
      OPERATIONAL_MEAL_WITNESS_INCOMPLETE:0,TRANSPORT_MATERIALIZATION_FAILED:0,CANDIDATE_IDENTITY_MISMATCH:0,VALIDATION_REJECTED:0},
    firstTerminalCompletionRejection:null,
    terminalDeparturePrerequisitePhaseEntered:false,terminalDeparturePrerequisiteTaskIds:[],
    terminalDeparturePrerequisiteBranches:0,terminalDeparturePrerequisiteFirstCompleteCandidateAtBranch:null,
    terminalDeparturePrerequisiteTerminalRejectsByCause:{},
    coreLeafTransportPrunes:0,transportContiguousStates:0,membershipFallbackEntered:0,coreLeafArrivalEvidence:null,firstHardValidCoreLeaf:null,
    supportingGeometryRepairAttempts:0,supportingGeometryRepairSuccesses:0,firstSupportingGeometryRepair:null,
    firstHardValidCoreTasks:[],
    coreLeavesRejectedByStandalone: 0, standaloneSearchInvocations: 0, standaloneBlockingTaskCounts: {},
    standaloneForwardChecks: 0, standaloneForwardStartChecks: 0, standaloneForwardWitnessesFound: 0,
    standaloneForwardPrunes: 0, standaloneForwardBlockingTaskCounts: {}, standaloneForwardPrunesByDepth: {},
    standaloneForwardImpactedTaskChecks: 0, standaloneLeafSearchBranches: 0, standaloneForwardBranches: 0,
    standaloneForwardStaticEligibleStarts: 0, standaloneForwardStaticEliminatedStarts: 0,
    standaloneForwardFullGridStarts: 0, standaloneForwardDynamicEligibleStarts: 0,
    standaloneForwardDynamicEliminatedStarts: 0, standaloneForwardDynamicNonemptyCertificates: 0,
    standaloneForwardOracleChecks: 0, standaloneForwardOracleFallbacks: 0,
    standaloneForwardOracleFallbackReasons: {}, standaloneForwardAnalyticEmptyDomainPrunes: 0,
    standaloneForwardWitnessCacheHits: 0, standaloneForwardWitnessCacheMisses: 0,
    standaloneForwardWitnessCacheEntries: 0, standaloneForwardWitnessBranchesAvoided: 0,
    firstStandaloneForwardPruneDepth: null, lastStandaloneForwardPruneDepth: null,
    lastStandaloneForwardBlockingTaskId: null, lastStandaloneForwardCausingCoreTaskIds: [],
    lastStandaloneForwardCausingMainTaskId: null, lastStandaloneForwardCausingFeederStart: null,
    selectedStandaloneTaskIds: [], selectedStandaloneStarts: {}, selectedStandaloneSelectionOrder: [],
    coreFingerprint: null, selectedCoreFingerprint: null, defaultCoreFingerprint: null, fullFingerprint: null,
    remainingTaskIds: [], coreStatus: "INFEASIBLE", coreReasonCodes: [], reasonCodes: [], coreBacktracks: 0,
    coreMaximumDepth: 0, coreCompleteLeafCount: 0,patternCandidatesExplored:0,timelineCandidatesExplored:0,
    mainCandidatesEvaluated:0,feederCandidatesEvaluated:0,deepestCoreDepthReached:0,
    deepestPartialScheduledTaskCount:0,deepestPartialMainRunsClosed:0,deepestPartialFeederRunsClosed:0,
    deepestPartialCoreTasksRemaining:0,deepestPartialFrontierFingerprint:null,architecturesChecked:0,
    architecturesStructurallyRejected:0,structuralRejectionsByReason:{},firstExactArchitecture:null,firstFeedableRunSizes:[],
    feederOrderBranchesByArchitecture:{},feederOrderBranches:0,feederSlotAnalyticChecks:0,
    feederSlotAnalyticPrunes:0,feederSlotAnalyticAbstentions:0,feederSlotMatchingChecks:0,
    feederSlotMatchingPrunes:0,feederSlotMatchingEdgeChecks:0,feederSlotMatchingAugmentTraversals:0,
    feederSlotMatchingBranchesExplored:0,feederCohortCapacityChecks:0,
    feederCohortPrefixCapacityPrunes:0,feederCohortEddChecks:0,feederCohortEddEmptyPrunes:0,
    blockStartsEliminatedByCohortBound:0,feederCohortContiguousWindowChecks:0,
    feederCohortContiguousWindowPrunes:0,blockStartsEliminatedByContiguousWindowBound:0,
    contiguousWindowSkippedByTransition:0,contiguousWindowSkippedByAuthorizedMeal:0,
    feederRunOptimisticChecks:0,feederRunOptimisticPrunes:0,feederRunOptimisticPrunesByDepth:{},
    feederRunPrePartialChecks:0,feederRunPrePartialPrunes:0,feederRunPrePartialPrunesByDepth:{},
    feederRunPreFeederChecks:0,feederRunPreFeederPrunes:0,feederRunPreFeederPrunesByDepth:{},
    feederRunOptimisticSkippedByTransition:0,feederRunOptimisticSkippedByAuthorizedMeal:0,
    residualMatchingInvocations: 0, residualMatchingFullBuilds: 0,
    residualMatchingIncrementalUpdates: 0, residualMatchingEdgeCacheHits: 0,
    residualMatchingEdgeCacheMisses: 0, residualMatchingPositionChecks: 0,
    residualMatchingAugmentTraversals: 0, residualMatchingBranchesExplored: 0,
    residualMatchingPrunes: 0, residualMatchingRepairs: 0, residualMatchingRepairFailures: 0,
    futureReservationStructures:problem.analyticalFutureTechnicalChains?.length??0,futureReservationWitnessesEvaluated:0,
    futureReservationRootOrdersEvaluated:0,futureReservationCandidatesRejectedByOtherReservations:0,
    futureReservationCandidatesRejectedByNoBundleMatching:0,futureReservationBundleMatchingAttempts:0,
    futureReservationPerfectMatchings:0,futureReservationSelectedFingerprint:null,architecturesTriedWithFutureReservation:0,
    bundleEdgesBeforeReservation:0,bundleEdgesRejectedByReservation:0,bundleEdgesAfterReservation:0,
    residualDfsEntered:false,residualDfsBranchesBeforeFirstSolution:null,
    architecturesEnumerated:0,architecturesPrepared:0,futureWitnessesTriedByArchitecture:{},preparedBundleEdges:0,
    reservationFilteredEdges:0,perfectMatchingsByArchitecture:{},hardGateRejectsByArchitecture:{},structuralSearchExhausted:false,
    participantBundleEdgesChecked:0,participantBundleEdgesPruned:0,participantBundleEdgesAbstained:0,firstParticipantBundleEdgePrune:null,
    structuralSearchBudgetExhausted:false,structuralArchitecturesFullyVisited:0,structuralFutureDomainsFullyVisited:0,
    structuralCandidatesProducedBeforeBudgetExhaustion:0,conditionedLeafFutureRevalidations:0,
    conditionedLeafFutureRevalidationPasses:0,conditionedLeafFutureRevalidationRejects:0,
    genericFutureAssessSkippedForConditionedLeaf:0,structuralCandidateFingerprintAtHardGate:null,
    structuralCandidateFingerprintAtContinuation:null,structuralCandidateFingerprintBeforeStandalone:null,
    branchesBeforeResidualDfs:null,selectedArchitectureFingerprint:null,selectedFutureReservationFingerprint:null,
    mainPatternCountGenerated:0,mainPatternGenerationExhausted:false,mainPatternsVisited:0,timelinesGenerated:0,
    architectureStructuralProofChecks:0,architectureStructuralProofRejects:0,architectureStructuralRejectsByReason:{},
    nominalPipelineWitnessChecks:0,nominalPipelineWitnessFeasible:0,nominalPipelineWitnessInfeasible:0,
    nominalPipelineWitnessInconclusive:0,nominalPipelineWitnessRejectsByReason:{},continuityRejects:0,authorizedArchitecturesYielded:0,
    selectedPipelineWitnessDiagnostic:null,selectedPipelineWitnessAuthority:null,
    mainWitnessChoicesFollowed: 0, mainWitnessFallbacks: 0,
    mainRunWitnessAttempts:0,mainRunWitnessRepairs:0,mainRunEquivalentOrdersCollapsed:0,
    bundleMatchingAttempts:0,bundleMatchingRepairs:0,bundleMatchingMaterializations:0,bundleHardValidationRejects:0,
    bundleCertifiedRepairs:0,bundleForbiddenEdges:[],bundleRepairSequence:[],bundleTerminalCause:null,
    bundleNogoodsCreated:0,bundleNogoodBranches:0,bundleNogoodDeduplications:0,bundleNogoodRepairsSucceeded:0,
    conflictEdges:[],conflictBackjumps:0,suffixDepthsSkipped:0,
    fixedMainBundlePathEntered:false,protectedMainCount:0,protectedMainArchitectureFingerprint:null,protectedMainSlots:[],
    fixedMainBundleGraphPrepared:false,fixedMainBundlePreparedEdges:0,fixedMainBundleCandidatePositions:{},
    fixedMainBundleZeroDomainTaskIds:[],fixedMainBundleParticipantEdgeChecks:0,fixedMainBundleParticipantEdgePrunes:0,
    fixedMainBundleFirstParticipantEdgePrune:null,fixedMainBundleMatchingAttempts:0,
    fixedMainBundlePerfectMatchingFound:false,fixedMainBundleHardGatePasses:0,fixedMainBundleHardGateRejects:0,
    fixedMainBundleTaskCount:0,fixedMainBundleTasksByKind:{},protectedMainSlotChecks:0,protectedMainSlotMismatches:0,
    fixedSupportingGeometryFingerprint:null,fixedSupportingMatchingAttempts:0,fixedSupportingEdges:0,
    fixedSupportingZeroDomainTaskIds:[],fixedSupportingPerfectMatchingFound:false,fixedSupportingRematchedIdentityCount:0,
    fixedSupportingArrivalResult:null,fixedSupportingArrivalPacketCount:0,fixedSupportingSameGeometryRescued:false,
    fixedSupportingGeometriesAttempted:[],fixedSupportingGeometryFailure:null,fixedSupportingGlobalFailure:null,
    fixedSupportingWitnessDiagnostic:null,fixedSupportingWitnessAuthority:null,
    priorFutureStructuralWitnessFound:false,priorFutureStructuralWitnessFingerprint:null,priorFutureStructuralWitnessRevalidation:null,
    priorFutureStructuralWitnessRejectCause:null,priorFutureStructuralWitnessRejectDetails:null,
    priorFutureStructuralWitnessReused:false,priorFutureStructuralWitnessFallbackEntered:false,futureStructuralWitnesses:[],
    futureWitnessSet:createFutureWitnessSetEvidence(),futureWitnessSetCandidateTraces:[],
    ...createFutureCollectiveClosureEvidence(),
    futureRoundWitnessSearchInvocations:0,futureRoundWitnessStructuralCandidates:0,
    futureRoundWitnessCompleteMatchings:0,futureRoundWitnessParticipantFutureChecks:0,
    futureRoundWitnessPrerequisiteChecks:0,futureRoundWitnessBranchesConsumed:0,
    futureItinerantWitnessSearchInvocations:0,futureItinerantWitnessCandidates:0,futureItinerantWitnessBranchesConsumed:0,
    futureItinerantWitnessesFound:0,futureItinerantWitnessFingerprint:null,futureItinerantWitnessSupportingFingerprint:null,
    futureItinerantWitnessRejectsByAuthority:{},futureItinerantWitnessFirstReject:null,
    futureItinerantPriorRevalidation:null,futureItinerantPriorRejectCause:null,
    futureItinerantPriorPreviousFrontier:null,futureItinerantPriorCurrentFrontier:null,
    futureItinerantPriorRevalidationMs:0,futureItinerantPrerequisiteSearchMs:0,futureItinerantStructuralSearchMs:0,
    futureItinerantParticipantFutureMs:0,futureItinerantTechnicalFutureMs:0,futureItinerantParticipantMealsMs:0,
    futureItinerantOperationalMealsMs:0,
    priorItinerantWitnessFound:false,priorItinerantWitnessRevalidation:null,priorItinerantWitnessRejectCause:null,
    priorItinerantWitnessReused:false,priorItinerantWitnessFallbackEntered:false,
    ephemeralSupportingPlacements:[],acceptedSupportingPlacements:[],branchesBeforeCurrentContinuation:null,
    pipelineTasksRemovedFromStandalone:0,pendingBeforeFixedMainBundle:0,pendingAfterFixedMainBundle:0,
    legacyFixedFeederFallbackEntered:false,legacyFixedFeederFallbackReason:null,firstFixedMainBundleRejection:null,firstFixedMainBundleHardGateDiagnostic:null,
    feederMatchingWitnessMaterializations:0,feederMatchingWitnessRepairs:0,
    feederMatchingEquivalentOrdersCollapsed:0,feederOrderFallbacks:0,
    forcedMainSingletonChecks: 0, forcedMainSingletonChoices: 0,
    forcedMainSiblingAlternativesEliminated: 0, forcedMainSingletonDeadEnds: 0,
    mainCandidatesExploredBeforeCohort: {},
    lastExhaustionPhase: null,
    completePlansObserved: 0, completeIncumbentReplacements: 0, completeSelectionMode,
    completeSelectionStoppedByBudget: false, firstCompleteFingerprint: null, selectedCompleteFingerprint: null,
    firstCompleteQuality: null, selectedCompleteQuality: null,
    setupBlockBranchesExplored: 0, setupBlockSearchInvocations: 0, setupBlockStartsExplored: 0,
    setupBlockCompleteCandidateCount: 0, setupBlockBudgetExhaustions: 0,
    setupBlockMatchingAttempts: 0, setupBlockMatchingSuccesses: 0, setupBlockPermutationBranchesAvoided: 0,
    preferredResourceUnit:null,
    setupFamilyOrderCandidateCountsBySpaceId: {}, selectedSetupFamilySequenceBySpaceId: {},
    selectedSetupPreparationIds: [],
    roundSynchronizationSearchInvocations: 0, roundSynchronizationStartCandidates: 0,
    roundSynchronizationAssignmentBranches: 0, roundSynchronizationAssignmentChecks: 0,
    roundSynchronizationCompleteAssignments: 0, roundSynchronizationBacktracks: 0,
    roundSynchronizationZeroAlternativePrunes: 0,roundSynchronizationSharedOperationalMealPolicyIds:[],
    roundSynchronizationBreakVariantsConsidered:0,roundSynchronizationSelectedBreakIntervals:[],
    roundSynchronizationMealAwareShapesFeasible:0,roundSynchronizationNoBreakHolePrunes:0,
    roundSynchronizationRawCompatibleEdges:0,roundSynchronizationFutureEdgeChecks:0,roundSynchronizationAnalyticPrunedEdges:0,
    roundSynchronizationCausalForbiddenEdges:0,roundSynchronizationIncrementalRepairs:0,
    roundSynchronizationShapesRescuedByRematching:0,roundSynchronizationMatchingTraversals:0,
    roundSynchronizationTerminalFutureResult:"NOT_CHECKED",roundSynchronizationMatchingWitnesses:[], selectedRoundPreparationIds: [],
    totalesMacroCandidates:0,totalesMatchingAttempts:0,totalesMatchingSuccesses:0,totalesAssignmentBranchesAvoided:0,
    criticalResourceBranches:0,criticalResourceMacroCandidates:0,criticalResourceAssignments:0,
    macroUnitsSelected:0,macroSelectionOrder:[],macroSelectionReason:[],macroDomainSizes:{},macroSelectionSteps:[],
    macroPendingPrerequisiteForwardChecks:0,macroPendingPrerequisiteTasksChecked:0,macroPendingPrerequisiteIndividualDomainChecks:0,
    macroPendingPrerequisiteCollectiveCapacityChecks:0,macroPendingPrerequisiteObligationsChecked:0,macroPendingPrerequisiteCollectiveCapacityPrunes:0,
    macroPendingPrerequisiteJointChecks:0,macroPendingPrerequisiteCacheHits:0,macroPendingPrerequisiteCacheMisses:0,
    macroPendingPrerequisitePrunes:0,macroPendingPrerequisiteIndividualZeroDomainPrunes:0,macroPendingPrerequisiteJointInfeasiblePrunes:0,
    macroPendingPrerequisiteWitnesses:0,macroPendingPrerequisiteChecksByDepth:{},macroPendingPrerequisiteBlockingTaskCounts:{},macroPendingPrerequisiteCausingMacroUnitCounts:{},macroPendingPrerequisiteFirstPrune:null,
    ordinaryDomainQueries:0,ordinaryAnalyticDomainBuilds:0,ordinaryAnalyticEligibleStarts:0,
    ordinaryExactStartEnumerations:0,ordinaryExactStartChecks:0,ordinaryDomainCacheHits:0,
    ordinaryDomainCacheMisses:0,ordinaryDomainRecomputations:0,ordinaryMRVSelections:0,ordinaryBranchesExplored:0,
    itinerantAgendaPoolOperations:0,itinerantAgendaUnitVariantsByTaskId:{},itinerantAgendaStaticStarts:0,
    itinerantAgendaDynamicStarts:0,itinerantAgendaBranchesBeforeSelection:null,itinerantAgendaBranches:0,
    itinerantAgendaCandidates:0,itinerantAgendaAssignmentsAndOrders:0,itinerantAgendaEventBoundaryStarts:0,
    itinerantAgendaFirstCompleteBranch:null,
    ordinaryIndividualForwardChecks:0,ordinaryIndividualForwardTasksChecked:0,
    ordinaryIndividualForwardExactDomainChecks:0,ordinaryIndividualForwardStartsChecked:0,
    ordinaryIndividualForwardZeroDomainPrunes:0,ordinaryIndividualForwardUnrelatedSkips:0,
    ordinaryIndividualForwardWitnesses:0,ordinaryIndividualForwardCausingTaskCounts:{},
    ordinaryIndividualForwardBlockingTaskCounts:{},ordinaryIndividualForwardChecksByDepth:{},
    ordinaryIndividualForwardFirstPrune:null,
    corePrerequisiteReservationChecks:0,corePrerequisiteReservationPrunes:0,
    ordinaryPrerequisiteReservationChecks:0,ordinaryPrerequisiteReservationPrunes:0,firstPrerequisiteReservationPrune:null,
    firstStandaloneDeadEndCause:null,
    standaloneBlockingTaskDetails:{},
    participantMealBranchesExplored:0,participantMealFutureFeasibilityChecks:0,participantMealFutureInfeasibleBranches:0,participantMealCheapProbes:0,participantMealAffectedObligationsChecked:0,participantMealAnalyticDomainBuilds:0,participantMealLogicalGridStarts:0,participantMealAnalyticallyEliminatedStarts:0,participantMealActuallyEvaluatedStarts:0,participantMealZeroDomainPrunes:0,participantMealAnalyticCollectivePrunes:0,participantMealExactSearchesAvoided:0,participantMealExactMaterializations:0,participantMealBlockingTaskIds:[],participantMealAcceptedWitnessFingerprint:null,participantMealFinalSelectionOrder:[],participantMealAttemptedSelectionTrace:[],firstParticipantMealFuturePrune:null,participantFutureReservationChecks:0,participantFutureReservationPasses:0,participantFutureReservationPrunes:0,participantFutureReservationAbstentions:0,participantFutureAffectedParticipants:0,participantFutureTasksChecked:0,participantFutureMealsChecked:0,participantFutureIndividualDomainChecks:0,participantFutureIndividualZeroDomainPrunes:0,participantFutureJointTaskMealChecks:0,participantFutureJointTaskMealPrunes:0,participantFutureCollectiveChecks:0,participantFutureCollectivePasses:0,participantFutureCollectivePrunes:0,participantFutureCompatiblePairChecks:0,participantFutureAnalyticChecks:0,participantFutureBranchesConsumed:0,participantFutureDominatedLaterStartsSkipped:0,participantFutureEarliestDominanceBranches:0,participantFutureMacroAnalyticChecks:0,participantFutureMacroAnalyticPrunes:0,participantFutureMacroAnalyticAbstentions:0,participantFutureTerminalExactChecks:0,participantFutureTerminalExactPasses:0,participantFutureTerminalExactPrunes:0,participantFutureTerminalExactAbstentions:0,participantFutureTerminalExactBranches:0,firstParticipantFutureTerminalExact:null,firstParticipantFutureReservationPrune:null,participantFutureUnreachableDependencyIds:[],technicalChainFutureReservationChecks:0,technicalChainFutureReservationPasses:0,technicalChainFutureReservationPrunes:0,technicalChainFutureReservationAbstentions:0,technicalChainFutureBranchesConsumed:0,firstTechnicalChainFutureReservationPrune:null,firstMultiDecisionConflict:null,preparedFutureTechnicalChainEvidence:futureTechnicalChains.evidence,operationalMealFutureReservation:operationalMeals.evidence,fixedMainFeederMealChecks:0,fixedMainFeederMealPasses:0,fixedMainFeederMealPrunes:0,firstFixedMainFeederMealPrune:null,standaloneEntryMealWitness:null,causalDiagnostic:null,
  };
  let selectedTasks: ScheduledTask[] | null = null, selectedPreparations: ScheduledSetupPreparation[] = [], selectedRoundPreparations: ScheduledRoundPreparation[] = [], selectedMeals: ScheduledSpaceMeal[] = [], selectedParticipantMeals: ParticipantMealWitness | null = null, selectedOperationalMeals: OperationalMealWitness | null = null, selectedCoreIds = new Set<string>();
  let selectedFutureRoundWitnesses:FutureRoundSynchronizationWitnessV1[]=[];
  let selectedFutureItinerantWitnesses:FutureItinerantAgendaWitnessV1[]=[];
  const priorJoint=options.priorFutureStructuralWitnesses?.find((item):item is Extract<FutureStructuralWitness,{kind:"JOINT_COMPLETION"}>=>item.kind==="JOINT_COMPLETION");
  if(priorJoint&&problem.analyticalFutureCollectiveContinuation){
    const source=problem.analyticalFutureCollectiveContinuation;
    const replay=revalidateJointCompletionWitness(source,priorJoint,options.fixedPlacements??[],()=>ledger.consume("STANDALONE"));
    const preparationsPreserved=(options.fixedSetupPreparations??[]).every(fixed=>priorJoint.preparations.some(item=>JSON.stringify(item)===JSON.stringify(fixed)))
      &&(options.fixedRoundPreparations??[]).every(fixed=>priorJoint.roundPreparations.some(item=>JSON.stringify(item)===JSON.stringify(fixed)));
    if(replay==="PASS"&&preparationsPreserved){
      const ids=new Set(problem.tasks.map(task=>task.id));
      const tasks=priorJoint.tasks.filter(task=>ids.has(task.id));
      const preparations=priorJoint.preparations.filter(prep=>problem.tasks.some(task=>task.spaceId===prep.spaceId&&task.setupFamilyId===prep.setupFamilyId));
      const rounds=priorJoint.roundPreparations.filter(prep=>problem.roundSynchronizations?.some(policy=>policy.id===prep.synchronizationId));
      const meals=priorJoint.participantMeals.filter(meal=>problem.participantMeals?.some(item=>item.sourceTaskId===meal.sourceTaskId));
      const resourceMeals=(problem.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
      const unitMeals=materializeScheduledItinerantUnitMeals(problem);
      const closure=new PreparedFutureCollectiveParticipantClosure(source).evaluate(priorJoint.tasks,priorJoint.participantMeals,()=>ledger.consume("STANDALONE"));
      if(closure.certified&&validatePlan(problem,tasks,preparations,[...priorJoint.spaceMeals],meals,resourceMeals,unitMeals,rounds,[...priorJoint.operationalMeals]).hardValid){
        evidence.branchesExplored=ledger.branchesExplored;evidence.coreBranches=ledger.coreBranches;evidence.standaloneBranches=ledger.standaloneBranches;
        evidence.futureStructuralWitnesses=[structuredClone(priorJoint)];
        evidence.futureCollectiveClosureWitnessFingerprint=closure.witnessFingerprint;
        evidence.futureCollectiveClosureBranchesConsumed=closure.branchesConsumed;
        evidence.futureCollectiveClosureLastCertificate={fingerprint:closure.witnessFingerprint!,contextTaskIds:priorJoint.tasks.map(task=>task.id).sort(),
          closureTaskIds:new PreparedFutureCollectiveParticipantClosure(source).closureTaskIds(),mealTaskIds:priorJoint.participantMeals.map(meal=>meal.sourceTaskId).sort(),
          departureTaskIds:[...(source.transportPolicy?.departure.taskIds??[])].sort()};
        evidence.fullFingerprint=fingerprint(tasks,preparations,[...priorJoint.spaceMeals],unitMeals,rounds,[...priorJoint.operationalMeals]);
        return {status:"COMPLETE",complete:true,scheduledTasks:tasks,scheduledSetupPreparations:preparations,scheduledRoundPreparations:rounds,
          scheduledParticipantMeals:meals,scheduledOperationalMeals:[...priorJoint.operationalMeals],scheduledSpaceMeals:[...priorJoint.spaceMeals],
          scheduledResourceMeals:resourceMeals,scheduledItinerantUnitMeals:unitMeals,remainingTaskIds:[],evidence};
      }
    }
  }
  const staticCoreIds = new Set(problem.tasks.filter(({ kind }) => kind === "main" || kind === "vocal").map(({ id }) => id));
  const fixedIds=new Set((options.fixedPlacements??[]).map(item=>item.id));
  for (const id of anchoredTaskIds(problem)) staticCoreIds.add(id);
  const standaloneTasks = problem.tasks.filter(({ id }) => !staticCoreIds.has(id)&&!fixedIds.has(id)).sort(byId);
  const unsupported = unsupportedShapeReasons(problem, standaloneTasks, staticCoreIds);
  const collectiveClosure = new PreparedFutureCollectiveParticipantClosure(problem);
  // A dependency outside every context-producing explorer cannot be supplied by
  // any current scope/future alternative. Report this missing proof as unsupported,
  // without searching structural geometries or claiming that they are impossible.
  const contextTaskIds = new Set([...problem.tasks,
    ...(problem.analyticalFutureRoundSynchronizations ?? []).flatMap(future => future.tasks),
    ...(problem.analyticalFutureItinerantAgendas ?? []).flatMap(future => [...future.tasks, ...future.prerequisiteTasks])].map(task => task.id));
  const unrepresented = collectiveClosure.pendingPredecessorTaskIds(options.fixedPlacements ?? [])
    .filter(id => !contextTaskIds.has(id)&&!problem.analyticalFutureCollectiveContinuation?.tasks.some(task=>task.id===id));
  if (unrepresented.length) {
    unsupported.push("FUTURE_COLLECTIVE_CLOSURE_INCONCLUSIVE");
    evidence.futureCollectiveClosurePendingPredecessorTaskIds = unrepresented;
    evidence.futureCollectiveClosureAbstentions.PENDING_PREDECESSORS = 1;
  }
  if (unsupported.length) {
    evidence.remainingTaskIds = standaloneTasks.map(({ id }) => id); evidence.reasonCodes = unsupported;
    return { status: "UNSUPPORTED_STANDALONE_SHAPE", complete: false, scheduledTasks: [], scheduledSetupPreparations: [], scheduledRoundPreparations: [], scheduledSpaceMeals: [], scheduledParticipantMeals: [],scheduledResourceMeals:[],scheduledOperationalMeals:[],scheduledItinerantUnitMeals:[],
      remainingTaskIds: [...evidence.remainingTaskIds], evidence };
  }
  const supplementalByDepth:Record<string,{participantMeal:number;standaloneForward:number}>={};
  const supplemental=(depth:number)=>supplementalByDepth[String(depth)]??={participantMeal:0,standaloneForward:0};
  const futureAssessments=new Map<string,{rows:Map<string,ExactFutureFeasibilityCausalAssessment>;occurrences:number}>();
  const standaloneForwardWitnessCache=new Map<string,number>();
  const coreDecisionDepthForTask=(candidate:Pick<Parameters<NonNullable<ExactMainAndFeederSearchOptions["onPartialCoreCandidate"]>>[0],"tasks">,taskId:string):number|null=>{
    const task=candidate.tasks.find(item=>item.id===taskId);if(!task)return null;
    const mains=candidate.tasks.filter(item=>item.kind==="main").sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
    const contracts=problem.anchoredAccompaniments??[];
    const mainId=task.kind==="main"?task.id:mains.find(main=>main.dependencies.includes(task.id))?.id
      ??contracts.find(contract=>[contract.anchorTaskId,...contract.beforeTaskIds,...contract.afterTaskIds].includes(task.id))?.anchorTaskId;
    const index=mains.findIndex(main=>main.id===mainId);return index<0?null:index+1;
  };
  const certifyFutureBackjump=(candidate:Parameters<NonNullable<ExactMainAndFeederSearchOptions["onPartialCoreCandidate"]>>[0],task:Task,
    staticDomain:StandaloneForwardStaticDomain,dynamicDomain:StandaloneForwardDynamicDomain,witness:boolean):number|null=>{
    const blockers=staticDomain.eligibleStartCount>0&&dynamicDomain.eligibleStartCount===0
      ?candidate.tasks.filter(other=>tasksCanAffectEachOther(task,other)).map(({id})=>id).sort():[];
    const locallyReconfigurableFeederIds=new Set(candidate.addedTasks
      .filter(({kind})=>kind==="vocal").map(({id})=>id));
    const ancestralTasks=candidate.tasks.filter(({id})=>!locallyReconfigurableFeederIds.has(id));
    const feederIndependentEmpty=blockers.length>0
      &&standaloneForwardDynamicDomain(problem,task,ancestralTasks,staticDomain).eligibleStartCount===0;
    const attributableBlockers=feederIndependentEmpty
      ?ancestralTasks.filter(other=>tasksCanAffectEachOther(task,other)).map(({id})=>id).sort():[];
    const mains=candidate.tasks.filter(({kind})=>kind==="main");
    const contracts=problem.anchoredAccompaniments??[];
    const blockerDepth=(id:string):number|null=>{const blocker=candidate.tasks.find(task=>task.id===id);if(!blocker)return null;
      const mainId=blocker.kind==="main"?blocker.id:mains.find(main=>main.dependencies.includes(id))?.id
        ??contracts.find(contract=>[...contract.beforeTaskIds,...contract.afterTaskIds].includes(id))?.anchorTaskId;
      const index=mains.findIndex(main=>main.id===mainId);return index<0?null:index+1;};
    const depths=attributableBlockers.map(blockerDepth).filter((depth):depth is number=>depth!==null).sort((a,b)=>a-b);
    const target=attributableBlockers.length>0&&depths.length===attributableBlockers.length?Math.max(...depths):null;
    const certified=target!==null&&target<candidate.depth?target:null;
    if(!options.causalDiagnostic)return certified;
    const authoritySignature=standaloneForwardAuthoritySignature(problem,task,candidate.tasks,candidate.meals,staticDomain,options.standaloneForwardStartDomainMode??"STATIC_DOMAIN");
    const result={domain:canonicalIntervals(dynamicDomain.intervals),eligibleStartCount:dynamicDomain.eligibleStartCount,
      empty:!witness,blockers,certifiedBackjumpTargetDepth:certified};
    const resultSignature=causalHash(result),key=`${candidate.depth}|${task.id}|${authoritySignature}`;
    const state=futureAssessments.get(key)??{rows:new Map<string,ExactFutureFeasibilityCausalAssessment>(),occurrences:0};state.occurrences++;
    const existing=state.rows.get(resultSignature);if(existing)existing.occurrences++;else state.rows.set(resultSignature,{depth:candidate.depth,taskId:task.id,authoritySignature,resultSignature,domainEmpty:!witness,
      eligibleStartCount:dynamicDomain.eligibleStartCount,blockers,ancestralDecisionDepths:[...new Set(depths)],certifiedBackjumpTargetDepth:certified,occurrences:1});
    futureAssessments.set(key,state);
    return certified;
  };
  const hasFuture=(problem.analyticalFutureTechnicalChains?.length??0)>0;
  let structuralBudgetExhausted=false;
  let constructiveBundle=hasFuture?undefined:options.preferredBundleCandidate;
  const architectureKey=(architecture:MainFeederArchitecture)=>architecture.pattern.join(",")+"@"+architecture.slots.join(",");
  function* structuralBundles():NonNullable<ExactMainAndFeederSearchOptions["structuralBundleCandidates"]> {
    if(!hasFuture)return;
    for(const {architecture,materialized} of authorizedPipelineArchitectureMaterializations(problem,evidence,{
      operationalMealBudget:()=>({remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("CORE",count)}),
      onBudgetExhausted:()=>{structuralBudgetExhausted=true;evidence.structuralSearchBudgetExhausted=true;},
    })){evidence.architecturesEnumerated++;evidence.architecturesTriedWithFutureReservation++;
      const key=architectureKey(architecture),prepared=preparePipelineBundleGraph(problem,architecture,options.fixedPlacements,materialized);
      if(!prepared)continue;evidence.architecturesPrepared++;evidence.preparedBundleEdges+=prepared.preparedBundleEdges;
      evidence.participantBundleEdgesChecked+=prepared.participantEdgeEvidence.checked;
      evidence.participantBundleEdgesPruned+=prepared.participantEdgeEvidence.pruned;
      evidence.participantBundleEdgesAbstained+=prepared.participantEdgeEvidence.abstained;
      evidence.firstParticipantBundleEdgePrune??=prepared.participantEdgeEvidence.firstPrune;
      evidence.futureWitnessesTriedByArchitecture[key]??=0;evidence.perfectMatchingsByArchitecture[key]??=0;evidence.hardGateRejectsByArchitecture[key]??=0;
      // Future pressure is ordering-only. Exact feasibility is assessed after
      // the hard gate and can causally repair this matching without enumerating
      // future reservations up front.
      evidence.futureReservationBundleMatchingAttempts++;
      const matching=materializePreparedPipelineBundleMatching(problem,prepared,new Set(),undefined,
        ()=>ledger.consume("CORE"),operation=>futureTechnicalChains.intrusion(operation));
      if(!matching){if(ledger.branchesExplored>=ledger.limit){structuralBudgetExhausted=true;
        evidence.structuralSearchBudgetExhausted=true;return;}continue;}
      evidence.futureReservationPerfectMatchings++;evidence.perfectMatchingsByArchitecture[key]++;
      evidence.structuralCandidatesProducedBeforeBudgetExhaustion++;
      yield {architecture,architectureFingerprint:prepared.witness.fingerprint,bundle:matching,
        repair:(previous,forbidden,consume)=>materializePreparedPipelineBundleMatching(problem,prepared,forbidden,previous,consume,
          operation=>futureTechnicalChains.intrusion(operation)),
        acceptComplete:()=>{evidence.selectedArchitectureFingerprint=prepared.witness.fingerprint;
          evidence.selectedPipelineWitnessDiagnostic=structuredClone(materialized.diagnostic);
          evidence.selectedPipelineWitnessAuthority=pipelineWitnessAuthorityDiagnostic(problem,options.fixedPlacements);
          return true;}};
      evidence.structuralArchitecturesFullyVisited++;
    }
    if(structuralBudgetExhausted)return;
    evidence.structuralSearchExhausted=true;evidence.residualDfsEntered=true;evidence.branchesBeforeResidualDfs=ledger.branchesExplored;
  }
  const structuralBundleCandidates=hasFuture?structuralBundles():undefined;
  const constructiveRepair=hasFuture?undefined:options.repairPreferredBundleCandidate;
  if(!hasFuture&&!constructiveBundle){evidence.structuralSearchExhausted=true;evidence.residualDfsEntered=true;evidence.branchesBeforeResidualDfs=ledger.branchesExplored;}
  const core = runExactMainAndFeederSearch(problem, { ledger, ...options.coreOrderer,
    futureEdgeIntrusion:options.coreOrderer?.futureEdgeIntrusion??(operation=>futureTechnicalChains.intrusion(operation)),
    futureEdgePressure:operation=>futureTechnicalChains.pressure(operation), acceptsValidation:options.acceptsValidation,
    fixedPlacements:options.fixedPlacements, fixedPlacementsAsContext:options.fixedPlacementsAsContext,
    fixedSetupPreparations:options.fixedSetupPreparations,
    priorFutureStructuralWitness:options.priorFutureStructuralWitnesses?.find((item):item is Extract<FutureStructuralWitness,{kind:"FIXED_SUPPORTING_PIPELINE"}>=>item.kind==="FIXED_SUPPORTING_PIPELINE")??options.priorFutureStructuralWitness,
    preferredArchitecture:options.preferredArchitecture,
    preferredBundleCandidate:constructiveBundle,
    repairPreferredBundleCandidate:constructiveRepair,
    structuralBundleCandidates,
    structuralSearchBudgetExhausted:()=>structuralBudgetExhausted,
    fixedMainFeederStartComparator:(left,right)=>{
      const a=operationalMeals.orderingKey(left.tasks,left.scheduledFeeder),b=operationalMeals.orderingKey(right.tasks,right.scheduledFeeder);
      return Number(b.preservesWitness)-Number(a.preservesWitness)||Number(b.preservesInterval)-Number(a.preservesInterval)
        ||b.bestSlack-a.bestSlack;
    },
    onStructuralHardGateReject:(architecture)=>{const key=architectureKey(architecture);evidence.hardGateRejectsByArchitecture[key]=(evidence.hardGateRejectsByArchitecture[key]??0)+1;},
    causalDiagnostic:options.causalDiagnostic, onPartialCoreCandidate(candidate) {
    if(candidate.origin==="FIXED_MAIN_CONTEXT"){
      const witness=operationalMeals.initializeFixedContext(candidate.tasks,{remaining:Math.max(0,ledger.limit-ledger.branchesExplored),
        consume:(count=1)=>ledger.consume("CORE",count)});
      if(witness.reasonCodes.includes("OPERATIONAL_MEAL_BRANCH_BUDGET_EXHAUSTED"))return "BUDGET_EXHAUSTED";
      if(!witness.complete)return "REJECT";
    }
    const frontierFingerprint=fingerprint(candidate.tasks,[],candidate.meals);
    const shouldRecord=candidate.depth>evidence.deepestCoreDepthReached
      ||(candidate.depth===evidence.deepestCoreDepthReached
        &&(candidate.tasks.length>evidence.deepestPartialScheduledTaskCount
          ||(candidate.tasks.length===evidence.deepestPartialScheduledTaskCount
            &&(evidence.deepestPartialFrontierFingerprint===null
              ||frontierFingerprint<evidence.deepestPartialFrontierFingerprint))));
    if(shouldRecord){
      let closedRuns=0;
      for(let index=0;index<candidate.depth;index++)
        if(index===0||candidate.pattern[index]!==candidate.pattern[index-1])closedRuns++;
      evidence.deepestCoreDepthReached=candidate.depth;
      evidence.deepestPartialScheduledTaskCount=candidate.tasks.length;
      evidence.deepestPartialMainRunsClosed=closedRuns;
      evidence.deepestPartialFeederRunsClosed=closedRuns;
      const scheduledIds=new Set(candidate.tasks.map(({id})=>id));
      evidence.deepestPartialCoreTasksRemaining=[...staticCoreIds].filter(id=>!scheduledIds.has(id)).length;
      evidence.deepestPartialFrontierFingerprint=frontierFingerprint;
    }
    if((problem.analyticalFutureTechnicalChains?.length??0)>0){const reservation=futureTechnicalChains.assess(candidate.tasks,candidate.addedTasks,taskId=>coreDecisionDepthForTask(candidate,taskId));recordTechnicalChainFutureReservation(evidence,reservation);if(reservation.status==="ABSTAIN")return "BUDGET_EXHAUSTED";if(reservation.status==="PRUNE"){
      const causing=candidate.addedTasks.find(task=>task.id===reservation.certifiedCausingTaskId);
      evidence.firstTechnicalChainFutureReservationPrune??={phase:"CORE",causingTaskId:causing?.id??null,causingCandidateStart:causing?.start??null,depth:candidate.depth,...reservation};
      if(reservation.conflictGroupCount>1)evidence.firstMultiDecisionConflict??=reservation;
      const target=reservation.conflictDecisionDepths.length?Math.max(...reservation.conflictDecisionDepths):null;
      if(target!==null&&target<=candidate.depth){evidence.conflictBackjumps++;evidence.suffixDepthsSkipped+=Math.max(0,candidate.depth-target);
        return {outcome:"CERTIFIED_BACKJUMP",targetDepth:target,conflictDecisionDepths:reservation.conflictDecisionDepths,
          conflictTaskIds:reservation.conflictTaskIds,authority:"FUTURE_TECHNICAL_CHAIN"};}return "REJECT";
    }}
    if((problem.analyticalFutureParticipantTasks?.length??0)>0){const reservation=probeParticipantFutureReservations(problem,candidate.tasks,candidate.addedTasks,{consume:()=>ledger.consume("CORE")});recordParticipantFutureReservation(evidence,reservation);if(reservation.abstainCause==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";if(reservation.status==="PRUNE"){const causing=[...candidate.addedTasks].sort(byId)[0];if(causing)evidence.firstParticipantFutureReservationPrune??={phase:"CORE",causingTaskId:causing.id,causingCandidateStart:causing.start,depth:candidate.depth,...reservation};return "REJECT";}}
    if((problem.participantMeals?.length??0)>0){const mealProbe=probeParticipantMealFutureFeasibility(problem,candidate.tasks,candidate.addedTasks);evidence.participantMealFutureFeasibilityChecks+=1;evidence.participantMealCheapProbes+=1;evidence.participantMealAffectedObligationsChecked+=mealProbe.affectedObligationsChecked;evidence.participantMealAnalyticDomainBuilds+=mealProbe.analyticDomainBuilds;evidence.participantMealLogicalGridStarts+=mealProbe.logicalGridStarts;evidence.participantMealAnalyticallyEliminatedStarts+=mealProbe.analyticallyEliminatedStarts;evidence.participantMealActuallyEvaluatedStarts+=mealProbe.actuallyEvaluatedStarts;evidence.participantMealZeroDomainPrunes+=mealProbe.zeroDomainPrunes;evidence.participantMealAnalyticCollectivePrunes+=mealProbe.analyticCollectivePrunes;evidence.participantMealExactSearchesAvoided+=1;if(!mealProbe.feasible){evidence.participantMealFutureInfeasibleBranches+=1;for(const id of mealProbe.blockingMealTaskIds)if(!evidence.participantMealBlockingTaskIds.includes(id))evidence.participantMealBlockingTaskIds.push(id);const blockingId=mealProbe.blockingMealTaskIds[0];const obligation=problem.participantMeals?.find(meal=>meal.sourceTaskId===blockingId);const causing=(obligation&&candidate.addedTasks.find(task=>task.participantId===obligation.participantId||task.id===obligation.sourceTaskId||task.dependencies.includes(obligation.sourceTaskId)||(obligation.dependencies??[]).includes(task.id)))??candidate.addedTasks[0];if(blockingId&&obligation&&causing)evidence.firstParticipantMealFuturePrune??={phase:"CORE",causingTaskId:causing.id,scheduledCandidateStart:causing.start,blockingMealTaskId:blockingId,participantId:obligation.participantId,candidateCount:mealProbe.candidateCountByTaskId[blockingId]??0,domainResult:mealProbe.zeroDomainPrunes>0?"ZERO_DOMAIN":"ANALYTIC_COLLECTIVE_INFEASIBLE",reasonCodes:[...mealProbe.reasonCodes]};return "REJECT";}}
    if((problem.operationalMealPolicies?.length??0)>0&&candidate.addedTasks.length>0){const probe=operationalMeals.assess(candidate.tasks,candidate.addedTasks,{remaining:Math.max(0,ledger.limit-ledger.branchesExplored),consume:(count=1)=>ledger.consume("CORE",count)},"CORE",candidate.depth);
      if(candidate.origin==="FIXED_MAIN_FEEDER"){
        evidence.fixedMainFeederMealChecks++;evidence.fixedMainFeederMealPasses+=Number(probe.status==="PASS");evidence.fixedMainFeederMealPrunes+=Number(probe.status==="PRUNE");
        if(probe.status==="PRUNE"&&probe.causality==="CAUSED_BY_ADDED_TASK"){
          const feeder=candidate.addedTasks[0]!;evidence.firstFixedMainFeederMealPrune??={feederTaskId:feeder.id,mainTaskId:candidate.mainTaskId,
            participantId:feeder.participantId??null,coachId:feeder.coachId??null,feederStart:feeder.start,feederEnd:feeder.end,
            policyId:probe.blockingPolicyId!,candidateCountBefore:probe.candidateCountBefore,candidateCountAfter:probe.candidateCountAfter,
            remainingIntervalsBefore:probe.remainingIntervalsBefore,remainingIntervalsAfter:probe.remainingIntervals,witnessBefore:probe.witnessBefore,depth:candidate.depth};
        }
      }
      if(probe.status==="ABSTAIN")return "BUDGET_EXHAUSTED";if(probe.status==="PRUNE")return "REJECT";}
    evidence.corePrerequisiteReservationChecks+=1;
    const reservation=checkIndividualPendingPrerequisiteReservations(problem,standaloneTasks,candidate.tasks.filter(task=>!candidate.addedTasks.some(added=>added.id===task.id)),candidate.addedTasks,candidate.meals);
    if(!reservation.feasible){
      evidence.corePrerequisiteReservationPrunes+=1;
      evidence.firstPrerequisiteReservationPrune??={phase:"CORE",causingTaskId:[...candidate.addedTasks].sort(byId)[0]?.id??candidate.mainTaskId,
        blockingPrerequisiteId:reservation.blockingTaskId!,depth:candidate.depth,deadline:reservation.deadline!,duration:reservation.duration!,
        earliestFeasibleStart:reservation.earliestFeasibleStart,latestFeasibleStart:reservation.latestFeasibleStart,failure:"INDIVIDUAL_ZERO_DOMAIN"};
      return "REJECT";
    }
    const impacted = standaloneTasks.filter((task) => candidate.addedTasks.some((added) => tasksCanAffectEachOther(task, added)));
    if (impacted.length === 0) return "CONTINUE";
    evidence.standaloneForwardChecks += 1;
    for (const task of impacted) {
      evidence.standaloneForwardImpactedTaskChecks += 1;
      let witness = false;
      const fullGridCount = Math.max(0, Math.floor((problem.day.end - task.duration - problem.day.start) / 5) + 1);
      const staticDomain = standaloneForwardStaticDomain(problem, task, candidate.meals);
      evidence.standaloneForwardFullGridStarts += fullGridCount;
      evidence.standaloneForwardStaticEligibleStarts += staticDomain.eligibleStartCount;
      evidence.standaloneForwardStaticEliminatedStarts += fullGridCount - staticDomain.eligibleStartCount;
      const fullGridMode = options.standaloneForwardStartDomainMode === "FULL_GRID";
      const dynamicDomain = fullGridMode ? staticDomain
        : standaloneForwardDynamicDomain(problem, task, candidate.tasks, staticDomain);
      if (!fullGridMode) {
        evidence.standaloneForwardDynamicEligibleStarts += dynamicDomain.eligibleStartCount;
        evidence.standaloneForwardDynamicEliminatedStarts += staticDomain.eligibleStartCount - dynamicDomain.eligibleStartCount;
        if (dynamicDomain.eligibleStartCount === 0) evidence.standaloneForwardAnalyticEmptyDomainPrunes += 1;
        else evidence.standaloneForwardDynamicNonemptyCertificates += 1;
      }
      // Transport is terminally materialized. Its exact non-empty dynamic interval is the cheap,
      // sound room certificate during core construction; do not spend the constructive frontier
      // enumerating starts that cannot yet determine its final contiguous group.
      if (transportTaskIds(problem).has(task.id) && !fullGridMode && dynamicDomain.eligibleStartCount > 0) {
        evidence.standaloneForwardWitnessesFound += 1;
        continue;
      }
      const memoizationEnabled=options.standaloneForwardWitnessMemoization!==false;
      const authoritySignature=dynamicDomain.eligibleStartCount>0&&memoizationEnabled
        ?standaloneForwardAuthoritySignature(problem,task,candidate.tasks,candidate.meals,staticDomain,
          options.standaloneForwardStartDomainMode??"STATIC_DOMAIN")
        :null;
      const witnessCacheKey=authoritySignature===null?null:`${candidate.depth}|${task.id}|${authoritySignature}`;
      const cachedOracleBranches=witnessCacheKey===null?undefined:standaloneForwardWitnessCache.get(witnessCacheKey);
      if(cachedOracleBranches!==undefined){
        witness=true;
        evidence.standaloneForwardWitnessCacheHits+=1;
        evidence.standaloneForwardWitnessBranchesAvoided+=cachedOracleBranches;
      }else if(witnessCacheKey!==null)evidence.standaloneForwardWitnessCacheMisses+=1;
      const starts = fullGridMode
        ? Array.from({ length: fullGridCount }, (_, index) => problem.day.start + index * 5)
        : dynamicDomain.starts();
      let fallbackRecorded = false;
      let oracleBranches=0;
      for (const start of witness?[]:starts) {
        if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        oracleBranches+=1;
        if(options.causalDiagnostic)supplemental(candidate.depth).standaloneForward+=1;
        evidence.standaloneForwardBranches += 1; evidence.standaloneForwardStartChecks += 1;
        evidence.standaloneForwardOracleChecks += 1;
        if (canPlaceTask(problem, task, start, candidate.tasks, candidate.meals)) { witness = true; break; }
        if (!fullGridMode && !fallbackRecorded) {
          const diagnosis = diagnoseTaskPlacement(problem, task, start, candidate.tasks, candidate.meals);
          evidence.standaloneForwardOracleFallbacks += 1;
          const reason = diagnosis.firstRejectionReason ?? "UNKNOWN";
          evidence.standaloneForwardOracleFallbackReasons[reason] = (evidence.standaloneForwardOracleFallbackReasons[reason] ?? 0) + 1;
          fallbackRecorded = true;
        }
      }
      if(witness&&witnessCacheKey!==null&&cachedOracleBranches===undefined){
        standaloneForwardWitnessCache.set(witnessCacheKey,oracleBranches);
        evidence.standaloneForwardWitnessCacheEntries=standaloneForwardWitnessCache.size;
      }
      const certifiedBackjumpTargetDepth=certifyFutureBackjump(candidate,task,staticDomain,dynamicDomain,witness);
      if (witness) { evidence.standaloneForwardWitnessesFound += 1; continue; }
      evidence.standaloneForwardPrunes += 1;
      evidence.standaloneForwardBlockingTaskCounts[task.id] = (evidence.standaloneForwardBlockingTaskCounts[task.id] ?? 0) + 1;
      const depthKey = String(candidate.depth);
      evidence.standaloneForwardPrunesByDepth[depthKey] = (evidence.standaloneForwardPrunesByDepth[depthKey] ?? 0) + 1;
      evidence.firstStandaloneForwardPruneDepth ??= candidate.depth;
      evidence.lastStandaloneForwardPruneDepth = candidate.depth;
      evidence.lastStandaloneForwardBlockingTaskId = task.id;
      evidence.lastStandaloneForwardCausingCoreTaskIds = candidate.addedTasks.map(({ id }) => id).sort();
      evidence.lastStandaloneForwardCausingMainTaskId = candidate.mainTaskId;
      evidence.lastStandaloneForwardCausingFeederStart = candidate.feederStart;
      return certifiedBackjumpTargetDepth===null?"REJECT":{outcome:"CERTIFIED_BACKJUMP",targetDepth:certifiedBackjumpTargetDepth};
    }
    return "CONTINUE";
  }, onHardValidCoreLeaf(candidate) {
    const fixedIds=new Set((options.fixedPlacements??[]).map(task=>task.id));
    const arrivalIds=new Set(problem.transportPolicy?.arrival.taskIds??[]);
    const entryIds=new Set(problem.tasks.filter(task=>task.kind==="auxiliary"
      &&task.dependencies.some(id=>arrivalIds.has(id))&&problem.tasks.some(main=>main.kind==="main"
        &&main.participantId===task.participantId&&main.dependencies.includes(task.id))).map(task=>task.id));
    const reparableIds=new Set(candidate.tasks.filter(task=>!fixedIds.has(task.id)
      &&(arrivalIds.has(task.id)||entryIds.has(task.id))).map(task=>task.id));
    let capacityBlockedTask:Task|null=null;
    let repairTrace:ExactItinerantPlanEvidence["firstSupportingGeometryRepair"]=null;
    const attempt=(repairSupporting=false):ExactCoreContinuationOutcome=>{
    evidence.coreCompleteLeavesEvaluated += 1;
    const conditioned=candidate.source==="STRUCTURAL_FUTURE_CONDITIONED";
    if(conditioned){
      evidence.structuralCandidateFingerprintAtHardGate=candidate.fingerprint;
      evidence.structuralCandidateFingerprintAtContinuation=candidate.fingerprint;
    }
    const fixedById=new Map((options.fixedPlacements??[]).map(task=>[task.id,task]));
    const orderedMains=candidate.tasks.filter(task=>task.kind==="main").sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
    // A revalidated structural witness already carries the exact fixed-supporting
    // materialization into this continuation. Rebuilding it here would repeat the
    // same bundle graph and arrival search before standalone can begin.
    const pipeline=!conditioned&&!candidate.reusedFutureStructuralWitness
      &&orderedMains.length===problem.tasks.filter(task=>task.kind==="main").length
      ?materializePipelineBundleMatching(problem,{pattern:orderedMains.map(task=>task.blockKey??""),slots:orderedMains.map(task=>task.start)},options.fixedPlacements,
        new Set(),undefined,()=>ledger.consume("CORE"),operation=>futureTechnicalChains.intrusion(operation))
      :null;
    const pipelinePreservesFixed=pipeline!==null&&[...fixedById].every(([id,fixed])=>{
      const placed=pipeline.scheduledTasks.find(task=>task.id===id);
      return !placed||(placed.start===fixed.start&&placed.end===fixed.end);
    });
    if(pipeline){evidence.bundleMatchingAttempts+=pipeline.evidence.attempts;
      evidence.bundleMatchingRepairs+=pipeline.evidence.repairs;evidence.bundleMatchingMaterializations+=pipeline.evidence.materializations;}
    const structuralTasks=conditioned?candidate.tasks:(pipelinePreservesFixed ? [...pipeline!.scheduledTasks] : candidate.tasks);
    let immutableCoreTasks=[...structuralTasks.filter(task=>!fixedById.has(task.id)
      &&(!repairSupporting||!reparableIds.has(task.id))),...fixedById.values()];
    const pipelineOnlySupportingExcludedCount=repairSupporting?reparableIds.size:0;
    if (evidence.firstHardValidCoreLeaf === null) {
      const counts=(tasks:readonly {kind:string}[])=>tasks.reduce<Record<string,number>>((result,task)=>{
        result[task.kind]=(result[task.kind]??0)+1;return result;},{});
      const dynamicTransport=transportTaskIds(problem);
      evidence.firstHardValidCoreLeaf={coreTaskCount:candidate.tasks.length,
        pipelineMaterializedTaskCount:pipelinePreservesFixed?pipeline!.scheduledTasks.length:candidate.tasks.length,
        immutableCoreTaskCount:immutableCoreTasks.length,protectedTaskCount:fixedById.size,
        pipelineOnlySupportingExcludedCount,coreTasksByKind:counts(immutableCoreTasks),
        pendingSupportingTotal:standaloneTasks.length,pendingOrdinaryNoTransport:standaloneTasks.filter(task=>!dynamicTransport.has(task.id)).length,
        pendingDynamicTransport:standaloneTasks.filter(task=>dynamicTransport.has(task.id)).length,pendingTasksByKind:counts(standaloneTasks)};
    }
    if(evidence.firstHardValidCoreTasks.length===0)evidence.firstHardValidCoreTasks=[...immutableCoreTasks]
      .sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id))
      .map(task=>({id:task.id,kind:task.kind,participantId:task.participantId,spaceId:task.spaceId,start:task.start,end:task.end,protected:fixedById.has(task.id)}));
    const arrival = assessCoreArrivalTransportFeasibility(problem, immutableCoreTasks, {
      consumeFallbackBranch: () => ledger.consume("STANDALONE"),
    });
    evidence.coreLeafArrivalEvidence = arrival.evidence;
    evidence.transportContiguousStates += arrival.evidence.contiguousStatesExplored;
    if (arrival.evidence.membershipFallbackEntered) evidence.membershipFallbackEntered += 1;
    if(repairSupporting){
      if(arrival.status!=="FEASIBLE"||!arrival.scheduled){
        if(repairTrace)repairTrace.lastAuthorityObservation={authority:"ARRIVAL",reason:arrival.evidence.failureCause,taskIds:[...arrivalIds].sort()};
        return arrival.evidence.budgetExhausted?"BUDGET_EXHAUSTED":"REJECT";
      }
      // Rebuild only provisional IN. Accepted placements remain literal context.
      if(arrival.scheduled.some(task=>{const fixed=fixedById.get(task.id);
        return fixed&&(task.start!==fixed.start||task.end!==fixed.end||task.spaceId!==fixed.spaceId);})){
        if(repairTrace)repairTrace.lastAuthorityObservation={authority:"PROTECTED_ARRIVAL",reason:"PROTECTED_PLACEMENT_MISMATCH",taskIds:[...arrivalIds].filter(id=>fixedById.has(id)).sort()};
        return "REJECT";
      }
      immutableCoreTasks=[...new Map([...arrival.scheduled,...immutableCoreTasks].map(task=>[task.id,task])).values()];
    }
    const coreIds=new Set(immutableCoreTasks.map(task=>task.id));
    if (arrival.status === "INFEASIBLE") {
      evidence.coreLeafTransportPrunes += 1;
      return "REJECT";
    }
    // The nominal Assisted pipeline can materialize a complete core without
    // visiting partial-core callbacks. Apply the same exact reservation at that
    // boundary so no locally complete proposal can bypass future structures.
    if((problem.analyticalFutureTechnicalChains?.length??0)>0){const reservation=futureTechnicalChains.assess(immutableCoreTasks,immutableCoreTasks,taskId=>coreDecisionDepthForTask(candidate,taskId));recordTechnicalChainFutureReservation(evidence,reservation);
      evidence.futureReservationRootOrdersEvaluated=futureTechnicalChains.evidence.exactRootOrderEvaluations;
      evidence.futureReservationWitnessesEvaluated=futureTechnicalChains.evidence.exactCandidateCount??futureTechnicalChains.evidence.rootOrdersYielded;
      if(conditioned){evidence.conditionedLeafFutureRevalidations++;if(reservation.status==="PASS")evidence.conditionedLeafFutureRevalidationPasses++;else evidence.conditionedLeafFutureRevalidationRejects++;}
      if(repairTrace&&reservation.status!=="PASS")repairTrace.lastAuthorityObservation={authority:"FUTURE_TECHNICAL_CHAIN",
        reason:reservation.result,taskIds:reservation.conflictTaskIds?Object.values(reservation.conflictTaskIds).flat():[]};
      if(reservation.status==="ABSTAIN"){structuralBudgetExhausted ||= conditioned;evidence.structuralSearchBudgetExhausted ||= conditioned;return "BUDGET_EXHAUSTED";}if(reservation.status==="PRUNE"){
      const causing=immutableCoreTasks.find(task=>task.id===reservation.certifiedCausingTaskId);
      const depth=candidate.tasks.filter(task=>task.kind==="main").length;
      evidence.firstTechnicalChainFutureReservationPrune??={phase:"CORE",causingTaskId:causing?.id??null,
        causingCandidateStart:causing?.start??null,depth,...reservation};
      if(reservation.conflictGroupCount>1)evidence.firstMultiDecisionConflict??=reservation;
      const target=reservation.conflictDecisionDepths.length?Math.max(...reservation.conflictDecisionDepths):null;
      if(target===null)return "REJECT";evidence.conflictBackjumps++;evidence.suffixDepthsSkipped+=Math.max(0,depth-target);
      return {outcome:"CERTIFIED_BACKJUMP",targetDepth:target,conflictDecisionDepths:reservation.conflictDecisionDepths,
        conflictTaskIds:reservation.conflictTaskIds,authority:"FUTURE_TECHNICAL_CHAIN"};
    }}
    const remainingStandalone=standaloneTasks.filter(task=>!coreIds.has(task.id));
    if((problem.analyticalFutureParticipantTasks?.length??0)>0){
      const reservation=probeParticipantFutureReservations(problem,immutableCoreTasks,immutableCoreTasks,{consume:()=>ledger.consume("CORE")});
      recordParticipantFutureReservation(evidence,reservation);
      if(repairTrace&&reservation.status!=="PASS")repairTrace.lastAuthorityObservation={authority:"FUTURE_PARTICIPANT_RESERVATION",
        reason:reservation.reasonCode??reservation.abstainCause,taskIds:[reservation.futureTaskId,reservation.mealTaskId].filter((id):id is string=>id!==null)};
      if(reservation.abstainCause==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
      if(reservation.status==="ABSTAIN"){
        const reachable=new Set(remainingStandalone.map(({id})=>id));
        const outside=reservation.unresolvedDependencyIds.filter(id=>!reachable.has(id));
        if(outside.length){evidence.participantFutureUnreachableDependencyIds=[...new Set([...evidence.participantFutureUnreachableDependencyIds,...outside])].sort();return "REJECT";}
      }
      if(reservation.status==="PRUNE"){
        if(!repairSupporting&&reservation.reasonCode==="FUTURE_PARTICIPANT_TASK_ZERO_DOMAIN"){
          const future=problem.analyticalFutureParticipantTasks?.find(task=>task.id===reservation.futureTaskId);
          const entries=immutableCoreTasks.filter(task=>entryIds.has(task.id)&&reparableIds.has(task.id));
          const sharesEntryCapacity=future&&entries.some(entry=>entry.spaceId===future.spaceId
            ||(entry.requiredResourceIds??[]).some(id=>(future.requiredResourceIds??[]).includes(id)));
          if(sharesEntryCapacity&&exactTaskStartDomain(problem,future,
            immutableCoreTasks.filter(task=>!entries.some(entry=>entry.id===task.id)),candidate.meals).eligibleStartCount>0)
            capacityBlockedTask=future;
        }
        const orderedMains=immutableCoreTasks.filter(task=>task.kind==="main").sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
        const causing=orderedMains.find(task=>task.participantId===reservation.participantId)??[...immutableCoreTasks].sort(byId)[0];
        if(causing)evidence.firstParticipantFutureReservationPrune??={phase:"CORE",causingTaskId:causing.id,
          causingCandidateStart:causing.start,depth:candidate.tasks.filter(task=>task.kind==="main").length,...reservation};
        const targetDepth=causing===undefined?-1:orderedMains.findIndex(task=>task.id===causing.id)+1;
        return targetDepth>0?{outcome:"CERTIFIED_BACKJUMP",targetDepth,conflictDecisionDepths:[targetDepth],
          conflictTaskIds:{[causing!.id]:reservation.collectiveObligationIds.length?reservation.collectiveObligationIds:
            [reservation.futureTaskId,reservation.mealTaskId].filter((id):id is string=>id!==null)},authority:"FUTURE_PARTICIPANT_RESERVATION"}:"REJECT";
      }
    }
    if(conditioned)evidence.structuralCandidateFingerprintBeforeStandalone=candidate.fingerprint;
    const jointSource=problem.analyticalFutureCollectiveContinuation;
    const searchJoint=():StandaloneSearchResult=>{
      const full:PlannerNextProblem={...jointSource!,budget:problem.budget,
        analyticalFutureCollectiveContinuation:jointSource,
        analyticalFutureParticipantClosure:undefined,analyticalFutureParticipantTasks:[],analyticalFutureTechnicalChains:[],
        analyticalFutureRoundSynchronizations:[],analyticalFutureItinerantAgendas:[]};
      const departureIds=new Set(full.transportPolicy?.departure.taskIds??[]);
      const closureIds=new Set(new PreparedFutureCollectiveParticipantClosure(full).closureTaskIds());
      // Existing individual future pruning remains necessary-only. Current
      // residual producers resolve the dependencies; their bounds cannot certify it.
      full.analyticalFutureParticipantTasks=full.tasks.filter(task=>closureIds.has(task.id)&&!departureIds.has(task.id)
        &&!immutableCoreTasks.some(item=>item.id===task.id));
      full.analyticalFutureParticipantSupportingTaskIds=full.tasks.map(task=>task.id);
      full.tasks=full.tasks.map(task=>{const assigned=immutableCoreTasks.find(item=>item.id===task.id);
        if(!assigned)return task;const {start:_start,end:_end,...identity}=assigned;
        return {...identity,availability:task.availability};});
      const authority=new PreparedFutureCollectiveParticipantClosure(full);
      const necessary=(tasks:ScheduledTask[]):StandaloneOutcome|"PASS"=>{
        const check=authority.evaluate(tasks,[],()=>ledger.consume("STANDALONE"),"NECESSARY_ONLY",candidate.meals);
        evidence.futureCollectiveClosureChecks+=Number(!check.cacheHit);
        evidence.futureCollectiveClosureCacheHits+=Number(check.cacheHit);
        evidence.futureCollectiveClosureBranchesConsumed+=check.branchesConsumed;
        evidence.futureCollectiveClosureMatchingTraversals+=check.matchingTraversals;
        if(check.reason==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
        if(check.status==="INFEASIBLE"){evidence.futureCollectiveClosureHall=check.hall;return "DEAD_END";}
        return "PASS";
      };
      let result:StandaloneSearchResult|null=null;
      const agendas=problem.analyticalFutureItinerantAgendas??[];
      const visitAgenda=(index:number,context:ScheduledTask[]):StandaloneOutcome=>{
        const gate=necessary(context);if(gate!=="PASS")return gate;
        if(index===agendas.length){
          const contextIds=new Set(context.map(task=>task.id));
          const found=searchStandaloneForCoreCandidate(full,context,candidate.meals,full.tasks.filter(task=>!contextIds.has(task.id)),
            ledger,evidence,"FIRST_HARD_VALID",options.jointGroupStartDomainMode??"ANALYTIC_DOMAIN",
            options.technicalChainStartDomainMode??"ANALYTIC_DOMAIN",undefined,null,options.fixedSetupPreparations,
            options.fixedRoundPreparations,candidate.selectedMainMealStart,options.priorFutureStructuralWitnesses);
          if(found.outcome==="INCONCLUSIVE"){evidence.futureCollectiveClosureInconclusiveLeaves++;return "DEAD_END";}
          if(found.tasks)result=found;return found.outcome;
        }
        const future=agendas[index]!,pending=future.tasks.filter(task=>!context.some(item=>item.id===task.id));
        if(!pending.length)return visitAgenda(index+1,context);
        const frontier=itinerantAgendaStructuralFrontier(full,future.unitIds,context);
        return searchExactPrerequisiteClosure(full,future.prerequisiteTasks.filter(task=>!context.some(item=>item.id===task.id)),
          context,candidate.meals,frontier,()=>ledger.consume("STANDALONE"),prerequisites=>
            searchExactItinerantAgenda(full,pending,future.unitIds,[...context,...prerequisites],candidate.meals,frontier,
              ()=>ledger.consume("STANDALONE"),tasks=>visitAgenda(index+1,[...context,...prerequisites,...tasks])).outcome).outcome;
      };
      const chains=futureTechnicalChains.reservationStructureIds();
      const visitChain=(index:number,context:ScheduledTask[]):StandaloneOutcome=>{
        if(index===chains.length)return visitAgenda(0,context);
        const gate=necessary(context);if(gate!=="PASS")return gate;
        let cursor=0;
        while(true){const next=futureTechnicalChains.nextExactReservation(chains[index]!,context,cursor);cursor=next.nextCursor;
          if(next.status==="BUDGET_EXHAUSTED")return "BUDGET_EXHAUSTED";
          if(next.status==="EXHAUSTED")return "DEAD_END";
          const tasks=[...new Map([...context,...next.reservation!.scheduledTasks].map(task=>[task.id,task])).values()];
          const outcome=visitChain(index+1,tasks);if(outcome!=="DEAD_END")return outcome;
        }
      };
      const outcome=visitChain(0,immutableCoreTasks);
      return result??{outcome,tasks:null,preparations:[],roundPreparations:[],selectionOrder:[],participantMeals:null,
        operationalMeals:null,futureRoundWitnesses:[],futureItinerantWitnesses:[]};
    };
    const standalone = jointSource?searchJoint():searchStandaloneForCoreCandidate(problem, immutableCoreTasks, candidate.meals, remainingStandalone, ledger, evidence,
      completeSelectionMode, options.jointGroupStartDomainMode ?? "ANALYTIC_DOMAIN",
      options.technicalChainStartDomainMode??"ANALYTIC_DOMAIN", options.acceptsValidation,operationalMeals.currentWitness(),options.fixedSetupPreparations,
      options.fixedRoundPreparations,candidate.selectedMainMealStart,options.priorFutureStructuralWitnesses,futureTechnicalChains,
      candidate.reusedFutureStructuralWitness?.fingerprint??null);
    if (standalone.tasks) {
      if(jointSource){
        const body={kind:"JOINT_COMPLETION" as const,version:1 as const,tasks:standalone.tasks,
          preparations:standalone.preparations,roundPreparations:standalone.roundPreparations,
          participantMeals:standalone.participantMeals?.scheduled??[],operationalMeals:standalone.operationalMeals?.scheduled??[],
          spaceMeals:mainFlowMealPolicy(problem)?.source==="OPERATIONAL_MEAL_POLICY"?[]:candidate.meals};
        evidence.futureStructuralWitnesses=[{...structuredClone(body),fingerprint:causalHash(body)}];
        const executableIds=new Set(problem.tasks.map(task=>task.id));
        standalone.tasks=standalone.tasks.filter(task=>executableIds.has(task.id));
        standalone.preparations=standalone.preparations.filter(prep=>problem.tasks.some(task=>task.spaceId===prep.spaceId&&task.setupFamilyId===prep.setupFamilyId));
        standalone.roundPreparations=standalone.roundPreparations.filter(prep=>problem.roundSynchronizations?.some(policy=>policy.id===prep.synchronizationId));
        if(standalone.participantMeals)standalone.participantMeals={...standalone.participantMeals,
          scheduled:standalone.participantMeals.scheduled.filter(meal=>problem.participantMeals?.some(item=>item.sourceTaskId===meal.sourceTaskId))};
      }
      selectedTasks = standalone.tasks; selectedPreparations = [...standalone.preparations]; selectedRoundPreparations = [...standalone.roundPreparations]; selectedMeals = mainFlowMealPolicy(problem)?.source==="OPERATIONAL_MEAL_POLICY"?[]:candidate.meals; selectedParticipantMeals=standalone.participantMeals; selectedOperationalMeals=standalone.operationalMeals; selectedCoreIds = coreIds;selectedFutureRoundWitnesses=standalone.futureRoundWitnesses;selectedFutureItinerantWitnesses=standalone.futureItinerantWitnesses;
      if(selectedParticipantMeals){evidence.participantMealAcceptedWitnessFingerprint=participantMealWitnessFingerprint(selectedParticipantMeals.scheduled);evidence.participantMealFinalSelectionOrder=[...selectedParticipantMeals.finalSelectionOrder];evidence.participantMealAttemptedSelectionTrace=[...selectedParticipantMeals.attemptedSelectionTrace];}
      const acceptedCoreFingerprint=repairSupporting?fingerprint(immutableCoreTasks,[],candidate.meals):candidate.fingerprint;
      evidence.selectedCoreFingerprint=acceptedCoreFingerprint;evidence.coreFingerprint=acceptedCoreFingerprint;
      evidence.selectedStandaloneSelectionOrder = standalone.selectionOrder;
    }
    if (standalone.outcome === "BUDGET_EXHAUSTED") {
      evidence.completeSelectionStoppedByBudget = completeSelectionMode === "BEST_DOMINATING_WITHIN_BUDGET" && standalone.tasks !== null;
      return "BUDGET_EXHAUSTED";
    }
    if (standalone.outcome === "DEAD_END" || !standalone.tasks) {
      if (standalone.outcome !== "INCONCLUSIVE") evidence.coreLeavesRejectedByStandalone += 1;
      return "REJECT"; // continue the core; retained uncertainty takes precedence over final infeasibility
    }
    if(!repairSupporting&&candidate.reusedFutureStructuralWitness){
      acceptedContinuation.witness=candidate.reusedFutureStructuralWitness;
    }else if(!repairSupporting&&candidate.source==="PREFERRED_BUNDLE"&&pipelinePreservesFixed){
      acceptedContinuation.witness=futureStructuralWitnessFromMaterialization(problem,
        {pattern:orderedMains.map(task=>task.blockKey??""),slots:orderedMains.map(task=>task.start)},pipeline!);
    }
    if((conditioned&&candidate.geometryFingerprint)||repairSupporting){
      acceptedContinuation.witness=futureStructuralWitnessV2FromAcceptedPipeline(problem,
        {pattern:orderedMains.map(task=>task.blockKey??""),slots:orderedMains.map(task=>task.start),
          ...(candidate.selectedMainMealStart===undefined?{}:{mealStart:candidate.selectedMainMealStart})},
        repairSupporting?causalHash(selectedTasks!.map(({id,start,end,spaceId})=>({id,start,end,spaceId})))
          :candidate.geometryFingerprint!,repairSupporting?selectedTasks!:candidate.tasks);
    }
    return "ACCEPT";
    };
    const nominal=attempt();
    if(nominal==="ACCEPT"||nominal==="BUDGET_EXHAUSTED"
      ||!problem.analyticalFutureCollectiveContinuation||reparableIds.size===0||!capacityBlockedTask)return nominal;
    // Contiguous early supporting is the first candidate, not a hard constraint.
    // Retry only a demonstrated entry-capacity loss; other nominal rejects retain
    // their existing bundle repair and ordering, including the unchanged canon.
    evidence.supportingGeometryRepairAttempts++;
    const branchesBefore=ledger.branchesExplored,invocationsBefore=evidence.standaloneSearchInvocations;
    const row={capacityBlockedTaskId:(capacityBlockedTask as Task).id,deferredTaskIds:[...reparableIds].sort(),protectedTaskIds:[...fixedIds].sort(),branchesBefore,
      branchesConsumed:0,standaloneInvocations:0,outcome:"PENDING",lastAuthorityObservation:null};
    if(!evidence.firstSupportingGeometryRepair){evidence.firstSupportingGeometryRepair=row;repairTrace=row;}
    const repaired=attempt(true);
    row.branchesConsumed=ledger.branchesExplored-branchesBefore;
    row.standaloneInvocations=evidence.standaloneSearchInvocations-invocationsBefore;
    row.outcome=typeof repaired==="string"?repaired:repaired.outcome;
    if(repaired==="ACCEPT"){evidence.supportingGeometryRepairSuccesses++;return repaired;}
    // A finite provisional arrival/capacity witness does not exhaust all joint
    // supporting geometries. Its failure cannot certify a Main nogood or global infeasibility.
    evidence.futureCollectiveClosureInconclusiveLeaves++;
    return repaired==="BUDGET_EXHAUSTED"?repaired:"REJECT";
  }});
  evidence.causalDiagnostic=core.evidence.causalDiagnostic;
  if(evidence.causalDiagnostic){const summary=evidence.causalDiagnostic.futureFeasibility;const states=[...futureAssessments.values()];summary.assessments=states.flatMap(state=>[...state.rows.values()]).sort((a,b)=>a.depth-b.depth||a.taskId.localeCompare(b.taskId)||a.authoritySignature.localeCompare(b.authoritySignature)||a.resultSignature.localeCompare(b.resultSignature));
    summary.collisions=states.filter(state=>state.rows.size>1).map(state=>{const row=state.rows.values().next().value!;return {depth:row.depth,taskId:row.taskId,authoritySignature:row.authoritySignature,resultSignatures:[...state.rows.keys()].sort()}}).sort((a,b)=>a.depth-b.depth||a.taskId.localeCompare(b.taskId)||a.authoritySignature.localeCompare(b.authoritySignature));summary.authorityResultCollisions=summary.collisions.length;
    for(const state of states){const row=state.rows.values().next().value!;summary.totalEvaluations+=state.occurrences;summary.uniqueAuthorityStates+=1;summary.repeatedEvaluations+=state.occurrences-1;
      const depth=String(row.depth);summary.evaluationsByDepth[depth]=(summary.evaluationsByDepth[depth]??0)+state.occurrences;if(state.occurrences>1)summary.repeatedByDepth[depth]=(summary.repeatedByDepth[depth]??0)+state.occurrences-1;}
    for(const row of summary.assessments){const depth=String(row.depth);
      if(row.domainEmpty){summary.negativeEvaluations+=row.occurrences;summary.repeatedNegativeEvaluations+=row.occurrences-1;summary.negativeByDepth[depth]=(summary.negativeByDepth[depth]??0)+row.occurrences;if(row.certifiedBackjumpTargetDepth!==null)summary.rejectsWithCertifiedBackjumpTarget+=row.occurrences;}}}
  if(evidence.causalDiagnostic)for(const [depth,extra] of Object.entries(supplementalByDepth)){const row=evidence.causalDiagnostic.waterfallByDepth[depth]??={mainCandidate:0,feederStart:0,residualMatching:0,continuation:0,participantMeal:0,standaloneForward:0,other:0,total:0};row.participantMeal+=extra.participantMeal;row.standaloneForward+=extra.standaloneForward;row.total+=extra.participantMeal+extra.standaloneForward;evidence.causalDiagnostic.waterfallByDepth[depth]=row;}
  evidence.branchesExplored = ledger.branchesExplored; evidence.coreBranches = ledger.coreBranches;
  evidence.standaloneBranches = ledger.standaloneBranches;
  evidence.lastExhaustionPhase = ledger.lastExhaustionPhase
    ?? (ledger.branchesExplored >= ledger.limit ? "STANDALONE" : null);
  if (evidence.causalDiagnostic) {
    const accounted = Object.values(evidence.causalDiagnostic.waterfallByDepth).reduce((sum, row) => sum + row.total, 0);
    const unclassifiedStandalone = Math.max(0, ledger.branchesExplored - accounted);
    if (unclassifiedStandalone > 0) {
      const row = evidence.causalDiagnostic.waterfallByDepth["0"]
        ?? { mainCandidate:0,feederStart:0,residualMatching:0,continuation:0,participantMeal:0,standaloneForward:0,other:0,total:0 };
      row.other += unclassifiedStandalone;
      row.total += unclassifiedStandalone;
      evidence.causalDiagnostic.waterfallByDepth["0"] = row;
    }
  }
  evidence.coreStatus = core.status; evidence.coreReasonCodes = [...core.evidence.reasonCodes];
  evidence.coreBacktracks = core.evidence.backtracks; evidence.coreMaximumDepth = core.evidence.maximumDepth;
  evidence.coreCompleteLeafCount = core.evidence.completeLeafCount;
  evidence.patternCandidatesExplored=core.evidence.patternCandidatesExplored;
  evidence.timelineCandidatesExplored=core.evidence.timelineCandidatesExplored;
  evidence.mainCandidatesEvaluated=core.evidence.mainCandidatesEvaluated;
  evidence.feederCandidatesEvaluated=core.evidence.feederCandidatesEvaluated;
  evidence.architecturesChecked=core.evidence.architecturesChecked;
  evidence.architecturesStructurallyRejected=core.evidence.architecturesStructurallyRejected;
  evidence.structuralRejectionsByReason={...core.evidence.structuralRejectionsByReason};
  evidence.firstExactArchitecture=core.evidence.firstExactArchitecture;
  evidence.firstFeedableRunSizes=[...core.evidence.firstFeedableRunSizes];
  evidence.feederOrderBranchesByArchitecture={...core.evidence.feederOrderBranchesByArchitecture};
  evidence.feederOrderBranches=core.evidence.feederOrderBranches;
  evidence.feederCohortCapacityChecks=core.evidence.feederCohortCapacityChecks;
  evidence.feederCohortPrefixCapacityPrunes=core.evidence.feederCohortPrefixCapacityPrunes;
  evidence.feederCohortEddChecks=core.evidence.feederCohortEddChecks;
  evidence.feederCohortEddEmptyPrunes=core.evidence.feederCohortEddEmptyPrunes;
  evidence.blockStartsEliminatedByCohortBound=core.evidence.blockStartsEliminatedByCohortBound;
  evidence.feederCohortContiguousWindowChecks=core.evidence.feederCohortContiguousWindowChecks;
  evidence.feederCohortContiguousWindowPrunes=core.evidence.feederCohortContiguousWindowPrunes;
  evidence.blockStartsEliminatedByContiguousWindowBound=core.evidence.blockStartsEliminatedByContiguousWindowBound;
  evidence.contiguousWindowSkippedByTransition=core.evidence.contiguousWindowSkippedByTransition;
  evidence.contiguousWindowSkippedByAuthorizedMeal=core.evidence.contiguousWindowSkippedByAuthorizedMeal;
  evidence.feederRunOptimisticChecks=core.evidence.feederRunOptimisticChecks;
  evidence.feederRunOptimisticPrunes=core.evidence.feederRunOptimisticPrunes;
  evidence.feederRunOptimisticPrunesByDepth={...core.evidence.feederRunOptimisticPrunesByDepth};
  evidence.feederRunPrePartialChecks=core.evidence.feederRunPrePartialChecks;
  evidence.feederRunPrePartialPrunes=core.evidence.feederRunPrePartialPrunes;
  evidence.feederRunPrePartialPrunesByDepth={...core.evidence.feederRunPrePartialPrunesByDepth};
  evidence.feederRunPreFeederChecks=core.evidence.feederRunPreFeederChecks;
  evidence.feederRunPreFeederPrunes=core.evidence.feederRunPreFeederPrunes;
  evidence.feederRunPreFeederPrunesByDepth={...core.evidence.feederRunPreFeederPrunesByDepth};
  evidence.feederRunOptimisticSkippedByTransition=core.evidence.feederRunOptimisticSkippedByTransition;
  evidence.feederRunOptimisticSkippedByAuthorizedMeal=core.evidence.feederRunOptimisticSkippedByAuthorizedMeal;
  evidence.feederSlotAnalyticChecks=core.evidence.feederSlotAnalyticChecks;
  evidence.feederSlotAnalyticPrunes=core.evidence.feederSlotAnalyticPrunes;
  evidence.feederSlotAnalyticAbstentions=core.evidence.feederSlotAnalyticAbstentions;
  evidence.feederSlotMatchingChecks=core.evidence.feederSlotMatchingChecks;
  evidence.feederSlotMatchingPrunes=core.evidence.feederSlotMatchingPrunes;
  evidence.feederSlotMatchingEdgeChecks=core.evidence.feederSlotMatchingEdgeChecks;
  evidence.feederSlotMatchingAugmentTraversals=core.evidence.feederSlotMatchingAugmentTraversals;
  evidence.feederSlotMatchingBranchesExplored=core.evidence.feederSlotMatchingBranchesExplored;
  evidence.residualMatchingInvocations = core.evidence.residualMatchingInvocations;
  evidence.residualMatchingFullBuilds = core.evidence.residualMatchingFullBuilds;
  evidence.residualMatchingIncrementalUpdates = core.evidence.residualMatchingIncrementalUpdates;
  evidence.residualMatchingEdgeCacheHits = core.evidence.residualMatchingEdgeCacheHits;
  evidence.residualMatchingEdgeCacheMisses = core.evidence.residualMatchingEdgeCacheMisses;
  evidence.residualMatchingPositionChecks = core.evidence.residualMatchingPositionChecks;
  evidence.residualMatchingAugmentTraversals = core.evidence.residualMatchingAugmentTraversals;
  evidence.residualMatchingBranchesExplored = core.evidence.residualMatchingBranchesExplored;
  if(selectedTasks)evidence.residualDfsBranchesBeforeFirstSolution=core.evidence.residualMatchingBranchesExplored;
  evidence.residualMatchingPrunes = core.evidence.residualMatchingPrunes;
  evidence.residualMatchingRepairs = core.evidence.residualMatchingRepairs;
  evidence.residualMatchingRepairFailures = core.evidence.residualMatchingRepairFailures;
  evidence.mainWitnessChoicesFollowed = core.evidence.mainWitnessChoicesFollowed;
  evidence.mainWitnessFallbacks = core.evidence.mainWitnessFallbacks;
  evidence.mainRunWitnessAttempts=core.evidence.mainRunWitnessAttempts;
  evidence.mainRunWitnessRepairs=core.evidence.mainRunWitnessRepairs;
  evidence.mainRunEquivalentOrdersCollapsed=core.evidence.mainRunEquivalentOrdersCollapsed;
  evidence.feederMatchingWitnessMaterializations=core.evidence.feederMatchingWitnessMaterializations;
  evidence.feederMatchingWitnessRepairs=core.evidence.feederMatchingWitnessRepairs;
  evidence.bundleMatchingAttempts+=core.evidence.bundleMatchingAttempts;
  evidence.bundleMatchingRepairs+=core.evidence.bundleMatchingRepairs;
  evidence.bundleMatchingMaterializations+=core.evidence.bundleMatchingMaterializations;
  evidence.bundleHardValidationRejects+=core.evidence.bundleHardValidationRejects;
  evidence.bundleCertifiedRepairs+=core.evidence.bundleCertifiedRepairs;
  evidence.bundleForbiddenEdges=[...core.evidence.bundleForbiddenEdges];
  evidence.bundleRepairSequence=[...core.evidence.bundleRepairSequence];
  evidence.bundleTerminalCause=core.evidence.bundleTerminalCause;
  evidence.bundleNogoodsCreated+=core.evidence.bundleNogoodsCreated;
  evidence.bundleNogoodBranches+=core.evidence.bundleNogoodBranches;
  evidence.bundleNogoodDeduplications+=core.evidence.bundleNogoodDeduplications;
  evidence.bundleNogoodRepairsSucceeded+=core.evidence.bundleNogoodRepairsSucceeded;
  evidence.conflictEdges=[...core.evidence.conflictEdges];
  evidence.fixedMainBundlePathEntered=core.evidence.fixedMainBundlePathEntered;
  evidence.protectedMainCount=core.evidence.protectedMainCount;
  evidence.protectedMainArchitectureFingerprint=core.evidence.protectedMainArchitectureFingerprint;
  evidence.protectedMainSlots=[...core.evidence.protectedMainSlots];
  evidence.fixedMainBundleGraphPrepared=core.evidence.fixedMainBundleGraphPrepared;
  evidence.fixedMainBundlePreparedEdges=core.evidence.fixedMainBundlePreparedEdges;
  evidence.fixedMainBundleCandidatePositions=structuredClone(core.evidence.fixedMainBundleCandidatePositions);
  evidence.fixedMainBundleZeroDomainTaskIds=[...core.evidence.fixedMainBundleZeroDomainTaskIds];
  evidence.fixedMainBundleParticipantEdgeChecks=core.evidence.fixedMainBundleParticipantEdgeChecks;
  evidence.fixedMainBundleParticipantEdgePrunes=core.evidence.fixedMainBundleParticipantEdgePrunes;
  evidence.fixedMainBundleFirstParticipantEdgePrune=structuredClone(core.evidence.fixedMainBundleFirstParticipantEdgePrune);
  evidence.fixedMainBundleMatchingAttempts=core.evidence.fixedMainBundleMatchingAttempts;
  evidence.fixedMainBundlePerfectMatchingFound=core.evidence.fixedMainBundlePerfectMatchingFound;
  evidence.fixedMainBundleHardGatePasses=core.evidence.fixedMainBundleHardGatePasses;
  evidence.fixedMainBundleHardGateRejects=core.evidence.fixedMainBundleHardGateRejects;
  evidence.fixedMainBundleTaskCount=core.evidence.fixedMainBundleTaskCount;
  evidence.fixedMainBundleTasksByKind={...core.evidence.fixedMainBundleTasksByKind};
  evidence.fixedSupportingGeometryFingerprint=core.evidence.fixedSupportingGeometryFingerprint;
  evidence.fixedSupportingMatchingAttempts=core.evidence.fixedSupportingMatchingAttempts;
  evidence.fixedSupportingEdges=core.evidence.fixedSupportingEdges;
  evidence.fixedSupportingZeroDomainTaskIds=[...core.evidence.fixedSupportingZeroDomainTaskIds];
  evidence.fixedSupportingPerfectMatchingFound=core.evidence.fixedSupportingPerfectMatchingFound;
  evidence.fixedSupportingRematchedIdentityCount=core.evidence.fixedSupportingRematchedIdentityCount;
  evidence.fixedSupportingArrivalResult=core.evidence.fixedSupportingArrivalResult;
  evidence.fixedSupportingArrivalPacketCount=core.evidence.fixedSupportingArrivalPacketCount;
  evidence.fixedSupportingSameGeometryRescued=core.evidence.fixedSupportingSameGeometryRescued;
  evidence.fixedSupportingGeometriesAttempted=core.evidence.fixedSupportingGeometriesAttempted;
  evidence.fixedSupportingGeometryFailure=core.evidence.fixedSupportingGeometryFailure;
  evidence.fixedSupportingGlobalFailure=core.evidence.fixedSupportingGlobalFailure;
  evidence.fixedSupportingWitnessDiagnostic=structuredClone(core.evidence.fixedSupportingWitnessDiagnostic);
  evidence.fixedSupportingWitnessAuthority=structuredClone(core.evidence.fixedSupportingWitnessAuthority);
  evidence.priorFutureStructuralWitnessFound=core.evidence.priorFutureStructuralWitnessFound;
  evidence.priorFutureStructuralWitnessFingerprint=core.evidence.priorFutureStructuralWitnessFingerprint;
  evidence.priorFutureStructuralWitnessRevalidation=core.evidence.priorFutureStructuralWitnessRevalidation;
  evidence.priorFutureStructuralWitnessRejectCause=core.evidence.priorFutureStructuralWitnessRejectCause;
  evidence.priorFutureStructuralWitnessRejectDetails=core.evidence.priorFutureStructuralWitnessRejectDetails;
  evidence.priorFutureStructuralWitnessReused=core.evidence.priorFutureStructuralWitnessReused;
  evidence.priorFutureStructuralWitnessFallbackEntered=core.evidence.priorFutureStructuralWitnessFallbackEntered;
  evidence.futureStructuralWitnesses=[...evidence.futureStructuralWitnesses,...structuredClone(core.evidence.futureStructuralWitnesses),...structuredClone(selectedFutureRoundWitnesses),...structuredClone(selectedFutureItinerantWitnesses)];
  evidence.ephemeralSupportingPlacements=structuredClone(core.evidence.ephemeralSupportingPlacements);
  evidence.acceptedSupportingPlacements=structuredClone(core.evidence.acceptedSupportingPlacements);
  if(evidence.supportingGeometryRepairSuccesses>0&&selectedTasks){
    const selectedById=new Map((selectedTasks as ScheduledTask[]).map(task=>[task.id,task]));
    evidence.acceptedSupportingPlacements=evidence.acceptedSupportingPlacements.flatMap(placement=>{
      const selected=selectedById.get(placement.id);return selected?[selected]:[];});
  }
  if(acceptedContinuation.witness){
    evidence.futureStructuralWitnesses=[...evidence.futureStructuralWitnesses.filter(item=>item.kind!=="FIXED_SUPPORTING_PIPELINE"),structuredClone(acceptedContinuation.witness)];
    evidence.futureStructuralWitnesses=evidence.futureStructuralWitnesses.map(item=>{if(item.kind!=="ITINERANT_AGENDA")return item;
      const body={...item,supportingFingerprint:acceptedContinuation.witness!.fingerprint};const {fingerprint:_old,...unsigned}=body;
      return {...unsigned,fingerprint:createHash("sha256").update(JSON.stringify(unsigned)).digest("hex")};});
    const itinerary=evidence.futureStructuralWitnesses.find(item=>item.kind==="ITINERANT_AGENDA");
    if(itinerary?.kind==="ITINERANT_AGENDA"){evidence.futureItinerantWitnessFingerprint=itinerary.fingerprint;
      evidence.futureItinerantWitnessSupportingFingerprint=itinerary.supportingFingerprint;}
    evidence.ephemeralSupportingPlacements=structuredClone(acceptedContinuation.witness.ephemeralSupportingPlacements);
  }
  if(evidence.futureWitnessSet.finalSet){
    const finalSet=evidence.futureWitnessSet.finalSet;
    const originalFingerprint=finalSet.fingerprint;
    const pairs=finalSet.identities.map(identity=>{const witness=evidence.futureStructuralWitnesses.find(item=>
      item.kind==="ROUND_SYNCHRONIZATION"?identity===`ROUND_SYNCHRONIZATION:${item.policyId}`:
      item.kind==="ITINERANT_AGENDA"?identity===`ITINERANT_AGENDA:${item.identity}`:false);
      return [identity,witness!.fingerprint];});
    finalSet.witnessFingerprints=pairs.map(pair=>pair[1]!);
    finalSet.fingerprint=createHash("sha256").update(JSON.stringify(pairs)).digest("hex");
    for(const trace of evidence.futureWitnessSetCandidateTraces)if(trace.setFingerprint===originalFingerprint)trace.setFingerprint=finalSet.fingerprint;
  }
  evidence.branchesBeforeCurrentContinuation=core.evidence.branchesBeforeCurrentContinuation;
  evidence.protectedMainSlotChecks=core.evidence.protectedMainSlotChecks;
  evidence.protectedMainSlotMismatches=core.evidence.protectedMainSlotMismatches;
  evidence.pipelineTasksRemovedFromStandalone=core.evidence.pipelineTasksRemovedFromStandalone;
  evidence.pendingBeforeFixedMainBundle=core.evidence.pendingBeforeFixedMainBundle;
  evidence.pendingAfterFixedMainBundle=core.evidence.pendingAfterFixedMainBundle;
  evidence.legacyFixedFeederFallbackEntered=core.evidence.legacyFixedFeederFallbackEntered;
  evidence.legacyFixedFeederFallbackReason=core.evidence.legacyFixedFeederFallbackReason;
  evidence.firstFixedMainBundleRejection=core.evidence.firstFixedMainBundleRejection;
  evidence.firstFixedMainBundleHardGateDiagnostic=structuredClone(core.evidence.firstFixedMainBundleHardGateDiagnostic);
  evidence.feederMatchingEquivalentOrdersCollapsed=core.evidence.feederMatchingEquivalentOrdersCollapsed;
  evidence.feederOrderFallbacks=core.evidence.feederOrderFallbacks;
  evidence.forcedMainSingletonChecks = core.evidence.forcedMainSingletonChecks;
  evidence.forcedMainSingletonChoices = core.evidence.forcedMainSingletonChoices;
  evidence.forcedMainSiblingAlternativesEliminated = core.evidence.forcedMainSiblingAlternativesEliminated;
  evidence.forcedMainSingletonDeadEnds = core.evidence.forcedMainSingletonDeadEnds;
  evidence.mainCandidatesExploredBeforeCohort = { ...core.evidence.mainCandidatesExploredBeforeCohort };
  evidence.remainingTaskIds = [...core.remainingTaskIds].sort();
  const fail = (status: Exclude<ExactItinerantPlanStatus, "COMPLETE">, reasons: string[]): ExactItinerantPlanResult => {
    evidence.reasonCodes = [...new Set(reasons)].sort();
    return { status, complete: false, scheduledTasks: [], scheduledSetupPreparations: [], scheduledRoundPreparations: [], scheduledSpaceMeals: [], scheduledParticipantMeals: [],scheduledResourceMeals:[],scheduledOperationalMeals:[],scheduledItinerantUnitMeals:[],
      remainingTaskIds: [...evidence.remainingTaskIds], evidence };
  };
  if (core.status === "BRANCH_BUDGET_EXHAUSTED" && selectedTasks === null) return fail("BRANCH_BUDGET_EXHAUSTED",
    [ledger.lastExhaustionPhase === "STANDALONE" ? "STANDALONE_BRANCH_BUDGET_EXHAUSTED" : "CORE_BRANCH_BUDGET_EXHAUSTED"]);
  if (selectedTasks === null) {
    if (evidence.futureCollectiveClosureInconclusiveLeaves > 0)
      return fail("UNSUPPORTED_STANDALONE_SHAPE", ["FUTURE_COLLECTIVE_CLOSURE_INCONCLUSIVE"]);
    if(evidence.participantFutureUnreachableDependencyIds.length>0)
      return fail("UNSUPPORTED_STANDALONE_SHAPE",["PARTICIPANT_FUTURE_RESERVATION_INCONCLUSIVE"]);
    if (evidence.coreCompleteLeavesEvaluated > 0 || evidence.standaloneForwardPrunes > 0)
      return fail("INFEASIBLE", ["NO_COMPLETE_HARD_VALID_ITINERANT_PLAN"]);
    return fail("CORE_FAILED", [`CORE_${core.status}`, ...core.evidence.reasonCodes]);
  }
  const scheduledTasks: ScheduledTask[] = selectedTasks;
  evidence.selectedStandaloneTaskIds = scheduledTasks.filter(({ id }) => !selectedCoreIds.has(id)).map(({ id }) => id).sort();
  evidence.selectedStandaloneStarts = Object.fromEntries(scheduledTasks.filter(({ id }) => !selectedCoreIds.has(id))
    .sort(byId).map(({ id, start }) => [id, start]));
  const scheduledSetupPreparations = [...selectedPreparations];
  evidence.selectedSetupFamilySequenceBySpaceId = Object.fromEntries(problem.spaces
    .filter((space) => space.setupPolicy !== undefined)
    .sort(byId)
    .map((space) => [space.id, setupFamilySequence(scheduledTasks.filter((task) => task.spaceId === space.id))]));
  evidence.selectedSetupPreparationIds = scheduledSetupPreparations.map(({ id }) => id).sort();
  const scheduledRoundPreparations = [...selectedRoundPreparations];
  evidence.selectedRoundPreparationIds = scheduledRoundPreparations.map(({ id }) => id).sort();
  const completedOperationalMeals = selectedOperationalMeals as OperationalMealWitness | null;
  const completedParticipantMeals = selectedParticipantMeals as ParticipantMealWitness | null;
  const scheduledItinerantUnitMeals=materializeScheduledItinerantUnitMeals(problem);const scheduledOperationalMeals=[...(completedOperationalMeals?.scheduled??[])];evidence.fullFingerprint=fingerprint(scheduledTasks,scheduledSetupPreparations,selectedMeals,scheduledItinerantUnitMeals,scheduledRoundPreparations,scheduledOperationalMeals); evidence.remainingTaskIds = []; evidence.reasonCodes = [];
  const scheduledResourceMeals=(problem.resourceMeals??[]).map(meal=>({id:meal.id,sourceTaskId:meal.sourceTaskId,resourceIds:[...meal.resourceIds],start:meal.interval.start,end:meal.interval.end,duration:meal.interval.end-meal.interval.start}));
  return { status: "COMPLETE", complete: true, scheduledTasks, scheduledSetupPreparations, scheduledRoundPreparations, scheduledSpaceMeals: [...selectedMeals], scheduledParticipantMeals:[...(completedParticipantMeals?.scheduled??[])],scheduledResourceMeals,scheduledOperationalMeals,scheduledItinerantUnitMeals,remainingTaskIds: [], evidence };
}

/** Frozen historical control and explicit rollback path. */
export function constructFirstHardValidExactItinerantPlan(problem: PlannerNextProblem): ExactItinerantPlanResult {
  return runExactItinerantPlanSearch(problem, {});
}

/** Accepted exact path: selects the best dominating complete incumbent observed within the shared budget. */
export function constructExactItinerantPlan(problem: PlannerNextProblem, causalDiagnostic=false, acceptsValidation?:ExactItinerantPlanSearchOptions["acceptsValidation"],fixedPlacements?:readonly ScheduledTask[],fixedPlacementsAsContext=false,fixedSetupPreparations?:readonly ScheduledSetupPreparation[],fixedRoundPreparations?:readonly ScheduledRoundPreparation[],prior?:readonly import("./anonymousPipelineWitness").FutureStructuralWitness[]|Extract<import("./anonymousPipelineWitness").FutureStructuralWitness,{kind:"FIXED_SUPPORTING_PIPELINE"}>): ExactItinerantPlanResult {
  const priorFutureStructuralWitnesses=prior?(Array.isArray(prior)?prior:[prior]):undefined;
  const pipeline=fixedPlacementsAsContext&&!problem.analyticalFutureCollectiveContinuation?materializeFirstNominalPipelineWitness(problem):null;
  const preferredArchitecture=pipeline?.witness.status==="FEASIBLE"?{
    pattern:pipeline.witness.pattern,
    slots:[...pipeline.witness.mainSpots].sort((a,b)=>Number(a.id.slice(5))-Number(b.id.slice(5))).map(spot=>spot.start),
  }:undefined;
  const fixedIds=new Set((fixedPlacements??[]).map(({id})=>id));
  const mains=problem.tasks.filter(task=>task.kind==="main");
  const fixedMainAuthority=mains.length>0&&mains.every(task=>fixedIds.has(task.id));
  // The fixed-main path reconstructs and validates its supporting pipeline under
  // the shared search ledger. Eagerly materializing the same graph here would run
  // an unbudgeted arrival-rematching search and then discard it at that path.
  const bundlePressure=preferredArchitecture&&!fixedMainAuthority?new PreparedFutureTechnicalChainAuthority(problem):null;
  const matchedBundles=preferredArchitecture&&!fixedMainAuthority?materializePipelineBundleMatching(problem,preferredArchitecture,fixedPlacements,
    new Set(),undefined,()=>true,operation=>bundlePressure!.intrusion(operation)):null;
  const repairPreferredBundleCandidate:ExactMainAndFeederSearchOptions["repairPreferredBundleCandidate"]=
    preferredArchitecture&&!fixedMainAuthority?(previous,forbidden,consume)=>materializePipelineBundleMatching(problem,preferredArchitecture,
      fixedPlacements,forbidden,previous,consume,operation=>bundlePressure!.intrusion(operation)):undefined;
  const coreIds = new Set(problem.tasks.filter(({ kind }) => kind === "main" || kind === "vocal").map(({ id }) => id));
  for (const id of anchoredTaskIds(problem)) coreIds.add(id);
  const standaloneTasks = problem.tasks.filter(({ id }) => !coreIds.has(id));
  if (standaloneTasks.length === 0) return runExactItinerantPlanSearch(problem,{causalDiagnostic,acceptsValidation,
    fixedPlacements,fixedPlacementsAsContext,fixedSetupPreparations,fixedRoundPreparations,priorFutureStructuralWitnesses,preferredArchitecture,preferredBundleCandidate:matchedBundles??undefined,
    repairPreferredBundleCandidate});
  const orderer = createResidualObligationMainOrderer(problem, standaloneTasks);
  return runExactItinerantPlanSearch(problem, {
    coreOrderer: orderer.options,
    // Assisted search protects an accepted baseline and needs one canonical
    // hard-valid completion around it; spending the full residual budget on
    // incumbent domination cannot improve the human-protected placements.
    standaloneCompletionSelection: fixedPlacementsAsContext ? "FIRST_HARD_VALID" : "BEST_DOMINATING_WITHIN_BUDGET",
    causalDiagnostic, acceptsValidation, fixedPlacements, fixedPlacementsAsContext, fixedSetupPreparations, fixedRoundPreparations, priorFutureStructuralWitnesses, preferredArchitecture,
    preferredBundleCandidate:matchedBundles??undefined,repairPreferredBundleCandidate,
  });
}
