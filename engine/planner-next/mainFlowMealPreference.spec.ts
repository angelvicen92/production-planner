import test from 'node:test';
import assert from 'node:assert/strict';
import {coldFallbackFixture} from '../../script/demo/mainFlowSoftBlockDiagnostic';
import {executePlannerNext} from './executePlannerNext';
import {mainFlowMealBlockDistribution,preferredMealSplitCuts} from './mainFlowMeal';
import {mainFlowTimelineArchitectureFrontier} from './anonymousPipelineWitness';
import {generateMainFlowPatterns,representableMainFlowBlockCounts} from './mainFlowPatterns';
import {validatePlan,preflight} from './validate';
import type {PlannerNextProblem,ScheduledTask} from './contracts';

function fixture(mealStart=80):PlannerNextProblem {
 const p=coldFallbackFixture();p.tasks=p.tasks.filter(t=>t.kind!=='auxiliary');p.spaces[0]!.availability=[p.day];
 p.spaces[0]!.mealPolicy={window:{start:mealStart,end:mealStart+5},duration:5};
 p.mainFlow.preferredEnd=mealStart;p.mainFlow.preferredBlockCount=4;
 return p;
}
function run(p:PlannerNextProblem){const before=structuredClone(p),r=executePlannerNext(p,{causalDiagnostic:true});assert.deepEqual(p,before);
 assert.equal(r.kind,'EXACT_CONSTRUCTIVE');if(r.kind!=='EXACT_CONSTRUCTIVE')throw Error('wrong policy');
 assert.ok(r.result.evidence.branchesExplored<=p.budget.maxBranchExpansions);return r.result;}
