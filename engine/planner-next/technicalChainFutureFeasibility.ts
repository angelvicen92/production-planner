import type { PlannerNextProblem, ScheduledTask, Task, TechnicalChainPolicy, Window as Interval } from "./contracts";
import { canPlaceTask, exactTaskStartDomain } from "./placement";
import { createTechnicalChainExplorer, technicalChainProductiveDuration, technicalChainSignature, technicalChainWorkItemKey, type TechnicalChainCandidate, type TechnicalChainExplorer } from "./technicalChains";

export type TechnicalChainFutureReservationStatus = "PASS" | "PRUNE" | "ABSTAIN";
export interface TechnicalChainFutureReservationProbe {
  status: TechnicalChainFutureReservationStatus; affectedStructures:number; structuresChecked:number; branchesConsumed:number;
  structureId:string|null; workItemKey:string|null; candidateCount:number; certifiedCausingTaskId:string|null;
  certifiedDecisionDepth:number|null; initialRepairableGroupCount:number; redundantDecisionDepths:number[];
  irreducibleDecisionDepths:number[]; minimizationProbes:number; result:"WITNESS"|"ZERO_DOMAIN"|"BUDGET_EXHAUSTED"|"NOT_AFFECTED";
  witnessesBefore:number; witnessesAfter:number; witnessReuseCheck:boolean; witnessReuseHit:boolean;
}

