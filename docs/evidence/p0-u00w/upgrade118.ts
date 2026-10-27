/** Apply literal 118 to populated historical 117, using the existing owned PG17 bootstrap. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
const output=resolve(process.argv[2]);assert.ok(!existsSync(output),'Choose fresh output');
for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[k];
const repo=process.cwd(),source=join(output,'source');mkdirSync(source,{recursive:true});
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive','HEAD'],{maxBuffer:256*1024*1024})});
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const migration='supabase/migrations/118_anchored_operation_unit_choices.sql';copyFileSync(migration,join(source,migration));
for(const file of ['script/demo/assistedSQLContracts.ts','script/demo/a2Preflight.ts','script/demo/dataApiGrantsGate.ts','script/demo/fixtures/data-api-privileges.json','script/demo/fixtures/data-api-privileges-116.json'])copyFileSync(file,join(source,file));
const original=readFileSync('docs/evidence/p0-u00s/integration/sql-gate.ts','utf8'),boundary=original.indexOf(' const before=await dataApiCatalog(db);');assert.ok(boundary>0);
const code=original.slice(0,boundary)+String.raw`
 await db.query(readFileSync('supabase/migrations/115_daily_required_technical_chains.sql','utf8'));
 await db.query(readFileSync('supabase/migrations/116_daily_anchored_accompaniments.sql','utf8'));
 await db.query(readFileSync('supabase/migrations/117_daily_task_operation_scopes.sql','utf8'));
 const actor='00000000-0000-0000-0000-000000000001';
 await db.query('INSERT INTO auth.users VALUES($1)',[actor]);
 await db.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE key='admin'",[actor]);
 await db.query("SET optiplan.confirmed_demo_project='dyqusivzgxebkxkwohwn';SET optiplan.backup_sha256='"+'a'.repeat(64)+"';SET optiplan.schema_approved='yes';SET optiplan.security_approved='yes';SET optiplan.import_approved='yes';SET optiplan.demo_actor='"+actor+"';");
 await seedA2HistoricalRehearsal(db,actor);
 const tables=(await db.query("SELECT table_name name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(r=>r.name);
 const rows=async()=>{const all:any={};for(const table of tables){assert.match(table,/^[a-z_]+$/);all[table]=(await db!.query('SELECT coalesce(jsonb_agg(v ORDER BY v::text),\'[]\') rows FROM (SELECT to_jsonb(t) v FROM public.'+table+' t) q')).rows[0].rows;}return all;};
 const readers=async()=>({sources:(await db!.query('SELECT id,assisted_read_bootstrap_sources(id::integer) sources FROM plans ORDER BY id')).rows,
  expected:(await db!.query('SELECT id,assisted_expected_obligation_sources(id) sources FROM assisted_planning_sessions ORDER BY id')).rows,
  preview:(await db!.query('SELECT plan_id,assisted_preview_s0_additions(plan_id::integer) preview FROM assisted_planning_sessions ORDER BY id')).rows});
 const policies=async()=>(await db!.query("SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname")).rows;
 const before={rows:await rows(),readers:await readers(),policies:await policies()};
 const sql=readFileSync('supabase/migrations/118_anchored_operation_unit_choices.sql','utf8');await db.query(sql);
 assert.equal((await db.query('SELECT count(*)::int n FROM plans WHERE daily_task_operation_scopes IS NOT NULL')).rows[0].n,0);
 const after={rows:await rows(),readers:await readers(),policies:await policies()};assert.deepEqual(after,before);
 const {assertPrivilegeContract}=await import('../../../../script/demo/dataApiGrantsGate');assertPrivilegeContract(await dataApiCatalog(db));
 const {requiredFunctionBodies}=await import('../../../../script/demo/a2Preflight');
 for(const [name,body] of requiredFunctionBodies(false,118)){
  const defs=(await db.query("SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1",[name])).rows;
  assert.ok(defs.some(d=>{const m=d.definition.match(/\bAS\s+(\$\w*\$)([\s\S]*)/i);return m&&m[2].slice(0,m[2].indexOf(m[1])).trim()===body;}),'actual PostgreSQL body '+name);
 }

 for(const match of sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.([a-z_][a-z0-9_]*)\s*\([\s\S]*?\bAS\s*\$\$([\s\S]*?)\$\$;/gi)){
  const definition=(await db.query("SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1",[match[1]])).rows[0].definition;
  const body=definition.match(/\bAS\s+(\$\w*\$)([\s\S]*)/i);assert.equal(body[2].slice(0,body[2].indexOf(body[1])).trim(),match[2].trim(),'full helper body '+match[1]);
 }
 const grants=(await db.query("SELECT p.proname name,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,p.prosecdef security_definer,p.proconfig settings FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND ((p.proname LIKE '%anchored%' OR p.proname LIKE '%task_scope%' OR p.proname LIKE '%task_operation_scopes%') OR p.proname='apply_day_config_operation_v5') ORDER BY p.proname")).rows;
 for(const g of grants){assert.equal(g.anon,false);assert.equal(g.authenticated,false);assert.equal(g.security_definer,false);}
 const {gzipSync}=await import('node:zlib');
 writeFileSync(directory+'/before.json.gz',gzipSync(JSON.stringify(before)));
 writeFileSync(directory+'/after.json.gz',gzipSync(JSON.stringify(after)));
 save('upgrade118',{status:'PASS',postgres:(await db.query('SELECT version() version')).rows[0].version,migrationSha256:createHash('sha256').update(sql).digest('hex'),
  counts:Object.fromEntries(Object.entries(before.rows).map(([k,v]:any)=>[k,v.length])),allOriginalRowsExact:true,sourceReadersExact:true,policiesExact:true,historicalAuthoritiesUnadopted:true,grants,remoteWrites:0});
 console.log('PASS populated historical 117 -> literal 118: original rows, snapshots, readers, RLS and private grants');
}finally{await db?.end();docker('rm','-f',container);}
`;
const path='docs/evidence/p0-u00s/integration/u00w-upgrade118.ts';writeFileSync(join(source,path),code);
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
writeFileSync(join(output,'manifest.json'),JSON.stringify({base:'25aaa056970e86f0fd13e90570fa1fcf5582a97c',remoteWrites:0,bootstrap:'docs/evidence/p0-u00s/integration/sql-gate.ts',bootstrapSha256:sha(original),executedCodeSha256:sha(code),migrationSha256:sha(readFileSync(migration))},null,2));
const run=spawnSync(process.execPath,['--import','tsx',path,join(output,'native')],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});assert.equal(run.status,0);
