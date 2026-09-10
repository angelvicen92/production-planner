import assert from "node:assert/strict";
import test from "node:test";
import { createExactSearchLedger } from "./exactMainAndFeederCore";
import { createExactSetupBlockExplorer, generateExactSetupBlockCandidates, probeExactSetupMacroDomain } from "./exactSetupBlocks";
import { setupBlockCounts, hasSetupReentry } from "./setupGrouping";
import { setupGroupingScenario } from "./scenarios/setupGroupingScenario";
import { validatePlan } from "./validate";
import { createPrerequisiteAwareSlotAuthority } from "./prerequisiteAwareSlotFeasibility";

function oneFamily(windows?: Record<string,{start:number;end:number}[]>){
  const problem=setupGroupingScenario(); problem.day={start:540,end:570}; problem.protectedMeal=undefined;
  const space=problem.spaces.find(s=>s.id==="setup-room")!;space.availability=[problem.day];space.setupPolicy={familyOrder:["family-a"],reentry:"FORBIDDEN"};
  problem.tasks=problem.tasks.filter(t=>t.setupFamilyId==="family-a").map(t=>({...t,duration:5}));
  problem.participants=problem.participants.filter(p=>problem.tasks.some(t=>t.participantId===p.id)).map(p=>({...p,availability:windows?.[p.id]??[problem.day]}));
  problem.coaches=[];problem.spaces=[space];problem.mainFlow={...problem.mainFlow,spaceId:"unused"};
  return problem;
}
const sig=(tasks:{id:string;start:number}[])=>tasks.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(t=>`${t.id}@${t.start}`).join("|");

test("exact setup keeps compact first, then admits the only one-idle solution with exact accounting",()=>{
  const compact=oneFamily();const compactResult=generateExactSetupBlockCandidates(compact,compact.tasks,[],[],[],createExactSearchLedger(1000));
  assert.equal(compactResult.outcome,"COMPLETE");assert.equal(compactResult.evidence.minimumIdleMinutes,0);assert.equal(compactResult.candidates[0]!.tasks[1]!.start-compactResult.candidates[0]!.tasks[0]!.end,0);
  const gapped=oneFamily({"participant-e":[{start:540,end:545}],"participant-f":[{start:550,end:555}]});
  const probe=probeExactSetupMacroDomain(gapped,gapped.tasks,[],[],[]);
  assert.equal(probe.domainSize,0);assert.equal(probe.domainExact,false);
  const ledger=createExactSearchLedger(1000);const generated=generateExactSetupBlockCandidates(gapped,gapped.tasks,[],[],[],ledger);
  assert.ok(generated.candidates.length>0);assert.equal(generated.evidence.minimumIdleMinutes,5);assert.equal(generated.evidence.branchesExplored,ledger.standaloneBranches);
  assert.equal(setupBlockCounts(generated.candidates[0]!.tasks)["family-a"],1);assert.equal(hasSetupReentry(generated.candidates[0]!.tasks),false);
  for(const candidate of generated.candidates)assert.equal(validatePlan(gapped,candidate.tasks,candidate.preparations).hardValid,true);
});

test("lazy setup matching repairs a canonical witness and is input-order deterministic",()=>{
  const problem=oneFamily();
  const collect=(reverse=false)=>{const explorer=createExactSetupBlockExplorer(problem,reverse?[...problem.tasks].reverse():problem.tasks,[],[],[],createExactSearchLedger(1000));const first=explorer.nextCandidate()!;let repaired=explorer.nextCandidate();while(repaired&&explorer.evidence.matchingRepairs===0)repaired=explorer.nextCandidate();assert.ok(repaired);return{seen:[sig(first.tasks),sig(repaired.tasks)],repairs:explorer.evidence.matchingRepairs};};
  const baseline=collect();const reversed=collect(true);assert.notEqual(baseline.seen[0],baseline.seen[1]);assert.ok(baseline.repairs>0);assert.deepEqual(reversed,baseline);
});

