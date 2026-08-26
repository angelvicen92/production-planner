import assert from "node:assert/strict";
import test from "node:test";
import { jointAuxiliaryTasksScenario } from "./scenarios/jointAuxiliaryTasksScenario";
import { canPlaceJointGroup, jointGroupMembers, jointGroupStarts, scheduleJointGroup, synchronizedJointTasks } from "./jointTasks";
import { canPlaceTask } from "./placement";
import { planMainFlowAndFeeders } from "./planMainFlowAndFeeders";
import { preflight, validatePlan } from "./validate";

test("places a joint auxiliary group atomically and visibly",()=>{
 const problem=jointAuxiliaryTasksScenario(), snapshot=structuredClone(problem), result=planMainFlowAndFeeders(problem);
 const members=result.scheduledTasks.filter(t=>t.jointGroupId==="shared-operation-1");
 assert.equal(result.complete,true);assert.equal(result.metrics.hardValid,true);assert.equal(result.metrics.plannedTaskCount,26);assert.equal(members.length,2);
 assert.ok(synchronizedJointTasks(members[0]!,members[1]!));assert.equal(result.metrics.resourcePresenceMinutesById["joint-resource"],20);assert.equal(result.metrics.resourceInternalGapMinutesById["joint-resource"],0);
 assert.deepEqual(problem,snapshot);assert.deepEqual(result.metrics.auxiliaryWorkItemSelectionOrder.filter(x=>x==="joint:shared-operation-1"),["joint:shared-operation-1"]);
});
test("requires a common start and rejects external conflicts",()=>{
 const problem=jointAuxiliaryTasksScenario(), group=jointGroupMembers(problem.tasks,"shared-operation-1");
 problem.participants.find(p=>p.id==="participant-c")!.availability=[{start:600,end:620}];problem.participants.find(p=>p.id==="participant-z")!.availability=[{start:605,end:625}];
 assert.deepEqual(jointGroupStarts(problem,group,[]),[]);const result=planMainFlowAndFeeders(problem);assert.equal(result.complete,false);assert.deepEqual(result.scheduledTasks,[]);assert.deepEqual(result.scheduledSetupPreparations,[]);
 const base=jointAuxiliaryTasksScenario(), members=jointGroupMembers(base.tasks,"shared-operation-1"), start=570;
 for(const external of [
  {...base.tasks[0]!,id:"external-space",participantId:"participant-a",coachId:undefined,kind:"auxiliary" as const,spaceId:"joint-room",dependencies:[],requiredResourceIds:[],start,end:start+20},
  {...base.tasks[0]!,id:"external-resource",participantId:"participant-a",coachId:undefined,kind:"auxiliary" as const,spaceId:"flexible-room",dependencies:[],requiredResourceIds:["joint-resource"],start,end:start+20},
  {...base.tasks[0]!,id:"external-participant",participantId:"participant-c",coachId:undefined,kind:"auxiliary" as const,spaceId:"flexible-room",dependencies:[],requiredResourceIds:[],start,end:start+20},
 ]) assert.equal(canPlaceJointGroup(base,members,start,[external]),false);
});
test("preflight joint group reason codes are deterministic",()=>{
 const base=jointAuxiliaryTasksScenario();
 const mutate=(fn:(p:ReturnType<typeof jointAuxiliaryTasksScenario>)=>void)=>{const p=jointAuxiliaryTasksScenario();fn(p);return preflight(p)};
 assert.ok(mutate(p=>{(p.tasks.at(-1) as any).jointGroupId=" "}).includes("INVALID_JOINT_GROUP_ID"));
 assert.ok(mutate(p=>p.tasks.pop()).includes("JOINT_GROUP_TOO_SMALL"));
 assert.ok(mutate(p=>{p.tasks.at(-1)!.duration=25}).includes("JOINT_GROUP_DURATION_MISMATCH"));
 assert.ok(mutate(p=>{p.tasks.at(-1)!.spaceId="flexible-room"}).includes("JOINT_GROUP_SPACE_MISMATCH"));
 assert.ok(mutate(p=>{p.tasks.at(-1)!.requiredResourceIds=[]}).includes("JOINT_GROUP_RESOURCE_MISMATCH"));
 assert.ok(mutate(p=>{p.tasks.at(-1)!.participantId=p.tasks.at(-2)!.participantId}).includes("JOINT_GROUP_DUPLICATE_PARTICIPANT"));
 assert.ok(mutate(p=>{p.tasks.at(-1)!.coachId="coach-a"}).includes("JOINT_GROUP_COACH_UNSUPPORTED"));
 const valid=structuredClone(base);valid.tasks.at(-1)!.requiredResourceIds=["joint-resource"];assert.equal(preflight(valid).length,0);
});
test("validation reports a synchronized group once",()=>{const p=jointAuxiliaryTasksScenario(),r=planMainFlowAndFeeders(p),changed=structuredClone(r.scheduledTasks);changed.find(t=>t.id==="a-joint-member-2")!.start+=5;const v=validatePlan(p,changed,r.scheduledSetupPreparations);assert.equal(v.jointGroupViolationCount,1);assert.ok(v.reasonCodes.includes("JOINT_GROUP_VIOLATION"));});
test("validation rejects undeclared and changed joint membership deterministically",()=>{const p=jointAuxiliaryTasksScenario(),r=planMainFlowAndFeeders(p);const individual=structuredClone(r.scheduledTasks);individual.find(t=>t.jointGroupId===undefined)!.jointGroupId="unknown";assert.equal(validatePlan(p,individual).jointGroupViolationCount,1);const missing=structuredClone(r.scheduledTasks);delete missing.find(t=>t.id==="a-joint-member-2")!.jointGroupId;assert.equal(validatePlan(p,missing).jointGroupViolationCount,1);const moved=structuredClone(r.scheduledTasks);moved.find(t=>t.id==="a-joint-member-2")!.jointGroupId="unknown";assert.equal(validatePlan(p,moved).jointGroupViolationCount,2);assert.equal(validatePlan(p,[...moved].reverse()).jointGroupViolationCount,2);const extra=structuredClone(r.scheduledTasks);extra.find(t=>t.jointGroupId===undefined)!.jointGroupId="shared-operation-1";assert.equal(validatePlan(p,extra).jointGroupViolationCount,1);});

