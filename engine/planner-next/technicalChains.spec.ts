import assert from "node:assert/strict";
import test from "node:test";
import { preflight } from "./validate";
import { createTechnicalChainExplorer, generateTechnicalChainCandidates, getTechnicalChains, orderedTechnicalChainMembers, technicalChainHasBranching, technicalChainHasCycle } from "./technicalChains";
import { technicalChainScenario } from "./scenarios/technicalChainScenario";

test("derives a linear chain exclusively from dependencies regardless of physical order",()=>{const p=technicalChainScenario(),chain=getTechnicalChains([...p.tasks].reverse())[0]!;assert.deepEqual(orderedTechnicalChainMembers(chain).map(t=>t.id),["technical-chain-positioning","technical-chain-camera-test"]);});
test("detects cycles, fan-in and fan-out",()=>{const p=technicalChainScenario(),members=getTechnicalChains(p.tasks)[0]!;const cycle=structuredClone(members);cycle[0]!.dependencies=[cycle[1]!.id];assert.equal(technicalChainHasCycle(cycle),true);const fanIn=structuredClone(members);fanIn[1]!.dependencies=[fanIn[0]!.id,"technical-camera-positioning"];assert.equal(technicalChainHasBranching(fanIn),true);const fanOut=[...members,{...members[1]!,id:"other"}];assert.equal(technicalChainHasBranching(fanOut),true);});
test("preflight rejects invalid technical dependencies deterministically",()=>{const unknown=technicalChainScenario();unknown.tasks.find(t=>t.id==="technical-chain-camera-test")!.dependencies=["missing"];assert.ok(preflight(unknown).includes("TECHNICAL_DEPENDENCY_UNSUPPORTED"));const own=technicalChainScenario();own.tasks.find(t=>t.id==="technical-chain-camera-test")!.dependencies=["technical-chain-camera-test"];assert.ok(preflight(own).includes("TECHNICAL_CHAIN_CYCLE"));});
test("generates only the two complete candidates and minimizes resource presence",()=>{const p=technicalChainScenario(),snapshot=structuredClone(p),chain=getTechnicalChains(p.tasks)[0]!,result=generateTechnicalChainCandidates(p,chain,[],1000);assert.equal(result.exhausted,false);assert.equal(result.candidates.length,2);assert.ok(result.candidates.every(c=>c.tasks.length===2));assert.deepEqual(result.candidates[0]!.tasks.map(t=>[t.start,t.end]),[[545,565],[570,585]]);assert.equal(JSON.stringify(p),JSON.stringify(snapshot));});
test("SEARCH and PROBE are bounded, deterministic, and stop after complete candidates",()=>{const p=technicalChainScenario(),snapshot=structuredClone(p),chain=getTechnicalChains(p.tasks)[0]!;const search=generateTechnicalChainCandidates(p,chain,[],1000),one=generateTechnicalChainCandidates(p,chain,[],1000,"PROBE",1),two=generateTechnicalChainCandidates(p,chain,[],1000,"PROBE",2);const slots=Math.ceil((p.day.end-p.day.start)/5),upper=slots*(1+p.budget.bestK*(chain.length-1));assert.equal(search.consumed,360);assert.equal(search.candidates.length,2);assert.deepEqual(search.candidates[0]!.tasks.map(t=>[t.start,t.end]),[[545,565],[570,585]]);assert.equal(one.exhausted,false);assert.equal(one.candidates.length,1);assert.ok(one.consumed<search.consumed);assert.equal(two.candidates.length,2);assert.ok(two.consumed<=search.consumed);assert.ok(search.diagnostics.maximumPartialStatesPerDepth<=p.budget.bestK);assert.ok(search.consumed<=upper);assert.deepEqual(search,generateTechnicalChainCandidates(p,chain,[],1000));assert.deepEqual(one,generateTechnicalChainCandidates(p,[...chain].reverse(),[],1000,"PROBE",1));assert.deepEqual(p,snapshot);});
test("allowance is consumed before placement and never publishes a partial chain",()=>{const p=technicalChainScenario(),chain=getTechnicalChains(p.tasks)[0]!,short=generateTechnicalChainCandidates(p,chain,[],1,"PROBE",2);assert.equal(short.exhausted,true);assert.equal(short.consumed,1);assert.deepEqual(short.candidates,[]);});
test("duplicate prerequisites are dependency-invalid but are not branching",()=>{const p=technicalChainScenario(),member=p.tasks.find(t=>t.id==="technical-chain-camera-test")!;member.dependencies=["technical-chain-positioning","technical-chain-positioning"];assert.equal(technicalChainHasBranching(p.tasks),false);assert.ok(preflight(p).includes("TECHNICAL_DEPENDENCY_UNSUPPORTED"));assert.ok(!preflight(p).includes("TECHNICAL_CHAIN_BRANCHING_UNSUPPORTED"));});

