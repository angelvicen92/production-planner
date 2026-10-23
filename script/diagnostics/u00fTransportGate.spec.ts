import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {analyseU00fTransportGate} from './analyseU00fTransportGate';

const report=analyseU00fTransportGate(resolve('docs/evidence/p0-u00f/native'));
test('native original reproduces transport loss despite READY/SUPPORTED',()=>{
 assert.equal(report.original.transportLost,true);assert.equal(report.original.readiness.status,'READY');
});
test('native Main continuation preserves six accepted tasks and replays deterministically',()=>{
 assert.equal(report.main.obligations,8);assert.equal(report.main.protectedTaskCount,6);
 assert.equal(report.main.completeStageOrdinal,3);assert.equal(report.main.replayDeterministic,true);
 assert.equal(report.main.grouping.violationCount,0);
});
test('standalone is feasible but the existing supported search throws in its empty Main pipeline',()=>{
 assert.equal(report.standalone.preflight,'SUPPORTED');assert.equal(report.standalone.obligations,9);
 assert.equal(report.standalone.witnessValidation.hardValid,true);
 assert.equal(report.standalone.observedNativeStatus,'error');
 assert.match(report.standalone.observedNativeMessage,/styling/);
 assert.equal(report.standalone.offlineFailure?.name,'TypeError');
 assert.match(report.standalone.offlineFailure!.stack,/buildPipelineWitness/);
 assert.match(report.standalone.offlineFailure!.stack,/onHardValidCoreLeaf/);
});
test('cold fallback loses the transport authority and invents overlap on the same protected packet',()=>{
 assert.equal(report.coldReplay.architecture,null);
 assert.ok(report.coldReplay.observedReasons.includes('NO_COMPLETE_HARD_VALID_CORE'));
 assert.deepEqual(report.coldReplay.withoutTransportPolicy.reasonCodes,['OVERLAP_VIOLATION']);
 assert.deepEqual(report.coldReplay.withTransportPolicy.reasonCodes,[]);
});
test('diagnostic success never promotes transport to implemented or READY',()=>{
 assert.equal(report.status,'BLOCKED');assert.equal(report.featureImplemented,false);
 assert.equal(report.solverChanged,false);assert.equal(report.remoteWrites,0);
 assert.equal(report.standalone.diagnosis,'UNSUPPORTED');
});
