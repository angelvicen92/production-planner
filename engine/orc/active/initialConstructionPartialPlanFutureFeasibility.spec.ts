import assert from "node:assert/strict";
import test from "node:test";
import { evaluateInitialConstructionPartialPlanFutureFeasibility as evaluate } from "./initialConstructionPartialPlanFutureFeasibility";

const chain=(goalTaskId:number, extra:any={})=>({goalTaskId,chainSlackMinutes:30,topologicalPendingChainTaskIds:[goalTaskId],executableFrontierTaskIds:[goalTaskId],pendingChainDurationMinutes:10,...extra});

test("negative chain slack is infeasible",()=>assert.equal(evaluate({criticalChains:[chain(1,{chainSlackMinutes:-1})]}).status,"INFEASIBLE"));
test("a pending chain without an executable frontier is infeasible",()=>assert.equal(evaluate({criticalChains:[chain(1,{executableFrontierTaskIds:[]})]}).status,"INFEASIBLE"));
test("moderate pressure with remaining freedom is risky",()=>assert.equal(evaluate({criticalChains:[chain(1,{resourcePressure:1})]}).status,"RISKY"));
test("multiple viable chains are feasible",()=>assert.equal(evaluate({criticalChains:[chain(2),chain(1)]}).status,"FEASIBLE"));
test("evaluation is deterministic when input arrays are shuffled",()=>{
  const a=evaluate({criticalChains:[chain(2),chain(1,{spacePressure:1})]});
  const b=evaluate({criticalChains:[chain(1,{spacePressure:1}),chain(2)]});
  assert.equal(a.fingerprint,b.fingerprint); assert.deepEqual(a.priorityKey,b.priorityKey);
});
