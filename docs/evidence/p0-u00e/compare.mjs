import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [directory]=process.argv.slice(2);
const read=(folder,name)=>JSON.parse(readFileSync(resolve(directory,folder,name),'utf8'));
const runs=['a2-base','a2-candidate','a2-repeat'].map(label=>read(label,'run.json'));
const withoutTimes=run=>({...run,iterations:run.iterations.map(({durationMs:_,...iteration})=>iteration)});
assert.deepEqual(withoutTimes(runs[0]),withoutTimes(runs[1]));assert.deepEqual(withoutTimes(runs[1]),withoutTimes(runs[2]));
const snapshots=['a2-base','a2-candidate','a2-repeat'].map(label=>read(label,'snapshots.json'));
assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
for(const label of ['a2-candidate','a2-repeat'])assert.deepEqual(read('a2-base','runtime.json'),read(label,'runtime.json'));
const itinerant=['technical','auxiliary'].map(label=>{
  const before=JSON.parse(readFileSync(`docs/evidence/p0-u00d/native/${label}-preflight.json`,'utf8')),after=read('regression-itinerant',`${label}-preflight.json`);
  assert.equal(after.status,'SUPPORTED');assert.deepEqual(after.problem,before.problem);assert.equal(after.problemFingerprint,before.problemFingerprint);assert.equal(after.identityMapFingerprint,before.identityMapFingerprint);
  const stage=read('regression-itinerant',`${label}-stage.json`);
  const prior=JSON.parse(readFileSync(`docs/evidence/p0-u00d/native/${label}-stage.json`,'utf8'));
  assert.deepEqual(stage.activeStage.snapshotJson,prior.activeStage.snapshotJson);
  return {label,obligations:after.problem.tasks.length,problemFingerprint:after.problemFingerprint,identityMapFingerprint:after.identityMapFingerprint,stageIdentical:true};
});
const result={status:'PASS',authorizedBase:'037500b139d43bf5f82c1087db4fe6ed90fc8074',
  a2:{fullReportsIdenticalExceptDurations:true,allStagesIdentical:true,obligations:runs[1].completedObligationCount,stages:runs[1].stageCount,
    branches:runs[1].iterations.reduce((sum,stage)=>sum+stage.branchesExplored,0),fingerprint:runs[1].deterministicFingerprint},
  u00d:itinerant};
writeFileSync(resolve(directory,'comparison.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
