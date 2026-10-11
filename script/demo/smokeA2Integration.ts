/** Real disposable PostgreSQL / GoTrue / PostgREST / product HTTP / Chromium.
 * No remote-target option, RPC substitution, request interception or solved seed.
 */
import assert from 'node:assert/strict';
import {execFileSync,spawn,type ChildProcess} from 'node:child_process';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync,createWriteStream} from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import {resolve} from 'node:path';
import pg from 'pg';
import {buildA2ImportSQL} from './prepareA2Import';
import {buildA2SchemaSQL} from './prepareA2Schema';
import {inspectA2Catalog} from './a2Preflight';
import {runA2BrowserJourney} from './smokeA2Journey';

const images={db:'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',auth:'supabase/gotrue:v2.177.0@sha256:6a916b47af0386b7e0152ca84f3d45d050bf056e449a75a5460b48742fd67822',rest:'postgrest/postgrest:v12.2.12@sha256:5f4ce744539bbba786b4e24dbbd95bdb2a956dcf568c5374995a0ff4a68f5bd2'};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function eventually(check:()=>Promise<unknown>,timeout=60_000){
 const end=Date.now()+timeout;let last:unknown;
 do{try{return await check();}catch(error){last=error;await delay(250);}}while(Date.now()<end);
 throw last;
}
async function freePort(){const s=net.createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const port=(s.address() as net.AddressInfo).port;await new Promise<void>(r=>s.close(()=>r()));return port;}

