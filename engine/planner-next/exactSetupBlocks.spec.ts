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
  problem.spaces.push({id:"shared-prerequisite-room",availability:[{start:540,end:580}]});
  for(const [index,task] of setup.entries()){
    const prerequisite={id:`shared-prerequisite:${index}`,kind:"auxiliary" as const,participantId:task.participantId,
      duration:15,spaceId:"shared-prerequisite-room",dependencies:[],availability:[{start:540,end:580}]};
    task.dependencies=[prerequisite.id];problem.tasks.push(prerequisite);
  }
  const authority=createPrerequisiteAwareSlotAuthority(problem,problem.tasks,[]);
  assert.equal(authority.geometryFeasible!([
    {task:setup[0]!,start:570},{task:setup[1]!,start:570},
  ]),"NOT_PROVEN_IMPOSSIBLE");
  const explorer=createExactSetupBlockExplorer(problem,setup,[],[],[],createExactSearchLedger(10_000),
    {prerequisiteAwareSlot:authority});
  const candidate=explorer.nextCandidate()!;
  assert.equal(Math.min(...candidate.tasks.map(task=>task.start)),565);
  assert.ok(explorer.evidence.geometryPrerequisiteEnvelopeChecks>0);
  assert.ok(explorer.evidence.geometryPrerequisiteEnvelopePrunes>0);
  assert.ok(explorer.evidence.logicalMatchingCandidatesAvoidedByEnvelope>0);
  assert.equal(explorer.evidence.firstFeedableCompactStart,565);
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

function injectiveFixture(setupCount:number,arrivalWindow:{start:number;end:number},prerequisiteDurations?:number[]){
  const problem=oneFamily();problem.day={start:540,end:700};problem.protectedMeal=undefined;
  const setupSpace=problem.spaces[0]!;setupSpace.availability=[problem.day];
  const prerequisiteSpace={id:"prerequisite-room",availability:[problem.day]};
  const arrivalSpace={id:"arrival-room",availability:[problem.day]};
  const participantIds=Array.from({length:setupCount+1},(_,index)=>`injective-participant:${index}`);
  problem.participants=participantIds.map(id=>({id,availability:[problem.day]}));
  const arrivals=participantIds.map((participantId,index)=>({id:`injective-arrival:${index}`,kind:"auxiliary" as const,
    participantId,duration:5,spaceId:arrivalSpace.id,dependencies:[],availability:[arrivalWindow]}));
  const prerequisites=participantIds.slice(0,setupCount).map((participantId,index)=>({id:`injective-prerequisite:${index}`,
    kind:"auxiliary" as const,participantId,duration:prerequisiteDurations?.[index]??10,spaceId:prerequisiteSpace.id,
    dependencies:[arrivals[index]!.id]}));
  const setup=participantIds.slice(0,setupCount).map((participantId,index)=>({id:`injective-setup:${index}`,
    kind:"auxiliary" as const,participantId,duration:5,spaceId:setupSpace.id,setupFamilyId:"family-a",
    dependencies:[prerequisites[index]!.id]}));
  problem.tasks=[...arrivals,...prerequisites,...setup];problem.spaces=[setupSpace,prerequisiteSpace,arrivalSpace];
  problem.transportPolicy={arrival:{taskIds:arrivals.map(({id})=>id),minimumGroupSize:1,maximumGroupSize:1,
    targetGroupSize:1,minGapMinutes:5,groupingWeight:0},departure:{taskIds:[],minimumGroupSize:1,maximumGroupSize:1,
    targetGroupSize:1,minGapMinutes:0,groupingWeight:0}};
  return {problem,setup,pending:problem.tasks,forcedParticipantId:participantIds.at(-1)!};
}

const injectiveEdges=(tasks:ReturnType<typeof injectiveFixture>["setup"],starts:number[])=>tasks.flatMap(task=>starts.map((start,index)=>({task,slotId:`slot:${index}`,start})));

