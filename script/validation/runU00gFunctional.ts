import {archiveEvidenceSource} from '../demo/archiveEvidenceSource';
/** Archive the candidate; dispatch injection affects only its disposable copy. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,symlinkSync,writeFileSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
assert.equal(process.versions.node.split('.')[0],'20');
const repo=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const directory=resolve(process.argv[2]??'work/u00g-functional');
assert.ok(!existsSync(directory),'Use a fresh directory; existing Evidence is never overwritten');
const source=join(directory,'source');mkdirSync(source,{recursive:true,mode:0o700});
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
archiveEvidenceSource(directory,source,head,repo);
const patch=execFileSync('git',['diff','--binary','HEAD'],{cwd:repo,maxBuffer:64*1024*1024});
if(patch.length){assert.ok(process.argv.includes('--working-tree'),'Commit the candidate or explicitly use --working-tree during development');execFileSync('git',['apply','-'],{cwd:source,input:patch,env:{...process.env,GIT_CEILING_DIRECTORIES:directory}});}
for(const folder of ['script/validation','supabase/migrations'])for(const file of readdirSync(join(repo,folder)))if(!existsSync(join(source,folder,file))){mkdirSync(join(source,folder),{recursive:true});copyFileSync(join(repo,folder,file),join(source,folder,file));}
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const harness=join(source,'script/demo/smokeNewDayIntegration.ts'),original=readFileSync(harness,'utf8');
const marker='const {runNewDayJourney}=process.argv.includes("--transport")';assert.equal(original.split(marker).length,2);
writeFileSync(harness,original.replace(marker,'const {runNewDayJourney}=process.argv.includes("--participant-meals")?{runNewDayJourney:(await import("../validation/u00gFunctionalJourney")).runU00gFunctionalJourney}:process.argv.includes("--transport")'));
writeFileSync(join(directory,'source-manifest.json'),JSON.stringify({head,workingTreePatchSha256:createHash('sha256').update(patch).digest('hex'),originalHarnessSha256:createHash('sha256').update(original).digest('hex'),injectedHarnessSha256:createHash('sha256').update(readFileSync(harness)).digest('hex'),remoteWrites:0},null,2));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(directory,'native'),'--participant-meals'],{cwd:source,env:process.env,stdio:'inherit'});
assert.equal(run.status,0,'Functional gate failed; do not mark READY');
