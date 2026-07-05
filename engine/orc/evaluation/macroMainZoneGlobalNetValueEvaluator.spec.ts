import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMacroMainZoneGlobalNetValue } from "./macroMainZoneGlobalNetValueEvaluator";

const state = (planning:any[]=[]) => ({ id:"s", planId:1, planning, tasks:[], resources:[], spaces:{}, availability:{}, dependencies:[], locks:[], constraints:{}, operationalMetrics:{}, cognitive:{}, source:"EngineInput", schemaVersion:"ORC-SPEC-01" } as any);
const align = (idle:number,gaps:any[],largest=Math.max(0,...gaps.map((g:any)=>g.gapMinutes??0))) => ({ totalVisibleMainZoneIdleMinutes: idle, visibleMainZoneGaps: gaps, largestVisibleMainZoneGapMinutes: largest });
const opqm = (gaps:number, compact=1) => ({ mainFlowContinuityQuality:{ gaps }, operationalCompactness: compact });
const base = state([{taskId:1,startPlanned:"10:00",endPlanned:"11:00",spaceId:1,assignedResourceIds:[1]}]);
const cand = state([{taskId:1,startPlanned:"09:00",endPlanned:"10:00",spaceId:1,assignedResourceIds:[1]}]);

function evalCase(extra:any={}) { return evaluateMacroMainZoneGlobalNetValue({ baseState:base, candidateState:cand, candidateValidation:{simulatedStateId:"x",result:"VALID",violatedConstraints:[],details:[],readOnly:true} as any, productionConceptAlignmentBefore:align(60,[{gapMinutes:60}]), productionConceptAlignmentAfter:align(30,[{gapMinutes:30}]), opqmBefore:opqm(60,0.8), opqmAfter:opqm(30,0.9), candidateMetadata:{targetGapMinutesBefore:60,expectedTargetGapMinutesAfter:30,movedTaskIds:[1]}, macroMaterializationSourceComplete:true, changedTaskIds:[1], ...extra }); }

test("accepts candidate that reduces global visible idle",()=>{ const r=evalCase(); assert.equal(r.acceptedByGlobalMacroValueGate,true); assert.equal(r.globalVisibleMainZoneIdleDelta,-30); });
test("rejects candidate that only reduces local gap",()=>{ const r=evalCase({productionConceptAlignmentAfter:align(60,[{gapMinutes:30},{gapMinutes:30}]), opqmAfter:opqm(60,0.8)}); assert.equal(r.acceptedByGlobalMacroValueGate,false); assert.ok(r.rejectionReasons.includes("macro_global_visible_idle_not_reduced")); });
test("rejects candidate that keeps total idle equal",()=>{ const r=evalCase({productionConceptAlignmentAfter:align(60,[{gapMinutes:60}])}); assert.equal(r.globalVisibleMainZoneIdleDelta,0); assert.equal(r.globalMacroRejectionReason,"macro_global_visible_idle_not_reduced"); });
test("rejects candidate that introduces compensating gaps",()=>{ const r=evalCase({productionConceptAlignmentBefore:align(90,[{gapMinutes:90}]), productionConceptAlignmentAfter:align(90,[{gapMinutes:45},{gapMinutes:45}])}); assert.ok(r.rejectionReasons.includes("macro_new_visible_gaps_offset_local_gain")); });
test("rejects candidate that worsens main flow fragmentation",()=>{ const r=evalCase({opqmAfter:opqm(80,0.9)}); assert.ok(r.rejectionReasons.includes("macro_main_flow_fragmentation_worse")); });
test("rejects candidate with incomplete materialization source",()=>{ const r=evalCase({macroMaterializationSourceComplete:false}); assert.ok(r.rejectionReasons.includes("macro_materialization_source_incomplete")); });
test("is deterministic",()=>{ assert.deepEqual(evalCase(), evalCase()); });