test("injective arrival envelope finds an obligation hidden by individually safe latest slots",()=>{
  const fixture=injectiveFixture(2,{start:540,end:545});
  const placed=[{...fixture.setup[0]!,id:"already-forced",participantId:fixture.forcedParticipantId,start:550,end:555}];
  const authority=createPrerequisiteAwareSlotAuthority(fixture.problem,fixture.pending,placed);
  const result=authority.arrivalInjectiveFeasible!(injectiveEdges(fixture.setup,[570,575]));
  assert.equal(result.verdict,"PROVEN_IMPOSSIBLE");
  assert.deepEqual(result.firstCertificate,{cutoff:540,minimumDemand:1,maximumPossible:0});
  assert.equal(result.maxMatchingChecks,1);assert.equal(result.edgeDeadlineChecks,4);
});

test("injective 13-over-12 certificate prunes without enumerating perfect matchings",()=>{
  const fixture=injectiveFixture(15,{start:570,end:645});
  const placed=[{...fixture.setup[0]!,id:"deadline-anchor",participantId:fixture.forcedParticipantId,spaceId:"forced-space",start:640,end:645}];
  const authority=createPrerequisiteAwareSlotAuthority(fixture.problem,fixture.pending,placed);
  const result=authority.arrivalInjectiveFeasible!(injectiveEdges(fixture.setup,[670,675]));
  assert.equal(result.verdict,"PROVEN_IMPOSSIBLE");
  assert.deepEqual(result.firstCertificate,{cutoff:630,minimumDemand:13,maximumPossible:12});
  assert.equal(result.edgeDeadlineChecks,30);
});

test("injective arrival envelope keeps sufficient SAFE alternatives and abstains on incomplete identity",()=>{
  const safe=injectiveFixture(2,{start:540,end:650},[10,5]);
  assert.equal(createPrerequisiteAwareSlotAuthority(safe.problem,safe.pending,[])
    .arrivalInjectiveFeasible!(injectiveEdges(safe.setup,[570,575])).verdict,"NOT_PROVEN_IMPOSSIBLE");
  const incomplete=injectiveFixture(2,{start:540,end:545});delete incomplete.setup[0]!.participantId;
  const abstained=createPrerequisiteAwareSlotAuthority(incomplete.problem,incomplete.pending,[])
    .arrivalInjectiveFeasible!(injectiveEdges(incomplete.setup,[570,575]));
  assert.equal(abstained.checked,false);assert.equal(abstained.verdict,"NOT_PROVEN_IMPOSSIBLE");
});

test("forced participants are not counted twice and injective evidence is input-order invariant",()=>{
  const fixture=injectiveFixture(1,{start:540,end:545});
  const placed=[{...fixture.setup[0]!,id:"forced-work",start:550,end:555}];
  const authority=createPrerequisiteAwareSlotAuthority(fixture.problem,fixture.pending,placed);
  const edges=injectiveEdges(fixture.setup,[570,575]);
  const forward=authority.arrivalInjectiveFeasible!(edges);
  const reverse=authority.arrivalInjectiveFeasible!([...edges].reverse());
  assert.equal(forward.verdict,"NOT_PROVEN_IMPOSSIBLE");assert.deepEqual(reverse,forward);
});

test("injective certificate rejects a geometry before exact matching enumeration",()=>{
  const problem=oneFamily();
  const authority=((_task:typeof problem.tasks[number],_start:number)=>"NOT_PROVEN_IMPOSSIBLE" as const)
    as ReturnType<typeof createPrerequisiteAwareSlotAuthority>;
  authority.arrivalInjectiveFeasible=(edges)=>({verdict:"PROVEN_IMPOSSIBLE",checked:true,
    edgeDeadlineChecks:edges.length,maxMatchingChecks:1,
    firstCertificate:{cutoff:550,minimumDemand:2,maximumPossible:1}});
  const explorer=createExactSetupBlockExplorer(problem,problem.tasks,[],[],[],createExactSearchLedger(1000),
    {compactOnly:true,canonicalOnly:true,prerequisiteAwareSlot:authority});
  assert.equal(explorer.nextCandidate(),null);
  assert.ok(explorer.evidence.arrivalInjectiveEnvelopePrunes>0);
  assert.equal(explorer.evidence.matchingSearchSteps,0);
  assert.deepEqual(explorer.evidence.firstArrivalInjectiveCertificate,
    {cutoff:550,minimumDemand:2,maximumPossible:1});
});
