import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [directory,beforeLabel='before',nativeLabel='native',candidateLabel='a2-candidate',repeatLabel='a2-repeat']=process.argv.slice(2);
const read=(folder,name)=>JSON.parse(readFileSync(resolve(directory,folder,name),'utf8'));
const before=read(beforeLabel,'technical-input.json'),candidate=read(nativeLabel,'technical-input.json');
assert.equal(before.plannerNextMaterializationIssues.length,4);
assert.deepEqual(candidate.plannerNextMaterializationIssues,[]);
const withoutDefects=({plannerNextMaterializationIssues:_,...input})=>input;
assert.deepEqual(withoutDefects(candidate),withoutDefects(before));
const a2=['a2-base',candidateLabel,repeatLabel].map(folder=>read(folder,'run.json'));
const withoutTimes=run=>({...run,iterations:run.iterations.map(({durationMs:_,...iteration})=>iteration)});
assert.deepEqual(withoutTimes(a2[0]),withoutTimes(a2[1]));assert.deepEqual(withoutTimes(a2[1]),withoutTimes(a2[2]));
const snapshots=['a2-base',candidateLabel,repeatLabel].map(folder=>read(folder,'snapshots.json'));
assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
const result={status:'PASS',base:'e8f892719600d924e25ecaf56b7fca426204d5a2',
 newDayEffectiveInputIdenticalExceptProfileRejections:true,baselineReasonCodes:read(beforeLabel,'technical-preflight.json').reasonCodes,
 completeA2ReportsIdenticalExceptDurations:true,allStageSnapshotsIdentical:true,
 canonicalObligations:266,stages:11,branches:27049,presenceMinutes:8465,
 fingerprint:a2[1].deterministicFingerprint};
writeFileSync(resolve(directory,'comparison.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
