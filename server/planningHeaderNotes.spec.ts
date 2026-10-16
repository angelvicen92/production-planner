import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { saveHeaderNotesSchema } from "../shared/planningHeaderNotes";
import { registerPlanningHeaderNotesRoutes } from "./planningHeaderNotes";
import { apiRequiredRoles, createApiAuthorization } from "./apiAuthorization";

test("header notes validate length, order, plain text and reject forged fields",()=>{
  for (const path of ['/plans/1/header-notes','/PLANS/1/HEADER-NOTES/space/3']) {
    assert.deepEqual(apiRequiredRoles('GET',path),['admin','production','aux','viewer']);
    assert.deepEqual(apiRequiredRoles('PUT',path),['admin','production']);
  }
  const parsed=saveHeaderNotesSchema.parse({expectedVersion:0,lines:[{text:"  <script>texto</script>\nsegunda línea  "},{label:" Sonido ",text:"Sin sonido"}]});
  assert.equal(parsed.lines[0].text,"<script>texto</script>\nsegunda línea");assert.equal(parsed.lines[1].label,"Sonido");
  for(const input of [{expectedVersion:-1,lines:[]},{expectedVersion:0,lines:[{text:" "}]},{expectedVersion:0,lines:[{text:"x".repeat(4001)}]},{expectedVersion:0,lines:[{text:"x",label:"x".repeat(81)}]},{expectedVersion:0,lines:Array(21).fill({text:"x"})},{expectedVersion:0,lines:Array(5).fill({text:"x".repeat(4000)})},{expectedVersion:0,lines:[],planId:9},{expectedVersion:0,lines:[{text:"x",resourceId:1}]}]) assert.equal(saveHeaderNotesSchema.safeParse(input).success,false);
});
test("HTTP authentication/roles, scoped persistence, version conflicts and read failures",async()=>{
  const app=express();app.use(express.json());
  app.use('/api',createApiAuthorization({authenticate:(req,res,next)=>{const role=req.headers.authorization;if(!role)return res.status(401).end();(req as any).user={id:role};next();},lookupRole:async id=>['admin','production','aux','viewer'].includes(id)?id as any:null}));
  let failed=false;const rows:any[]=[];
  const db:any={from:(table:string)=>({select:()=>({eq:(_k:string,id:number)=>table==='plans'?{maybeSingle:async()=>({data:id===1?{id}:null,error:null})}:Promise.resolve({data:failed?null:rows,error:failed?new Error('private database failure'):null})})}),rpc:async(_name:string,args:any)=>{
    const old=rows.find(r=>r.scope_type===args.p_scope&&r.scope_id===args.p_scope_id);
    if((old?.version??0)!==args.p_version)return {data:null,error:new Error('HEADER_STALE')};
    const row={scope_type:args.p_scope,scope_id:args.p_scope_id,version:args.p_version+1,lines:args.p_lines};if(old)rows.splice(rows.indexOf(old),1);rows.push(row);
    return {data:{scopeType:row.scope_type,scopeId:row.scope_id,version:row.version,lines:row.lines},error:null};
  }};
  registerPlanningHeaderNotesRoutes(app,db);const server=createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${(server.address() as any).port}/api/plans/1/header-notes`;
  const request=(role:string|null,method='GET',suffix='',body?:unknown)=>fetch(origin+suffix,{method,headers:{...(role?{Authorization:role}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  try {
    assert.equal((await request(null)).status,401);
    for(const role of ['aux','viewer','norole'])assert.equal((await request(role,'PUT','/space/1',{expectedVersion:0,lines:[]})).status,403);
    for(const role of ['admin','production'])assert.equal((await request(role,'PUT',`/zone/${role==='admin'?1:2}`,{expectedVersion:0,lines:[{text:'Nota'}]})).status,200);
    assert.equal((await request('production','PUT','/space/1',{expectedVersion:0,lines:[{text:'Espacio'}]})).status,200);
    assert.equal((await request('production','PUT','/space/1',{expectedVersion:0,lines:[]})).status,409);
    assert.equal((await request('production','PUT','/unknown/1',{expectedVersion:0,lines:[]})).status,400);
    for(const role of ['admin','production','aux','viewer'])assert.equal((await request(role)).status,200);
    assert.equal((await (await request('viewer')).json()).length,3);
    failed=true;const error=await request('viewer');assert.equal(error.status,503);assert.ok(!(await error.text()).includes('private database'));
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
