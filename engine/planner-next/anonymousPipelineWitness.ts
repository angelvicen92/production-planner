import { createHash } from "node:crypto";
import type { ParticipantTask, PlannerNextProblem, ScheduledTask, Task, Window } from "./contracts";
import type { MainFeederArchitecture } from "./mainFlowPatterns";
import { effectiveCoachTransitionMinutes } from "./coachRouteTransitions";
import { assessCoreArrivalTransportFeasibility } from "./transportGrouping";

export type AnonymousPipelineWitnessStatus = "FEASIBLE" | "INFEASIBLE" | "INCONCLUSIVE";
export interface AnonymousPipelineSpot { id:string; start:number; end:number; profileKey?:string; tokenId?:string; coachKey?:string }
export interface AnonymousPipelineWitness {
  status: AnonymousPipelineWitnessStatus;
  reason?: string;
  runCount: number;
  pattern: readonly string[];
  mainSpots: readonly AnonymousPipelineSpot[];
  feederSpots: readonly AnonymousPipelineSpot[];
  stylingSpots: readonly AnonymousPipelineSpot[];
  inGroups: readonly (AnonymousPipelineSpot & { size:number })[];
  assignments: readonly { tokenId:string; profileKey:string; mainSpotId:string; feederSpotId:string; stylingSpotId:string; inGroupId:string }[];
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
    pattern:[...architecture.pattern], mainSpots:[], feederSpots:[], stylingSpots:[], inGroups:[], assignments:[],
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
  const material=(x:Omit<Layer,"profileKey"|"tokenId">)=>({ blockKey:x.main.blockKey??"", coachKey:x.main.coachId??"",
    durations:[x.arrival.duration,x.styling.duration,x.feeder.duration,x.main.duration],
    spaces:[x.arrival.spaceId,x.styling.spaceId,x.feeder.spaceId,x.main.spaceId],
    availability:[x.arrival,x.styling,x.feeder,x.main].map(t=>signatureWindows(t.availability)),
    participantAvailability:signatureWindows(problem.participants.find(p=>p.id===x.main.participantId)?.availability),
    resources:[x.arrival,x.styling,x.feeder,x.main].map(resources) });
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
  const augmentMain=(layer:Layer,seen:Set<number>):boolean=>{
    for(let position=0;position<architecture.pattern.length;position++){
      if(seen.has(position)||(layer.main.blockKey??"")!==architecture.pattern[position]
        ||!fits(layer.main,architecture.slots[position]!))continue;
      seen.add(position); const prior=mainOwner.get(position);
      if(!prior||augmentMain(prior,seen)){mainOwner.set(position,layer);return true;}
    } return false;
  };
  for(const layer of layers)if(!augmentMain(layer,new Set()))return empty("INFEASIBLE","MAIN_PROFILE_MATCHING");
  const assigned: Array<Layer & {position:number}> = [...mainOwner].sort((a,b)=>a[0]-b[0]).map(([position,x])=>({...x,position}));
  const mainSpots=assigned.map(x=>({id:`main:${x.position}`,start:architecture.slots[x.position]!,
    end:architecture.slots[x.position]!+x.main.duration,profileKey:x.profileKey,tokenId:x.tokenId,coachKey:x.main.coachId}));

  // One uninterrupted anonymous feeder prefix per coach. This is the same structural
  // premise used by the feeder-prefix capacity proof, with exact spots retained here.
  const feederSpots:AnonymousPipelineSpot[]=[];
  for(const coachKey of [...new Set(assigned.map(x=>x.main.coachId??""))].sort()){
    const cohort=assigned.filter(x=>(x.main.coachId??"")===coachKey).sort((a,b)=>a.position-b.position);
    if(cohort.some(x=>x.feeder.coachId!==coachKey))return empty("INFEASIBLE","FEEDER_COACH_MISMATCH");
    const deadline=Math.min(...cohort.map(x=>architecture.slots[x.position]!
      - effectiveCoachTransitionMinutes(problem as PlannerNextProblem,coachKey,x.feeder.spaceId,x.main.spaceId)));
    let cursor=deadline;
    for(const x of [...cohort].reverse()){
      cursor-=x.feeder.duration;
      const windows=orderedWindows(problem.coaches.find(c=>c.id===coachKey)?.availability,problem.day);
      const room=orderedWindows(problem.spaces.find(s=>s.id===x.feeder.spaceId)?.availability,problem.day);
      if(cursor<problem.day.start||!fits(x.feeder,cursor)||!windows.some(w=>w.start<=cursor&&cursor+x.feeder.duration<=w.end)
        ||!room.some(w=>w.start<=cursor&&cursor+x.feeder.duration<=w.end))return empty("INFEASIBLE","FEEDER_GEOMETRY");
      feederSpots.push({id:`feeder:${x.tokenId}`,start:cursor,end:cursor+x.feeder.duration,
        profileKey:x.profileKey,tokenId:x.tokenId,coachKey});
    }
  }

