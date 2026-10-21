import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { api } from '../shared/routes';
import { registerAtomicTaskTemplateRoutes } from './atomicTaskTemplate';
import { createApiAuthorization } from './apiAuthorization';
import { mapTaskTemplatePatch } from './taskTemplateMapping';
import type { AppRole } from './authz';

const input = {patch: {name:'Edit', participantMarginBeforeMinutes:null, participantMarginAfterMinutes:0}, expectedTemplates:[{id:1, revision:3},{id:2,revision:0}],addedInverseIds:[2],removedInverseIds:[]};

test('atomic save reuses the update schema and mapping; rejects malformed IDs, duplicates and arbitrary columns', () => {
  assert.deepEqual(api.taskTemplates.updateWithInverse.input.parse(input),input);
  assert.deepEqual(mapTaskTemplatePatch(input.patch),{name:'Edit',participant_margin_before_minutes:null,participant_margin_after_minutes:0});
  for (const addedInverseIds of [[0],[-1],[1.5],[2147483648],['2'],[2,2]])
    assert.equal(api.taskTemplates.updateWithInverse.input.safeParse({...input,addedInverseIds}).success,false);
  for (const patch of [{revision:9},{name:'Edit',sql:'UPDATE task_templates'},{dependsOnTemplateIds:[2,2]},{participantMarginAfterMinutes:-1}])
    assert.equal(api.taskTemplates.updateWithInverse.input.safeParse({...input,patch}).success,false);
  for (const expectedTemplates of [[{id:1,revision:-1}],[{id:1,revision:0},{id:1,revision:0}],[{id:1}]])
    assert.equal(api.taskTemplates.updateWithInverse.input.safeParse({...input,expectedTemplates}).success,false);
  assert.equal(api.taskTemplates.updateWithInverse.input.safeParse({...input,removedInverseIds:[2]}).success,false);
});

test('real HTTP ADMIN boundary, exact affected set, one RPC, conflict/error semantics and zero unauthorized writes', async () => {
  const app=express();app.use(express.json());let calls=0, failure='';let received:Record<string,unknown>|undefined;
  app.use('/api',createApiAuthorization({authenticate:(req,res,next)=>{const role=req.header('x-test-user');if(!role)return void res.sendStatus(401);(req as any).user={id:role};next();},lookupRole:async id=>id==='norole'?null:id as AppRole}));
  registerAtomicTaskTemplateRoutes(app,async(name,args)=>{calls++;assert.equal(name,'save_task_template_with_inverse');received=args;return {data:{id:1,name:'Edit',revision:4},error:failure?{message:failure}:null};});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const request=(role?:string,body:unknown=input,path='/api/task-templates/1/save-with-inverse')=>fetch(`http://127.0.0.1:${address.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(role?{'x-test-user':role}:{})},body:JSON.stringify(body)});
  try {
    for(const role of [undefined,'norole','viewer','aux','production'])for(const path of ['/api/task-templates/1/save-with-inverse','/API/TASK-TEMPLATES/1/SAVE-WITH-INVERSE/'])
      assert.equal((await request(role,input,path)).status,role?403:401);
    assert.equal(calls,0);
    for(const body of [{...input,addedInverseIds:[1]},{...input,expectedTemplates:[{id:1,revision:3}]},{...input,expectedTemplates:[{id:1,revision:3},{id:3,revision:0}]}])
      assert.equal((await request('admin',body)).status,400);
    assert.equal(calls,0);
    const success=await request('admin');assert.equal(success.status,200);assert.equal((await success.json()).revision,4);assert.equal(calls,1);
    assert.deepEqual(received,{p_template_id:1,p_actor:'admin',p_patch:mapTaskTemplatePatch(input.patch),p_expected:input.expectedTemplates,p_added:[2],p_removed:[]});
    for(const [message,status] of [['TEMPLATE_CONFLICT',409],['TEMPLATE_FORBIDDEN',403],['TEMPLATE_INVALID',400],['forced trigger failure',500]] as const) {
      failure=message;const response=await request('admin');assert.equal(response.status,status);
      if(status===409)assert.match((await response.json()).message,/Recargar/);
    }
  } finally { await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())); }
});
