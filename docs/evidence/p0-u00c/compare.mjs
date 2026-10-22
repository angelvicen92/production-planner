import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [mainDirectory,standaloneDirectory,output]=process.argv.slice(2);
const read=(root,name)=>JSON.parse(readFileSync(resolve(root,name),'utf8'));
const profiles=[{profile:'U00a',baseline:'docs/evidence/p0-u00b/u00a',candidate:mainDirectory},
 {profile:'U00b',baseline:'docs/evidence/p0-u00b/native',candidate:standaloneDirectory}];
const days=profiles.flatMap(({profile,baseline,candidate})=>['first','second'].map(label=>{
 const before=read(baseline,`${label}-preflight.json`),after=read(candidate,`${label}-preflight.json`);
 assert.equal(after.status,'SUPPORTED');assert.deepEqual(after.problem,before.problem);
 assert.equal(after.problemFingerprint,before.problemFingerprint);assert.equal(after.identityMapFingerprint,before.identityMapFingerprint);
 assert.deepEqual(read(candidate,`${label}-stage.json`).activeStage.snapshotJson,read(baseline,`${label}-stage.json`).activeStage.snapshotJson);
 const validation=read(candidate,`${label}-validation.json`);assert.equal(validation.hardCount,0);assert.equal(validation.requiredCount,0);
 return {profile,label,obligations:after.problem.tasks.length,problemFingerprint:after.problemFingerprint,problemIdentical:true,placementsIdentical:true,hardCount:0,requiredCount:0};
}));
writeFileSync(output,JSON.stringify({status:'PASS',base:'3bec719512ed4c30543460cb590c074c093bef91',days},null,2));
console.log(JSON.stringify({status:'PASS',obligations:days.map(day=>day.obligations)}));
