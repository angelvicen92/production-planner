import assert from 'node:assert/strict';
import test from 'node:test';
import {createSupportedEngineInputAdapterFixture} from './engineInputAdapter.fixture';
import {applyNewDayPlannerConfiguration} from '../../../server/newDayPlannerConfiguration';
import {normalizeTaskTemplateCatalogEntry} from '../../../server/taskTemplateSnapshot';
import {adaptEngineInputToPlannerNextProblem} from './engineInputAdapter';
import {createPlanningScope,buildAssistedProblem,executeAssistedPlanning} from '../assistedPlanning';
import {validatePlan,preflight} from '../validate';
import {canPlaceTask} from '../placement';
import {assessSpacePolicies} from '../operationContinuity';
import {generateExactSetupBlockCandidates,probeExactSetupMacroDomain} from '../exactSetupBlocks';
import {createExactSearchLedger} from '../exactMainAndFeederCore';
import type {ScheduledTask,PlannerNextProblem} from '../contracts';

type Mode='OFF'|'PREFERRED'|'REQUIRED';
function fixture(groupingPolicy:Mode='REQUIRED',continuityPolicy:Mode='OFF',families=[1,1,2],durations=[10,10,10]){
 const input=createSupportedEngineInputAdapterFixture();input.locks=[];input.defaultParticipantTransitionMinutes=0;
 input.spaceResourceAssignments={};input.zoneResourceAssignments={};input.vocalCoachPlanResourceItemIdByContestantId={};
 input.tasks=families.map((family,index)=>({id:401+index,planId:input.planId,templateId:family,contestantId:201+index%2,status:'pending',spaceId:303,zoneId:403,durationOverrideMin:durations[index]}));
 const templates=[1,2].map(id=>normalizeTaskTemplateCatalogEntry({id,name:`Family ${id}`,defaultDuration:10,defaultCameras:0,setupId:id,rulesJson:{plannerNextOperation:{contractVersion:1,kind:'auxiliary'}}}));
 const profile={contractVersion:1,sourceRevision:1,configuration:{contractVersion:1,scenario:'STANDALONE_ONLY',setup:'FAMILIES',transport:'NONE',meals:'DAY_CONFIGURATION',searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0,
 setupFamilies:{contractVersion:2,families:[{id:1,name:'A'},{id:2,name:'B'}],policies:[{spaceId:303,familyIds:[1,2],orderConstraint:'UNSPECIFIED',oneBlockPerFamily:groupingPolicy==='REQUIRED',reentry:groupingPolicy==='REQUIRED'?'FORBIDDEN':'ALLOWED',groupingPolicy,continuityPolicy,preparationMinutesBetweenFamilies:groupingPolicy==='OFF'?0:10}]}}};
 const mapped=applyNewDayPlannerConfiguration(input,profile,templates),adapter=adaptEngineInputToPlannerNextProblem(mapped);
 assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter.issues));if(adapter.status!=='SUPPORTED')throw Error('unsupported');
 const problem=structuredClone(adapter.problem);
 return {input,mapped,profile,templates,problem};
}
function execute(problem:PlannerNextProblem){return executeAssistedPlanning(buildAssistedProblem(problem,createPlanningScope({kind:'DAY',value:'v2'},{},problem.tasks.map(t=>t.id)),[]));}
const fixed=(problem:PlannerNextProblem,starts:number[])=>problem.tasks.forEach((task,index)=>task.availability=[{start:starts[index],end:starts[index]+task.duration}]);

