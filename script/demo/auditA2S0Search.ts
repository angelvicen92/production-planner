/** Offline S0 comparison/replay. Only --capture may use the network, with a
 * GET/HEAD-only REST guard; private inputs are never published as Evidence. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import type {EngineInput} from '../../engine/types';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildAssistedProblem,executeAssistedPlanning,type AssistedPlanningResult} from '../../engine/planner-next/assistedPlanning';
import {analyticalFutureEligibleTaskIds,resolveAssistedScope} from '../../server/assistedScopeResolver';
import {recommendNextAssistedScope} from '../../server/assistedScopeOrchestrator';
import {buildAssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../server/effectivePlanConfigRevision';
import {buildCanonicalFullA2EngineInput} from '../../engine/planner-next/benchmarks/canonicalFullA2EngineInput';
import {createExactSearchLedger,ExactSearchTimeLimitReached} from '../../engine/planner-next/exactMainAndFeederCore';
import {runExactItinerantPlanSearch} from '../../engine/planner-next/exactItinerantPlan';
import {createResidualObligationMainOrderer} from '../../engine/planner-next/residualObligationAlignment';
import {buildA2ImportRows} from './a2ImportRows';
import {a2HistoricalCatalog} from './a2HistoricalCatalog';
import {a2ImportStorageFixture} from './a2ImportStorageFixture';
import {a2RealSpatialManifest} from './a2SpatialTopology';

// Sort object keys, never decision-bearing arrays. Undefined is absent in JSON.
export function stableDiagnosticValue(value:unknown):unknown {
  if(Array.isArray(value))return value.map(stableDiagnosticValue);
  if(value instanceof Set)return [...value].sort().map(stableDiagnosticValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
    .filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b,'en'))
    .map(([k,v])=>[k,stableDiagnosticValue(v)]));
  return value;
}
export const diagnosticHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(stableDiagnosticValue(value))??'undefined').digest('hex');

export function projectS0(input:EngineInput){
  assert.equal(input.locks.length,0,'S0 audit does not discard locks');
  assert.ok(input.tasks.every(t=>!t.startPlanned&&!t.endPlanned&&t.status==='pending'),'Expected an unplaced pending S0');
  const adapter=adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapter.status,'SUPPORTED');
  if(adapter.status!=='SUPPORTED')throw Error('UNSUPPORTED_INPUT');
  const snapshot=buildAssistedPlanningSnapshotV1(input.tasks.map(t=>({id:t.id,startPlanned:null,endPlanned:null,spaceId:t.spaceId??null,zoneId:t.zoneId??null})));
  const recommendation=recommendNextAssistedScope(input,snapshot);
  assert.ok(recommendation);
  const resolution=resolveAssistedScope(input,adapter,recommendation.selector);
  const futureEligible=analyticalFutureEligibleTaskIds(input,adapter.identityMap);
  const assisted=buildAssistedProblem(adapter.problem,resolution.scope,[],futureEligible);
  return {adapter,recommendation,resolution,futureEligible,assisted};
}

/** Whitelist: no source labels, names, raw rows, URL, credential or exception. */
export function compareS0Inputs(real:EngineInput,native:EngineInput){
  const a=projectS0(real),b=projectS0(native);
  const fields=[...new Set([...Object.keys(real),...Object.keys(native)])].sort();
  const sections=Object.keys(a.adapter.problem).sort().map(key=>({key,
    equal:isDeepStrictEqual(stableDiagnosticValue((a.adapter.problem as any)[key]),stableDiagnosticValue((b.adapter.problem as any)[key])),
    realHash:diagnosticHash((a.adapter.problem as any)[key]),nativeHash:diagnosticHash((b.adapter.problem as any)[key])}));
  return {sourceObligations:[real.tasks.length,native.tasks.length],
    inputHashes:[diagnosticHash(real),diagnosticHash(native)],
    differingInputFields:fields.filter(key=>!isDeepStrictEqual(stableDiagnosticValue((real as any)[key]),stableDiagnosticValue((native as any)[key]))),
    problemHashes:[diagnosticHash(a.adapter.problem),diagnosticHash(b.adapter.problem)],
    adapterProblemFingerprints:[a.adapter.problemFingerprint,b.adapter.problemFingerprint],
    identityMapEqual:isDeepStrictEqual(a.adapter.identityMap,b.adapter.identityMap),sections,
    problemEqual:sections.every(row=>row.equal),
    recommendationEqual:isDeepStrictEqual(a.recommendation,b.recommendation),
    futureEligibleEqual:isDeepStrictEqual([...a.futureEligible].sort(),[...b.futureEligible].sort()),
    assistedEqual:isDeepStrictEqual(stableDiagnosticValue(a.assisted),stableDiagnosticValue(b.assisted)),
    assistedHashes:[diagnosticHash(a.assisted),diagnosticHash(b.assisted)],
    scope:{selector:a.recommendation.selector,count:a.resolution.productTaskIds.length,priority:a.recommendation.priority},
    projection:{executableTasks:a.assisted.problem.tasks.length,supporting:a.assisted.supportingTaskIds.length,
      protected:a.assisted.protectedPlacements.length,analyticalMeals:a.assisted.analyticalParticipantMeals.length,
      futureCollectiveTasks:a.assisted.problem.analyticalFutureCollectiveContinuation?.tasks.length??0},
  };
}

