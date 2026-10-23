import assert from 'node:assert/strict';
import test from 'node:test';
import {applyNewDayPlannerConfiguration} from '../../../server/newDayPlannerConfiguration';
import {normalizeTaskTemplateCatalogEntry,taskTemplateSnapshotToPersistenceRow,projectTaskTemplateSnapshotRow} from '../../../server/taskTemplateSnapshot';
import {newDayPlannerConfigurationSchema} from '../../../shared/newDayPlannerConfiguration';
import {createSupportedEngineInputAdapterFixture} from './engineInputAdapter.fixture';
import {adaptEngineInputToPlannerNextProblem} from './engineInputAdapter';
import {createPlanningScope,buildAssistedProblem,executeAssistedPlanning} from '../assistedPlanning';
import {setupFamilySequence,hasSetupReentry} from '../setupGrouping';
import {validatePlan} from '../validate';
import {projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';

function fixture(standalone=true,explicit=false){
  const input=createSupportedEngineInputAdapterFixture();
  input.defaultParticipantTransitionMinutes=0;input.locks=[];
  input.tasks=standalone?[]:input.tasks.filter(t=>t.plannerNextKind!=='technical');
  input.tasks.push(...[0,1,2,3].map(index=>({id:301+index,planId:input.planId,templateId:index<2?7001:7002,status:'pending' as const,
    durationOverrideMin:10,spaceId:303,zoneId:403,contestantId:201+(index%2),plannerNextKind:'auxiliary' as const})));
  const templates=[...new Map(input.tasks.map(task=>[task.templateId,normalizeTaskTemplateCatalogEntry({id:task.templateId,name:`Editable label ${task.templateId}`,defaultDuration:10,defaultCameras:0,
    requiresCoach:task.plannerNextKind==='main'||task.plannerNextKind==='vocal',setupId:task.id>=301?(task.templateId===7001?41:52):null,
    rulesJson:{plannerNextOperation:{contractVersion:1,kind:task.plannerNextKind}},
    dependsOnTemplateIds:(task.dependsOnTaskIds??[]).map(id=>input.tasks.find(t=>t.id===id)!.templateId),
  })])).values()];
  const configuration={contractVersion:1,scenario:standalone?'STANDALONE_ONLY':'MAIN_WITH_VOCAL_FEEDER',transport:'NONE',setup:'FAMILIES',meals:'DAY_CONFIGURATION',
    searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10000},timeGridMinutes:5,resourceTransitionMinutes:0,
    ...(standalone?{}:{mainFlow:{...input.plannerNext!.mainFlow!}}),
    setupFamilies:{families:[{id:41,name:'A'},{id:52,name:'B'}],policies:[{spaceId:303,familyIds:[41,52],oneBlockPerFamily:true,orderConstraint:explicit?'EXPLICIT':'UNSPECIFIED',
      ...(explicit?{familyOrder:[52,41]}:{}),reentry:'FORBIDDEN',preparationMinutesBetweenFamilies:10}]}};
  return {input,templates,profile:{contractVersion:1,sourceRevision:4,configuration}};
}
for(const standalone of [true,false])for(const explicit of [true,false])test(`new day ${standalone?'STANDALONE':'MAIN'} uses existing setup blocks with ${explicit?'explicit':'flexible'} order`,()=>{
  const f=fixture(standalone,explicit),original=structuredClone(f.input);
  const input=applyNewDayPlannerConfiguration(f.input,f.profile,f.templates);
  assert.deepEqual(input.plannerNextMaterializationIssues,[]);assert.deepEqual(f.input,original);
  assert.deepEqual(input.setupPolicies![0].families,['41','52']);
  assert.deepEqual(input.tasks.filter(t=>t.id>=301).map(t=>t.setupFamilyId),['41','41','52','52']);
  const adapter=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter.issues));if(adapter.status!=='SUPPORTED')return;
  const execute=()=>executeAssistedPlanning(buildAssistedProblem(adapter.problem,createPlanningScope({kind:'DAY',value:'test'},{},adapter.problem.tasks.map(t=>t.id)),[]));
  const result=execute();assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
  assert.equal(validatePlan(adapter.problem,[...result.proposal!],[...(result.evidence.selectedSetupPreparations??[])]).hardValid,true);
  const tasks=[...result.proposal!].filter(t=>t.setupFamilyId);
  assert.equal(hasSetupReentry(tasks),false);assert.equal(setupFamilySequence(tasks).length,2);
  assert.equal(result.evidence.selectedSetupPreparations!.length,1);assert.equal(result.evidence.selectedSetupPreparations![0].duration,10);
  if(explicit)assert.deepEqual(setupFamilySequence(tasks),['setup-family:303:52','setup-family:303:41']);
  assert.deepEqual(execute().proposal,result.proposal);
  assert.equal(validatePlan(adapter.problem,[...result.proposal!],[]).hardValid,false);
});

