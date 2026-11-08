/** Condition alternative geometries/matchings offline; no source contract or budget changes. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createExactSearchLedger} from '../../../engine/planner-next/exactMainAndFeederCore';
import {runExactItinerantPlanSearch} from '../../../engine/planner-next/exactItinerantPlan';
import {materializeNominalPipelineWitness,materializePipelineBundleMatching} from '../../../engine/planner-next/anonymousPipelineWitness';
import {participantGapMinutes} from '../../../engine/planner-next/participantTransition';
import {effectiveCoachTransitionMinutes} from '../../../engine/planner-next/coachRouteTransitions';
import {exactTaskStaticStartDomain} from '../../../engine/planner-next/placement';
import type {PlannerNextProblem,Task} from '../../../engine/planner-next/contracts';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const [projection,trace,out]=process.argv.slice(2);mkdirSync(out,{recursive:true});
const save=(n:string,v:any)=>writeFileSync(`${out}/${n}.json`,JSON.stringify(v,null,2));
const {problem,assisted}=read(projection),observed=read(trace);const p:PlannerNextProblem=problem;
const candidate=observed.forwardPrune.first.candidate;
const mains=candidate.tasks.filter((t:any)=>t.kind==='main').sort((a:any,b:any)=>a.start-b.start);
const pattern=mains.map((t:any)=>t.blockKey),duration=mains[0].duration;
const last=mains.at(-1),exit:Task=observed.forwardPrune.first.task;
const departure=p.tasks.find(t=>p.transportPolicy!.departure.taskIds.includes(t.id)&&t.participantId===last.participantId)!;
const availabilityEnd=Math.max(...p.participants.find(x=>x.id===last.participantId)!.availability.map(w=>w.end));
const terminalEnd=availabilityEnd-departure.duration-participantGapMinutes(p,exit,departure)-exit.duration-participantGapMinutes(p,last,exit);
const firstRun=mains.filter((m:any)=>m.coachId===mains[0].coachId);
const feeders:Task[]=firstRun.map((main:any)=>p.tasks.find(t=>t.kind==='vocal'&&t.participantId===main.participantId)!);
const earliestFeeders=feeders.map(feeder=>{
 const arrival=p.tasks.find(t=>p.transportPolicy!.arrival.taskIds.includes(t.id)&&t.participantId===feeder.participantId)!;
 const earliest=exactTaskStaticStartDomain(p,arrival).intervals[0]!.start;
 return earliest+arrival.duration+participantGapMinutes(p,arrival,feeder);
});
const feedableEnd=Math.min(...earliestFeeders)+feeders.reduce((s,t)=>s+t.duration,0)
 +effectiveCoachTransitionMinutes(p,mains[0].coachId,feeders[0].spaceId,mains[0].spaceId)+mains.length*duration;
save('derivation',{terminalEnd,feedableEnd,earliestFeeders,pattern,originalSlots:mains.map((t:any)=>t.start),configurationChanged:false});
const summary=[];
for(const [name,end] of [['minimal-terminal-shift',terminalEnd],['feedable-boundary',feedableEnd]] as const){
 const architecture={pattern,slots:pattern.map((_:unknown,i:number)=>end-pattern.length*duration+i*duration)};
 const nominal=materializeNominalPipelineWitness(p,architecture);save(name+'-nominal',nominal);
 for(const matchingMode of ['geometry-control','bundle','alternate-bundle']){
  const bundle=matchingMode!=='geometry-control',ledger=createExactSearchLedger(p.budget.maxBranchExpansions);
  const forbidden=new Set<string>();
  if(matchingMode==='alternate-bundle'){
   const prior=materializePipelineBundleMatching(p,architecture,[],new Set(),undefined,()=>ledger.consume('CORE'));
   if(prior){const edge=[...prior.matching].sort(([a],[b])=>a.localeCompare(b))[0]!;forbidden.add(edge[0]+'@'+edge[1]);}
  }
  const match=bundle?materializePipelineBundleMatching(p,architecture,[],forbidden,undefined,()=>ledger.consume('CORE')):null;
  const preparationBranches=ledger.branchesExplored;
  if(bundle&&!match){summary.push({name,matchingMode,bundle,matching:'ABSENT',nominal:nominal.witness.status,reason:nominal.witness.reason});continue;}
  const result=runExactItinerantPlanSearch(p,{ledger,causalDiagnostic:true,nominalTaskIds:assisted.scope.resolvedTaskIds,fixedPlacements:[],fixedPlacementsAsContext:true,preferredArchitecture:architecture,...(match?{preferredBundleCandidate:match}:{})});
  const key=name+'-'+matchingMode;save(key,{architecture,preparationBranches,forbidden:[...forbidden],match:match?{matching:[...match.matching],scheduledTasks:match.scheduledTasks}:null,result});
  summary.push({name,matchingMode,bundle,preparationBranches,firstExactArchitecture:result.evidence.firstExactArchitecture,status:result.status,complete:result.complete,branches:result.evidence.branchesExplored,coreLeaves:result.evidence.coreCompleteLeafCount,firstPrune:result.evidence.firstPrerequisiteReservationPrune,firstForwardBlocker:result.evidence.lastStandaloneForwardBlockingTaskId,firstDeadEnd:result.evidence.firstStandaloneDeadEndCause});
 }
}
save('summary',summary);console.log(JSON.stringify(summary));
