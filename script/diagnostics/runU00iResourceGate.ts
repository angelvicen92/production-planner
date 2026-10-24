/** Red API reproduction and bounded counterfactuals in an exact, disposable base archive. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
const directory=resolve(process.argv[2]);
assert.ok(!existsSync(directory),'Use a fresh evidence directory');
const ref='e79f8ee1a13ef5f5df58371abc851b4746385412';
const repo=process.cwd(),source=join(directory,'source');mkdirSync(source,{recursive:true});
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive',ref],{maxBuffer:256*1024*1024})});
const productFiles=execFileSync('git',['ls-tree','-r','--name-only',ref,'--','engine','server','shared','client','supabase','script/demo'],{encoding:'utf8'}).trim().split('\n');
const sourceHashes=Object.fromEntries(productFiles.map(file=>{
  const archived=sha(readFileSync(join(source,file)));
  assert.equal(sha(readFileSync(join(repo,file))),archived,`Product differs from verified base: ${file}`);
  return [file,archived];
}));
const diagnosticFiles=['u00iResourceJourney.ts','analyseU00iResourceGate.ts'];
for(const file of diagnosticFiles)copyFileSync(join(repo,'script/diagnostics',file),join(source,'script/diagnostics',file));
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const file=join(source,'script/demo/smokeNewDayIntegration.ts'),original=readFileSync(file,'utf8');
const marker='const {runNewDayJourney}=process.argv.includes("--transport")';assert.equal(original.split(marker).length,2);
writeFileSync(file,original.replace(marker,'const {runNewDayJourney}=process.argv.includes("--nominal-resources")?{runNewDayJourney:(await import("../diagnostics/u00iResourceJourney")).runU00iResourceJourney}:process.argv.includes("--transport")'));
const manifest={ref,baseTree:execFileSync('git',['rev-parse',`${ref}^{tree}`],{encoding:'utf8'}).trim(),node:process.versions.node,
  originalHarnessSha256:sha(original),diagnosticHashes:Object.fromEntries(diagnosticFiles.map(file=>[file,sha(readFileSync(join(source,'script/diagnostics',file)))])),
  lockfileSha256:sha(readFileSync(join(source,'package-lock.json'))),sourceHashes,remoteWrites:0};
writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
const run=(args:string[])=>assert.equal(spawnSync(process.execPath,['--import','tsx',...args],{cwd:source,env:{...process.env,GIT_CEILING_DIRECTORIES:directory},stdio:'inherit'}).status,0);
run(['script/demo/smokeNewDayIntegration.ts',join(directory,'native'),'--nominal-resources']);
const input=join(directory,'native/A-input.json');
run(['script/diagnostics/analyseU00iResourceGate.ts',input,join(directory,'boundary.json')]);
// Remove exactly the unconditional anyOf rejection, only in this archived copy.
// A fresh process then observes every downstream authority unchanged.
const preflight=join(source,'engine/planner-next/integration/engineInputPreflight.ts');
const guarded=readFileSync(preflight,'utf8');
const rejection='      addIssue("UNSUPPORTED_RESOURCE_REQUIREMENT", "task", task.id, `${path}.resourceRequirements.anyOf.${index}`, "Resource alternatives cannot be converted to a fixed resource.", { quantity: group.quantity });';
assert.equal(guarded.split(rejection).length,2);
writeFileSync(preflight,guarded.replace(rejection,'      // Diagnostic counterfactual: unconditional anyOf rejection omitted.'));
try{
  run(['script/diagnostics/analyseU00iResourceGate.ts',input,join(directory,'guard-released.json'),'--guard-released']);
}finally{writeFileSync(preflight,guarded);}
// The dispatch and temporary guard are the only archive modifications to product.
writeFileSync(file,original);
for(const [file,expected] of Object.entries(sourceHashes))assert.equal(sha(readFileSync(join(source,file))),expected,`Archive product mutated: ${file}`);
writeFileSync(join(directory,'summary.json'),JSON.stringify({status:'DIAGNOSTIC_PASS_IMPLEMENTATION_BLOCKED',base:ref,
  productFileCount:productFiles.length,productUnchanged:true,nativePreflight:'REJECTED',concreteBFullWitness:'PASS',
  concreteAScopeClosesFuture:'REPRODUCED',guardOnlyProjectionLoss:'REPRODUCED',remoteWrites:0},null,2));
