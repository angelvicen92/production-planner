import assert from "node:assert/strict";import test from "node:test";import { runA2Assist6Evidence } from "./runA2Assist6Evidence";
test("A2-ASSIST-6 evidence covers exact grandfathering and affected-task invalidation",()=>{const e=runA2Assist6Evidence();assert.equal(e.acceptedExceptionStatus,"ACTIVE");assert.equal(e.newHardViolationCountAfterMove,1);});
