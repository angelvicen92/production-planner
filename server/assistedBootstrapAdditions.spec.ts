import assert from 'node:assert/strict';
import test from 'node:test';
import type {IStorage} from './storage';
process.env.SUPABASE_URL??='http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY??='test';
process.env.SUPABASE_ANON_KEY??='test';
const {AssistedPlanningService}=await import('./assistedPlanningService');
const expected={allowed:true,reason:null,expectedSessionId:7,expectedBaseStageId:11,expectedConfigRevisionId:2,expectedDraftFingerprint:'a'.repeat(64),sourceToken:'b'.repeat(64),addedTaskIds:[12]};

test('unsafe preview never builds an EngineInput or writes a replacement',async()=>{
 const storage=new Proxy({},{get(){throw new Error('unexpected storage read');}}) as IStorage;
 const calls:string[]=[];
 const service=new AssistedPlanningService(storage,async name=>{calls.push(name);return {data:{...expected,allowed:false,reason:'REBOOTSTRAP_TASK_CHANGED_OR_REMOVED'},error:null};});
 assert.equal((await service.previewAdditions(1)).reason,'REBOOTSTRAP_TASK_CHANGED_OR_REMOVED');
 assert.deepEqual(calls,['assisted_preview_bootstrap_additions']);
});
test('server authorization is re-read before any privileged replacement work',async()=>{
 for(const role of [null,'aux','viewer'] as const){
  const service=new AssistedPlanningService({} as IStorage,async()=>{throw new Error('RPC must not be called');},{lookupRole:async()=>role});
  await assert.rejects(()=>service.incorporateAdditions(1,'operator',expected),{code:'ASSISTED_ACCEPT_FORBIDDEN',status:403});
 }
});
test('operator token cannot adopt changes that appeared after review',async()=>{
 const service=new AssistedPlanningService({} as IStorage,async()=>({data:{...expected,allowed:false,reason:'REBOOTSTRAP_NO_ADDITIONS',sourceToken:'c'.repeat(64)},error:null}),{lookupRole:async()=>'production'});
 await assert.rejects(()=>service.incorporateAdditions(1,'operator',expected),{code:'REBOOTSTRAP_STALE_SOURCES',status:409});
});
