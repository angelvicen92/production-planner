/** Diagnostic dispatch lives only in a fresh archive; production files stay literal. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
const base='8868ebc365a4941977050d337b4b00a5d2ca553f';
const output=resolve(process.argv[2]??'/tmp/p0-u00q');assert.ok(!existsSync(output),'Choose fresh output');
const repo=process.cwd(),source=join(output,'source');mkdirSync(source,{recursive:true});
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive',base],{maxBuffer:256*1024*1024})});
mkdirSync(join(source,'docs/evidence/p0-u00q'),{recursive:true});
copyFileSync(join(repo,'docs/evidence/p0-u00q/journey.ts'),join(source,'docs/evidence/p0-u00q/journey.ts'));
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const paths=execFileSync('git',['ls-tree','-r','--name-only',base,'--','engine','server','client','shared','supabase','script','docs/source/official','docs/evidence','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n');
const hashes=Object.fromEntries(paths.map(f=>[f,sha(readFileSync(join(source,f)))]));
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),before=readFileSync(file,'utf8');
const from='const journey=process.argv.includes("--daily-rounds")?';
const to='const journey=process.argv.includes("--u00q")?(await import("../../docs/evidence/p0-u00q/journey")).journey:process.argv.includes("--daily-rounds")?';
assert.equal(before.split(from).length,2);writeFileSync(file,before.replace(from,to));
writeFileSync(join(output,'manifest.json'),JSON.stringify({base,baseTree:execFileSync('git',['rev-parse',base+'^{tree}'],{encoding:'utf8'}).trim(),node:process.version,remoteWrites:0,sourceHashes:hashes,journeyHash:sha(readFileSync(join(source,'docs/evidence/p0-u00q/journey.ts'))),dispatch:{file:'script/demo/smokeNewDayIntegration.ts',from,to,before:sha(before),after:sha(readFileSync(file))}},null,2));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(output,'native'),'--u00q'],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});
for(const [f,hash] of Object.entries(hashes)){
  assert.equal(sha(readFileSync(join(repo,f))),hash,'checkout '+f);
  assert.equal(sha(readFileSync(join(source,f))),f==='script/demo/smokeNewDayIntegration.ts'?sha(before.replace(from,to)):hash,'archive '+f);
}
assert.equal(run.status,0);
