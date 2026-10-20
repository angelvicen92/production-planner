import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';
import pg from 'pg';
import {dataApiCatalog,privilegeContract,type DataApiCatalog} from './dataApiCatalog';
import {dataApiCallSheet} from './dataApiCallSheet';

const contractPath='script/demo/fixtures/data-api-privileges.json';

/** Static discovery complements actual catalog/HTTP tests; it never substitutes for them. */
export function dataApiSourceCalls(directory='server') {
  const calls:{file:string;line:number;object:string;kind:string;operations:string[]}[]=[];
  function walk(directory:string) {
    for(const entry of readdirSync(directory,{withFileTypes:true})) {
      const file=join(directory,entry.name);
      if(entry.isDirectory()) {if(!['fixtures','benchmarks'].includes(entry.name))walk(file);continue;}
      if(!/\.tsx?$/.test(file)||/\.(spec|test)\./.test(file))continue;
      const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
      function visit(node:ts.Node) {
        if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)
          &&['from','rpc'].includes(node.expression.name.text)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])) {
          const operations=new Set<string>();let outer:ts.Node=node;
          while(outer.parent&&(ts.isCallExpression(outer.parent)||ts.isPropertyAccessExpression(outer.parent))) {
            outer=outer.parent;
            if(ts.isCallExpression(outer)&&ts.isPropertyAccessExpression(outer.expression)) {
              const operation=outer.expression.name.text;
              if(['select','insert','update','delete'].includes(operation))operations.add(operation.toUpperCase());
              if(operation==='upsert'){operations.add('INSERT');operations.add('UPDATE');}
            }
          }
          calls.push({file,line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,
            object:node.arguments[0].text,kind:node.expression.name.text,operations:[...operations]});
        }
        ts.forEachChild(node,visit);
      }
      visit(source);
    }
  }
  walk(directory);return calls;
}

export function assertPrivilegeContract(catalog:DataApiCatalog) {
  assert.deepEqual(privilegeContract(catalog),JSON.parse(readFileSync(contractPath,'utf8')),
    'Data API contract changed: review every new object, required grant, column boundary and exposed role');
}

export function assertSourcePrivileges(catalog:DataApiCatalog) {
  const calls=dataApiSourceCalls();
  for(const call of calls) {
    if(call.kind==='from') {
      const table=catalog.tables.find(t=>t.name===call.object&&t.role==='service_role');
      assert.ok(table,`${call.file}:${call.line}: unregistered Data API relation ${call.object}`);
      for(const operation of call.operations)assert.ok(table.privileges.includes(operation)
        ||Object.values(table.columns as Record<string,string[]>).some(p=>p.includes(operation)),
        `${call.file}:${call.line}: missing effective ${operation} for service_role on ${call.object}`);
    }else assert.ok(catalog.functions.some(f=>f.signature.startsWith(`${call.object}(`)&&f.role==='service_role'&&f.execute),
      `${call.file}:${call.line}: missing effective RPC EXECUTE ${call.object}`);
  }
  return calls;
}

/** A second database in the same disposable PostgreSQL container. Never uses runtime credentials. */
export async function legacyDataApiCatalog(db:pg.Client,config:pg.ClientConfig) {
  assert.equal(config.host,'127.0.0.1');
  await db.query('CREATE DATABASE p11_legacy');
  const legacy=new pg.Client({...config,database:'p11_legacy'});await legacy.connect();
  try {
    await legacy.query(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
      GRANT USAGE ON SCHEMA public,auth,extensions TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
    for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&Number(f.slice(0,3))<=99).sort())
      await legacy.query(readFileSync(`supabase/migrations/${file}`,'utf8'));
    const before=await dataApiCatalog(legacy);
    await legacy.query(readFileSync('supabase/migrations/100_data_api_explicit_grants.sql','utf8'));
    const after=await dataApiCatalog(legacy);
    assert.deepEqual({...after,tables:after.tables.map(({rls,...t})=>t)},
      {...before,tables:before.tables.map(({rls,...t})=>t)},
      '100 must leave all effective historical privileges, policies and definitions unchanged');
    return before;
  }finally {await legacy.end();await db.query('DROP DATABASE p11_legacy');}
}

