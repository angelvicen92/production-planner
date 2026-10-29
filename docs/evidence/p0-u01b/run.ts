import {archiveEvidenceSource} from '../../../script/demo/archiveEvidenceSource';
/** Reproduce native phase composition on a disposable full application stack. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
const output=resolve(process.argv[2]);assert.ok(!existsSync(output),'Choose fresh output');
for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[k];
const repo=process.cwd(),source=join(output,'source');mkdirSync(source,{recursive:true});
archiveEvidenceSource(output,source);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','engine','server','client','shared','supabase','script','docs/source/official','docs/evidence/p0-u01b','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n').filter(f=>existsSync(f)&&(!f.startsWith('docs/evidence/p0-u01b/')||(f.endsWith('.ts')||f.endsWith('.sql'))));
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const hashes=Object.fromEntries(files.map(f=>[f,sha(readFileSync(join(repo,f)))]));
for(const f of files){mkdirSync(dirname(join(source,f)),{recursive:true});copyFileSync(join(repo,f),join(source,f));}
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
// Each discarded app owns its optimizer cache; dependency files remain shared,
// but separate Vite roots cannot replace one another's generated browser chunks.
const viteFile=join(source,'vite.config.ts'),viteBefore=readFileSync(viteFile,'utf8');
const viteFrom='export default defineConfig({',viteTo='export default defineConfig({\n  cacheDir: path.resolve(import.meta.dirname, "work/vite-cache"),';
assert.equal(viteBefore.split(viteFrom).length,2);const viteAfter=viteBefore.replace(viteFrom,viteTo);writeFileSync(viteFile,viteAfter);
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),before=readFileSync(file,'utf8');
const from='const journey=process.argv.includes("--daily-rounds")?';
const to=`const journey=process.argv.includes("--u01b")?(await import("../../docs/evidence/p0-u01b/journey")).journey:process.argv.includes("--daily-rounds")?`;
assert.equal(before.split(from).length,2);const changed=before.replace(from,to).replace('await db.query(sql);',`await db.query(sql).catch(error=>{console.error({migration:file,position:error.position,where:error.where,internalPosition:error.internalPosition,internalQuery:error.internalQuery});throw error;});`);writeFileSync(file,changed);
writeFileSync(join(output,'manifest.json'),JSON.stringify({base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,remoteWrites:0,sourceHashes:hashes,runtimeCache:{file:'vite.config.ts',from:viteFrom,to:viteTo,before:sha(viteBefore),after:sha(viteAfter)},dispatch:{file:'script/demo/smokeNewDayIntegration.ts',from,to,before:sha(before),after:sha(changed)}},null,2));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(output,'native'),'--u01b',...['--native','--shared-negative','--joint-integration','--public-negatives','--individual-diagnostic','--expect-contract-rejection','--individual-success'].filter(flag=>process.argv.includes(flag))],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});
for(const [f,hash] of Object.entries(hashes))if(f!=='script/demo/smokeNewDayIntegration.ts')assert.equal(sha(readFileSync(join(source,f))),hash,'executed archive '+f);
writeFileSync(join(output,'checkout-delta.json'),JSON.stringify(Object.keys(hashes).filter(f=>sha(readFileSync(join(repo,f)))!==hashes[f]),null,2));
assert.equal(run.status,0);
