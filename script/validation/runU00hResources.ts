/** Native stack dispatch is injected only in an archived disposable copy. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
const directory=resolve(process.argv[2]);
assert.ok(!existsSync(directory),'Use a fresh evidence directory');
const baseline=process.argv.includes('--baseline');
const ref=baseline?'5256102bf5c7eb925fd24ab1d868c2d22bc91a6e':'HEAD';
const repo=process.cwd(),source=join(directory,'source');mkdirSync(source,{recursive:true});
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive',ref],{maxBuffer:256*1024*1024})});
const patch=baseline?Buffer.alloc(0):execFileSync('git',['diff','--binary','HEAD'],{maxBuffer:64*1024*1024});
if(patch.length)execFileSync('git',['apply','-'],{cwd:source,input:patch,env:{...process.env,GIT_CEILING_DIRECTORIES:directory}});
copyFileSync(join(repo,'script/validation/u00hResourceJourney.ts'),join(source,'script/validation/u00hResourceJourney.ts'));
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),original=readFileSync(file,'utf8');
const marker='const {runNewDayJourney}=process.argv.includes("--transport")';assert.equal(original.split(marker).length,2);
writeFileSync(file,original.replace(marker,'const {runNewDayJourney}=process.argv.includes("--concrete-resources")?{runNewDayJourney:(await import("../validation/u00hResourceJourney")).runU00hResourceJourney}:process.argv.includes("--transport")'));
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const productFiles=['engine/concreteTaskResourceRequirements.ts','engine/planner-next/integration/effectiveTaskResourceAssignments.ts','engine/planner-next/integration/engineInputPreflight.ts','engine/planner-next/integration/engineInputAdapter.ts','server/itinerantComposition.ts','server/assistedProposalService.ts'];
writeFileSync(join(directory,'manifest.json'),JSON.stringify({ref,head:execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim(),node:process.versions.node,
  patchSha256:sha(patch),originalHarnessSha256:sha(original),journeySha256:sha(readFileSync(join(source,'script/validation/u00hResourceJourney.ts'))),
  lockfileSha256:sha(readFileSync(join(source,'package-lock.json'))),sourceHashes:Object.fromEntries(productFiles.map(file=>[file,existsSync(join(source,file))?sha(readFileSync(join(source,file))):null])),remoteWrites:0},null,2));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(directory,'native'),'--concrete-resources'],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:directory,OPTIPLAN_U00H_BASELINE:baseline?'1':'0'},stdio:'inherit'});
assert.equal(run.status,0);
