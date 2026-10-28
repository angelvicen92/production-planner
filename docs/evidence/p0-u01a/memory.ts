/** MEMORY ONLY. Captured product input, no DB imports/writes, no Stage. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspect as inspectRaw} from '../p0-u00y/consumer';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {executePlannerNext} from '../../../engine/planner-next/executePlannerNext';
import {fingerprint} from '../../../engine/planner-next/fingerprint';
import {preflight,validatePlan} from '../../../engine/planner-next/validate';
import {createTechnicalChainExplorer,getTechnicalChains} from '../../../engine/planner-next/technicalChains';
import {operationContinuityPreflight} from '../../../engine/planner-next/operationContinuity';
import {technicalChainCombinationSupported,validateDailyTechnicalChains} from '../../../server/technicalChainStructure';
import {jointCombinationSupported} from '../../../server/jointGroupStructure';
import {operationalMealsCombinationSupported} from '../../../server/operationalMealPolicy';
import type {EngineInput} from '../../../engine/types';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
import {operationalMealCandidates,taskConflictsWithPolicy} from '../../../engine/planner-next/operationalMeals';
import {buildAssistedProblem} from '../../../engine/planner-next/assistedPlanning';
import {resolveAssistedScope,analyticalFutureEligibleTaskIds} from '../../../server/assistedScopeResolver';
// The historical helper's top-level validation passes tasks only and omits meals.
// Use the canonical validator with every witness channel when judging global validity.
function inspect(...args:Parameters<typeof inspectRaw>){
 const {validation:_tasksOnly,...ret}=inspectRaw(...args);const proof=ret.result?.evidence.nominalPhysicalFutureWitness as any;
 return {...ret,...(proof&&ret.adapter.status==='SUPPORTED'?{globalWitnessValidation:validatePlan(ret.adapter.problem,proof.tasks,proof.setupPreparations??[],proof.spaceMeals??[],proof.participantMeals??[],proof.resourceMeals??[],proof.itinerantUnitMeals??[],proof.roundPreparations??[],proof.operationalMeals??[])}:{})};
}
const directory=resolve(process.argv[2]),output=resolve(process.argv[3]);mkdirSync(output,{recursive:true});
const read=(n:string)=>JSON.parse(readFileSync(`${directory}/${n}.json`,'utf8'));
const save=(n:string,v:unknown)=>writeFileSync(`${output}/${n}.json`,JSON.stringify(v,null,2));
const input:EngineInput=read('integrated-input'),policy=read('integrated-requested-policy');
const declared:EngineInput={...structuredClone(input),dailyTechnicalChainsVersion:1,technicalChains:[policy]};
const adapter=adapt(declared);save('adapter',adapter);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('adapter');
const guards={technical:technicalChainCombinationSupported(declared),joint:jointCombinationSupported(declared),rest:operationalMealsCombinationSupported(declared)};save('guards',guards);
const noPhases=structuredClone(policy);delete noPhases.phases;
let memberError:string|undefined;try{validateDailyTechnicalChains({...input,tasks:input.tasks.map(t=>({...t,jointGroupId:undefined})),dailyJointGroups:undefined,dailyJointGroupsVersion:undefined,operationalMealPolicies:undefined,dailyOperationalMealsVersion:undefined},{contractVersion:1,policies:[noPhases]});}catch(e:any){memberError=e.message;}save('member-gate',{memberError,intervention:'Omit joint tags and pause in a discarded copy only to expose next producer check; not an operational solution.'});
assert.equal(memberError,'TECHNICAL_CHAIN_INVALID_MEMBER');
const result=inspect(declared);save('full',result);assert.ok(result.globalWitnessValidation?.hardValid);
const member=inspect(declared,[policy.orderedTaskIds[0]]);save('member-scope',member);
const rival=input.tasks.at(-1)!.id;
const partial=inspect(declared,[rival]);save('independent-scope',partial);assert.ok(partial.globalWitnessValidation?.hardValid);
const problem=adapter.problem;save('core-preflight',preflight(problem));
const direct=executePlannerNext(result.problem!.problem,{causalDiagnostic:true,nominalTaskIds:result.problem!.scope.resolvedTaskIds,fixedPlacements:[],fixedPlacementsAsContext:true,fixedSetupPreparations:[],fixedRoundPreparations:[],priorFutureStructuralWitnesses:[],acceptsValidation:()=>false});save('direct-execution',direct);
assert.ok(direct.result?.complete);assert.equal(fingerprint(direct.result!.scheduledTasks),(result.result!.evidence.nominalPhysicalFutureWitness as any).fingerprint);
const impossible:EngineInput=read('impossible-input'),impossiblePolicy=read('impossible-requested-policy');
const impossibleDeclared={...impossible,dailyTechnicalChainsVersion:1 as const,technicalChains:[impossiblePolicy]};save('impossible-declared',inspect(impossibleDeclared));
const shiftedRest=structuredClone(declared);shiftedRest.operationalMealPolicies![0]!.window={start:'08:30',end:'08:45'};
const restVariant=inspect(shiftedRest);save('rest-in-former-block',restVariant);assert.ok(restVariant.globalWitnessValidation?.hardValid);

const representatives=getTechnicalChains(problem.tasks,problem.technicalChains)[0]!;
const explorer=createTechnicalChainExplorer(problem,representatives,[],problem.budget.maxBranchExpansions);
const candidates=[];for(let i=0;i<30;i++){const candidate=explorer.nextCandidate();if(!candidate)break;candidates.push(candidate);}
save('explorer',{candidates,consumed:explorer.consumed,exhausted:explorer.exhausted,diagnostics:explorer.diagnostics});
const continuity={id:'continuity',policy:'REQUIRED' as const,gapWeight:1,taskIds:problem.tasks.filter(t=>policy.orderedTaskIds.includes(Number(t.id.slice(5)))).map(t=>t.id)};
save('continuity-alternative',{allMembers:operationContinuityPreflight({...problem,operationContinuityGroups:[continuity]}),sameSpace:operationContinuityPreflight({...problem,operationContinuityGroups:[{...continuity,taskIds:problem.tasks.filter(t=>t.jointGroupId).map(t=>t.id)}]})});
const closure=resolveAssistedScope(declared,adapter,{kind:'TASK_IDS',taskIds:[policy.orderedTaskIds[0]]});const supporting=buildAssistedProblem(problem,closure.scope,[],analyticalFutureEligibleTaskIds(declared,adapter.identityMap));save('closure',{resolution:closure,supportingTaskIds:supporting.supportingTaskIds,reason:supporting.supportingReasonByTaskId,analytical:supporting.problem?.analyticalFutureTechnicalChains});
// Joint peers are deliberately NOT both listed as serial operations. Preserve this failed alternative.
const both=structuredClone(declared),peer=input.tasks.find(t=>t.jointGroupId&&!policy.orderedTaskIds.includes(t.id))!.id;
save('joint-peer-scope',inspect(declared,[peer]));
both.technicalChains![0].phases!.at(-1)!.splice(1,0,peer);both.technicalChains![0].orderedTaskIds=both.technicalChains![0].phases!.flat();save('all-individual-members',inspect(both));
// Reversing a phase's enumeration order keeps the same domain and every obligation.
for(let phase=0;phase<3;phase++){
 const reversed=structuredClone(declared);reversed.technicalChains![0].phases![phase]!.reverse();reversed.technicalChains![0].orderedTaskIds=reversed.technicalChains![0].phases!.flat();
 const r=inspect(reversed);save(`reverse-phase-${phase+1}`,r);assert.ok(r.result?.evidence.hardValid);assert.ok(r.globalWitnessValidation?.hardValid);
}
const summary:any={memoryOnly:true,experimentIsStage:false,remoteWrites:0,productSourceChanges:0,guards,memberError,fullOutcome:result.result?.evidence,partialOutcome:partial.result?.evidence,representativeOperationCount:representatives.length,individualTaskCount:input.tasks.length,explorerCandidates:candidates.length};
if(result.result?.proposal){const proof=(result.result.evidence as any).nominalPhysicalFutureWitness;save('global-validation',validatePlan(problem,proof.tasks,proof.setupPreparations??[],proof.spaceMeals??[],proof.participantMeals??[],proof.resourceMeals??[],proof.itinerantUnitMeals??[],proof.roundPreparations??[],proof.operationalMeals??[]));
 const certificate=certifyDailyTechnicalChain(problem,proof.tasks,problem.budget.maxBranchExpansions-result.result.evidence.work.branchesExplored);save('existing-chain-certificate',certificate);
 save('chain-certificate-without-rest',certifyDailyTechnicalChain({...problem,operationalMealPolicies:undefined},proof.tasks,problem.budget.maxBranchExpansions));
 const continuation=inspect(declared,input.tasks.filter(t=>t.id!==rival).map(t=>t.id),[...(partial.result?.proposal??[])],true);save('continuation',continuation);assert.ok(continuation.globalWitnessValidation?.hardValid);assert.ok(continuation.result?.evidence.protectedPlacementsPreserved);
 const rest=problem.operationalMealPolicies![0],start=rest.window.start;
 const visibleOnly={...proof.tasks.find((t:any)=>t.id===`task:${rival}`)!,start,end:start+5,duration:5,spaceId:rest.spaceIds[0],requiredResourceIds:[],blocksSpace:false};
 const physical={...visibleOnly,requiredResourceIds:[...rest.resourceIds]};
 save('orthogonal-dimensions',{visibleOnlyConflicts:taskConflictsWithPolicy(visibleOnly,rest,true),sameLocationPhysicalConflicts:taskConflictsWithPolicy({...visibleOnly,blocksSpace:true},rest,true),physicalMemberConflicts:taskConflictsWithPolicy(physical,rest,true),availableRestWithoutOccupants:operationalMealCandidates(problem,rest,[],[]).length,proofMeals:proof.operationalMeals,intervention:'Only local occupations passed to existing physical pause authority; no authoring/SQL claim.'});}
save('summary',summary);console.log(JSON.stringify({memoryOnly:true,full:result.result?.evidence.hardValid,candidates:candidates.length,work:result.result?.evidence.work}));
