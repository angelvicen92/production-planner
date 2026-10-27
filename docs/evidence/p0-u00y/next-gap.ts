/** Representability probes only. A contract rejection is not solver infeasibility. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {dayConfigEditSchema} from '../../../shared/dayConfig';
import {withDailyJointGroups,jointCombinationSupported} from '../../../server/jointGroupStructure';
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(input.dailyJointGroupsVersion,1);assert.ok(input.dailyJointGroups.length>=2);
const structure={contractVersion:1 as const,groups:input.dailyJointGroups};
const base={...structuredClone(input),dailyJointGroups:undefined,dailyJointGroupsVersion:undefined,tasks:input.tasks.map((t:any)=>{const {jointGroupId,...rest}=t;return rest;})};
const probes:any[]=[];
const extra={operationContinuityGroups:[{id:'native-continuity-probe',policy:'REQUIRED',taskIds:structure.groups.flatMap((g:any)=>g.taskIds)}]};
let rejection:string|undefined;try{withDailyJointGroups({...base,...extra},structure);}catch(e:any){rejection=e.message;}
assert.equal(rejection,'UNSUPPORTED_JOINT_COMBINATION');assert.equal(jointCombinationSupported({...base,...extra}),false);
probes.push({family:'Composition of joints and REQUIRED operation continuity',status:'BLOCKED',classification:'CONTRACT_COMBINATION_NOT_REPRESENTABLE',rejection,realTaskIds:extra.operationContinuityGroups[0].taskIds,consumerInfeasibilityClaimed:false});
for(const key of ['operationalMealPolicies','coachRouteTransitions']){
 const result=dayConfigEditSchema.safeParse({[key]:[],expectedRevisionId:null});assert.equal(result.success,false);
 probes.push({family:key,status:'MISSING_NATIVE_PRODUCER',classification:'CONTRACT_NOT_REPRESENTABLE',issues:result.success?[]:result.error.issues,consumerInfeasibilityClaimed:false});
}
writeFileSync(process.argv[3],JSON.stringify({status:'PARTIAL',nativeJointCombinations:['STANDALONE_ONLY with ordinary physical auxiliaries and concrete resources','MAIN_WITH_VOCAL_FEEDER with disjoint physical joint groups and concrete resources'],
 nextSingleGap:'Diagnose composition of native joint groups with REQUIRED operational continuity of the canonical carpet phases',
 reason:'The two canonical pairs can now be authored; their physical integration into the complete REQUIRED production structure remains outside this contract.',
 otherFrontiers:['Operational meals coordinated by unit/space','Native coach route transitions','Reality/round/chain/setup/transport structural composition','requiresBand'],probes,remoteWrites:0,experimentIsStage:false},null,2));
console.log('PASS next boundaries classified as absent authoring/combination, without a solver-infeasibility claim');