test("SPEC10-017 allows dependent joint groups and rejects internal dependencies",()=>{
 const p=jointAuxiliaryTasksScenario();
 p.tasks.push(
  {id:"pre-a",kind:"auxiliary",participantId:"participant-c",duration:10,spaceId:"flexible-room",dependencies:[]},
  {id:"pre-z",kind:"auxiliary",participantId:"participant-z",duration:10,spaceId:"flexible-room",dependencies:[]},
  {id:"post-a",kind:"auxiliary",participantId:"participant-c",duration:20,spaceId:"joint-room",requiredResourceIds:["joint-resource"],dependencies:["pre-a"],jointGroupId:"shared-operation-2"},
  {id:"post-z",kind:"auxiliary",participantId:"participant-z",duration:20,spaceId:"joint-room",requiredResourceIds:["joint-resource"],dependencies:["pre-z"],jointGroupId:"shared-operation-2"},
 );
 const group=jointGroupMembers(p.tasks,"shared-operation-2"), snapshot=structuredClone(p);
 assert.equal(preflight(p).length,0);
 // Search may anchor the dependent joint operation first; temporal precedence is enforced
 // when either endpoint is later materialized, not by requiring predecessor search order.
 assert.equal(canPlaceJointGroup(p,group,590,[]),true);
 const scheduledGroup=scheduleJointGroup(group,590);
 const preA=p.tasks.find(t=>t.id==="pre-a")!, preZ=p.tasks.find(t=>t.id==="pre-z")!;
 assert.equal(canPlaceTask(p,preA,560,scheduledGroup),true);
 const scheduledPreA={...preA,start:560,end:570};
 assert.equal(canPlaceTask(p,preZ,575,[...scheduledGroup,scheduledPreA]),true);
 assert.equal(canPlaceTask(p,preA,585,scheduledGroup),false);
 assert.equal(canPlaceJointGroup(p,group,590,[scheduledPreA]),true);
 assert.deepEqual(p,snapshot);
 const internal=structuredClone(p); internal.tasks.find(t=>t.id==="post-a")!.dependencies=["post-z"];
 assert.ok(preflight(internal).includes("JOINT_GROUP_INTERNAL_DEPENDENCY_UNSUPPORTED"));
});
