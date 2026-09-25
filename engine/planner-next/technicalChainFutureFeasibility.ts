import type { PlannerNextProblem, ScheduledTask, Task, TechnicalChainPolicy, Window as Interval } from "./contracts";
import { canPlaceTask } from "./placement";
import { createTechnicalChainExplorer, technicalChainProductiveDuration, technicalChainSignature, technicalChainWorkItemKey, type TechnicalChainCandidate, type TechnicalChainExplorer } from "./technicalChains";
import { canPlaceJointGroup } from "./jointTasks";

export type TechnicalChainFutureReservationStatus = "PASS" | "PRUNE" | "ABSTAIN";
export interface TechnicalChainFutureReservationProbe {
  status: TechnicalChainFutureReservationStatus; affectedStructures:number; structuresChecked:number; branchesConsumed:number;
  structureId:string|null; workItemKey:string|null; candidateCount:number; certifiedCausingTaskId:string|null;
  certifiedDecisionDepth:number|null; initialRepairableGroupCount:number; redundantDecisionDepths:number[];
  irreducibleDecisionDepths:number[]; minimizationProbes:number; result:"WITNESS"|"ZERO_DOMAIN"|"BUDGET_EXHAUSTED"|"NOT_AFFECTED";
  knownCandidateCount:number; survivorLowerBound:number; survivorCountExact:number|null; domainComplete:boolean;
  witnessReuseCheck:boolean; witnessReuseHit:boolean;
  conflictDecisionDepths:number[]; conflictTaskIds:Record<string,string[]>; conflictGroupCount:number;
  fixedContextParticipates:boolean; conflictClassification:"SINGLE_DECISION_ZERO_DOMAIN"|"MULTI_DECISION_ZERO_DOMAIN"|"FIXED_CONTEXT_ZERO_DOMAIN"|null;
}

export interface PreparedFutureStructureEvidence {
  structureId:string; effectiveWindow:Interval[]; productiveDuration:number; slack:number; slackRatio:number; loadRatio:number;
  futureOccupancySupport:Record<string,Interval[]>; initialRootOrderDomain:number; rootsInStaticEnvelope:number;
  derivationMode:"STATIC_PHASE_ENVELOPE"|"EXACT_COMPLETE_DOMAIN"; supportComplete:boolean; candidateCountUsedToDeriveSupport:number;
}
export interface PreparedFutureTechnicalChainEvidence {
  preparedFutureStructures:PreparedFutureStructureEvidence[]; witnessReuseChecks:number; witnessReuseHits:number;
  witnessInvalidations:number; witnessRepairs:number; exactRootOrderEvaluations:number; ledgeredPermutationBranches:number;
  assessCalls:number; irrelevantFastPasses:number; lastWitnessValidationChecks:number; lastWitnessHits:number;
  knownCandidateChecks:number; fullCandidateScans:number; explorerResumptions:number; candidatePlacementChecks:number;
  pressureCacheHits:number; pressureCacheMisses:number;
  rootStartsVisited:number; rootOrdersEvaluated:number; rootOrdersYielded:number; domainComplete:boolean; exactCandidateCount:number|null;
}

export interface FutureEdgePressure {safe:boolean;intrusionMinutes:number;supportIntersections:Record<string,Interval[]>;
  knownSurvivorLowerBound:number;exactSurvivorCount:number|null;domainComplete:boolean}

/** A future-chain witness is conflict context only.  Callers must never append it
 * to the visible proposal or count it as an automatic placement. */
export interface AnalyticalFutureReservation {
  readonly structureId:string;
  readonly fingerprint:string;
  readonly rootStart:number;
  readonly phaseOrder:readonly string[];
  readonly scheduledTasks:readonly ScheduledTask[];
  readonly productiveInterval:Readonly<Interval>;
  readonly branchCost:number;
  readonly ledgerDelta:number;
}
export interface ExactReservationCursorResult {
  readonly status:"CANDIDATE"|"EXHAUSTED"|"BUDGET_EXHAUSTED";
  readonly reservation:AnalyticalFutureReservation|null;
  readonly nextCursor:number;
}