/** Benchmark identity translation only; never a claim that equal task counts
 * make two search inputs equivalent. Preserve catalog/order differences. */
export function compareCanonicalA2(native:EngineInput){
  const canonical=buildCanonicalFullA2EngineInput({branchBudget:100000});
  const a=projectS0(canonical.input).adapter.problem,b=projectS0(native).adapter.problem;
  const spaces=new Map(a2RealSpatialManifest.map(row=>[`space:${row.sourceNumericSpaceId}`,
    row.historicalSpaceId==null?null:`space:${row.historicalSpaceId+(row.decision==='REUSE_EXISTING'?0:100000)}`]));
  const remap=(value:any):any=>{
    if(Array.isArray(value))return value.map(remap);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)]));
    if(typeof value!=='string')return value;
    if(spaces.has(value))return spaces.get(value);
    if(value.startsWith('setup-family:'))return value.replace(/^setup-family:(\d+):/,(_,id)=>`setup-family:${spaces.get(`space:${id}`)?.slice(6)}:`);
    return value.replace(/^(task|participant|participant-meal|plan-resource|itinerant-team):(\d+)$/,(_,ns,id)=>`${ns}:${Number(id)+100000}`);
  };
  const mapped=remap(a);
  const facts=(p:typeof a)=>({productiveTasks:p.tasks.length,participantMeals:p.participantMeals?.length,
    participants:p.participants.length,resources:p.resources.length,spaces:p.spaces.length,itinerantUnits:p.itinerantUnits?.length,
    day:p.day,main:p.mainFlow,transport:p.transportPolicy?.arrival,
    operationalMeals:p.operationalMealPolicies?.map(meal=>({id:meal.id,duration:meal.duration,window:meal.window})),
    roundLaneSizes:p.roundSynchronizations?.[0]?.lanes.map(lane=>lane.taskIds.length)});
  return {mapping:'a2RealSpatialManifest v2 + benchmark namespace offset 100000',
    problemHash:diagnosticHash(a),facts:facts(a),nativeFacts:facts(b),
    mappedSectionsEqual:Object.fromEntries(['resources','participants','coaches','itinerantUnits','tasks','mainFlow',
      'coachRouteTransitions','technicalChains','anchoredAccompaniments','transportPolicy','participantMeals']
      .map(key=>[key,isDeepStrictEqual(mapped[key],(b as any)[key])])),
    exactSearchInputEqual:isDeepStrictEqual(a,b)};
}

function semanticResult(value:unknown):unknown {
  if(Array.isArray(value))return value.map(semanticResult);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!key.endsWith('Ms')).map(([key,item])=>[key,semanticResult(item)]));
  return value;
}

