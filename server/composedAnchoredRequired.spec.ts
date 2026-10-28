import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {EngineInput} from '../engine/types';
import {validateDailyTechnicalChains} from './technicalChainStructure';
import {withDailyAnchoredAccompaniments} from './anchoredAccompanimentStructure';
import {withDailyTaskOperationScopes} from './dailyTaskOperationScopes';
import {withDailyJointGroups} from './jointGroupStructure';
import {withDailyOperationalMeals} from './operationalMealPolicy';
const receipts=JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u02c/native/receipts.json.gz')).toString());
const fixture=(label='integrated')=>{
 const input:EngineInput=structuredClone(receipts[label+'-combined-input.json']);
 const authorities=receipts[label+'-obligations.json'].authorities;
 return {input,authorities};
};
const permutations=<T>(items:T[]):T[][]=>items.length?items.flatMap((item,i)=>permutations(items.filter((_,j)=>i!==j)).map(tail=>[item,...tail])):[[]];
test('five native projectors compose in every order on the four original audited days',()=>{
 for(const label of ['integrated','reverse-order','segmented-joint','segmented-reverse']){
  const {input,authorities:a}=fixture(label),literal=JSON.stringify(input);
  const plain:EngineInput={...input,technicalChains:undefined,dailyTechnicalChainsVersion:undefined,anchoredAccompaniments:undefined,dailyAnchoredAccompanimentsVersion:undefined,dailyTaskOperationScopes:undefined,dailyJointGroups:undefined,dailyJointGroupsVersion:undefined,operationalMealPolicies:undefined,dailyOperationalMealsVersion:undefined,
   tasks:input.tasks.map(t=>({...t,jointGroupId:undefined,blocksSpace:undefined,agendaScope:undefined,resourceInheritance:undefined}))};
  const projectors=[(i:EngineInput)=>validateDailyTechnicalChains(i,a.technicalChains),(i:EngineInput)=>withDailyAnchoredAccompaniments(i,a.anchoredAccompaniments),(i:EngineInput)=>withDailyTaskOperationScopes(i,a.taskOperationScopes),(i:EngineInput)=>withDailyJointGroups(i,a.jointGroups),(i:EngineInput)=>withDailyOperationalMeals(i,a.operationalMealPolicies)];
  for(const order of permutations(projectors)){
   const projected=order.reduce((i,project)=>project(i),plain);
   const checked=validateDailyTechnicalChains(projected,a.technicalChains);
   for(const key of ['technicalChains','anchoredAccompaniments','dailyTaskOperationScopes','dailyJointGroups','operationalMealPolicies'] as const)assert.deepEqual(checked[key],input[key]);
   assert.equal(checked.tasks.length,27);
  }
  assert.equal(JSON.stringify(input),literal);
 }
});
test('overlapping ownership, alternative units, positive transitions and undeclared virtuality stay unsupported',()=>{
 for(const mutate of [
  (i:EngineInput)=>{i.dailyTaskOperationScopes![0].taskId=i.technicalChains![0].orderedTaskIds[0];},
  (i:EngineInput)=>{i.anchoredAccompaniments![0].beforeTaskIds=[i.dailyJointGroups![0].taskIds[1]];},
  (i:EngineInput)=>{i.tasks.find(t=>t.id===i.anchoredAccompaniments![0].anchorTaskId)!.blocksSpace=false;},
  (i:EngineInput)=>{i.tasks.find(t=>t.itinerantTeamId)!.itinerantTeamRequirement='any';},
  (i:EngineInput)=>{i.itinerantTeamAvailability![0].transitionMinutes=5;},
 ]){
  const {input,authorities:a}=fixture();mutate(input);
  assert.throws(()=>validateDailyTechnicalChains(input,a.technicalChains),/UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION/);
 }
});
