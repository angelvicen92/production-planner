import type { Candidate, Evidence, OperationalState } from "../contracts";
import { resolveORCMainZoneTarget } from "../state/mainZoneTargetResolver";
import { resolveORCMealSemantics } from "../state/mealSemanticsResolver";
import { configuredHardBreaks } from "../validation/protectedBreakScope";
import { resolveProductionWavePlannerConfig, type ProductionWavePlannerBlueprint } from "./productionWavePlannerBlueprint";

export const MACRO_MAIN_ZONE_BLOCK_RELAYOUT_STRATEGY = "MACRO_MAIN_ZONE_BLOCK_RELAYOUT" as const;
export const ORC_MACRO_MAIN_ZONE_BLOCK_RELAYOUT_CONTRACT_VERSION_ID238 = "ORC-MACRO-MAIN-ZONE-BLOCK-RELAYOUT-ID238" as const;

type Rec = Record<string, any>;
const m = (t?: string | null) => { const p=String(t??"").split(":").map(Number); return p.length===2&&p.every(Number.isFinite)?p[0]*60+p[1]:null; };
const hh = (x:number) => `${String(Math.floor(x/60)).padStart(2,"0")}:${String(x%60).padStart(2,"0")}`;
const overlap = (a:number,b:number,c:number,d:number) => a < d && c < b;
const uniq = (xs:number[]) => [...new Set(xs.filter(Number.isFinite))].sort((a,b)=>a-b);
const PROTECTED = new Set(["done","in_progress"]);

export interface MacroMainZoneBlockRelayoutSummary extends Rec { readOnly: true; }
export interface MacroMainZoneBlockRelayoutBuildResult { candidates: Candidate[]; evidence: Evidence[]; summary: MacroMainZoneBlockRelayoutSummary; }