export function summarizeSearch(result:AssistedPlanningResult){
  const e=result.evidence,s=e.standaloneDiagnostic;
  const witnesses=e.futureStructuralWitnesses??[];
  return {semanticResultHash:diagnosticHash(semanticResult(result)),proposalCount:result.proposal?.length??0,
    reasonCodes:e.reasonCodes,completeForScope:e.completeForScope,hardValid:e.hardValid,requiredValid:e.requiredValid,
    protectedPlacementsPreserved:e.protectedPlacementsPreserved,fingerprint:e.fingerprint,work:e.work,
    bundleMatching:e.bundleMatching,causalDiagnostic:e.causalDiagnostic,
    supporting:{ephemeral:e.ephemeralSupportingPlacements?.length??0,accepted:e.acceptedSupportingPlacements?.length??0},
    witnesses:witnesses.map(w=>({kind:w.kind,fingerprint:w.fingerprint,
      ...(w.kind==='JOINT_COMPLETION'?{productive:w.tasks.length,participantMeals:w.participantMeals.length}:{} )})),
    standalone:s?{branchesByDepth:s.standaloneBranchesByDepth,maximumDepth:s.standaloneMaximumDepth,
      completeLeafCount:s.standaloneCompleteLeafCount,firstHardValidCoreLeaf:s.firstHardValidCoreLeaf,
      firstDeadEnd:s.firstStandaloneDeadEndCause,firstDominantBlocker:s.standaloneFirstDominantBlocker,
      terminalRejections:s.terminalCompletionRejectionsByCause,firstTerminalRejection:s.firstTerminalCompletionRejection,
      macroSelectionOrder:s.macroSelectionOrder,macroDomainSizes:s.macroDomainSizes,
      macroCandidateCausalTraces:s.macroCandidateCausalTraces,
      preferredResourceUnit:s.preferredResourceUnit,setupInvocations:s.setupBlockSearchInvocations,
      closureChecks:s.futureCollectiveClosureChecks,closureBranches:s.futureCollectiveClosureBranchesConsumed,
      closureFirstPrune:s.futureCollectiveClosureFirstPrune,closureAbstentions:s.futureCollectiveClosureAbstentions}:null};
}

/** Diagnostic reproduction of the AUTO S0 call in constructConfiguredExactItinerantPlan.
 * Preconditions prevent silently using it for a different execution route.
 * Its checkpoint observes the existing ledger; it does not change its limit. */
