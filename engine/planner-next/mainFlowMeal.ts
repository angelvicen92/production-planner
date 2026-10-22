import type { PlannerNextProblem, ScheduledOperationalMeal, ScheduledSpaceMeal, ScheduledTask, SpaceMealPolicy } from "./contracts";
import { createScheduledSpaceMeal } from "./spaceMeals";
export interface MainFlowMealAuthority extends SpaceMealPolicy { source:"SPACE_MEAL_POLICY"|"OPERATIONAL_MEAL_POLICY"|"CANONICALIZED"; sourceIds:string[] }
export interface MainFlowTimeline { key:string; slots:number[]; meal:ScheduledSpaceMeal; mealAuthority:MainFlowMealAuthority; splitIndex:number; morningTaskCount:number; afternoonTaskCount:number; strategyRank:number }
const samePolicy=(a:SpaceMealPolicy,b:SpaceMealPolicy)=>a.duration===b.duration&&a.window.start===b.window.start&&a.window.end===b.window.end;
/** Resolves the one effective Main-space meal without manufacturing a second obligation. */
export function mainFlowMealPolicy(p:PlannerNextProblem):MainFlowMealAuthority|undefined {
  if(!p.mainFlow)return undefined;
  const mainFlow=p.mainFlow;
  const spacePolicy=p.spaces.find(s=>s.id===mainFlow.spaceId)?.mealPolicy;
  const operational=(p.operationalMealPolicies??[]).filter(policy=>policy.spaceIds.includes(mainFlow.spaceId));
  const policies=[...(spacePolicy?[spacePolicy]:[]),...operational];
  if(!policies.length)return undefined;
  if(policies.some(policy=>!samePolicy(policies[0]!,policy)))throw new Error("INCOMPATIBLE_MAIN_FLOW_MEAL_POLICIES");
  return {window:{...policies[0]!.window},duration:policies[0]!.duration,
    source:spacePolicy?(operational.length?"CANONICALIZED":"SPACE_MEAL_POLICY"):"OPERATIONAL_MEAL_POLICY",
    sourceIds:[...(spacePolicy?[mainFlow.spaceId]:[]),...operational.map(policy=>policy.id)].sort()};
}
export const hasMainFlowMeal=(p:PlannerNextProblem)=>mainFlowMealPolicy(p)!==undefined;
export const mainFlowMealAligned=(p:PlannerNextProblem)=>{const x=mainFlowMealPolicy(p),m=p.protectedMeal;if(!x)return false;return m?x.window.start===m.start&&x.window.end===m.end&&x.duration===m.end-m.start&&p.mainFlow!.preferredEnd===m.start:x.window.start<=p.mainFlow!.preferredEnd&&p.mainFlow!.preferredEnd+x.duration<=x.window.end};
export const createMainFlowMeal=(p:PlannerNextProblem)=>{const policy=mainFlowMealPolicy(p)!;const latest=policy.window.end-policy.duration;const start=Math.min(Math.max(p.mainFlow!.preferredEnd,policy.window.start),latest);return createScheduledSpaceMeal(p.mainFlow!.spaceId,start,policy.duration)};
/** Materializes the operational side of the effective Main meal at the already-selected structural start. */
export const materializeMainFlowOperationalMeals=(p:PlannerNextProblem,selectedMealStart:number):ScheduledOperationalMeal[]=>{
  const authority=mainFlowMealPolicy(p);if(!authority)return [];
  return (p.operationalMealPolicies??[]).filter(policy=>authority.sourceIds.includes(policy.id))
    .sort((left,right)=>left.id.localeCompare(right.id)).map(policy=>({
    id:policy.id,resourceIds:[...policy.resourceIds],spaceIds:[...policy.spaceIds],duration:authority.duration,
    start:selectedMealStart,end:selectedMealStart+authority.duration,
  }));
};
/** Deterministic repair frontier: preference first, then every other complete slot. */
export const mainFlowMealStarts=(p:PlannerNextProblem)=>{const policy=mainFlowMealPolicy(p)!;
  const preferred=createMainFlowMeal(p).start,starts:number[]=[];
  for(let start=policy.window.start;start+policy.duration<=policy.window.end;start+=5)starts.push(start);
  return [preferred,...starts.filter(start=>start!==preferred)];};
