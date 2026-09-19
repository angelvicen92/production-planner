import { createHash } from "node:crypto";
import type { ParticipantMealObligation, ParticipantTask, PlannerNextProblem, ScheduledTask, Task, Window } from "./contracts";
import { generateMainFlowPatterns, proveMainFeederArchitectureImpossible, type MainFeederArchitecture } from "./mainFlowPatterns";
import { buildTimeline, candidateCuts, hasMainFlowMeal, orderTimelines } from "./mainFlowMeal";
import { effectiveCoachTransitionMinutes } from "./coachRouteTransitions";
import { assessCoreArrivalTransportFeasibility } from "./transportGrouping";
import { anchoredAccompanimentIndex, materializeAnchoredOperation, type AnchoredOperation } from "./anchoredAccompaniment";
import { exactTaskStartDomain } from "./placement";
import { deriveFeederCohortRelaxedCertificate, exactFeederOrdinalPerfectMatching } from "./exactMainAndFeederCore";
import { assessOperationalMealFutureFeasibility } from "./operationalMeals";
import { probeParticipantMealFutureFeasibility } from "./participantMeals";
import { createMainFlowMeal, mainFlowMealPolicy } from "./mainFlowMeal";

export type AnonymousPipelineWitnessStatus = "FEASIBLE" | "INFEASIBLE" | "INCONCLUSIVE";
export interface AnonymousPipelineSpot { id:string; start:number; end:number; profileKey?:string; tokenId?:string; coachKey?:string; feederRunId?:string; mainRunId?:string }
export interface AnonymousAnchoredOperationSpot extends AnonymousPipelineSpot { operationId:string }
export interface AnonymousPipelineWitness {
  status: AnonymousPipelineWitnessStatus;
  reason?: string;
  runCount: number;
  pattern: readonly string[];
  mainSpots: readonly AnonymousPipelineSpot[];
  feederSpots: readonly AnonymousPipelineSpot[];
  stylingSpots: readonly AnonymousPipelineSpot[];
  inGroups: readonly (AnonymousPipelineSpot & { size:number })[];
  anchoredOperationSpots: readonly AnonymousAnchoredOperationSpot[];
  assignments: readonly { tokenId:string; profileKey:string; mainSpotId:string; feederSpotId:string; stylingSpotId:string; inGroupId:string; mainRunId:string; feederRunId:string; anchoredOperationSpotId?:string }[];
  profileCount: number;
  tokenCount: number;
  fingerprint: string;
}
export interface AnonymousPipelineWitnessDiagnostic {
  mainMatchingCompleted: boolean;
  anchorsCompleted: boolean;
  feederGeometryCompleted: boolean;
  stylingGeometryCompleted: boolean;
  arrivalSolverExecuted: boolean;
  arrivalClassification: string | null;
  arrivalContiguousStatesExplored: number;
  arrivalMembershipFallbackEntered: boolean;
  mainRuns: readonly { id:string; coach:string; firstMain:{id:string;start:number;end:number};
    lastMain:{id:string;start:number;end:number}; positions:readonly number[] }[];
  feederRuns: readonly { id:string; coach:string; deadline:number; blockStart?:number; blockEnd?:number; size:number;
    matching?:readonly {tokenId:string;ordinal:number}[]; exactDomainIntervalCount:number;
    candidateStartBoundaryCount:number; blockStartCandidatesEvaluated:number; perfectMatchingChecks:number }[];
  stylingCandidateStartBoundaryCount: number;
  anchoredOperationIntervals: readonly { id:string; start:number; end:number }[];
  operationalMealPoliciesChecked: number;
  operationalMealFutureFeasible: boolean | null;
  operationalMealBlockingPolicyIds: readonly string[];
  operationalMealBranchesExplored: number;
  participantMealsChecked: number;
  participantMealFutureFeasible: boolean | null;
  participantMealBlockingTaskIds: readonly string[];
  participantMealAnalyticDomainBuilds: number;
}

type Layer = { main:ParticipantTask; feeder:ParticipantTask; styling:ParticipantTask; arrival:ParticipantTask; profileKey:string; tokenId:string };
const orderedWindows = (windows: readonly Window[] | undefined, fallback:Window): Window[] =>
  [...(windows?.length ? windows : [fallback])].sort((a,b)=>a.start-b.start||a.end-b.end);