const overlap=(a:Interval,b:Interval)=>a.start<b.end&&b.start<a.end;
const union=(values:Interval[]):Interval[]=>{
  const sorted=[...values].filter(x=>x.start<x.end).sort((a,b)=>a.start-b.start||a.end-b.end),out:Interval[]=[];
  for(const value of sorted){const last=out.at(-1);if(last&&value.start<=last.end)last.end=Math.max(last.end,value.end);else out.push({...value});}
  return out;
};
const sharesHardAuthority=(left:Task,right:Task)=>left.spaceId===right.spaceId
  ||left.participantId!==undefined&&left.participantId===right.participantId
  ||left.coachId!==undefined&&left.coachId===right.coachId
  ||left.itinerantUnitId!==undefined&&left.itinerantUnitId===right.itinerantUnitId
  ||(left.requiredResourceIds??[]).some(id=>(right.requiredResourceIds??[]).includes(id))
  ||left.dependencies.includes(right.id)||right.dependencies.includes(left.id);

interface PreparedStructure {
  policy:TechnicalChainPolicy; tasks:Task[]; problem:PlannerNextProblem; explorer:TechnicalChainExplorer;
  candidates:TechnicalChainCandidate[]; signatures:Set<string>; lastWitness:TechnicalChainCandidate|null; exhausted:boolean;
  support:Map<string,Interval[]>; evidence:PreparedFutureStructureEvidence;
}

