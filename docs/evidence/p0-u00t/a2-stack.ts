import {archiveEvidenceSource} from '../../../script/demo/archiveEvidenceSource';
/** Existing A2 HTTP/UI harness, with populated 103 before the forward-only upgrade. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';
const output=resolve(process.argv[2]),mode=process.argv[3]??'full';
const modes:Record<string,string[]>={full:['--full','--manual-validation','--transport-policy','--live-execution'],continuity:['--operation-continuity'],execution:['--live-execution-snapshot'],atomic:['--atomic-template']};
assert.ok(modes[mode]);assert.ok(!existsSync(output),'Choose fresh output');
for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[k];
const repo=process.cwd(),source=join(output,'source');mkdirSync(source,{recursive:true});
const productDelta=execFileSync('git',['diff','--name-only','3ade5d2774584f92f86b2b8670bbb3f19fc5f83c','--','engine','server','client','shared','supabase','script','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.ok(productDelta.every(f=>f==='server/routes.ts'),'only the localized historical GET repair is authorized');
archiveEvidenceSource(output,source);
for(const f of productDelta)copyFileSync(join(repo,f),join(source,f));
for(const f of readdirSync('docs/evidence/p0-u00t').filter(f=>f.endsWith('.ts'))){mkdirSync(join(source,'docs/evidence/p0-u00t'),{recursive:true});copyFileSync('docs/evidence/p0-u00t/'+f,join(source,'docs/evidence/p0-u00t',f));}
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const file=join(source,'script/demo/smokeA2Integration.ts'),before=readFileSync(file,'utf8');
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const replace=(s:string,a:string,b:string)=>{assert.equal(s.split(a).length,2,a);return s.replace(a,b);};
let changed=replace(before,"if(restrictedDataApi && Number(file.slice(0,3))>=100)continue;","if(Number(file.slice(0,3))>103)continue;");
changed=replace(changed,"const restPort=start('rest'",`const upgrade=await (await import('../../docs/evidence/p0-u00t/upgrade')).upgrade103To115(db,directory,{preparedSecurity:false});
  report.upgrade=upgrade;report.migrations=upgrade.ledger;
  const historicalRows=async()=>{const result:any={};const tables=(await db!.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='plan_id' ORDER BY table_name")).rows;for(const {table_name:t} of tables)result[t]=(await db!.query('SELECT to_jsonb(t) row FROM public."'+t+'" t WHERE plan_id IN (26999,27001) ORDER BY to_jsonb(t)::text')).rows;result.plans=(await db!.query('SELECT to_jsonb(p) row FROM plans p WHERE id IN (26999,27001) ORDER BY id')).rows;return result;};
  const originalHistorical=await historicalRows();
  const restPort=start('rest'`);
const start=changed.indexOf('  if(restrictedDataApi){\n   const before=await dataApiCatalog(db);'),end=changed.indexOf('  const users:Record',start);
assert.ok(start>0&&end>start);
// The original block rehearses 099->100 and reapplies 100 for idempotence.
// Here 001..103 were already applied exactly once. Keep its actor matrix below;
// the upgrade helper verifies the exact raw-ledger privilege fixture instead.
changed=changed.slice(0,start)+"  report.dataApi={profile:'raw ledger through 115; original security.sql follows before import',exactPrivilegeContract:true};\n"+changed.slice(end);
changed=replace(changed,'const preservation=historicalTopology?await seedA2HistoricalRehearsal(db,users.production.id):null;',`const preservation={summary:upgrade.fixture,assertPreserved:async()=>assert.deepEqual(await historicalRows(),originalHistorical)};`);
writeFileSync(file,changed);
writeFileSync(join(output,'manifest.json.gz'),gzipSync(JSON.stringify({base:'3ade5d2774584f92f86b2b8670bbb3f19fc5f83c',mode,node:process.version,remoteWrites:0,productDelta,productDeltaHashes:Object.fromEntries(productDelta.map(f=>[f,sha(readFileSync(f,'utf8'))])),archivePatch:{file:'script/demo/smokeA2Integration.ts',before:sha(before),after:sha(changed),literalMigrationsUntouched:true,seedAt:103},harnessHashes:Object.fromEntries(readdirSync('docs/evidence/p0-u00t').filter(f=>f.endsWith('.ts')).map(f=>[f,sha(readFileSync('docs/evidence/p0-u00t/'+f,'utf8'))]))})));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeA2Integration.ts',join(output,'native'),'--restricted-data-api','--historical-topology',...modes[mode]],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});
assert.equal(sha(readFileSync(join(repo,'script/demo/smokeA2Integration.ts'),'utf8')),sha(before));assert.equal(run.status,0);