if(process.argv.includes('--app')){
 // The parent supplies freshly generated local credentials; reject other hosts.
 assert.equal(new URL(process.env.SUPABASE_URL!).hostname,'127.0.0.1');
 assert.equal(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_URL);
 await import('../../server/index');
}else{
 const full=process.argv.includes('--full');
 const directory=resolve(process.argv.slice(2).find(a=>!a.startsWith('--'))??'work/a2-integration-smoke');
 mkdirSync(directory,{recursive:true,mode:0o700});
 const id=`optiplan-a2-${randomBytes(6).toString('hex')}`;
 const secret=randomBytes(32).toString('hex'),password=randomBytes(20).toString('hex');
 const jwt=(role:string)=>{const parts=[{alg:'HS256',typ:'JWT'},{role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url'));return [...parts,createHmac('sha256',secret).update(parts.join('.')).digest('base64url')].join('.');};
 const anon=jwt('anon'),service=jwt('service_role');
 const dockerEnv={...process.env};
 for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[k];
 const docker=(...args:string[])=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const owned:string[]=[];let network=false,gateway:http.Server|undefined,app:ChildProcess|undefined,db:pg.Client|undefined;
 const runtimeFiles=['server/storage.ts','server/assistedPlanningSnapshot.ts','server/assistedProposalService.ts','server/assistedPlanningService.ts','server/routes.ts','engine/planner-next/jointCompletionWitness.ts','engine/planner-next/exactItinerantPlan.ts','client/src/components/layout.tsx','client/src/components/planning/assisted-planning-workspace.tsx','script/demo/a2ImportRows.ts','script/demo/prepareA2Import.ts','script/demo/prepareA2Schema.ts','script/demo/smokeA2Integration.ts','script/demo/smokeA2Journey.ts','client/src/lib/assisted-planning-view.ts','client/src/lib/assisted-draft-warnings.ts'];
 const hashes=()=>Object.fromEntries(runtimeFiles.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
 const report:any={mode:'REAL_DISPOSABLE_PRODUCT_INTEGRATION',remoteWrites:0,images,requestedStages:full?10:2,startedAt:new Date().toISOString(),runtimeHashes:hashes(),checks:[],pending:['Connected Supabase catalog/backup adoption and original-row preservation','Published Replit runtime and user browser','Supabase Realtime/WebSocket transport']};
 const pass=(name:string)=>{report.checks.push(name);console.log(`PASS ${name}`);};
 const cleanup=async()=>{
  if(app&&app.exitCode===null){app.kill('SIGTERM');await Promise.race([new Promise(r=>app!.once('exit',r)),delay(3000)]);if(app.exitCode===null)app.kill('SIGKILL');}
  gateway?.closeAllConnections();if(gateway)await new Promise<void>(r=>gateway!.close(()=>r()));
  await db?.end().catch(()=>{});
  for(const name of owned.reverse())try{docker('rm','-f','-v',name);}catch{}
  if(network)try{docker('network','rm',id);}catch{}
 };
 try{
  docker('info','--format','{{.ServerVersion}}');docker('network','create',id);network=true;
  const start=(name:string,image:string,port:number,settings:Record<string,string>,alias?:string)=>{
   const container=`${id}-${name}`;owned.push(container);
   docker('run','-d','--name',container,'--network',id,...(alias?['--network-alias',alias]:[]),'-p',`127.0.0.1::${port}`,...Object.entries(settings).flatMap(([k,v])=>['-e',`${k}=${v}`]),image);
   return Number(JSON.parse(docker('inspect',container))[0].NetworkSettings.Ports[`${port}/tcp`][0].HostPort);
  };
  const dbPort=start('db',images.db,5432,{POSTGRES_PASSWORD:password},'db');
  await eventually(async()=>{const c=new pg.Client({host:'127.0.0.1',port:dbPort,user:'postgres',password,database:'postgres'});try{await c.connect();await c.query('SELECT 1');}finally{await c.end();}});
  db=new pg.Client({host:'127.0.0.1',port:dbPort,user:'postgres',password,database:'postgres'});await db.connect();
  report.postgresVersion=(await db.query('SELECT version() AS version')).rows[0].version;
  // Platform primitives only: application tables/functions/triggers come from
  // the complete, unmodified migration ledger below. Auth owns its own schema.
  await db.query(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE authenticator LOGIN PASSWORD '${password}';GRANT anon,authenticated,service_role TO authenticator;
   CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
   GRANT USAGE ON SCHEMA public,auth,extensions TO anon,authenticated,service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
  const appPort=await freePort(),gatewayPort=await freePort(),url=`http://127.0.0.1:${gatewayPort}`,appUrl=`http://127.0.0.1:${appPort}`;
  const authPort=start('auth',images.auth,9999,{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:`${url}/auth/v1`,GOTRUE_SITE_URL:appUrl,GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://postgres:${password}@db:5432/postgres?search_path=auth`,GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true'});
  await eventually(async()=>assert.equal((await fetch(`http://127.0.0.1:${authPort}/health`)).status,200));
  report.migrations=[];
  for(const file of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort()){
   const sql=readFileSync(`supabase/migrations/${file}`,'utf8');await db.query(sql);
   report.migrations.push({file,sha256:createHash('sha256').update(sql).digest('hex')});
  }
  pass('entire native application migration ledger');
  const restPort=start('rest',images.rest,3000,{PGRST_DB_URI:`postgres://authenticator:${password}@db:5432/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_PORT:'3000'});
  gateway=http.createServer((req,res)=>{
   res.setHeader('Access-Control-Allow-Origin',appUrl);res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']??'authorization,apikey,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const path=req.url??'/',isAuth=path.startsWith('/auth/v1/'),isRest=path.startsWith('/rest/v1/');
   if(!isAuth&&!isRest){res.writeHead(404);res.end();return;}
   const port=isAuth?authPort:restPort,prefix=isAuth?'/auth/v1':'/rest/v1';
   const upstream=http.request({hostname:'127.0.0.1',port,path:path.slice(prefix.length),method:req.method,headers:{...req.headers,host:`127.0.0.1:${port}`}},response=>{for(const [k,v] of Object.entries(response.headers))if(v!==undefined)res.setHeader(k,v);res.writeHead(response.statusCode??502);response.pipe(res);});
   upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
  });
  await new Promise<void>(r=>gateway!.listen(gatewayPort,'127.0.0.1',r));
  await eventually(async()=>assert.equal((await fetch(`${url}/rest/v1/`,{headers:{apikey:anon}})).status,200));
  const users:Record<string,{id:string;email:string;password:string;token:string}>={};
  for(const role of ['admin','production','aux','viewer','norole']){
   const email=`${role}@a2.local.test`,loginPassword=`A2-${randomBytes(18).toString('hex')}!`,headers={Authorization:`Bearer ${service}`,apikey:service,'Content-Type':'application/json'};
   const created=await fetch(`${url}/auth/v1/admin/users`,{method:'POST',headers,body:JSON.stringify({email,password:loginPassword,email_confirm:true,role:'authenticated'})});assert.equal(created.status,200);const user:any=await created.json();
   const login=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers,body:JSON.stringify({email,password:loginPassword})});assert.equal(login.status,200);const session:any=await login.json();assert.equal(session.user.role,'authenticated');
   users[role]={id:user.id,email,password:loginPassword,token:session.access_token};
   if(role!=='norole')await db.query('INSERT INTO public.user_roles(user_id,role_id) SELECT $1,id FROM public.roles WHERE key=$2',[user.id,role]);
  }
  pass('real password login for five Auth identities');
  const defaults=async()=>JSON.stringify((await db!.query('SELECT (SELECT jsonb_agg(to_jsonb(p)) FROM public.program_settings p) AS program,(SELECT jsonb_agg(to_jsonb(o)) FROM public.optimizer_settings o) AS optimizer')).rows);
  const beforeDefaults=await defaults();
  // These assertions authorize ONLY this newly created local database. They
  // provide no approval evidence about a connected project or its backup.
  await db.query(`SET optiplan.confirmed_demo_project='dyqusivzgxebkxkwohwn';SET optiplan.backup_sha256='${'a'.repeat(64)}';SET optiplan.schema_approved='yes';SET optiplan.security_approved='yes';SET optiplan.import_approved='yes';SET optiplan.demo_actor='${users.production.id}';`);
  report.preparedSchemaSha256=createHash('sha256').update(buildA2SchemaSQL()).digest('hex');
  // A fresh ledger already owns 088. The adoption bundle targets catalog drift
  // in an existing database; its independent restoration tests remain required.
  await db.query(readFileSync('script/demo/sql/security.sql','utf8'));
  const {dataset,sql}=buildA2ImportSQL('2026-10-30');await db.query(sql);assert.equal(await defaults(),beforeDefaults);
  const results:any=await db.query(readFileSync('script/demo/sql/catalog-audit.sql','utf8'));
  const catalog=results.find((r:any)=>r.rows?.[0]?.audit)?.rows[0].audit;
  assert.ok(catalog);assert.deepEqual(inspectA2Catalog(catalog,'2026-10-30').issues,[]);
  pass('native schema/prepared security/import and actual SQL catalog preflight; global defaults preserved');
  await db.query("NOTIFY pgrst,'reload schema'");
  const localEnv={...process.env,SUPABASE_URL:url,VITE_SUPABASE_URL:url,SUPABASE_ANON_KEY:anon,VITE_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,DATABASE_URL:`postgres://postgres:${password}@127.0.0.1:${dbPort}/postgres`,PORT:String(appPort),NODE_ENV:'development',ADMIN_EMAIL:users.admin.email};
  delete (localEnv as Record<string,unknown>).REPL_ID;
  const appLog=createWriteStream(`${directory}/app-private.log`,{mode:0o600});
  app=spawn(process.execPath,['--import','tsx',resolve('script/demo/smokeA2Integration.ts'),'--app'],{env:localEnv,stdio:['ignore','pipe','pipe']});app.stdout!.pipe(appLog);app.stderr!.pipe(appLog);
  await eventually(async()=>{assert.equal(app!.exitCode,null,'product server exited');const r=await fetch(`${appUrl}/api/plans/${dataset.input.planId}`,{headers:{Authorization:`Bearer ${users.production.token}`}});assert.equal(r.status,200);});
  Object.assign(process.env,{SUPABASE_URL:url,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service});
  const {storage}=await import('../../server/storage');const {buildEngineInput}=await import('../../engine/buildInput');const {adaptEngineInputToPlannerNextProblem}=await import('../../engine/planner-next/integration/engineInputAdapter');
  const actual=adaptEngineInputToPlannerNextProblem(await buildEngineInput(dataset.input.planId,storage)),expected=adaptEngineInputToPlannerNextProblem(dataset.input);
  assert.equal(actual.status,'SUPPORTED');assert.equal(expected.status,'SUPPORTED');if(actual.status==='SUPPORTED'&&expected.status==='SUPPORTED')assert.deepEqual(actual.problem,expected.problem);
  assert.equal((await db.query('SELECT count(*) AS n FROM public.plan_breaks WHERE plan_id=$1',[dataset.input.planId])).rows[0].n,'0');
  pass('real storage/input adapter canon after GET day; no legacy breaks');
  report.journey=await runA2BrowserJourney({appUrl,url,anon,users,db,planId:dataset.input.planId,directory,full,pass,buildInput:()=>buildEngineInput(dataset.input.planId,storage)});
  assert.deepEqual(hashes(),report.runtimeHashes,'runtime sources changed during integration rehearsal');
  report.status='PASS';report.finishedAt=new Date().toISOString();
 }catch(error){report.status='FAIL';report.error=(error instanceof Error?error.stack??error.message:String(error)).replaceAll(password,'[local secret]').replaceAll(secret,'[local secret]');process.exitCode=1;console.error(report.error);}
 finally{await cleanup();writeFileSync(`${directory}/integration.json`,JSON.stringify(report,null,2));}
 console.log(JSON.stringify({status:report.status,evidence:`${directory}/integration.json`,remoteWrites:0}));
}
