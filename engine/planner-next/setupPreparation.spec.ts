import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint } from "./fingerprint";
import { generateBlockCandidates } from "./placeAuxiliaryTasks";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { createSetupPreparation } from "./setupPreparation";
import { setupGroupingScenario } from "./scenarios/setupGroupingScenario";
import { setupPreparationScenario } from "./scenarios/setupPreparationScenario";
import { preflight, validatePlan } from "./validate";

test("NEXT-011 generates three deterministic space-only preparations",()=>{
 const input=setupPreparationScenario(), snapshot=structuredClone(input), result=planMainFlowAndFeeders(input);
 assert.equal(result.complete,true); assert.equal(result.metrics.hardValid,true); assert.equal(result.metrics.plannedTaskCount,24);
 assert.deepEqual(result.scheduledSetupPreparations.map(x=>[x.setupFamilyId,x.duration]),[["family-a",10],["family-b",15],["family-c",5]]);
 assert.equal(result.metrics.setupPreparationMinutesBySpaceId["setup-room"],30);assert.equal(result.metrics.secondarySpaceEndById["setup-room"]!-result.metrics.secondarySpaceStartById["setup-room"]!,120);
 assert.equal(result.metrics.secondarySpaceGapMinutesById["setup-room"],0);assert.equal(result.metrics.secondarySpaceBlockCountById["setup-room"],1);
 assert.deepEqual(input,snapshot); assert.equal(fingerprint([...result.scheduledTasks].reverse(),[...result.scheduledSetupPreparations].reverse()),result.metrics.planFingerprint);
});
test("NEXT-010 remains byte-fingerprint compatible",()=>{const r=planMainFlowAndFeeders(setupGroupingScenario());assert.equal(r.metrics.planFingerprint,"ce38430a30274f3369f34b75f855ed0e94b7bd74acf5f82415de2e9bfa50ea7d");assert.deepEqual(r.scheduledSetupPreparations,[])});
test("preflight rejects malformed preparation records with one deterministic code",()=>{for(const value of [null,{"family-a":10,"family-b":15},{"family-a":10,"family-b":15,"family-c":5,extra:1},{"family-a":0,"family-b":15,"family-c":5},{"family-a":-1,"family-b":15,"family-c":5},{"family-a":1.5,"family-b":15,"family-c":5},{"family-a":NaN,"family-b":15,"family-c":5}]){const p=setupPreparationScenario();(p.spaces.find(x=>x.id==="setup-room")!.setupPolicy as any).preparationMinutesByFamily=value;assert.equal(preflight(p).filter(x=>x==="INVALID_SETUP_PREPARATION_POLICY").length,1)}});
test("missing, duplicate and corrupted preparations are final validation violations",()=>{const p=setupPreparationScenario(),r=planMainFlowAndFeeders(p),base=r.scheduledSetupPreparations;const variants=[base.slice(1),[...base,base[0]!],base.map((x,i)=>i?x:{...x,duration:11}),base.map((x,i)=>i?x:{...x,id:"bad"}),base.map((x,i)=>i?x:{...x,entryIndex:2}),base.map((x,i)=>i?x:{...x,spaceId:"flexible-room"}),base.map((x,i)=>i?x:{...x,setupFamilyId:"wrong"}),base.map((x,i)=>i?x:{...x,start:x.start-5})];for(const preparations of variants)assert.ok(validatePlan(p,r.scheduledTasks,preparations).setupPreparationViolationCount>0)});
test("preparations make an otherwise fitting block impossible and publish no partials",()=>{const p=setupPreparationScenario();p.spaces.find(x=>x.id==="setup-room")!.availability=[{start:600,end:700}];const tasks=p.tasks.filter(x=>x.spaceId==="setup-room");assert.equal(generateBlockCandidates(p,tasks,[],300000).candidates.length,0);const r=planMainFlowAndFeeders(p);assert.equal(r.complete,false);assert.deepEqual(r.scheduledTasks,[]);assert.deepEqual(r.scheduledSetupPreparations,[])});
test("a preparation does not claim task resources",()=>{const p=setupPreparationScenario(),r=planMainFlowAndFeeders(p),prep=r.scheduledSetupPreparations[0]!;const task=r.scheduledTasks.find(x=>x.setupFamilyId==="family-a")!;p.resources.push({id:"resource-a",availability:[p.day],presencePreference:"OFF",transitionMinutes:0});task.requiredResourceIds=["resource-a"];const other={...task,id:"resource-user",participantId:"participant-a",spaceId:"flexible-room",start:prep.start,end:prep.end,duration:prep.duration,setupFamilyId:undefined};const summary=validatePlan({...p,tasks:[...p.tasks,other]},[...r.scheduledTasks,other],r.scheduledSetupPreparations);assert.equal(summary.resourceOverlapViolationCount,0);assert.equal(summary.resourceTransitionViolationCount,0)});
test("fingerprint changes with preparation identity fields",()=>{const p=createSetupPreparation("s","f",1,5,10),tasks=planMainFlowAndFeeders(setupGroupingScenario()).scheduledTasks;for(const changed of [{...p,start:9},{...p,end:16},{...p,spaceId:"x"},{...p,setupFamilyId:"x"}])assert.notEqual(fingerprint(tasks,[p]),fingerprint(tasks,[changed]))});
