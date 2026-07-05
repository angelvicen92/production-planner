import type { Candidate, Evidence, OperationalState } from "../contracts";
import { resolveORCMainZoneTarget } from "../state/mainZoneTargetResolver";
import { resolveORCMealSemantics } from "../state/mealSemanticsResolver";
import { configuredHardBreaks } from "../validation/protectedBreakScope";
import { resolveProductionWavePlannerConfig, type ProductionWavePlannerBlueprint } from "./productionWavePlannerBlueprint";
import { analyzeMacroMainZoneDependencyChain, type MacroMainZoneDependencyChainAnalysis } from "./macroMainZoneDependencyChainAnalyzer";

export const MACRO_MAIN_ZONE_BLOCK_RELAYOUT_STRATEGY = "MACRO_MAIN_ZONE_BLOCK_RELAYOUT" as const;
export const ORC_MACRO_MAIN_ZONE_BLOCK_RELAYOUT_CONTRACT_VERSION_ID238 = "ORC-MACRO-MAIN-ZONE-BLOCK-RELAYOUT-ID238" as const;
export const ORC_MACRO_MAIN_ZONE_DEPENDENCY_AWARE_RELAYOUT_CONTRACT_VERSION_ID240 = "ORC-MACRO-MAIN-ZONE-DEPENDENCY-AWARE-RELAYOUT-ID240" as const;

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
function minutesFromHH(value: string | null | undefined): number { return m(value) ?? 0; }
function makeCandidate(id:string, variant:string, state:OperationalState, gap:any, target:any, block:any[], support:any[], config:Rec, analysis?:MacroMainZoneDependencyChainAnalysis|null, startOverride?:number|null, mode?:string): Candidate {
  let cursor = startOverride ?? gap.a; const blockId = `${id}:block`; const assigns:any[]=[];
  for (const e of block) { assigns.push(assignment(e,cursor,"main-zone-pulled-block",blockId)); cursor += e.b-e.a; }
  const origStart = block[0]?.a ?? cursor; let sc = origStart;
  for (const e of support) { assigns.push(assignment(e,sc,"resource-displaced-support-block",`${id}:support`)); sc += e.b-e.a; }
  const movedMain = block.map(e=>e.taskId), movedSupport=support.map(e=>e.taskId); const affectedResources=uniq(assigns.flatMap(a=>a.resourceIds)); const affectedSpaces=uniq(assigns.map(a=>a.spaceId).filter((x:any)=>x!=null));
  const reduction = Math.max(0, Math.min(gap.b-gap.a, cursor-gap.a));
  const leftPre=uniq((analysis?.directPrerequisiteTaskIds??[]).filter((id:number)=>!movedSupport.includes(id)));
  return { id, state:{status:"draft", evidenceIds:[`evidence:orc-macro:${id}`], metadata:{}}, assignments:assigns, operationalValues:[], evidenceIds:[`evidence:orc-macro:${id}`], metadata:{ strategy:MACRO_MAIN_ZONE_BLOCK_RELAYOUT_STRATEGY, family:"macro-production-wave", type:"main-zone-block-relayout", variantType:variant, dependencyPreservationMode:mode??"prerequisites-already-before-new-block", dependencyAnalysis:analysis??null, dependencySafeStart:analysis?.earliestDependencySafeStart??hh(startOverride??gap.a), latestPrerequisiteEnd:analysis?.latestPrerequisiteEndBeforeCandidateStart??null, movedPrerequisiteTaskIds:uniq(support.map(e=>e.taskId).filter((id:number)=>(analysis?.directPrerequisiteTaskIds??[]).includes(id)||(analysis?.transitivePrerequisiteTaskIds??[]).includes(id))), leftInPlacePrerequisiteTaskIds:leftPre, dependencyUnsafeTaskIds:uniq(analysis?.dependencyUnsafeTaskIds??[]), dependencyBrokenPairsPrevented:analysis?.dependencyBrokenPairs??[], planningInfluence:"candidate-transformations", executesTransformations:true, readOnly:false, sourceOpportunityId:"production-wave-planner-id237", targetGapStart:hh(gap.a), targetGapEnd:hh(gap.b), targetGapMinutesBefore:gap.b-gap.a, expectedTargetGapMinutesAfter:Math.max(0,gap.b-gap.a-reduction), targetMainZoneId:target.mainZoneIds[0]??null, targetMainSpaceIds:target.mainSpaceIds, movedTaskIds:[...movedMain,...movedSupport], movedMainZoneTaskIds:movedMain, movedSupportTaskIds:movedSupport, affectedResourceIds:affectedResources, affectedSpaceIds:affectedSpaces, expectedVisibleMainZoneIdleReductionMinutes:reduction, coachSwitchCountBefore:coachSwitches(block), coachSwitchCountAfter:coachSwitches(block), usesFlexibleMealWindowAsProductiveTime:true, mealWindowTreatedAsHardStop:false, acceptedByMacroValueGateReason:"dependency_safe_main_zone_idle_reduction", configUsed:config, missingConfig:[], evidenceRefs:["productionWavePlanner.mainZoneBlockBlueprint","productionConceptAlignment.visibleMainZoneGaps","macroMainZoneBlockRelayout.dependencyAnalysis"] } };
}
function dependencyBlocker(analysis:MacroMainZoneDependencyChainAnalysis): string {
  if ((analysis.lockBlockedDependencyTaskIds??[]).length) return "macro-main-zone-locked-prerequisite";
  if ((analysis.inProgressOrDoneDependencyTaskIds??[]).length) return "macro-main-zone-in-progress-prerequisite";
  if ((analysis.dependencyAnalysisWarnings??[]).includes("macro-main-zone-prerequisite-chain-does-not-fit")) return "macro-main-zone-prerequisite-chain-does-not-fit";
  return "macro-main-zone-dependency-safe-window-not-found";
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
  const candidates: Candidate[]=[]; const analyses: MacroMainZoneDependencyChainAnalysis[]=[];
  for (const gap of gaps) {
    if (hardBreakBlocks(state,gap.a,gap.b)) { blockers.push("macro-main-zone-crosses-hard-break"); continue; }
    const after=main.filter(e=>e.a>=gap.b && !blocked(e,state));
    let block=after.slice(0, Math.min(config.macroMainZoneBlockMaxTasks, after.length));
    if (block.length < config.macroMainZoneBlockMinTasks) continue;
    if (block.length > config.macroMainZoneMaxMovedTasksPerCandidate) block=block.slice(0, config.macroMainZoneMaxMovedTasksPerCandidate);
    if (coachSwitches(block) > config.mainZoneMaxCoachSwitchesPerDay) { blockers.push("macro-main-zone-coach-switch-policy-exceeded"); continue; }
    const res=uniq(block.flatMap(e=>e.assignedResourceIds??[]));
    const naiveWinEnd = gap.a + block.reduce((sum,e)=>sum+e.b-e.a,0);
    let support = es.filter(e=>!main.some(me=>me.taskId===e.taskId)&&isWork(e)&&overlap(e.a,e.b,gap.a,naiveWinEnd)&&(e.assignedResourceIds??[]).some((r:number)=>res.includes(r))&&!blocked(e,state));
    const naiveAnalysis=analyzeMacroMainZoneDependencyChain({ operationalState:state, candidateMainZoneBlock:block, locks:state.locks, mainZoneTarget:target, targetGap:{a:gap.a,b:gap.b}, candidateStart:gap.a });
    analyses.push(naiveAnalysis);
    const prereqIds=new Set([...(naiveAnalysis.directPrerequisiteTaskIds??[]), ...(naiveAnalysis.transitivePrerequisiteTaskIds??[])]);
    if (support.some(e=>prereqIds.has(e.taskId))) {
      support=support.filter(e=>!prereqIds.has(e.taskId));
      blockers.push("macro-main-zone-prerequisite-would-move-after-dependent");
    }
    const safeStart=minutesFromHH(naiveAnalysis.earliestDependencySafeStart);
    const fullDur=block.reduce((sum,e)=>sum+e.b-e.a,0);
    if (safeStart < (block[0]?.a ?? Infinity) && safeStart + fullDur <= gap.b && safeStart < gap.b) {
      candidates.push(makeCandidate(`candidate:macro-main-zone-block-relayout:${candidates.length+1}`, "pull-dependency-ready-main-zone-block", state, gap, target, block, [], config, naiveAnalysis, safeStart, "prerequisites-already-before-new-block"));
    } else {
      const sub=(naiveAnalysis.dependencySafeSubBlocks??[]).find((sb:any)=>Array.isArray(sb.taskIds)&&sb.taskIds.length>=config.macroMainZoneBlockMinTasks);
      if (sub) {
        const set=new Set(sub.taskIds); const subBlock=block.filter(e=>set.has(e.taskId));
        candidates.push(makeCandidate(`candidate:macro-main-zone-block-relayout:${candidates.length+1}`, "dependency-preserving-split-main-zone-block", state, gap, target, subBlock, [], config, naiveAnalysis, safeStart, "split-to-dependency-safe-sub-block"));
      } else {
        blockers.push(dependencyBlocker(naiveAnalysis));
      }
    }
    // If prerequisites are movable and fit before the block, expose a deterministic chain variant.
    const movableIds=uniq((naiveAnalysis.movablePrerequisiteChains??[]).flatMap((c:any)=>c.taskIds??[]));
    const movableEntries=es.filter(e=>movableIds.includes(e.taskId) && !blocked(e,state));
    const chainDur=movableEntries.reduce((sum,e)=>sum+e.b-e.a,0);
    if (movableEntries.length && gap.a + chainDur + fullDur <= gap.b) {
      let cursor=gap.a; const chainAssignments=movableEntries.sort((a,b)=>a.a-b.a||a.taskId-b.taskId).map(e=>{ const a=assignment(e,cursor,"movable-prerequisite-chain",`candidate:macro-main-zone-block-relayout:${candidates.length+1}:prereq`); cursor += e.b-e.a; return a; });
      const c=makeCandidate(`candidate:macro-main-zone-block-relayout:${candidates.length+1}`, "pull-prerequisite-chain-then-main-zone-block", state, gap, target, block, [], config, naiveAnalysis, cursor, "move-prerequisite-chain-before-block");
      c.assignments=[...chainAssignments,...c.assignments]; c.metadata.movedTaskIds=uniq(c.assignments.map(a=>a.taskId)); c.metadata.movedPrerequisiteTaskIds=movableIds; candidates.push(c);
    }
    if (candidates.length >= config.macroMainZoneMaxCandidatesPerRun) break;
  }
  if (!candidates.length && analyses.length) {
    const a=analyses[0]; blockers.push(dependencyBlocker(a));
    const diag: Candidate={ id:"candidate:macro-main-zone-block-relayout:diagnostic", state:{status:"draft",evidenceIds:["evidence:orc-macro:diagnostic"],metadata:{readOnly:true}}, assignments:[], operationalValues:[], evidenceIds:["evidence:orc-macro:diagnostic"], metadata:{strategy:MACRO_MAIN_ZONE_BLOCK_RELAYOUT_STRATEGY, family:"macro-production-wave", type:"main-zone-block-relayout", variantType:"dependency-blocked-diagnostic-only", dependencyPreservationMode:"blocked-diagnostic-only", dependencyAnalysis:a, dependencySafeStart:a.earliestDependencySafeStart, latestPrerequisiteEnd:a.latestPrerequisiteEndBeforeCandidateStart, movedPrerequisiteTaskIds:[], leftInPlacePrerequisiteTaskIds:a.directPrerequisiteTaskIds, dependencyUnsafeTaskIds:a.dependencyUnsafeTaskIds, dependencyBrokenPairsPrevented:a.dependencyBrokenPairs, executesTransformations:false, readOnly:true, expectedVisibleMainZoneIdleReductionMinutes:0, targetGapStart:hh(gaps[0].a), targetGapEnd:hh(gaps[0].b), targetGapMinutesBefore:gaps[0].b-gaps[0].a } };
    candidates.push(diag);
  }
  candidates.sort((a,b)=>Number(b.metadata.expectedVisibleMainZoneIdleReductionMinutes??0)-Number(a.metadata.expectedVisibleMainZoneIdleReductionMinutes??0)||a.assignments.length-b.assignments.length||uniq(a.assignments.flatMap(x=>x.resourceIds)).length-uniq(b.assignments.flatMap(x=>x.resourceIds)).length||String(a.assignments[0]?.taskId??"").localeCompare(String(b.assignments[0]?.taskId??"")));
  return finish(candidates.filter(c=>c.metadata.variantType!=="dependency-blocked-diagnostic-only").slice(0, config.macroMainZoneMaxCandidatesPerRun), candidates.length?blockers:(blockers.length?blockers:["macro-main-zone-no-viable-window"]), args.createdAt, config, candidates);
}
function finish(candidates:Candidate[], blockers:string[], createdAt?:string|null, config?:Rec, allCandidates:Candidate[]=candidates): MacroMainZoneBlockRelayoutBuildResult { const evidence:Evidence[]=allCandidates.map(c=>({id:`evidence:orc-macro:${c.id}`,source:"orc-macro",kind:"macro-main-zone-block-relayout-candidate-generated",subjectId:c.id,createdAt:createdAt??null,data:{candidateId:c.id, assignmentCount:c.assignments.length, metadata:c.metadata, readOnly:true}})); const first=candidates[0]?.metadata??{}; return { candidates, evidence, summary:{ contractVersion:ORC_MACRO_MAIN_ZONE_BLOCK_RELAYOUT_CONTRACT_VERSION_ID238, executed:true, reason:candidates.length?"candidates_generated":"no_macro_main_zone_block_relayout_candidate", generatedCandidateCount:allCandidates.length, candidateIds:allCandidates.map(c=>c.id), targetGapStart:first.targetGapStart??null, targetGapEnd:first.targetGapEnd??null, targetGapMinutesBefore:first.targetGapMinutesBefore??null, candidateGenerationBlockers:uniq(blockers as any), dependencyAnalysisAvailable:allCandidates.some(c=>!!c.metadata.dependencyAnalysis), dependencySafeCandidateCount:allCandidates.filter(c=>c.metadata.dependencyPreservationMode!=="blocked-diagnostic-only").length, dependencyBlockedCandidateCount:allCandidates.filter(c=>c.metadata.dependencyPreservationMode==="blocked-diagnostic-only").length, dependencyBlockedReasons:uniq(blockers as any), dependencyBrokenPairsPrevented:allCandidates.flatMap(c=>(c.metadata.dependencyBrokenPairsPrevented as any[])??[]), configUsed:config??{}, readOnly:true } }; }
