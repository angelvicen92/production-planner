/** Read-only diagnostic. The search patch runs exclusively in an isolated checkout.
 * --candidate snapshots current files, including uncommitted edits; default replays #1119. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,readFileSync,symlinkSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {PlannerNextProblem,ScheduledTask} from '../../engine/planner-next/contracts';
import {executePlannerNext} from '../../engine/planner-next/executePlannerNext';
import {buildAssistedProblem,executeAssistedPlanning} from '../../engine/planner-next/assistedPlanning';
import {generateMainFlowPatterns} from '../../engine/planner-next/mainFlowPatterns';
import {validatePlan} from '../../engine/planner-next/validate';
import {materializeScheduledItinerantUnitMeals} from '../../engine/planner-next/itinerantUnitMeals';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {analyticalFutureEligibleTaskIds,resolveAssistedScope} from '../../server/assistedScopeResolver';

const self=fileURLToPath(import.meta.url),root=resolve(dirname(self),'../..');
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const runs=(pattern:readonly string[])=>pattern.reduce((n,k,i)=>n+(i===0||pattern[i-1]!==k?1:0),0);
const scheduledRuns=(tasks:readonly ScheduledTask[])=>runs(tasks.filter(t=>t.kind==='main')
  .sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id)).map(t=>t.blockKey??''));
const setPreference=(problem:PlannerNextProblem,count:number|undefined)=>{
  // Candidate: internal safe objective. Historical replay: isolated archived patch.
  (problem.mainFlow as typeof problem.mainFlow&{preferredBlockCount?:number}).preferredBlockCount=count;
};

export function coldFallbackFixture():PlannerNextProblem {
  const availability=[{start:0,end:120}];
  return {day:availability[0]!,spaces:[{id:'main',availability:[{start:60,end:80}]},
    ...['voice-a','voice-b','finish-a1','finish-a2'].map(id=>({id,availability}))],resources:[],
    participants:['a1','a2','b1','b2'].map(id=>({id,availability})),coaches:['a','b'].map(id=>({id,availability})),
    tasks:[...['a1','a2','b1','b2'].flatMap(id=>[
      {id:`voice-${id}`,kind:'vocal' as const,participantId:id,coachId:id[0]!,duration:5,spaceId:`voice-${id[0]}`,dependencies:[]},
      {id:`main-${id}`,kind:'main' as const,participantId:id,coachId:id[0]!,duration:5,spaceId:'main',blockKey:id[0]!,dependencies:[`voice-${id}`]},
    ]),...['a1','a2'].map(id=>({id:`finish-${id}`,kind:'auxiliary' as const,participantId:id,duration:5,
      spaceId:`finish-${id}`,dependencies:[`main-${id}`],availability:[{start:70,end:75}]}))],
    mainFlow:{spaceId:'main',preferredEnd:80,continuity:'REQUIRED',maxBlocksByKey:2,minTasksPerBlock:1},
    auxiliaryPolicy:{participantPresencePreference:'OFF'},participantTransitionMinutes:0,resourceTransitionMinutes:0,
    searchPolicy:'EXACT_CONSTRUCTIVE',budget:{bestK:5,maxBacktracks:100,maxPatterns:200,maxBranchExpansions:1000}};
}

function coldWorker(destination:string){
  const candidate=process.argv.includes("--candidate");
  const source=coldFallbackFixture();
  const run=(p:PlannerNextProblem)=>{
    const before=JSON.stringify(p),started=performance.now(),execution=executePlannerNext(p,{causalDiagnostic:true});
    assert.equal(JSON.stringify(p),before);assert.equal(execution.kind,'EXACT_CONSTRUCTIVE');
    if(execution.kind!=='EXACT_CONSTRUCTIVE')throw Error('Unsupported diagnostic fixture');
    const result=execution.result,validation=result.complete?validatePlan(p,result.scheduledTasks):null;
    return {complete:result.complete,status:result.status,branches:result.evidence.branchesExplored,
      coreBranches:result.evidence.coreBranches,standaloneBranches:result.evidence.standaloneBranches,
      patternsExplored:result.evidence.patternCandidatesExplored,timelinesExplored:result.evidence.timelineCandidatesExplored,
      achieved:result.complete?scheduledRuns(result.scheduledTasks):null,reasonCodes:result.evidence.reasonCodes,
      fingerprint:result.evidence.fullFingerprint,validation,durationMs:performance.now()-started,
      architecturesChecked:result.evidence.architecturesChecked,architecturesStructurallyRejected:result.evidence.architecturesStructurallyRejected,
      structuralRejectionsByReason:result.evidence.structuralRejectionsByReason,futureDependencyStructural:result.evidence.futureDependencyStructural,
      architectureFutureDependencyStructural:result.evidence.architectureFutureDependencyStructural,
      selectedPattern:result.scheduledTasks.filter(t=>t.kind==='main').sort((a,b)=>a.start-b.start).map(t=>t.blockKey),
      mainFlowSoftPreference:result.evidence.mainFlowSoftPreference,causalDiagnostic:result.evidence.causalDiagnostic};
  };
  const baseline=run(source);assert.equal(baseline.complete,true);assert.equal(baseline.validation!.hardValid,true);
  const measuredPreferred=structuredClone(source);setPreference(measuredPreferred,4);
  const preferredCost=candidate?run(measuredPreferred):null;
  if(candidate)assert.equal(preferredCost!.complete,true);
  const samples=[...new Set([baseline.branches,baseline.branches*2,...(preferredCost?[95,preferredCost.branches]:[]),source.budget.maxBranchExpansions])].sort((a,b)=>a-b);
  const results=samples.map(budget=>{
    const auto=structuredClone(source);auto.budget.maxBranchExpansions=budget;
    const preferred=structuredClone(auto);setPreference(preferred,4);
    const a=run(auto),b=run(preferred),repeat=run(preferred);
    const stable=({durationMs:_duration,...value}:typeof b)=>value;
    assert.deepEqual(stable(b),stable(repeat));assert.equal(a.complete,true);assert.equal(a.achieved,2);
    assert.equal(a.validation!.hardValid,true);if(candidate){assert.equal(b.complete,true);assert.equal(b.validation!.hardValid,true);assert.equal(b.achieved,2);assert.equal(b.fingerprint,a.fingerprint);}
    else {assert.equal(b.complete,false);assert.equal(b.status,'BRANCH_BUDGET_EXHAUSTED');}
    assert.ok(b.branches<=budget);return {budget,auto:a,preferred:b,deterministic:true};
  });
  const generator=generateMainFlowPatterns as (...args:any[])=>{patterns:string[][];exhausted:boolean};
  const patterns=generator(source.tasks.filter(t=>t.kind==='main'),1,2,source.budget.maxPatterns,[],4);
  assert.equal(patterns.exhausted,false);assert.ok(patterns.patterns.some(p=>runs(p)===2));
  const result={preferredPatterns:patterns,case:'COLD_FALLBACK',status:candidate?'CANDIDATE_EVALUATED':'EXPECTED_REGRESSION_REPRODUCED',source,baseline,results,
    conclusion:candidate?'AUTO secures the complete incumbent before SOFT improvement; one ledger accounts for both phases.':'INCONCLUSIVE search, not an engine infeasibility certificate. AUTO loses a complete valid fallback under identical budgets.'};
  writeFileSync(resolve(destination,'cold-fallback.json'),JSON.stringify(result,null,2));
  return {case:result.case,status:result.status,baselineBranches:baseline.branches,samples};
}

async function a2Worker(count:number|undefined,destination:string){
  const warm=process.argv.includes('--warm');
  const label=`${warm?'warm-':''}${count??'AUTO'}`;
  // This worker uses table fixtures only. Prevent any accidental SDK call from reaching a real project.
  process.env.SUPABASE_URL='http://127.0.0.1:1';process.env.SUPABASE_ANON_KEY='diagnostic-local-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY='diagnostic-local-service';
  const [{buildEngineInput},{buildA2ImportRows},{a2HistoricalCatalog},{a2ImportStorageFixture}]=await Promise.all([
    import('../../engine/buildInput'),import('./a2ImportRows'),import('./a2HistoricalCatalog'),import('./a2ImportStorageFixture')]);
  const dataset=buildA2ImportRows('2026-10-30',100000,{historicalCatalog:a2HistoricalCatalog,planId:27002});
  const input=await buildEngineInput(dataset.input.planId,a2ImportStorageFixture(dataset).storage);
  const adapter=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapter.status,'SUPPORTED');
  if(adapter.status!=='SUPPORTED')throw Error('A2 adapter unsupported');
  const source=structuredClone(adapter.problem);setPreference(source,count);
  const resolution=resolveAssistedScope(input,adapter,{kind:'SPACE',spaceId:input.plannerNext!.mainFlow.spaceId});
  const prior=warm?JSON.parse(readFileSync(resolve(destination,'a2-AUTO-result.json'),'utf8')).evidence.futureStructuralWitnesses:[];
  const assisted=buildAssistedProblem(source,resolution.scope,[],analyticalFutureEligibleTaskIds(input,adapter.identityMap),[],[],[],[],prior);
  const before=JSON.stringify(assisted),started=performance.now(),result=executeAssistedPlanning(assisted);
  assert.equal(JSON.stringify(assisted),before);
  const witness=result.evidence.futureStructuralWitnesses?.find(w=>w.kind==='JOINT_COMPLETION');
  assert.ok(witness?.kind==='JOINT_COMPLETION');if(witness?.kind!=='JOINT_COMPLETION')throw Error('No complete A2 witness');
  const validation=validatePlan(adapter.problem,[...witness.tasks],[...witness.preparations],[...witness.spaceMeals],
    [...witness.participantMeals],[],materializeScheduledItinerantUnitMeals(adapter.problem),[...witness.roundPreparations],[...witness.operationalMeals]);
  const achieved=scheduledRuns(witness.tasks);if(!process.argv.includes('--candidate')||count===undefined)assert.equal(achieved,count??2);
  assert.equal(validation.hardValid,true);
  assert.equal(witness.tasks.length+witness.participantMeals.length,266);
  const summary={requested:count??'AUTO',warm,achieved,durationMs:performance.now()-started,completedObligations:266,
    validation,witnessFingerprint:witness.fingerprint,inputFingerprint:sha(JSON.stringify(input)),budgets:assisted.problem.budget,
    work:result.evidence.work,architecture:result.evidence.technicalChainFutureReservation.constructive,reasonCodes:result.evidence.reasonCodes,
    mainFlowSoftPreference:result.evidence.mainFlowSoftPreference};
  writeFileSync(resolve(destination,`a2-${label}-result.json`),JSON.stringify(result,null,2));
  writeFileSync(resolve(destination,`a2-${label}-summary.json`),JSON.stringify(summary,null,2));
  return summary;
}

async function worker(){
  const mode=process.argv[3],destination=resolve(process.argv[4]);mkdirSync(destination,{recursive:true});
  const p=coldFallbackFixture(),mains=p.tasks.filter(t=>t.kind==='main');
  const generator=generateMainFlowPatterns as (...args:any[])=>{patterns:string[][];exhausted:boolean};
  assert.equal(runs(generator(mains,1,2,3,[],4).patterns[0]!),4,'The isolated diagnostic patch must be applied first');
  return mode==='COLD'?coldWorker(destination):a2Worker(mode==='AUTO'?undefined:Number(mode),destination);
}

async function parent(){
  const argument=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
  const destination=resolve(argument??'work/main-flow-soft-blocks');mkdirSync(destination,{recursive:true});
  const checkout=resolve(destination,`checkout-${Date.now()}`);mkdirSync(checkout,{recursive:true});
  const archive=resolve(destination,'source.tar');
  const candidate=process.argv.includes('--candidate');
  const base=candidate?execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim():'20e4b30fbccde3615602fffadcf5f5e9a136c705';
  execFileSync('git',['cat-file','-e',`${base}^{commit}`],{cwd:root});
  execFileSync('git',['archive','--format=tar',`--output=${archive}`,base],{cwd:root});
  execFileSync('tar',['-xf',archive,'-C',checkout]);
  if(candidate)for(const file of execFileSync('git',['ls-files','--cached','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)){
    mkdirSync(dirname(resolve(checkout,file)),{recursive:true});copyFileSync(resolve(root,file),resolve(checkout,file));
  }
  copyFileSync(self,resolve(checkout,'script/demo/mainFlowSoftBlockDiagnostic.ts'));
  symlinkSync(resolve(root,'node_modules'),resolve(checkout,'node_modules'),'dir');
  const patch=resolve(root,'docs/evidence/MAIN-FLOW-SOFT-BLOCKS-search-experiment.patch');
  execFileSync('git',['init','--quiet',checkout]);
  if(!candidate){execFileSync('git',['apply','--check',patch],{cwd:checkout});execFileSync('git',['apply',patch],{cwd:checkout});}
  const files=['engine/planner-next/contracts.ts','engine/planner-next/mainFlowPatterns.ts',
    'engine/planner-next/anonymousPipelineWitness.ts','engine/planner-next/exactMainAndFeederCore.ts','engine/planner-next/exactItinerantPlan.ts','engine/planner-next/assistedPlanning.ts',
    'engine/planner-next/searchPolicy.ts','engine/planner-next/validate.ts','engine/planner-next/executePlannerNext.ts'];
  const sourceHashes=Object.fromEntries(files.map(file=>[file,{base:sha(readFileSync(resolve(root,file))),experiment:sha(readFileSync(resolve(checkout,file)))}]));
  const a2Modes=candidate?['AUTO','3','4','WARM3','WARM4']:['AUTO','3','4'];
  const modes=process.argv.includes('--cold-only')?['COLD']:process.argv.includes('--a2-only')?a2Modes:['COLD',...a2Modes];
  const report={contractVersion:1,productWrites:0,remoteWrites:0,codeBase:base,executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    nodeVersion:process.version,v8Version:process.versions.v8,patchSha256:candidate?null:sha(readFileSync(patch)),sourceHashes,modes,candidate};
  writeFileSync(resolve(destination,'manifest.json'),JSON.stringify(report,null,2));
  for(const mode of modes){
    const result=spawnSync(process.execPath,['--import','tsx',resolve(checkout,'script/demo/mainFlowSoftBlockDiagnostic.ts'),'--worker',mode.startsWith('WARM')?mode.slice(4):mode,destination,
      ...(mode.startsWith('WARM')?['--warm']:[]),...(candidate?['--candidate']:[])],
      {cwd:checkout,encoding:'utf8',timeout:305_000,maxBuffer:1024*1024});
    writeFileSync(resolve(destination,`${mode}.log`),(result.stdout??'')+(result.stderr??''));
    assert.equal(result.status,0,`${mode}: ${result.error?.message??result.stderr}`);
    console.log(result.stdout.trim());
  }
  for(const file of files)assert.equal(sha(readFileSync(resolve(root,file))),sourceHashes[file]!.base,'Product checkout changed');
  return {status:'DIAGNOSTIC_COMPLETE',evidence:destination,productWrites:0,remoteWrites:0};
}

if(process.argv[1]&&resolve(process.argv[1])===self)console.log(JSON.stringify(await (process.argv[2]==='--worker'?worker():parent()),null,2));