for(const mealStart of [65,80,100])test(`preference really selects 2+2 around effective meal ${mealStart}`,()=>{
 const p=fixture(mealStart),control=run(p);assert.equal(control.complete,true);
 assert.deepEqual(mainFlowMealBlockDistribution(control.scheduledTasks,control.scheduledSpaceMeals[0]),{total:4,mealStart,mealEnd:mealStart+5,blocksBeforeMeal:4,blocksAfterMeal:0,blockSpansMeal:false});
 p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:2,afterMealBlocks:2};
 const r=run(p);assert.equal(r.complete,true);assert.deepEqual(r,run(p));assert.equal(validatePlan(p,r.scheduledTasks,[],r.scheduledSpaceMeals).hardValid,true);
 assert.equal(r.evidence.mainFlowSoftPreference!.mealSplitPreferenceAchieved,true);
 assert.equal(r.evidence.mainFlowSoftPreference!.mealSplitAchieved!.blocksBeforeMeal,2);
 assert.equal(r.evidence.mainFlowSoftPreference!.mealSplitAchieved!.blocksAfterMeal,2);
 assert.notEqual(r.evidence.fullFingerprint,control.evidence.fullFingerprint);
});
test('requested split precedes all fallback architectures across the structural family, lazily',()=>{
 const p=fixture();p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:2,afterMealBlocks:2};
 const patterns=generateMainFlowPatterns(p.tasks.filter(t=>t.kind==='main'),1,2,200,[],4).patterns;
 const frontier=[...mainFlowTimelineArchitectureFrontier(p,patterns,5)];
 const four=frontier.filter(e=>e.architecture.pattern.reduce((n,k,i)=>n+(i===0||k!==e.architecture.pattern[i-1]?1:0),0)===4);
 const preferred=(e:typeof four[number])=>e.architecture.slots.filter(s=>s<80).length===2;
 const firstFallback=four.findIndex(e=>!preferred(e));assert.ok(firstFallback>0);assert.ok(four.slice(firstFallback).every(e=>!preferred(e)));
});
test('distribution fallback keeps four blocks and reports search limits, not infeasibility',()=>{
 const p=fixture();for(const t of p.tasks.filter(t=>t.kind==='main'))t.availability=[{start:65,end:90}];
 p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:2,afterMealBlocks:2};
 const r=run(p),e=r.evidence.mainFlowSoftPreference!;assert.equal(r.complete,true);assert.equal(e.achieved,4);
 assert.equal(e.mealSplitAchieved!.blocksBeforeMeal,3);assert.equal(e.mealSplitAchieved!.blocksAfterMeal,1);
 assert.equal(e.mealSplitPreferenceAchieved,false);assert.equal(e.fallbackKind,'DISTRIBUTION');assert.equal(e.hardCertificate,null);
 assert.equal(e.fallbackReason,'NO_PREFERRED_SPLIT_COMPLETION');
});
test('quantity fallback remains SOFT with the existing future-dependency certificate',()=>{
 const p=coldFallbackFixture();p.spaces[0]!.mealPolicy={window:{start:80,end:85},duration:5};p.spaces[0]!.availability=[p.day];
 for(const t of p.tasks.filter(t=>t.kind==='main'))t.availability=[{start:60,end:80}];
 p.mainFlow.preferredBlockCount=4;p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:2,afterMealBlocks:2};
 const r=run(p);assert.equal(r.complete,true);assert.equal(r.evidence.mainFlowSoftPreference!.achieved,2);
 assert.equal(r.evidence.mainFlowSoftPreference!.fallbackKind,'QUANTITY');assert.equal(r.evidence.mainFlowSoftPreference!.hardCertificate,null);
});
test('a meal inside one logical coach block never counts it twice',()=>{
 const tasks=[{id:'a',kind:'main',blockKey:'coach',start:60,end:80},{id:'b',kind:'main',blockKey:'coach',start:85,end:100}] as ScheduledTask[];
 assert.deepEqual(mainFlowMealBlockDistribution(tasks,{start:80,end:85}),{total:1,mealStart:80,mealEnd:85,blocksBeforeMeal:0,blocksAfterMeal:0,blockSpansMeal:true});
 const p=fixture();p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:1,afterMealBlocks:1};
 assert.deepEqual(preferredMealSplitCuts(p,['a','a','b','b']),[2]);
});
test('zero before is representable, without adding a meal-created block',()=>{
 const p=fixture();delete p.spaces[0]!.mealPolicy;p.operationalMealPolicies=[{id:'meal',spaceIds:['main'],resourceIds:[],window:{start:80,end:85},duration:5}];p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:0,afterMealBlocks:4};
 const r=run(p);assert.equal(r.complete,true);assert.equal(r.evidence.mainFlowSoftPreference!.mealSplitPreferenceAchieved,true);
 assert.equal(r.evidence.mainFlowSoftPreference!.mealSplitAchieved!.blocksBeforeMeal,0);
});
test('three coaches and six blocks use configured geometry',()=>{
 const p=fixture(65);p.day.end=180;for(const s of p.spaces)s.availability=[p.day];
 p.spaces.push({id:'voice-c',availability:[p.day]});p.coaches.push({id:'c',availability:[p.day]});
 for(const id of ['c1','c2']){p.participants.push({id,availability:[p.day]});p.tasks.push({id:`voice-${id}`,kind:'vocal',participantId:id,coachId:'c',duration:5,spaceId:'voice-c',dependencies:[]},
 {id:`main-${id}`,kind:'main',participantId:id,coachId:'c',duration:5,spaceId:'main',blockKey:'c',dependencies:[`voice-${id}`]});}
 p.mainFlow.preferredBlockCount=6;p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:3,afterMealBlocks:3};
 const r=run(p);assert.equal(r.complete,true);assert.equal(r.evidence.mainFlowSoftPreference!.achieved,6);assert.equal(r.evidence.mainFlowSoftPreference!.mealSplitPreferenceAchieved,true);
});
test('missing meal and inconsistent sum are explicit preflight incompatibilities',()=>{
 const p=fixture();delete p.spaces[0]!.mealPolicy;p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:2,afterMealBlocks:2};
 assert.ok(preflight(p).includes('MAIN_FLOW_MEAL_SPLIT_WITHOUT_MEAL'));
 p.mainFlow.mealSplitPreference.afterMealBlocks=1;assert.ok(preflight(p).includes('INVALID_MAIN_FLOW_MEAL_SPLIT_PREFERENCE'));
});