test("downstream dead end repairs the same compact geometry before any gapped geometry",()=>{
  const problem=oneFamily();
  const explorer=createExactSetupBlockExplorer(problem,problem.tasks,[],[],[],createExactSearchLedger(1000));
  const canonical=explorer.nextCandidate()!;
  assert.equal(canonical.geometryIdleMinutes,0);
  assert.equal(canonical.matchingRepairIndex,0);
  explorer.recordCandidateOutcome(false); // Fixture's canonical assignment is rejected by its downstream child.
  const repaired=explorer.nextCandidate()!;
  assert.equal(repaired.geometryIdleMinutes,0);
  assert.equal(repaired.geometrySpanMinutes,canonical.geometrySpanMinutes);
  assert.equal(repaired.matchingRepairIndex,1);
  assert.notEqual(sig(repaired.tasks),sig(canonical.tasks));
  assert.equal(explorer.evidence.maximumIdleMinutes,0);
  assert.equal(explorer.evidence.compactGeometryMatchingRepairs,1);
  explorer.recordCandidateOutcome(true);
  assert.deepEqual(explorer.evidence.firstSuccessfulGeometry,{idleMinutes:0,spanMinutes:10});
  assert.equal(explorer.evidence.firstSuccessfulMatchingRepairIndex,1);
  assert.equal(validatePlan(problem,repaired.tasks,repaired.preparations).hardValid,true);
});

test("setup preparation occupies exactly the inter-family interval",()=>{
  const problem=setupGroupingScenario();const space=problem.spaces.find(s=>s.id==="setup-room")!;space.setupPolicy={familyOrder:["family-a","family-b"],reentry:"FORBIDDEN",flexibleFamilyOrder:true,preparationMinutesBetweenFamilies:10};
  const tasks=problem.tasks.filter(t=>t.setupFamilyId==="family-a"||t.setupFamilyId==="family-b").map(t=>({...t,duration:5}));
  const explorer=createExactSetupBlockExplorer(problem,tasks,[],[],[],createExactSearchLedger(10000));const candidate=explorer.nextCandidate()!;const ordered=candidate.tasks.slice().sort((a,b)=>a.start-b.start);const firstFamily=ordered[0]!.setupFamilyId;const lastFirst=Math.max(...ordered.filter(t=>t.setupFamilyId===firstFamily).map(t=>t.end));const firstSecond=Math.min(...ordered.filter(t=>t.setupFamilyId!==firstFamily).map(t=>t.start));
  assert.equal(candidate.preparations.length,1);assert.deepEqual([candidate.preparations[0]!.start,candidate.preparations[0]!.end],[lastFirst,firstSecond]);assert.equal(firstSecond-lastFirst,10);
});

function withPendingChains(readiness:number[]){
  const problem=oneFamily();
  const setup=[...problem.tasks].sort((a,b)=>a.id.localeCompare(b.id));
  setup.forEach((task,index)=>{const spaceId=`prerequisite-room:${index}`;problem.spaces.push({id:spaceId,availability:[problem.day]});
    const prerequisite={id:`prerequisite:${index}`,kind:"auxiliary" as const,participantId:task.participantId,duration:readiness[index]!-problem.day.start,spaceId,dependencies:[]};
    task.dependencies=[prerequisite.id];problem.tasks.push(prerequisite);});
  return{problem,setup,pending:problem.tasks};
}

test("prerequisite-aware setup matching starts at the first feedable compact geometry",()=>{
  const {problem,setup,pending}=withPendingChains([550,560]);
  const explorer=createExactSetupBlockExplorer(problem,setup,[],[],[],createExactSearchLedger(1000),
    {prerequisiteAwareSlot:createPrerequisiteAwareSlotAuthority(problem,pending,[])});
  const candidate=explorer.nextCandidate()!;
  assert.equal(Math.min(...candidate.tasks.map(task=>task.start)),560);
  assert.ok(explorer.evidence.prerequisiteAwareGeometriesEliminated>0);
  assert.equal(explorer.evidence.firstPrerequisiteAwareCompactStart,560);
  assert.equal(explorer.evidence.matchingRepairs,0);
});