function pick(root:any, paths:string[]): any { for (const p of paths) { const v=p.split(".").reduce((c,k)=>c?.[k], root); if (v !== undefined && v !== null) return v; } }
function cfg(state:any) {
  const p=(k:string)=>[`constraints.optimizer.${k}`,`optimizerWeights.${k}`,`operationalPolicy.${k}`,`engineConfig.${k}`,`planningSettings.${k}`,`optimizer.${k}`];
  const wave = resolveProductionWavePlannerConfig(state);
  const n=(k:string,fb:number)=>{ const v=Number(pick(state,p(k))); return Number.isFinite(v)?v:fb; };
  const b=(k:string,fb:boolean)=>{ const v=pick(state,p(k)); return typeof v === "boolean" ? v : fb; };
  return { macroMainZoneBlockMinTasks:n("macroMainZoneBlockMinTasks",2), macroMainZoneBlockMaxTasks:n("macroMainZoneBlockMaxTasks",6), macroMainZoneMaxCandidatesPerRun:n("macroMainZoneMaxCandidatesPerRun",3), macroMainZoneMaxMovedTasksPerCandidate:n("macroMainZoneMaxMovedTasksPerCandidate",10), mainZoneMaxCoachSwitchesPerDay:n("mainZoneMaxCoachSwitchesPerDay",wave.values.mainZoneMaxCoachSwitchesPerDay), mainZoneMaxCoachSwitchesBeforeMeal:n("mainZoneMaxCoachSwitchesBeforeMeal",wave.values.mainZoneMaxCoachSwitchesBeforeMeal), mainZoneMaxCoachSwitchesAfterMeal:n("mainZoneMaxCoachSwitchesAfterMeal",wave.values.mainZoneMaxCoachSwitchesAfterMeal), allowFlexibleMealWindowProductiveWork:b("allowFlexibleMealWindowProductiveWork", true), readOnly:true };
}
function entries(state: OperationalState) { const tasks=new Map((state.tasks??[]).map((t:any)=>[t.id,t])); return (state.planning??[]).map((e:any)=>({...e,a:m(e.startPlanned),b:m(e.endPlanned),task:tasks.get(e.taskId)})).filter(e=>e.a!=null&&e.b!=null).sort((x,y)=>x.a-y.a||x.b-y.b||x.taskId-y.taskId); }
const isWork = (e:any) => e.countsAsWork !== false && !["transport_arrival","transport_departure","meal_break_placeholder","global_break_placeholder","non_operational_placeholder"].includes(e.operationalRole);
function coachSwitches(block:any[]) { const seq=block.map(e=>(e.assignedResourceIds??[])[0]).filter((x:any)=>x!=null); return seq.filter((r,i,a)=>i>0&&r!==a[i-1]).length; }
function blocked(e:any, state: OperationalState) { return PROTECTED.has(String(e.task?.status)) || (state.locks??[]).some((l:any)=>l.taskId===e.taskId); }
function hardBreakBlocks(state: OperationalState, start:number, end:number) { const meal = resolveORCMealSemantics(state); const hardMealKeys = new Set([...(meal.globalHardBreaks??[]), ...(meal.actualMealBreaks??[])].map((w:any)=>`${w.start}|${w.end}`)); return configuredHardBreaks(state).some((br:any)=>{ if (br.kind === "meal" && !hardMealKeys.has(`${br.start}|${br.end}`)) return false; const a=m(br.start), b=m(br.end); return a!=null&&b!=null&&overlap(start,end,a,b); }); }
function assignment(e:any, toStart:number, role:string, blockId:string) { const dur=e.b-e.a; return { taskId:e.taskId, fromStart:e.startPlanned, fromEnd:e.endPlanned, toStart:hh(toStart), toEnd:hh(toStart+dur), startPlanned:hh(toStart), endPlanned:hh(toStart+dur), assignedSpace:e.spaceId??null, spaceId:e.spaceId??null, assignedResources:[...(e.assignedResourceIds??[])], resourceIds:[...(e.assignedResourceIds??[])], moveSource:"macro-main-zone-block-relayout", blockId, blockRole: role }; }
function makeCandidate(id:string, variant:string, state:OperationalState, gap:any, target:any, block:any[], support:any[], config:Rec): Candidate {
  let cursor = gap.a; const blockId = `${id}:block`; const assigns:any[]=[];
  for (const e of block) { assigns.push(assignment(e,cursor,"main-zone-pulled-block",blockId)); cursor += e.b-e.a; }
  const origStart = block[0].a; let sc = origStart;
  for (const e of support) { assigns.push(assignment(e,sc,"resource-displaced-support-block",`${id}:support`)); sc += e.b-e.a; }
  const movedMain = block.map(e=>e.taskId), movedSupport=support.map(e=>e.taskId); const affectedResources=uniq(assigns.flatMap(a=>a.resourceIds)); const affectedSpaces=uniq(assigns.map(a=>a.spaceId).filter((x:any)=>x!=null));
  const reduction = Math.min(gap.b-gap.a, cursor-gap.a);
  return { id, state:{status:"draft", evidenceIds:[`evidence:orc-macro:${id}`], metadata:{}}, assignments:assigns, operationalValues:[], evidenceIds:[`evidence:orc-macro:${id}`], metadata:{ strategy:MACRO_MAIN_ZONE_BLOCK_RELAYOUT_STRATEGY, family:"macro-production-wave", type:"main-zone-block-relayout", variantType:variant, planningInfluence:"candidate-transformations", executesTransformations:true, readOnly:false, sourceOpportunityId:"production-wave-planner-id237", targetGapStart:hh(gap.a), targetGapEnd:hh(gap.b), targetGapMinutesBefore:gap.b-gap.a, expectedTargetGapMinutesAfter:Math.max(0,gap.b-gap.a-reduction), targetMainZoneId:target.mainZoneIds[0]??null, targetMainSpaceIds:target.mainSpaceIds, movedTaskIds:[...movedMain,...movedSupport], movedMainZoneTaskIds:movedMain, movedSupportTaskIds:movedSupport, affectedResourceIds:affectedResources, affectedSpaceIds:affectedSpaces, expectedVisibleMainZoneIdleReductionMinutes:reduction, coachSwitchCountBefore:coachSwitches(block), coachSwitchCountAfter:coachSwitches(block), usesFlexibleMealWindowAsProductiveTime:true, mealWindowTreatedAsHardStop:false, configUsed:config, missingConfig:[], evidenceRefs:["productionWavePlanner.mainZoneBlockBlueprint","productionConceptAlignment.visibleMainZoneGaps"] } };
}

