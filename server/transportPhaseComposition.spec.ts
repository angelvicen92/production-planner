import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../engine/types';
import {requiredPhaseCompositionSupported,validateDailyTechnicalChains} from './technicalChainStructure';
import {withDailyJointGroups,jointCombinationSupported} from './jointGroupStructure';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../engine/planner-next/integration/engineInputAdapter';
import {certifyDailyTechnicalChain} from './technicalChainCertificate';
const evidence=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-g04a/probe/receipts.json.gz')).toString());
function fixture(){return structuredClone(evidence['input.json']) as EngineInput;}
test('the original native 103-obligation witness composes transport, physical phases, joint peers and nineteen meals',()=>{
 const input=fixture(),original=structuredClone(input),structure={contractVersion:1 as const,policies:input.technicalChains!};
 const groups={contractVersion:1 as const,groups:input.dailyJointGroups!};
 const bare=structuredClone(input);delete bare.technicalChains;delete bare.dailyTechnicalChainsVersion;
 delete bare.dailyJointGroups;delete bare.dailyJointGroupsVersion;for(const t of bare.tasks)delete t.jointGroupId;
 assert.ok(requiredPhaseCompositionSupported(bare));assert.equal(jointCombinationSupported(bare),false);
 const reconstructed=validateDailyTechnicalChains(withDailyJointGroups(validateDailyTechnicalChains(bare,structure),groups),structure);
 assert.deepEqual(reconstructed,input);assert.deepEqual(input,original);
 const a=adapt(reconstructed);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('adapter');
 const run=evidence['run.json'],proof=run.evidence.nominalPhysicalFutureWitness;
 assert.equal(proof.tasks.length+proof.participantMeals.length,103);assert.equal(proof.participantMeals.length,19);
 assert.equal(certifyDailyTechnicalChain(a.problem,run.proposal,0,proof)?.status,'WITNESS');
 const bad=structuredClone(proof),arrivals=bad.tasks.filter((t:any)=>t.id==='task:34'||t.id==='task:37');
 assert.equal(arrivals.length,2);assert.equal(arrivals[0].start,arrivals[1].start);
 arrivals[1].start+=5;arrivals[1].end+=5;
 assert.equal(certifyDailyTechnicalChain(a.problem,run.proposal,0,bad)?.status,'INVALID');
});
test('transport retains independent ownership and malformed contracts or uncertified intersections fail closed',()=>{
 const input=fixture(),structure={contractVersion:1 as const,policies:input.technicalChains!};
 const transport=input.tasks.find(t=>t.operationalRole==='transport_arrival')!;
 const member=structuredClone(structure);member.policies[0].orderedTaskIds[0]=transport.id;member.policies[0].phases![0][0]=transport.id;
 assert.throws(()=>validateDailyTechnicalChains(input,member),/TECHNICAL_CHAIN_INVALID_MEMBER/);
 for(const mutate of [
  (b:EngineInput)=>{b.transportSettings={} as any;},
  (b:EngineInput)=>{b.anchoredAccompaniments=[{}] as any;},
  (b:EngineInput)=>{b.dailyTaskOperationScopes=[{}] as any;},
  (b:EngineInput)=>{b.operationalMealPolicies=[{}] as any;},
  (b:EngineInput)=>{b.resourceRouteTransitions=[{}] as any;},
 ]){const bad=fixture();mutate(bad);assert.equal(requiredPhaseCompositionSupported(bad),false);assert.throws(()=>validateDailyTechnicalChains(bad,structure));}
});
