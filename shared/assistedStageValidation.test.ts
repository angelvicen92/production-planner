import assert from "node:assert/strict";
import test from "node:test";
import { createViolationKey, isAcceptedExceptionStillApplicable } from "./assistedStageValidation";

test("violationKey is deterministic and order-independent for entity sets", () => {
  const a=createViolationKey({ruleCode:"OVERLAP_VIOLATION",affectedTaskIds:[9,2,9],affectedResourceIds:[4,1],dimensions:{interval:[20,10]}});
  const b=createViolationKey({ruleCode:"OVERLAP_VIOLATION",affectedTaskIds:[2,9],affectedResourceIds:[1,4],dimensions:{interval:[10,20]}});
  assert.equal(a,b); assert.notEqual(a,createViolationKey({ruleCode:"OVERLAP_VIOLATION",affectedTaskIds:[2,9],dimensions:{interval:[10,25]}}));
});

test("accepted exception applies only to the exact key while affected tasks remain unchanged", () => {
  const exception={violationKey:"exact",affectedTaskIds:[2,9],snapshotFingerprint:"a"};
  assert.equal(isAcceptedExceptionStillApplicable(exception,{violationKey:"exact"},[7]),true);
  assert.equal(isAcceptedExceptionStillApplicable(exception,{violationKey:"new"},[]),false);
  assert.equal(isAcceptedExceptionStillApplicable(exception,{violationKey:"exact"},[9]),false);
});
