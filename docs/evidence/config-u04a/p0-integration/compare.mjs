import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=resolve(process.argv[2]??'/tmp/u04a-p0');
const base='7872b5817211dcddeafecf8c9e1a573cdf48a8bd';
const read=(name)=>JSON.parse(readFileSync(resolve(root,name),'utf8'));
const stable=run=>({...run,iterations:run.iterations.map(({durationMs,...stage})=>stage)});
const before=read('baseline/run.json'),after=read('candidate/run.json'),repeat=read('repeat/run.json');
assert.deepEqual(stable(after),stable(before));assert.deepEqual(stable(after),stable(repeat));
for(const name of ['snapshots.json','runtime.json']) {
  assert.deepEqual(read(`baseline/${name}`),read(`candidate/${name}`));
  assert.deepEqual(read(`candidate/${name}`),read(`repeat/${name}`));
}
const certificates=read('a2-audit/a2-report.json');
assert.equal(certificates.status,'PASS');assert.equal(certificates.snapshotsUnchanged,true);
for(const name of ['main-new-days','final-new-days','native-composition','native-continuity'])
  assert.equal(read(`${name}/integration.json`).status,'PASS',name);
const mainDays=read('main-new-days/journey.json'),finalDays=read('final-new-days/journey.json');
const days=['first','second'].map((label,index)=>{
  const main=mainDays.days[index],candidate=finalDays.days[index];
  for(const key of ['obligations','completed','stages','problemFingerprint','branches','hardCount','requiredCount'])
    assert.deepEqual(candidate[key],main[key],`${label}.${key}`);
  const inputMain=read(`main-new-days/${label}-input.json`),inputFinal=read(`final-new-days/${label}-input.json`);
  assert.equal(inputMain.itinerantCompositionSnapshot,undefined);
  assert.deepEqual(inputFinal.itinerantCompositionSnapshot,{contractVersion:1,units:[]});
  assert.deepEqual(inputMain.itinerantTeamAvailability??[],[]);assert.deepEqual(inputFinal.itinerantTeamAvailability,[]);
  delete inputMain.itinerantTeamAvailability;delete inputFinal.itinerantTeamAvailability;delete inputFinal.itinerantCompositionSnapshot;
  assert.deepEqual(inputFinal,inputMain,`${label}: all other effective input fields remain exact`);
  const adapterMain=read(`main-new-days/${label}-preflight.json`),adapterFinal=read(`final-new-days/${label}-preflight.json`);
  assert.deepEqual(adapterFinal.problem,adapterMain.problem);assert.deepEqual(adapterFinal.reasonCodes,adapterMain.reasonCodes);
  const stageMain=read(`main-new-days/${label}-stage.json`).activeStage,stageFinal=read(`final-new-days/${label}-stage.json`).activeStage;
  assert.deepEqual(stageFinal.snapshotJson,stageMain.snapshotJson);assert.equal(stageFinal.snapshotFingerprint,stageMain.snapshotFingerprint);
  return {label,...candidate,stageFingerprint:stageFinal.snapshotFingerprint,
    inputDelta:['itinerantCompositionSnapshot={contractVersion:1,units:[]}','itinerantTeamAvailability=[]'],
    adaptedProblemUnchanged:true,stageSnapshotUnchanged:true};
});
const composition=read('native-composition/itinerant-composition.json');
assert.equal(composition.combinedTemplateEdit.role.kind,'technical');
assert.deepEqual(composition.concurrentSaves.slice().sort(),[200,409]);
assert.deepEqual(composition.historicalAfter,composition.historicalBefore);
const migrations=Object.fromEntries([
  ['104_operation_continuity.sql',base,'104_operation_continuity.sql'],
  ['105_new_day_planner_configuration.sql',base,'105_new_day_planner_configuration.sql'],
  ['106_itinerant_physical_composition.sql','33459de33aa0c54b0c29534132c94ee51784d238','105_itinerant_physical_composition.sql'],
].map(([name,ref,oldName])=>{
  const bytes=readFileSync(`supabase/migrations/${name}`);
  assert.deepEqual(bytes,execFileSync('git',['show',`${ref}:supabase/migrations/${oldName}`]));
  return [name,{sha256:createHash('sha256').update(bytes).digest('hex'),bytesPreserved:true,source:ref,previousName:oldName}];
}));
const protectedPaths=['engine/planner-next/placement.ts','engine/planner-next/validate.ts','engine/planner-next/exactMainAndFeederCore.ts',
  'engine/planner-next/exactItinerantPlan.ts','engine/planner-next/futureFeasibility.ts',
  'engine/planner-next/benchmarks/canonicalFullA2EngineInput.ts','supabase/migrations/088_plan_planner_next_configuration.sql'];
assert.equal(execFileSync('git',['diff',base,'--',...protectedPaths],{encoding:'utf8'}),'');
const report={status:'PASS',base,runtime:read('candidate/runtime.json'),
  a2:{completed:after.completedObligationCount,stages:after.stageCount,fingerprint:after.deterministicFingerprint,
    branches:certificates.after.branches,presenceMinutes:certificates.after.totalPresenceMinutes,
    entireReportUnchangedExcludingDurations:true,allSnapshotsUnchanged:true,allCertificatesRevalidated:true,deterministic:true},
  days,migrations,protectedPaths,physicalMatchingAndCas:'PASS',combinedTemplateSave:'PASS',remoteWrites:0};
writeFileSync(resolve(root,'comparison.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,a2:report.a2,days:days.map(day=>({label:day.label,completed:day.completed,problemFingerprint:day.problemFingerprint}))}));
