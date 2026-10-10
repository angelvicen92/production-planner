import test from 'node:test';
import assert from 'node:assert/strict';
import { fourParticipants,sixParticipants } from '../diagnostics/asst010JointComponentFixtures';
import { generateGlobalCandidate } from './globalCandidate';
import { buildGlobalCandidateModel } from './globalCandidateModel';
const python=process.env.OPTIPLAN_EXPERIMENT_PYTHON;
for(const [name,build] of [['four',fourParticipants],['six',sixParticipants]] as const){
 test(`CP-SAT certifies ${name} without a prior witness or solution hint`,{skip:!python},async()=>{
  const {refreshed:source,fixed}=build(),before=structuredClone({source,fixed});
  const first=await generateGlobalCandidate(source,fixed,[],{python:python!,timeoutMs:10_000});
  assert.equal(first.outcome,'CERTIFIED_EXPERIMENTAL_COMPLETION',JSON.stringify(first));assert.equal(first.replay,'PASS');assert.equal(first.closureCertified,true);assert.equal(first.protectedLiteral,true);
  const second=await generateGlobalCandidate(source,fixed,[],{python:python!,timeoutMs:10_000});
  assert.deepEqual(first.witness,second.witness);assert.equal(first.solver.branches,second.solver.branches);assert.deepEqual({source,fixed},before);
 });
}
test('compiler depends only on current authorities and literal protections',()=>{
 const {refreshed,fixed}=sixParticipants(),model=buildGlobalCandidateModel(refreshed,fixed);
 assert.ok(!JSON.stringify(model).includes('priorJoint'));assert.ok(!('witness' in model));assert.ok(!('hints' in model));
 const moving=refreshed.tasks.filter(t=>t.kind==='main'&&!fixed.some(f=>f.id===t.id));
 assert.ok(moving.every(t=>model.tasks.find(r=>r.id===t.id)!.variants.some(v=>v.starts.length>1)));
});
for(const variation of ['availability','duration','resource','protection','shift-and-rename'] as const){
 test(`current-authority variation: ${variation}`,{skip:!python},async()=>{
  let {refreshed:source,fixed}=fourParticipants();
  if(variation==='availability')source.participants.find(p=>p.id==='a')!.availability=[{start:5,end:75}];
  if(variation==='duration')for(const t of source.tasks.filter(t=>t.id.startsWith('entry-')))t.duration=15;
  if(variation==='resource')source.resources[0]!.availability=[{start:5,end:155}];
  if(variation==='protection'){const t=source.tasks.find(t=>t.id==='main-b')!;fixed.push({...t,start:75,end:90});}
  if(variation==='shift-and-rename'){
   const names=new Map<string,string>();let n=0;
   const collect=(v:any)=>{if(Array.isArray(v))v.forEach(collect);else if(v&&typeof v==='object'){if(typeof v.id==='string')names.set(v.id,`opaque-${++n}`);Object.values(v).forEach(collect);}};collect(source);
   const remap=(v:any,key=''):any=>typeof v==='string'?(names.get(v)??v):typeof v==='number'&&['start','end','preferredEnd'].includes(key)?v+100:Array.isArray(v)?v.map(x=>remap(x,key)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x,k)])):v;
   source=remap(source);fixed=remap(fixed);
  }
  const r=await generateGlobalCandidate(source,fixed,[],{python:python!,timeoutMs:10_000});
  assert.equal(r.outcome,'CERTIFIED_EXPERIMENTAL_COMPLETION',JSON.stringify(r));assert.equal(r.validation?.hardValid,true);assert.equal(r.protectedLiteral,true);
 });
}
test('negative dependency failure and cancellation remain inconclusive',async()=>{
 const {refreshed,fixed}=fourParticipants();
 const cancelled=await generateGlobalCandidate(refreshed,fixed,[],{python:'unavailable',signal:AbortSignal.abort()});assert.equal(cancelled.outcome,'INCONCLUSIVE');assert.equal(cancelled.stopReason,'CANCELLED');
 const missing=await generateGlobalCandidate(refreshed,fixed,[],{python:'work/no-such-python',timeoutMs:100});assert.equal(missing.outcome,'INCONCLUSIVE');assert.equal(missing.witness,null);
});
test('isolated solve keeps the Node event loop responsive',{skip:!python},async()=>{
 const {refreshed,fixed}=sixParticipants();let ticks=0;const timer=setInterval(()=>ticks++,5);
 try{const r=await generateGlobalCandidate(refreshed,fixed,[],{python:python!,timeoutMs:10_000});assert.ok(ticks>1);assert.equal(r.outcome,'CERTIFIED_EXPERIMENTAL_COMPLETION');}finally{clearInterval(timer);}
});
