/** Reuse the existing PostgreSQL-only bootstrap; stop at 103, then invoke the audited upgrade. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,copyFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
const output=resolve(process.argv[2]);assert.ok(!existsSync(output),'Choose fresh output');
for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[k];
const repo=process.cwd(),source=join(output,'source');mkdirSync(source,{recursive:true});
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive','HEAD'],{maxBuffer:256*1024*1024})});
mkdirSync(join(source,'docs/evidence/p0-u00t'),{recursive:true});
for(const f of readdirSync('docs/evidence/p0-u00t').filter(f=>f.endsWith('.ts')))copyFileSync('docs/evidence/p0-u00t/'+f,join(source,'docs/evidence/p0-u00t',f));
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const original=readFileSync('docs/evidence/p0-u00s/integration/sql-gate.ts','utf8'),boundary=original.indexOf(' const before=await dataApiCatalog(db);');assert.ok(boundary>0);
const prefix=original.slice(0,boundary);assert.equal(prefix.split('Number(f.slice(0,3))<115').length,2);
const code=prefix.replace('Number(f.slice(0,3))<115','Number(f.slice(0,3))<=103')+
 ` await (await import('../../p0-u00t/upgrade')).upgrade103To115(db,directory,{preparedSecurity:${process.argv.includes('--prepared')}});\n}finally{await db?.end();docker('rm','-f',container);}\n`;
const path='docs/evidence/p0-u00s/integration/sql103-gate.ts';writeFileSync(join(source,path),code);
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
writeFileSync(join(output,'manifest.json'),JSON.stringify({base:'3ade5d2774584f92f86b2b8670bbb3f19fc5f83c',remoteWrites:0,bootstrapSource:'docs/evidence/p0-u00s/integration/sql-gate.ts',bootstrapSourceSha256:sha(original),archiveCodeSha256:sha(code),upgradeSha256:sha(readFileSync('docs/evidence/p0-u00t/upgrade.ts','utf8'))},null,2));
const run=spawnSync(process.execPath,['--import','tsx',path,join(output,'native')],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});assert.equal(run.status,0);