export const blockBoundaries=(pattern:string[])=>pattern.slice(1).flatMap((key,i)=>key!==pattern[i]?[i+1]:[]);
export const isBlockBoundary=(pattern:string[],cut:number)=>cut>0&&cut<pattern.length&&pattern[cut-1]!==pattern[cut];
export const preferredCandidateCuts=(pattern:string[])=>[pattern.length,...blockBoundaries(pattern).sort((a,b)=>b-a)];
export const fallbackCandidateCuts=(pattern:string[])=>{const preferred=new Set(preferredCandidateCuts(pattern));return pattern.map((_,i)=>i).filter(cut=>cut>0&&!preferred.has(cut))};
export const candidateCuts=(pattern:string[])=>[...preferredCandidateCuts(pattern),...fallbackCandidateCuts(pattern)];
export function buildTimeline(p:PlannerNextProblem,pattern:string[],duration:number,cut:number,mealStart=createMainFlowMeal(p).start):MainFlowTimeline{const mealAuthority=mainFlowMealPolicy(p)!;const meal=createScheduledSpaceMeal(p.mainFlow!.spaceId,mealStart,mealAuthority.duration),slots:number[]=[];for(let i=0;i<cut;i++)slots.push(meal.start-cut*duration+i*duration);for(let i=cut;i<pattern.length;i++)slots.push(meal.end+(i-cut)*duration);const key=`${cut===pattern.length?"ALL_MORNING":"SPLIT"}|${cut}|MEAL:${mealStart}|${pattern.join("|")}|${slots.join("|")}`;return{key,slots,meal,mealAuthority,splitIndex:cut,morningTaskCount:cut,afternoonTaskCount:pattern.length-cut,strategyRank:cut===pattern.length?0:isBlockBoundary(pattern,cut)?1:2}}
/** Logical runs are never split by an authorized meal interruption. */
export function mainFlowMealBlockDistribution(tasks:readonly ScheduledTask[],meal:{start:number;end:number}|undefined) {
  const mains=tasks.filter(t=>t.kind==="main").sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
  const blocks:Array<{key:string|undefined;start:number;end:number}>=[];
  for(const task of mains){const key=task.blockKey??task.coachId,last=blocks.at(-1);
    if(last&&last.key===key)last.end=Math.max(last.end,task.end);else blocks.push({key,start:task.start,end:task.end});}
  return {total:blocks.length,mealStart:meal?.start??null,mealEnd:meal?.end??null,
    blocksBeforeMeal:meal?blocks.filter(b=>b.end<=meal.start).length:null,
    blocksAfterMeal:meal?blocks.filter(b=>b.start>=meal.end).length:null,
    blockSpansMeal:meal?blocks.some(b=>b.start<meal.end&&b.end>meal.start):false};
}
export function preferredMealSplitCuts(p:Readonly<PlannerNextProblem>,pattern:readonly string[]):number[] {
  const pref=p.mainFlow?.mealSplitPreference;if(!pref)return [];
  const runs=(xs:readonly string[])=>xs.reduce((n,k,i)=>n+(i===0||k!==xs[i-1]?1:0),0);
  return [0,...candidateCuts([...pattern])].filter(cut=>(cut===0||cut===pattern.length||isBlockBoundary([...pattern],cut))
    &&runs(pattern.slice(0,cut))===pref.beforeMealBlocks&&runs(pattern.slice(cut))===pref.afterMealBlocks);
}
const configuredMealCandidateCuts=(p:Readonly<PlannerNextProblem>,pattern:string[])=>
  mainFlowMealPolicy(p)?.source==="OPERATIONAL_MEAL_POLICY"?[...candidateCuts(pattern),0]:candidateCuts(pattern);
export const mainFlowMealCutTiers=(p:Readonly<PlannerNextProblem>)=>p.mainFlow?.mealSplitPreference
  ? [(pattern:string[])=>preferredMealSplitCuts(p,pattern),
    (pattern:string[])=>configuredMealCandidateCuts(p,pattern).filter(cut=>!preferredMealSplitCuts(p,pattern).includes(cut))]
  : [preferredCandidateCuts,fallbackCandidateCuts];
export const timelineSignature=(x:MainFlowTimeline)=>x.key;
export const orderTimelines=(xs:MainFlowTimeline[])=>[...xs].sort((a,b)=>a.strategyRank-b.strategyRank||b.splitIndex-a.splitIndex||a.key.localeCompare(b.key));
export const combineMainFlowOccupations=(tasks:ScheduledTask[],meal:ScheduledSpaceMeal)=>[...tasks,meal].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
