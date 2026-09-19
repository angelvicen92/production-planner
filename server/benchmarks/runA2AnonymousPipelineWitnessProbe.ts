import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildCanonicalFullA2EngineInput } from "../../engine/planner-next/benchmarks/canonicalFullA2EngineInput";
import { buildAssistedProblem } from "../../engine/planner-next/assistedPlanning";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";
import { generateMainFlowPatterns, proveMainFeederArchitectureImpossible } from "../../engine/planner-next/mainFlowPatterns";
import { buildAnonymousPipelineWitness } from "../../engine/planner-next/anonymousPipelineWitness";
import { buildTimeline, candidateCuts, hasMainFlowMeal, orderTimelines } from "../../engine/planner-next/mainFlowMeal";
import { resolveAssistedScope } from "../assistedScopeResolver";

/** A2 S1 structural probe. It deliberately stops before nominal core or standalone search. */
export function runA2AnonymousPipelineWitnessProbe() {
  const canonical=buildCanonicalFullA2EngineInput({planId:711,branchBudget:10_000});
  const adapted=adaptEngineInputToPlannerNextProblem(canonical.input); assert.equal(adapted.status,"SUPPORTED");
  if(adapted.status!=="SUPPORTED")throw new Error("canonical A2 adapter unsupported");
  const spaceId=canonical.input.plannerNext?.mainFlow?.spaceId; assert.ok(spaceId);
  const scope=resolveAssistedScope(canonical.input,adapted,{kind:"SPACE",spaceId}).scope;
  const problem=buildAssistedProblem(adapted.problem,scope,[]).problem;
  const before=JSON.stringify(problem); const mains=problem.tasks.filter(t=>t.kind==="main");
  const feeders=new Map(mains.flatMap(main=>{
    const feeder=problem.tasks.find(t=>t.kind==="vocal"&&t.participantId===main.participantId);
    return feeder?[[main.id,feeder] as const]:[];
  }));
  const generated=generateMainFlowPatterns(mains,problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey,problem.budget.maxPatterns,problem.resources);
  assert.equal(generated.exhausted,false);
  const runCount=(pattern:readonly string[])=>pattern.reduce((n,k,i)=>n+(i===0||pattern[i-1]!==k?1:0),0);
  const families=[]; let firstFeasible: ReturnType<typeof buildAnonymousPipelineWitness>|null=null;
  const started=performance.now();
  for(const count of [...new Set(generated.patterns.map(runCount))].sort((a,b)=>a-b)){
    let tried=0, firstReason:string|undefined, feasibleArchitecture:{pattern:string[];slots:number[]}|undefined;
    let familyStatus:"FEASIBLE"|"INFEASIBLE"|"INCONCLUSIVE"="INFEASIBLE";
    for(const pattern of generated.patterns.filter(p=>runCount(p)===count)){
      const duration=mains[0]!.duration;
      const architectures=hasMainFlowMeal(problem)
        ? orderTimelines(candidateCuts(pattern).map(cut=>buildTimeline(problem,pattern,duration,cut))).map(x=>x.slots)
        // These are contract boundaries, not a minute/grid scan.
        : [...new Set([problem.mainFlow.preferredEnd,problem.day.end,
            ...problem.participants.flatMap(x=>x.availability.map(w=>w.end)),
            ...problem.spaces.flatMap(x=>x.availability.map(w=>w.end)),
            ...problem.resources.flatMap(x=>x.availability.map(w=>w.end)),
            ...(problem.itinerantUnits??[]).flatMap(x=>x.availability.map(w=>w.end)),
            ...(problem.anchoredAccompaniments??[]).flatMap(contract=>[contract.anchorTaskId,...contract.beforeTaskIds,...contract.afterTaskIds]
              .flatMap(id=>problem.tasks.find(task=>task.id===id)?.availability?.map(w=>w.end)??[]))])]
          .filter(end=>problem.day.start<end&&end<=problem.day.end).sort((a,b)=>a-b)
          .map(end=>pattern.map((_,i)=>end-pattern.length*duration+i*duration));
      for(const slots of architectures){
        tried++;
        const structural=proveMainFeederArchitectureImpossible(problem,mains,feeders,{pattern,slots});
        if(structural){firstReason??=structural;continue;}
        const witness=buildAnonymousPipelineWitness(problem,{pattern,slots}); firstReason??=witness.reason;
        if(witness.status==="INCONCLUSIVE")familyStatus="INCONCLUSIVE";
        if(witness.status==="FEASIBLE"){
          familyStatus="FEASIBLE"; feasibleArchitecture={pattern:[...pattern],slots}; firstFeasible??=witness; break;
        }
      }
      if(feasibleArchitecture)break;
    }
    families.push({runCount:count,architecturesTried:tried,witness:familyStatus,
      firstRejectionReason:firstReason??null,firstFeasibleArchitecture:feasibleArchitecture??null});
  }
  const pipelineWitnessBuildMs=Number((performance.now()-started).toFixed(3));
  assert.equal(JSON.stringify(problem),before); assert.ok(pipelineWitnessBuildMs<10_000);
  return {families,firstFeasibleRunCount:firstFeasible?.runCount??null,
    firstFeasible:firstFeasible?{mainSpotCount:firstFeasible.mainSpots.length,
      feederSpotCount:firstFeasible.feederSpots.length,stylingSpotCount:firstFeasible.stylingSpots.length,
      mainRunCount:new Set(firstFeasible.mainSpots.map(spot=>spot.mainRunId)).size,
      feederRunCount:new Set(firstFeasible.feederSpots.map(spot=>spot.feederRunId)).size,
      inGroupCount:firstFeasible.inGroups.length,inPacketSizes:firstFeasible.inGroups.map(g=>g.size),
      inStarts:firstFeasible.inGroups.map(g=>g.start),tokenCount:firstFeasible.tokenCount,
      anchoredOperationCount:firstFeasible.anchoredOperationSpots.length,
      anchoredOperationSpots:firstFeasible.anchoredOperationSpots,
      profileCount:firstFeasible.profileCount,fingerprint:firstFeasible.fingerprint}:null,
    pipelineWitnessBuildMs,inputImmutable:JSON.stringify(problem)===before};
}

if(import.meta.url===`file://${process.argv[1]}`)
  process.stdout.write(`${JSON.stringify(runA2AnonymousPipelineWitnessProbe(),null,2)}\n`);
