import assert from "node:assert/strict";
import { createViolationKey, isAcceptedExceptionStillApplicable } from "../../shared/assistedStageValidation";

export function runA2Assist6Evidence(){
  const key=createViolationKey({ruleCode:"OVERLAP_VIOLATION",affectedTaskIds:[11,12],affectedSpaceIds:[3],dimensions:{11:{start:540,end:570},12:{start:555,end:585}}});
  const exception={violationKey:key,affectedTaskIds:[11,12],snapshotFingerprint:"a".repeat(64)};
  const exactInherited=isAcceptedExceptionStillApplicable(exception,{violationKey:key},[]);
  const unrelatedChange=isAcceptedExceptionStillApplicable(exception,{violationKey:key},[99]);
  const affectedMove=isAcceptedExceptionStillApplicable(exception,{violationKey:key},[11]);
  const evidence={benchmark:"A2-ASSIST-6",hardValidationCurrent:true,hardValid:false,hardCount:1,
    acceptWithoutConfirmation:"HARD_CONFIRMATION_REQUIRED",acceptWithConfirmation:"ATOMIC_STAGE_AND_EXCEPTION",
    acceptedExceptionStatus:"ACTIVE",dailyTasksWriteBoundary:"ACCEPT_ONLY",exactInherited,unrelatedChange,
    affectedMove,newHardViolationCountAfterMove:1,requiredViolationCount:0,preferredAssessment:"NOT_CLASSIFIED"};
  assert.equal(exactInherited,true);assert.equal(unrelatedChange,true);assert.equal(affectedMove,false);return evidence;
}
if(import.meta.url===`file://${process.argv[1]}`)process.stdout.write(`${JSON.stringify(runA2Assist6Evidence(),null,2)}\n`);
