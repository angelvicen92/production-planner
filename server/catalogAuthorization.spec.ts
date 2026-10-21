import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {api,buildUrl} from '../shared/routes';
import {apiRequiredRoles,createApiAuthorization} from './apiAuthorization';
import type {AppRole} from './authz';

const roles=['admin','production','aux','viewer','norole','anonymous','invalid-token'] as const;
const variants=(path:string)=>[path,path+'/',path.toUpperCase(),path.replace('/api/','/API/').replace(/zones|spaces|vocal-coach-rules/,s=>s[0].toUpperCase()+s.slice(1))+'/'];

test('catalog HTTP role matrix denies before handlers, including Express casing and trailing slash',async()=>{
 const app=express();let handlers=0,lookups=0;
 app.use('/api',createApiAuthorization({
  authenticate:(req,res,next)=>{const id=req.header('Authorization')?.replace('Bearer ','');if(!id||id==='invalid-token')return void res.sendStatus(401);(req as any).user={id};next();},
  lookupRole:async id=>{lookups++;return id==='norole'?null:id as AppRole;},
 }));
 const operations=[api.vocalCoachRules.saveAll,api.zones.update,api.zones.delete,api.spaces.update,api.spaces.delete] as const;
 for(const operation of operations)app[operation.method.toLowerCase() as 'put'|'patch'|'delete'](operation.path,(_req,res)=>{handlers++;res.json({ok:true});});
 for(const catalog of [api.vocalCoachRules.list,api.zones.list,api.spaces.list])app.get(catalog.path,(_req,res)=>{handlers++;res.json([]);});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 try{
  for(const operation of [...operations,api.vocalCoachRules.list,api.zones.list,api.spaces.list])for(const path of variants(buildUrl(operation.path,{id:1})))for(const role of roles){
   const before=handlers,roleLookups=lookups,authenticated=!['anonymous','invalid-token'].includes(role);
   const allowed=operation.method==='GET'?authenticated&&role!=='norole':role==='admin';
   const response:Response=await fetch(`http://127.0.0.1:${address.port}${path}`,{method:operation.method,headers:role==='anonymous'?{}:{Authorization:'Bearer '+role}});
   assert.equal(response.status,authenticated?allowed?200:403:401,`${role} ${operation.method} ${path}`);
   assert.equal(handlers,before+(allowed?1:0),'denied requests must not execute any handler');
   assert.equal(lookups,roleLookups+(authenticated?1:0),'reuse role lookup only after successful authentication');
  }
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('segment limits do not capture neighbors or change plan-local, daily, Assisted or U03a authority',()=>{
 for(const path of ['/zones-extra/1','/ZONES-extra/1','/spaces-extra/1','/SPACES-extra/1','/vocal-coach-rules-extra','/vocal-coach-rules/extra','/target/1'])assert.equal(apiRequiredRoles('PATCH',path),null,path);
 assert.equal(apiRequiredRoles('PATCH','/some-other-api'),null,'no blanket /api policy');
 assert.deepEqual(apiRequiredRoles('PUT',buildUrl(api.plans.vocalCoachRules.saveAll.path,{id:1}).slice(4)),['admin','production']);
 for(const path of ['/plans/1/assisted/proposals','/plans/1/assisted/validate','/plans/1/assisted/accept-stage','/daily-tasks/1/planned-time'])assert.deepEqual(apiRequiredRoles('POST',path),['admin','production']);
 assert.deepEqual(apiRequiredRoles('PATCH','/tasks/1/status'),['admin','production','aux']);
 for(const path of ['/ta/1','/TA/1/','/task-templates/1','/TASK-TEMPLATES/1/'])assert.deepEqual(apiRequiredRoles('PATCH',path),['admin']);
 // Spatial children already belong to the same global catalog boundary.
 for(const path of ['/ZONES/1/default-availability','/Spaces/1/resource-defaults','/ZONES/1/resource-type-defaults'])assert.deepEqual(apiRequiredRoles('PATCH',path),['admin']);
});
