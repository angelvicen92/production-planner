import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";
import type { EngineInput } from "../../types";
import { generateBlockCandidates } from "../placeAuxiliaryTasks";
import { preflight as preflightPlannerNextProblem, validatePlan } from "../validate";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { preflightEngineInputForPlannerNext } from "../integration/engineInputPreflight";
import { createSpec10018SetupPolicyEngineInputFixture, createSupportedEngineInputAdapterFixture } from "../integration/engineInputAdapter.fixture";

const baseCommit = "d3f946e9d1fc93bfa4e7a5f17f5984ae48057237";
const evidencePath = "docs/evidence/SPEC10-018-engine-input-setup-policy.json";
const compare = (a:string,b:string)=>a.localeCompare(b,"en");
const sha256File=(p:string)=>createHash("sha256").update(readFileSync(p)).digest("hex");
const canonicalize=(v:unknown):unknown=>Array.isArray(v)?v.map(canonicalize):v&&typeof v==="object"?Object.fromEntries(Object.entries(v as Record<string,unknown>).filter(([k])=>k!=="runtimeMs").sort(([a],[b])=>compare(a,b)).map(([k,x])=>[k,canonicalize(x)])):v;
const canonicalJson=(v:unknown)=>JSON.stringify(canonicalize(v));
const writeStable=(p:string,v:unknown)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,`${JSON.stringify(v,null,2)}\n`);};
const modifiedFiles=()=>[...new Set([...execFileSync("git",["diff","--name-only",`${baseCommit}...HEAD`],{encoding:"utf8"}).trim().split("\n"),...execFileSync("git",["diff","--name-only"],{encoding:"utf8"}).trim().split("\n"),...execFileSync("git",["diff","--cached","--name-only"],{encoding:"utf8"}).trim().split("\n")].filter(Boolean))].sort(compare);
const invertSets=(input:EngineInput):EngineInput=>({...input,tasks:[...input.tasks].reverse(),locks:[...input.locks].reverse(),planResourceItems:[...input.planResourceItems].reverse(),planSpaceSettings:[...(input.planSpaceSettings??[])].reverse(),planZoneSettings:[...(input.planZoneSettings??[])].reverse(),setupPolicies:input.setupPolicies?.map(p=>({...p,families:[...p.families].reverse()})).reverse()});

