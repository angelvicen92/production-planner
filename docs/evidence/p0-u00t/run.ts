/** Reuse the existing native stack; only migration timing/dispatch changes in a disposable archive. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {join,resolve,dirname} from 'node:path';
const output=resolve(process.argv[2]),mode=process.argv[3]??'required';
assert.ok(['required','prefix','rounds','additions','newday','legacy-read'].includes(mode));
assert.ok(!existsSync(output),'Choose fresh output');
// Never pass inherited remote application credentials to a child process.
for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[k];
const repo=process.cwd(),source=join(output,'source');mkdirSync(source,{recursive:true});
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive','HEAD'],{maxBuffer:256*1024*1024})});
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','engine','server','client','shared','supabase','script','docs/source/official','docs/evidence/p0-u00t','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n').filter(f=>existsSync(f)&&(!f.startsWith('docs/evidence/p0-u00t/')||f.endsWith('.ts')));
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const hashes=Object.fromEntries(files.map(f=>[f,sha(readFileSync(join(repo,f)))]));
for(const f of files){mkdirSync(dirname(join(source,f)),{recursive:true});copyFileSync(join(repo,f),join(source,f));}
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),before=readFileSync(file,'utf8');
const replace=(s:string,a:string,b:string)=>{assert.equal(s.split(a).length,2,a);return s.replace(a,b);};
let changed=replace(before,"const sql=readFileSync(`supabase/migrations/${file}`,'utf8');await db.query(sql);", "if(Number(file.slice(0,3))>103)continue;\n   const sql=readFileSync(`supabase/migrations/${file}`,'utf8');await db.query(sql);");
changed=replace(changed,"pass('entire native application migration ledger');",`const upgrade=await (await import('../../docs/evidence/p0-u00t/upgrade')).upgrade103To115(db,directory,{preparedSecurity:${mode!=='newday'}});\n  report.upgrade=upgrade;report.migrations=upgrade.ledger;\n  pass('literal 103 populated fixture upgraded through 115');`);
changed=replace(changed,'const journey=process.argv.includes("--daily-rounds")?',`const journey=process.argv.includes('--u00t')?(await import('../../docs/evidence/p0-u00t/journey')).journey:process.argv.includes("--daily-rounds")?`);
writeFileSync(file,changed);
writeFileSync(join(output,'manifest.json.gz'),gzipSync(JSON.stringify({base:'3ade5d2774584f92f86b2b8670bbb3f19fc5f83c',mode,node:process.version,remoteWrites:0,sourceHashes:hashes,archivePatch:{file:'script/demo/smokeNewDayIntegration.ts',before:sha(before),after:sha(changed),literalMigrationsUntouched:true,seedAt:103}})));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(output,'native'),'--u00t'],{cwd:source,env:{...process.env,U00T_MODE:mode,U00T_ORIGINAL_REPO:repo,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});
for(const [f,hash] of Object.entries(hashes))assert.equal(sha(readFileSync(join(repo,f))),hash,'checkout '+f);
assert.equal(run.status,0);