export function assertNoWidening(before:DataApiCatalog,after:DataApiCatalog,legacy:DataApiCatalog) {
  assert.deepEqual(after.policies,before.policies,'100 must preserve every RLS policy');
  assert.deepEqual(after.functions.map(({signature,definer,settings,result,definition_hash,role})=>({signature,definer,settings,result,definition_hash,role})),
    before.functions.map(({signature,definer,settings,result,definition_hash,role})=>({signature,definer,settings,result,definition_hash,role})),
    '100 must preserve RPC signatures, function bodies, security modes and search_path');
  for(const table of after.tables) {
    const previous=legacy.tables.find(t=>t.name===table.name&&t.role===table.role);assert.ok(previous);
    assert.deepEqual(table.options,previous.options);
    if(table.kind==='r'||table.kind==='p')assert.equal(table.rls,true,`${table.name} requires RLS`);
    for(const permission of table.privileges)assert.ok(previous.privileges.includes(permission),`widened ${table.role} ${table.name} ${permission}`);
    for(const [column,permissions] of Object.entries(table.columns as Record<string,string[]>))
      for(const permission of permissions)assert.ok(previous.columns[column].includes(permission),`widened ${table.name}.${column}`);
    if(table.role==='anon')assert.deepEqual({...table,rls:undefined},{...before.tables.find(t=>t.name===table.name&&t.role==='anon'),rls:undefined});
  }
  for(const sequence of after.sequences) {
    const previous=legacy.sequences.find(s=>s.name===sequence.name&&s.role===sequence.role);assert.ok(previous);
    for(const permission of sequence.privileges)assert.ok(previous.privileges.includes(permission),`widened sequence ${sequence.name}`);
  }
  for(const fn of after.functions)if(fn.execute)assert.ok(legacy.functions.some(f=>f.signature===fn.signature&&f.role===fn.role&&f.execute),`widened RPC ${fn.signature}`);
}

export async function verifyDataApiGrants(options:{db:pg.Client;url:string;service:string;authenticatedToken:string;directory:string;before:DataApiCatalog;legacy:DataApiCatalog;rollout:DataApiCatalog}) {
  const {db,url,service,authenticatedToken,directory,before,legacy,rollout}=options;
  assert.equal(new URL(url).hostname,'127.0.0.1');
  const after=await dataApiCatalog(db);
  assertNoWidening(before,rollout,legacy);assertPrivilegeContract(after);
  const calls=assertSourcePrivileges(after);
  const reads=[];
  for(const table of after.tables.filter(t=>t.role==='service_role'&&t.privileges.includes('SELECT'))) {
    const response=await fetch(`${url}/rest/v1/${table.name}?select=*&limit=1`,{headers:{Authorization:`Bearer ${service}`}});
    assert.equal(response.status,200,`${table.name}: ${await response.text()}`);
    reads.push({object:table.name,status:response.status});
  }
  // Mutation checks certify that the gate is capable of detecting regression.
  await db.query('BEGIN');
  try {
    await db.query('REVOKE SELECT ON public.plans FROM service_role');
    const broken=await dataApiCatalog(db);
    assert.throws(()=>assertPrivilegeContract(broken),/Data API contract changed/);
    assert.throws(()=>assertSourcePrivileges(broken),/missing effective SELECT/);
  }finally {await db.query('ROLLBACK');}
  await db.query('BEGIN');
  try {
    await db.query('GRANT SELECT,INSERT ON public.plans TO anon');
    const opened=await dataApiCatalog(db);
    assert.throws(()=>assertPrivilegeContract(opened),/Data API contract changed/);
    assert.throws(()=>assertNoWidening(before,opened,legacy));
  }finally {await db.query('ROLLBACK');}
  // A real future table with correct RLS but no grant must fail natively. This
  // is also a control for SQLSTATE classification, independently of the contract.
  const probe='p11_gate_probe';
  const request=async(token:string,method='GET')=>{
    const r=await fetch(`${url}/rest/v1/${probe}?select=id`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(method==='POST'?{body:JSON.stringify({id:2})}:{})});
    return {status:r.status,body:await r.json() as any};
  };
  try {
    await db.query(`CREATE TABLE public.${probe}(id integer PRIMARY KEY);
      ALTER TABLE public.${probe} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY probe_read ON public.${probe} FOR SELECT TO authenticated USING(true);
      INSERT INTO public.${probe} VALUES(1); NOTIFY pgrst,'reload schema';`);
    const unregistered=await dataApiCatalog(db);
    assert.throws(()=>assertPrivilegeContract(unregistered),/Data API contract changed/);
    let denied=await request(service);
    for(let attempts=0;denied.status===404&&attempts<40;attempts++){
      await new Promise(r=>setTimeout(r,100));denied=await request(service);
    }
    assert.equal(denied.status,403);assert.equal(denied.body.code,'42501');
    const authDenied=await request(authenticatedToken);assert.equal(authDenied.status,403);assert.equal(authDenied.body.code,'42501');
    await db.query(`GRANT SELECT ON public.${probe} TO service_role,authenticated`);
    assert.deepEqual(await request(service),{status:200,body:[{id:1}]});
    assert.deepEqual(await request(authenticatedToken),{status:200,body:[{id:1}]});
    await db.query(`DROP POLICY probe_read ON public.${probe}`);
    assert.deepEqual(await request(authenticatedToken),{status:200,body:[]},'grant exists, RLS hides rows');
  }finally {await db.query(`DROP TABLE IF EXISTS public.${probe}; NOTIFY pgrst,'reload schema';`);}
  writeFileSync(`${directory}/data-api-source-calls.json`,JSON.stringify(calls,null,2));
  return {tables:after.tables.length/3,sequences:after.sequences.length/3,functions:after.functions.length/3,
    sourceCalls:calls.length,nativeReads:reads,legacyEffectivePrivilegesUnchanged:true,
    rpcDefinitionsAndPoliciesUnchanged:true,allRebuiltTablesRlsEnabled:true,
    missingGrantDetected:true,newTableWithoutGrantNative42501:true,grantVsRlsNativeControl:true,anonymousExpansionDetected:true};
}