test("ANALYTIC_DOMAIN has FULL_GRID oracle parity and eliminates unavailable regions without evaluating them",()=>{
 const create=()=>{const p=technicalChainScenario();p.searchPolicy="EXACT_CONSTRUCTIVE";p.budget.bestK=1;return p};
 const analyticProblem=create(),chain=getTechnicalChains(analyticProblem.tasks)[0]!;
 const analytic=generateTechnicalChainCandidates(analyticProblem,chain,[],10_000,"SEARCH",1,"ANALYTIC_DOMAIN");
 const oracleProblem=create(),oracle=generateTechnicalChainCandidates(oracleProblem,getTechnicalChains([...oracleProblem.tasks].reverse())[0]!,[],10_000,"SEARCH",1,"FULL_GRID");
 assert.deepEqual(analytic.candidates.map(({tasks})=>tasks.map(({id,start,end})=>({id,start,end}))),oracle.candidates.map(({tasks})=>tasks.map(({id,start,end})=>({id,start,end}))));
 assert.equal(analytic.diagnostics.fullGridStarts,oracle.diagnostics.fullGridStarts);
 assert.equal(analytic.diagnostics.analyticEligibleStarts,oracle.diagnostics.analyticEligibleStarts);
 assert.ok(analytic.diagnostics.analyticallyEliminatedStarts>100);
 assert.equal(analytic.diagnostics.startsEvaluated,analytic.consumed);
 assert.ok(analytic.diagnostics.startsEvaluated<oracle.diagnostics.startsEvaluated);
 assert.ok(analytic.diagnostics.completeCandidatesGenerated>0);
 assert.deepEqual(analytic,generateTechnicalChainCandidates(create(),getTechnicalChains(create().tasks)[0]!,[],10_000,"SEARCH",1,"ANALYTIC_DOMAIN"));
});

test("analytic technical domains apply materialized dependencies and resource transitions and certify an exact empty domain",()=>{
 const p=technicalChainScenario();p.searchPolicy="EXACT_CONSTRUCTIVE";
 const chain=getTechnicalChains(p.tasks)[0]!,resource=p.resources.find(({id})=>id==="technical-chain-unit")!;resource.transitionMinutes=10;
 const blocker={...chain[0]!,id:"placed",start:540,end:565,spaceId:"technical-chain-room-b",dependencies:[]};
 chain[0]!.dependencies=["placed"];
 const constrained=generateTechnicalChainCandidates(p,chain,[blocker],10_000,"SEARCH",1,"ANALYTIC_DOMAIN");
 assert.ok(constrained.candidates.every(candidate=>candidate.tasks[0]!.start>=575));
 resource.availability=[];
 const empty=generateTechnicalChainCandidates(p,chain,[blocker],10_000,"SEARCH",1,"ANALYTIC_DOMAIN");
 assert.equal(empty.diagnostics.analyticEligibleStarts,0);
 assert.equal(empty.diagnostics.startsEvaluated,0);
 assert.deepEqual(empty.candidates,[]);
});

test("bestK is an active frontier and deferred partials remain unexpanded until requested",()=>{
 const p=technicalChainScenario();p.searchPolicy="EXACT_CONSTRUCTIVE";p.budget.bestK=1;
 const explorer=createTechnicalChainExplorer(p,getTechnicalChains(p.tasks)[0]!,[],10_000);
 const first=explorer.nextCandidate();
 assert.ok(first);
 assert.equal(explorer.diagnostics.activeFrontierPeak,1);
 assert.ok(explorer.diagnostics.alternativesDeferred>0);
 assert.equal(explorer.diagnostics.alternativesRevisited,0);
 const evaluatedBeforeReopen=explorer.diagnostics.startsEvaluated;
 const second=explorer.nextCandidate();
 assert.ok(second);
 assert.ok(explorer.diagnostics.alternativesRevisited>0);
 assert.ok(explorer.diagnostics.startsEvaluated>evaluatedBeforeReopen);
 assert.equal(explorer.diagnostics.activeFrontierPeak,1);
});

