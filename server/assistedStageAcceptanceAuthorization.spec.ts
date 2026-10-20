import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL ??= 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
const {AssistedPlanningService}=await import('./assistedPlanningService');

function harness(role:string|null, hardCount=1, newHardCount=hardCount, requiredCount=0){
 const calls:unknown[]=[];let lookups=0;
 const session={id:7,planId:5,activeStageId:20,draftBaseStageId:20,currentConfigRevisionId:30,draftValidationId:40,draftFingerprint:'draft',draftSnapshotJson:{tasks:[]}};
 const validation={id:40,planId:5,sessionId:7,baseStageId:20,configRevisionId:30,draftFingerprint:'draft',hardCount,requiredCount,reportJson:{newHardCount,newRequiredCount:requiredCount}};
 const storage:any={getActiveAssistedPlanningSession:async()=>session,getPlanningStageValidation:async()=>validation,
  getAssistedPlanningStage:async()=>({id:20,parentStageId:null,snapshotJson:{tasks:[]}}),listAssistedPlanningStages:async()=>[],listPlanningAcceptedExceptions:async()=>[]};
 const authority={role};
 const service=new AssistedPlanningService(storage,async(name,parameters)=>{calls.push({name,parameters});return {error:null};},
  {lookupRole:async()=>{lookups++;return authority.role;}} as any);
 return {service,calls,authority,validation,lookups:()=>lookups};
}

for(const confirmation of ['NONE','REQUIRED_DEVIATIONS','HARD_EXCEPTIONS'] as const){
 test(`production cannot accept a new HARD with ${confirmation}; no privileged RPC`,async()=>{
  const h=harness('production');
  await assert.rejects(()=>h.service.accept(5,'actor','draft',20,confirmation),(e:any)=>e.status===403&&e.code==='HARD_ADMIN_AUTHORIZATION_REQUIRED');
  assert.deepEqual(h.calls,[]);assert.equal(h.lookups(),1);
 });
}
test('admin accepts a new HARD only after a current server role lookup',async()=>{
 const h=harness('admin');await h.service.accept(5,'actor','draft',20,'HARD_EXCEPTIONS');
 assert.equal(h.lookups(),1);assert.equal(h.calls.length,1);
});
for(const [label,hard,newHard,required,confirmation] of [
 ['clean',0,0,0,'NONE'],['REQUIRED',0,0,1,'REQUIRED_DEVIATIONS'],['intact inherited HARD',1,0,0,'NONE'],
 ['inherited HARD and new REQUIRED',1,0,1,'REQUIRED_DEVIATIONS'],
] as const){
 test(`production preserves ${label} acceptance`,async()=>{
  const h=harness('production',hard,newHard,required);await h.service.accept(5,'actor','draft',20,confirmation);
  assert.equal(h.calls.length,1);assert.equal(h.lookups(),1);
 });
}
test('revocation after validation is read at acceptance and forbids every write',async()=>{
 for(const revoked of ['viewer','aux',null]){
  const h=harness('admin');h.authority.role=revoked;
  await assert.rejects(()=>h.service.accept(5,'actor','draft',20,'HARD_EXCEPTIONS'),(e:any)=>e.status===403&&e.code==='ASSISTED_ACCEPT_FORBIDDEN');
  assert.deepEqual(h.calls,[]);
 }
});
test('a non-admin cannot preauthorize HARD_EXCEPTIONS on a clean or stale report',async()=>{
 for(const stale of [false,true]){
  const h=harness('production',0);if(stale)h.validation.configRevisionId++;
  await assert.rejects(()=>h.service.accept(5,'actor','draft',20,'HARD_EXCEPTIONS'),(e:any)=>e.status===403);
  assert.deepEqual(h.calls,[]);
 }
});
test('a legacy report without new counts falls back to total HARD and remains protected',async()=>{
 const h=harness('production');delete (h.validation.reportJson as any).newHardCount;
 await assert.rejects(()=>h.service.accept(5,'actor','draft',20,'NONE'),(e:any)=>e.status===403);
 assert.deepEqual(h.calls,[]);
});
