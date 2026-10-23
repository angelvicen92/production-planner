import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]);
const read=(directory,file)=>JSON.parse(readFileSync(resolve(directory,file),'utf8'));
const baseline='docs/evidence/p0-u00e/v2';
const cases=[['main','regression-main',['first','second']],['standalone','regression-standalone',['first','second']],
 ['itinerant','regression-itinerant',['technical','auxiliary']]];
const native=cases.map(([name,prior,labels])=>{
 const directory=resolve(root,`regression-${name}`),before=resolve(baseline,prior);
 assert.equal(read(directory,'integration.json').status,'PASS');
 return {scenario:name,days:labels.map(label=>{
  const a=read(before,`${label}-preflight.json`),b=read(directory,`${label}-preflight.json`);
  assert.equal(b.status,'SUPPORTED');assert.deepEqual(b.problem,a.problem);assert.equal(b.problemFingerprint,a.problemFingerprint);
  assert.equal(b.identityMapFingerprint,a.identityMapFingerprint);
  const old=read(before,`${label}-stage.json`),current=read(directory,`${label}-stage.json`);
  assert.deepEqual(current.activeStage.snapshotJson,old.activeStage.snapshotJson);
  assert.equal(current.activeStage.snapshotFingerprint,old.activeStage.snapshotFingerprint);
  return {label,obligations:b.problem.tasks.length,problemFingerprint:b.problemFingerprint,stageFingerprint:current.activeStage.snapshotFingerprint,identical:true};
 })};
});
// UI-generated setup identities are intentionally random between fresh days.
// Compare the same frozen authorities in both code versions, without renaming
// IDs or pretending that separately created days have identical fingerprints.
const u00eBase=read(root,'u00e-base-replay.json'),u00eCandidate=read(root,'u00e-candidate-replay.json');
assert.equal(u00eBase.status,'PASS');assert.deepEqual(u00eCandidate,u00eBase);
assert.equal(read(resolve(root,'regression-setup'),'integration.json').status,'PASS');
const u00e={status:'PASS',method:'Exact same UI-created frozen EngineInput replayed in archived base and candidate; no identity normalization',
 historicalDifference:'Independent fresh UI runs use crypto-generated setup-family IDs; their historical fingerprints must not be declared identical.',
 days:u00eCandidate.days.map(day=>({label:day.label,obligations:day.proposal.length,problemFingerprint:day.problemFingerprint,
  stageFingerprint:day.stageFingerprint,proposalFingerprint:day.proposalFingerprint,work:day.work,identical:true}))};
const additions=[['main','main'],['standalone','technical']].map(([scenario,label])=>{
 const a=read(resolve(baseline,`regression-${scenario}`),`${label}-additions-rebootstrap.json`),b=read(resolve(root,`regression-${scenario}`),`${label}-additions-rebootstrap.json`);
 for(const phase of ['before','after'])assert.deepEqual(b[phase].activeStage.snapshotJson,a[phase].activeStage.snapshotJson);
 assert.deepEqual(b.historical.snapshot_json,a.historical.snapshot_json);
 return {scenario,historicalStagePreserved:true,rebootstrapIdentical:true};
});
const labels=['a2-base','a2-candidate','a2-repeat'];
const runs=labels.map(label=>read(resolve(root,label),'run.json'));
const withoutTimes=run=>({...run,iterations:run.iterations.map(({durationMs,...iteration})=>iteration)});
assert.deepEqual(withoutTimes(runs[0]),withoutTimes(runs[1]));assert.deepEqual(withoutTimes(runs[1]),withoutTimes(runs[2]));
const snapshots=labels.map(label=>read(resolve(root,label),'snapshots.json'));
assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
for(const label of labels.slice(1))assert.deepEqual(read(resolve(root,labels[0]),'runtime.json'),read(resolve(root,label),'runtime.json'));
for(const run of runs){assert.equal(run.status,'PASS');assert.equal(run.completedObligationCount,266);assert.equal(run.stageCount,11);}
const times=runs.map(run=>run.iterations.reduce((sum,stage)=>sum+stage.durationMs,0));
const report={status:'PASS',authorizedBase:'793d48733c4565cc49f434f86179b2016025fdf0',native,additions,u00e,
 a2:{obligations:266,stages:11,fullReportsIdenticalExceptDurations:true,allSnapshotsIdentical:true,
 fingerprint:runs[1].deterministicFingerprint,branches:runs.map(run=>run.iterations.reduce((sum,stage)=>sum+stage.branchesExplored,0)),
 durationMs:Object.fromEntries(labels.map((label,index)=>[label,times[index]])),candidateToBase:times[1]/times[0],repeatToBase:times[2]/times[0]}};
writeFileSync(resolve(root,'regression-comparison.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
