import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { exactTaskStaticStartDomain } from "./placement";
import { transportTaskIds } from "./transportGrouping";

export interface ArrivalReadinessCertificate {
  cutoff:number;
  demand:number;
  maximumPossible:number;
  requiredParticipantIds:string[];
}

export interface ArrivalReadinessAssessment {
  feasible:boolean;
  checked:boolean;
  checks:number;
  prunes:number;
  logicalSlots:number;
  analyticallyDerivedSlots:number;
  firstCertificate:ArrivalReadinessCertificate|null;
}

const abstain=():ArrivalReadinessAssessment=>({feasible:true,checked:false,checks:0,prunes:0,
  logicalSlots:0,analyticallyDerivedSlots:0,firstCertificate:null});

/**
 * Necessary-only ARRIVAL capacity envelope. It derives anonymous post-IN positions from
 * hard static domains and the hard group capacity/gap; it never chooses starts or members.
 * If configured arrivals are not hard-equivalent, the proof abstains rather than combining
 * an unsafe pessimistic approximation.
 */
export function assessArrivalReadiness(problem:PlannerNextProblem,placed:readonly ScheduledTask[]):ArrivalReadinessAssessment{
  const policy=problem.transportPolicy?.arrival;
  if(!policy||!policy.taskIds.length)return abstain();
  const taskById=new Map(problem.tasks.map(task=>[task.id,task]));
  const arrivals=policy.taskIds.map(id=>taskById.get(id)).filter((task):task is Task=>Boolean(task));
  if(arrivals.length!==policy.taskIds.length||arrivals.some(task=>!task.participantId))return abstain();
  const participantIds=arrivals.map(task=>task.participantId!);
  if(new Set(participantIds).size!==participantIds.length)return abstain();
  const domains=arrivals.map(task=>exactTaskStaticStartDomain(problem,task).intervals);
  if(domains.some(intervals=>!intervals.length))return abstain(); // Existing transport proof owns empty domains.
  const signature=(task:Task,index:number)=>JSON.stringify({duration:task.duration,intervals:domains[index]});
  const firstSignature=signature(arrivals[0]!,0);
  if(arrivals.some((task,index)=>signature(task,index)!==firstSignature))return abstain();

  const duration=arrivals[0]!.duration,firstStart=domains[0]![0]!.start;
  const configuredParticipants=new Set(participantIds),transportIds=transportTaskIds(problem);
  const firstObligation=new Map<string,number>();
  for(const task of placed){
    if(transportIds.has(task.id)||!task.participantId||!configuredParticipants.has(task.participantId))continue;
    firstObligation.set(task.participantId,Math.min(firstObligation.get(task.participantId)??problem.day.end,task.start));
  }
  const cutoffs=[...new Set(firstObligation.values())].sort((a,b)=>a-b);
  let logicalSlots=0;
  for(const cutoff of cutoffs){
    const requiredParticipantIds=[...firstObligation].filter(([,start])=>start<=cutoff).map(([id])=>id).sort();
    const latestArrivalStart=cutoff-duration;
    const groups=latestArrivalStart<firstStart?0:policy.minGapMinutes===0?arrivals.length:
      Math.floor((latestArrivalStart-firstStart)/policy.minGapMinutes)+1;
    const maximumPossible=Math.min(arrivals.length,groups*policy.maximumGroupSize);
    logicalSlots+=maximumPossible;
    if(requiredParticipantIds.length>maximumPossible)return{feasible:false,checked:true,checks:1,prunes:1,
      logicalSlots,analyticallyDerivedSlots:logicalSlots,firstCertificate:{cutoff,demand:requiredParticipantIds.length,
        maximumPossible,requiredParticipantIds}};
  }
  return{feasible:true,checked:true,checks:1,prunes:0,logicalSlots,analyticallyDerivedSlots:logicalSlots,firstCertificate:null};
}
