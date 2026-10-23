/** Diagnostic gate only. The intervention never modifies the checkout or solver. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,symlinkSync,writeFileSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';

assert.equal(process.versions.node.split('.')[0],'20','Use the baseline Node 20 runtime.');
const repo=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const directory=resolve(process.argv[2]??'work/p0-u00f-causal');
const source=join(directory,'source'),evidence=join(directory,'native'),marker=join(directory,'counterfactual-active');
assert.ok(!existsSync(directory),'Choose a new work directory; existing evidence is never overwritten.');
const base=execFileSync('git',['rev-parse',process.argv[3]??'HEAD'],{cwd:repo,encoding:'utf8'}).trim();
mkdirSync(source,{recursive:true,mode:0o700});
execFileSync('tar',['-x','-C',source],{input:execFileSync('git',['archive',base],{cwd:repo,maxBuffer:128*1024*1024})});
symlinkSync(join(repo,'node_modules'),join(source,'node_modules'),'dir');
const sha=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
const solverHashes=(root:string):Record<string,string>=>{
 const result:Record<string,string>={};
 const visit=(path:string)=>{for(const row of readdirSync(path,{withFileTypes:true})){
  const file=join(path,row.name);if(row.isDirectory())visit(file);else if(row.name.endsWith('.ts'))result[relative(root,file)]=sha(readFileSync(file));
 }};visit(join(root,'engine/planner-next'));return result;
};
const before=solverHashes(source);
const builder=join(source,'engine/buildInput.ts');let input=readFileSync(builder,'utf8');const original=input;
input='import {existsSync as u00fExists} from "node:fs";\n'+input;
const suppression='p.planner_next_profile?.configuration ? null : optimizerProjection.transport.';
assert.equal(input.split(suppression).length-1,2,'Base changed: review the intervention before running.');
input=input.replaceAll(suppression,'(p.planner_next_profile?.configuration && !u00fExists(process.env.OPTIPLAN_U00F_MARKER??"/no-u00f-marker")) ? null : optimizerProjection.transport.');
const needle='  let effectiveInput = applyPlanPlannerNextConfiguration(applyNewDayPlannerConfiguration(input,p.planner_next_profile,taskTemplateSnapshots),p.planner_next_configuration??p.plannerNextConfiguration);';
assert.ok(input.includes(needle),'Base changed: materialization call path must be reviewed.');
input=input.replace(needle,needle+`
  // Controlled causal intervention in this disposable archive only.
  if(u00fExists(process.env.OPTIPLAN_U00F_MARKER??"/no-u00f-marker")) {
    const transportKeys=["transportSettings","transportSpaceId","transportVanCapacity","vanCapacity","arrivalTaskTemplateName","departureTaskTemplateName","arrivalGroupingTarget","departureGroupingTarget","arrivalMinimumGroupSize","departureMinimumGroupSize","arrivalMaximumGroupSize","departureMaximumGroupSize","arrivalMinGapMinutes","departureMinGapMinutes"] as const;
    effectiveInput={...effectiveInput,...Object.fromEntries(transportKeys.map(key=>[key,input[key]])),optimizerWeights:{...effectiveInput.optimizerWeights,arrivalDepartureGrouping:input.optimizerWeights?.arrivalDepartureGrouping},
      tasks:effectiveInput.tasks.map(task=>({...task,operationalRole:task.templateId===input.transportSettings?.arrivalTemplateId?"transport_arrival" as const:task.templateId===input.transportSettings?.departureTemplateId?"transport_departure" as const:task.operationalRole}))};
  }
`);
writeFileSync(builder,input);
const harness=join(source,'script/demo/smokeNewDayIntegration.ts');let native=readFileSync(harness,'utf8');
const dispatch='const {runNewDayJourney}=process.argv.includes("--setup-families")';assert.ok(native.includes(dispatch));
native=native.replace(dispatch,'const {runNewDayJourney}=process.argv.includes("--transport-diagnostic")\n    ?{runNewDayJourney:(await import("./smokeNewDayTransportDiagnostic")).runNewDayJourney}\n    :process.argv.includes("--setup-families")');
writeFileSync(harness,native);
const journey=readFileSync(join(repo,'script/demo/smokeNewDayTransportDiagnostic.ts'),'utf8');
writeFileSync(join(source,'script/demo/smokeNewDayTransportDiagnostic.ts'),journey);
assert.deepEqual(solverHashes(source),before,'No solver file may change during this gate.');
const manifest={base,baseTree:execFileSync('git',['rev-parse',`${base}^{tree}`],{cwd:repo,encoding:'utf8'}).trim(),node:process.versions.node,
 originalBuilderSha256:sha(original),intervenedBuilderSha256:sha(input),journeySha256:sha(journey),solverHashes:before,
 solverChanged:false,sourceAuthority:'unmodified buildInput optimizer projection; source string never fabricated',
 intervention:'restore discarded optimizer transport authorities and explicit task roles in work archive only',remoteWrites:0};
writeFileSync(join(directory,'intervention.json'),JSON.stringify(manifest,null,2));
const diff=spawnSync('git',['diff','--no-index','--',join(repo,'engine/buildInput.ts'),builder],{encoding:'utf8'});
assert.ok(diff.status===0||diff.status===1);writeFileSync(join(directory,'counterfactual.patch'),diff.stdout.replace(/^ $/gm,''));
const run=spawnSync(process.execPath,['--import','tsx','script/demo/smokeNewDayIntegration.ts',evidence,'--transport-diagnostic'],{
 cwd:source,env:{...process.env,OPTIPLAN_U00F_MARKER:marker},stdio:'inherit'});
assert.equal(run.status,0,'Native gate infrastructure failed; inspect local artifacts.');
assert.deepEqual(solverHashes(source),before,'Solver files changed during the gate.');
const result=JSON.parse(readFileSync(join(evidence,'journey.json'),'utf8'));
writeFileSync(join(directory,'result.json'),JSON.stringify({status:result.status,nativeInfrastructure:'PASS',days:result.days,
 protectedContinuation:result.protectedContinuation,solverChanged:false,remoteWrites:0},null,2));
console.log(JSON.stringify({status:result.status,evidence,solverChanged:false,remoteWrites:0}));
