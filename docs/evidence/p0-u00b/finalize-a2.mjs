import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const path=process.argv[2],report=JSON.parse(readFileSync(path,'utf8'));
assert.equal(report.status,'PASS');assert.equal(report.snapshotsUnchanged,true);assert.equal(report.deterministic,true);
for(const metrics of [report.before,report.after]){
  assert.equal(metrics.branches,27049);assert.equal(metrics.totalPresenceMinutes,8465);
  assert.equal(metrics.fingerprint,'2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d');
}
const stable=({durationMs,...rest})=>rest;
assert.deepEqual(report.stagesBefore.map(stable),report.stagesAfter.map(stable));
assert.deepEqual(stable(report.before),stable(report.after));
report.base='be5d817c23aec2cf69029bd675edeed8c7d5c0d6';
report.observer='docs/evidence/config-u06c/verify.ts (assertions unchanged), plus p0-u00b/finalize-a2.mjs';
writeFileSync(path,JSON.stringify(report,null,2));
console.log(JSON.stringify({status:'PASS',base:report.base,snapshotsUnchanged:true,branches:27049,presenceMinutes:8465}));