/** Execution-local authority. Its explorer and exact candidates survive every callback. */
export class PreparedFutureTechnicalChainAuthority {
  private readonly structures:PreparedStructure[];
  private readonly pressureCache=new Map<string,FutureEdgePressure>();
  readonly evidence:PreparedFutureTechnicalChainEvidence;
  constructor(private readonly problem:PlannerNextProblem, private readonly allowance:()=>number=()=>Number.MAX_SAFE_INTEGER,
    private readonly consume:(count:number)=>boolean=()=>true, fixed:readonly ScheduledTask[]=[]){
    this.structures=[...(problem.analyticalFutureTechnicalChains??[])].sort((a,b)=>a.policy.id.localeCompare(b.policy.id)).map(source=>{
      const byId=new Map(source.tasks.map(task=>[task.id,task]));
      const tasks=source.policy.orderedTaskIds.map(id=>byId.get(id)).filter((x):x is Task=>!!x);
      const local={...problem,tasks:[...problem.tasks,...source.tasks],technicalChains:[source.policy]};
      const duration=technicalChainProductiveDuration(tasks);
      // A phased chain has no distinguished first member.  The static envelope
      // deliberately keeps every grid root at which the complete productive
      // duration fits; canonical enumeration subsequently proves feasibility.
      // This is conservative, but unlike a tasks[0] domain it cannot discard a
      // root merely because a different phase member has to go first.
      const roots:number[]=[];for(let start=problem.day.start;start+duration<=problem.day.end;start+=5)roots.push(start);
      const effectiveWindow=union(tasks.flatMap(task=>task.availability??[{...problem.day}]));
      const windowMinutes=effectiveWindow.reduce((sum,x)=>sum+x.end-x.start,0),slack=Math.max(0,windowMinutes-duration);
      const support=new Map<string,Interval[]>();
      const add=(id:string|undefined,intervals:Interval[])=>{if(id)support.set(id,union([...(support.get(id)??[]),...intervals]));};
      // Before exact enumeration completes, use a sound geometric envelope of
      // eligible roots and every offset a member can have inside its phase. Raw
      // task availability is not occupancy support: it ignores chain offsets and
      // would erase legitimate holes between possible realizations.
      const phaseByTask=new Map<string,{before:number;within:number}>();let before=0;
      for(const phaseIds of source.policy.phases??source.policy.orderedTaskIds.map(id=>[id])){
        const phase=phaseIds.map(id=>byId.get(id)).filter((x):x is Task=>!!x),total=phase.reduce((sum,task)=>sum+task.duration,0);
        for(const task of phase)phaseByTask.set(task.id,{before,within:total-task.duration});
        before+=total;
      }
      const staticallyFits=(task:Task,start:number)=>{
        const sets=[task.availability,problem.participants.find(x=>x.id===task.participantId)?.availability,
          problem.spaces.find(x=>x.id===task.spaceId)?.availability,
          ...(task.requiredResourceIds??[]).map(id=>problem.resources.find(x=>x.id===id)?.availability)]
          .filter((x):x is Interval[]=>Array.isArray(x)&&x.length>0);
        return sets.every(windows=>windows.some(window=>window.start<=start&&start+task.duration<=window.end));
      };
      for(const task of tasks){const offset=phaseByTask.get(task.id)??{before:0,within:0};const intervals:Interval[]=[];
        for(const root of roots)for(let within=0;within<=offset.within;within+=5){const start=root+offset.before+within;
          if(staticallyFits(task,start))intervals.push({start,end:start+task.duration});}
        add(task.participantId,intervals);add(task.coachId,intervals);add(task.itinerantUnitId,intervals);for(const id of task.requiredResourceIds??[])add(id,intervals);}
      return {policy:source.policy,tasks,problem:local,explorer:createTechnicalChainExplorer(local,tasks,[...fixed],Number.MAX_SAFE_INTEGER),
        candidates:[],signatures:new Set<string>(),lastWitness:null,exhausted:false,support,
        evidence:{structureId:source.policy.id,effectiveWindow,productiveDuration:duration,slack,
          slackRatio:windowMinutes?slack/windowMinutes:0,loadRatio:windowMinutes?duration/windowMinutes:1,
          futureOccupancySupport:Object.fromEntries([...support].map(([id,x])=>[id,x])),initialRootOrderDomain:roots.length,rootsInStaticEnvelope:roots.length,
          derivationMode:"STATIC_PHASE_ENVELOPE",supportComplete:false,candidateCountUsedToDeriveSupport:0}};
    });
    this.evidence={preparedFutureStructures:this.structures.map(x=>x.evidence),witnessReuseChecks:0,witnessReuseHits:0,
      witnessInvalidations:0,witnessRepairs:0,exactRootOrderEvaluations:0,ledgeredPermutationBranches:0,
      assessCalls:0,irrelevantFastPasses:0,lastWitnessValidationChecks:0,lastWitnessHits:0,knownCandidateChecks:0,
      fullCandidateScans:0,explorerResumptions:0,candidatePlacementChecks:0,pressureCacheHits:0,pressureCacheMisses:0,
      rootStartsVisited:0,rootOrdersEvaluated:0,rootOrdersYielded:0,domainComplete:false,exactCandidateCount:null};
  }
  occupancySupport(memberId:string):readonly Interval[]{return union(this.structures.flatMap(x=>x.support.get(memberId)??[]));}
  /** Most-constrained-first order, using only prepared authority information. */
  reservationStructureIds():readonly string[]{return [...this.structures].sort((a,b)=>
    (a.exhausted&&b.exhausted?a.candidates.length-b.candidates.length:0)
    ||a.evidence.initialRootOrderDomain-b.evidence.initialRootOrderDomain
    ||a.evidence.slack-b.evidence.slack||a.policy.id.localeCompare(b.policy.id)).map(x=>x.policy.id);}
  /** Lazily returns the next exact candidate from this authority's own resumable explorer. */
  nextExactReservation(structureId:string,placed:readonly ScheduledTask[]=[],cursor=0):ExactReservationCursorResult{
    const structure=this.structures.find(x=>x.policy.id===structureId);if(!structure)return {status:"EXHAUSTED",reservation:null,nextCursor:cursor};
    while(true){
      while(cursor<structure.candidates.length){const candidate=structure.candidates[cursor++]!;if(!this.valid(structure,candidate,placed))continue;
        return {status:"CANDIDATE",nextCursor:cursor,reservation:{structureId,fingerprint:technicalChainSignature(candidate.tasks),
          rootStart:candidate.start,phaseOrder:candidate.tasks.map(x=>x.id),scheduledTasks:candidate.tasks.map(x=>({...x})),
          productiveInterval:{start:candidate.start,end:candidate.end},branchCost:candidate.cost,ledgerDelta:0}};}
      if(structure.exhausted)return {status:"EXHAUSTED",reservation:null,nextCursor:cursor};
      if(this.allowance()<=0)return {status:"BUDGET_EXHAUSTED",reservation:null,nextCursor:cursor};
      this.evidence.explorerResumptions++;const prior=structure.explorer.consumed,candidate=structure.explorer.nextCandidate();
      const delta=structure.explorer.consumed-prior;
      if(delta&&!this.consume(delta))return {status:"BUDGET_EXHAUSTED",reservation:null,nextCursor:cursor};
      this.evidence.exactRootOrderEvaluations+=delta;this.evidence.ledgeredPermutationBranches+=delta;
      if(!candidate){if(structure.explorer.exhausted)return {status:"BUDGET_EXHAUSTED",reservation:null,nextCursor:cursor};structure.exhausted=true;continue;}
      const signature=technicalChainSignature(candidate.tasks);if(!structure.signatures.has(signature)){structure.signatures.add(signature);structure.candidates.push(candidate);}
      if(cursor<structure.candidates.length&&this.valid(structure,candidate,placed)){cursor++;
        return {status:"CANDIDATE",nextCursor:cursor,reservation:{structureId,fingerprint:signature,rootStart:candidate.start,
          phaseOrder:candidate.tasks.map(x=>x.id),scheduledTasks:candidate.tasks.map(x=>({...x})),productiveInterval:{start:candidate.start,end:candidate.end},
          branchCost:candidate.cost,ledgerDelta:delta}};}
    }
  }
  reservationRemainsValid(reservation:AnalyticalFutureReservation,placed:readonly ScheduledTask[]):boolean{
    const structure=this.structures.find(x=>x.policy.id===reservation.structureId);if(!structure)return false;
    const candidate=structure.candidates.find(x=>technicalChainSignature(x.tasks)===reservation.fingerprint);return !!candidate&&this.valid(structure,candidate,placed);
  }
  pressure(tasks:readonly ScheduledTask[]):FutureEdgePressure{
    const key=technicalChainSignature([...tasks]);const cached=this.pressureCache.get(key);if(cached){this.evidence.pressureCacheHits++;return cached;}
    this.evidence.pressureCacheMisses++;const intersections:Record<string,Interval[]>={};let intrusionMinutes=0;
    for(const task of tasks)for(const id of [task.participantId,task.coachId,task.itinerantUnitId,...(task.requiredResourceIds??[])])if(id){
      const hits=this.occupancySupport(id).flatMap(x=>overlap(task,x)?[{start:Math.max(task.start,x.start),end:Math.min(task.end,x.end)}]:[]);
      if(hits.length){intersections[id]=union([...(intersections[id]??[]),...hits]);intrusionMinutes+=hits.reduce((n,x)=>n+x.end-x.start,0);}}
    const complete=this.structures.every(x=>x.exhausted);
    let knownSurvivors=0;for(const structure of this.structures)for(const candidate of structure.candidates)
      if(this.valid(structure,candidate,tasks))knownSurvivors++;
    const value={safe:intrusionMinutes===0,intrusionMinutes,supportIntersections:intersections,
      knownSurvivorLowerBound:knownSurvivors,exactSurvivorCount:complete?knownSurvivors:null,domainComplete:complete};
    this.pressureCache.set(key,value);return value;
  }
  intrusion(tasks:readonly ScheduledTask[]):number{return this.pressure(tasks).intrusionMinutes;}
  private valid(structure:PreparedStructure,candidate:TechnicalChainCandidate,placed:readonly ScheduledTask[]):boolean{
    this.evidence.candidatePlacementChecks++;
    const own=new Set(candidate.tasks.map(x=>x.id));let prior=[...placed.filter(x=>!own.has(x.id))];
    const checkedGroups=new Set<string>();
    for(const task of candidate.tasks){const source=structure.problem.tasks.find(x=>x.id===task.id)!;
      if(source.jointGroupId){if(checkedGroups.has(source.jointGroupId))continue;checkedGroups.add(source.jointGroupId);
        const group=candidate.tasks.filter(item=>item.jointGroupId===source.jointGroupId);
        const sources=group.map(item=>structure.problem.tasks.find(candidateSource=>candidateSource.id===item.id)!);
        if(!canPlaceJointGroup(structure.problem,sources,task.start,prior))return false;prior=[...prior,...group];continue;}
      if(!canPlaceTask(structure.problem,source,task.start,prior))return false;prior=[...prior,task];
    }return true;
  }
  assess(placed:readonly ScheduledTask[],added:readonly ScheduledTask[],decisionDepthForTask?:(id:string)=>number|null):TechnicalChainFutureReservationProbe{
    this.evidence.assessCalls++;
    const affected=this.structures.filter(x=>x.tasks.some(member=>added.some(task=>sharesHardAuthority(member,task))));
    const base={affectedStructures:affected.length,structuresChecked:0,branchesConsumed:0,structureId:null,workItemKey:null,candidateCount:0,
      certifiedCausingTaskId:null,certifiedDecisionDepth:null,initialRepairableGroupCount:0,redundantDecisionDepths:[] as number[],irreducibleDecisionDepths:[] as number[],minimizationProbes:0,
      knownCandidateCount:0,survivorLowerBound:0,survivorCountExact:null,domainComplete:false,witnessReuseCheck:false,witnessReuseHit:false,
      conflictDecisionDepths:[] as number[],conflictTaskIds:{} as Record<string,string[]>,conflictGroupCount:0,
      fixedContextParticipates:false,conflictClassification:null as TechnicalChainFutureReservationProbe["conflictClassification"]};
    if(!affected.length){this.evidence.irrelevantFastPasses++;return {...base,status:"PASS",result:"NOT_AFFECTED"};}
    let consumed=0,checked=0;
    for(const structure of affected){checked++;
      let witness:TechnicalChainCandidate|null=null;this.evidence.witnessReuseChecks++;base.witnessReuseCheck=true;
      if(structure.lastWitness){this.evidence.lastWitnessValidationChecks++;if(this.valid(structure,structure.lastWitness,placed)){witness=structure.lastWitness;this.evidence.witnessReuseHits++;this.evidence.lastWitnessHits++;base.witnessReuseHit=true;}}
      if(!witness){if(structure.lastWitness)this.evidence.witnessInvalidations++;for(const candidate of structure.candidates){this.evidence.knownCandidateChecks++;if(this.valid(structure,candidate,placed)){witness=candidate;break;}}if(witness)this.evidence.witnessRepairs++;}
      while(!witness&&!structure.exhausted){if(this.allowance()<=0)return {...base,status:"ABSTAIN",result:"BUDGET_EXHAUSTED",structuresChecked:checked,branchesConsumed:consumed};
        this.evidence.explorerResumptions++;
        const prior=structure.explorer.consumed,candidate=structure.explorer.nextCandidate(),delta=structure.explorer.consumed-prior;
        this.evidence.rootStartsVisited=this.structures.reduce((n,x)=>n+x.explorer.diagnostics.rootStartsVisited,0);
        this.evidence.rootOrdersEvaluated=this.structures.reduce((n,x)=>n+x.explorer.diagnostics.rootOrdersEvaluated,0);
        this.evidence.rootOrdersYielded=this.structures.reduce((n,x)=>n+x.explorer.diagnostics.rootOrdersYielded,0);
        if(delta&&!this.consume(delta))return {...base,status:"ABSTAIN",result:"BUDGET_EXHAUSTED",structuresChecked:checked,branchesConsumed:consumed};
        consumed+=delta;this.evidence.exactRootOrderEvaluations+=delta;this.evidence.ledgeredPermutationBranches+=delta;
        if(!candidate){structure.exhausted=!structure.explorer.exhausted;if(structure.explorer.exhausted)return {...base,status:"ABSTAIN",result:"BUDGET_EXHAUSTED",structuresChecked:checked,branchesConsumed:consumed};
          structure.support.clear();for(const exact of structure.candidates)for(const task of exact.tasks){const interval=[{start:task.start,end:task.end}];
            const addExact=(id:string|undefined)=>{if(id)structure.support.set(id,union([...(structure.support.get(id)??[]),...interval]));};
            addExact(task.participantId);addExact(task.coachId);addExact(task.itinerantUnitId);for(const id of task.requiredResourceIds??[])addExact(id);}
          structure.evidence.derivationMode="EXACT_COMPLETE_DOMAIN";structure.evidence.supportComplete=true;
          structure.evidence.candidateCountUsedToDeriveSupport=structure.candidates.length;
          structure.evidence.futureOccupancySupport=Object.fromEntries([...structure.support].map(([id,x])=>[id,x]));this.pressureCache.clear();
          this.evidence.rootStartsVisited=this.structures.reduce((n,x)=>n+x.explorer.diagnostics.rootStartsVisited,0);
          this.evidence.rootOrdersEvaluated=this.structures.reduce((n,x)=>n+x.explorer.diagnostics.rootOrdersEvaluated,0);
          this.evidence.rootOrdersYielded=this.structures.reduce((n,x)=>n+x.explorer.diagnostics.rootOrdersYielded,0);
          this.evidence.domainComplete=this.structures.every(x=>x.exhausted);
          this.evidence.exactCandidateCount=this.evidence.domainComplete?this.structures.reduce((n,x)=>n+x.candidates.length,0):null;break;}
        const signature=technicalChainSignature(candidate.tasks);if(!structure.signatures.has(signature)){structure.signatures.add(signature);structure.candidates.push(candidate);}
        if(this.valid(structure,candidate,placed))witness=candidate;
      }
      let exactSurvivors:number|null=null;if(structure.exhausted){this.evidence.fullCandidateScans++;
        exactSurvivors=structure.candidates.reduce((count,candidate)=>count+(this.valid(structure,candidate,placed)?1:0),0);}
      const identity={structureId:structure.policy.id,workItemKey:technicalChainWorkItemKey(structure.tasks[0]!.id),knownCandidateCount:structure.candidates.length,
        survivorLowerBound:witness?1:0,survivorCountExact:exactSurvivors,domainComplete:structure.exhausted};
      if(witness){structure.lastWitness=witness;continue;}
      const relevant=added.filter(task=>structure.tasks.some(member=>sharesHardAuthority(member,task))).sort((a,b)=>a.id.localeCompare(b.id));
      const grouped=new Map<number,ScheduledTask[]>();for(const task of placed){if(!structure.tasks.some(member=>sharesHardAuthority(member,task)))continue;
        const depth=decisionDepthForTask?decisionDepthForTask(task.id):(relevant.some(x=>x.id===task.id)?Number.MAX_SAFE_INTEGER:null);if(depth!==null)grouped.set(depth,[...(grouped.get(depth)??[]),task]);}
      let working=[...placed],probes=0;const redundant:number[]=[],necessary:number[]=[];
      for(const [depth,tasks] of [...grouped].sort(([a],[b])=>a-b)){const ids=new Set(tasks.map(x=>x.id)),without=working.filter(x=>!ids.has(x.id));probes++;
        if(structure.candidates.some(x=>this.valid(structure,x,without))){necessary.push(depth);}else{working=without;redundant.push(depth);}}
      const causingDepth=necessary.length===1?necessary[0]:null;
      const causing=causingDepth===null?undefined:(grouped.get(causingDepth)??[]).sort((a,b)=>a.id.localeCompare(b.id))[0];
      const conflictTaskIds=Object.fromEntries(necessary.map(depth=>[String(depth),(grouped.get(depth)??[]).map(x=>x.id).sort()]));
      const decisionIds=new Set([...grouped.values()].flat().map(task=>task.id));
      const fixedContextParticipates=placed.some(task=>!decisionIds.has(task.id)
        &&structure.tasks.some(member=>sharesHardAuthority(member,task)));
      return {...base,...identity,status:"PRUNE",result:"ZERO_DOMAIN",structuresChecked:checked,branchesConsumed:consumed,candidateCount:0,
        certifiedCausingTaskId:causing?.id??null,certifiedDecisionDepth:causingDepth,
        initialRepairableGroupCount:grouped.size,redundantDecisionDepths:redundant,irreducibleDecisionDepths:necessary,minimizationProbes:probes,
        conflictDecisionDepths:necessary,conflictTaskIds,conflictGroupCount:necessary.length,fixedContextParticipates,
        conflictClassification:necessary.length===0?"FIXED_CONTEXT_ZERO_DOMAIN":necessary.length===1?"SINGLE_DECISION_ZERO_DOMAIN":"MULTI_DECISION_ZERO_DOMAIN"};
    }
    const first=affected[0]!;return {...base,status:"PASS",result:"WITNESS",structuresChecked:checked,branchesConsumed:consumed,
      structureId:first.policy.id,workItemKey:technicalChainWorkItemKey(first.tasks[0]!.id),candidateCount:1};
  }
}

/** Compatibility one-shot API. Search executions should retain one prepared authority. */
export function probeTechnicalChainFutureReservations(problem:PlannerNextProblem,placed:readonly ScheduledTask[],added:readonly ScheduledTask[],allowance:number,
  decisionDepthForTask?:(taskId:string)=>number|null):TechnicalChainFutureReservationProbe {
  let remaining=allowance;const authority=new PreparedFutureTechnicalChainAuthority(problem,()=>remaining,count=>count<=remaining?(remaining-=count,true):false);
  return authority.assess(placed,added,decisionDepthForTask);
}
