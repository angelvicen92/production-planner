import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../engine/types';
import {fixedItinerantCompositionSupported} from './itinerantComposition';
import {validateDailyTechnicalChains} from './technicalChainStructure';
import {withDailyJointGroups} from './jointGroupStructure';
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u01e/native/receipts.json.gz')).toString());
const fixture=(label='A-fixed')=>({input:structuredClone(receipts[label+'-input.json']) as EngineInput,auth:structuredClone(receipts[label+'-authoring.json'])});
test('fixed units, segments, joint unit and unused snapshots compose in both authoring orders',()=>{
 for(const label of ['A-fixed','B-segments','C-joint-unit','D-rest-competition','unused-snapshot']){
  const {input,auth}=fixture(label);
  input.dailyJointGroups=undefined;input.dailyJointGroupsVersion=undefined;input.tasks.forEach(t=>{t.jointGroupId=undefined;});
  const original=JSON.stringify(input),chains={contractVersion:1 as const,policies:[auth.policy]};
  assert.ok(fixedItinerantCompositionSupported(input));
  for(const chainFirst of [true,false]){
   let next=chainFirst?validateDailyTechnicalChains(input,chains):withDailyJointGroups(input,auth.jointStructure);
   next=chainFirst?withDailyJointGroups(next,auth.jointStructure):validateDailyTechnicalChains(next,chains);
   assert.deepEqual(next.technicalChains,[auth.policy]);assert.deepEqual(next.dailyJointGroups,auth.jointStructure.groups);
  }
  assert.equal(JSON.stringify(input),original);
 }
});
test('uncertified transitions, alternatives and unauthentic mappings remain unsupported',()=>{
 for(const mutate of [
  (i:EngineInput)=>{i.itinerantTeamAvailability![0].transitionMinutes=5;},
  (i:EngineInput)=>{i.itinerantCompositionSnapshot!.units[0].transition_minutes=null;},
  (i:EngineInput)=>{i.itinerantCompositionSnapshot!.units=[];},
  (i:EngineInput)=>{i.itinerantCompositionSnapshot!.units[0].members[0].planResourceItemId=2147483647;},
  (i:EngineInput)=>{i.tasks.find(t=>t.itinerantTeamId)!.itinerantTeamRequirement='any';},
  (i:EngineInput)=>{i.tasks.find(t=>t.itinerantTeamId)!.allowedItinerantTeamIds=[2147483647];},
 ]){
  const {input,auth}=fixture();mutate(input);assert.equal(fixedItinerantCompositionSupported(input),false);
  assert.throws(()=>validateDailyTechnicalChains(input,{contractVersion:1,policies:[auth.policy]}),/UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION/);
  assert.throws(()=>withDailyJointGroups(input,auth.jointStructure),/UNSUPPORTED_JOINT_COMBINATION/);
 }
});
test('equal physical members cannot hide a different joint unit identity',()=>{
 const {input,auth}=fixture('C-joint-unit'),peer=input.tasks.find(t=>t.id===auth.jointStructure.groups[0].taskIds[1])!;
 const original=input.itinerantCompositionSnapshot!.units.find(u=>u.id===peer.itinerantTeamId)!;
 const duplicate={...structuredClone(original),id:2147483647,source_team_id:2147483647};
 input.itinerantCompositionSnapshot!.units.push(duplicate);
 input.itinerantTeamAvailability!.push({...structuredClone(input.itinerantTeamAvailability!.find(u=>u.itinerantTeamId===original.id)!),itinerantTeamId:duplicate.id});
 peer.itinerantTeamId=duplicate.id;peer.allowedItinerantTeamIds=[duplicate.id];
 assert.ok(fixedItinerantCompositionSupported(input));assert.throws(()=>withDailyJointGroups(input,auth.jointStructure),/JOINT_UNIT_MISMATCH/);
});
