import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createApiAuthorization} from './apiAuthorization';
import type {AppRole} from './authz';

test('real HTTP middleware blocks anonymous/debug and task writes while preserving authorized application flows',async()=>{
 const app=express();let writes=0;
 app.use('/api',createApiAuthorization({authenticate:(req,res,next)=>{const id=req.header('x-test-user');if(!id)return void res.sendStatus(401);(req as any).user={id};next();},lookupRole:async id=>id==='norole'?null:id as AppRole}));
 app.use('/api',(req,res)=>{if(req.method!=='GET')writes++;res.json({ok:true});});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}`;
 try{
  const request=async(path:string,method='GET',role?:string)=>fetch(`${url}/api${path}`,{method,headers:role?{'x-test-user':role}:{}});
  assert.equal((await request('/health')).status,200);
  for(const role of [undefined,'norole','viewer','aux','production','admin']){
   const authorized=role!=null&&role!=='norole',writer=role==='admin'||role==='production';
   assert.equal((await request('/plans/27001','GET',role)).status,role==null?401:authorized?200:403);
   assert.equal((await request('/daily-tasks/10001/planned-time','PATCH',role)).status,role==null?401:writer?200:403);
   assert.equal((await request('/plans/27001/assisted/proposals','POST',role)).status,role==null?401:writer?200:403);
   assert.equal((await request('/spaces','POST',role)).status,role==null?401:role==='admin'?200:403);
   assert.equal((await request('/debug/generate/27001','GET',role)).status,role==null?401:role==='admin'?200:403);
  }
  assert.equal(writes,5,'denied requests must never reach a write handler');
  assert.equal((await request('/bootstrap-role','POST','norole')).status,200,'first login can bootstrap its viewer role');
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