test('unknown/incomplete policies and roles fail without silently materializing setup',()=>{
  const f=fixture();
  for(const patch of [{setupId:999},{plannerNextOperation:{contractVersion:1 as const,kind:'technical' as const}},{plannerNextOperation:{contractVersion:1 as const,kind:'main' as const}}]){
    const templates=f.templates.map(t=>t.setupId===41?{...t,...patch}:t);
    const input=applyNewDayPlannerConfiguration(f.input,f.profile,templates);
    assert.ok(input.plannerNextMaterializationIssues!.some(i=>i.code==='UNSUPPORTED_SETUP_MAPPING'));
    assert.equal(input.tasks.find(t=>t.id===301)!.setupFamilyId,undefined);
  }
  for(const patch of [{jointGroupId:'joint'},{blocksSpace:false},{agendaScope:'ITINERANT_UNIT' as const}]){
    const input=structuredClone(f.input);Object.assign(input.tasks[0],patch);
    assert.ok(applyNewDayPlannerConfiguration(input,f.profile,f.templates).plannerNextMaterializationIssues!.some(i=>i.code==='UNSUPPORTED_SETUP_MAPPING'));
  }
  const without=f.templates.map(t=>({...t,setupId:null}));
  assert.ok(applyNewDayPlannerConfiguration(f.input,f.profile,without).plannerNextMaterializationIssues!.some(i=>i.code==='UNSUPPORTED_SETUP_MAPPING'));
});

test('contract rejects missing references, invalid order, duplicate IDs, zero/off-grid preparation and incompatible search',()=>{
  const {configuration}=fixture().profile;
  const invalid=[{...configuration,setupFamilies:undefined},{...configuration,setup:'NONE'},
    {...configuration,searchPolicy:'COMPATIBILITY_PRESERVING'},
    ...[{familyIds:[999]},{familyIds:[41,41]},{orderConstraint:'EXPLICIT',familyOrder:[41]},
      {familyOrder:[41,52]},{preparationMinutesBetweenFamilies:0},{preparationMinutesBetweenFamilies:7}].map(patch=>({...configuration,setupFamilies:{...configuration.setupFamilies,policies:[{...configuration.setupFamilies.policies[0],...patch}]}})),
    {...configuration,setupFamilies:{...configuration.setupFamilies,families:[{id:41,name:'A'},{id:41,name:'Another'}]}},
  ];
  assert.ok(newDayPlannerConfigurationSchema.safeParse(configuration).success);
  for(const value of invalid)assert.equal(newDayPlannerConfigurationSchema.safeParse(value).success,false,JSON.stringify(value));
});

test('frozen references survive persistence, renaming and revision identity; NONE retains its original shape',()=>{
  const f=fixture(),template=f.templates[0];
  const roundTrip=projectTaskTemplateSnapshotRow({id:100,...taskTemplateSnapshotToPersistenceRow(8,template)});
  assert.equal(roundTrip.setupId,template.setupId);assert.equal(roundTrip.sourceFingerprint,template.sourceFingerprint);
  const a=applyNewDayPlannerConfiguration(f.input,f.profile,f.templates);
  const renamed=structuredClone(f.profile);renamed.configuration.setupFamilies.families[0].name='Renamed';
  assert.deepEqual(applyNewDayPlannerConfiguration(f.input,renamed,f.templates),a);
  const changed=structuredClone(f.profile);changed.configuration.setupFamilies.policies[0].preparationMinutesBetweenFamilies=15;
  assert.notDeepEqual(projectEffectiveAuthoritiesFromEngineInputV1(a),projectEffectiveAuthoritiesFromEngineInputV1(applyNewDayPlannerConfiguration(f.input,changed,f.templates)));
  const {setupFamilies:_,...configuration}=f.profile.configuration;
  const none=applyNewDayPlannerConfiguration(f.input,{...f.profile,configuration:{...configuration,setup:'NONE'}},f.templates.map(t=>({...t,setupId:null})));
  assert.equal('setupPolicies' in none,false);assert.ok(none.tasks.every(t=>!('setupFamilyId' in t)));
});

test('permitted inactive families do not create fictitious entries or initial preparations',()=>{
  const f=fixture(true,true);f.input.tasks=f.input.tasks.filter(task=>task.templateId===7001);
  const input=applyNewDayPlannerConfiguration(f.input,f.profile,f.templates);
  assert.deepEqual(input.setupPolicies![0].families,['41']);assert.deepEqual(input.setupPolicies![0].familyOrder,['41']);
  const adapter=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')return;
  const result=executeAssistedPlanning(buildAssistedProblem(adapter.problem,createPlanningScope({kind:'DAY',value:'inactive'},{},adapter.problem.tasks.map(t=>t.id)),[]));
  assert.equal(result.evidence.completeForScope,true);assert.deepEqual(result.evidence.selectedSetupPreparations,[]);
  assert.equal(validatePlan(adapter.problem,[...result.proposal!],[]).hardValid,true);
});

test('a wait inside one setup family is not reentry or a temporal continuity requirement',()=>{
  const f=fixture();const profile={...f.profile,configuration:{...f.profile.configuration,setupFamilies:{...f.profile.configuration.setupFamilies,contractVersion:2,policies:f.profile.configuration.setupFamilies.policies.map(policy=>({...policy,continuityPolicy:'OFF',groupingPolicy:'REQUIRED'}))}}};
  const input=applyNewDayPlannerConfiguration(f.input,profile,f.templates);
  const adapter=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')return;
  const ordered=[...adapter.problem.tasks].sort((a,b)=>a.id.localeCompare(b.id));
  const scheduled=ordered.map((task,index)=>({...task,start:[600,620,640,650][index],end:[610,630,650,660][index]}));
  const preparation={id:'setup-preparation:space:303:setup-family:303:52:1',kind:'setup-preparation' as const,spaceId:'space:303',setupFamilyId:'setup-family:303:52',entryIndex:1,duration:10,start:630,end:640};
  assert.equal(hasSetupReentry(scheduled),false);
  const validation=validatePlan(adapter.problem,scheduled,[preparation]);assert.equal(validation.hardValid,true,JSON.stringify(validation));
});
