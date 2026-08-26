import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createTechnicalChainExplorer, getTechnicalChains, type TechnicalChainDeferredQueueMode, type TechnicalChainPlacementAuthorityMode } from "../technicalChains";
import { technicalChainScenario } from "../scenarios/technicalChainScenario";

const candidateLimit=100;
const run=(mode:TechnicalChainDeferredQueueMode,authority:TechnicalChainPlacementAuthorityMode="PREPARED_AUTHORITY")=>{
  const problem=technicalChainScenario();problem.searchPolicy="EXACT_CONSTRUCTIVE";problem.budget.bestK=1;
  problem.day={start:0,end:1_000};
  const chain=getTechnicalChains(problem.tasks)[0]!;for(const task of chain)task.duration=5;
  const resource=problem.resources.find(({id})=>id==="technical-chain-unit")!;
  resource.availability=[{start:0,end:1_000}];
  for(const space of problem.spaces.filter(({id})=>id.startsWith("technical-chain-room-")))space.availability=[{start:0,end:1_000}];
  const fixed={...chain[0]!,id:"fixed-placed",start:1_005,end:1_010,spaceId:"technical-chain-room-b",dependencies:[]};
  const explorer=createTechnicalChainExplorer(problem,chain,[fixed],100_000,"ANALYTIC_DOMAIN",[],mode,true,authority);
  const candidates:string[]=[];const started=performance.now();
  while(candidates.length<candidateLimit){const candidate=explorer.nextCandidate();if(!candidate)break;
    candidates.push(candidate.tasks.map(({start,end,spaceId})=>`${start}-${end}:${spaceId}`).join("|"));}
  return {runtimeMs:performance.now()-started,candidates,branches:explorer.consumed,diagnostics:explorer.diagnostics};
};

const globalSortOracle=run("GLOBAL_SORT_ORACLE"),incrementalHeap=run("INCREMENTAL_HEAP");
const canPlaceOracle=run("INCREMENTAL_HEAP","CAN_PLACE_ORACLE");
assert.equal(incrementalHeap.candidates.length,candidateLimit);
assert.deepEqual(incrementalHeap.candidates,globalSortOracle.candidates);
assert.equal(incrementalHeap.branches,globalSortOracle.branches);
assert.equal(incrementalHeap.diagnostics.deferredGlobalSorts,0);
assert.ok(globalSortOracle.diagnostics.deferredGlobalSorts>0);
assert.deepEqual(incrementalHeap.candidates,canPlaceOracle.candidates);
assert.equal(incrementalHeap.branches,canPlaceOracle.branches);
assert.equal(incrementalHeap.diagnostics.preparedAuthorityBuilds,2);
assert.equal(canPlaceOracle.diagnostics.preparedAuthorityBuilds,0);
assert.ok(incrementalHeap.diagnostics.fixedPlacedScansAvoided>0);
assert.ok(incrementalHeap.diagnostics.finalPlacementCheckMs<canPlaceOracle.diagnostics.finalPlacementCheckMs);
process.stdout.write(JSON.stringify({candidateLimit,globalSortOracle:{runtimeMs:globalSortOracle.runtimeMs,
  branches:globalSortOracle.branches,diagnostics:globalSortOracle.diagnostics},incrementalHeap:{runtimeMs:incrementalHeap.runtimeMs,
  branches:incrementalHeap.branches,diagnostics:incrementalHeap.diagnostics},canPlaceOracle:{runtimeMs:canPlaceOracle.runtimeMs,
  branches:canPlaceOracle.branches,diagnostics:canPlaceOracle.diagnostics},sameCandidateOrder:true,sameBranches:true,
  preparedAuthoritySameCandidateOrder:true,preparedAuthoritySameBranches:true},null,2)+"\n");