  // Styling geometry is a serial set of latest boundary-derived spots, not grid points.
  const styleSpace=layers[0]!.styling.spaceId;
  if(layers.some(x=>x.styling.spaceId!==styleSpace||x.styling.duration!==layers[0]!.styling.duration))
    return empty("INCONCLUSIVE","HETEROGENEOUS_STYLING_GEOMETRY");
  const duration=layers[0]!.styling.duration;
  const styleWindows=orderedWindows(problem.spaces.find(s=>s.id===styleSpace)?.availability,problem.day);
  const stylingSpots:AnonymousPipelineSpot[]=[];
  const deadlines=[...architecture.slots].sort((a,b)=>a-b)
    .map(deadline=>deadline-problem.participantTransitionMinutes);
  // Latest left-justified serial block satisfying every prefix deadline. Its origin is
  // an interval boundary/slack calculation; no clock grid is enumerated.
  for(const window of styleWindows){
    const start=Math.max(window.start,Math.min(...deadlines.map((deadline,i)=>deadline-(i+1)*duration)));
    if(start+layers.length*duration<=window.end){
      for(let i=0;i<layers.length;i++)stylingSpots.push({id:`styling:${i}`,start:start+i*duration,end:start+(i+1)*duration});
      break;
    }
  }
  if(stylingSpots.length!==layers.length)return empty("INFEASIBLE","STYLING_CAPACITY");

  // Bipartite matching couples Styling with the already concrete Vocal/Main route and
  // admits either Styling->Vocal or Vocal->Styling, but never overlap.
  const styleOwner=new Map<number,Layer & {position:number}>();
  const augment=(x:Layer&{position:number},seen:Set<number>):boolean=>{
    const vocal=feederSpots.find(s=>s.tokenId===x.tokenId)!; const main=mainSpots[x.position]!;
    for(let i=0;i<stylingSpots.length;i++){
      if(seen.has(i))continue; const spot=stylingSpots[i]!;
      if(!fits(x.styling,spot.start)||spot.end+problem.participantTransitionMinutes>main.start)continue;
      const disjoint=spot.end+problem.participantTransitionMinutes<=vocal.start
        ||vocal.end+problem.participantTransitionMinutes<=spot.start;
      if(!disjoint)continue; seen.add(i); const prior=styleOwner.get(i);
      if(!prior||augment(prior,seen)){styleOwner.set(i,x);return true;}
    } return false;
  };
  for(const x of assigned)if(!augment(x,new Set()))return empty("INFEASIBLE","JOINT_STYLING_FEEDER_MATCHING");
  for(const [i,x] of styleOwner){stylingSpots[i]={...stylingSpots[i]!,profileKey:x.profileKey,tokenId:x.tokenId};}

  // Reuse the exact contiguous arrival authority with anonymous token ids at its API edge.
  const anonymousArrivals:Task[]=assigned.map(x=>({...x.arrival,id:`in:${x.tokenId}`,participantId:x.tokenId,dependencies:[]}));
  const anonymousParticipants=assigned.map(x=>({id:x.tokenId,availability:problem.participants.find(p=>p.id===x.main.participantId)?.availability??[]}));
  const obligations:ScheduledTask[]=assigned.flatMap(x=>{
    const style=stylingSpots.find(s=>s.tokenId===x.tokenId)!; const vocal=feederSpots.find(s=>s.tokenId===x.tokenId)!;
    return [{...x.styling,id:`styling:${x.tokenId}`,participantId:x.tokenId,start:style.start,end:style.end},
      {...x.feeder,id:`feeder:${x.tokenId}`,participantId:x.tokenId,start:vocal.start,end:vocal.end}];
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
    inGroupId:inGroupByToken.get(x.tokenId)!})).sort((a,b)=>a.tokenId.localeCompare(b.tokenId));
  const payload={runCount:empty("FEASIBLE","").runCount,pattern:[...architecture.pattern],mainSpots,feederSpots,
    stylingSpots,inGroups,assignments,profileCount:ordinal.size,tokenCount:layers.length};
  return {status:"FEASIBLE",...payload,fingerprint:stable(payload)};
}
