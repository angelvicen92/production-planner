import assert from 'node:assert/strict';
import test from 'node:test';
import {createSpec10021RoundSynchronizationEngineInputFixture} from '../engine/planner-next/integration/engineInputAdapter.fixture';
import {adaptEngineInputToPlannerNextProblem} from '../engine/planner-next/integration/engineInputAdapter';
import {applyDailyRoundStructure,validateDailyRoundStructure} from './roundSynchronizationStructure';
import {dayConfigEditSchema} from '../shared/dayConfig';
import {resolveAssistedScope} from './assistedScopeResolver';
const fixture=()=>{
 const input=createSpec10021RoundSynchronizationEngineInputFixture();
 input.plannerNext={...input.plannerNext!,profile:'STANDALONE_ONLY'};
 delete input.plannerNext.mainFlow;
 const ids=new Set(input.roundSynchronizations!.flatMap(p=>p.lanes.flatMap(l=>l.taskIds)));
 input.tasks=input.tasks.filter(t=>ids.has(t.id));input.locks=[];input.vocalCoachPlanResourceItemIdByContestantId={};
 return {input,structure:{contractVersion:1 as const,policies:input.roundSynchronizations!}};
};
test('native structure requires explicit CAS and keeps independent tasks outside the operational scope',()=>{
 const {input,structure}=fixture();
 const candidate=validateDailyRoundStructure(input,structure),adapted=adaptEngineInputToPlannerNextProblem(candidate);
 assert.equal(adapted.status,'SUPPORTED');if(adapted.status!=='SUPPORTED')throw Error('unsupported');
 const members=structure.policies[0].lanes.flatMap(l=>l.taskIds).sort((a,b)=>a-b);
 assert.deepEqual(resolveAssistedScope(candidate,adapted,{kind:'TASK_IDS',taskIds:[members[0]]}).productTaskIds,members);
 assert.equal(dayConfigEditSchema.safeParse({roundSynchronization:structure}).success,false);
 assert.equal(dayConfigEditSchema.safeParse({roundSynchronization:structure,expectedRevisionId:null}).success,true);
 assert.equal(dayConfigEditSchema.safeParse({roundSynchronization:structure,expectedRevisionId:1,workday:{start:'08:00',end:'17:00'}}).success,false);
});
test('native membership rejects unknown/duplicated members, wrong spaces, mixed durations and unsupported roles',()=>{
 const {input,structure}=fixture();
 for(const mutate of [
  (s:typeof structure)=>{s.policies[0].lanes[0].taskIds[0]=2147483000;},
  (s:typeof structure)=>{s.policies[0].lanes[1].taskIds[0]=s.policies[0].lanes[0].taskIds[0];},
  (s:typeof structure)=>{s.policies[0].lanes[0].spaceId=s.policies[0].lanes[1].spaceId;},
  (s:typeof structure)=>{s.policies[0].lanes[0].preparationMinutesBetweenRounds=3;},
 ]){const s=structuredClone(structure);mutate(s);assert.throws(()=>validateDailyRoundStructure(input,s));}
 for(const change of [{durationOverrideMin:25},{plannerNextKind:'technical' as const},{contestantId:null}]){
  const next=structuredClone(input);const id=structure.policies[0].lanes[0].taskIds[0];Object.assign(next.tasks.find(t=>t.id===id)!,change);
  assert.throws(()=>validateDailyRoundStructure(next,structure),/UNSUPPORTED_ROUND_STRUCTURE/);
 }
});
test('absence preserves the exact legacy input and conflicting authorities fail closed',()=>{
 const {input,structure}=fixture();
 assert.equal(applyDailyRoundStructure(input,{}),input);
 const persisted={...structure,by:'00000000-0000-0000-0000-000000000001',at:'2026-10-25T12:00:00Z'};
 assert.throws(()=>applyDailyRoundStructure(input,{daily_round_synchronization:persisted,planner_next_configuration:{}}),/AUTHORITY_CONFLICT/);
 assert.deepEqual(applyDailyRoundStructure(input,{daily_round_synchronization:persisted,planner_next_profile:{}}).roundSynchronizations,structure.policies);
});
