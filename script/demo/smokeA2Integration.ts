import {runDayWorkspaceSetup} from "./smokeDayWorkspaceSetup";
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
import {collectA2TopologyMetrics} from './a2TopologyMetrics';
import {a2HistoricalCatalog} from './a2HistoricalCatalog';
import {seedA2HistoricalRehearsal} from './seedA2HistoricalRehearsal';
import {buildA2ImportSQL} from './prepareA2Import';
import {buildA2SchemaSQL} from './prepareA2Schema';
import {inspectA2Catalog} from './a2Preflight';
import {runA2BrowserJourney} from './smokeA2Journey';
import {seedA2ScopeCatalog} from './smokeA2ScopeSelectionJourney';

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
 const historicalTopology=process.argv.includes('--historical-topology');
 const full=process.argv.includes('--full');
 const liveExecution=process.argv.includes('--live-execution');
 const warRoom=process.argv.includes('--war-room-snapshot');
 const liveSnapshot=process.argv.includes('--live-execution-snapshot')||warRoom;
 assert.ok(!liveSnapshot||historicalTopology,'accepted snapshot replay requires --historical-topology');
 assert.ok(!liveExecution||full,'--live-execution requires a complete accepted baseline (--full)');
 const workspaceSetup=process.argv.includes("--workspace-setup");
 const stageOrder=process.argv.includes('--stage-order');
 const autopilot=process.argv.includes('--autopilot');
 assert.ok(!stageOrder||full,'--stage-order requires the complete real baseline (--full)');
 assert.ok(!autopilot||full,'--autopilot requires the complete real baseline (--full)');
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
 const runtimeFiles=['engine/planner-next/benchmarks/canonicalFullA2EngineInput.ts','engine/planner-next/benchmarks/focal-a2/full-day/manifest.ts','engine/planner-next/integration/engineInputPreflight.ts','engine/planner-next/placement.ts','engine/planner-next/validate.ts','script/demo/reconcileA2Topology.ts','script/demo/a2HistoricalCatalog.ts','shared/anchoredOperationProjection.ts','server/storage.ts','server/assistedPlanningSnapshot.ts','server/assistedProposalService.ts','server/assistedPlanningService.ts','server/routes.ts','engine/planner-next/jointCompletionWitness.ts','engine/planner-next/exactItinerantPlan.ts','client/src/components/layout.tsx','client/src/components/planning/assisted-planning-workspace.tsx','script/demo/a2ImportRows.ts','script/demo/prepareA2Import.ts','script/demo/prepareA2Schema.ts','script/demo/smokeA2Integration.ts','script/demo/smokeA2Journey.ts','client/src/lib/assisted-planning-view.ts','client/src/lib/assisted-draft-warnings.ts'];
 runtimeFiles.push('script/demo/smokeA2HistoricalScopeJourney.ts','engine/planner-next/integration/engineInputAdapter.ts','script/demo/seedA2HistoricalRehearsal.ts','script/demo/a2TopologyMetrics.ts','script/demo/fixtures/a2-legacy-import.json.gz','script/demo/a2SpatialTopology.ts','client/src/lib/planning-view-policy.ts','script/demo/smokeA2ManualSnapshotJourney.ts','script/demo/smokeA2ViewsHistoryJourney.ts','shared/assistedStageTiming.ts','client/src/lib/contestant-lane-sort.ts','client/src/components/planning/stage-history-timing.tsx','client/src/components/planning-timeline.tsx','client/src/pages/plan-details.tsx');
 runtimeFiles.push('engine/planner-next/mainFlowPatterns.ts','script/demo/smokeMainFlowPreferenceJourney.ts','shared/mainFlowPreference.ts','server/mainFlowPreference.ts','server/dayConfigurationService.ts','server/effectiveConfigurationView.ts','client/src/components/effective-configuration.tsx','client/src/components/main-flow-preference-editor.tsx','client/src/lib/main-flow-preference-result.ts','engine/planner-next/mainFlowMeal.ts','engine/planner-next/anonymousPipelineWitness.ts','engine/planner-next/exactMainAndFeederCore.ts');
 runtimeFiles.push('client/index.html','client/src/index.css','server/effectiveConfigurationHttp.ts','client/src/hooks/use-plan-staff.ts','client/src/components/planning/planning-workspace-layout.tsx','client/src/components/planning/planning-stage-toolbar.tsx','client/src/lib/day-execution-view.ts','client/src/lib/planning-workspace-preferences.ts','script/demo/smokeDayWorkspaceJourney.ts','script/demo/smokeDayWorkspaceSetup.ts',...readdirSync('client/src/components/day-workspace').filter(name=>name.endsWith('.tsx')).map(name=>`client/src/components/day-workspace/${name}`));
 const hashes=()=>Object.fromEntries(runtimeFiles.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
 if(warRoom)runtimeFiles.push('script/demo/smokeWarRoomJourney.ts','server/incidents.ts','server/incidentErrors.ts','shared/incidents.ts','client/src/pages/my-day.tsx','client/src/pages/war-room.tsx','client/src/hooks/use-war-room.ts','client/src/hooks/use-plan-realtime.ts','client/src/lib/war-room-store.ts','client/src/pages/dashboard.tsx','client/src/pages/call-sheet.tsx','server/apiAuthorization.ts','shared/routes.ts','shared/schema.ts','supabase/migrations/094_operational_incidents.sql');
 if(stageOrder)runtimeFiles.push('script/demo/probeA2StageOrder.ts','server/assistedScopeOrchestrator.ts');
 if(autopilot)runtimeFiles.push('shared/assistedAutopilot.ts','client/src/lib/assisted-autopilot.ts','script/demo/smokeA2AutopilotJourney.ts');
 const report:any={mode:liveSnapshot?'REAL_DISPOSABLE_EXECUTION_ACCEPTED_SNAPSHOT_REPLAY':'REAL_DISPOSABLE_PRODUCT_INTEGRATION',nodeVersion:process.version,v8Version:process.versions.v8,remoteWrites:0,images,requestedStages:full?11:2,startedAt:new Date().toISOString(),runtimeHashes:hashes(),checks:[],pending:['Connected Supabase catalog/backup adoption and original-row preservation','Published Replit runtime and user browser','Supabase Realtime/WebSocket transport']};
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
  const transport:any[]=[];report.transport=transport;
  gateway=http.createServer((req,res)=>{
   res.setHeader('Access-Control-Allow-Origin',appUrl);res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']??'authorization,apikey,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const path=req.url??'/',isAuth=path.startsWith('/auth/v1/'),isRest=path.startsWith('/rest/v1/');
   if(!isAuth&&!isRest){res.writeHead(404);res.end();return;}
   const trace=path.startsWith('/rest/v1/rpc/')?{path,method:req.method,contentLength:req.headers['content-length']??null,receivedBytes:0,requestEnded:false,upstreamFinished:false,responseStatus:null as number|null,error:null as string|null}:null;
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
  const preservation=historicalTopology?await seedA2HistoricalRehearsal(db,users.production.id):null;
  const {dataset,sql}=buildA2ImportSQL('2026-10-30',historicalTopology?100000:0,'dyqusivzgxebkxkwohwn',historicalTopology?{historicalCatalog:a2HistoricalCatalog,planId:27002}:undefined);await db.query(sql);
  if(preservation){await preservation.assertPreserved();report.historicalPreservation=preservation.summary;pass('historical catalog, old 266-task/11-stage day and other 333 tasks preserved after insert-only import');}assert.equal(await defaults(),beforeDefaults);
  if(process.argv.includes('--scope-selection'))await seedA2ScopeCatalog(db,dataset);
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
  const initialInput=await buildEngineInput(dataset.input.planId,storage);
  const actual=adaptEngineInputToPlannerNextProblem(initialInput),expected=adaptEngineInputToPlannerNextProblem(dataset.input);
  assert.equal(actual.status,'SUPPORTED');assert.equal(expected.status,'SUPPORTED');if(actual.status==='SUPPORTED'&&expected.status==='SUPPORTED')assert.deepEqual(actual.problem,expected.problem);
  assert.equal((await db.query('SELECT count(*) AS n FROM public.plan_breaks WHERE plan_id=$1',[dataset.input.planId])).rows[0].n,'0');
  pass('real storage/input adapter canon after GET day; no legacy breaks');
  report.diagnostics={};const options={appUrl,url,anon,users,db,planId:dataset.input.planId,directory,full,pass,diagnostics:report.diagnostics,buildInput:()=>buildEngineInput(dataset.input.planId,storage)};
  if(liveSnapshot){
   const otherDays=async()=>JSON.stringify((await db!.query("SELECT to_jsonb(t) row FROM daily_tasks t WHERE plan_id<>27001 ORDER BY id")).rows);
   const untouched=await otherDays();
   const source=(await db.query("SELECT snapshot_fingerprint,ordinal FROM assisted_planning_stages WHERE id=(SELECT active_stage_id FROM assisted_planning_sessions WHERE plan_id=27001 AND status='ACTIVE')")).rows[0];
   report.snapshotReplay={source:'script/demo/fixtures/a2-legacy-import.json.gz',sourceSha256:createHash('sha256').update(readFileSync('script/demo/fixtures/a2-legacy-import.json.gz')).digest('hex'),planId:27001,acceptedStage:source.ordinal,fingerprint:source.snapshot_fingerprint,newSolverRun:false};
   if(warRoom){const {runWarRoomJourney}=await import('./smokeWarRoomJourney');report.warRoom=await runWarRoomJourney({...options,planId:27001});}
   else {const {runLiveExecutionJourney}=await import('./smokeLiveExecutionJourney');report.liveExecution=await runLiveExecutionJourney({...options,planId:27001});}
   assert.equal(await otherDays(),untouched);pass('other disposable days remain literal during accepted-snapshot execution');
  }else report.journey=workspaceSetup?await runDayWorkspaceSetup(options):await runA2BrowserJourney(options);
  if(stageOrder){const {probeA2StageOrder}=await import('./probeA2StageOrder');report.stageOrder=await probeA2StageOrder(options,report.journey,initialInput);}
  if(autopilot){const {runA2AutopilotJourney}=await import('./smokeA2AutopilotJourney');report.autopilot=await runA2AutopilotJourney(options,report.journey);}
  assert.deepEqual(hashes(),report.runtimeHashes,'runtime sources changed during integration rehearsal');
  if(historicalTopology&&!liveSnapshot){
   const metricInput=await buildEngineInput(dataset.input.planId,storage),projected=adaptEngineInputToPlannerNextProblem(metricInput);
   assert.equal(projected.status,'SUPPORTED');if(projected.status!=='SUPPORTED')throw Error('Final metric input is unsupported');
   const placements=(await db.query('SELECT id AS "taskId",start_planned AS "startPlanned",end_planned AS "endPlanned" FROM public.daily_tasks WHERE plan_id=$1 ORDER BY id',[dataset.input.planId])).rows.map(row=>({...row,taskId:Number(row.taskId)}));
   report.topologyMetrics=collectA2TopologyMetrics(metricInput.tasks,placements,metricInput.contestantAvailabilityById!,Object.fromEntries(projected.problem.tasks.map(task=>[Number(task.id.split(':')[1]),(task.requiredResourceIds??[]).map(id=>Number(id.split(':')[1]))])));
   const assertPhysical=(name:string,spaceId:number)=>assert.ok(metricInput.tasks.filter(t=>t.templateName===name).every(t=>t.spaceId===spaceId));
   assertPhysical('REDES',39);assertPhysical('PASILLO',3);assertPhysical('REALITY_HALL',4);
   assertPhysical('REALITY_INFLUENCER',31);assertPhysical('REALITY_CORNER_MUSIC',31);
   assert.equal(report.topologyMetrics.placedObligations,266);assert.deepEqual(report.topologyMetrics.styling.overlapPairs,[]);
   pass('persisted physical topology, styling capacity and final SQL KPI projection');
  }
  if(liveExecution){const {runLiveExecutionJourney}=await import('./smokeLiveExecutionJourney');report.liveExecution=await runLiveExecutionJourney(options);}
  if(preservation&&!liveSnapshot){await preservation.assertPreserved();pass('old day, 11 prior Stages, 333 other tasks and historical catalog remain literal after real UI/Autopilot/execution');}
  report.status='PASS';report.finishedAt=new Date().toISOString();
 }catch(error){report.status='FAIL';report.error=(error instanceof Error?error.stack??error.message:String(error)).replaceAll(password,'[local secret]').replaceAll(secret,'[local secret]');process.exitCode=1;console.error(report.error);}
 finally{await cleanup();writeFileSync(`${directory}/integration.json`,JSON.stringify(report,null,2));}
 console.log(JSON.stringify({status:report.status,evidence:`${directory}/integration.json`,remoteWrites:0}));
}