const stable = (value:unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const signatureWindows = (windows: readonly Window[] | undefined) => orderedWindows(windows, {start:-1,end:-1});

/**
 * Builds a participant-free, concrete witness for IN -> {entry styling, vocal} -> Main.
 * Nominal ids are used only to read the source dependency graph, then discarded before
 * profiles, tokens, matching and the returned certificate are built.
 */
function buildPipelineWitness(problem: Readonly<PlannerNextProblem>, architecture:MainFeederArchitecture,
  onDiagnostic?: (diagnostic:AnonymousPipelineWitnessDiagnostic)=>void,
  analyticalParticipantMeals:readonly ParticipantMealObligation[]=[],
  onNominalSchedule?: (scheduled:readonly ScheduledTask[])=>void): AnonymousPipelineWitness {
  let mainMatchingCompleted=false,anchorsCompleted=false,feederGeometryCompleted=false,stylingGeometryCompleted=false;
  let arrivalSolverExecuted=false,arrivalClassification:string|null=null,arrivalContiguousStatesExplored=0;
  let arrivalMembershipFallbackEntered=false,stylingCandidateStartBoundaryCount=0;
  let operationalMealPoliciesChecked=0,operationalMealFutureFeasible:boolean|null=null,operationalMealBranchesExplored=0;
  let operationalMealBlockingPolicyIds:string[]=[];
  let participantMealsChecked=0,participantMealFutureFeasible:boolean|null=null,participantMealAnalyticDomainBuilds=0;
  let participantMealBlockingTaskIds:string[]=[];
  const diagnosticMainRuns: Array<{id:string;coach:string;firstMain:{id:string;start:number;end:number};
    lastMain:{id:string;start:number;end:number};positions:number[]}>=[];
  const diagnosticFeederRuns: Array<{id:string;coach:string;deadline:number;blockStart?:number;blockEnd?:number;size:number;
    matching?:readonly {tokenId:string;ordinal:number}[];exactDomainIntervalCount:number;
    candidateStartBoundaryCount:number;blockStartCandidatesEvaluated:number;perfectMatchingChecks:number}>=[];
  const diagnosticAnchors: Array<{id:string;start:number;end:number}>=[];
  const emitDiagnostic=()=>onDiagnostic?.({mainMatchingCompleted,anchorsCompleted,feederGeometryCompleted,
    stylingGeometryCompleted,arrivalSolverExecuted,arrivalClassification,arrivalContiguousStatesExplored,
    arrivalMembershipFallbackEntered,mainRuns:diagnosticMainRuns,feederRuns:diagnosticFeederRuns,
    stylingCandidateStartBoundaryCount,anchoredOperationIntervals:diagnosticAnchors,
    operationalMealPoliciesChecked,operationalMealFutureFeasible,operationalMealBlockingPolicyIds,
    operationalMealBranchesExplored,participantMealsChecked,participantMealFutureFeasible,
    participantMealBlockingTaskIds,participantMealAnalyticDomainBuilds});
  const empty = (status:AnonymousPipelineWitnessStatus, reason:string):AnonymousPipelineWitness => ({ status, reason,
    runCount: architecture.pattern.reduce((n,k,i)=>n+(i===0||architecture.pattern[i-1]!==k?1:0),0),
    pattern:[...architecture.pattern], mainSpots:[], feederSpots:[], stylingSpots:[], inGroups:[], anchoredOperationSpots:[], assignments:[],
    profileCount:0, tokenCount:0, fingerprint:stable({status,reason,pattern:architecture.pattern,slots:architecture.slots}) });
  const rejected=(status:AnonymousPipelineWitnessStatus,reason:string):AnonymousPipelineWitness=>{
    const result=empty(status,reason);emitDiagnostic();return result;
  };
  const mains = problem.tasks.filter(t=>t.kind==="main");
  if (mains.length !== architecture.slots.length || architecture.pattern.length !== architecture.slots.length)
    return rejected("INFEASIBLE", "MAIN_ARCHITECTURE_CARDINALITY");
  const arrivalIds=new Set(problem.transportPolicy?.arrival.taskIds??[]);
  if (!problem.transportPolicy?.arrival) return rejected("INCONCLUSIVE", "ARRIVAL_POLICY_ABSENT");
  const raw:Array<Omit<Layer,"profileKey"|"tokenId">>=[];
  for(const main of mains){
    const participant=main.participantId;
    const feeder=problem.tasks.find(t=>t.kind==="vocal"&&t.participantId===participant&&main.dependencies.includes(t.id));
    const arrival=problem.tasks.find(t=>t.participantId===participant&&arrivalIds.has(t.id));
    const styling=problem.tasks.find(t=>t.participantId===participant&&t.kind==="auxiliary"
      && t.dependencies.some(id=>id===arrival?.id)&&main.dependencies.includes(t.id));
    if(!feeder||!arrival||!styling)return rejected("INCONCLUSIVE","UNSUPPORTED_PIPELINE_SHAPE");
    if(main.kind==="technical"||feeder.kind==="technical"||arrival.kind==="technical"||styling.kind==="technical")
      return rejected("INCONCLUSIVE","UNSUPPORTED_TECHNICAL_PIPELINE_SHAPE");
    raw.push({main,feeder,arrival,styling});
  }
  const resources=(t:Task)=>(t.requiredResourceIds??[]).slice().sort().map(id=>{
    const r=problem.resources.find(x=>x.id===id); return {availability:signatureWindows(r?.availability),space:r?.assignedSpaceId??null};
  });
  const anchorIndex=anchoredAccompanimentIndex(problem);
  const taskById=new Map(problem.tasks.map(task=>[task.id,task]));
  const material=(x:Omit<Layer,"profileKey"|"tokenId">)=>{const anchor=anchorIndex.get(x.main.id);return ({ blockKey:x.main.blockKey??"", coachKey:x.main.coachId??"",
    durations:[x.arrival.duration,x.styling.duration,x.feeder.duration,x.main.duration],
    spaces:[x.arrival.spaceId,x.styling.spaceId,x.feeder.spaceId,x.main.spaceId],
    availability:[x.arrival,x.styling,x.feeder,x.main].map(t=>signatureWindows(t.availability)),
    participantAvailability:signatureWindows(problem.participants.find(p=>p.id===x.main.participantId)?.availability),
    resources:[x.arrival,x.styling,x.feeder,x.main].map(resources),
    anchoredOperation:anchor?{before:anchor.beforeTaskIds.map(id=>taskById.get(id)).map(t=>t&&({duration:t.duration,spaceId:t.spaceId,availability:signatureWindows(t.availability),resources:resources(t)})),
      after:anchor.afterTaskIds.map(id=>taskById.get(id)).map(t=>t&&({duration:t.duration,spaceId:t.spaceId,availability:signatureWindows(t.availability),resources:resources(t)})),
      itinerantUnit:anchor.itinerantUnitId?{availability:signatureWindows(problem.itinerantUnits?.find(unit=>unit.id===anchor.itinerantUnitId)?.availability),
        meals:(problem.itinerantUnitMeals??[]).filter(meal=>meal.itinerantUnitId===anchor.itinerantUnitId).map(meal=>meal.interval).sort((a,b)=>a.start-b.start||a.end-b.end)}:null}:null });};
  const keyed=raw.map(x=>({x,key:stable(material(x))})).sort((a,b)=>a.key.localeCompare(b.key));
  const ordinal=new Map<string,number>();
  const layers:Layer[]=keyed.map(({x,key})=>{const n=(ordinal.get(key)??0)+1;ordinal.set(key,n);return {...x,profileKey:key,tokenId:`${key.slice(0,12)}:${n}`};});

  const fits=(task:Task,start:number):boolean=>{
    const windows=[task.availability,problem.spaces.find(x=>x.id===task.spaceId)?.availability,
      problem.participants.find(x=>x.id===task.participantId)?.availability,
      task.coachId===undefined?undefined:problem.coaches.find(x=>x.id===task.coachId)?.availability,
      ...(task.requiredResourceIds??[]).map(id=>problem.resources.find(x=>x.id===id)?.availability)];
    return problem.day.start<=start&&start+task.duration<=problem.day.end
      && windows.every(items=>!items?.length||items.some(w=>w.start<=start&&start+task.duration<=w.end));
  };
  // Main ownership is a profile/block matching, never a nominal participant matching.
  const mainOwner=new Map<number,Layer>();
  const operationCandidates=new Map<string,AnchoredOperation|null>();
  const operationAt=(layer:Layer,position:number)=>{const key=`${layer.tokenId}:${position}`;if(!operationCandidates.has(key))operationCandidates.set(key,
    anchorIndex.has(layer.main.id)?materializeAnchoredOperation(problem,layer.main,architecture.slots[position]!,[]):null);return operationCandidates.get(key)!;};
  const candidates=new Map(layers.map(layer=>[layer.tokenId,architecture.pattern.map((_,position)=>position).filter(position=>
    (layer.main.blockKey??"")===architecture.pattern[position]&&fits(layer.main,architecture.slots[position]!)
      &&(!anchorIndex.has(layer.main.id)||Boolean(operationAt(layer,position))))]));
  const mainOrder=[...layers].filter(layer=>anchorIndex.has(layer.main.id)).sort((a,b)=>(candidates.get(a.tokenId)!.length-candidates.get(b.tokenId)!.length)||a.tokenId.localeCompare(b.tokenId));
  const assignMain=(index:number,unitOperations:Map<string,{start:number;end:number}[]>):boolean=>{
    if(index===mainOrder.length){
      const augment=(layer:Layer,seen:Set<number>):boolean=>{for(const position of candidates.get(layer.tokenId)!){if(seen.has(position))continue;seen.add(position);const prior=mainOwner.get(position);if(!prior||(!anchorIndex.has(prior.main.id)&&augment(prior,seen))){mainOwner.set(position,layer);return true;}}return false;};
      const success=layers.filter(layer=>!anchorIndex.has(layer.main.id)).every(layer=>augment(layer,new Set()));
      if(!success)for(const [position,layer] of [...mainOwner])if(!anchorIndex.has(layer.main.id))mainOwner.delete(position);
      return success;
    }
    const layer=mainOrder[index]!;
    for(const position of candidates.get(layer.tokenId)!){
      if(mainOwner.has(position))continue;
      const contract=anchorIndex.get(layer.main.id);const operation=operationAt(layer,position);
      const occupied=contract?.itinerantUnitId?unitOperations.get(contract.itinerantUnitId)??[]:[];
      if(operation&&occupied.some(other=>operation.start<other.end&&other.start<operation.end))continue;
      mainOwner.set(position,layer);
      if(operation&&contract?.itinerantUnitId)unitOperations.set(contract.itinerantUnitId,[...occupied,{start:operation.start,end:operation.end}]);
      if(assignMain(index+1,unitOperations))return true;
      mainOwner.delete(position);if(operation&&contract?.itinerantUnitId)unitOperations.set(contract.itinerantUnitId,occupied);
    }
    return false;
  };
  if(!assignMain(0,new Map()))return rejected("INFEASIBLE","MAIN_PROFILE_MATCHING");
  mainMatchingCompleted=true;
  const assigned: Array<Layer & {position:number}> = [...mainOwner].sort((a,b)=>a[0]-b[0]).map(([position,x])=>({...x,position}));
  const runs:{id:string;startPosition:number;endPosition:number;key:string}[]=[];
  architecture.pattern.forEach((key,position)=>{const prior=runs.at(-1);if(!prior||prior.key!==key)runs.push({id:`main-run:${runs.length}`,startPosition:position,endPosition:position,key});else prior.endPosition=position;});
  const runForPosition=(position:number)=>runs.find(run=>run.startPosition<=position&&position<=run.endPosition)!;
  const mainSpots=assigned.map(x=>({id:`main:${x.position}`,start:architecture.slots[x.position]!,
    end:architecture.slots[x.position]!+x.main.duration,profileKey:x.profileKey,tokenId:x.tokenId,coachKey:x.main.coachId,mainRunId:runForPosition(x.position).id}));

  // Materialize the canonical operation around every fixed Main anchor. Only Main owns
  // the Main space; the operation spot records participant/unit occupation end-to-end.
  const anchoredOperations=new Map<string,AnchoredOperation>();
  for(const x of assigned){
    if(!anchorIndex.has(x.main.id))continue;
    const operation=materializeAnchoredOperation(problem,x.main,architecture.slots[x.position]!,[]);
    if(!operation)return rejected("INFEASIBLE","ANCHORED_OPERATION_GEOMETRY");
    anchoredOperations.set(x.tokenId,operation);
  }
  const operations=[...anchoredOperations.entries()];
  for(let i=0;i<operations.length;i++)for(let j=i+1;j<operations.length;j++){
    const left=operations[i]![1],right=operations[j]![1];
    if(left.contract.itinerantUnitId&&left.contract.itinerantUnitId===right.contract.itinerantUnitId
      && left.start<right.end&&right.start<left.end)return rejected("INFEASIBLE","ANCHORED_ITINERANT_UNIT_EXCLUSIVITY");
  }
  const anchoredOperationSpots:AnonymousAnchoredOperationSpot[]=operations.map(([tokenId,operation])=>{const x=assigned.find(item=>item.tokenId===tokenId)!;return {
    id:`anchored:${tokenId}`,operationId:stable(material(x)).slice(0,16),start:operation.start,end:operation.end,
    profileKey:x.profileKey,tokenId,mainRunId:runForPosition(x.position).id};});
  diagnosticAnchors.push(...anchoredOperationSpots.map(({id,start,end})=>({id,start,end})));
  for(const run of runs){
    const cohort=assigned.filter(x=>run.startPosition<=x.position&&x.position<=run.endPosition).sort((a,b)=>a.position-b.position);
    const first=mainSpots[run.startPosition]!,last=mainSpots[run.endPosition]!;
    diagnosticMainRuns.push({id:run.id,coach:cohort[0]?.main.coachId??"",
      firstMain:{id:first.id,start:first.start,end:first.end},lastMain:{id:last.id,start:last.start,end:last.end},
      positions:cohort.map(x=>x.position)});
  }
  anchorsCompleted=true;

  // Each actual contiguous Main run owns exactly one feeder cohort. A coach may therefore
  // prepare a later cohort between two of their Main runs instead of before their first run.
  const feederSpots:AnonymousPipelineSpot[]=[];
  for(const run of runs){
    const cohort=assigned.filter(x=>run.startPosition<=x.position&&x.position<=run.endPosition).sort((a,b)=>a.position-b.position);
    const coachKey=cohort[0]?.main.coachId??""; const feederRunId=`feeder-run:${run.id.slice(9)}`;
    if(cohort.some(x=>x.feeder.coachId!==coachKey))return rejected("INFEASIBLE","FEEDER_COACH_MISMATCH");
    const deadline=architecture.slots[run.startPosition]!
      - effectiveCoachTransitionMinutes(problem as PlannerNextProblem,coachKey,cohort.at(-1)!.feeder.spaceId,cohort[0]!.main.spaceId);
    const durations=new Set(cohort.map(x=>x.feeder.duration));
    if(durations.size!==1)return rejected("INCONCLUSIVE","HETEROGENEOUS_FEEDER_RUN_GEOMETRY");
    const slotDuration=cohort[0]!.feeder.duration,duration=slotDuration*cohort.length;
    if(new Set(cohort.map(x=>x.feeder.spaceId)).size!==1)
      return rejected("INCONCLUSIVE","HETEROGENEOUS_FEEDER_RUN_SPACE");
    const feederIds=new Set(cohort.map(x=>x.feeder.id));
    if(cohort.some(x=>x.feeder.dependencies.some(id=>feederIds.has(id))))
      return rejected("INCONCLUSIVE","UNSUPPORTED_FEEDER_RUN_DEPENDENCY");
    const coachWindows=orderedWindows(problem.coaches.find(c=>c.id===coachKey)?.availability,problem.day);
    const fixed=[...mainOwner].flatMap(([position,x])=>anchoredOperations.get(x.tokenId)?.tasks
      ?? [{...x.main,start:architecture.slots[position]!,end:architecture.slots[position]!+x.main.duration}]);
    const priorFeeders=feederSpots.map(spot=>{const x=assigned.find(item=>item.tokenId===spot.tokenId)!;return {...x.feeder,start:spot.start,end:spot.end};});
    const placed=[...fixed,...priorFeeders];
    const domains=cohort.map(x=>({x,domain:exactTaskStartDomain(problem,x.feeder,placed)}));
    const certificate=deriveFeederCohortRelaxedCertificate(problem,
      cohort.map(({feeder})=>({task:feeder,deadline})),placed);
    const maximumStart=deadline-duration;
    const allowed=certificate.applicable?certificate.contiguousBlockStartIntervals:[{start:problem.day.start,end:maximumStart}];
    const structuralStarts=domains.flatMap(({domain})=>domain.intervals.flatMap(interval=>cohort.flatMap((_,ordinal)=>
      [interval.start-ordinal*slotDuration,interval.end-ordinal*slotDuration])))
      .concat(allowed.flatMap(interval=>[interval.start,interval.end]),maximumStart)
      .filter(start=>start>=problem.day.start&&start<=maximumStart
        && allowed.some(interval=>interval.start<=start&&start<=interval.end));
    const boundaries=[...new Set(structuralStarts)].sort((a,b)=>b-a);
    const diagnostic:typeof diagnosticFeederRuns[number]={id:feederRunId,coach:coachKey,deadline,size:cohort.length,
      exactDomainIntervalCount:domains.reduce((sum,{domain})=>sum+domain.intervals.length,0),
      candidateStartBoundaryCount:boundaries.length,blockStartCandidatesEvaluated:0,perfectMatchingChecks:0};
    diagnosticFeederRuns.push(diagnostic);
    let selected:AnonymousPipelineSpot[]|undefined;
    for(const start of [...new Set(boundaries)]){
      diagnostic.blockStartCandidatesEvaluated++;
      const edges=new Map(domains.map(({x,domain})=>[x.tokenId,cohort.map((_,ordinal)=>ordinal).filter(ordinal=>{
        const at=start+ordinal*slotDuration;return domain.intervals.some(interval=>interval.start<=at&&at<=interval.end);
      })]));
      diagnostic.perfectMatchingChecks++;
      const matching=exactFeederOrdinalPerfectMatching(cohort.map(x=>x.tokenId),edges);
      if(matching){selected=cohort.map(x=>{const ordinal=matching.get(x.tokenId)!;return {
        id:`feeder:${x.tokenId}`,start:start+ordinal*slotDuration,end:start+(ordinal+1)*slotDuration,
        profileKey:x.profileKey,tokenId:x.tokenId,coachKey,feederRunId,mainRunId:run.id};});
        diagnostic.blockStart=start;diagnostic.blockEnd=start+duration;
        diagnostic.matching=[...matching].map(([tokenId,ordinal])=>({tokenId,ordinal})).sort((a,b)=>a.ordinal-b.ordinal);break;}
    }
    if(!selected){
      const available=coachWindows.reduce((sum,w)=>sum+Math.max(0,Math.min(w.end,deadline)-Math.max(w.start,problem.day.start)),0);
      if(available<duration)return rejected("INFEASIBLE","FEEDER_RUN_CAPACITY");
      return rejected("INFEASIBLE","FEEDER_RUN_GEOMETRY");
    }
    feederSpots.push(...selected);
  }
  feederGeometryCompleted=true;

  // Styling geometry is a serial set of latest boundary-derived spots, not grid points.
  const styleSpace=layers[0]!.styling.spaceId;
  if(layers.some(x=>x.styling.spaceId!==styleSpace||x.styling.duration!==layers[0]!.styling.duration))
    return rejected("INCONCLUSIVE","HETEROGENEOUS_STYLING_GEOMETRY");
  const duration=layers[0]!.styling.duration;
  const styleWindows=orderedWindows(problem.spaces.find(s=>s.id===styleSpace)?.availability,problem.day);
  let stylingSpots:AnonymousPipelineSpot[]=[];
  const deadlines=[...architecture.slots].sort((a,b)=>a-b)
    .map(deadline=>deadline-problem.participantTransitionMinutes);
  // Latest left-justified serial block satisfying every prefix deadline. Its origin is
  // an interval boundary/slack calculation; no clock grid is enumerated.
  const styleStarts=styleWindows.flatMap(window=>[window.start,window.end-layers.length*duration,
    ...deadlines.map((deadline,i)=>deadline-(i+1)*duration),
    ...feederSpots.flatMap(spot=>[spot.start-duration,spot.end]),
    ...anchoredOperationSpots.flatMap(spot=>[spot.start-duration,spot.end])])
    .filter(start=>styleWindows.some(window=>window.start<=start&&start+layers.length*duration<=window.end))
    .sort((a,b)=>b-a);
  stylingCandidateStartBoundaryCount=new Set(styleStarts).size;
  if(!styleStarts.length)return rejected("INCONCLUSIVE","STYLING_CAPACITY");

  // Bipartite matching couples Styling with the already concrete Vocal/Main route and
  // admits either Styling->Vocal or Vocal->Styling, but never overlap.
  let styleOwner=new Map<number,Layer & {position:number}>();
  const augment=(x:Layer&{position:number},seen:Set<number>):boolean=>{
    const vocal=feederSpots.find(s=>s.tokenId===x.tokenId)!; const main=mainSpots[x.position]!;
    for(let i=0;i<stylingSpots.length;i++){
      if(seen.has(i))continue; const spot=stylingSpots[i]!;
      if(!fits(x.styling,spot.start)||spot.end+problem.participantTransitionMinutes>main.start)continue;
      const operation=anchoredOperations.get(x.tokenId);
      if(operation&&spot.start<operation.end&&operation.start<spot.end)continue;
      const disjoint=spot.end+problem.participantTransitionMinutes<=vocal.start
        ||vocal.end+problem.participantTransitionMinutes<=spot.start;
      if(operation&&vocal.start<operation.end&&operation.start<vocal.end)continue;
      if(!disjoint)continue; seen.add(i); const prior=styleOwner.get(i);
      if(!prior||augment(prior,seen)){styleOwner.set(i,x);return true;}
    } return false;
  };
  let stylingMatched=false;
  for(const start of [...new Set(styleStarts)]){
    stylingSpots=layers.map((_,i)=>({id:`styling:${i}`,start:start+i*duration,end:start+(i+1)*duration}));
    styleOwner=new Map();let matched=true;
    for(const x of assigned)if(!augment(x,new Set())){matched=false;break;}
    if(matched){stylingMatched=true;break;}
  }
  if(!stylingMatched)return rejected("INCONCLUSIVE","JOINT_STYLING_FEEDER_MATCHING");
  stylingGeometryCompleted=true;
  for(const [i,x] of styleOwner){stylingSpots[i]={...stylingSpots[i]!,profileKey:x.profileKey,tokenId:x.tokenId};}

  // Reuse the exact contiguous arrival authority with anonymous token ids at its API edge.
  const anonymousArrivals:Task[]=assigned.map(x=>({...x.arrival,id:`in:${x.tokenId}`,participantId:x.tokenId,dependencies:[]}));
  const anonymousParticipants=assigned.map(x=>({id:x.tokenId,availability:problem.participants.find(p=>p.id===x.main.participantId)?.availability??[]}));
  const obligations:ScheduledTask[]=assigned.flatMap(x=>{
    const style=stylingSpots.find(s=>s.tokenId===x.tokenId)!; const vocal=feederSpots.find(s=>s.tokenId===x.tokenId)!;
    return [{...x.styling,id:`styling:${x.tokenId}`,participantId:x.tokenId,dependencies:[`in:${x.tokenId}`],start:style.start,end:style.end},
      {...x.feeder,id:`feeder:${x.tokenId}`,participantId:x.tokenId,dependencies:[`in:${x.tokenId}`],start:vocal.start,end:vocal.end}];
  });
  const anonymousProblem={...problem,participants:anonymousParticipants,
    tasks:[...problem.tasks.filter(t=>!arrivalIds.has(t.id)),...anonymousArrivals],
    transportPolicy:{...problem.transportPolicy,arrival:{...problem.transportPolicy.arrival,taskIds:anonymousArrivals.map(t=>t.id)}}} as PlannerNextProblem;
  arrivalSolverExecuted=true;
  const arrival=assessCoreArrivalTransportFeasibility(anonymousProblem,obligations);
  arrivalClassification=arrival.evidence.classification;
  arrivalContiguousStatesExplored=arrival.evidence.contiguousStatesExplored;
  arrivalMembershipFallbackEntered=arrival.evidence.membershipFallbackEntered;
  if(arrival.status!=="FEASIBLE"||!arrival.scheduled)return rejected(arrival.status,"JOINT_ARRIVAL_GEOMETRY");
  const inGroups=arrival.evidence.packetSizes.map((size,i)=>({id:`in-group:${i}`,start:arrival.evidence.starts[i]!,
    end:arrival.evidence.starts[i]!+anonymousArrivals[0]!.duration,size}));
  const inGroupByToken=new Map<string,string>();
  arrival.evidence.packetMembers.forEach((members,i)=>members.forEach(id=>inGroupByToken.set(id.slice(3),`in-group:${i}`)));
  // Reattach anonymous geometry to its original tasks only for the existing meal
  // authorities. These nominal identities never enter the public witness/fingerprint.
  const internalSchedule:ScheduledTask[] = assigned.flatMap(x=>{
    const main=mainSpots[x.position]!, feeder=feederSpots.find(s=>s.tokenId===x.tokenId)!;
    const styling=stylingSpots.find(s=>s.tokenId===x.tokenId)!;
    const group=inGroups.find(g=>g.id===inGroupByToken.get(x.tokenId))!;
    const operation=anchoredOperations.get(x.tokenId);
    return [
      {...x.main,start:main.start,end:main.end},
      {...x.feeder,start:feeder.start,end:feeder.end},
      {...x.styling,start:styling.start,end:styling.end},
      {...x.arrival,start:group.start,end:group.end},
      ...(operation?.tasks.filter(task=>task.id!==x.main.id)??[]),
    ];
  });
  const mainMealAuthority=mainFlowMealPolicy(problem as PlannerNextProblem);
  const fixedMainMeals=mainMealAuthority ? (problem.operationalMealPolicies??[])
    .filter(policy=>mainMealAuthority.sourceIds.includes(policy.id))
    .map(policy=>{const meal=createMainFlowMeal(problem as PlannerNextProblem);return {
      id:policy.id,resourceIds:[...policy.resourceIds],spaceIds:[...policy.spaceIds],duration:policy.duration,
      start:meal.start,end:meal.end,
    };}) : [];
  operationalMealPoliciesChecked=problem.operationalMealPolicies?.length??0;
  const operational=assessOperationalMealFutureFeasibility(problem as PlannerNextProblem,internalSchedule,
    {remaining:problem.budget.maxBranchExpansions},"PROBE",fixedMainMeals);
  operationalMealFutureFeasible=operational.complete;
  operationalMealBlockingPolicyIds=[...operational.blockingPolicyIds];
  operationalMealBranchesExplored=operational.branchesExplored;
  if(!operational.complete)return rejected(operational.reasonCodes.includes("OPERATIONAL_MEAL_BRANCH_BUDGET_EXHAUSTED")
    ? "INCONCLUSIVE":"INFEASIBLE","OPERATIONAL_MEAL_FUTURE_INFEASIBLE");
  const participantMealProblem={...problem,participantMeals:[...(problem.participantMeals??[]),...analyticalParticipantMeals]};
  if((participantMealProblem.participantMeals?.length??0)>0){
    const participant=probeParticipantMealFutureFeasibility(participantMealProblem as PlannerNextProblem,internalSchedule);
    participantMealsChecked=participant.affectedObligationsChecked;
    participantMealFutureFeasible=participant.feasible;
    participantMealBlockingTaskIds=[...participant.blockingMealTaskIds];
    participantMealAnalyticDomainBuilds=participant.analyticDomainBuilds;
    if(!participant.feasible)return rejected("INFEASIBLE","PARTICIPANT_MEAL_FUTURE_INFEASIBLE");
  }else participantMealFutureFeasible=true;
  const assignments=assigned.map(x=>({tokenId:x.tokenId,profileKey:x.profileKey,mainSpotId:`main:${x.position}`,
    feederSpotId:`feeder:${x.tokenId}`,stylingSpotId:stylingSpots.find(s=>s.tokenId===x.tokenId)!.id,
    inGroupId:inGroupByToken.get(x.tokenId)!,mainRunId:runForPosition(x.position).id,
    feederRunId:`feeder-run:${runForPosition(x.position).id.slice(9)}`,
    ...(anchoredOperations.has(x.tokenId)?{anchoredOperationSpotId:`anchored:${x.tokenId}`}:{})})).sort((a,b)=>a.tokenId.localeCompare(b.tokenId));
  const payload={runCount:empty("FEASIBLE","").runCount,pattern:[...architecture.pattern],mainSpots,feederSpots,
    stylingSpots,inGroups,anchoredOperationSpots,assignments,profileCount:ordinal.size,tokenCount:layers.length};
  onNominalSchedule?.(internalSchedule);
  const result={status:"FEASIBLE" as const,...payload,fingerprint:stable(payload)};emitDiagnostic();return result;
}

/** Public certificate. Nominal task identity is deliberately absent from its result and fingerprint. */
export function buildAnonymousPipelineWitness(problem: Readonly<PlannerNextProblem>, architecture:MainFeederArchitecture,
  onDiagnostic?: (diagnostic:AnonymousPipelineWitnessDiagnostic)=>void,
  analyticalParticipantMeals:readonly ParticipantMealObligation[]=[]): AnonymousPipelineWitness {
  return buildPipelineWitness(problem,architecture,onDiagnostic,analyticalParticipantMeals);
}

/** Internal constructive projection of the already-proved anonymous assignments. */
export function materializeNominalPipelineWitness(problem: Readonly<PlannerNextProblem>, architecture:MainFeederArchitecture):
  { witness:AnonymousPipelineWitness; scheduledTasks:readonly ScheduledTask[] } {
  let scheduledTasks:readonly ScheduledTask[]=[];
  const witness=buildPipelineWitness(problem,architecture,undefined,[],scheduled=>{scheduledTasks=scheduled;});
  return {witness,scheduledTasks};
}

/** Finds the first structural architecture using the same pattern/timeline authorities as the exact core. */
export function materializeFirstNominalPipelineWitness(problem:Readonly<PlannerNextProblem>):
  { witness:AnonymousPipelineWitness; scheduledTasks:readonly ScheduledTask[] }|null {
  const mains=problem.tasks.filter(task=>task.kind==="main");
  if(!mains.length)return null;
  const feeders=new Map(mains.flatMap(main=>{const feeder=problem.tasks.find(task=>task.kind==="vocal"
    &&task.participantId===main.participantId);return feeder?[[main.id,feeder] as const]:[];}));
  const generated=generateMainFlowPatterns(mains,problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey,problem.budget.maxPatterns,problem.resources);
  for(const pattern of generated.patterns){
    const duration=mains[0]!.duration;
    const slots=hasMainFlowMeal(problem)
      ?orderTimelines(candidateCuts(pattern).map(cut=>buildTimeline(problem,pattern,duration,cut))).map(row=>row.slots)
      :[problem.mainFlow.preferredEnd,problem.day.end].filter((end,index,ends)=>ends.indexOf(end)===index)
        .map(end=>pattern.map((_,index)=>end-pattern.length*duration+index*duration));
    for(const timeline of slots){
      const architecture={pattern,timeline:undefined,slots:timeline};
      if(proveMainFeederArchitectureImpossible(problem,mains,feeders,architecture))continue;
      const materialized=materializeNominalPipelineWitness(problem,architecture);
      const orderedMains=materialized.scheduledTasks.filter(task=>task.kind==="main").sort((a,b)=>a.start-b.start);
      const meal=mainFlowMealPolicy(problem)?createMainFlowMeal(problem):null;
      const continuous=orderedMains.slice(1).every((task,index)=>orderedMains[index]!.end===task.start
        ||Boolean(meal&&orderedMains[index]!.end===meal.start&&task.start===meal.end));
      if(materialized.witness.status==="FEASIBLE"&&continuous)return materialized;
    }
  }
  return null;
}
