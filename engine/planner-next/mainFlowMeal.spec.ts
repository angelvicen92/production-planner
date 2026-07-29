import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, candidateCuts, mainFlowMealAligned } from "./mainFlowMeal";
import { mainFlowMealScenario } from "./scenarios/mainFlowMealScenario";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
describe("NEXT-017 main flow meal",()=>{it("orders all-morning then block-boundary splits",()=>{const p=mainFlowMealScenario(),pattern=["a","a","b","b"];assert.deepEqual(candidateCuts(pattern),[4,2]);assert.deepEqual(buildTimeline(p,pattern,15,2).slots,[810,825,900,915]);assert.equal(mainFlowMealAligned(p),true)});it("selects the feasible split atomically",()=>{const r=planMainFlowAndFeeders(mainFlowMealScenario());assert.equal(r.complete,true);assert.equal(r.metrics.mainFlowSelectedSplitIndex,4);assert.equal(r.metrics.mainFlowGapMinutes,0);assert.deepEqual(({start:r.scheduledSpaceMeals.find(x=>x.spaceId==="main-stage")?.start,end:r.scheduledSpaceMeals.find(x=>x.spaceId==="main-stage")?.end}),{start:840,end:900})})});
