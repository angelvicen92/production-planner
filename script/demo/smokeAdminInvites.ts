/** Native, disposable invite-only Auth + mail capture. Never reads remote credentials. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync, spawn, type ChildProcess } from 'node:child_process';
import { createHmac, randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, createWriteStream } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { resolve } from 'node:path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

if (process.argv.includes('--app')) {
  assert.equal(new URL(process.env.SUPABASE_URL!).hostname, '127.0.0.1');
  await import('../../server/index');
} else {
  const directory = resolve(process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'work/admin-invites');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const images = {
    db: 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',
    auth: 'supabase/gotrue:v2.177.0@sha256:6a916b47af0386b7e0152ca84f3d45d050bf056e449a75a5460b48742fd67822',
    rest: 'postgrest/postgrest:v12.2.12@sha256:5f4ce744539bbba786b4e24dbbd95bdb2a956dcf568c5374995a0ff4a68f5bd2',
    mail: 'axllent/mailpit:v1.27.8@sha256:6abc8e633df15eaf785cfcf38bae48e66f64beecdc03121e249d0f9ec15f0707',
  };
  const report: any = { mode: 'REAL_DISPOSABLE_ADMIN_INVITES', base: 'd4fe022b92196912e8997e7a9249854808a09de7', images, remoteWrites: 0, checks: [], limitations: ['Local GoTrue version, not hosted Supabase configuration', 'SMTP captured locally; real email deliverability and production templates not certified'] };
  const pass = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`); };
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  async function eventually(check: () => Promise<any>) { let last: unknown; for (let i = 0; i < 160; i++) { try { return await check(); } catch (e) { last = e; await delay(250); } } throw last; }
  async function freePort() { const s = net.createServer(); await new Promise<void>(r => s.listen(0, '127.0.0.1', r)); const port = (s.address() as net.AddressInfo).port; await new Promise<void>(r => s.close(() => r())); return port; }
  const id = `optiplan-invite-${randomBytes(6).toString('hex')}`, secret = randomBytes(32).toString('hex'), password = randomBytes(20).toString('hex');
  const jwt = (role: string) => { const p = [{ alg: 'HS256', typ: 'JWT' }, { role, iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')); return [...p, createHmac('sha256', secret).update(p.join('.')).digest('base64url')].join('.'); };
  const anon = jwt('anon'), service = jwt('service_role');
  const dockerEnv = { ...process.env };
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
  const docker = (...args: string[]) => execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...args], { env: dockerEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const owned: string[] = []; let network = false, db: pg.Client | undefined, gateway: http.Server | undefined, app: ChildProcess | undefined;
  // Failure injection is confined to this local transport, never product hooks.
  let fault: ((method: string, path: string) => boolean) | undefined;
  let loseInviteAcknowledgement = false;
  const operations: Array<{ method: string; path: string }> = [];
  try {
    docker('network', 'create', id); network = true;
    const start = (name: keyof typeof images, port: number, settings: Record<string, string>) => {
      const container = `${id}-${name}`; owned.push(container);
      docker('run', '-d', '--name', container, '--network', id, '--network-alias', name, '-p', `127.0.0.1::${port}`, ...Object.entries(settings).flatMap(([k, v]) => ['-e', `${k}=${v}`]), images[name]);
      return Number(JSON.parse(docker('inspect', container))[0].NetworkSettings.Ports[`${port}/tcp`][0].HostPort);
    };
    const dbPort = start('db', 5432, { POSTGRES_PASSWORD: password });
    await eventually(async () => { const c = new pg.Client({ host: '127.0.0.1', port: dbPort, user: 'postgres', password }); try { await c.connect(); await c.query('SELECT 1'); } finally { await c.end(); } });
    db = new pg.Client({ host: '127.0.0.1', port: dbPort, user: 'postgres', password }); await db.connect();
    await db.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE authenticator LOGIN PASSWORD '${password}'; GRANT anon,authenticated,service_role TO authenticator;
      CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
      GRANT USAGE ON SCHEMA public,auth,extensions TO anon,authenticated,service_role;`);
    const mailPort = start('mail', 8025, { MP_SMTP_BIND_ADDR: '0.0.0.0:1025', MP_SMTP_AUTH_ACCEPT_ANY: 'true', MP_SMTP_AUTH_ALLOW_INSECURE: 'true' });
    const appPort = await freePort(), gatewayPort = await freePort(), url = `http://127.0.0.1:${gatewayPort}`, appUrl = `http://127.0.0.1:${appPort}`;
    const authPort = start('auth', 9999, { GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: `${url}/auth/v1`, GOTRUE_SITE_URL: `${appUrl}/dashboard`, GOTRUE_URI_ALLOW_LIST: `${appUrl}/login,${appUrl}/dashboard`, GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: `postgres://postgres:${password}@db:5432/postgres?search_path=auth`, GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_DISABLE_SIGNUP: 'true', GOTRUE_MAILER_AUTOCONFIRM: 'false', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_SMTP_HOST: 'mail', GOTRUE_SMTP_PORT: '1025', GOTRUE_SMTP_ADMIN_EMAIL: 'admin@example.test', GOTRUE_MAILER_URLPATHS_INVITE: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_MAGIC_LINK: '/auth/v1/verify', GOTRUE_SMTP_MAX_FREQUENCY: '0s', GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000' });
    await eventually(async () => assert.equal((await fetch(`http://127.0.0.1:${authPort}/health`)).status, 200));
    report.migrations = [];
    for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) { const sql = readFileSync(`supabase/migrations/${file}`, 'utf8'); await db.query(sql); report.migrations.push({ file, sha256: createHash('sha256').update(sql).digest('hex') }); }
    pass('Complete native migration ledger, signups disabled, email confirmation enabled');
    const restPort = start('rest', 3000, { PGRST_DB_URI: `postgres://authenticator:${password}@db:5432/postgres`, PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: secret });
    gateway = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', appUrl); res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? 'authorization,apikey,content-type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const path = req.url ?? '/', isAuth = path.startsWith('/auth/v1/'), prefix = isAuth ? '/auth/v1' : '/rest/v1';
      operations.push({ method: req.method ?? '', path: path.split('?')[0] });
      if (fault?.(req.method ?? '', path)) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 'INJECTED_FAILURE', message: 'Disposable transport failure' })); return; }
      const upstream = http.request({ hostname: '127.0.0.1', port: isAuth ? authPort : restPort, path: path.slice(prefix.length), method: req.method, headers: { ...req.headers, host: `127.0.0.1:${isAuth ? authPort : restPort}` } }, response => { if(loseInviteAcknowledgement && path==='/auth/v1/invite'){response.resume();res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Disposable lost acknowledgement'}));return;} for (const [k, v] of Object.entries(response.headers)) if (v !== undefined) res.setHeader(k, v); res.writeHead(response.statusCode ?? 502); response.pipe(res); });
      upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream);
    });
    await new Promise<void>(r => gateway!.listen(gatewayPort, '127.0.0.1', r));
    await eventually(async () => assert.equal((await fetch(`${url}/rest/v1/`, { headers: { Authorization: `Bearer ${service}` } })).status, 200));
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const publicClient = () => createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = 'compatibility@example.test';
    const created = await admin.auth.admin.createUser({ email, email_confirm: false, ban_duration: '876000h' }); assert.ifError(created.error); const userId = created.data.user!.id;
    await db.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE key='production'", [userId]);
    assert.ok((await publicClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } })).error, 'banned preparation must deny OTP');
    assert.ifError((await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })).error);
    const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl}/login` }); assert.ifError(invited.error); assert.equal(invited.data.user!.id, userId); assert.ok(invited.data.user!.invited_at); assert.ok(!invited.data.user!.email_confirmed_at);
    const messages = async () => (await (await fetch(`http://127.0.0.1:${mailPort}/api/v1/messages`)).json() as any).messages;
    const message = await eventually(async () => { const m = (await messages()).find((m: any) => m.To.some((to: any) => to.Address === email)); assert.ok(m); return m; });
    const body: any = await (await fetch(`http://127.0.0.1:${mailPort}/api/v1/message/${message.ID}`)).json();
    const link = String(body.HTML).match(/href="([^"]+)"/)![1].replace(/&amp;/g, '&');
    const verified = await fetch(link, { redirect: 'manual' }); assert.equal(verified.status, 303);
    const hash = new URLSearchParams(new URL(verified.headers.get('location')!).hash.slice(1)); const token = hash.get('access_token'); assert.ok(token);
    const account = publicClient(); assert.ifError((await account.auth.setSession({ access_token: token!, refresh_token: hash.get('refresh_token')! })).error);
    assert.ifError((await account.auth.updateUser({ password })).error); assert.ifError((await publicClient().auth.signInWithPassword({ email, password })).error);
    assert.equal((await db.query('SELECT r.key FROM user_roles u JOIN roles r ON r.id=u.role_id WHERE user_id=$1', [userId])).rows[0].key, 'production');
    assert.ok((await publicClient().auth.signUp({ email: 'public@example.test', password })).error);
    pass('Native compatibility: banned create → role → unban → invite existing unconfirmed ID → captured email → confirmation → password → login; role preserved; public signup denied');
    await admin.auth.admin.deleteUser(userId);
    if (!process.argv.includes('--compatibility-only')) {
      const actors: Record<string, {id:string;email:string;token:string}> = {};
      for (const role of ['admin','production','aux','viewer','norole']) {
        const email = `${role}@example.test`;
        const result = await admin.auth.admin.createUser({email,password,email_confirm:true}); assert.ifError(result.error);
        const id = result.data.user!.id;
        if (role !== 'norole') await db.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE key=$2',[id,role]);
        const login = await publicClient().auth.signInWithPassword({email,password}); assert.ifError(login.error);
        actors[role] = {id,email,token:login.data.session!.access_token};
      }
      const localEnv = {...process.env, SUPABASE_URL:url, VITE_SUPABASE_URL:url, SUPABASE_ANON_KEY:anon, VITE_SUPABASE_ANON_KEY:anon, SUPABASE_SERVICE_ROLE_KEY:service, DATABASE_URL:`postgres://postgres:${password}@127.0.0.1:${dbPort}/postgres`, PORT:String(appPort), NODE_ENV:'development', ADMIN_EMAIL:actors.viewer.email};
      delete (localEnv as any).REPL_ID;
      const appLog = createWriteStream(`${directory}/app-private.log`,{mode:0o600});
      app = spawn(process.execPath,['--import','tsx',resolve('script/demo/smokeAdminInvites.ts'),'--app'],{env:localEnv,stdio:['ignore','pipe','pipe']}); app.stdout!.pipe(appLog); app.stderr!.pipe(appLog);
      const request = async (role:string,path:string,method='POST',body?:unknown) => {
        const token = role==='anonymous'?undefined:role==='invalid'?'invalid':actors[role]?.token;
        const response = await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
        return {status:response.status,body:await response.json() as any};
      };
      await eventually(async()=>{assert.equal(app!.exitCode,null);assert.equal((await request('admin','/api/admin/users','GET')).status,200);});
      const invite = (email:string,roleKey='production')=>request('admin','/api/admin/users/invite','POST',{email,roleKey});
      const roleOf = async(id:string)=>(await db!.query('SELECT r.key FROM user_roles u JOIN roles r ON r.id=u.role_id WHERE user_id=$1',[id])).rows[0]?.key;
      for (const role of ['anonymous','invalid','norole','viewer','aux','production']) for (const path of ['/api/admin/users/invite','/API/ADMIN/USERS/INVITE/']) {
        const before=operations.length;
        const result=await request(role,path,'POST',{email:'denied@example.test',roleKey:'admin'});
        assert.equal(result.status,['anonymous','invalid'].includes(role)?401:403);
        assert.equal(operations.slice(before).filter(op=>op.method!=='GET'||op.path.startsWith('/auth/v1/admin/')||op.path==='/auth/v1/invite').length,0,'denial must precede all privileged mutations');
      }
      pass('Real Auth/API 401/403 matrix including Express case/slash variants; zero privileged mutations');
      for (const payload of [{email:'bad',roleKey:'admin'},{email:'bad@example.test',roleKey:'owner'},{email:'bad@example.test'}, {email:'bad@example.test',roleKey:'viewer',redirectTo:'https://evil.invalid'},{email:'bad@example.test',roleKey:'viewer',app_metadata:{role:'admin'}}]) {
        const before=operations.length;assert.equal((await request('admin','/api/admin/users/invite','POST',payload)).status,400);assert.equal(operations.slice(before).filter(op=>op.method!=='GET').length,0);
      }
      pass('Invalid email, roles, omitted role and client metadata/redirect injection rejected before privileged mutation');
      for (const role of ['admin','production','aux','viewer']) {
        assert.equal((await request(role,'/api/bootstrap-role')).body.role,role);
        assert.equal(await roleOf(actors[role].id),role);
      }
      assert.equal((await request('norole','/api/bootstrap-role')).body.role,'viewer');
      pass('Bootstrap preserves every existing role, including viewer matching ADMIN_EMAIL; missing role gets viewer');
      const duplicate=await invite(actors.admin.email.toUpperCase(),'viewer');assert.equal(duplicate.status,409);assert.equal(await roleOf(actors.admin.id),'admin');
      const concurrent=await Promise.all([invite('race@example.test','aux'),invite('RACE@example.test','production')]);
      assert.equal(concurrent.filter(r=>r.status===201).length,1);assert.ok(concurrent.some(r=>r.status===409||r.status===502));report.concurrentStatuses=concurrent.map(r=>r.status);const winner=concurrent.find(r=>r.status===201)!;
      assert.equal(await roleOf(winner.body.userId),winner.body.roleKey);
      pass('Atomic case-insensitive duplicates and concurrent invites never replace existing role');
      for (const role of ['admin','production','aux','viewer']) {
        const email=`invited-${role}@example.test`;
        const result=await invite(email,role);assert.equal(result.status,201);assert.equal(result.body.status,'invitation_pending');assert.equal(await roleOf(result.body.userId),role);
        const mail=await eventually(async()=>{const m=(await messages()).find((m:any)=>m.To.some((to:any)=>to.Address===email));assert.ok(m);return m;});
        const body:any=await(await fetch(`http://127.0.0.1:${mailPort}/api/v1/message/${mail.ID}`)).json();
        const verification=await fetch(String(body.HTML).match(/href="([^"]+)"/)![1].replace(/&amp;/g,'&'),{redirect:'manual'});
        const params=new URLSearchParams(new URL(verification.headers.get('location')!).hash.slice(1));
        const client=publicClient();assert.ifError((await client.auth.setSession({access_token:params.get('access_token')!,refresh_token:params.get('refresh_token')!})).error);
        assert.ifError((await client.auth.updateUser({password})).error);
        const signedIn=await publicClient().auth.signInWithPassword({email,password});assert.ifError(signedIn.error);
        actors[`invited-${role}`]={id:result.body.userId,email,token:signedIn.data.session!.access_token};
        assert.equal((await request(`invited-${role}`,'/api/bootstrap-role')).body.role,role);assert.equal(await roleOf(result.body.userId),role);
      }
      pass('All four initial roles persist through real invitation confirmation, password login and product bootstrap');
      for(const stage of ['role-lookup','auth-create']) {
        fault=(method,path)=>stage==='role-lookup'?method==='GET'&&path.startsWith('/rest/v1/roles?'):method==='POST'&&path==='/auth/v1/admin/users';
        const failed=await invite(`${stage}@example.test`);fault=undefined;assert.equal(failed.status,502);
        assert.equal((await db.query('SELECT id FROM auth.users WHERE email=$1',[`${stage}@example.test`])).rows.length,0);
      }
      const failRole=async(cleanupFailure:boolean)=>{
        await db!.query(`CREATE FUNCTION public.reject_invite_role() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Disposable role-write failure'; END $$; CREATE TRIGGER reject_invite_role BEFORE INSERT ON user_roles FOR EACH ROW EXECUTE FUNCTION public.reject_invite_role();`);
        if(cleanupFailure)fault=(method,path)=>method==='DELETE'&&path.startsWith('/auth/v1/admin/users/');
        let result:any;
        try{result=await invite(cleanupFailure?'cleanup@example.test':'role-failure@example.test');}finally{fault=undefined;await db!.query('DROP TRIGGER reject_invite_role ON user_roles; DROP FUNCTION public.reject_invite_role()');}
        assert.equal(result.status,502);
        const rows=(await db!.query('SELECT id,banned_until FROM auth.users WHERE email=$1',[cleanupFailure?'cleanup@example.test':'role-failure@example.test'])).rows;
        if(cleanupFailure){assert.equal(result.body.code,'INVITATION_CLEANUP_REQUIRED');assert.equal(rows.length,1);assert.ok(new Date(rows[0].banned_until)>new Date());assert.equal(await roleOf(rows[0].id),undefined);assert.ok((await publicClient().auth.signInWithOtp({email:'cleanup@example.test',options:{shouldCreateUser:false}})).error);}
        else assert.equal(rows.length,0);
      };
      await failRole(false);await failRole(true);
      fault=(method,path)=>method==='PUT'&&path.startsWith('/auth/v1/admin/users/');
      const blocked=await invite('enable-failure@example.test');fault=undefined;assert.equal(blocked.status,502);assert.equal(await roleOf(blocked.body.userId),'production');
      assert.ok(new Date((await db.query('SELECT banned_until FROM auth.users WHERE id=$1',[blocked.body.userId])).rows[0].banned_until)>new Date());
      fault=(method,path)=>method==='POST'&&path==='/auth/v1/invite';
      const delivery=await invite('delivery-failure@example.test','aux');fault=undefined;assert.equal(delivery.status,502);assert.equal(delivery.body.code,'INVITATION_DELIVERY_UNCONFIRMED');assert.equal(await roleOf(delivery.body.userId),'aux');
      assert.equal((await invite('delivery-failure@example.test','admin')).status,409);assert.equal(await roleOf(delivery.body.userId),'aux');
      loseInviteAcknowledgement=true;
      const lostAck=await invite('lost-ack@example.test','aux');loseInviteAcknowledgement=false;
      assert.equal(lostAck.status,502);assert.equal(lostAck.body.code,'INVITATION_DELIVERY_UNCONFIRMED');assert.equal(await roleOf(lostAck.body.userId),'aux');
      await eventually(async()=>assert.ok((await messages()).some((m:any)=>m.To.some((to:any)=>to.Address==='lost-ack@example.test'))));
      assert.equal((await invite('lost-ack@example.test','admin')).status,409);assert.equal(await roleOf(lostAck.body.userId),'aux');
      pass('Lost acknowledgement after actual email send is an explicit partial failure; retry cannot replace role or send again');
      const listed=await request('admin','/api/admin/users','GET');
      const state=(email:string)=>listed.body.users.find((user:any)=>user.email===email).accessStatus;
      assert.equal(state('lost-ack@example.test'),'invitation_pending');assert.equal(state('delivery-failure@example.test'),'email_unconfirmed');assert.equal(state('cleanup@example.test'),'blocked');assert.equal(listed.body.users.find((u:any)=>u.email==='cleanup@example.test').roleKey,null);assert.equal(state('enable-failure@example.test'),'blocked');assert.equal(state('race@example.test'),'invitation_pending');assert.equal(state(actors.admin.email),'email_confirmed');
      pass('Native role-write rollback, cleanup failure stays banned/no role, enable failure stays banned, mail failure is partial/no false success, truthful list states');
      const {runAdminInviteBrowser}=await import('./smokeAdminInviteBrowser');
      await runAdminInviteBrowser({appUrl,mailUrl:`http://127.0.0.1:${mailPort}`,actors,password,db,directory,pass,service});
      report.mailCount=(await messages()).length;
      assert.equal((await messages()).filter((m:any)=>m.To.some((to:any)=>to.Address==='race@example.test')).length,1);
      docker('stop',`${id}-mail`);
      const smtpFailure=await invite('smtp-failure@example.test','viewer');
      assert.equal(smtpFailure.status,502);assert.equal(smtpFailure.body.code,'INVITATION_DELIVERY_UNCONFIRMED');assert.equal(await roleOf(smtpFailure.body.userId),'viewer');
      pass('Real SMTP outage returns partial failure with persisted chosen role, never success');
      report.privilegedOperations=operations.filter(op=>op.method!=='GET');
    }
    report.passed = true;
  } catch (error) { for (const name of owned) { try { writeFileSync(`${directory}/${name.split('-').at(-1)}-private.log`, spawnSync('docker',['logs',name],{env:dockerEnv,encoding:'utf8'}).stderr, {mode:0o600}); } catch {} } report.passed = false; report.error = String(error); throw error; }
  finally {
    if (app && app.exitCode === null) { app.kill('SIGTERM'); await Promise.race([new Promise(r => app!.once('exit', r)), delay(3000)]); if (app.exitCode === null) app.kill('SIGKILL'); }
    gateway?.closeAllConnections(); if (gateway) await new Promise<void>(r => gateway!.close(() => r()));
    await db?.end().catch(() => {});
    for (const name of owned.reverse()) try { docker('rm', '-f', '-v', name); } catch {}
    if (network) try { docker('network', 'rm', id); } catch {}
    writeFileSync(`${directory}/integration.json`, JSON.stringify(report, null, 2));
  }
}
