import assert from "node:assert/strict";
import test from "node:test";
import type { PlannerNextProblem } from "./contracts";
import { createExactSearchLedger } from "./exactMainAndFeederCore";
import { exploreExactSetupBlockCandidates, probeExactSetupMacroDomain } from "./exactSetupBlocks";

const problem=(continuity:"REQUIRED"|"PREFERRED"|"OFF",secondStart=10):PlannerNextProblem=>({
  day:{start:0,end:40},spaces:[{id:"setup",availability:[{start:0,end:40}],secondaryContinuity:continuity,
    setupPolicy:{familyOrder:["family"],reentry:"FORBIDDEN"}}],resources:[],
  participants:[{id:"a",availability:[{start:0,end:40}]},{id:"b",availability:[{start:0,end:40}]}],coaches:[],
  tasks:[
    {id:"a",kind:"auxiliary",participantId:"a",spaceId:"setup",setupFamilyId:"family",duration:10,dependencies:[],availability:[{start:0,end:10}]},
    {id:"b",kind:"auxiliary",participantId:"b",spaceId:"setup",setupFamilyId:"family",duration:10,dependencies:[],availability:[{start:secondStart,end:secondStart+10}]},
  ],mainFlow:{spaceId:"main",preferredEnd:40,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
  participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:0,maxPatterns:1,maxBranchExpansions:1000},
});

const collect=(input:PlannerNextProblem)=>{const candidates:Array<number[]>=[];const result=exploreExactSetupBlockCandidates(input,input.tasks,[],[],[],createExactSearchLedger(1000),candidate=>{
  candidates.push(candidate.tasks.sort((a,b)=>a.start-b.start).map(t=>t.start));return "CONTINUE";});return {candidates,result};};

test("REQUIRED setup continuity rejects an unauthorized internal gap",()=>{
  const {candidates}=collect(problem("REQUIRED",20));assert.deepEqual(candidates,[]);
});

test("PREFERRED explores compact geometry before gapped geometry",()=>{
  const input=problem("PREFERRED",10);input.tasks.forEach(task=>task.availability=[{start:0,end:40}]);
  const {candidates}=collect(input);assert.deepEqual(candidates[0],[0,10]);
  assert.ok(candidates.some(starts=>starts[1]!-starts[0]!>10));
});

test("PREFERRED remains gap-complete when compact geometry is impossible",()=>{
  const input=problem("PREFERRED",20);const {candidates}=collect(input);assert.deepEqual(candidates[0],[0,20]);
  const probe=probeExactSetupMacroDomain(input,input.tasks,[],[],[]);assert.equal(probe.domainSize,0);assert.equal(probe.domainExact,false);
});

test("OFF does not turn compactness into a hard constraint",()=>{
  assert.deepEqual(collect(problem("OFF",20)).candidates[0],[0,20]);
});

test("gap exploration is deterministic under input order",()=>{
  const baseline=collect(problem("PREFERRED",20)).candidates;const inverted=problem("PREFERRED",20);inverted.tasks.reverse();
  assert.deepEqual(collect(inverted).candidates,baseline);
});
