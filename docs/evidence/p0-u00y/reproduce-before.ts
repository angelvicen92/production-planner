/** Reproduce the original missing-authority boundary on the exact authorized base. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const base='e0403c90866b5cd54986d68a59b76062e9ac47bc',out=resolve(process.argv[2]),source=join(out,'source');assert.ok(!existsSync(out));mkdirSync(source,{recursive:true});
for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[k];
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive',base],{maxBuffer:256*1024*1024})});symlinkSync(join(process.cwd(),'node_modules'),join(source,'node_modules'),'dir');mkdirSync(join(source,'docs/evidence/p0-u00y'),{recursive:true});
for(const file of ['journey.ts','consumer.ts'])copyFileSync('docs/evidence/p0-u00y/'+file,join(source,'docs/evidence/p0-u00y',file));
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),before=readFileSync(file,'utf8'),from='const journey=process.argv.includes("--daily-rounds")?',to='const journey=process.argv.includes("--u00y")?(await import("../../docs/evidence/p0-u00y/journey")).journey:process.argv.includes("--daily-rounds")?';assert.equal(before.split(from).length,2);writeFileSync(file,before.replace(from,to));
const vite=join(source,'vite.config.ts');writeFileSync(vite,readFileSync(vite,'utf8').replace('export default defineConfig({','export default defineConfig({\n  cacheDir: path.resolve(import.meta.dirname,"work/vite-cache"),'));
writeFileSync(join(out,'manifest.json'),JSON.stringify({base,remoteWrites:0,productSource:'exact git archive, no product overlays',harnessHashes:Object.fromEntries(['journey.ts','consumer.ts'].map(f=>[f,createHash('sha256').update(readFileSync('docs/evidence/p0-u00y/'+f)).digest('hex')])),dispatch:{from,to}},null,2));
const r=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(out,'native'),'--u00y'],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:out},stdio:'inherit'});assert.equal(r.status,0);
