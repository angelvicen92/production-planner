import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {scenario,counterfactual} from '../p0-u00k/scenario';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {executePlannerNext} from '../../../engine/planner-next/executePlannerNext';
import {runExactItinerantPlanSearch} from '../../../engine/planner-next/exactItinerantPlan';
import {preparePipelineBundleGraph,materializePreparedPipelineBundleMatching} from '../../../engine/planner-next/anonymousPipelineWitness';
import {createExactSearchLedger} from '../../../engine/planner-next/exactMainAndFeederCore';
import {nominalOperationEdgeKey} from '../../../engine/planner-next/nominalResourceChoice';
import {diagnoseTaskPlacement} from '../../../engine/planner-next/placement';
const input=counterfactual(scenario(process.cwd()),'anyOf'),adapter=adaptEngineInputToPlannerNextProblem(input);
assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported');
const p=adapter.problem,architecture={pattern:p.tasks.filter(t=>t.kind==='main').map(t=>t.blockKey!),slots:[580,590]};
const prepared=preparePipelineBundleGraph(p,architecture)!;
const generated=[...prepared.nominalVariants!.get('task:4')!].map(([position,variants])=>({position,variants}));
const ledger=createExactSearchLedger(p.budget.maxBranchExpansions),consume=()=>ledger.consume('CORE');
const first=materializePreparedPipelineBundleMatching(p,prepared,new Set(),undefined,consume)!;
const main=first.scheduledTasks.find(t=>t.id==='task:4')!,position=first.matching.get(main.id)!;
const key=nominalOperationEdgeKey(main.id,position,[main]);
const repaired=materializePreparedPipelineBundleMatching(p,prepared,new Set([key]),first,consume);
const critical={...p.tasks.find(t=>t.id==='task:20')!,start:575,end:605};
const physicalRejection=diagnoseTaskPlacement(p,main,main.start,[critical]);
const entered:unknown[]=[];
const ordinary=runExactItinerantPlanSearch(p,{causalDiagnostic:true,coreOrderer:{onMainChoiceEntered:d=>{if(d.mainTask.id==='task:4')entered.push(d);}}});
const bundled=runExactItinerantPlanSearch(p,{preferredArchitecture:architecture,preferredBundleCandidate:first,
 repairPreferredBundleCandidate:(prior,forbidden,consume)=>materializePreparedPipelineBundleMatching(p,prepared,forbidden,prior,consume)});
const execution=executePlannerNext(p,{causalDiagnostic:true});
writeFileSync(process.argv[2],JSON.stringify({input,adapter,generated,first,key,physicalRejection,repaired,entered,ordinary,bundled,execution,
 ledger:{limit:ledger.limit,branches:ledger.branchesExplored}},(_,v)=>v instanceof Map?[...v]:v instanceof Set?[...v]:v,2));