test('product geometry counts equal the existing pattern grammar without enumerating it at configuration reads',()=>{
 for(const a of [1,2,3,4])for(const b of [1,2,3])for(const minimum of [1,2])for(const cap of [1,2,3]){
  const mains=[...Array.from({length:a},()=>({blockKey:'a'})),...Array.from({length:b},()=>({blockKey:'b'}))] as any;
  const generated=generateMainFlowPatterns(mains,minimum,cap,100000).patterns;
  const actual=[...new Set(generated.map(p=>p.reduce((n,k,i)=>n+(i===0||k!==p[i-1]?1:0),0)))].sort((a,b)=>a-b);
  assert.deepEqual(representableMainFlowBlockCounts(mains,minimum,cap),actual);
 }
});

test('flexible operational meal moves inside its real window before distribution fallback',()=>{
 const p=fixture(70);delete p.spaces[0]!.mealPolicy;p.operationalMealPolicies=[{id:'lunch',resourceIds:[],spaceIds:['main'],window:{start:70,end:100},duration:5}];
 for(const t of p.tasks.filter(t=>t.kind==='main'))t.availability=[{start:75,end:100}];
 p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:2,afterMealBlocks:2};
 const r=run(p),e=r.evidence.mainFlowSoftPreference!;assert.equal(r.complete,true);assert.equal(e.mealSplitPreferenceAchieved,true);
 assert.equal(e.mealSplitAchieved!.mealStart,85);assert.equal(e.mealSplitAchieved!.mealEnd,90);
});

test('a valid zero-before distribution remains a four-block fallback, never a HARD filter',()=>{
 const p=fixture();delete p.spaces[0]!.mealPolicy;p.operationalMealPolicies=[{id:'lunch',resourceIds:[],spaceIds:['main'],window:{start:80,end:85},duration:5}];
 for(const t of p.tasks.filter(t=>t.kind==='main'))t.availability=[{start:85,end:105}];
 p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:2,afterMealBlocks:2};
 const r=run(p),e=r.evidence.mainFlowSoftPreference!;assert.equal(r.complete,true);assert.equal(e.achieved,4);
 assert.equal(e.mealSplitAchieved!.blocksBeforeMeal,0);assert.equal(e.mealSplitAchieved!.blocksAfterMeal,4);assert.equal(e.fallbackKind,'DISTRIBUTION');
});
test('materialized spanning block is reported once in the selected run Evidence',()=>{
 const p=fixture(70);delete p.spaces[0]!.mealPolicy;p.spaces[0]!.availability=[{start:55,end:85}];
 p.operationalMealPolicies=[{id:'pause',resourceIds:[],spaceIds:['main'],window:{start:70,end:75},duration:5}];
 for(const t of p.tasks.filter(t=>t.kind==='main'))t.availability=t.blockKey==='a'?[{start:60,end:85}]:[{start:60,end:70},{start:75,end:80}];
 p.mainFlow.preferredBlockCount=3;p.mainFlow.mealSplitPreference={mode:'PREFERRED',beforeMealBlocks:1,afterMealBlocks:2};
 const r=run(p),e=r.evidence.mainFlowSoftPreference!;assert.equal(r.complete,true);assert.equal(e.achieved,3);assert.equal(e.mealSplitPreferenceAchieved,false);
 assert.equal(e.mealSplitAchieved!.blocksBeforeMeal,1);assert.equal(e.mealSplitAchieved!.blocksAfterMeal,1);assert.equal(e.mealSplitAchieved!.blockSpansMeal,true);
});