export interface PreparedFutureStructureEvidence {
  structureId:string; effectiveWindow:Interval[]; productiveDuration:number; slack:number; slackRatio:number; loadRatio:number;
  futureOccupancySupport:Record<string,Interval[]>; initialRootOrderDomain:number;
  derivationMode:"ROOT_PHASE_GEOMETRY"|"EXACT_CANDIDATES"; supportComplete:boolean; candidateCountUsedToDeriveSupport:number;
}
export interface PreparedFutureTechnicalChainEvidence {
  preparedFutureStructures:PreparedFutureStructureEvidence[]; witnessReuseChecks:number; witnessReuseHits:number;
  witnessInvalidations:number; witnessRepairs:number; exactRootOrderEvaluations:number; ledgeredPermutationBranches:number;
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
  readonly evidence:PreparedFutureTechnicalChainEvidence;
  constructor(private readonly problem:PlannerNextProblem, private readonly allowance:()=>number=()=>Number.MAX_SAFE_INTEGER,
    private readonly consume:(count:number)=>boolean=()=>true, fixed:readonly ScheduledTask[]=[]){
    this.structures=[...(problem.analyticalFutureTechnicalChains??[])].sort((a,b)=>a.policy.id.localeCompare(b.policy.id)).map(source=>{
      const byId=new Map(source.tasks.map(task=>[task.id,task]));
      const tasks=source.policy.orderedTaskIds.map(id=>byId.get(id)).filter((x):x is Task=>!!x);
      const local={...problem,tasks:[...problem.tasks,...source.tasks],technicalChains:[source.policy]};
      const duration=technicalChainProductiveDuration(tasks);
      const rootDomain=tasks[0]?exactTaskStartDomain(local,tasks[0], [...fixed]):{eligibleStartCount:0,intervals:[],starts:function*(){}};
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
      const roots=[...rootDomain.starts()];
      for(const task of tasks){const offset=phaseByTask.get(task.id)??{before:0,within:0};
        const intervals=roots.map(root=>({start:root+offset.before,end:root+offset.before+offset.within+task.duration}));
        add(task.participantId,intervals);add(task.coachId,intervals);add(task.itinerantUnitId,intervals);for(const id of task.requiredResourceIds??[])add(id,intervals);}
      return {policy:source.policy,tasks,problem:local,explorer:createTechnicalChainExplorer(local,tasks,[...fixed],Number.MAX_SAFE_INTEGER),
        candidates:[],signatures:new Set<string>(),lastWitness:null,exhausted:false,support,
        evidence:{structureId:source.policy.id,effectiveWindow,productiveDuration:duration,slack,
          slackRatio:windowMinutes?slack/windowMinutes:0,loadRatio:windowMinutes?duration/windowMinutes:1,
          futureOccupancySupport:Object.fromEntries([...support].map(([id,x])=>[id,x])),initialRootOrderDomain:rootDomain.eligibleStartCount,
          derivationMode:"ROOT_PHASE_GEOMETRY",supportComplete:false,candidateCountUsedToDeriveSupport:0}};
    });
    this.evidence={preparedFutureStructures:this.structures.map(x=>x.evidence),witnessReuseChecks:0,witnessReuseHits:0,
      witnessInvalidations:0,witnessRepairs:0,exactRootOrderEvaluations:0,ledgeredPermutationBranches:0};
  }
  occupancySupport(memberId:string):readonly Interval[]{return union(this.structures.flatMap(x=>x.support.get(memberId)??[]));}
  intrusion(tasks:readonly ScheduledTask[]):number{return tasks.reduce((sum,task)=>sum+[task.participantId,task.coachId,task.itinerantUnitId,...(task.requiredResourceIds??[])]
    .flatMap(id=>id?this.occupancySupport(id):[]).reduce((n,x)=>n+(overlap(task,x)?Math.min(task.end,x.end)-Math.max(task.start,x.start):0),0),0);}
  private valid(structure:PreparedStructure,candidate:TechnicalChainCandidate,placed:readonly ScheduledTask[]):boolean{
    const own=new Set(candidate.tasks.map(x=>x.id));let prior=[...placed.filter(x=>!own.has(x.id))];
    for(const task of candidate.tasks){const source=structure.problem.tasks.find(x=>x.id===task.id)!;if(!canPlaceTask(structure.problem,source,task.start,prior))return false;prior=[...prior,task];}return true;
  }
  assess(placed:readonly ScheduledTask[],added:readonly ScheduledTask[],decisionDepthForTask?:(id:string)=>number|null):TechnicalChainFutureReservationProbe{
    const affected=this.structures.filter(x=>x.tasks.some(member=>added.some(task=>sharesHardAuthority(member,task))));
    const base={affectedStructures:affected.length,structuresChecked:0,branchesConsumed:0,structureId:null,workItemKey:null,candidateCount:0,
      certifiedCausingTaskId:null,certifiedDecisionDepth:null,initialRepairableGroupCount:0,redundantDecisionDepths:[] as number[],irreducibleDecisionDepths:[] as number[],minimizationProbes:0,
      witnessesBefore:0,witnessesAfter:0,witnessReuseCheck:false,witnessReuseHit:false};
    if(!affected.length)return {...base,status:"PASS",result:"NOT_AFFECTED"};
    let consumed=0,checked=0;
    for(const structure of affected){checked++;const before=structure.candidates.filter(x=>this.valid(structure,x,placed.filter(p=>!added.some(a=>a.id===p.id)))).length;
      let witness:TechnicalChainCandidate|null=null;this.evidence.witnessReuseChecks++;base.witnessReuseCheck=true;
      if(structure.lastWitness&&this.valid(structure,structure.lastWitness,placed)){witness=structure.lastWitness;this.evidence.witnessReuseHits++;base.witnessReuseHit=true;}
      if(!witness){if(structure.lastWitness)this.evidence.witnessInvalidations++;witness=structure.candidates.find(x=>this.valid(structure,x,placed))??null;if(witness)this.evidence.witnessRepairs++;}
      while(!witness&&!structure.exhausted){if(this.allowance()<=0)return {...base,status:"ABSTAIN",result:"BUDGET_EXHAUSTED",structuresChecked:checked,branchesConsumed:consumed};
        const prior=structure.explorer.consumed,candidate=structure.explorer.nextCandidate(),delta=structure.explorer.consumed-prior;
        if(delta&&!this.consume(delta))return {...base,status:"ABSTAIN",result:"BUDGET_EXHAUSTED",structuresChecked:checked,branchesConsumed:consumed};
        consumed+=delta;this.evidence.exactRootOrderEvaluations+=delta;this.evidence.ledgeredPermutationBranches+=delta;
        if(!candidate){structure.exhausted=!structure.explorer.exhausted;if(structure.explorer.exhausted)return {...base,status:"ABSTAIN",result:"BUDGET_EXHAUSTED",structuresChecked:checked,branchesConsumed:consumed};break;}
        const signature=technicalChainSignature(candidate.tasks);if(!structure.signatures.has(signature)){structure.signatures.add(signature);structure.candidates.push(candidate);}
        if(this.valid(structure,candidate,placed))witness=candidate;
      }
      const identity={structureId:structure.policy.id,workItemKey:technicalChainWorkItemKey(structure.tasks[0]!.id),witnessesBefore:before,
        witnessesAfter:structure.candidates.filter(x=>this.valid(structure,x,placed)).length};
      if(witness){structure.lastWitness=witness;continue;}
      const relevant=added.filter(task=>structure.tasks.some(member=>sharesHardAuthority(member,task))).sort((a,b)=>a.id.localeCompare(b.id));
      const grouped=new Map<number,ScheduledTask[]>();for(const task of placed){if(!structure.tasks.some(member=>sharesHardAuthority(member,task)))continue;
        const depth=decisionDepthForTask?.(task.id)??(relevant.some(x=>x.id===task.id)?Number.MAX_SAFE_INTEGER:null);if(depth!==null)grouped.set(depth,[...(grouped.get(depth)??[]),task]);}
      let working=[...placed],probes=0;const redundant:number[]=[],necessary:number[]=[];
      for(const [depth,tasks] of [...grouped].sort(([a],[b])=>a-b)){const ids=new Set(tasks.map(x=>x.id)),without=working.filter(x=>!ids.has(x.id));probes++;
        if(structure.candidates.some(x=>this.valid(structure,x,without))){necessary.push(depth);}else{working=without;redundant.push(depth);}}
      const causingDepth=necessary.length===1?necessary[0]:null;
      const causing=causingDepth===null?undefined:(grouped.get(causingDepth)??[]).sort((a,b)=>a.id.localeCompare(b.id))[0];
      return {...base,...identity,status:"PRUNE",result:"ZERO_DOMAIN",structuresChecked:checked,branchesConsumed:consumed,candidateCount:0,
        certifiedCausingTaskId:causing?.id??null,certifiedDecisionDepth:causingDepth,
        initialRepairableGroupCount:grouped.size,redundantDecisionDepths:redundant,irreducibleDecisionDepths:necessary,minimizationProbes:probes};
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
