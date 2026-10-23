/** Disposable native stack for genuinely new UI-created days. No A2 import or fixture. */
import assert from "node:assert/strict";
import {execFileSync,spawn,type ChildProcess} from "node:child_process";
import {createHash,createHmac,randomBytes} from "node:crypto";
import {mkdirSync,readFileSync,readdirSync,writeFileSync,createWriteStream} from "node:fs";
import http from "node:http";
import net from "node:net";
import {resolve} from "node:path";
import pg from "pg";
const images={db:'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',auth:'supabase/gotrue:v2.177.0@sha256:6a916b47af0386b7e0152ca84f3d45d050bf056e449a75a5460b48742fd67822',rest:'postgrest/postgrest:v12.2.12@sha256:5f4ce744539bbba786b4e24dbbd95bdb2a956dcf568c5374995a0ff4a68f5bd2'};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function eventually(check:()=>Promise<unknown>,timeout=60_000){
 const end=Date.now()+timeout;let last:unknown;
 do{try{return await check();}catch(error){last=error;await delay(250);}}while(Date.now()<end);
 throw last;
}
async function freePort(){const s=net.createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const port=(s.address() as net.AddressInfo).port;await new Promise<void>(r=>s.close(()=>r()));return port;}


if(process.argv.includes("--app")) {
 assert.equal(new URL(process.env.SUPABASE_URL!).hostname,"127.0.0.1");
 await import("../../server/index");
} else {
 const restrictedDataApi=true;
 const directory=resolve(process.argv[2]??"/tmp/new-day-integration");
 mkdirSync(directory,{recursive:true,mode:0o700});
 const id=`optiplan-new-day-${randomBytes(6).toString('hex')}`;
 const secret=randomBytes(32).toString('hex'),password=randomBytes(20).toString('hex');
 const jwt=(role:string)=>{const parts=[{alg:'HS256',typ:'JWT'},{role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url'));return [...parts,createHmac('sha256',secret).update(parts.join('.')).digest('base64url')].join('.');};
 const anon=jwt('anon'),service=jwt('service_role');
 const dockerEnv={...process.env};
 for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[k];
 const docker=(...args:string[])=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const owned:string[]=[];let network=false,gateway:http.Server|undefined,app:ChildProcess|undefined,db:pg.Client|undefined;

 const report:any={mode:"REAL_DISPOSABLE_NEW_DAY_UI",remoteWrites:0,images,checks:[],startedAt:new Date().toISOString(),
   sourceHashes:Object.fromEntries(['server/newDayPlannerConfiguration.ts','server/assistedProposalService.ts',
     'engine/buildInput.ts','engine/planner-next/exactMainAndFeederCore.ts','server/storage.ts',
     'server/planOptimizerSnapshotPersistence.ts','server/plannerReadiness.ts','script/demo/smokeNewDayTransportJourney.ts',
     'engine/planner-next/integration/engineInputAdapter.ts','engine/planner-next/exactItinerantPlan.ts','engine/planner-next/validate.ts',
     'script/demo/smokeNewDayIntegration.ts','script/demo/smokeNewDayItinerantJourney.ts','script/demo/smokeNewDaySetupJourney.ts',
     'shared/newDayPlannerConfiguration.ts','server/newDayPlannerConfigurationRoutes.ts','server/effectiveConfigurationView.ts',
     'client/src/components/setup-families-editor.tsx','client/src/components/new-day-planner-editor.tsx','client/src/pages/settings.tsx'].map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')])),
   sourceCommit:(()=>{try{return execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",stdio:['ignore','pipe','ignore']}).trim();}
     catch{return null; /* git archive has no repository metadata; sourceHashes remain exact. */}})()};
 const pass=(name:string)=>{report.checks.push(name);console.log(`PASS ${name}`);};
 try {
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
   ${restrictedDataApi ? `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon,authenticated,service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon,authenticated,service_role;
   ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon,authenticated,service_role;`
   : `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`}`);
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
  const transport:any[]=[];report.transport=transport;
  gateway=http.createServer((req,res)=>{
   res.setHeader('Access-Control-Allow-Origin',appUrl);res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']??'authorization,apikey,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const path=req.url??'/',isAuth=path.startsWith('/auth/v1/'),isRest=path.startsWith('/rest/v1/');
   if(!isAuth&&!isRest){res.writeHead(404);res.end();return;}
   const trace=(path.startsWith('/rest/v1/rpc/'))?{path,method:req.method,contentLength:req.headers['content-length']??null,receivedBytes:0,requestEnded:false,upstreamFinished:false,responseStatus:null as number|null,error:null as string|null}:null;
   if(trace){transport.push(trace);req.on('data',chunk=>trace.receivedBytes+=chunk.length);req.once('end',()=>trace.requestEnded=true);}
   const port=isAuth?authPort:restPort,prefix=isAuth?'/auth/v1':'/rest/v1';
   const upstream=http.request({hostname:'127.0.0.1',port,path:path.slice(prefix.length),method:req.method,headers:{...req.headers,host:`127.0.0.1:${port}`}},response=>{if(trace)trace.responseStatus=response.statusCode??502;for(const [k,v] of Object.entries(response.headers))if(v!==undefined)res.setHeader(k,v);res.writeHead(response.statusCode??502);response.pipe(res);});
   upstream.once('finish',()=>{if(trace)trace.upstreamFinished=true;});
   upstream.on('error',error=>{if(trace)trace.error=error.message;res.writeHead(502);res.end();});req.pipe(upstream);
  });
  await new Promise<void>(r=>gateway!.listen(gatewayPort,'127.0.0.1',r));
  await eventually(async()=>assert.equal((await fetch(`${url}/rest/v1/`,{headers:{apikey:anon}})).status,200));
  const users:Record<string,{id:string;email:string;password:string;token:string}>={};
  for(const role of ['admin','production','aux','viewer','norole']){
   const email=`${role}@new-day.local.test`,loginPassword=`NewDay-${randomBytes(18).toString('hex')}!`,headers={Authorization:`Bearer ${service}`,apikey:service,'Content-Type':'application/json'};
   const created=await fetch(`${url}/auth/v1/admin/users`,{method:'POST',headers,body:JSON.stringify({email,password:loginPassword,email_confirm:true,role:'authenticated'})});assert.equal(created.status,200);const user:any=await created.json();
   const login=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers,body:JSON.stringify({email,password:loginPassword})});assert.equal(login.status,200);const session:any=await login.json();assert.equal(session.user.role,'authenticated');
   users[role]={id:user.id,email,password:loginPassword,token:session.access_token};
   if(role!=='norole')await db.query('INSERT INTO public.user_roles(user_id,role_id) SELECT $1,id FROM public.roles WHERE key=$2',[user.id,role]);
  }
  pass('real password login for five Auth identities');

  const localEnv={...process.env,SUPABASE_URL:url,VITE_SUPABASE_URL:url,SUPABASE_ANON_KEY:anon,VITE_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,DATABASE_URL:`postgres://postgres:${password}@127.0.0.1:${dbPort}/postgres`,PORT:String(appPort),NODE_ENV:"development",ADMIN_EMAIL:users.admin.email};
  delete (localEnv as Record<string,unknown>).REPL_ID;
  const log=createWriteStream(`${directory}/app-private.log`,{mode:0o600});
  app=spawn(process.execPath,["--import","tsx",resolve("script/demo/smokeNewDayIntegration.ts"),"--app"],{env:localEnv,stdio:["ignore","pipe","pipe"]});
  app.stdout!.pipe(log);app.stderr!.pipe(log);
  await eventually(async()=>{assert.equal(app!.exitCode,null);assert.equal((await fetch(`${appUrl}/api/health`)).status,200);});
  Object.assign(process.env,{SUPABASE_URL:url,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service});
  const {runNewDayJourney}=process.argv.includes("--participant-meals-diagnostic")||process.argv.includes("--participant-meals-native-diagnostic")
    ?{runNewDayJourney:(await import("../diagnostics/u00gMealJourney")).runU00gMealJourney}
    :process.argv.includes("--transport")
    ?{runNewDayJourney:(await import("./smokeNewDayTransportJourney")).runNewDayTransportJourney}
    :process.argv.includes("--setup-families")
    ?{runNewDayJourney:(await import("./smokeNewDaySetupJourney")).runNewDaySetupJourney}
    :process.argv.includes("--itinerant-consumption")
    ?{runNewDayJourney:(await import("./smokeNewDayItinerantJourney")).runNewDayItinerantJourney}
    :process.argv.includes("--standalone-only")
    ?{runNewDayJourney:(await import("./smokeStandaloneDayJourney")).runStandaloneDayJourney}
    :await import("./smokeNewDayJourney");
  report.journey=await runNewDayJourney({appUrl,url,anon,service,users,db,directory,pass});
  report.status="PASS";
 } catch(error) {
  report.status="FAIL";report.error=(error instanceof Error?error.stack??error.message:String(error)).replaceAll(password,"[local secret]").replaceAll(secret,"[local secret]");process.exitCode=1;console.error(report.error);
 } finally {
  if(app&&app.exitCode===null)app.kill("SIGTERM");
  gateway?.closeAllConnections();if(gateway)await new Promise<void>(r=>gateway!.close(()=>r()));
  await db?.end().catch(()=>{});
  for(const name of owned.reverse())try{docker("rm","-f","-v",name);}catch{}
  if(network)try{docker("network","rm",id);}catch{}
  report.finishedAt=new Date().toISOString();writeFileSync(`${directory}/integration.json`,JSON.stringify(report,null,2));
 }
 console.log(JSON.stringify({status:report.status,evidence:`${directory}/integration.json`,remoteWrites:0}));
}
