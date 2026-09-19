import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCanonicalFullA2EngineInput } from "./benchmarks/canonicalFullA2EngineInput";
import { adaptEngineInputToPlannerNextProblem } from "./integration/engineInputAdapter";
import { buildAssistedProblem } from "./assistedPlanning";
import { resolveAssistedScope } from "../../server/assistedScopeResolver";
import { buildAnonymousPipelineWitness } from "./anonymousPipelineWitness";
import { generateMainFlowPatterns, proveMainFeederArchitectureImpossible, type MainFeederArchitecture } from "./mainFlowPatterns";
import type { PlannerNextProblem } from "./contracts";

function fixture(): {problem:PlannerNextProblem; architecture:MainFeederArchitecture} {
  const canonical=buildCanonicalFullA2EngineInput({planId:711,branchBudget:10_000});
  const adapted=adaptEngineInputToPlannerNextProblem(canonical.input); assert.equal(adapted.status,"SUPPORTED");
  if(adapted.status!=="SUPPORTED")throw new Error();
  const spaceId=canonical.input.plannerNext!.mainFlow!.spaceId;
  const scope=resolveAssistedScope(canonical.input,adapted,{kind:"SPACE",spaceId}).scope;
  const problem=buildAssistedProblem(adapted.problem,scope,[]).problem;
  const mains=problem.tasks.filter(t=>t.kind==="main");
  const patterns=generateMainFlowPatterns(mains,problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey,problem.budget.maxPatterns,problem.resources).patterns;
  const feeders=new Map(mains.map(main=>[main.id,problem.tasks.find(t=>t.kind==="vocal"&&t.participantId===main.participantId)!]));
  const ends=[...new Set(problem.participants.flatMap(x=>x.availability.map(w=>w.end)))].sort((a,b)=>a-b);
  for(const pattern of patterns)for(const end of ends){
    const slots=pattern.map((_,i)=>end-pattern.length*mains[0]!.duration+i*mains[0]!.duration);
    if(!proveMainFeederArchitectureImpossible(problem,mains,feeders,{pattern,slots})){
      const witness=buildAnonymousPipelineWitness(problem,{pattern,slots});
      if(witness.status==="FEASIBLE")return {problem,architecture:{pattern,slots}};
    }
  }
  throw new Error("A2 fixture must expose a feasible architecture");
}

describe("anonymous structural pipeline witness",()=>{
  it("rejects an early jointly impossible geometry and accepts a sufficient shift",()=>{
    const {problem,architecture}=fixture();
    // Each layer has standalone aggregate capacity at this boundary (19 Styling slots,
    // two parallel coach prefixes, and seven legal IN packets), but their deadlines do
    // not admit one simultaneous token realization.
    const early={...architecture,slots:architecture.slots.map(x=>x-145)};
    assert.ok(19*10<=problem.day.end-problem.day.start);
    assert.ok(10*15<=early.slots[0]!-problem.day.start);
    assert.ok(Math.ceil(19/problem.transportPolicy!.arrival.maximumGroupSize)>=1);
    assert.equal(buildAnonymousPipelineWitness(problem,early).status,"INFEASIBLE");
    const shifted={...architecture,slots:architecture.slots.map(x=>x-140)};
    assert.equal(buildAnonymousPipelineWitness(problem,shifted).status,"FEASIBLE");
  });

  it("realizes both permitted Styling/Vocal orders without overlap on the exclusive Styling space",()=>{
    const {problem,architecture}=fixture(); const witness=buildAnonymousPipelineWitness(problem,architecture);
    assert.equal(witness.status,"FEASIBLE");
    const byToken=(spots:typeof witness.stylingSpots)=>new Map(spots.map(x=>[x.tokenId,x]));
    const styling=byToken(witness.stylingSpots), feeder=byToken(witness.feederSpots);
    assert.ok(witness.assignments.some(x=>styling.get(x.tokenId)!.end<=feeder.get(x.tokenId)!.start));
    assert.ok(witness.assignments.some(x=>feeder.get(x.tokenId)!.end<=styling.get(x.tokenId)!.start));
    const ordered=[...witness.stylingSpots].sort((a,b)=>a.start-b.start);
    assert.ok(ordered.slice(1).every((spot,i)=>ordered[i]!.end<=spot.start));
  });

  it("uses every anonymous token once, respects coach compatibility, and ignores target as a hard size",()=>{
    const {problem,architecture}=fixture(); const witness=buildAnonymousPipelineWitness(problem,architecture);
    assert.equal(witness.status,"FEASIBLE");
    assert.equal(new Set(witness.assignments.map(x=>x.tokenId)).size,witness.tokenCount);
    assert.equal(witness.assignments.length,witness.tokenCount);
    for(const assignment of witness.assignments){
      const main=witness.mainSpots.find(x=>x.id===assignment.mainSpotId)!;
      const feeder=witness.feederSpots.find(x=>x.id===assignment.feederSpotId)!;
      assert.equal(main.coachKey,feeder.coachKey);
    }
    const changed={...problem,transportPolicy:{...problem.transportPolicy!,arrival:{...problem.transportPolicy!.arrival,targetGroupSize:1}}};
    assert.equal(buildAnonymousPipelineWitness(changed,architecture).status,"FEASIBLE");
  });

  it("is deterministic, nominal-order invariant, and input immutable",()=>{
    const {problem,architecture}=fixture(); const before=JSON.stringify(problem);
    const first=buildAnonymousPipelineWitness(problem,architecture);
    const second=buildAnonymousPipelineWitness({...problem,tasks:[...problem.tasks].reverse()} as PlannerNextProblem,architecture);
    assert.equal(first.fingerprint,second.fingerprint);
    assert.equal(JSON.stringify(problem),before);
    assert.ok(first.assignments.every(x=>!x.tokenId.includes("participant:")));
  });
});
