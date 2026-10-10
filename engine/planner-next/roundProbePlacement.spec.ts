import assert from 'node:assert/strict';
import test from 'node:test';
import type {PlannerNextProblem,ScheduledTask,ScheduledSpaceMeal,Task} from './contracts';
import {probeExactRoundSynchronizationMacroDomain} from './exactRoundSynchronization';
import {findCanonicalPerfectMatching} from './macroScheduling';
import {canPlaceTask} from './placement';

function fixture():PlannerNextProblem {
 const day={start:0,end:65};
 const tasks:Task[]=['a','b','c','d'].map((id,index)=>({id,kind:'auxiliary',participantId:id,
  spaceId:index<2?'left':'right',duration:5,dependencies:[],requiredResourceIds:[index%2?'r2':'r1']}));
 return {day,tasks,participants:['a','b','c','d','outside'].map(id=>({id,availability:[day]})),coaches:[],
  resources:['r1','r2'].map(id=>({id,availability:[day],presencePreference:'OFF'})),
  spaces:['left','right','outside'].map(id=>({id,availability:[day]})),
  participantTransitionMinutes:5,resourceTransitionMinutes:5,
  mainFlow:{spaceId:'outside',preferredEnd:65,continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1},
  auxiliaryPolicy:{participantPresencePreference:'OFF'},searchPolicy:'EXACT_CONSTRUCTIVE',
  budget:{bestK:1,maxBacktracks:0,maxPatterns:10,maxBranchExpansions:1000},
  roundSynchronizations:[{id:'round',synchronization:'START_TOGETHER_WHILE_ALL_LANES_ACTIVE',lanes:[{spaceId:'left',taskIds:['a','b'],preparationMinutesBetweenRounds:5},
   {spaceId:'right',taskIds:['c','d'],preparationMinutesBetweenRounds:5}]}]};
}
// Independent full-grid reference for this two-round geometry: canonical matching
// consults placement directly, then validates the whole assigned candidate.
function reference(p:PlannerNextProblem,base:ScheduledTask[],meals:ScheduledSpaceMeal[]) {
 let structural=0,matchingCount=0;const policy=p.roundSynchronizations![0]!;
 for(let start=p.day.start;start<p.day.end;start+=5){
  const slots=policy.lanes.flatMap((lane,laneIndex)=>[0,1].map(round=>({id:`${laneIndex}:${round+1}`,
   lane,start:start+round*10,end:start+round*10+5,round})));
  if(slots.some(slot=>slot.end>p.day.end)||policy.lanes.some(lane=>base.some(t=>t.spaceId===lane.spaceId&&t.start<start+10&&start+5<t.end)
   ||meals.some(m=>m.spaceId===lane.spaceId&&m.start<start+10&&start+5<m.end)))continue;
  structural++;
  const match=findCanonicalPerfectMatching(slots.map(s=>s.id),p.tasks.map(t=>t.id),(id,key)=>{
   const t=p.tasks.find(t=>t.id===id)!,s=slots.find(s=>s.id===key)!;
   return s.lane.taskIds.includes(id)&&canPlaceTask(p,t,s.start,base,meals);
  });
  if(!match)continue;
  const placed=[...match].map(([key,id])=>{const task=p.tasks.find(t=>t.id===id)!,slot=slots.find(s=>s.id===key)!;
   return {...task,start:slot.start,end:slot.start+task.duration};});
  if(placed.every(t=>canPlaceTask(p,t,t.start,[...base,...placed.filter(x=>x.id!==t.id)],meals)))matchingCount++;
 }
 return {domainSize:matchingCount,structuralCandidateCount:structural,matchingFeasibleCandidateCount:matchingCount};
}

test('memoized round edges equal direct canonical placement across changing contexts and reject joint resource collisions',()=>{
 for(const variant of ['plain','availability','dependency','margins','joint-collision'] as const){
  const p=fixture();
  if(variant==='availability')p.tasks[0]!.availability=[{start:15,end:40}];
  if(variant==='dependency')p.tasks[0]!.dependencies=['fixed'];
  if(variant==='margins'){p.tasks[0]!.participantMarginBeforeMinutes=10;p.tasks[0]!.participantMarginAfterMinutes=0;}
  if(variant==='joint-collision')for(const t of p.tasks)t.requiredResourceIds=['r1'];
  const saved=structuredClone(p);
  for(const at of [0,10,25,40]){
   const fixed:ScheduledTask={id:'fixed',kind:'auxiliary',participantId:'a',spaceId:'outside',duration:5,
    dependencies:[],requiredResourceIds:['r1'],start:at,end:at+5};
   const meals:ScheduledSpaceMeal[]=[];
   const before=structuredClone(fixed),policy=p.roundSynchronizations![0]!;
   const actual=probeExactRoundSynchronizationMacroDomain(p,policy,[fixed],[],[],meals);
   assert.deepEqual(actual,reference(p,[fixed],meals),`${variant}@${at}`);
   if(variant==='joint-collision')assert.equal(actual.domainSize,0,'edge compatibility cannot certify a colliding full candidate');
   assert.deepEqual(fixed,before);
  }
  assert.deepEqual(p,saved);
 }
});

test('runtime interruption of an uncharged macro probe cannot become a zero-domain certificate',()=>{
 const p=fixture(),error=new Error('runtime interrupted');let checks=0;
 assert.throws(()=>probeExactRoundSynchronizationMacroDomain(p,p.roundSynchronizations![0]!,[],[],[],[],()=>{
  if(++checks===3)throw error;
 }),actual=>actual===error);
 assert.deepEqual(probeExactRoundSynchronizationMacroDomain(p,p.roundSynchronizations![0]!,[],[],[],[]),reference(p,[],[]));
});
