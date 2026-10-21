import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { registerAdminInviteRoutes } from './adminInvites';
import { createApiAuthorization } from './apiAuthorization';
import { inviteUserSchema, userAccessStatus } from '../shared/adminInvites';
import type { AppRole } from './authz';

test('invitation payload has explicit role, normalized email and no client authority or redirects',()=>{
  assert.deepEqual(inviteUserSchema.parse({email:'  ADMIN@Example.Test ',roleKey:'aux'}),{email:'admin@example.test',roleKey:'aux'});
  for(const payload of [{email:'bad',roleKey:'admin'},{email:'a@example.test',roleKey:'owner'},{email:'a@example.test'},{email:'a@example.test',roleKey:'viewer',redirectTo:'https://evil.invalid'}])assert.equal(inviteUserSchema.safeParse(payload).success,false);
});

test('access status distinguishes blocked, pending, unconfirmed and confirmed without claiming activation from existence/login',()=>{
  assert.equal(userAccessStatus({}), 'email_unconfirmed');
  assert.equal(userAccessStatus({invited_at:'2026-01-01'}),'invitation_pending');
  assert.equal(userAccessStatus({invited_at:'2026-01-01',email_confirmed_at:'2026-01-02'}),'email_confirmed');
  assert.equal(userAccessStatus({email_confirmed_at:'2026-01-02',banned_until:'2999-01-01'}),'blocked');
});

test('real invitation handler is unreachable for non-admin identities and malformed payloads cannot invoke the privileged client',async()=>{
  let privileged=0;
  const db=new Proxy({},{get(){privileged++;throw new Error('Privileged client must not run');}}) as SupabaseClient;
  const app=express();app.use(express.json());app.use('/api',createApiAuthorization({authenticate:(req,res,next)=>{const id=req.header('x-actor');if(!id||id==='invalid')return void res.sendStatus(401);(req as any).user={id};next();},lookupRole:async id=>id==='norole'?null:id as AppRole}));
  registerAdminInviteRoutes(app,db);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address!=='string');
  try{
    for(const role of [undefined,'invalid','norole','production','aux','viewer','admin'])for(const path of ['/api/admin/users/invite','/API/ADMIN/USERS/INVITE/']){
      const response:Response=await fetch(`http://127.0.0.1:${address.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(role?{'x-actor':role}:{})},body:JSON.stringify({email:'invalid',roleKey:'admin'})});
      assert.equal(response.status,!role||role==='invalid'?401:role==='admin'?400:403);
    }
    assert.equal(privileged,0);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});


test('a thrown exception after requesting email remains an uncertain delivery, without false no-send claim or destructive cleanup',async()=>{
  let roleSaved=false,deleted=false;
  const db={
    from:(table:string)=>table==='roles'?{select:()=>({eq:()=>({single:async()=>({data:{id:'role-id'},error:null})})})}:{insert:async()=>{roleSaved=true;return {error:null};}},
    auth:{admin:{createUser:async()=>({data:{user:{id:'new-user'}},error:null}),updateUserById:async()=>({error:null}),inviteUserByEmail:async()=>{throw new Error('Response lost after sending');},deleteUser:async()=>{deleted=true;return {error:null};}}},
  } as unknown as SupabaseClient;
  const app=express();app.use(express.json());
  app.use('/api',createApiAuthorization({authenticate:(req,_res,next)=>{(req as any).user={id:'admin'};next();},lookupRole:async()=> 'admin'}));
  registerAdminInviteRoutes(app,db);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address!=='string');
  try{
    const response:Response=await fetch(`http://127.0.0.1:${address.port}/api/admin/users/invite`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'new@example.test',roleKey:'aux'})});
    assert.equal(response.status,502);const body=await response.json() as any;
    assert.equal(body.code,'INVITATION_DELIVERY_UNCONFIRMED');assert.equal(body.userId,'new-user');assert.doesNotMatch(body.message,/No se.*solicit/);assert.ok(roleSaved);assert.equal(deleted,false);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
