import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {buildA2ImportRows} from './a2ImportRows';
import {a2ImportStorageFixture,importedTaskSnapshotSource} from './a2ImportStorageFixture';
import {buildEngineInput} from '../../engine/buildInput';
import {runA2Assist8Evidence} from '../../server/benchmarks/runA2Assist8Evidence';
import {buildAssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';

const directory=process.argv[2]??'work/a2-import-validation';mkdirSync(directory,{recursive:true});
const rows=buildA2ImportRows('2026-10-30');
const reports=[];
const firstStageOnly=process.argv.includes('--first-stage');
for(let n=1;n<=(firstStageOnly?1:2);n++){
 const fixture=a2ImportStorageFixture(rows),rebuild=()=>buildEngineInput(rows.input.planId,fixture.storage),input=await rebuild();
 const initialSnapshot=buildAssistedPlanningSnapshotV1(importedTaskSnapshotSource(fixture.tables.daily_tasks));
 const cpuBefore=process.cpuUsage(),wallBefore=performance.now();
 const r=await runA2Assist8Evidence({inputFromPersistence:input,rebuildInputFromPersistence:rebuild,initialSnapshot,stopAfterIterationCount:firstStageOnly?1:undefined,reportIterationDurations:true,onAcceptedStage:snapshot=>{
  for(const task of snapshot.tasks){const row=fixture.tables.daily_tasks.find((r:any)=>r.id===task.taskId);Object.assign(row,{start_planned:task.startPlanned,end_planned:task.endPlanned,zone_id:task.zoneId,space_id:task.spaceId,location_label:task.locationLabel,duration_override:task.durationOverride,cameras_override:task.camerasOverride});if(task.assignedResourceIds)row.assigned_resource_ids=[...task.assignedResourceIds];}
 }});
 writeFileSync(`${directory}/run${n}.json`,JSON.stringify(r));
 const cpu=process.cpuUsage(cpuBefore);writeFileSync(`${directory}/timing${n}.json`,JSON.stringify({wallMs:performance.now()-wallBefore,cpuMs:(cpu.user+cpu.system)/1000,s1Ms:r.iterations[0]!.durationMs,gate:r.iterations[0]!.durationMs<=120_000?'PASS':'FAIL'}));
 if(firstStageOnly){assert.equal(r.completedObligationCount,19);assert.equal(r.stageCount,1);assert.ok(r.iterations[0]!.durationMs<=120_000);break;}
 assert.equal(r.status,'PASS');assert.equal(r.completedObligationCount,266);assert.equal(r.stageCount,10);assert.ok(r.iterations[0]!.durationMs<=120_000);
 reports.push({run:n,status:r.status,coverage:r.completedObligationCount,stages:r.stageCount,s1Ms:r.iterations[0]!.durationMs,totalMs:r.iterations.reduce((n,s)=>n+s.durationMs,0),fingerprint:r.deterministicFingerprint});
}
if(firstStageOnly)process.exit(0);
assert.equal(reports[0]!.fingerprint,reports[1]!.fingerprint);
writeFileSync(`${directory}/summary.json`,JSON.stringify({mode:'REAL_INPUT_BUILDER_REBUILT_AFTER_EACH_ACCEPTANCE_IN_MEMORY_RPC',writes:0,reports},null,2));
console.log(JSON.stringify(reports));