test("negative PROBE abstains on budget exhaustion before deferred alternatives are exhausted",()=>{
 const p=technicalChainScenario();p.searchPolicy="EXACT_CONSTRUCTIVE";p.budget.bestK=1;
 const result=generateTechnicalChainCandidates(p,getTechnicalChains(p.tasks)[0]!,[],1,"PROBE",1);
 assert.equal(result.exhausted,true);
 assert.deepEqual(result.candidates,[]);
 assert.equal(result.diagnostics.startsEvaluated,1);
});

test("incremental deferred queue preserves the global-sort oracle order and branch accounting",()=>{
 const create=()=>{const p=technicalChainScenario();p.searchPolicy="EXACT_CONSTRUCTIVE";p.budget.bestK=1;return p};
 const heapProblem=create(),heapChain=getTechnicalChains(heapProblem.tasks)[0]!;
 const heap=createTechnicalChainExplorer(heapProblem,heapChain,[],10_000,"ANALYTIC_DOMAIN",[],"INCREMENTAL_HEAP");
 const oracleProblem=create(),oracle=createTechnicalChainExplorer(oracleProblem,getTechnicalChains(oracleProblem.tasks)[0]!,[],10_000,"ANALYTIC_DOMAIN",[],"GLOBAL_SORT_ORACLE");
 const collect=(explorer:ReturnType<typeof createTechnicalChainExplorer>)=>{const out=[];for(let candidate;(candidate=explorer.nextCandidate());)out.push(candidate.tasks.map(({start,end,spaceId})=>({start,end,spaceId})));return out};
 assert.deepEqual(collect(heap),collect(oracle));
 assert.equal(heap.consumed,oracle.consumed);
 assert.equal(heap.diagnostics.deferredPushes,oracle.diagnostics.deferredPushes);
 assert.equal(heap.diagnostics.deferredPops,oracle.diagnostics.deferredPops);
 assert.equal(heap.diagnostics.deferredGlobalSorts,0);
 assert.ok(oracle.diagnostics.deferredGlobalSorts>0);
});

test("ranking is invariant to equivalent task IDs and input order",()=>{
 const run=(renamed:boolean)=>{const p=technicalChainScenario();p.searchPolicy="EXACT_CONSTRUCTIVE";p.budget.bestK=1;
   const chain=getTechnicalChains(p.tasks)[0]!;
   if(renamed){chain[0]!.id="z-root";chain[1]!.id="a-child";chain[1]!.dependencies=["z-root"]}
   const result=generateTechnicalChainCandidates(p,[...chain].reverse(),[],10_000);
   return result.candidates.map(candidate=>candidate.tasks.map(({start,end,spaceId})=>({start,end,spaceId}))) };
 assert.deepEqual(run(false),run(true));
});

test("large deferred queue uses incremental operations, retains every alternative, and respects bestK",()=>{
 const p=technicalChainScenario();p.searchPolicy="EXACT_CONSTRUCTIVE";p.budget.bestK=1;p.day={start:0,end:10_050};
 const chain=getTechnicalChains(p.tasks)[0]!;for(const task of chain)task.duration=5;
 const resource=p.resources.find(({id})=>id==="technical-chain-unit")!;resource.availability=[{start:0,end:10_050}];resource.presencePreference="OFF";
 for(const space of p.spaces.filter(({id})=>id.startsWith("technical-chain-room-")))space.availability=[{start:0,end:10_050}];
 const explorer=createTechnicalChainExplorer(p,chain,[],20_000);
 let recovered=0;while(recovered<1_500&&explorer.nextCandidate())recovered+=1;
 assert.equal(recovered,1_500);
 assert.ok(explorer.diagnostics.deferredQueuePeak>3_000);
 assert.ok(explorer.diagnostics.deferredPushes>3_000);
 assert.ok(explorer.diagnostics.deferredPops>=1_499);
 assert.equal(explorer.diagnostics.alternativesDeferred,explorer.diagnostics.deferredPushes);
 assert.equal(explorer.diagnostics.alternativesRevisited,explorer.diagnostics.deferredPops);
 assert.equal(explorer.diagnostics.deferredGlobalSorts,0);
 assert.equal(explorer.diagnostics.activeFrontierPeak,1);
});