test('REQUIRED grouping + OFF continuity admits internal wait without reentry',()=>{
 const {problem}=fixture();fixed(problem,[540,560,580]);
 const result=execute(problem);assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
 assert.equal(result.evidence.selectedSetupPreparations?.length,1);
 assert.equal(validatePlan(problem,[...result.proposal!],[...result.evidence.selectedSetupPreparations!]).hardValid,true);
 assert.deepEqual(result.proposal,execute(problem).proposal);
});
test('REQUIRED continuity rejects unauthorized wait and accepts an explicitly authorized pause',()=>{
 const {problem}=fixture('REQUIRED','REQUIRED');fixed(problem,[540,560,580]);
 const witness=problem.tasks.map((task,index)=>({...task,start:[540,560,580][index],end:[550,570,590][index]}));
 const p={id:'setup-preparation:space:303:setup-family:303:2:1',kind:'setup-preparation' as const,spaceId:'space:303',setupFamilyId:'setup-family:303:2',entryIndex:1,duration:10,start:570,end:580};
 assert.equal(validatePlan(problem,witness,[p]).secondaryContinuityViolationCount,1);
 problem.operationalMealPolicies=[{id:'authorized-pause',window:{start:550,end:560},duration:10,resourceIds:[],spaceIds:['space:303']}];
 const meal={id:'authorized-pause',start:550,end:560,duration:10,resourceIds:[],spaceIds:['space:303']};
 assert.equal(validatePlan(problem,witness,[p],[],[],[],[],[],[meal]).hardValid,true);
 const result=execute(problem);assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
});
test('PREFERRED grouping permits ABA with a physical preparation on both transitions; REQUIRED forbids it',()=>{
 const {problem}=fixture('PREFERRED','OFF',[1,2,1]);fixed(problem,[540,560,580]);
 const result=execute(problem);assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
 const preparations=[...result.evidence.selectedSetupPreparations!];assert.equal(preparations.length,2);
 assert.equal(preparations.find(p=>p.setupFamilyId.endsWith(':1'))!.entryIndex,2);
 assert.equal(validatePlan(problem,[...result.proposal!],preparations).hardValid,true);
 const costs=assessSpacePolicies(problem,[...result.proposal!]);assert.equal(costs[0].changes,2);assert.equal(costs[0].reentries,1);assert.equal(costs[0].setupPenalty,3);
 problem.spaces.find(s=>s.setupPolicy)!.setupPolicy!.groupingPolicy='REQUIRED';problem.spaces.find(s=>s.setupPolicy)!.setupPolicy!.reentry='FORBIDDEN';
 assert.equal(validatePlan(problem,[...result.proposal!],preparations).setupViolationCount,1);
 assert.equal(execute(problem).evidence.completeForScope,false);
});
test('OFF grouping imposes no grouping cost or implicit preparation; PREFERRED continuity charges idle only',()=>{
 const {problem}=fixture('OFF','PREFERRED',[1,2,1]);fixed(problem,[540,560,580]);
 const result=execute(problem);assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
 assert.deepEqual(result.evidence.selectedSetupPreparations,[]);
 const a=assessSpacePolicies(problem,[...result.proposal!])[0];assert.equal(a.setupPenalty,0);assert.equal(a.continuityPenalty,20);
 const compact=result.proposal!.map((task,index)=>({...task,start:540+index*10,end:550+index*10}));
 assert.equal(assessSpacePolicies(problem,compact)[0].continuityPenalty,0);
 assert.equal(validatePlan(problem,[...result.proposal!],[]).hardValid,true);
});
test('heterogeneous durations, dependencies, windows and distinct identities remain reachable',()=>{
 const {problem}=fixture('REQUIRED','OFF',[1,1,2],[15,5,10]);
 // Only the short A can run first; its successor is the long A.
 fixed(problem,[550,540,575]);problem.tasks[0].dependencies=[problem.tasks[1].id];
 const result=execute(problem);assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
 assert.equal(result.proposal!.find(t=>t.id===problem.tasks[1].id)!.start,540);
 assert.equal(validatePlan(problem,[...result.proposal!],[...result.evidence.selectedSetupPreparations!]).hardValid,true);
});
test('preparations omitted, shortened, overlapping or forged are HARD irrespective of grouping preference',()=>{
 const {problem}=fixture('PREFERRED','OFF',[1,2,1]);fixed(problem,[540,560,580]);const result=execute(problem);
 const scheduled=[...result.proposal!],preps=[...result.evidence.selectedSetupPreparations!];
 for(const altered of [[],preps.slice(1),preps.map((p,i)=>i?{...p,duration:5}:p),preps.map((p,i)=>i?{...p,start:570,end:590}:p),preps.map(p=>({...p,entryIndex:99}))])assert.equal(validatePlan(problem,scheduled,altered).hardValid,false);
});
test('explicit adoption preserves historical setup contracts and fingerprints',()=>{
 const f=fixture();const legacy=structuredClone(f.profile);delete (legacy.configuration.setupFamilies as any).contractVersion;
 for(const p of legacy.configuration.setupFamilies.policies){delete (p as any).groupingPolicy;delete (p as any).continuityPolicy;}
 const a=adaptEngineInputToPlannerNextProblem(applyNewDayPlannerConfiguration(f.input,legacy,f.templates));assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')return;
 assert.equal(a.problem.spaces.find(s=>s.setupPolicy)!.secondaryContinuity,'REQUIRED');assert.equal(a.problem.spaces.find(s=>s.setupPolicy)!.setupPolicy!.contractVersion,undefined);
 assert.notEqual(a.problemFingerprint,adaptEngineInputToPlannerNextProblem(f.mapped).problemFingerprint);
 assert.deepEqual(preflight(f.problem),[]);
});

