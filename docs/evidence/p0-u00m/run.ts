/** Diagnostic only. Dispatch modification is confined to a fresh git archive. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
const base='e03f3476020fc220f9d70f86d6e9b8a05c818eeb';
const output=resolve(process.argv[2]??'/tmp/p0-u00m');
assert.ok(!existsSync(output),'Choose a fresh output directory');
const repo=process.cwd(),source=join(output,'source');mkdirSync(source,{recursive:true});
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive',base],{maxBuffer:256*1024*1024})});
mkdirSync(join(source,'docs/evidence/p0-u00m'),{recursive:true});
copyFileSync(join(repo,'docs/evidence/p0-u00m/journey.ts'),join(source,'docs/evidence/p0-u00m/journey.ts'));
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),before=readFileSync(file,'utf8');
const from='const {runNewDayJourney}=process.argv.includes("--transport")';
const to='const {runNewDayJourney}=process.argv.includes("--u00m")?{runNewDayJourney:(await import("../../docs/evidence/p0-u00m/journey")).journey}:process.argv.includes("--transport")';
assert.equal(before.split(from).length,2);const after=before.replace(from,to);writeFileSync(file,after);
const sha=(s:Buffer|string)=>createHash('sha256').update(s).digest('hex');
const files=execFileSync('git',['ls-tree','-r','--name-only',base,'--','engine','server','client','shared','supabase','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n');
const hashes=Object.fromEntries(files.map(f=>[f,sha(readFileSync(join(source,f)))]));
writeFileSync(join(output,'manifest.json'),JSON.stringify({base,node:process.version,remoteWrites:0,
  dispatch:{file:'script/demo/smokeNewDayIntegration.ts',from,to,before:sha(before),after:sha(after)},
  productHashes:hashes,journeyHash:sha(readFileSync(join(source,'docs/evidence/p0-u00m/journey.ts')))},null,2));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(output,'native'),'--u00m'],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:output},stdio:'inherit'});
for(const [f,hash] of Object.entries(hashes)){
  assert.equal(sha(readFileSync(join(source,f))),hash,f);
  assert.equal(sha(readFileSync(join(repo,f))),hash,`checkout changed: ${f}`);
}
assert.equal(run.status,0);
