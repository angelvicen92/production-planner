import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [directory,output]=process.argv.slice(2);
const baseline='docs/evidence/config-u04a/p0-integration/new-days';
const read=(root,name)=>JSON.parse(readFileSync(resolve(root,name),'utf8'));
const days=['first','second'].map(label=>{
  const before=read(baseline,`${label}-preflight.json`),after=read(directory,`${label}-preflight.json`);
  assert.equal(after.status,'SUPPORTED');assert.deepEqual(after.problem,before.problem);
  assert.equal(after.problemFingerprint,before.problemFingerprint);
  assert.equal(after.identityMapFingerprint,before.identityMapFingerprint);
  const oldStage=read(baseline,`${label}-stage.json`),newStage=read(directory,`${label}-stage.json`);
  assert.deepEqual(newStage.activeStage.snapshotJson,oldStage.activeStage.snapshotJson);
  const validation=read(directory,`${label}-validation.json`);
  assert.equal(validation.hardCount,0);assert.equal(validation.requiredCount,0);
  return {label,obligations:after.problem.tasks.length,problemFingerprint:after.problemFingerprint,
    problemIdentical:true,placementsIdentical:true,hardCount:0,requiredCount:0};
});
writeFileSync(output,JSON.stringify({status:'PASS',base:'be5d817c23aec2cf69029bd675edeed8c7d5c0d6',baselineEvidence:baseline,days},null,2));
console.log(JSON.stringify(days));
