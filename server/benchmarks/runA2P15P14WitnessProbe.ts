import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCanonicalA2AssistedStage1Fixture } from "../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { buildAssistedPlanningSnapshotV1 } from "../assistedPlanningSnapshot";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";

const EVIDENCE_PATH="docs/evidence/A2-ASSIST-8-assisted-completion.json";

export async function runA2P15P14WitnessProbe(){
  const fixture=JSON.parse(readFileSync(EVIDENCE_PATH,"utf8"));
  const source=fixture.iterations?.find((item:any)=>item.ordinal===6);
  assert.ok(source,"A2-ASSIST-8 iteration 6 must exist");
  assert.equal(source.acceptedSnapshotBefore.length,75);

  const canonical=buildCanonicalA2AssistedStage1Fixture(6_000,711);
  const acceptedById=new Map(source.acceptedSnapshotBefore.map((row:any)=>[row.taskId,row]));
  const snapshot=buildAssistedPlanningSnapshotV1(canonical.input.tasks.map(task=>({
    id:task.id,startPlanned:null,endPlanned:null,zoneId:task.zoneId??null,spaceId:task.spaceId??null,
    ...(acceptedById.get(task.id)??{}),
  })),undefined,source.baseSnapshotOperationalMeals,source.baseSnapshotSetupPreparations,source.baseSnapshotRoundPreparations);

  const run=await runA2Assist8Evidence({branchBudget:6_000,initialSnapshot:snapshot,stopAfterIterationCount:2});
  const [p15,p14]=run.iterations;
  assert.equal(p15.orchestration.selectedUnitId,"OPERATIONAL_MEAL:p15-operations");
  assert.equal(p15.proposalOutcome,"PROPOSAL");
  assert.equal(p15.completedObligationCount,111);
  assert.equal(p15.newHardViolationCount,0);assert.equal(p15.newRequiredViolationCount,0);
  assert.ok(p15.futureStructuralWitnesses.length>=1);
  assert.ok(p15.ephemeralSupportingPlacements.length>0);
  assert.equal(p15.acceptedSupportingPlacements.length,0);
  assert.ok(p15.acceptedStageId);
  assert.equal(typeof p15.acceptedStageProposalRunId,"number");

  assert.equal(p14.orchestration.selectedUnitId,"OPERATIONAL_MEAL:p14-operations");
  const priorAttempt=p14.fixedSupportingGeometriesAttempted[0]??null;
  const reachedContinuation=p14.branchesBeforeCurrentContinuation!==null;
  const hardGate=reachedContinuation?"PASS":"REJECT";
  const causal={
    scopeSelector:p14.scopeSelector,unitId:p14.orchestration.selectedUnitId,proposalOutcome:p14.proposalOutcome,
    completedObligations:p14.completedObligationCount,coreBranches:p14.work.coreBranches??0,
    standaloneBranches:p14.work.standaloneBranches??0,
    priorFutureStructuralWitnessFound:p14.priorFutureStructuralWitnessFound,
    priorFutureStructuralWitnessFingerprint:p14.priorFutureStructuralWitnessFingerprint,
    priorFutureStructuralWitnessRevalidation:p14.priorFutureStructuralWitnessRevalidation,
    priorFutureStructuralWitnessReused:p14.priorFutureStructuralWitnessReused,
    priorFutureStructuralWitnessFallbackEntered:p14.priorFutureStructuralWitnessFallbackEntered,
    branchesBeforeCurrentContinuation:p14.branchesBeforeCurrentContinuation,
    fixedSupportingMatchingAttempts:p14.fixedSupportingMatchingAttempts,
    fixedSupportingGeometriesAttempted:p14.fixedSupportingGeometriesAttempted,
    priorAttemptMatchingTraversals:priorAttempt?.matchingTraversals??null,
    hardGate,reachedStandalone:(p14.work.standaloneBranches??0)>0,reachedContinuation,
    firstFixedMainBundleRejection:p14.fixedMainBundle?.firstFixedMainBundleRejection??null,
    firstCausalBlocker:p14.firstBlocker,reasonCodes:p14.reasonCodes,
  };
  return {benchmark:"A2-P15-P14-WITNESS-PROBE",branchBudget:6_000,p15:{proposalOutcome:p15.proposalOutcome,
    completedObligations:p15.completedObligationCount,newHardViolationCount:p15.newHardViolationCount,
    newRequiredViolationCount:p15.newRequiredViolationCount,futureStructuralWitnessCount:p15.futureStructuralWitnesses.length,
    ephemeralSupportingPlacementCount:p15.ephemeralSupportingPlacements.length,
    acceptedSupportingPlacementCount:p15.acceptedSupportingPlacements.length,acceptedStageId:p15.acceptedStageId,
    acceptedStageProposalRunId:p15.acceptedStageProposalRunId},p14:causal};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))console.log(JSON.stringify(await runA2P15P14WitnessProbe(),null,2));
