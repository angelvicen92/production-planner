import { createHash } from "node:crypto";
import type { ParticipantTask, PlannerNextProblem, ScheduledTask, Task, Window } from "./contracts";
import type { MainFeederArchitecture } from "./mainFlowPatterns";
import { effectiveCoachTransitionMinutes } from "./coachRouteTransitions";
import { assessCoreArrivalTransportFeasibility } from "./transportGrouping";
import { anchoredAccompanimentIndex, materializeAnchoredOperation, type AnchoredOperation } from "./anchoredAccompaniment";
import { canPlaceTask } from "./placement";

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
export function buildAnonymousPipelineWitness(problem: Readonly<PlannerNextProblem>, architecture:MainFeederArchitecture): AnonymousPipelineWitness {
  const empty = (status:AnonymousPipelineWitnessStatus, reason:string):AnonymousPipelineWitness => ({ status, reason,
    runCount: architecture.pattern.reduce((n,k,i)=>n+(i===0||architecture.pattern[i-1]!==k?1:0),0),
    pattern:[...architecture.pattern], mainSpots:[], feederSpots:[], stylingSpots:[], inGroups:[], anchoredOperationSpots:[], assignments:[],
    profileCount:0, tokenCount:0, fingerprint:stable({status,reason,pattern:architecture.pattern,slots:architecture.slots}) });
  const mains = problem.tasks.filter(t=>t.kind==="main");
  if (mains.length !== architecture.slots.length || architecture.pattern.length !== architecture.slots.length)
    return empty("INFEASIBLE", "MAIN_ARCHITECTURE_CARDINALITY");
  const arrivalIds=new Set(problem.transportPolicy?.arrival.taskIds??[]);
  if (!problem.transportPolicy?.arrival) return empty("INCONCLUSIVE", "ARRIVAL_POLICY_ABSENT");
  const raw:Array<Omit<Layer,"profileKey"|"tokenId">>=[];
  for(const main of mains){
    const participant=main.participantId;
    const feeder=problem.tasks.find(t=>t.kind==="vocal"&&t.participantId===participant&&main.dependencies.includes(t.id));
    const arrival=problem.tasks.find(t=>t.participantId===participant&&arrivalIds.has(t.id));
    const styling=problem.tasks.find(t=>t.participantId===participant&&t.kind==="auxiliary"
      && t.dependencies.some(id=>id===arrival?.id)&&main.dependencies.includes(t.id));
    if(!feeder||!arrival||!styling)return empty("INCONCLUSIVE","UNSUPPORTED_PIPELINE_SHAPE");
    if(main.kind==="technical"||feeder.kind==="technical"||arrival.kind==="technical"||styling.kind==="technical")
      return empty("INCONCLUSIVE","UNSUPPORTED_TECHNICAL_PIPELINE_SHAPE");
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
  if(!assignMain(0,new Map()))return empty("INFEASIBLE","MAIN_PROFILE_MATCHING");
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
    if(!operation)return empty("INFEASIBLE","ANCHORED_OPERATION_GEOMETRY");
    anchoredOperations.set(x.tokenId,operation);
  }
  const operations=[...anchoredOperations.entries()];
  for(let i=0;i<operations.length;i++)for(let j=i+1;j<operations.length;j++){
    const left=operations[i]![1],right=operations[j]![1];
    if(left.contract.itinerantUnitId&&left.contract.itinerantUnitId===right.contract.itinerantUnitId
      && left.start<right.end&&right.start<left.end)return empty("INFEASIBLE","ANCHORED_ITINERANT_UNIT_EXCLUSIVITY");
  }
  const anchoredOperationSpots:AnonymousAnchoredOperationSpot[]=operations.map(([tokenId,operation])=>{const x=assigned.find(item=>item.tokenId===tokenId)!;return {
    id:`anchored:${tokenId}`,operationId:stable(material(x)).slice(0,16),start:operation.start,end:operation.end,
    profileKey:x.profileKey,tokenId,mainRunId:runForPosition(x.position).id};});

  // Each actual contiguous Main run owns exactly one feeder cohort. A coach may therefore
  // prepare a later cohort between two of their Main runs instead of before their first run.
  const feederSpots:AnonymousPipelineSpot[]=[];
  for(const run of runs){
    const cohort=assigned.filter(x=>run.startPosition<=x.position&&x.position<=run.endPosition).sort((a,b)=>a.position-b.position);
    const coachKey=cohort[0]?.main.coachId??""; const feederRunId=`feeder-run:${run.id.slice(9)}`;
    if(cohort.some(x=>x.feeder.coachId!==coachKey))return empty("INFEASIBLE","FEEDER_COACH_MISMATCH");
    const deadline=architecture.slots[run.startPosition]!
      - effectiveCoachTransitionMinutes(problem as PlannerNextProblem,coachKey,cohort.at(-1)!.feeder.spaceId,cohort[0]!.main.spaceId);
    const duration=cohort.reduce((sum,x)=>sum+x.feeder.duration,0);
    const coachWindows=orderedWindows(problem.coaches.find(c=>c.id===coachKey)?.availability,problem.day);
    let starts=[{start:problem.day.start,end:deadline-duration}];
    for(const windows of [coachWindows,orderedWindows(problem.spaces.find(s=>s.id===cohort[0]!.feeder.spaceId)?.availability,problem.day)])
      starts=starts.flatMap(a=>windows.flatMap(w=>{const start=Math.max(a.start,w.start),end=Math.min(a.end,w.end-duration);return start<=end?[{start,end}]:[];}));
    const fixed=[...mainOwner].flatMap(([position,x])=>anchoredOperations.get(x.tokenId)?.tasks
      ?? [{...x.main,start:architecture.slots[position]!,end:architecture.slots[position]!+x.main.duration}]);
    const occupationBoundaries=fixed.filter(task=>task.coachId===coachKey).flatMap(task=>cohort.map((x,index)=>
      task.end+effectiveCoachTransitionMinutes(problem,coachKey,task.spaceId,x.feeder.spaceId)
        - cohort.slice(0,index).reduce((sum,item)=>sum+item.feeder.duration,0)));
    const participantBoundaries=fixed.flatMap(task=>cohort.filter(x=>x.feeder.participantId===task.participantId)
      .map(()=>task.start-duration-problem.participantTransitionMinutes));
    const boundaries=[...starts.flatMap(interval=>[interval.end,interval.start]),...occupationBoundaries,...participantBoundaries]
      .filter(start=>starts.some(interval=>interval.start<=start&&start<=interval.end)).sort((a,b)=>b-a);
    let selected:AnonymousPipelineSpot[]|undefined;
    const priorFeeders=feederSpots.map(spot=>{const x=assigned.find(item=>item.tokenId===spot.tokenId)!;return {...x.feeder,start:spot.start,end:spot.end};});
    for(const start of [...new Set(boundaries)]){
      if(new Set(cohort.map(x=>x.feeder.duration)).size!==1)continue;
      const slotDuration=cohort[0]!.feeder.duration,owner=new Map<number,typeof cohort[number]>();
      const augmentFeeder=(x:typeof cohort[number],seen:Set<number>):boolean=>{
        for(let i=0;i<cohort.length;i++){
          if(seen.has(i))continue;const at=start+i*slotDuration;
          if(!canPlaceTask(problem,x.feeder,at,[...fixed,...priorFeeders]))continue;
          seen.add(i);const prior=owner.get(i);if(!prior||augmentFeeder(prior,seen)){owner.set(i,x);return true;}
        }return false;
      };
      if(cohort.every(x=>augmentFeeder(x,new Set()))){selected=[...owner].sort((a,b)=>a[0]-b[0]).map(([i,x])=>({
        id:`feeder:${x.tokenId}`,start:start+i*slotDuration,end:start+(i+1)*slotDuration,
        profileKey:x.profileKey,tokenId:x.tokenId,coachKey,feederRunId,mainRunId:run.id}));break;}
    }
    if(!selected){
      const available=coachWindows.reduce((sum,w)=>sum+Math.max(0,Math.min(w.end,deadline)-Math.max(w.start,problem.day.start)),0);
      if(available<duration)return empty("INFEASIBLE","FEEDER_RUN_CAPACITY");
      return empty("INCONCLUSIVE","FEEDER_RUN_GEOMETRY");
    }
    feederSpots.push(...selected);
  }

  // Styling geometry is a serial set of latest boundary-derived spots, not grid points.
  const styleSpace=layers[0]!.styling.spaceId;
  if(layers.some(x=>x.styling.spaceId!==styleSpace||x.styling.duration!==layers[0]!.styling.duration))
    return empty("INCONCLUSIVE","HETEROGENEOUS_STYLING_GEOMETRY");
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
  if(!styleStarts.length)return empty("INCONCLUSIVE","STYLING_CAPACITY");

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
  if(!stylingMatched)return empty("INCONCLUSIVE","JOINT_STYLING_FEEDER_MATCHING");
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
  const arrival=assessCoreArrivalTransportFeasibility(anonymousProblem,obligations);
  if(arrival.status!=="FEASIBLE"||!arrival.scheduled)return empty(arrival.status,"JOINT_ARRIVAL_GEOMETRY");
  const inGroups=arrival.evidence.packetSizes.map((size,i)=>({id:`in-group:${i}`,start:arrival.evidence.starts[i]!,
    end:arrival.evidence.starts[i]!+anonymousArrivals[0]!.duration,size}));
  const inGroupByToken=new Map<string,string>();
  arrival.evidence.packetMembers.forEach((members,i)=>members.forEach(id=>inGroupByToken.set(id.slice(3),`in-group:${i}`)));
  const assignments=assigned.map(x=>({tokenId:x.tokenId,profileKey:x.profileKey,mainSpotId:`main:${x.position}`,
    feederSpotId:`feeder:${x.tokenId}`,stylingSpotId:stylingSpots.find(s=>s.tokenId===x.tokenId)!.id,
    inGroupId:inGroupByToken.get(x.tokenId)!,mainRunId:runForPosition(x.position).id,
    feederRunId:`feeder-run:${runForPosition(x.position).id.slice(9)}`,
    ...(anchoredOperations.has(x.tokenId)?{anchoredOperationSpotId:`anchored:${x.tokenId}`}:{})})).sort((a,b)=>a.tokenId.localeCompare(b.tokenId));
  const payload={runCount:empty("FEASIBLE","").runCount,pattern:[...architecture.pattern],mainSpots,feederSpots,
    stylingSpots,inGroups,anchoredOperationSpots,assignments,profileCount:ordinal.size,tokenCount:layers.length};
  return {status:"FEASIBLE",...payload,fingerprint:stable(payload)};
}