test('all nine policy combinations are representable independently',()=>{
 for(const grouping of ['OFF','PREFERRED','REQUIRED'] as const)for(const continuity of ['OFF','PREFERRED','REQUIRED'] as const){
  const {problem}=fixture(grouping,continuity);const result=execute(problem);
  assert.equal(result.evidence.completeForScope,true,`${grouping}/${continuity}: ${result.evidence.reasonCodes.join(',')}`);
  assert.equal(validatePlan(problem,[...result.proposal!],[...result.evidence.selectedSetupPreparations!]).hardValid,true);
 }
});
test('v2 macro Evidence identifies an analytic upper bound without claiming matching proof',()=>{
 const {problem}=fixture();
 const probe=probeExactSetupMacroDomain(problem,problem.tasks,[],[],[]);
 assert.equal(probe.domainExact,false);assert.equal(probe.domainMeasure,'independent-task-domain-product-upper-bound');
 assert.ok(probe.domainSize>0);assert.equal(probe.structuralCandidateCount,undefined);assert.equal(probe.matchingFeasibleCandidateCount,undefined);
 const result=execute(problem);assert.equal(result.evidence.completeForScope,true);
 assert.equal(result.evidence.standaloneDiagnostic?.macroSelectionSteps[0].candidates[0].domainExact,false);
});
test('PREFERRED grouping changes the selected identity order and exposes a real soft cost',()=>{
 const off=fixture('OFF','OFF',[1,2,1]).problem,preferred=fixture('PREFERRED','OFF',[1,2,1]).problem;
 for(const problem of [off,preferred])for(const participant of problem.participants)participant.availability=[problem.day];
 const a=execute(off),b=execute(preferred);assert.equal(a.evidence.completeForScope,true);assert.equal(b.evidence.completeForScope,true);
 assert.deepEqual(a.proposal!.map(task=>task.setupFamilyId),['setup-family:303:1','setup-family:303:2','setup-family:303:1']);
 assert.deepEqual(b.proposal!.map(task=>task.setupFamilyId),['setup-family:303:1','setup-family:303:1','setup-family:303:2']);
 assert.equal(b.evidence.spacePolicyCosts![0].setupPenalty,1);
 assert.equal(assessSpacePolicies(preferred,[...a.proposal!])[0].setupPenalty,3);
});
test('two spaces keep their own policies and respect a shared physical resource',()=>{
 const {problem}=fixture('REQUIRED','OFF');
 const other=structuredClone(problem.spaces.find(space=>space.setupPolicy)!);other.id='other';other.secondaryContinuity='REQUIRED';other.setupPolicy!.groupingPolicy='OFF';other.setupPolicy!.reentry='ALLOWED';delete other.setupPolicy!.preparationMinutesBetweenFamilies;
 problem.spaces.push(other);problem.resources=[{id:'shared',availability:[problem.day],presencePreference:'OFF'}];
 problem.tasks.forEach(task=>task.requiredResourceIds=['shared']);
 problem.tasks.push({...problem.tasks[0],id:'other-task',spaceId:'other',setupFamilyId:undefined,requiredResourceIds:['shared']});
 const result=execute(problem);assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
 const placed=[...result.proposal!];assert.equal(validatePlan(problem,placed,[...result.evidence.selectedSetupPreparations!]).hardValid,true);
 const otherPlaced=placed.find(task=>task.id==='other-task')!;
 assert.ok(placed.filter(task=>task.id!=='other-task').every(task=>task.end<=otherPlaced.start||otherPlaced.end<=task.start));
});
test('initial preparation is explicit and Stage replay preserves reentry preparation identities',()=>{
 const {problem}=fixture('PREFERRED','OFF',[1,2,1]);fixed(problem,[550,570,590]);
 problem.spaces.find(space=>space.setupPolicy)!.setupPolicy!.initialPreparationMinutes=5;
 const result=execute(problem);assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
 const preparations=[...result.evidence.selectedSetupPreparations!];assert.equal(preparations.length,3);
 assert.equal(preparations[0].duration,5);
 assert.doesNotThrow(()=>buildAssistedProblem(problem,createPlanningScope({kind:'DAY',value:'replay'},{},problem.tasks.map(t=>t.id)),[...result.proposal!],new Set(),[],preparations));
});