export function replayChargedPrefix(input:EngineInput){
  const built=projectS0(input),assisted=built.assisted;
  assert.equal(assisted.collectiveCoreProjection,undefined);
  assert.equal(assisted.problem.mainFlow!.preferredBlockCount,undefined);
  assert.ok(assisted.problem.analyticalFutureCollectiveContinuation);
  const problem={...assisted.problem,budget:{...assisted.problem.budget,
    maxBranchExpansions:Math.min(100000,assisted.problem.budget.maxBranchExpansions)},
    participantMeals:[...(assisted.problem.participantMeals??[]),...assisted.analyticalParticipantMeals]};
  const coreIds=new Set(problem.tasks.filter(t=>t.kind==='main'||t.kind==='vocal').map(t=>t.id));
  for(const a of problem.anchoredAccompaniments??[])for(const id of [a.anchorTaskId,...a.beforeTaskIds,...a.afterTaskIds])coreIds.add(id);
  const standalone=problem.tasks.filter(t=>!coreIds.has(t.id));
  const orderer=createResidualObligationMainOrderer(problem,standalone);
  const started=performance.now(),cpuStarted=process.cpuUsage();
  const samples:{branches:number;core:number;standalone:number;elapsedMs:number}[]=[];
  let nextSample=0;
  const ledger=createExactSearchLedger(problem.budget.maxBranchExpansions,()=>{
    const elapsedMs=performance.now()-started;
    if(ledger.branchesExplored>=nextSample){samples.push({branches:ledger.branchesExplored,core:ledger.coreBranches,
      standalone:ledger.standaloneBranches,elapsedMs});nextSample+=5000;}
    if(ledger.branchesExplored>=38640||elapsedMs>=300000)throw new ExactSearchTimeLimitReached();
  });
  const result=runExactItinerantPlanSearch(problem,{ledger,causalDiagnostic:true,coreOrderer:orderer.options,
    standaloneCompletionSelection:'FIRST_HARD_VALID',fixedPlacements:[],fixedPlacementsAsContext:true,
    fixedSetupPreparations:[],fixedRoundPreparations:[],priorFutureStructuralWitnesses:[]});
  const e=result.evidence;
  return {mode:'CONTROLLED_CHARGED_PREFIX',syntheticStop:true,
    interpretation:'Diagnostic AUTO S0 composition, stopped at historical charged count; not the historical trace or a real 300s measurement.',
    semanticResultHash:diagnosticHash(semanticResult(result)),status:result.status,complete:result.complete,
    branches:e.branchesExplored,core:e.coreBranches,standalone:e.standaloneBranches,
    matchesHistoricalPhaseTotals:e.branchesExplored===38640&&e.coreBranches===6782&&e.standaloneBranches===31858,
    elapsedMs:performance.now()-started,cpuMicroseconds:process.cpuUsage(cpuStarted),samples,
    causalDiagnostic:e.causalDiagnostic,architecture:{enumerated:e.architecturesEnumerated,prepared:e.architecturesPrepared,
      hardGateRejects:e.hardGateRejectsByArchitecture,fullyVisited:e.structuralArchitecturesFullyVisited},
    firstHardValidCoreLeaf:e.firstHardValidCoreLeaf,firstDeadEnd:e.firstStandaloneDeadEndCause,
    terminalRejections:e.terminalCompletionRejectionsByCause,
    closure:{checks:e.futureCollectiveClosureChecks,firstPrune:e.futureCollectiveClosureFirstPrune,
      branches:e.futureCollectiveClosureBranchesConsumed,abstentions:e.futureCollectiveClosureAbstentions},
    standaloneByDepth:e.standaloneBranchesByDepth,macroCandidateCausalTraces:e.macroCandidateCausalTraces};
}

export async function captureS0(planId:number,directory:string){
  const origin=new URL(process.env.SUPABASE_URL!).origin,nativeFetch=globalThis.fetch;
  const reads:{url:string;method:string;status:number;body:string}[]=[];
  mkdirSync(directory,{recursive:true,mode:0o700});
  globalThis.fetch=async(resource,options)=>{
    const request=resource instanceof Request?resource:undefined;
    const url=new URL(request?.url??String(resource)),method=(options?.method??request?.method??'GET').toUpperCase();
    if(url.origin!==origin||!url.pathname.startsWith('/rest/v1/')||url.pathname.includes('/rpc/')||!['GET','HEAD'].includes(method))throw Error('READ_ONLY_CAPTURE_GUARD');
    const response=await nativeFetch(resource,options);
    reads.push({url:url.href,method,status:response.status,body:await response.clone().text()});return response;
  };
  try{
    const {storage}=await import('../../server/storage');
    const input=await buildEngineInput(planId,storage);
    const session=await storage.getActiveAssistedPlanningSession(planId);assert.ok(session);
    const stages=await storage.listAssistedPlanningStages(session.id);
    const stage=stages.find(s=>s.id===session.activeStageId);assert.equal(stage?.ordinal,0);
    assert.equal(session.draftBaseStageId,stage?.id);
    const snapshot=session.draftSnapshotJson as any;
    assert.ok(snapshot.tasks.every((t:any)=>t.startPlanned==null&&t.endPlanned==null));projectS0(input);
    const [optimizerSnapshot,taskTemplateSnapshots,persistedRevision]=await Promise.all([
      storage.getPlanOptimizerSnapshot(planId),storage.getPlanTaskTemplateSnapshots(planId),
      storage.getPlanConfigRevision(session.currentConfigRevisionId),
    ]);
    const provenance=(authority:string)=>({authority,authorityContractVersion:1});
    const actual=buildEffectivePlanConfigRevisionV1({planId,optimizerSnapshot,taskTemplateSnapshots,
      optimizerProvenance:provenance('plan_optimizer_snapshots'),taskTemplateProvenance:provenance('plan_task_template_snapshots'),
      authorities:projectEffectiveAuthoritiesFromEngineInputV1(input)});
    assert.equal(persistedRevision?.planId,planId);
    assert.equal(persistedRevision?.fingerprint,actual.configurationFingerprint);
    writeFileSync(resolve(directory,'input-private.json'),JSON.stringify(input),{mode:0o600});
    writeFileSync(resolve(directory,'state-private.json'),JSON.stringify({session,stages}),{mode:0o600});
    const manifest={mode:'REST_GET_HEAD_ONLY',planId,stageOrdinal:0,obligations:input.tasks.length,
      observedAt:new Date().toISOString(),inputHash:diagnosticHash(input),remoteWrites:0,
      persistedRevisionMatches:true,configurationFingerprint:actual.configurationFingerprint,
      requests:reads.map(r=>({method:r.method,table:new URL(r.url).pathname.split('/').at(-1),status:r.status}))};
    writeFileSync(resolve(directory,'capture-manifest.json'),JSON.stringify(manifest,null,2));return manifest;
  }finally{globalThis.fetch=nativeFetch;writeFileSync(resolve(directory,'reads-private.json'),JSON.stringify(reads),{mode:0o600});}
}

