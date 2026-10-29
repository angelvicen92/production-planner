import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {apiRequiredRoles,createApiAuthorization} from './apiAuthorization';
import type {AppRole} from './authz';
import {api,buildUrl} from '../shared/routes';

test('itinerant catalog writes require ADMIN for Express casing and trailing slash variants',async()=>{
 const app=express();let writes=0;
 app.use('/api',createApiAuthorization({authenticate:(req,res,next)=>{const role=req.header('x-test-user');if(!role)return void res.sendStatus(401);(req as any).user={id:role};next();},lookupRole:async role=>role==='norole'?null:role as AppRole}));
 app.all('/api/itinerant-teams/:id',(_req,res)=>{writes++;res.json({ok:true});});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 try {
  for(const method of ['PUT','DELETE'])for(const role of [undefined,'norole','viewer','aux','production','admin'])for(const path of ['/api/itinerant-teams/1','/API/ITINERANT-TEAMS/1/']){
   const before=writes;
   const response:Response=await fetch(`http://127.0.0.1:${address.port}${path}`,{method,headers:role?{'x-test-user':role}:{}});
   assert.equal(response.status,role==null?401:role==='admin'?200:403);
   assert.equal(writes,before+(role==='admin'?1:0));
  }
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('real HTTP middleware blocks anonymous/debug and task writes while preserving authorized application flows',async()=>{
 const app=express();let writes=0;
 app.use('/api',createApiAuthorization({authenticate:(req,res,next)=>{const id=req.header('x-test-user');if(!id)return void res.sendStatus(401);(req as any).user={id};next();},lookupRole:async id=>id==='norole'?null:id as AppRole,authorizeTask:async(id,user)=>user==='admin'||user==='production'||(user==='aux'&&id===10001)}));
 app.use('/api',(req,res)=>{if(req.method!=='GET')writes++;res.json({ok:true});});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}`;
 try{
  const request=async(path:string,method='GET',role?:string)=>fetch(`${url}/api${path}`,{method,headers:role?{'x-test-user':role}:{}});
  assert.equal((await request('/health')).status,200);
  for(const role of [undefined,'norole','viewer','aux','production','admin']){
   const authorized=role!=null&&role!=='norole',writer=role==='admin'||role==='production';
   assert.equal((await request('/plans/27001','GET',role)).status,role==null?401:authorized?200:403);
   assert.equal((await request('/plans/27001/assisted/history/timings','GET',role)).status,role==null?401:authorized?200:403);
   assert.equal((await request('/daily-tasks/10001/planned-time','PATCH',role)).status,role==null?401:writer?200:403);
   assert.equal((await request('/plans/27001/assisted/proposals','POST',role)).status,role==null?401:writer?200:403);
   assert.equal((await request('/spaces','POST',role)).status,role==null?401:role==='admin'?200:403);
   assert.equal((await request('/debug/generate/27001','GET',role)).status,role==null?401:role==='admin'?200:403);
  }
  assert.equal(writes,5,'denied requests must never reach a write handler');
  for(const role of ['viewer','aux','editorial'])for(const endpoint of ['validate','accept-stage']){
   const before:number=writes;assert.equal((await request(`/plans/27001/assisted/${endpoint}`,'POST',role)).status,403);
   assert.equal(writes,before,'Assisted validation and exceptions require existing production/admin authority');
  }
  for (const role of [undefined,'norole','viewer','aux','production','admin']) {
   const before:number=writes;
   const response=await request('/tasks/10002/status','PATCH',role);
   assert.equal(response.status,role==null?401:role==='admin'||role==='production'?200:403);
   if(response.status!==200)assert.equal(writes,before,'execution denial precedes the privileged write');
  }
  assert.equal((await request('/tasks/10001/status','PATCH','aux')).status,200);
  assert.equal((await request('/tasks/10001/reset','POST','viewer')).status,403);
  assert.equal((await request('/tasks/10001/reset','POST','aux')).status,403);
  for(const path of ['/tasks/10002.0/status','/tasks/10002/status/']) {
   assert.equal((await request(path,'PATCH','viewer')).status,403);
   assert.equal((await request(path,'PATCH','aux')).status,403);
  }
  assert.equal((await request('/bootstrap-role','POST','norole')).status,200,'first login can bootstrap its viewer role');
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('template aliases and Express casing use the catalog admin authority before any handler',async()=>{
 const app=express();let writes=0;
 app.use('/api',createApiAuthorization({
  authenticate:(req,res,next)=>{const id=req.header('x-test-user');if(!id)return void res.sendStatus(401);(req as any).user={id};next();},
  lookupRole:async id=>id==='norole'?null:id as AppRole,
 }));
 app.use('/api',(req,res)=>{if(req.method!=='GET')writes++;res.json({ok:true});});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}`;
 try{
  const realPath=buildUrl(api.taskTemplates.update.path,{id:1});
  assert.equal(realPath,'/api/ta/1');
  const paths:readonly string[]=[realPath,realPath+'/', '/api/TA/1','/API/tA/1/','/api/task-templates/1','/api/TASK-TEMPLATES/1'];
  for(const role of [undefined,'norole','viewer','aux','production','admin']){
   for(const path of paths){
    const before:number=writes,response:Response=await fetch(url+path,{method:api.taskTemplates.update.method,headers:role?{'x-test-user':role}:{}});
    assert.equal(response.status,role==null?401:role==='admin'?200:403,`${role} ${path}`);
    assert.equal(writes,before+(role==='admin'?1:0),'denials never reach a write handler');
   }
   const read=await fetch(url+api.taskTemplates.list.path,{headers:role?{'x-test-user':role}:{}});
   assert.equal(read.status,role==null?401:role==='norole'?403:200);
  }
  // The alias boundary must not claim unrelated path names.
  const unrelated=await fetch(url+'/api/target/1',{method:'PATCH',headers:{'x-test-user':'production'}});
  assert.equal(unrelated.status,200);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('time correction and history share execution role boundaries including Express casing', () => {
  for (const path of ['/tasks/1/real-time','/tasks/1/real-time/','/TASKS/1/REAL-TIME']) {
    assert.deepEqual(apiRequiredRoles('PATCH',path),['admin','production','aux']);
  }
  assert.deepEqual(apiRequiredRoles('GET','/tasks/1/execution-history'),['admin','production','aux','viewer']);
});

test('bulk execution reset requires ADMIN through real HTTP including casing and trailing slash', async () => {
  const app = express(); let writes = 0;
  app.use('/api',createApiAuthorization({
    authenticate:(req,res,next)=>{const role=req.header('x-test-user');if(!role)return void res.sendStatus(401);(req as any).user={id:role};next();},
    lookupRole:async role=>role==='norole'?null:role as AppRole,
  }));
  app.post(api.plans.resetExecution.path,(_req,res)=>{writes++;res.json({resetCount:4});});
  const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address(); assert.ok(address&&typeof address!=='string');
  try {
    for(const role of [undefined,'norole','viewer','aux','production','admin']) {
      for(const path of ['/api/plans/1/execution/reset','/api/plans/1/execution/reset/','/API/PLANS/1/EXECUTION/RESET']) {
        const before=writes;
        const response: Response=await fetch(`http://127.0.0.1:${address.port}${path}`,{method:'POST',headers:role?{'x-test-user':role}:{}});
        assert.equal(response.status,role==null?401:role==='admin'?200:403);
        assert.equal(writes,before+(role==='admin'?1:0));
      }
    }
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});

test('resource availability writes and reads retain their roles for Express casing and trailing slashes',async()=>{
 const app=express();let writes=0;
 app.use('/api',createApiAuthorization({authenticate:(req,res,next)=>{const id=req.header('x-test-user');if(!id)return void res.sendStatus(401);(req as any).user={id};next();},lookupRole:async id=>id==='norole'?null:id as AppRole}));
 app.use('/api',(req,res)=>{if(!['GET','HEAD'].includes(req.method))writes++;res.json({ok:true});});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 try{
  const cases=[['POST','/api/resource-items',false],['PATCH','/api/resource-items/1',false],['GET','/api/resource-types-with-items',false],['POST','/api/plans/1/resource-items',true],['PATCH','/api/plans/1/resource-items/1',true],['GET','/api/plans/1/resource-items',true]] as const;
  for(const [method,base,daily] of cases)for(const path of [base,base.toUpperCase(),base.toUpperCase()+'/'])for(const role of [undefined,'norole','viewer','aux','production','admin']){
   const reading=method==='GET',allowed=reading?role!=null&&role!=='norole':role==='admin'||daily&&role==='production';
   const before=writes;const response=await fetch(`http://127.0.0.1:${address.port}${path}`,{method,headers:role?{'x-test-user':role}:{}});
   assert.equal(response.status,role==null?401:allowed?200:403,JSON.stringify({method,path,role}));
   assert.equal(writes,before+(allowed&&!reading?1:0),'denial precedes the service_role handler');
  }
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