test('a fixed authorized pause may follow preparation without becoming idle time',()=>{
 const {problem}=fixture('REQUIRED','REQUIRED',[1,2]);fixed(problem,[540,570]);
 problem.operationalMealPolicies=[{id:'pause-after-preparation',window:{start:560,end:570},duration:10,resourceIds:[],spaceIds:['space:303']}];
 const result=execute(problem);assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
 assert.equal(result.evidence.selectedSetupPreparations![0].start,550);assert.equal(result.evidence.selectedSetupPreparations![0].end,560);
});
test('identity, resources and durations cannot be forged to satisfy a v2 setup placement',()=>{
 const {problem}=fixture();const result=execute(problem),tasks=[...result.proposal!],preparations=[...result.evidence.selectedSetupPreparations!];
 for(const patch of [{setupFamilyId:tasks[0].setupFamilyId?.endsWith(':2')?'setup-family:303:1':'setup-family:303:2'},{duration:5,end:tasks[0].start+5},{participantId:'participant:202'},{requiredResourceIds:['invented']}]){
  assert.equal(validatePlan(problem,tasks.map((task,index)=>index?task:{...task,...patch}) as ScheduledTask[],preparations).hardValid,false,JSON.stringify({patch,original:tasks[0]}));
 }
});

test('a different matching of the same geometry survives a future identity conflict',()=>{
 const {problem}=fixture('REQUIRED','OFF',[1,1]);
 problem.spaces.push({id:'future-space',availability:[problem.day]});
 const future={...problem.tasks[0],id:'future-work',spaceId:'future-space',duration:5,setupFamilyId:undefined};
 const seen:string[]=[],ledger=createExactSearchLedger(problem.budget.maxBranchExpansions);
 let chosen:ScheduledTask[]|undefined;
 const result=generateExactSetupBlockCandidates(problem,problem.tasks,[],[],[],ledger,false,candidate=>{
  seen.push(candidate.tasks.map(task=>task.id).join(','));
  const start=candidate.tasks[0].start;
  // The actual shared placement authority represents the downstream obligation.
  if(!canPlaceTask(problem,future,start,candidate.tasks))return false;
  chosen=candidate.tasks;return true;
 });
 assert.equal(result.outcome,'COMPLETE');assert.ok(chosen);assert.equal(chosen[0].id,'task:402');
 assert.ok(seen.includes('task:401,task:402'));assert.ok(seen.includes('task:402,task:401'));
});

test('continuity is usable with grouping OFF and no catalogue family at all',()=>{
 const f=fixture('OFF','REQUIRED');f.profile.configuration.setupFamilies.families=[];f.profile.configuration.setupFamilies.policies[0].familyIds=[];
 const templates=f.templates.map(t=>normalizeTaskTemplateCatalogEntry({...t,setupId:null}));
 const adapter=adaptEngineInputToPlannerNextProblem(applyNewDayPlannerConfiguration(f.input,f.profile,templates));assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')return;
 assert.ok(adapter.problem.tasks.every(task=>task.setupFamilyId===undefined));
 const result=execute(adapter.problem);assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));assert.deepEqual(result.evidence.selectedSetupPreparations,[]);
});

test('an unused configured room does not impose its policies on the active room',()=>{
 const f=fixture();f.profile.configuration.setupFamilies.policies.push({...f.profile.configuration.setupFamilies.policies[0],spaceId:302,continuityPolicy:'REQUIRED'});
 const mapped=applyNewDayPlannerConfiguration(f.input,f.profile,f.templates);
 assert.equal(mapped.setupPolicies!.length,1);assert.equal(mapped.setupPolicies![0].spaceId,303);
 const adapter=adaptEngineInputToPlannerNextProblem(mapped);assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter.issues));
});
