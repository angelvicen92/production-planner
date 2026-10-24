/** Offline causal gate. Run from repository root with a fresh output directory. */
import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,mkdtempSync,symlinkSync,rmSync,readdirSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {scenario,counterfactual} from './scenario';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';

const root=process.cwd(),out=resolve(process.argv[2]??'/tmp/u00k-evidence');
assert.ok(!existsSync(out),'Use a fresh destination');mkdirSync(out,{recursive:true});
const base='4733938cad61897a2a3ea89cf77dd6a1c0de0383';
const execute=promisify(execFile);
const git=async(...args:string[])=>(await execute('git',args,{cwd:root,encoding:'utf8'})).stdout.trim();
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const save=(name:string,value:unknown)=>writeFileSync(join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const runtimePaths=['engine','server','shared','client','script','supabase','.github','package.json','package-lock.json','tsconfig.json'];
assert.equal(await git('diff',base,'--name-only','--',...runtimePaths),'','Production sources must be unchanged');
const input=scenario(root);
for(const mode of ['B','A','anyOf','byType'] as const)save(`input-${mode}`,counterfactual(input,mode));
const technical=structuredClone(input);
technical.tasks.find(t=>t.id===20)!.plannerNextKind='technical';
delete technical.tasks.find(t=>t.id===20)!.contestantId;
save('input-technical-design',technical);
for(const mode of ['A','anyOf','byType'] as const){
  const controlled=counterfactual(input,mode);controlled.tasks.find(t=>t.id===4)!.resourceRequirements=input.tasks.find(t=>t.id===4)!.resourceRequirements;
  assert.deepEqual(controlled,input,'Only the Main resource requirement may differ');
}
const probe=async(sourceRoot:string,label:string,mode:string)=>{
  await execute(process.execPath,['--import','tsx',join(sourceRoot,'docs/evidence/p0-u00k/probe.ts'),join(out,`input-${mode}.json`),join(out,label)],
    {cwd:sourceRoot,maxBuffer:10*1024*1024});
  return (name:string)=>read(join(out,label,name+'.json'));
};
const controls:Record<string,Awaited<ReturnType<typeof probe>>>={};
for(const mode of ['B','A','anyOf','byType'])controls[mode]=await probe(root,`current-${mode}`,mode);
const initialDesign=await probe(root,'rejected-technical-design','technical-design');
assert.ok(initialDesign('assisted').evidence.reasonCodes.includes('UNSUPPORTED_STANDALONE_TASK_KIND:task:20'));
assert.equal(controls.B('assisted').evidence.completeForScope,true);
assert.equal(controls.B('validation').hardValid,true);
assert.equal(controls.B('assisted').proposal.length,11);
assert.equal(controls.A('execution').result.status,'INFEASIBLE');
for(const mode of ['anyOf','byType']){
  assert.equal(controls[mode]('adapter').status,'UNSUPPORTED');
  assert.deepEqual(controls[mode]('resolver').issues,[{reason:'ANYOF_REQUIRES_ORDINARY_STANDALONE_AUXILIARY'}]);
}

// Fresh copies only. No patch is ever applied to the checkout or its node_modules.
const scratch=mkdtempSync(join(tmpdir(),'u00k-disposable-'));
const patches:{file:string;before:string;after:string;purpose:string}[]=[];
const patch=(file:string,before:string,after:string,purpose:string)=>{
  const path=join(scratch,file),source=readFileSync(path,'utf8');
  assert.equal(source.split(before).length,2,`Patch must match exactly once: ${file}`);
  writeFileSync(path,source.replace(before,after));patches.push({file,before,after,purpose});
};
let isolated:any;
try{
  for(const path of ['engine','server','shared','docs/evidence/p0-u00k'])cpSync(join(root,path),join(scratch,path),{recursive:true});
  for(const path of ['package.json','tsconfig.json'])cpSync(join(root,path),join(scratch,path));
  symlinkSync(join(root,'node_modules'),join(scratch,'node_modules'),'dir');
  patch('engine/planner-next/integration/engineInputAdapter.ts','const canonicalPlannerNextReasonCodes = preflightPlannerNextProblem(problem);',
    '(globalThis as any).__u00kAdaptedProblem=structuredClone(problem);\n  const canonicalPlannerNextReasonCodes = preflightPlannerNextProblem(problem);','Neutral observation before canonical preflight');
  patch('engine/planner-next/exactMainAndFeederCore.ts','lastHardGateValidation=validation;',
    'lastHardGateValidation=validation;\n    (globalThis as any).__u00k?.hardGate.push({expected:[...expectedIds].sort(),placed:structuredClone(placed),validation});','Neutral observation of real hardGateCoreLeaf validation');
  patch('engine/planner-next/placement.ts',
    "if(task.nominalResourceChoice&&!nominalResourceAssignmentMatches(problem.tasks.find(source=>source.id===task.id)??task,task))return false;",
    "if(task.nominalResourceChoice&&!nominalResourceAssignmentMatches(problem.tasks.find(source=>source.id===task.id)??task,task)){const tap=(globalThis as any).__u00k;tap?.placementRejections.push({taskId:task.id,start,choice:task.nominalResourceChoice,reason:'NOMINAL_RESOURCE_ASSIGNMENT',...(tap.placementRejections.length<8?{stack:new Error().stack}:{} )});return false;}",
    'Neutral observation of existing rejection; no additional placement checks');
  const observed=await probe(scratch,'neutral-B','B');
  const withoutTiming=(value:any):any=>Array.isArray(value)?value.map(withoutTiming):value&&typeof value==='object'?
    Object.fromEntries(Object.entries(value).filter(([key])=>!key.endsWith('Ms')).map(([key,v])=>[key,withoutTiming(v)])):value;
  for(const name of ['preflight','adapter','assisted','execution','characterization','draft','validation'])
    assert.deepEqual(withoutTiming(observed(name)),withoutTiming(controls.B(name)),`Neutrality: ${name}`);
  patch('engine/planner-next/integration/nominalResourceRequirements.ts',
    "if(input.plannerNext?.profile!=='STANDALONE_ONLY'||task.plannerNextKind!=='auxiliary'||structured)",
    'if(structured)','S1: bypass only profile/kind admission in discarded resolver');
  const guard=await probe(scratch,'guard-only','anyOf');assert.equal(guard('preflight').status,'SUPPORTED');
  assert.equal(guard('adapter').status,'UNSUPPORTED');
  patch('engine/planner-next/validate.ts',
    "||!standaloneOnly||problem.searchPolicy!=='EXACT_CONSTRUCTIVE'||task.kind!==\"auxiliary\"",
    "||problem.searchPolicy!=='EXACT_CONSTRUCTIVE'",'S2: isolate canonical profile/kind admission; retain physical validation');
  const canonical=await probe(scratch,'both-guards','anyOf');assert.equal(canonical('adapter').status,'UNSUPPORTED');
  const projected=canonical('observed-adapted-problem'),main=projected.tasks.find((t:any)=>t.id==='task:4');
  assert.deepEqual(main.nominalResourceChoice.fixedResourceIds,['plan-resource:2']);
  assert.ok(!projected.resources.some((r:any)=>r.id==='plan-resource:2'));
  assert.ok(projected.coaches.some((r:any)=>r.id==='plan-resource:2'));
  patch('engine/planner-next/integration/engineInputAdapter.ts',
    "...projection.lockedResourceIds])].sort((a,b)=>a-b).map(id=>canonical('plan-resource',id)),",
    "...projection.lockedResourceIds])].filter(id=>id!==projection.coachResourceId).sort((a,b)=>a-b).map(id=>canonical('plan-resource',id)),",
    'S3: isolate coach channel projection, retaining coachId and every generic fixed resource');
  isolated=await probe(scratch,'channel-projection','anyOf');
  const typed=await probe(scratch,'channel-projection-byType','byType');
  assert.equal(isolated('adapter').status,'SUPPORTED');assert.equal(typed('adapter').status,'SUPPORTED');
  assert.deepEqual(typed('resolver').resourceIds,isolated('resolver').resourceIds);
  assert.equal(typed('execution').result.status,'CORE_FAILED');
  assert.equal(isolated('execution').result.status,'CORE_FAILED');
  assert.equal(isolated('search-taps').hardGate.length,0);
  assert.ok(isolated('search-taps').placementRejections.length>0);
  const c=isolated('characterization'),g=c.graphs;
  assert.equal(typed('characterization').selectedControls[1].execution.result.status,'COMPLETE');
  assert.equal(g[0].witness.status,'FEASIBLE');
  assert.equal(c.rawPlacement.firstRejectionReason,'NOMINAL_RESOURCE_ASSIGNMENT');
  assert.ok(!g[0].edges.some((e:any)=>e.mainTaskId==='task:4'));
  assert.equal(g[0].matchingDiagnostic.terminalCause,'NO_PERFECT_MATCH');
  assert.equal(c.variants[0].dynamicWithCritical.eligibleStartCount,0);
  assert.ok(c.variants[1].dynamicWithCritical.eligibleStartCount>0);
  assert.equal(g[1].reserved,null);assert.ok(g[2].reserved);
  assert.equal(g[2].repaired.outcome,'PERFECT');
  assert.equal(c.selectedControls[0].execution.result.status,'INFEASIBLE');
  assert.equal(c.selectedControls[1].execution.result.status,'COMPLETE');
  assert.equal(c.selectedControls[1].partial.proposal.length,1);
  assert.equal(c.selectedControls[1].partial.evidence.nominalPhysicalFutureWitness.tasks.length,11);
  assert.ok(c.forgeries.every((f:any)=>!f.validation.hardValid));
  assert.notEqual(c.fingerprints[0].fingerprint,c.fingerprints[1].fingerprint);
  assert.equal(g[1].v2.fingerprint,g[2].v2.fingerprint,'Supporting certificate is not a physical Main selection certificate');
  assert.equal(g[2].v2Revalidation.rejectCause,null);
  assert.ok(isolated('neutral-taps').placementRejections.length>0);
  assert.ok(isolated('neutral-taps').hardGate.some((tap:any)=>tap.validation.hardValid));
  save('scratch-interventions',{integrated:false,solverCapabilityImplemented:false,neutrality:'PASS, complete receipts equal excluding *Ms',patches});
}finally{rmSync(scratch,{recursive:true,force:true});}

// Revalidate frozen native U00a observations without network or writes.
const baselines=[];
for(const label of ['first','second']){
  const path=`docs/evidence/p0-u00a/native/${label}-input.json`,frozen=read(join(root,path));
  const adapter=adaptEngineInputToPlannerNextProblem(frozen);assert.equal(adapter.status,'SUPPORTED');
  if(adapter.status!=='SUPPORTED')throw Error('unreachable');
  const prior=read(join(root,`docs/evidence/p0-u00a/native/${label}-proposal.json`));
  const result=executeAssistedPlanning(buildAssistedProblem(adapter.problem,
    createPlanningScope({kind:'TASK_IDS',value:'historical U00a replay'},{},adapter.problem.tasks.map(t=>t.id)),[]));
  assert.equal(result.evidence.completeForScope,true);assert.equal(result.evidence.fingerprint,prior.evidence.fingerprint);
  baselines.push({path,inputSha256:hash(readFileSync(join(root,path))),fingerprint:result.evidence.fingerprint,
    obligations:result.proposal!.length,originalStage:`docs/evidence/p0-u00a/native/${label}-stage.json`,
    originalStageSha256:hash(readFileSync(join(root,`docs/evidence/p0-u00a/native/${label}-stage.json`))),replay:result});
}
save('historical-replay',baselines);
const files=(await git('ls-files','--',...runtimePaths)).split('\n').filter(Boolean);
const sources=files.map(path=>({path,sha256:hash(readFileSync(join(root,path)))}));
save('source-authority',{base,node:process.version,lockfileSha256:hash(readFileSync(join(root,'package-lock.json'))),
  changedExecutionFiles:await git('diff',base,'--name-only','--',...runtimePaths),files:sources,
  unchangedA2Baseline:'docs/evidence/p0-u00j/a2/execution.json',
  a2BaselineSha256:hash(readFileSync(join(root,'docs/evidence/p0-u00j/a2/execution.json'))),
  a2Rerun:false,networkRequests:0,productionWrites:0,persistedNewStage:false});
save('summary',{status:'PASS',base,positive:{status:'COMPLETE',obligations:11,hardValid:true,draft:'current-B/draft.json',persisted:false},
  negative:{status:controls.A('execution').result.status,branches:controls.A('execution').result.evidence.branchesExplored},
  currentNominalRejection:'UNSUPPORTED_RESOURCE_REQUIREMENT: ANYOF_REQUIRES_ORDINARY_STANDALONE_AUXILIARY',
  firstDownstreamLoss:'residualMatching.evaluate -> materializeAnchoredOperation -> canPlaceTask: unselected Main rejected as NOMINAL_RESOURCE_ASSIGNMENT; prepareLegacyPipelineBundleGraph independently has the same missing variant before insertion',
  y2:'NOT_DEMONSTRATED: no A/B alternatives coexist in the generated graph; not the first causal loss',
  baselines:baselines.map(({path,fingerprint,obligations})=>({path,fingerprint,obligations})),assertions:'PASS'});
const receipts:Record<string,unknown>={};
const collect=(directory:string)=>{for(const entry of readdirSync(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);if(entry.isDirectory())collect(path);else if(entry.name.endsWith('.json'))receipts[relative(out,path)]=read(path);
}};collect(out);
writeFileSync(join(out,'receipts.json.gz'),gzipSync(JSON.stringify(receipts),{level:9}));
console.log(JSON.stringify({status:'PASS',output:out,receipts:Object.keys(receipts).length}));
