import test from "node:test";
import assert from "node:assert/strict";
import { classifyInitialConstructionCausalBranchOutcome } from "./initialConstructionCausalBranchOutcomeClassifier";
import { createInitialConstructionCausalBranchOutcomeLedger } from "./initialConstructionCausalBranchOutcomeLedger";

const attempt:any={attemptId:"a",conflictFingerprint:"A",conflictFamilyFingerprint:"fam",frontierTaskId:1,blockingTaskIds:[2],checkpointFingerprint:"cp",checkpointParentPartialPlanId:"p",checkpointParentAssignmentsFingerprint:"pfp",causalDecisionId:"d",causalDecisionDepth:1,selectedPartialPlanId:"s",selectedAssignmentsFingerprint:"sfp",checkpointBranchPartialPlanId:"b",checkpointBranchFingerprint:"bf",checkpointBranchAssignmentsFingerprint:"bfp",activationOrdinal:1,baselineProductiveAssignmentCount:1,baselineResidualProductiveTaskCount:9,baselineMaximumProductiveAssignmentCountObserved:1,status:"ACTIVE",resultingConflictFingerprint:null,resultingFrontierTaskId:null,maximumProductiveAssignmentCountObserved:1,minimumResidualProductiveTaskCountObserved:9,blockedFrontierTaskBecameAssigned:false,durableProductiveProgressObserved:false,activatedAtExpansionWorkUnit:1,resolvedAtExpansionWorkUnit:null,outcomeFingerprint:null,fingerprint:"afp",readOnly:true};

test("classifies exact same conflict without progress as repeated",()=>{
 const c=classifyInitialConstructionCausalBranchOutcome({attempt,resultingConflict:{fingerprint:"A",frontierTaskId:1},activePartialPlan:{assignments:[]}});
 assert.equal(c.status,"REPEATED_SAME_CONFLICT");
 assert.equal(c.exactConflictFingerprintMatch,true);
});

test("classifies exact same conflict with progress as progressed repeated",()=>{
 const c=classifyInitialConstructionCausalBranchOutcome({attempt,resultingConflict:{fingerprint:"A",frontierTaskId:1},productiveProgress:true,activePartialPlan:{assignments:[]}});
 assert.equal(c.status,"PROGRESSED_BUT_REPEATED_SAME_CONFLICT");
});

test("classifies different fingerprint as advanced even in same family",()=>{
 const c=classifyInitialConstructionCausalBranchOutcome({attempt,resultingConflict:{fingerprint:"B",familyFingerprint:"fam",frontierTaskId:1,blockingTaskIds:[2]},activePartialPlan:{assignments:[]}});
 assert.equal(c.status,"ADVANCED_TO_DIFFERENT_CONFLICT");
 assert.equal(c.exactConflictFingerprintMatch,false);
});

test("resolved blocked frontier has priority over different conflict",()=>{
 const c=classifyInitialConstructionCausalBranchOutcome({attempt,resultingConflict:{fingerprint:"B"},activePartialPlan:{assignments:[{taskId:1}]}});
 assert.equal(c.status,"RESOLVED_BLOCKED_FRONTIER");
});

test("ledger prevents repeated status with different fingerprints from registering no-good",()=>{
 const ledger=createInitialConstructionCausalBranchOutcomeLedger(10);
 const opened=ledger.open({...attempt,conflictFingerprint:"A",checkpointFingerprint:"cp",causalDecisionId:"d",checkpointBranchFingerprint:"bf",checkpointBranchAssignmentsFingerprint:"bfp"});
 const r=ledger.resolve(opened.attempt.attemptId,{status:"REPEATED_SAME_CONFLICT",resultingConflictFingerprint:"B"});
 assert.equal(r.attempt.status,"ADVANCED_TO_DIFFERENT_CONFLICT");
 assert.equal(ledger.summary().causalBranchNoGoodRegisteredCount,0);
 assert.equal(ledger.summary().causalBranchOutcomeSameFingerprintInvariantViolationCount,1);
});
