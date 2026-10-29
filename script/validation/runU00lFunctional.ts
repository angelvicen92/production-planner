import {archiveEvidenceSource} from '../demo/archiveEvidenceSource';
/** Native stack dispatch is injected only in an archived disposable copy. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
const directory=resolve(process.argv[2]);
assert.ok(!existsSync(directory),'Use a fresh evidence directory');
const baseline=false;
const beforeIntegrity=process.argv.includes('--before-integrity-guard');
const ref='HEAD';
const repo=process.cwd(),source=join(directory,'source');mkdirSync(source,{recursive:true});
archiveEvidenceSource(directory,source,ref);
const patch=baseline?Buffer.alloc(0):execFileSync('git',['diff','--binary','HEAD'],{maxBuffer:64*1024*1024});
if(patch.length)execFileSync('git',['apply','-'],{cwd:source,input:patch,env:{...process.env,GIT_CEILING_DIRECTORIES:directory}});
for(const file of execFileSync('git',['ls-files','--others','--exclude-standard','--','engine','server','shared','supabase'],{encoding:'utf8'}).trim().split('\n').filter(Boolean)){
  mkdirSync(dirname(join(source,file)),{recursive:true});copyFileSync(join(repo,file),join(source,file));
}
copyFileSync(join(repo,'script/validation/u00lFunctionalJourney.ts'),join(source,'script/validation/u00lFunctionalJourney.ts'));
if(beforeIntegrity&&existsSync(join(source,'supabase/migrations/112_main_nominal_resource_integrity.sql')))execFileSync('rm',['supabase/migrations/112_main_nominal_resource_integrity.sql'],{cwd:source});
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),original=readFileSync(file,'utf8');
const marker='const {runNewDayJourney}=process.argv.includes("--transport")';assert.equal(original.split(marker).length,2);
writeFileSync(file,original.replace(marker,'const {runNewDayJourney}=process.argv.includes("--nominal-functional")?{runNewDayJourney:(await import("../validation/u00lFunctionalJourney")).runU00lFunctionalJourney}:process.argv.includes("--transport")'));
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const productFiles=['engine/planner-next/exactMainAndFeederCore.ts','engine/planner-next/anonymousPipelineWitness.ts','engine/planner-next/integration/projectedTaskResources.ts','server/storage.ts','engine/types.ts','engine/planner-next/contracts.ts','engine/v3/resourceDiagnostics.ts','supabase/migrations/112_main_nominal_resource_integrity.sql','engine/planner-next/nominalResourceChoice.ts','engine/planner-next/integration/nominalResourceRequirements.ts','engine/planner-next/assistedPlanning.ts','engine/planner-next/exactItinerantPlan.ts','engine/planner-next/validate.ts','engine/planner-next/fingerprint.ts','engine/concreteTaskResourceRequirements.ts','engine/planner-next/integration/effectiveTaskResourceAssignments.ts','engine/planner-next/integration/engineInputPreflight.ts','engine/planner-next/integration/engineInputAdapter.ts','server/itinerantComposition.ts','server/assistedProposalService.ts','server/assistedPlanningService.ts','engine/planner-next/placement.ts','supabase/migrations/110_nominal_resource_integrity.sql'];
writeFileSync(join(directory,'manifest.json'),JSON.stringify({ref,beforeIntegrity,head:execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim(),node:process.versions.node,
  patchSha256:sha(patch),originalHarnessSha256:sha(original),journeySha256:sha(readFileSync(join(source,'script/validation/u00lFunctionalJourney.ts'))),
  lockfileSha256:sha(readFileSync(join(source,'package-lock.json'))),sourceHashes:Object.fromEntries(productFiles.map(file=>[file,existsSync(join(source,file))?sha(readFileSync(join(source,file))):null])),remoteWrites:0},null,2));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',join(directory,'native'),'--nominal-functional'],{cwd:source,env:{...process.env,OPTIPLAN_U00L_BEFORE_INTEGRITY:beforeIntegrity?'1':'0',GIT_CEILING_DIRECTORIES:directory,OPTIPLAN_U00L_FUNCTIONAL_BASELINE:baseline?'1':'0'},stdio:'inherit'});
assert.equal(run.status,0);
