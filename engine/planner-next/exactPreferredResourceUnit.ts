import type { PlannerNextProblem, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import type { ExactSearchLedger } from "./exactMainAndFeederCore";
import { generateExactSetupBlockCandidates } from "./exactSetupBlocks";
import { findCanonicalPerfectMatching } from "./macroScheduling";
import { canPlaceTask } from "./placement";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { evaluateResourcePresence } from "./resourcePresence";

export interface ExactPreferredResourceUnitCandidate {
  readonly tasks: readonly ScheduledTask[];
  readonly preparations: readonly ScheduledSetupPreparation[];
  readonly presence: readonly [blocks:number, span:number, idle:number];
}

/**
 * Builds anonymous contiguous spots around a complete setup geometry and only
 * then matches nominal resource tasks to those spots.  Consequently neither
 * side of the coupled unit can become an accepted macro prefix on its own.
 */
export function generateExactPreferredResourceUnitCandidates(args:{
  problem:PlannerNextProblem;resourceId:string;resourceTasks:readonly Task[];setupTasks:readonly Task[];
  placed:readonly ScheduledTask[];preparations:readonly ScheduledSetupPreparation[];
  meals:readonly ScheduledSpaceMeal[];ledger:ExactSearchLedger;
}):{outcome:"COMPLETE"|"BUDGET_EXHAUSTED";candidates:readonly ExactPreferredResourceUnitCandidate[];geometryCount:number;matchingAttempts:number;matchingSuccesses:number}{
  const {problem,resourceId,resourceTasks,setupTasks,placed,preparations,meals,ledger}=args;
  const mutableMeals=[...meals];
  const setup=generateExactSetupBlockCandidates(problem,[...setupTasks],[...placed],[...preparations],mutableMeals,ledger);
  let geometryCount=0,matchingAttempts=0,matchingSuccesses=0;
  const candidates:ExactPreferredResourceUnitCandidate[]=[];
  const duration=resourceTasks.reduce((sum,task)=>sum+task.duration,0);
  for(const structural of setup.candidates){
    const occupations=[...structural.tasks,...structural.preparations];
    const first=Math.min(...occupations.map(item=>item.start)),last=Math.max(...occupations.map(item=>item.end));
    for(const start of [first-duration,last]){
      geometryCount++;
      const slots=resourceTasks.map((_,index)=>`spot:${index}`);
      matchingAttempts++;
      const matching=findCanonicalPerfectMatching(slots,resourceTasks.map(task=>task.id),(taskId,slotId)=>{
        const task=resourceTasks.find(item=>item.id===taskId)!;
        const index=Number(slotId.slice(slotId.indexOf(":")+1));
        return canPlaceTask(problem,task,start+resourceTasks.slice(0,index).reduce((sum,item)=>sum+item.duration,0),
          [...placed,...structural.tasks],mutableMeals);
      });
      if(!matching)continue;
      const scheduled=[...matching].map(([slotId,taskId])=>{const task=resourceTasks.find(item=>item.id===taskId)!;
        const index=Number(slotId.slice(slotId.indexOf(":")+1));const spot=start+resourceTasks.slice(0,index).reduce((sum,item)=>sum+item.duration,0);
        return scoreAuxiliaryTask(problem,task,spot,[...placed,...structural.tasks]).scheduled;});
      const all=[...structural.tasks,...scheduled];
      if(scheduled.some(task=>!canPlaceTask(problem,task,task.start,[...placed,...all.filter(item=>item.id!==task.id)],mutableMeals)))continue;
      matchingSuccesses++;const resource=problem.resources.find(item=>item.id===resourceId)!;
      candidates.push({tasks:all,preparations:structural.preparations,presence:evaluateResourcePresence(resource,all).preferredLexicographicTuple});
    }
  }
  candidates.sort((a,b)=>a.presence[0]-b.presence[0]||a.presence[1]-b.presence[1]||a.presence[2]-b.presence[2]
    ||a.tasks.map(task=>`${task.id}@${task.start}`).sort().join("|").localeCompare(b.tasks.map(task=>`${task.id}@${task.start}`).sort().join("|")));
  return {outcome:setup.outcome,candidates,geometryCount,matchingAttempts,matchingSuccesses};
}
