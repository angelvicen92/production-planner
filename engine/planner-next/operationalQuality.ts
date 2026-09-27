import type { PlannerNextProblem, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask } from "./contracts";
import { spaceOccupations } from "./setupPreparation";

export interface OperationalQuality {
  preferredBlockCount:number;
  unitActiveSpan:number;
  preferredResourcePresenceSpans:Record<string,number>;
  preferredResourcePresenceSpanTotal:number;
  avoidableIdleMinutes:number;
  preferredResourceIdleMinutes:number;
  geometry:"compact"|"gapped";
}
const temporal=<T extends {id:string;start:number;end:number}>(items:T[])=>[...items].sort((a,b)=>a.start-b.start||a.end-b.end||a.id.localeCompare(b.id));
const span=(items:Array<{id:string;start:number;end:number}>)=>items.length===0?0:Math.max(...items.map(i=>i.end))-Math.min(...items.map(i=>i.start));
const idle=(items:Array<{id:string;start:number;end:number}>)=>{const ordered=temporal(items);return ordered.slice(1).reduce((sum,item,index)=>sum+Math.max(0,item.start-ordered[index]!.end),0);};

/** Quality is activated only by explicit PREFERRED policies; OFF contributes no compactness pressure. */
export function evaluateOperationalQuality(problem:PlannerNextProblem,tasks:ScheduledTask[],preparations:ScheduledSetupPreparation[]=[],
  meals:ScheduledSpaceMeal[]=[]):OperationalQuality{
  const preferredSpaces=problem.spaces.filter(s=>s.secondaryContinuity==="PREFERRED").map(s=>s.id).sort();
  const seed=new Set(tasks.filter(t=>preferredSpaces.includes(t.spaceId)).map(t=>t.id));
  const unitResourceIds=new Set(tasks.filter(t=>seed.has(t.id)).flatMap(t=>t.requiredResourceIds??[]));
  // Shared resources make all affected spaces one operational unit (for example a camera crossing two spaces).
  let changed=true;while(changed){changed=false;for(const task of tasks){if(seed.has(task.id))continue;
    if((task.requiredResourceIds??[]).some(id=>unitResourceIds.has(id))){seed.add(task.id);for(const id of task.requiredResourceIds??[])unitResourceIds.add(id);changed=true;}}}
  const unit=tasks.filter(t=>seed.has(t.id));
  const preferredResources=problem.resources.filter(r=>r.presenceConcentrationPolicy==="PREFERRED").sort((a,b)=>a.id.localeCompare(b.id));
  const spans:Record<string,number>={},resourceIdles:Record<string,number>={};
  for(const resource of preferredResources){const own=tasks.filter(t=>(t.requiredResourceIds??[]).includes(resource.id));spans[resource.id]=span(own);resourceIdles[resource.id]=idle(own);}
  let avoidable=0,blocks=0;
  for(const spaceId of preferredSpaces){const own=tasks.filter(t=>t.spaceId===spaceId);
    // Required preparations and scheduled meals occupy real time and therefore bridge, rather than create, avoidable idle.
    const occupations=spaceOccupations(own,preparations,spaceId,meals);avoidable+=idle(occupations);
    const ordered=temporal(own);if(ordered.length)blocks+=1+ordered.slice(1)
      .filter((item,index)=>item.setupFamilyId!==ordered[index]!.setupFamilyId).length;
  }
  const unitPreparations=preparations.filter(item=>preferredSpaces.includes(item.spaceId));
  return {preferredBlockCount:blocks,unitActiveSpan:span([...unit,...unitPreparations]),preferredResourcePresenceSpans:spans,
    preferredResourcePresenceSpanTotal:Object.values(spans).reduce((a,b)=>a+b,0),avoidableIdleMinutes:avoidable,
    preferredResourceIdleMinutes:Object.values(resourceIdles).reduce((a,b)=>a+b,0),geometry:avoidable===0?"compact":"gapped"};
}

export function compareOperationalQuality(candidate:OperationalQuality,incumbent:OperationalQuality):-1|0|1{
  const left=[candidate.preferredBlockCount,candidate.unitActiveSpan,candidate.preferredResourcePresenceSpanTotal,
    candidate.avoidableIdleMinutes,candidate.preferredResourceIdleMinutes];
  const right=[incumbent.preferredBlockCount,incumbent.unitActiveSpan,incumbent.preferredResourcePresenceSpanTotal,
    incumbent.avoidableIdleMinutes,incumbent.preferredResourceIdleMinutes];
  for(let i=0;i<left.length;i++){if(left[i]!<right[i]!)return 1;if(left[i]!>right[i]!)return -1;}return 0;
}
