import assert from "node:assert/strict";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";

type CausalCandidate={fingerprint:string;participantFuture:{status:string};outcome:string;firstDescendantDeadEnd:unknown};

// Replays only the accepted prefix needed to reconstruct S3 and stops after the
// Totales attempt. It never executes the later A2 completion stages.
const diagnosticBudget=Number(process.env.PLANNER_TOTALS_DIAGNOSTIC_BUDGET);
const evidence=await runA2Assist8Evidence({stopAfterIterationCount:4,
  branchBudget:Number.isFinite(diagnosticBudget)&&diagnosticBudget>0?diagnosticBudget:undefined});
const totals=evidence.iterations[3];
assert.equal(totals?.orchestration.selectedUnitId,"ROUND_SYNCHRONIZATION:a2-totales-rounds");
const reconciliation=totals.standaloneDiagnostic?.macroCandidateCausalReconciliation;
assert.ok(reconciliation,"Totales must expose macro-candidate causal reconciliation");
assert.equal(reconciliation.total,reconciliation.pruned+reconciliation.deadEndedByAuthority+reconciliation.enteredResidualOrTerminal);
const candidates=(totals.standaloneDiagnostic?.macroCandidateCausalTraces??[]) as CausalCandidate[];
assert.equal(new Set(candidates.map(candidate=>candidate.fingerprint)).size,candidates.length);
assert.ok(candidates.every(candidate=>candidate.participantFuture.status!=="NOT_CHECKED"));
assert.ok(candidates.every(candidate=>candidate.outcome!=="DEAD_ENDED_BY_AUTHORITY"||candidate.firstDescendantDeadEnd!==null));
console.log(JSON.stringify({benchmark:"A2-ASSIST-8-TOTALES-CAUSAL-PROBE",milestone:"S3",proposalOutcome:totals.proposalOutcome,
  branches:totals.work?.branchesExplored??0,reconciliation,
  roundSynchronization:{sharedOperationalMealPolicyIds:totals.standaloneDiagnostic?.roundSynchronizationSharedOperationalMealPolicyIds??[],
    breakVariantsConsidered:totals.standaloneDiagnostic?.roundSynchronizationBreakVariantsConsidered??0,
    selectedBreakIntervals:totals.standaloneDiagnostic?.roundSynchronizationSelectedBreakIntervals??[],
    mealAwareShapesFeasible:totals.standaloneDiagnostic?.roundSynchronizationMealAwareShapesFeasible??0,
    noBreakHolePrunes:totals.standaloneDiagnostic?.roundSynchronizationNoBreakHolePrunes??0,
    rawCompatibleEdges:totals.standaloneDiagnostic?.roundSynchronizationRawCompatibleEdges??0,
    futureEdgeChecks:totals.standaloneDiagnostic?.roundSynchronizationFutureEdgeChecks??0,
    analyticPrunedEdges:totals.standaloneDiagnostic?.roundSynchronizationAnalyticPrunedEdges??0,
    perfectMatchingAttempts:totals.standaloneDiagnostic?.totalesMatchingAttempts??0,
    causalForbiddenEdges:totals.standaloneDiagnostic?.roundSynchronizationCausalForbiddenEdges??0,
    incrementalRepairs:totals.standaloneDiagnostic?.roundSynchronizationIncrementalRepairs??0,
    shapesRescuedByRematching:totals.standaloneDiagnostic?.roundSynchronizationShapesRescuedByRematching??0,
    terminalFutureResult:totals.standaloneDiagnostic?.roundSynchronizationTerminalFutureResult??"NOT_CHECKED",
    matchingWitnesses:totals.standaloneDiagnostic?.roundSynchronizationMatchingWitnesses??[],
    matchingTraversals:totals.standaloneDiagnostic?.roundSynchronizationMatchingTraversals??0},
  ordinaryDiagnostic:{maximumDepth:totals.standaloneDiagnostic?.standaloneMaximumDepth,
    firstSelectedTaskId:totals.standaloneDiagnostic?.standaloneFirstSelectedTaskId,
    dominantPath:totals.standaloneDiagnostic?.standaloneDominantPathFirst20,
    selectionsByTaskId:totals.standaloneDiagnostic?.standaloneSelectionsByTaskId,
    firstDeadEnd:totals.standaloneDiagnostic?.firstStandaloneDeadEndCause},
  terminalParticipantFuture:totals.participantFutureReservation.firstTerminalExact,
  terminalParticipantFutureAggregate:{checks:totals.participantFutureReservation.terminalExactChecks,
    passes:totals.participantFutureReservation.terminalExactPasses,prunes:totals.participantFutureReservation.terminalExactPrunes,
    abstentions:totals.participantFutureReservation.terminalExactAbstentions,branches:totals.participantFutureReservation.terminalExactBranches},
  candidates,blocker:evidence.firstBlocker},null,2));