async function main(){
  const args=process.argv.slice(2);
  if(args[0]==='--capture'){
    assert.equal(args.length,3,'--capture PLAN_ID PRIVATE_DIRECTORY');
    console.log(JSON.stringify(await captureS0(Number(args[1]),resolve(args[2]!)),null,2));return;
  }
  assert.ok(args.length>=2,'INPUT_PRIVATE_JSON OUTPUT_DIRECTORY [real|native|prefix-real|prefix-native]');
  // Offline invocation fails closed even if a dependency unexpectedly tries IO.
  globalThis.fetch=async()=>{throw Error('OFFLINE_AUDIT_NETWORK_FORBIDDEN');};
  const input=JSON.parse(readFileSync(resolve(args[0]!),'utf8')) as EngineInput,directory=resolve(args[1]!);
  mkdirSync(directory,{recursive:true});
  const dataset=buildA2ImportRows('2026-10-31',100000,{historicalCatalog:a2HistoricalCatalog,planId:input.planId});
  const native=await buildEngineInput(input.planId,a2ImportStorageFixture(dataset).storage);
  const comparison=compareS0Inputs(input,native);
  let capture:unknown;
  try{capture=JSON.parse(readFileSync(resolve(dirname(resolve(args[0]!)),'capture-manifest.json'),'utf8'));}catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
  }
  writeFileSync(resolve(directory,'inputs.json'),JSON.stringify({...comparison,capture,canonical:compareCanonicalA2(native)},null,2));
  const mode=args[2];if(!mode)return;
  assert.ok(['real','native','prefix-real','prefix-native'].includes(mode));
  if(mode.startsWith('prefix-')){
    const report=replayChargedPrefix(mode.endsWith('native')?native:input);
    writeFileSync(resolve(directory,`${mode}.json`),JSON.stringify(report,null,2));
    console.log(JSON.stringify({mode,branches:report.branches,core:report.core,standalone:report.standalone}));return;
  }
  const built=projectS0(mode.endsWith('native')?native:input),before=diagnosticHash(built.assisted);
  const start=performance.now();
  const result=executeAssistedPlanning(built.assisted);
  const elapsedMs=performance.now()-start;assert.equal(diagnosticHash(built.assisted),before);
  const report={mode,node:process.version,v8:process.versions.v8,elapsedMs,
    inputImmutable:true,...summarizeSearch(result)};
  writeFileSync(resolve(directory,`${mode}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify({mode,elapsedMs,proposalCount:report.proposalCount,branches:report.work.branchesExplored}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