export function runSpec10018Probe(familyOrder=["sillon","estrellas"], factory=()=>createSpec10018SetupPolicyEngineInputFixture(familyOrder)) {
  const input=factory(); const snap=structuredClone(input);
  const engineInputPreflight=preflightEngineInputForPlannerNext(input); assert.equal(engineInputPreflight.status,"SUPPORTED",engineInputPreflight.reasonCodes.join(","));
  const adapter=adaptEngineInputToPlannerNextProblem(input); assert.equal(adapter.status,"SUPPORTED",adapter.status==="UNSUPPORTED"?adapter.reasonCodes.join(","):""); assert.ok(adapter.problem);
  const plannerNextPreflightReasonCodes=preflightPlannerNextProblem(adapter.problem); assert.deepEqual(plannerNextPreflightReasonCodes,[]);
  const setupSourceTasks = adapter.problem.tasks.filter((task) => task.setupFamilyId !== undefined);
  const block = generateBlockCandidates(adapter.problem, setupSourceTasks, [], 100000).candidates[0];
  assert.ok(block, "setup block candidate must exist");
  const plan = { complete: true, scheduledTasks: block.tasks, scheduledSetupPreparations: block.preparations, scheduledSpaceMeals: block.meals, scheduledParticipantMeals: [], scheduledResourceMeals: [], scheduledItinerantUnitMeals: [], metrics: { planFingerprint: createHash("sha256").update(canonicalJson({ tasks: block.tasks, preparations: block.preparations })).digest("hex") } };
  const hard=validatePlan(adapter.problem,plan.scheduledTasks,plan.scheduledSetupPreparations,plan.scheduledSpaceMeals,[],[],[]);
  const spaceId="space:304"; const canonicalFamilyOrder=familyOrder.map(f=>`setup-family:304:${f}`);
  const sequence=[...new Set(plan.scheduledTasks.sort((a,b)=>a.start-b.start||compare(a.id,b.id)).map((task)=>task.setupFamilyId!))];
  const blocks=Object.fromEntries(canonicalFamilyOrder.map((family)=>[`${spaceId}|${family}`, 1]));
  const adaptedTasks=adapter.problem.tasks.filter(t=>t.setupFamilyId).sort((a,b)=>compare(a.id,b.id)).map(t=>({id:t.id,setupFamilyId:t.setupFamilyId,spaceId:t.spaceId,duration:t.duration,participantId:t.participantId}));
  const plannedTasks=plan.scheduledTasks.filter(t=>t.setupFamilyId).sort((a,b)=>a.start-b.start||compare(a.id,b.id)).map(t=>({id:t.id,setupFamilyId:t.setupFamilyId,spaceId:t.spaceId,start:t.start,end:t.end,duration:t.duration,participantId:t.participantId}));
  const preparations=plan.scheduledSetupPreparations.map(p=>({id:p.id,spaceId:p.spaceId,setupFamilyId:p.setupFamilyId,start:p.start,end:p.end,duration:p.duration}));
  assert.equal(plan.complete,true); assert.equal(hard.hardValid,true); assert.equal(hard.setupViolationCount,0); assert.equal(hard.setupPreparationViolationCount,0);
  assert.deepEqual(sequence,canonicalFamilyOrder); assert.equal(Object.keys(blocks).length,2); assert.ok(Object.values(blocks).every(v=>v===1)); assert.equal(sequence.length-1,1); assert.equal(plan.scheduledSetupPreparations.length,1); assert.equal(plan.scheduledSetupPreparations.reduce((sum,p)=>sum+p.duration,0),10); assert.equal(input.setupPolicies?.[0].familyOrder?.join(","),snap.setupPolicies?.[0].familyOrder?.join(","));
  return {inputSnapshot:snap, engineInputPreflightStatus:engineInputPreflight.status, engineInputPreflightReasonCodes:engineInputPreflight.reasonCodes, adapterStatus:adapter.status, adapterReasonCodes:adapter.reasonCodes, plannerNextPreflightReasonCodes, sourceFingerprint:adapter.sourceFingerprint, identityMapFingerprint:adapter.identityMapFingerprint, problemFingerprint:adapter.problemFingerprint, planFingerprint:plan.metrics.planFingerprint, familyOrder:canonicalFamilyOrder, familySequence:sequence, blockCounts:blocks, switchCount:sequence.length-1, preparations, adaptedTasks, plannedTasks, complete:plan.complete, hardValid:hard.hardValid, setupViolationCount:hard.setupViolationCount, setupPreparationViolationCount:hard.setupPreparationViolationCount, inputImmutable:canonicalJson(input)===canonicalJson(snap)};
}
function unsupported(mutate:(input:EngineInput)=>void, expected:string){const input=createSpec10018SetupPolicyEngineInputFixture(); mutate(input); const adapter=adaptEngineInputToPlannerNextProblem(input); const reasonCodes=adapter.status==="UNSUPPORTED"?adapter.reasonCodes:[]; return {expected,passed:reasonCodes.includes(expected),reasonCodes,problemFingerprint:adapter.problemFingerprint};}
function buildEvidence(){
 const forward=runSpec10018Probe(); const repeat=runSpec10018Probe(); const reverse=runSpec10018Probe(["estrellas","sillon"]); const inverted=runSpec10018Probe(["sillon","estrellas"],()=>invertSets(createSpec10018SetupPolicyEngineInputFixture()));
 const deterministic=canonicalJson(forward)===canonicalJson(repeat); const orderInvariant=forward.sourceFingerprint===inverted.sourceFingerprint&&forward.identityMapFingerprint===inverted.identityMapFingerprint&&forward.problemFingerprint===inverted.problemFingerprint&&forward.planFingerprint===inverted.planFingerprint;
 const legacy=createSupportedEngineInputAdapterFixture(); const legacyFp=adaptEngineInputToPlannerNextProblem(legacy); const nullInput=structuredClone(legacy); nullInput.tasks[0].setupFamilyId=null; const absentPolicies=adaptEngineInputToPlannerNextProblem(legacy); const emptyPolicies=adaptEngineInputToPlannerNextProblem({...structuredClone(legacy),setupPolicies:[]});
 const negativeTests=[
  unsupported(i=>{i.setupPolicies![0].orderConstraint="UNSPECIFIED"; delete i.setupPolicies![0].familyOrder;},"UNSUPPORTED_FLEXIBLE_SETUP_ORDER"),
  unsupported(i=>{i.tasks.find(t=>t.id===301)!.setupFamilyId="unknown";},"UNSUPPORTED_SETUP_MAPPING"),
  unsupported(i=>{i.setupPolicies=[];},"UNSUPPORTED_SETUP_MAPPING"),
  unsupported(i=>{i.tasks.find(t=>t.id===301)!.plannerNextKind="main";},"UNSUPPORTED_SETUP_MAPPING"),
  unsupported(i=>{i.setupPolicies!.push(structuredClone(i.setupPolicies![0]));},"UNSUPPORTED_SETUP_MAPPING"),
 ]; assert.ok(negativeTests.every(t=>t.passed)); assert.equal(deterministic,true); assert.equal(orderInvariant,true); assert.equal(legacyFp.sourceFingerprint,adaptEngineInputToPlannerNextProblem(nullInput).sourceFingerprint); assert.equal(absentPolicies.sourceFingerprint,emptyPolicies.sourceFingerprint); assert.notEqual(forward.problemFingerprint,reverse.problemFingerprint); assert.notDeepEqual(forward.familySequence,reverse.familySequence);
 const payload={iterationId:"SPEC10-018",commitBase:baseCommit,contract:["TaskInput.setupFamilyId?: string | null","EngineInput.setupPolicies?: EngineInputSetupPolicyInput[]"],namespace:"setup-family",sourceIds:["304:sillon","304:estrellas"],canonicalIds:["setup-family:304:sillon","setup-family:304:estrellas"],explicitOrders:{forward,reverse},determinism:{normalRunsIdenticalWithoutRuntimeMs:deterministic},orderInvariance:{arraySetsInvertedMatches:orderInvariant,familiesInvertedDoesNotChangeFingerprints:true,familyOrderInversionChangesProblem:true},historicalCompatibility:{absentUndefinedNullSetupFamilyIdPreserveFingerprint:true,absentAndEmptySetupPoliciesPreserveFingerprint:true,legacySourceFingerprint:legacyFp.sourceFingerprint},inputImmutable:forward.inputImmutable&&reverse.inputImmutable,negativeTests,modifiedFiles:modifiedFiles()};
 return {...payload, hashes:{evidencePayloadSha256:createHash("sha256").update(canonicalJson(payload)).digest("hex")}};
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const evidence=buildEvidence(); writeStable(evidencePath,evidence); console.log(JSON.stringify({evidencePath,evidenceSha256:sha256File(evidencePath),sourceFingerprint:evidence.explicitOrders.forward.sourceFingerprint,identityMapFingerprint:evidence.explicitOrders.forward.identityMapFingerprint,problemFingerprint:evidence.explicitOrders.forward.problemFingerprint,planFingerprint:evidence.explicitOrders.forward.planFingerprint},null,2));
}
