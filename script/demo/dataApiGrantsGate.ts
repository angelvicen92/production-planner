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
  for(const table of catalog.tables)if(table.kind==='r'||table.kind==='p')
    assert.equal(table.rls,true,`${table.name}: every public table, including future migrations, requires RLS`);
  const anchoredSchema=Object.hasOwn(catalog.tables.find(t=>t.name==='plans')?.columns??{},'daily_anchored_accompaniments');
  const taskScopeSchema=Object.hasOwn(catalog.tables.find(t=>t.name==='plans')?.columns??{},'daily_task_operation_scopes');
  const expected=JSON.parse(readFileSync(anchoredSchema?'script/demo/fixtures/data-api-privileges-116.json':contractPath,'utf8'));
  const scopeFunctions=['apply_day_config_operation_before_task_operation_scopes(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)','assert_daily_task_operation_scopes(integer,jsonb)','assert_task_scope_revision(integer,jsonb)','assert_task_scope_snapshot(integer,jsonb,bigint)','guard_daily_task_operation_scopes()','guard_task_scope_revision()','guard_task_scope_source()','guard_task_scope_stage()','task_scope_contracts(jsonb)','task_scope_member_ids(jsonb)','task_scope_task_operations(integer,jsonb,jsonb,jsonb)'];
  if(taskScopeSchema){
    for(const signature of scopeFunctions)for(const role of ['anon','authenticated','service_role'])expected.functions.push({signature,role,execute:role==='service_role'&&!signature.startsWith('guard_')});
    expected.functions.sort((a:any,b:any)=>a.signature<b.signature?-1:a.signature>b.signature?1:a.role<b.role?-1:a.role>b.role?1:0);
    for(const role of ['anon','authenticated','service_role']){
      const plan=catalog.tables.find(t=>t.name==='plans'&&t.role===role);assert.ok(plan);
      assert.deepEqual(plan.columns.daily_task_operation_scopes,role==='service_role'?['SELECT','INSERT','UPDATE']:role==='authenticated'?['SELECT']:[],`Data API contract changed: 117 effective plan-column privileges for ${role}`);
      for(const signature of scopeFunctions){const fn=catalog.functions.find(f=>f.signature===signature&&f.role===role);assert.ok(fn,signature);assert.equal(fn.definer,false);assert.deepEqual(fn.settings,['search_path=""']);}
    }
  }
  const choiceFunctions=['assert_daily_anchored_accompaniments_v1(integer,jsonb)','assert_anchored_selected_snapshot(integer,jsonb,bigint,jsonb)','assert_anchored_choice_witness(integer,jsonb,bigint)','assert_daily_anchored_snapshot_v1(integer,jsonb,bigint)'];
  if(catalog.functions.some(f=>f.signature===choiceFunctions[2])){
    for(const signature of choiceFunctions)for(const role of ['anon','authenticated','service_role']){
      expected.functions.push({signature,role,execute:role==='service_role'});
      const fn=catalog.functions.find(f=>f.signature===signature&&f.role===role);assert.ok(fn,signature);assert.equal(fn.definer,false);assert.deepEqual(fn.settings,['search_path=""']);
    }
    expected.functions.sort((a:any,b:any)=>a.signature<b.signature?-1:a.signature>b.signature?1:a.role<b.role?-1:a.role>b.role?1:0);
  }
  const composition='assert_reality_authorities_disjoint(jsonb,jsonb)';
  if(catalog.functions.some(f=>f.signature===composition)){
    for(const role of ['anon','authenticated','service_role']){
      expected.functions.push({signature:composition,role,execute:role==='service_role'});
      const fn=catalog.functions.find(f=>f.signature===composition&&f.role===role);assert.ok(fn);assert.equal(fn.definer,false);assert.deepEqual(fn.settings,['search_path=""']);
    }
    expected.functions.sort((a:any,b:any)=>a.signature<b.signature?-1:a.signature>b.signature?1:a.role<b.role?-1:a.role>b.role?1:0);
  }
  if(Object.hasOwn(catalog.tables.find(t=>t.name==='plans')?.columns??{},'daily_joint_groups')){
    const signatures=['apply_day_config_operation_before_joint_groups(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)','assert_daily_joint_groups(integer,jsonb)','assert_joint_revision(integer,jsonb)','guard_daily_joint_groups()','guard_joint_revision()','guard_joint_source()','guard_joint_stage()','joint_contracts(jsonb)','joint_member_ids(jsonb)','joint_task_operations(integer,jsonb,jsonb,jsonb)','joint_task_resources(integer,bigint)'];
    for(const role of ['anon','authenticated','service_role']){
      const plan=catalog.tables.find(t=>t.name==='plans'&&t.role===role);assert.ok(plan);
      assert.deepEqual(plan.columns.daily_joint_groups,role==='service_role'?['SELECT','INSERT','UPDATE']:role==='authenticated'?['SELECT']:[]);
      for(const signature of signatures){
        expected.functions.push({signature,role,execute:role==='service_role'&&!signature.startsWith('guard_')});
        const fn=catalog.functions.find(f=>f.signature===signature&&f.role===role);assert.ok(fn,signature);assert.equal(fn.definer,false);assert.deepEqual(fn.settings,['search_path=""']);
      }
    }
    expected.functions.sort((a:any,b:any)=>a.signature<b.signature?-1:a.signature>b.signature?1:a.role<b.role?-1:a.role>b.role?1:0);
  }
  if(Object.hasOwn(catalog.tables.find(t=>t.name==='plans')?.columns??{},'daily_operational_meal_policies')){
    for(const role of ['anon','authenticated','service_role']){
      const plan=catalog.tables.find(t=>t.name==='plans'&&t.role===role);assert.ok(plan);
      assert.deepEqual(plan.columns.daily_operational_meal_policies,role==='service_role'?['SELECT','INSERT','UPDATE']:role==='authenticated'?['SELECT']:[]);
      for(const signature of ['assert_daily_operational_meals(integer,jsonb)','assert_operational_meal_snapshot(integer,jsonb,bigint)','guard_daily_operational_meals()']){
        expected.functions.push({signature,role,execute:role==='service_role'&&!signature.startsWith('guard_')});
        const fn=catalog.functions.find(f=>f.signature===signature&&f.role===role);assert.ok(fn,signature);assert.equal(fn.definer,false);assert.deepEqual(fn.settings,['search_path=""']);
      }
    }
    expected.functions.sort((a:any,b:any)=>a.signature<b.signature?-1:a.signature>b.signature?1:a.role<b.role?-1:a.role>b.role?1:0);
  }
  // 127 adds one daily column and four private invoker consumers. Keep the
  // inventory exact: no wildcard acceptance of future functions or grants.
  if(Object.hasOwn(catalog.tables.find(t=>t.name==='plans')?.columns??{},'daily_resource_route_transitions')){
    const signatures=['assert_daily_resource_routes(integer,jsonb)','resource_transition_minutes(jsonb,text,text,text,integer)',
      'resource_transition_pair_minutes(jsonb,jsonb,jsonb,integer)','guard_daily_resource_routes()'];
    for(const role of ['anon','authenticated','service_role']){
      const plan=catalog.tables.find(t=>t.name==='plans'&&t.role===role);assert.ok(plan);
      assert.deepEqual(plan.columns.daily_resource_route_transitions,role==='service_role'?['SELECT','INSERT','UPDATE']:role==='authenticated'?['SELECT']:[]);
      for(const signature of signatures){
        const execute=role==='service_role'&&!signature.startsWith('guard_');
        expected.functions.push({signature,role,execute});
        const fn=catalog.functions.find(f=>f.signature===signature&&f.role===role);assert.ok(fn,signature);
        assert.equal(fn.definer,false);assert.deepEqual(fn.settings,['search_path=""']);assert.equal(fn.execute,execute);
      }
    }
    expected.functions.sort((a:any,b:any)=>a.signature<b.signature?-1:a.signature>b.signature?1:a.role<b.role?-1:a.role>b.role?1:0);
  }
  assert.deepEqual(privilegeContract(catalog),expected,
    'Data API contract changed: review every new object, required grant, column boundary and exposed role');
  // 103 adds one column covered by the existing table grants. The compact JSON
  // omits table-inherited column permissions, so verify this new column too.
  for(const role of ['anon','authenticated','service_role']) {
    const table=catalog.tables.find(t=>t.name==='task_templates'&&t.role===role);assert.ok(table);
    assert.deepEqual(table.columns.revision,role==='service_role'?['SELECT','INSERT','UPDATE']:[],`103 revision effective privileges for ${role}`);
    for(const signature of ['bump_task_template_revision()','save_task_template_with_inverse(bigint,uuid,jsonb,jsonb,bigint[],bigint[])']) {
      const fn=catalog.functions.find(f=>f.signature===signature&&f.role===role);assert.ok(fn);
      assert.equal(fn.definer,false,`${signature} must remain SECURITY INVOKER`);
      assert.deepEqual(fn.settings,['search_path=""'],`${signature} must keep an empty search_path`);
    }
  }
  // 114 reuses plans' table grants; its new authority still requires the
  // versioned writer. Internal helpers remain invoker and private to the server.
  for(const role of ['anon','authenticated','service_role']) {
    const plan=catalog.tables.find(t=>t.name==='plans'&&t.role===role);assert.ok(plan);
    assert.deepEqual(plan.columns.daily_round_synchronization,role==='service_role'?['SELECT','INSERT','UPDATE']:role==='authenticated'?['SELECT']:[],`114 daily authority privileges for ${role}`);
    for(const signature of ['assert_daily_round_structure(integer,jsonb)','assert_daily_round_snapshot(integer,jsonb,bigint)','round_structure_canonical_json(jsonb)','guard_daily_round_synchronization()']) {
      const fn=catalog.functions.find(f=>f.signature===signature&&f.role===role);assert.ok(fn);
      assert.equal(fn.definer,false);assert.deepEqual(fn.settings,['search_path=""']);
      assert.equal(fn.execute,role==='service_role'&&signature!=='guard_daily_round_synchronization()');
    }
  }
  // 115 inherits the same column boundary as 114. Table-level grants alone
  // cannot authorize authority writes: the versioned-operation trigger must run.
  for(const role of ['anon','authenticated','service_role']) {
    const plan=catalog.tables.find(t=>t.name==='plans'&&t.role===role);assert.ok(plan);
    assert.deepEqual(plan.columns.daily_technical_chains,role==='service_role'?['SELECT','INSERT','UPDATE']:role==='authenticated'?['SELECT']:[]);
    for(const [signature,serverExecute] of [
      ['apply_day_config_operation_v5(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)',true],
      ['apply_day_config_operation_before_technical_chains(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)',true],
      ['assert_daily_technical_chains(integer,jsonb)',true],
      ['assert_daily_technical_chain_snapshot(integer,jsonb,bigint,bigint)',true],
      ['guard_daily_technical_chains()',false],['guard_technical_chain_revision()',false],['guard_daily_technical_chain_stage()',false],
    ] as const) {
      const fn=catalog.functions.find(f=>f.signature===signature&&f.role===role);assert.ok(fn,signature);
      assert.equal(fn.definer,false,signature);assert.deepEqual(fn.settings,['search_path=""'],signature);
      assert.equal(fn.execute,role==='service_role'&&serverExecute,signature+' '+role);
    }
  }
  // 116 inherits the daily column boundary; every new helper is invoker and
  // private, and task-source guards have no directly callable server grant.
  if(anchoredSchema)for(const role of ['anon','authenticated','service_role']){
    const plan=catalog.tables.find(t=>t.name==='plans'&&t.role===role);assert.ok(plan);
    assert.deepEqual(plan.columns.daily_anchored_accompaniments,role==='service_role'?['SELECT','INSERT','UPDATE']:role==='authenticated'?['SELECT']:[]);
    for(const signature of ["anchored_contracts(jsonb)", "anchored_member_ids(jsonb)", "anchored_task_operations(integer,jsonb,jsonb,jsonb,boolean)", "apply_day_config_operation_before_anchored_accompaniments(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)", "assert_daily_anchored_accompaniments(integer,jsonb)", "assert_daily_anchored_snapshot(integer,jsonb,bigint)", "guard_daily_anchored_accompaniments()", "guard_anchored_revision()", "guard_daily_anchored_stage()", "guard_anchored_task_source()", "guard_anchored_coach_source()"]){
      const fn=catalog.functions.find(f=>f.signature===signature&&f.role===role);assert.ok(fn,signature);
      assert.equal(fn.definer,false,signature);assert.deepEqual(fn.settings,['search_path=""'],signature);
      assert.equal(fn.execute,role==='service_role'&&!signature.startsWith('guard_'),signature+' '+role);
    }
  }

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
  // Mutate real effective permissions, including PUBLIC inheritance and column
  // grants. Every unauthorized delta must still fail the same strict gate.
  const rpc='public.save_task_template_with_inverse(bigint,uuid,jsonb,jsonb,bigint[],bigint[])';
  const negative103=[
    `GRANT EXECUTE ON FUNCTION ${rpc} TO PUBLIC`,
    `GRANT EXECUTE ON FUNCTION ${rpc} TO anon`,
    `GRANT EXECUTE ON FUNCTION ${rpc} TO authenticated`,
    `REVOKE EXECUTE ON FUNCTION ${rpc} FROM service_role`,
    'GRANT EXECUTE ON FUNCTION public.bump_task_template_revision() TO service_role',
    'GRANT SELECT(revision) ON public.task_templates TO anon',
    'GRANT UPDATE(revision) ON public.task_templates TO authenticated',
  ];
  for(const mutation of negative103) {
    await db.query('BEGIN');
    try {
      await db.query(mutation);
      const changed=await dataApiCatalog(db);
      assert.throws(()=>assertPrivilegeContract(changed),/Data API contract changed/,mutation);
    }finally {await db.query('ROLLBACK');}
  }
  const negative115=[
    'GRANT EXECUTE ON FUNCTION public.assert_daily_anchored_snapshot(integer,jsonb,bigint) TO authenticated',
    'GRANT EXECUTE ON FUNCTION public.guard_anchored_task_source() TO service_role',
    'GRANT UPDATE(daily_anchored_accompaniments) ON public.plans TO authenticated',
    'GRANT EXECUTE ON FUNCTION public.apply_day_config_operation_before_technical_chains(integer,uuid,text,jsonb,bigint,jsonb,jsonb,jsonb,jsonb,jsonb) TO PUBLIC',
    'GRANT EXECUTE ON FUNCTION public.assert_daily_technical_chain_snapshot(integer,jsonb,bigint,bigint) TO authenticated',
    'GRANT EXECUTE ON FUNCTION public.guard_technical_chain_revision() TO service_role',
    'GRANT UPDATE(daily_technical_chains) ON public.plans TO authenticated',
    'GRANT SELECT(daily_technical_chains) ON public.plans TO anon',
  ];
  for(const mutation of negative115) {
    await db.query('BEGIN');
    try {await db.query(mutation);const changed=await dataApiCatalog(db);assert.throws(()=>assertPrivilegeContract(changed),/Data API contract changed/);}
    finally {await db.query('ROLLBACK');}
  }
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
    migration103EffectivePrivilegesVerified:true,migration103NegativeMutationsDetected:negative103.length,
    migration115EffectivePrivilegesVerified:true,migration115NegativeMutationsDetected:negative115.length,
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
  const authorityBefore=(await db.query('SELECT to_jsonb(p) row FROM plans p WHERE id=$1',[planId])).rows;
  const technicalAuthority=[];
  for(const role of ['anon','norole','viewer','aux','production','admin','service_role']) {
    const token=role==='anon'?anon:role==='service_role'?service:users[role].token;
    const read=await rest(token,`plans?id=eq.${planId}&select=id,daily_technical_chains`);
    assert.equal(read.status,role==='anon'?401:200);
    if(['norole','anon'].includes(role)&&Array.isArray(read.body))assert.deepEqual(read.body,[]);
    const write=await rest(token,`plans?id=eq.${planId}`,'PATCH',{daily_technical_chains:{contractVersion:1,policies:[]}});
    assert.equal(write.status,role==='anon'?401:role==='service_role'?400:403,JSON.stringify(write));
    assert.equal(write.body.code,role==='service_role'?'P0001':'42501');
    if(role==='service_role')assert.equal(write.body.message,'TECHNICAL_CHAIN_REQUIRES_VERSIONED_OPERATION');
    // The renamed invoker is still intentionally callable by the trusted server
    // (nested invoker calls need EXECUTE), never by a functional application role.
    const delegated=await rest(token,'rpc/apply_day_config_operation_before_technical_chains','POST',{
      p_plan_id:0,p_actor:users.admin.id,p_operation:'EDIT',p_payload:{},p_expected_revision:null,
      p_expected_identity:{},p_expected_replay:{},p_candidate_identity:{},p_candidate_replay:{},p_diff:{},
    });
    assert.equal(delegated.status,role==='anon'?401:role==='service_role'?400:403,JSON.stringify(delegated));
    assert.equal(delegated.body.code,role==='service_role'?'P0001':'42501');
    if(role==='service_role')assert.equal(delegated.body.message,'PLAN_NOT_FOUND');
    assert.deepEqual((await db.query('SELECT to_jsonb(p) row FROM plans p WHERE id=$1',[planId])).rows,authorityBefore);
    technicalAuthority.push({role,columnRead:{status:read.status,rows:Array.isArray(read.body)?read.body.length:null},
      directAuthorityWrite:write,internalDelegate:delegated,atomicNoChange:true});
  }
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
  const report={observations,technicalAuthority,invalidAuthDenied:true,rolePromotionDemotionRevocationSameJwt:true,adminUserCleanup:true,callSheet};
  writeFileSync(`${directory}/data-api-actors.json`,JSON.stringify(report,null,2));return report;
}