export function buildMacroMainZoneBlockRelayoutCandidates(args: { operationalState?: OperationalState | null; productionWavePlanner?: ProductionWavePlannerBlueprint | Rec | null; productionConceptAlignment?: Rec | null; baseHardFeasible?: boolean | null; createdAt?: string | null }): MacroMainZoneBlockRelayoutBuildResult {
  const state=args.operationalState; const blockers:string[]=[]; const config=cfg(state??{});
  if (!state) blockers.push("operational_state_missing");
  if (args.baseHardFeasible === false) blockers.push("base_plan_hard_infeasible");
  if ((args.productionWavePlanner as any)?.candidateReadiness?.recommendedCandidateFamily !== "macro_main_zone_block_relayout") blockers.push("recommended_candidate_family_not_macro_main_zone_block_relayout");
  const target = state ? resolveORCMainZoneTarget(state as any) : { configured:false, mainSpaceIds:[], mainZoneIds:[] } as any;
  if (!target.configured) blockers.push("main_zone_not_configured");
  if (!state || blockers.length) return finish([], blockers, args.createdAt, config);
  const es=entries(state); const main=es.filter(e=>isWork(e)&&((e.spaceId!=null&&target.mainSpaceIds.includes(e.spaceId))||(e.zoneId!=null&&target.mainZoneIds.includes(e.zoneId))));
  const gaps = main.slice(1).flatMap((e,i)=> e.a>main[i].b ? [{a:main[i].b,b:e.a,prev:main[i],next:e}] : []);
  if (!gaps.length) return finish([], ["no_visible_main_zone_gap"], args.createdAt, config);
  const candidates: Candidate[]=[];
  for (const gap of gaps) {
    if (hardBreakBlocks(state,gap.a,gap.b)) { blockers.push("macro-main-zone-crosses-hard-break"); continue; }
    const after=main.filter(e=>e.a>=gap.b && !blocked(e,state));
    let block=after.slice(0, Math.min(config.macroMainZoneBlockMaxTasks, after.length));
    while (block.length && block.reduce((s,e)=>s+e.b-e.a,0) > gap.b-gap.a) block=block.slice(0,-1);
    if (block.length < config.macroMainZoneBlockMinTasks) continue;
    if (block.length > config.macroMainZoneMaxMovedTasksPerCandidate) block=block.slice(0, config.macroMainZoneMaxMovedTasksPerCandidate);
    if (coachSwitches(block) > config.mainZoneMaxCoachSwitchesPerDay) { blockers.push("macro-main-zone-coach-switch-policy-exceeded"); continue; }
    const winEnd = gap.a + block.reduce((s,e)=>s+e.b-e.a,0); const res=uniq(block.flatMap(e=>e.assignedResourceIds??[]));
    const support = es.filter(e=>!main.some(me=>me.taskId===e.taskId)&&isWork(e)&&overlap(e.a,e.b,gap.a,winEnd)&&(e.assignedResourceIds??[]).some((r:number)=>res.includes(r))&&!blocked(e,state));
    candidates.push(makeCandidate(`candidate:macro-main-zone-block-relayout:${candidates.length+1}`, support.length?"pull-next-main-zone-block-with-resource-block-displacement":"pull-next-main-zone-block-into-gap", state, gap, target, block, support, config));
    if (candidates.length >= config.macroMainZoneMaxCandidatesPerRun) break;
  }
  candidates.sort((a,b)=>Number(b.metadata.expectedVisibleMainZoneIdleReductionMinutes??0)-Number(a.metadata.expectedVisibleMainZoneIdleReductionMinutes??0)||a.assignments.length-b.assignments.length||uniq(a.assignments.flatMap(x=>x.resourceIds)).length-uniq(b.assignments.flatMap(x=>x.resourceIds)).length||String(a.assignments[0]?.taskId??"").localeCompare(String(b.assignments[0]?.taskId??"")));
  return finish(candidates.slice(0, config.macroMainZoneMaxCandidatesPerRun), candidates.length?[]:(blockers.length?blockers:["macro-main-zone-no-viable-window"]), args.createdAt, config);
}
function finish(candidates:Candidate[], blockers:string[], createdAt?:string|null, config?:Rec): MacroMainZoneBlockRelayoutBuildResult { const evidence:Evidence[]=candidates.map(c=>({id:`evidence:orc-macro:${c.id}`,source:"orc-macro",kind:"macro-main-zone-block-relayout-candidate-generated",subjectId:c.id,createdAt:createdAt??null,data:{candidateId:c.id, assignmentCount:c.assignments.length, metadata:c.metadata, readOnly:true}})); const first=candidates[0]?.metadata??{}; return { candidates, evidence, summary:{ contractVersion:ORC_MACRO_MAIN_ZONE_BLOCK_RELAYOUT_CONTRACT_VERSION_ID238, executed:true, reason:candidates.length?"candidates_generated":"no_macro_main_zone_block_relayout_candidate", generatedCandidateCount:candidates.length, candidateIds:candidates.map(c=>c.id), targetGapStart:first.targetGapStart??null, targetGapEnd:first.targetGapEnd??null, targetGapMinutesBefore:first.targetGapMinutesBefore??null, candidateGenerationBlockers:blockers, configUsed:config??{}, readOnly:true } }; }
