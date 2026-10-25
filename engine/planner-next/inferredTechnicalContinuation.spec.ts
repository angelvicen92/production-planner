import assert from 'node:assert/strict';
import test from 'node:test';
import type {PlannerNextProblem,ScheduledTask,Task} from './contracts';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from './assistedPlanning';
import {createTechnicalChainExplorer,getTechnicalChains,pendingTechnicalChains} from './technicalChains';
import {preflight,validatePlan} from './validate';

function fixture():PlannerNextProblem {
 const availability=[{start:0,end:90}];
 const tasks:Task[]=[0,1,2].map(i=>({id:`t${i+1}`,kind:'technical',duration:10,spaceId:`s${i+1}`,dependencies:i?[`t${i}`]:[],requiredResourceIds:['rig']}));
 return {profile:'STANDALONE_ONLY',day:{start:0,end:90},tasks,spaces:tasks.map((t,i)=>({id:t.spaceId,availability:[{start:i*20,end:i*20+10}]})),resources:[{id:'rig',availability,presencePreference:'OFF'},{id:'spare',availability,presencePreference:'OFF'}],participants:[],coaches:[],participantTransitionMinutes:0,resourceTransitionMinutes:0,searchPolicy:'EXACT_CONSTRUCTIVE',auxiliaryPolicy:{participantPresencePreference:'OFF'},budget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000}};
}
function fixed(p:PlannerNextProblem,count:number):ScheduledTask[]{return p.tasks.slice(0,count).map((t,i)=>({...t,start:i*20,end:i*20+10}));}
function solve(p:PlannerNextProblem,count:number){return executeAssistedPlanning(buildAssistedProblem(p,createPlanningScope({kind:'ids',value:'tail'},{},p.tasks.slice(count).map(t=>t.id)),fixed(p,count)));}
for(const count of [0,1,2])test(`inferred chain with ${count} fixed predecessors materializes only pending work and necessary waits`,()=>{
 const p=fixture(),before=structuredClone(p),result=solve(p,count);
 assert.ok(result.proposal,JSON.stringify(result.evidence));assert.equal(result.evidence.hardValid,true);assert.equal(result.evidence.protectedPlacementsPreserved,true);
 assert.deepEqual(result.proposal.map(t=>[t.id,t.start,t.end,t.requiredResourceIds]),p.tasks.slice(count).map((t,i)=>[t.id,(i+count)*20,(i+count)*20+10,['rig']]));
 assert.equal(validatePlan(p,[...fixed(p,count),...result.proposal]).hardValid,true);
 assert.deepEqual(result,solve(p,count));const reverse=structuredClone(p);reverse.tasks.reverse();reverse.spaces.reverse();reverse.resources.reverse();
 const inverse=executeAssistedPlanning(buildAssistedProblem(reverse,createPlanningScope({kind:'ids',value:'tail'},{},p.tasks.slice(count).map(t=>t.id)),fixed(p,count)));
 assert.deepEqual(inverse,result);assert.deepEqual(p,before);
});
test('multi-member residual uses the existing explorer with fixed dependency context',()=>{
 const p=fixture(),anchors=fixed(p,1),pending=p.tasks.slice(1),explorer=createTechnicalChainExplorer(p,pending,anchors,100);
 const candidate=explorer.nextCandidate();assert.ok(candidate);assert.deepEqual(candidate.tasks.map(t=>t.id),['t2','t3']);assert.equal(candidate.tasks[0]!.start,20);assert.equal(explorer.nextCandidate(),null);assert.equal(explorer.exhausted,false);
});
test('existing pending-chain support before a fixed successor is preserved',()=>{
 const p=fixture(),last={...p.tasks[2]!,start:40,end:50};
 const scoped=buildAssistedProblem(p,createPlanningScope({kind:'ids',value:'prefix'},{},['t1','t2']),[last]);
 const r=executeAssistedPlanning(scoped);assert.ok(r.proposal);assert.deepEqual(r.proposal.map(t=>t.id),['t1','t2']);assert.equal(r.evidence.protectedPlacementsPreserved,true);
});
test('residual recognition requires a fixed prefix and never accepts an interior cut',()=>{
 const p=fixture();assert.deepEqual(pendingTechnicalChains(p.tasks,p.tasks.slice(1),new Set()),[]);
 assert.deepEqual(pendingTechnicalChains(p.tasks,[p.tasks[0]!,p.tasks[2]!],new Set(['t2'])),[]);
 assert.deepEqual(pendingTechnicalChains(p.tasks,p.tasks.slice(2),new Set(['t1','t2'])).map(c=>c.map(t=>t.id)),[['t3']]);
});
test('a genuinely isolated technical operation remains unsupported',()=>{
 const p=fixture();p.tasks=[p.tasks[0]!];const r=solve(p,0);assert.equal(r.proposal,null);assert.ok(r.evidence.reasonCodes.some(c=>c.includes('UNSUPPORTED_STANDALONE_TASK_KIND')));
});
for(const [name,mutate,reason] of [
 ['missing reference',(p:PlannerNextProblem)=>{p.tasks[1]!.dependencies=['absent'];},'MISSING_TASK_REFERENCE'],
 ['cycle',(p:PlannerNextProblem)=>{p.tasks[0]!.dependencies=['t3'];},'TECHNICAL_CHAIN_CYCLE'],
 ['branch',(p:PlannerNextProblem)=>{p.tasks[2]!.dependencies=['t1'];},'TECHNICAL_CHAIN_BRANCHING_UNSUPPORTED'],
] as const)test(`${name} remains rejected before search`,()=>{const p=fixture();mutate(p);assert.ok(preflight(p).includes(reason));if(name==='missing reference')assert.throws(()=>solve(p,1),/UNKNOWN_SUPPORTING_DEPENDENCY_ID/);else assert.equal(solve(p,1).proposal,null);});
for(const count of [1,2])test(`physical zero domain with ${count} fixed predecessors is not unsupported or budget exhaustion`,()=>{
 const p=fixture();p.spaces[2]!.availability=[{start:80,end:85}];const r=solve(p,count);assert.equal(r.proposal,null);assert.ok(!r.evidence.reasonCodes.some(c=>/UNSUPPORTED|BUDGET|TIME_LIMIT/.test(c)),r.evidence.reasonCodes.join());
});
test('nominal identity and incompatible protected context remain hard',()=>{
 const p=fixture(),anchors=fixed(p,2);anchors[1]!.requiredResourceIds=['spare'];
 assert.throws(()=>buildAssistedProblem(p,createPlanningScope({kind:'ids',value:'tail'},{},['t3']),anchors),/PROTECTED_PLACEMENT_TASK_MISMATCH/);
 const good=solve(p,2).proposal!;assert.equal(validatePlan(p,[...fixed(p,2),{...good[0]!,requiredResourceIds:['spare']}]).hardValid,false);
 const late=fixed(p,2);late[1]!.start=50;late[1]!.end=60;const r=executeAssistedPlanning(buildAssistedProblem(p,createPlanningScope({kind:'ids',value:'tail'},{},['t3']),late));assert.equal(r.proposal,null);
});
test('explicit REQUIRED still rejects necessary waits and retains its existing pending projection',()=>{
 const p=fixture();p.technicalChains=[{id:'explicit',orderedTaskIds:p.tasks.map(t=>t.id),adjacency:'REQUIRED',resourceContinuity:'REQUIRED',requiredResourceIds:['rig']}];
 assert.equal(solve(p,0).proposal,null);assert.equal(solve(p,1).proposal,null);
 assert.deepEqual(pendingTechnicalChains(p.tasks,p.tasks.slice(1),new Set(['t1']),p.technicalChains),getTechnicalChains(p.tasks.slice(1),p.technicalChains));
});