type User={id:string;email:string;password:string;token:string};
export async function verifyDataApiActors(options:{db:pg.Client;url:string;appUrl:string;anon:string;service:string;users:Record<string,User>;planId:number;directory:string}) {
  const {db,url,appUrl,anon,service,users,planId,directory}=options;
  for(const target of [url,appUrl])assert.equal(new URL(target).hostname,'127.0.0.1');
  const api=async(role:string,path:string,method='GET',body?:unknown)=>{
    const r=await fetch(`${appUrl}${path}`,{method,headers:{'Content-Type':'application/json',
      ...(role==='anon'?{}:{Authorization:`Bearer ${role==='invalid'?'invalid.jwt.token':users[role].token}`})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json() as any};
  };
  const rest=async(token:string,table:string,method='GET',body?:unknown)=>{
    const r=await fetch(`${url}/rest/v1/${table}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json() as any};
  };
  const catalog=await dataApiCatalog(db),observations=[];
  for(const role of ['anon','norole','viewer','aux','production','admin']) {
    const status=role==='anon'?401:role==='norole'?403:200;
    const reads=[];
    for(const path of [`/api/plans/${planId}`,`/api/plans/${planId}/execution`,`/api/plans/${planId}/incidents`,`/api/plans/${planId}/header-notes`]) {
      const response=await api(role,path);assert.equal(response.status,status,`${role} ${path}: ${JSON.stringify(response.body)}`);
      reads.push({path,status:response.status});
    }
    const admin=await api(role,'/api/admin/users');assert.equal(admin.status,role==='anon'?401:role==='admin'?200:403);
    const native=[];
    for(const table of catalog.tables.filter(t=>t.role===(role==='anon'?'anon':'authenticated'))) {
      const r=await rest(role==='anon'?anon:users[role].token,`${table.name}?select=*&limit=1`);
      const allowed=table.privileges.includes('SELECT');
      assert.equal(r.status,allowed?200:role==='anon'?401:403,`${role} REST ${table.name}: ${JSON.stringify(r.body)}`);
      if(allowed&&['anon','norole'].includes(role))assert.deepEqual(r.body,[],`${role} ${table.name} leaked rows`);
      if(!allowed)assert.equal(r.body.code,'42501');
      native.push({object:table.name,status:r.status,rows:Array.isArray(r.body)?r.body.length:null});
    }
    const write=await rest(role==='anon'?anon:users[role].token,'plans','POST',{});
    assert.equal(write.status,role==='anon'?401:403);assert.equal(write.body.code,'42501');
    observations.push({role,reads,adminUsers:admin.status,native,planInsert:write.status});
  }
  assert.equal((await api('invalid',`/api/plans/${planId}`)).status,401,'invalid Auth token');
  const invalid=await rest('invalid.jwt.token','plans?select=id');assert.equal(invalid.status,401);assert.equal(invalid.body.code,'PGRST301');
  // Use the same access token before promotion, after role change and after revocation.
  assert.equal((await api('admin',`/api/admin/users/${users.norole.id}/role`,'PATCH',{roleKey:'production'})).status,200);
  assert.equal((await api('norole',`/api/plans/${planId}`)).status,200);
  assert.ok((await rest(users.norole.token,`plans?id=eq.${planId}&select=id`)).body.length);
  assert.equal((await api('admin',`/api/admin/users/${users.norole.id}/role`,'PATCH',{roleKey:'viewer'})).status,200);
  assert.equal((await api('norole',`/api/plans/${planId}/assisted/session`,'POST',{})).status,403);
  const revoke=await fetch(`${url}/rest/v1/user_roles?user_id=eq.${users.norole.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${service}`}});
  assert.equal(revoke.status,204);
  assert.equal((await api('norole',`/api/plans/${planId}`)).status,403);
  assert.deepEqual((await rest(users.norole.token,`plans?id=eq.${planId}&select=id`)).body,[],'RLS changed with the same JWT');
  // Real application user cleanup exercises its dynamic .from(tableName) calls.
  const created=await fetch(`${url}/auth/v1/admin/users`,{method:'POST',headers:{Authorization:`Bearer ${service}`,'Content-Type':'application/json'},
    body:JSON.stringify({email:'p11-cleanup@local.test',email_confirm:true})});
  assert.equal(created.status,200);const disposable=await created.json() as {id:string};
  assert.equal((await api('admin',`/api/admin/users/${disposable.id}/role`,'PATCH',{roleKey:'viewer'})).status,200);
  assert.equal((await api('admin',`/api/admin/users/${disposable.id}`,'DELETE')).status,200);
  assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1',[disposable.id])).rows[0].n,0);
  const callSheet=await dataApiCallSheet(appUrl,users.viewer,directory);
  const report={observations,invalidAuthDenied:true,rolePromotionDemotionRevocationSameJwt:true,adminUserCleanup:true,callSheet};
  writeFileSync(`${directory}/data-api-actors.json`,JSON.stringify(report,null,2));return report;
}