test("joint setup matching prunes individually viable assignments that saturate a shared prerequisite authority",()=>{
  const problem=oneFamily();problem.day.end=580;
  for(const space of problem.spaces)space.availability=[{...problem.day}];
  for(const participant of problem.participants)participant.availability=[{...problem.day}];
  const setup=[...problem.tasks].sort((a,b)=>a.id.localeCompare(b.id));
  problem.spaces.push({id:"shared-prerequisite-room",availability:[{start:540,end:560}]});
  for(const [index,task] of setup.entries()){
    const prerequisite={id:`shared-prerequisite:${index}`,kind:"auxiliary" as const,participantId:task.participantId,
      duration:10,spaceId:"shared-prerequisite-room",dependencies:[],availability:[{start:540,end:560}]};
    task.dependencies=[prerequisite.id];problem.tasks.push(prerequisite);
  }
  const authority=createPrerequisiteAwareSlotAuthority(problem,problem.tasks,[]);
  assert.equal(authority(setup[0]!,555),"NOT_PROVEN_IMPOSSIBLE");
  assert.equal(authority(setup[1]!,560),"NOT_PROVEN_IMPOSSIBLE");
  const explorer=createExactSetupBlockExplorer(problem,setup,[],[],[],createExactSearchLedger(10_000),
    {prerequisiteAwareSlot:authority});
  const candidate=explorer.nextCandidate()!;
  assert.equal(Math.min(...candidate.tasks.map(task=>task.start)),560);
  assert.ok(explorer.evidence.jointPrerequisiteChecks>0);
  assert.ok(explorer.evidence.jointPrerequisitePrunes>0);
  assert.ok(explorer.evidence.matchingBranchesAvoidedByJointPrerequisites>0);
  assert.equal(explorer.evidence.firstJointlyFeedableCompactStart,560);
});

test("placed participant work shifts prerequisite-aware setup geometry deterministically",()=>{
  const collect=(reverse:boolean)=>{const {problem,setup,pending}=withPendingChains([550,560]);
    problem.day.end=580;for(const space of problem.spaces)space.availability=[{...problem.day}];
    for(const participant of problem.participants)participant.availability=[{...problem.day}];
    const blocker={...setup[0]!,id:"placed:blocker",start:555,end:565,duration:10,setupFamilyId:undefined,dependencies:[]};
    const ordered=reverse?[...setup].reverse():setup;
    const explorer=createExactSetupBlockExplorer({...problem,tasks:reverse?[...problem.tasks].reverse():problem.tasks},ordered,[blocker],[],[],createExactSearchLedger(1000),
      {prerequisiteAwareSlot:createPrerequisiteAwareSlotAuthority(problem,pending,[blocker])});
    return{start:Math.min(...explorer.nextCandidate()!.tasks.map(task=>task.start)),evidence:explorer.evidence};};
  const forward=collect(false),reverse=collect(true);
  assert.equal(forward.start,565);assert.deepEqual(reverse,forward);
});

test("an inconclusive prerequisite authority preserves compact and minimum-gap alternatives",()=>{
  const compact=oneFamily();
  const first=createExactSetupBlockExplorer(compact,compact.tasks,[],[],[],createExactSearchLedger(1000),
    {prerequisiteAwareSlot:()=>"NOT_PROVEN_IMPOSSIBLE"}).nextCandidate()!;
  assert.equal(first.geometryIdleMinutes,0);
  const gapped=oneFamily({"participant-e":[{start:540,end:545}],"participant-f":[{start:550,end:555}]});
  const only=createExactSetupBlockExplorer(gapped,gapped.tasks,[],[],[],createExactSearchLedger(1000),
    {prerequisiteAwareSlot:()=>"NOT_PROVEN_IMPOSSIBLE"}).nextCandidate()!;
  assert.equal(only.geometryIdleMinutes,5);
});
