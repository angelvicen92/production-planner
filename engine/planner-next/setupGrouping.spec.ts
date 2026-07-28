import assert from "node:assert/strict";
import test from "node:test";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { preflight, validatePlan } from "./validate";
import { setupGroupingScenario } from "./scenarios/setupGroupingScenario";
import { setupBlockCounts, setupFamilySequence } from "./setupGrouping";

test("groups an unordered setup input in explicit family order",()=>{const input=setupGroupingScenario(),snapshot=JSON.stringify(input),result=planMainFlowAndFeeders(input);assert.equal(result.complete,true);assert.equal(result.metrics.plannedTaskCount,24);assert.deepEqual(result.metrics.setupFamilySequenceBySpaceId["setup-room"],["family-a","family-b","family-c"]);assert.deepEqual(result.metrics.setupBlockCountBySpaceAndFamily,{"setup-room|family-a":1,"setup-room|family-b":1,"setup-room|family-c":1});assert.equal(result.metrics.setupSwitchCountBySpaceId["setup-room"],2);assert.equal(result.metrics.setupViolationCount,0);assert.equal(result.metrics.secondarySpaceEndById["setup-room"]!-result.metrics.secondarySpaceStartById["setup-room"]!,90);assert.equal(JSON.stringify(input),snapshot);});
test("preflight rejects malformed setup contracts deterministically",()=>{const cases:[string,(p:ReturnType<typeof setupGroupingScenario>)=>void][]=[
  ["DUPLICATE_SETUP_FAMILY",p=>p.spaces.find(s=>s.id==="setup-room")!.setupPolicy!.familyOrder=["family-a","family-a"]],
  ["INVALID_SETUP_POLICY",p=>p.spaces.find(s=>s.id==="setup-room")!.setupPolicy!.familyOrder=[]],
  ["EMPTY_SETUP_FAMILY",p=>p.spaces.find(s=>s.id==="setup-room")!.setupPolicy!.familyOrder.push("empty")],
  ["MISSING_SETUP_FAMILY",p=>delete p.tasks.find(t=>t.spaceId==="setup-room")!.setupFamilyId],
  ["UNKNOWN_SETUP_FAMILY",p=>p.tasks.find(t=>t.spaceId==="setup-room")!.setupFamilyId="unknown"],
  ["SETUP_FAMILY_OUTSIDE_SETUP_SPACE",p=>p.tasks.find(t=>t.spaceId==="flexible-room")!.setupFamilyId="family-a"],
  ["SETUP_ON_MAIN_FLOW_UNSUPPORTED",p=>p.spaces.find(s=>s.id==="main-stage")!.setupPolicy={familyOrder:["x"],reentry:"FORBIDDEN"}],
  ["SETUP_REQUIRES_REQUIRED_CONTINUITY",p=>delete p.spaces.find(s=>s.id==="setup-room")!.secondaryContinuity],
  ["SETUP_WITH_NON_AUXILIARY_TASK",p=>p.tasks.find(t=>t.spaceId==="setup-room")!.kind="vocal"],
  ["UNSUPPORTED_SETUP_REENTRY",p=>(p.spaces.find(s=>s.id==="setup-room")!.setupPolicy!.reentry as string)="ALLOWED"],
];for(const [reason,mutate]of cases){const p=setupGroupingScenario();mutate(p);assert.ok(preflight(p).includes(reason),reason);}});
test("validator detects reentry and accepts mixed durations in one family",()=>{const p=setupGroupingScenario(),result=planMainFlowAndFeeders(p);assert.equal(result.complete,true);const tasks=result.scheduledTasks.filter(t=>t.spaceId==="setup-room").sort((a,b)=>a.start-b.start);const reordered=tasks.map((task,index)=>({...task,start:540+index*15,end:555+index*15}));[reordered[1]!.setupFamilyId,reordered[2]!.setupFamilyId]=[reordered[2]!.setupFamilyId,reordered[1]!.setupFamilyId];assert.ok(validatePlan(p,[...result.scheduledTasks.filter(t=>t.spaceId!=="setup-room"),...reordered]).setupViolationCount>0);const ordered=result.scheduledTasks.filter(t=>t.spaceId==="setup-room");assert.deepEqual(setupFamilySequence(ordered),["family-a","family-b","family-c"]);assert.deepEqual(setupBlockCounts(ordered),{"family-a":1,"family-b":1,"family-c":1});});
test("impossible setup block publishes no partial plan",()=>{const p=setupGroupingScenario();p.spaces.find(s=>s.id==="setup-room")!.availability=[{start:540,end:600}];const result=planMainFlowAndFeeders(p);assert.equal(result.complete,false);assert.deepEqual(result.scheduledTasks,[]);});
