/** Offline only. Reconstruct the exact service projection; never persist a candidate. */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem} from '../../../engine/planner-next/assistedPlanning';
import {analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
import {runExactItinerantPlanSearch} from '../../../engine/planner-next/exactItinerantPlan';
const native=process.argv[2],out=process.argv[3];mkdirSync(out,{recursive:true});
const read=(name:string)=>JSON.parse(readFileSync(`${native}/${name}.json`,'utf8'));
const save=(name:string,v:any)=>writeFileSync(`${out}/${name}.json`,JSON.stringify(v,null,2));
const input=read('macro-input'),adapter=adapt(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('adapter');
const scope=read('macro-peer-scopes')[0].scope;
const assisted=buildAssistedProblem(adapter.problem,scope,[],analyticalFutureEligibleTaskIds(input,adapter.identityMap));
const producer=assisted.collectiveCoreProjection??assisted;
const problem={...producer.problem,participantMeals:[...(producer.problem.participantMeals??[]),...producer.analyticalParticipantMeals]};
save('projection',{assisted,problem});
const mainChoices:any[]=[],families:any[]=[];
const result=runExactItinerantPlanSearch(problem,{causalDiagnostic:true,nominalTaskIds:scope.resolvedTaskIds,fixedPlacements:[],fixedPlacementsAsContext:true,
 onMainFlowFamilyEntered:(blocks,explorer)=>families.push({blocks,explorer}),
 coreOrderer:{onMainChoiceEntered:d=>{if(mainChoices.length<100)mainChoices.push(d);}}});
save('exact',{result,mainChoices,families});
console.log(JSON.stringify({status:result.status,complete:result.complete,branches:result.evidence.branchesExplored,coreLeaves:result.evidence.coreCompleteLeafCount,firstExactArchitecture:result.evidence.firstExactArchitecture}));
