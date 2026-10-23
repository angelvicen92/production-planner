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
test('native 9/9 standalone input now completes in the existing search without an empty Main pipeline',()=>{
 assert.equal(report.standalone.preflight,'SUPPORTED');assert.equal(report.standalone.obligations,9);
 assert.equal(report.standalone.witnessValidation.hardValid,true);
 assert.equal(report.standalone.observedNativeStatus,'error');
 assert.match(report.standalone.observedNativeMessage,/styling/);
 assert.equal(report.standalone.solver.result.proposal?.length,9);
 assert.equal(report.standalone.solver.result.evidence.completeForScope,true);
 assert.equal(report.standalone.solver.validation.hardValid,true);
 assert.equal(report.standalone.solver.deterministic,true);
});
test('cold fallback preserves synchronized transport while ordinary overlap remains invalid',()=>{
 assert.equal(report.coldReplay.architecture,null);
 assert.equal(report.coldReplay.result.evidence.completeForScope,true);
 assert.equal(report.coldReplay.result.evidence.protectedPlacementsPreserved,true);
 assert.deepEqual(report.coldReplay.withoutTransportPolicy.reasonCodes,['OVERLAP_VIOLATION']);
 assert.deepEqual(report.coldReplay.withTransportPolicy.reasonCodes,[]);
});
test('engine repair remains distinct from native product acceptance',()=>{
 assert.equal(report.status,'ENGINE_GATE_PASS');assert.equal(report.featureImplemented,false);
 assert.equal(report.solverChanged,true);assert.equal(report.remoteWrites,0);
 assert.equal(report.standalone.diagnosis,'SUPPORTED');
});
