import assert from "node:assert/strict";
import test from "node:test";
import { createExactSearchLedger } from "./exactMainAndFeederCore";
import { createExactSetupBlockExplorer, generateExactSetupBlockCandidates, probeExactSetupMacroDomain } from "./exactSetupBlocks";
import { setupBlockCounts, hasSetupReentry } from "./setupGrouping";
import { setupGroupingScenario } from "./scenarios/setupGroupingScenario";
import { validatePlan } from "./validate";

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

test("a later compact canonical matching is visited before repairing the first start",()=>{
  const problem=oneFamily();
  const explorer=createExactSetupBlockExplorer(problem,problem.tasks,[],[],[],createExactSearchLedger(1000));
  const canonical=explorer.nextCandidate()!;
  assert.equal(canonical.geometryIdleMinutes,0);
  assert.equal(canonical.matchingRepairIndex,0);
  explorer.recordCandidateOutcome(false); // Fixture's canonical assignment is rejected by its downstream child.
  const laterCanonical=explorer.nextCandidate()!;
  assert.equal(laterCanonical.geometryIdleMinutes,0);
  assert.equal(laterCanonical.matchingRepairIndex,0);
  assert.ok(Math.min(...laterCanonical.tasks.map(task=>task.start))>Math.min(...canonical.tasks.map(task=>task.start)));
  assert.equal(explorer.evidence.maximumIdleMinutes,0);
  assert.equal(explorer.evidence.compactGeometryMatchingRepairs,0);
  explorer.recordCandidateOutcome(true);
  assert.deepEqual(explorer.evidence.firstSuccessfulGeometry,{idleMinutes:0,spanMinutes:10});
  assert.equal(explorer.evidence.firstSuccessfulMatchingRepairIndex,0);
  assert.equal(validatePlan(problem,laterCanonical.tasks,laterCanonical.preparations).hardValid,true);
});

test("wide budget preserves every setup candidate, repair reachability, ledger accounting, and input order",()=>{
  const problem=oneFamily();
  const collect=(tasks=problem.tasks)=>{const ledger=createExactSearchLedger(1000);const generated=generateExactSetupBlockCandidates(problem,tasks,[],[],[],ledger);return{generated,ledger,signatures:generated.candidates.map(candidate=>sig(candidate.tasks)).sort()};};
  const baseline=collect();const reversed=collect([...problem.tasks].reverse());
  const [firstId,secondId]=problem.tasks.map(task=>task.id).sort();
  const expected:string[]=[];
  for(let left=540;left<570;left+=5)for(let right=left+5;right<570;right+=5){
    expected.push(`${firstId}@${left}|${secondId}@${right}`,`${firstId}@${right}|${secondId}@${left}`);
  }
  assert.equal(baseline.generated.outcome,"COMPLETE");
  assert.deepEqual(baseline.signatures,expected.sort());
  assert.deepEqual(reversed.signatures,baseline.signatures);
  assert.ok(baseline.generated.evidence.matchingRepairs>0);
  assert.equal(baseline.generated.evidence.branchesExplored,baseline.ledger.standaloneBranches);
  assert.equal(baseline.ledger.branchesExplored,baseline.ledger.standaloneBranches);
});

test("setup preparation occupies exactly the inter-family interval",()=>{
  const problem=setupGroupingScenario();const space=problem.spaces.find(s=>s.id==="setup-room")!;space.setupPolicy={familyOrder:["family-a","family-b"],reentry:"FORBIDDEN",flexibleFamilyOrder:true,preparationMinutesBetweenFamilies:10};
  const tasks=problem.tasks.filter(t=>t.setupFamilyId==="family-a"||t.setupFamilyId==="family-b").map(t=>({...t,duration:5}));
  const explorer=createExactSetupBlockExplorer(problem,tasks,[],[],[],createExactSearchLedger(10000));const candidate=explorer.nextCandidate()!;const ordered=candidate.tasks.slice().sort((a,b)=>a.start-b.start);const firstFamily=ordered[0]!.setupFamilyId;const lastFirst=Math.max(...ordered.filter(t=>t.setupFamilyId===firstFamily).map(t=>t.end));const firstSecond=Math.min(...ordered.filter(t=>t.setupFamilyId!==firstFamily).map(t=>t.start));
  assert.equal(candidate.preparations.length,1);assert.deepEqual([candidate.preparations[0]!.start,candidate.preparations[0]!.end],[lastFirst,firstSecond]);assert.equal(firstSecond-lastFirst,10);
});
