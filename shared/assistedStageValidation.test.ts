import assert from "node:assert/strict";
import test from "node:test";
import { createViolationKey, isAcceptedExceptionStillApplicable } from "./assistedStageValidation";

test("violationKey is deterministic and order-independent for entity sets", () => {
  const a=createViolationKey({ruleCode:"OVERLAP_VIOLATION",affectedTaskIds:[9,2,9],affectedResourceIds:[4,1],dimensions:{interval:[20,10]}});
  const b=createViolationKey({ruleCode:"OVERLAP_VIOLATION",affectedTaskIds:[2,9],affectedResourceIds:[1,4],dimensions:{interval:[20,10]}});
  assert.equal(a,b); assert.notEqual(a,createViolationKey({ruleCode:"OVERLAP_VIOLATION",affectedTaskIds:[2,9],dimensions:{interval:[10,25]}}));
});

test("accepted exception applies only to the exact key while affected tasks remain unchanged", () => {
  const exception={violationKey:"exact",affectedTaskIds:[2,9],snapshotFingerprint:"a"};
  assert.equal(isAcceptedExceptionStillApplicable(exception,{violationKey:"exact"},[7]),true);
  assert.equal(isAcceptedExceptionStillApplicable(exception,{violationKey:"new"},[]),false);
  assert.equal(isAcceptedExceptionStillApplicable(exception,{violationKey:"exact"},[9]),false);
});

test("config revision is provenance: exact untouched identity is grandfathered, material identity and moved tasks are not",()=>{
  const oldDecision={violationKey:"same-material-rule",affectedTaskIds:[2],snapshotFingerprint:"old-snapshot",configRevisionId:10};
  assert.equal(isAcceptedExceptionStillApplicable(oldDecision,{violationKey:"same-material-rule"},[]),true);
  assert.equal(isAcceptedExceptionStillApplicable(oldDecision,{violationKey:"changed-material-rule"},[]),false);
  assert.equal(isAcceptedExceptionStillApplicable(oldDecision,{violationKey:"same-material-rule"},[2]),false);
  assert.equal(oldDecision.configRevisionId,10);
});

test("violationKey recursively canonicalizes nested dimensions", () => {
  const left=createViolationKey({ruleCode:"NESTED",affectedTaskIds:["10","2"],dimensions:{outer:{z:1,a:{right:true,left:false}},items:[{b:2,a:1}]}});
  const right=createViolationKey({ruleCode:"NESTED",affectedTaskIds:["2","10"],dimensions:{items:[{a:1,b:2}],outer:{a:{left:false,right:true},z:1}}});
  assert.equal(left,right);
});
