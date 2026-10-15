/** Offline characterization only; imports pure adapters, never storage or Supabase. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
import { api } from '../../shared/routes';
import { apiRequiredRoles } from '../../server/apiAuthorization';
import { mapBasicToAdvanced, mapAdvancedToBasic } from '../../shared/optimizer';
import { createSupportedEngineInputAdapterFixture } from '../../engine/planner-next/integration/engineInputAdapter.fixture';
import { adaptEngineInputToPlannerNextProblem } from '../../engine/planner-next/integration/engineInputAdapter';
import { applyPlanPlannerNextConfiguration } from '../../server/planPlannerNextConfiguration';
import { transportGroupCandidates } from '../../engine/planner-next/transportGrouping';
import { configurabilityCounts, configurabilityRegistry } from '../../shared/configurability';
const values=[0,1,5,10];
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sweeps=[];
for(const key of ['mainZoneFinishEarly','mainZoneKeepBusy','contestantCompact','contestantStayInZone','contestantTotalSpan']){
 const results=values.map(value=>{
  const input=createSupportedEngineInputAdapterFixture();
  input.optimizerWeights={[key]:value};
  const before=hash(input),result=adaptEngineInputToPlannerNextProblem(input);
  assert.equal(hash(input),before);assert.equal(result.status,'SUPPORTED');
  return {value,status:result.status,problemFingerprint:result.problemFingerprint,sourceFingerprint:result.sourceFingerprint};
 });
 assert.equal(new Set(results.map(r=>r.problemFingerprint)).size,1);
 sweeps.push({key,conclusion:'Identical adapted problem for this fixture; no Next weight projection',results});
}
const neutralized=[];
for(const key of ['groupBySpaceTemplateMatch','groupBySpaceActive'] as const){
 const results=values.map(value=>{
  const input=createSupportedEngineInputAdapterFixture();input.optimizerWeights={[key]:value};
  const raw=adaptEngineInputToPlannerNextProblem(input);
  const config={contractVersion:1,mealTaskTemplateId:input.tasks[0].templateId,legacyGroupingMode:'DISABLED',plannerNext:input.plannerNext,
   taskOperations:input.tasks.map(t=>({taskId:t.id,plannerNextKind:t.plannerNextKind,operationalRole:'productive_task',dependsOnTaskIds:t.dependsOnTaskIds??[]})),
   anchoredAccompaniments:[],setupPolicies:[],roundSynchronizations:[],technicalChains:[],coachRouteTransitions:[],operationalMealPolicies:[],itinerantTeamAvailability:[],resourcePresenceConcentrationPolicies:{},arrivalMaximumGroupSize:3,departureMaximumGroupSize:3};
  const before=hash(input),effective=applyPlanPlannerNextConfiguration(input,config);
  assert.equal(hash(input),before);assert.equal(effective.optimizerWeights?.[key],0);
  const adapted=adaptEngineInputToPlannerNextProblem(effective);assert.equal(adapted.status,'SUPPORTED');
  if(value>0){assert.equal(raw.status,'UNSUPPORTED');if(raw.status==='UNSUPPORTED')assert.ok(raw.reasonCodes.includes('UNSUPPORTED_SETUP_MAPPING'));}
  return {value,rawStatus:raw.status,rawReasonCodes:raw.reasonCodes,effectiveWeight:effective.optimizerWeights?.[key],problemFingerprint:adapted.problemFingerprint};
 });
 assert.equal(new Set(results.map(r=>r.problemFingerprint)).size,1);neutralized.push({key,results});
}
const aliases=['optimizerMainZonePriorityLevel','optimizerContestantCompactLevel','optimizerContestantStayInZoneLevel','optimizerNearHardBreaksMax'] as const;
const aliasSweeps=aliases.map(key=>({key,results:values.map(value=>{const input=createSupportedEngineInputAdapterFixture();input[key]=value;const result=adaptEngineInputToPlannerNextProblem(input);assert.equal(result.status,'SUPPORTED');return {value,status:result.status,problemFingerprint:result.problemFingerprint};})}));
for(const sweep of aliasSweeps)assert.equal(new Set(sweep.results.map(r=>r.problemFingerprint)).size,1);
const groupingAlias=values.map(value=>{const input=createSupportedEngineInputAdapterFixture();input.optimizerGroupingLevel=value;const result=adaptEngineInputToPlannerNextProblem(input);return {value,status:result.status,reasonCodes:[...result.reasonCodes] as string[]};});
assert.equal(groupingAlias[0].status,'SUPPORTED');for(const row of groupingAlias.slice(1))assert.ok(row.reasonCodes.includes('UNSUPPORTED_SETUP_MAPPING'));
const fixture=createSupportedEngineInputAdapterFixture();
const transportSweep=values.map(groupingWeight=>({groupingWeight,candidateTaskIds:transportGroupCandidates(fixture.tasks.slice(0,4) as any,{taskIds:[],minimumGroupSize:1,maximumGroupSize:3,targetGroupSize:2,minGapMinutes:0,groupingWeight}).map(group=>group.map(t=>t.id))}));
assert.equal(new Set(transportSweep.map(r=>hash(r.candidateTaskIds))).size,1);
// Inspect the actual edit patch, rather than a duplicate hand-written payload.
const uiPath='client/src/pages/settings.tsx',source=readFileSync(uiPath,'utf8'),sf=ts.createSourceFile(uiPath,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const templateEditPatches:{line:number;keys:string[]}[]=[];
const visit=(n:ts.Node)=>{
 if(ts.isCallExpression(n)&&n.expression.getText(sf)==='updateTask.mutateAsync'){
  const obj=n.arguments[0];if(obj&&ts.isAsExpression(obj)&&ts.isObjectLiteralExpression(obj.expression)){
   const patch=obj.expression.properties.find(p=>p.name?.getText(sf)==='patch');
   if(patch&&ts.isPropertyAssignment(patch)&&ts.isObjectLiteralExpression(patch.initializer))templateEditPatches.push({line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,keys:patch.initializer.properties.map(p=>p.name?.getText(sf)??'spread')});
  }
 }ts.forEachChild(n,visit);
};visit(sf);assert.equal(templateEditPatches.length,1);
let createDefaultsSource='';
const findDefaults=(n:ts.Node)=>{if(ts.isVariableDeclaration(n)&&n.name.getText(sf).includes('formData')&&n.initializer&&ts.isCallExpression(n.initializer)){
 const arg=n.initializer.arguments[0];if(arg&&ts.isObjectLiteralExpression(arg))createDefaultsSource=arg.getText(sf);
}ts.forEachChild(n,findDefaults);};findDefaults(sf);assert.ok(createDefaultsSource);
const defaults=runInNewContext(`(${createDefaultsSource})`);
const createPayload={...defaults,name:'AUDIT_SYNTHETIC_NOT_SENT',abbrev:null};
const createCheck=api.taskTemplates.create.input.safeParse(createPayload);
const marginPatchCheck=api.taskTemplates.update.input.safeParse({participantMarginBeforeMinutes:0,participantMarginAfterMinutes:0});
assert.equal(createCheck.success,false);assert.equal(marginPatchCheck.success,false);
const result={contract:'CONFIGURATION-P1-CHARACTERIZATION-V1',base:'621303a3b3e1e3a2d745e35de9db0a0cbd28c7c9',networkCalls:0,writesToApplication:0,
 scales:values.map(advanced=>({advanced,basic:mapAdvancedToBasic(advanced),basicRoundTrip:mapBasicToAdvanced(mapAdvancedToBasic(advanced))})),
 basicAnchors:[0,1,2,3].map(basic=>({basic,advanced:mapBasicToAdvanced(basic)})),sweeps,neutralized,aliasSweeps,groupingAlias,transportSweep,
 templateEditPatches:templateEditPatches.map(p=>({...p,missingMarginFields:['participantMarginBeforeMinutes','participantMarginAfterMinutes'].filter(key=>!p.keys.includes(key))})),
 templateApiCharacterization:{createPayloadKeys:Object.keys(createPayload),createAccepted:createCheck.success,createIssues:createCheck.success?[]:createCheck.error.issues,marginPatchAccepted:marginPatchCheck.success,marginPatchIssues:marginPatchCheck.success?[]:marginPatchCheck.error.issues,storageContainsMarginNames:/participantMargin(Before|After)Minutes|participant_margin_(before|after)_minutes/.test(readFileSync('server/storage.ts','utf8'))},
 authorizationRouteCharacterization:[{method:'PATCH',path:'/task-templates/1'},{method:'PATCH',path:'/ta/1'},{method:'PATCH',path:'/control-room-settings'},{method:'PUT',path:'/vocal-coach-rules'}].map(({method,path})=>({method,path,requiredRoles:apiRequiredRoles(method,path)})),
 registry:{counts:configurabilityCounts,capabilities:configurabilityRegistry.map(c=>({id:c.capabilityId,status:c.status,blockers:c.blockers}))},
 limitations:['Synthetic differential adapter evidence does not certify every UI or every production day.','Transport experiment characterizes candidate generation, not an end-to-end transport UI journey.','No global capability status is changed.']};
const out=process.argv[2]??'work/configuration-audit/characterization.json';mkdirSync(out.slice(0,out.lastIndexOf('/')),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output:out,weightSweeps:sweeps.length+neutralized.length,aliasSweeps:aliasSweeps.length,templateEditPatches:result.templateEditPatches.map(p=>({line:p.line,missingMarginFields:p.missingMarginFields})),registryCounts:configurabilityCounts}));
