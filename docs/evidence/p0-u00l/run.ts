/** Causal probes in archived, disposable sources; no service or product writes. */
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
const repo=process.cwd(),target=resolve(process.argv[2]);assert.ok(!existsSync(target),'Use a fresh destination');mkdirSync(target,{recursive:true});
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const manifest:any={base:'4eca413065d3832bce8ccbbf005b8829beaed5e7',candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,remoteWrites:0,probes:[]};
for(const label of ['pre-identity','current','without-variant-keys']){
 const ref=label==='pre-identity'?manifest.base:manifest.candidate,source=join(target,`source-${label}`);mkdirSync(source);
 const env={...process.env,GIT_CEILING_DIRECTORIES:target,SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_ANON_KEY:'offline',SUPABASE_SERVICE_ROLE_KEY:'offline'};
 try{
  execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive',ref],{maxBuffer:256*1024*1024})});
  symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
  const dir=join(source,'docs/evidence/p0-u00l');mkdirSync(dir,{recursive:true});
  const worker=label==='pre-identity'?'pre-identity-probe.ts':'choice-probe.ts';copyFileSync(join(repo,'docs/evidence/p0-u00l',worker),join(dir,worker));
  const intervention:any={label,ref};
  if(label==='pre-identity'){
   const patch=gunzipSync(readFileSync(join(repo,'docs/evidence/p0-u00l/pre-identity-delta.patch.gz')));execFileSync('git',['apply','-'],{cwd:source,env,input:patch});intervention.patchSha256=sha(patch);
  }
  if(label==='without-variant-keys'){
   const file=join(source,'engine/planner-next/nominalResourceChoice.ts'),before=readFileSync(file,'utf8');
   const old=before.split('\n').find(line=>line.startsWith('  return `${taskId}@${position}'))!;assert.ok(old);
   const replacement='  return `${taskId}@${position}`;';writeFileSync(file,before.replace(old,replacement));
   intervention.change={file:'engine/planner-next/nominalResourceChoice.ts',old,replacement,beforeSha256:sha(before),afterSha256:sha(readFileSync(file))};
  }
  intervention.runtimeHashes=Object.fromEntries(['engine/planner-next/anonymousPipelineWitness.ts','engine/planner-next/exactMainAndFeederCore.ts','engine/planner-next/nominalResourceChoice.ts'].map(file=>[file,sha(readFileSync(join(source,file)))]));
  execFileSync(process.execPath,['--import','tsx',join(dir,worker),join(target,`${label}.json`)],{cwd:source,env,stdio:'inherit'});
  manifest.probes.push(intervention);
 }finally{rmSync(source,{recursive:true,force:true});}
}
const current=JSON.parse(readFileSync(join(target,'current.json'),'utf8')),collapsed=JSON.parse(readFileSync(join(target,'without-variant-keys.json'),'utf8'));
for(const r of [current,collapsed]){assert.ok(r.generated.every((row:any)=>row.variants.length===2));assert.equal(r.physicalRejection.firstRejectionReason,'OVERLAP_REQUIRED_RESOURCE');}
assert.equal(current.execution.result.complete,true);assert.equal(collapsed.execution.result.complete,false);
assert.equal(current.repaired.matching.find(([id]:[string])=>id==='task:4')[1],current.first.matching.find(([id]:[string])=>id==='task:4')[1]);
assert.equal(current.repaired.scheduledTasks.find((t:any)=>t.id==='task:4').nominalResourceChoice.selectedResourceId,'plan-resource:102');
manifest.status='PASS';writeFileSync(join(target,'manifest.json'),JSON.stringify(manifest,null,2));
console.log('PASS: variants coexist; task/spot-only rejection loses B; physical variant identity recovers B in the same spot.');
