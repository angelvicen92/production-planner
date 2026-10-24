import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';

// Assertions refer to the immutable diagnostic receipt; current product has evolved.
const analyseU00iResourceGate=()=>JSON.parse(gunzipSync(readFileSync('docs/evidence/p0-u00i/boundary.json.gz')).toString());
test('API counterexample is feasible with B and infeasible with A under the original authorities',()=>{
  const report=analyseU00iResourceGate();
  assert.equal(report.completeWithB.evidence.hardValid,true);
  assert.equal(report.completeWithB.evidence.requiredValid,true);
  assert.equal(report.completeWithA.evidence.completeForScope,false);
});
test('different-participant future is present but a concrete A scope can consume its sole slot',()=>{
  const report=analyseU00iResourceGate(),future=report.differentParticipantFuture;
  assert.equal(future.analyticalFutureTaskIds.length,1);
  assert.equal(future.A.first.evidence.completeForScope,true);
  assert.equal(future.A.second.evidence.completeForScope,false);
  assert.equal(future.B.first.evidence.completeForScope,true);
  assert.equal(future.B.second.evidence.completeForScope,true);
});
test('ordinary validation and fingerprint lack the nominal-selection integrity contract',()=>{
  const report=analyseU00iResourceGate().ordinaryResultIntegrity;
  // This is the detected baseline defect, not desired product behavior.
  assert.equal(report.omittedValidation.hardValid,true);
  assert.equal(report.fingerprintsEqual,true);
});
