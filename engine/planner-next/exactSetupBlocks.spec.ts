import assert from "node:assert/strict";
import test from "node:test";
import { createExactSearchLedger } from "./exactMainAndFeederCore";
import { createExactSetupBlockExplorer, generateExactSetupBlockCandidates } from "./exactSetupBlocks";
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

test("setup preparation occupies exactly the inter-family interval",()=>{
  const problem=setupGroupingScenario();const space=problem.spaces.find(s=>s.id==="setup-room")!;space.setupPolicy={familyOrder:["family-a","family-b"],reentry:"FORBIDDEN",flexibleFamilyOrder:true,preparationMinutesBetweenFamilies:10};
  const tasks=problem.tasks.filter(t=>t.setupFamilyId==="family-a"||t.setupFamilyId==="family-b").map(t=>({...t,duration:5}));
  const explorer=createExactSetupBlockExplorer(problem,tasks,[],[],[],createExactSearchLedger(10000));const candidate=explorer.nextCandidate()!;const ordered=candidate.tasks.slice().sort((a,b)=>a.start-b.start);const firstFamily=ordered[0]!.setupFamilyId;const lastFirst=Math.max(...ordered.filter(t=>t.setupFamilyId===firstFamily).map(t=>t.end));const firstSecond=Math.min(...ordered.filter(t=>t.setupFamilyId!==firstFamily).map(t=>t.start));
  assert.equal(candidate.preparations.length,1);assert.deepEqual([candidate.preparations[0]!.start,candidate.preparations[0]!.end],[lastFirst,firstSecond]);assert.equal(firstSecond-lastFirst,10);
});
