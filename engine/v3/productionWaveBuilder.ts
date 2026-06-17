import type { EngineOutput, TaskInput } from "../types";
import type { EngineV3Input } from "./types";
import { validateHardConstraints } from "./hardValidation";
import { toMinutes } from "./metrics";
import { scoreCandidateSolution, type CandidateSolutionScore } from "./solutionScoring";
import { validateOptimizedCandidate } from "./validateCandidate";
import { isMealTask } from "./mealSemantics";
import { detectPrimaryStageContext } from "./segmentSolver";

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const normalize = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const uniq = <T>(values: T[]) => [...new Set(values)];

export interface ProductionWaveMetrics {
  maxCoachGapMinutes: number; coachSplitDayPenalty: number; talentIdlePenalty: number;
  makespan: number; mainStageGapMinutes: number; hardConstraintViolations: number; plannedTasks: number;
}
export interface ProductionWaveCandidateMetric extends ProductionWaveMetrics { movedTaskIds: number[]; movedTalentNames: string[]; selected: boolean }
export interface ProductionWaveMeta {
  productionWaveAttempted: boolean; productionWaveAnchorsFound: number; productionWaveUnanchoredTalents: string[];
  productionWaveInvocationPoint: string; productionWaveInputTaskCount: number; productionWaveInputPlannedTasks: number;
  productionWaveInputMainStageTasks: number; productionWaveInputCoachCount: number; productionWaveInputTalentCount: number;
  productionWaveAnchorDetectionAttempted: boolean; productionWaveAnchorDetectionReason: string;
  productionWaveAnchorDetectionRejectedReasons: string[]; productionWaveAnchorCandidatesInspected: number;
  productionWaveAnchorCandidateSamples: Array<Record<string, unknown>>;
  productionWaveAnchorSpaceName?: string; productionWaveAnchorWindowStart?: string; productionWaveAnchorWindowEnd?: string;
  productionWaveCandidatesGenerated: number; productionWaveAccepted: boolean; productionWaveReason: string;
  productionWaveRejectedReasons: string[]; productionWaveCandidateMetrics: ProductionWaveCandidateMetric[];
  productionWaveBestBefore: ProductionWaveMetrics; productionWaveBestAfter: ProductionWaveMetrics;
  productionWaveMovedTaskIds: number[]; productionWaveMovedTalentNames: string[];
  productionWaveCoachGapBefore: number; productionWaveCoachGapAfter: number;
  productionWaveMakespanBefore: number; productionWaveMakespanAfter: number;
  productionWaveFeasibleButNotSelected: boolean; productionWaveComparison: Record<string, unknown>;
}
const compact = (s: CandidateSolutionScore): ProductionWaveMetrics => ({ maxCoachGapMinutes: s.maxCoachGapMinutes, coachSplitDayPenalty: s.coachSplitDayPenalty, talentIdlePenalty: s.talentIdlePenalty, makespan: s.makespan, mainStageGapMinutes: s.mainStageGapMinutes, hardConstraintViolations: s.hardConstraintViolations, plannedTasks: s.plannedTasks });
const isFixed = (input: EngineV3Input, task: TaskInput) => ["done", "in_progress", "cancelled"].includes(normalize(task.status)) || Boolean((task as any).isManualBlock) || (input.locks ?? []).some((l) => Number(l.taskId) === Number(task.id));
const isOut = (input: EngineV3Input, task: TaskInput) => {
  const label = normalize(task.templateName ?? input.taskTemplateNameById?.[Number(task.templateId)]);
  return label === normalize(input.departureTaskTemplateName) || /\b(out|salida|regreso|return)\b/.test(label);
};

export const generateProductionWaveCandidates = (input: EngineV3Input, baseline: EngineOutput): { candidates: EngineOutput[]; meta: ProductionWaveMeta } => {
  const started = Date.now(); const baseScore = scoreCandidateSolution(input, baseline); const taskById = new Map((input.tasks ?? []).map(t => [Number(t.id), t]));
  const plannedById = new Map((baseline.plannedTasks ?? []).map(p => [Number(p.taskId), p])); const mainZone = Number(input.optimizerMainZoneId);
  const primaryStageContext = detectPrimaryStageContext(input, baseline);
  const inspected = primaryStageContext.anchorCandidates.length ? primaryStageContext.anchorCandidates : (input.tasks ?? []).filter(t => plannedById.has(Number(t.id)));
  const configuredAnchors = inspected.filter(t => Number(t.zoneId) === mainZone || primaryStageContext.primaryStageSpaceIds.includes(Number(t.spaceId)));
  const fallbackAnchors = inspected.filter(t => /\b(plato|main stage|stage|set)\b/.test(normalize(input.spaceNameById?.[Number(t.spaceId)])));
  const anchors = (configuredAnchors.length ? configuredAnchors : fallbackAnchors).filter(t => Number(t.contestantId) > 0);
  const anchorDetectionReason = primaryStageContext.fixedIntervals.length && configuredAnchors.length ? "shared_primary_stage_context" : configuredAnchors.length ? "configured_main_zone" : fallbackAnchors.length ? "normalized_space_name_fallback" : primaryStageContext.fixedIntervals.length ? "primary_stage_context_not_shared" : "main_stage_anchor_detection_failed";
  const talents = uniq((input.tasks ?? []).map(t => String(t.contestantName ?? "").trim()).filter(Boolean));
  const anchoredNames = new Set(anchors.map(t => String(t.contestantName ?? "").trim())); const rejected: string[] = [];
  const anchorIntervals = anchors.map(t => plannedById.get(Number(t.id))!).filter(Boolean);
  const anchorSpaceId = Number(anchors[0]?.spaceId); const anchorSpaceName = input.spaceNameById?.[anchorSpaceId];
  const candidate: EngineOutput = { ...baseline, plannedTasks: (baseline.plannedTasks ?? []).map(p => ({ ...p, assignedResources: [...(p.assignedResources ?? [])] })) };
  const candidateById = new Map((candidate.plannedTasks ?? []).map(p => [Number(p.taskId), p])); const moved: number[] = [];
  for (const anchor of anchors.slice(0, 12)) {
    if (Date.now() - started > 3000) { rejected.push("time_budget_exhausted"); break; }
    const anchorSlot = candidateById.get(Number(anchor.id)); const anchorStart = toMinutes(anchorSlot?.startPlanned); const anchorEnd = toMinutes(anchorSlot?.endPlanned); if (anchorStart === null || anchorEnd === null) continue;
    const wave = (input.tasks ?? []).filter(t => Number(t.contestantId) === Number(anchor.contestantId) && Number(t.id) !== Number(anchor.id) && candidateById.has(Number(t.id)) && !isFixed(input, t));
    const previous = wave.filter(t => (toMinutes(candidateById.get(Number(t.id))?.endPlanned) ?? Infinity) <= anchorStart && !isOut(input, t)).sort((a,b)=>(toMinutes(candidateById.get(Number(b.id))?.endPlanned)??0)-(toMinutes(candidateById.get(Number(a.id))?.endPlanned)??0));
    let cursor = anchorStart;
    for (const task of previous) { const p = candidateById.get(Number(task.id))!; const duration=(toMinutes(p.endPlanned)??0)-(toMinutes(p.startPlanned)??0); if(duration<=0) continue; cursor-=duration; if(p.startPlanned!==hhmm(cursor)){p.startPlanned=hhmm(cursor);p.endPlanned=hhmm(cursor+duration);moved.push(Number(task.id));} }
    const following = wave.filter(t => isOut(input,t) || (toMinutes(candidateById.get(Number(t.id))?.startPlanned) ?? -1) >= anchorEnd).sort((a,b)=>Number(isOut(input,a))-Number(isOut(input,b)) || (toMinutes(candidateById.get(Number(a.id))?.startPlanned)??0)-(toMinutes(candidateById.get(Number(b.id))?.startPlanned)??0));
    cursor=anchorEnd;
    for(const task of following){ const p=candidateById.get(Number(task.id))!; const duration=(toMinutes(p.endPlanned)??0)-(toMinutes(p.startPlanned)??0); if(duration<=0)continue; if(isMealTask(input,task) && input.meal){const ms=toMinutes(input.meal.start), me=toMinutes(input.meal.end); if(ms!==null&&me!==null) cursor=Math.max(cursor,ms); if(me!==null&&cursor+duration>me) continue;} if(p.startPlanned!==hhmm(cursor)){p.startPlanned=hhmm(cursor);p.endPlanned=hhmm(cursor+duration);moved.push(Number(task.id));} cursor+=duration; }
  }
  const errors = validateOptimizedCandidate(input, baseline, candidate); const hard = validateHardConstraints(input, candidate); const candidateScore=scoreCandidateSolution(input,candidate);
  const valid = moved.length>0 && errors.length===0 && hard.hardValidationPassed && candidateScore.mainStageGapMinutes===0 && candidateScore.plannedTasks===baseScore.plannedTasks;
  if(!anchors.length) rejected.push("no_anchor_tasks_found", "main_stage_anchor_detection_failed"); if(!moved.length&&anchors.length) rejected.push("no_wave_tasks_for_anchor"); if(errors.length) rejected.push("wave_candidate_hard_invalid", ...errors.slice(0,8).map(e=>`hard_invalid:${e}`)); if(!hard.hardValidationPassed) rejected.push("wave_candidate_hard_invalid", ...hard.hardConstraintViolationCodes.slice(0,8).map(e=>`hard_invalid:${e}`));
  const candidates=valid?[candidate]:[]; const metric: ProductionWaveCandidateMetric={...compact(candidateScore),movedTaskIds:uniq(moved),movedTalentNames:uniq(moved.map(id=>String(taskById.get(id)?.contestantName??"")).filter(Boolean)),selected:false};
  return { candidates, meta:{productionWaveAttempted:true,productionWaveInvocationPoint:"after_operational_neighborhood",productionWaveInputTaskCount:input.tasks?.length??0,productionWaveInputPlannedTasks:baseline.plannedTasks?.length??0,productionWaveInputMainStageTasks:primaryStageContext.primaryStageTaskIds.length||configuredAnchors.length||fallbackAnchors.length,productionWaveInputCoachCount:input.coachResourceIds?.length??0,productionWaveInputTalentCount:talents.length,productionWaveAnchorDetectionAttempted:true,productionWaveAnchorDetectionReason:anchorDetectionReason,productionWaveAnchorDetectionRejectedReasons:anchors.length?[]:[anchorDetectionReason,"configured_main_zone_empty","normalized_space_name_fallback_empty"],productionWaveAnchorCandidatesInspected:inspected.length,productionWaveAnchorCandidateSamples:inspected.slice(0,10).map(t=>({taskId:t.id,zoneId:t.zoneId,spaceId:t.spaceId,spaceName:input.spaceNameById?.[Number(t.spaceId)],templateName:t.templateName})),productionWaveAnchorsFound:anchors.length,productionWaveUnanchoredTalents:talents.filter(n=>!anchoredNames.has(n)),productionWaveAnchorSpaceName:anchorSpaceName,productionWaveAnchorWindowStart:anchorIntervals.map(p=>p.startPlanned).sort()[0],productionWaveAnchorWindowEnd:anchorIntervals.map(p=>p.endPlanned).sort().at(-1),productionWaveCandidatesGenerated:candidates.length,productionWaveAccepted:false,productionWaveReason:valid?"candidate_generated":anchors.length?"no_valid_candidate":"main_stage_anchor_detection_failed",productionWaveRejectedReasons:uniq(rejected.length?rejected:["wave_candidate_not_better"]).slice(0,20),productionWaveCandidateMetrics:moved.length?[metric]:[],productionWaveBestBefore:compact(baseScore),productionWaveBestAfter:valid?compact(candidateScore):compact(baseScore),productionWaveMovedTaskIds:[],productionWaveMovedTalentNames:[],productionWaveCoachGapBefore:baseScore.maxCoachGapMinutes,productionWaveCoachGapAfter:valid?candidateScore.maxCoachGapMinutes:baseScore.maxCoachGapMinutes,productionWaveMakespanBefore:baseScore.makespan,productionWaveMakespanAfter:valid?candidateScore.makespan:baseScore.makespan,productionWaveFeasibleButNotSelected:valid,productionWaveComparison:{before:compact(baseScore),candidate:moved.length?compact(candidateScore):null,blockers:uniq(rejected)}} };
};

export const selectProductionWaveCandidate = (input: EngineV3Input, baseline: EngineOutput) => {
 const generated=generateProductionWaveCandidates(input,baseline); const base=scoreCandidateSolution(input,baseline); let output=baseline; let best=base;
 for(const candidate of generated.candidates){const score=scoreCandidateSolution(input,candidate); const forced=score.makespan<best.makespan || (best.maxCoachGapMinutes-score.maxCoachGapMinutes>=30 && score.makespan<=best.makespan); if(forced || (score.hardConstraintViolations===0&&score.mainStageGapMinutes===0&&score.plannedTasks===best.plannedTasks&&score.makespan<=best.makespan&&score.maxCoachGapMinutes<best.maxCoachGapMinutes)){output=candidate;best=score;}}
 const accepted=output!==baseline; const ids=accepted?(output.plannedTasks??[]).filter(p=>{const b=(baseline.plannedTasks??[]).find(x=>Number(x.taskId)===Number(p.taskId));return b&&(b.startPlanned!==p.startPlanned||b.endPlanned!==p.endPlanned)}).map(p=>Number(p.taskId)):[]; const names=uniq(ids.map(id=>String((input.tasks??[]).find(t=>Number(t.id)===id)?.contestantName??"")).filter(Boolean));
 generated.meta.productionWaveAccepted=accepted; generated.meta.productionWaveReason=accepted?(best.makespan<base.makespan?"production_wave_builder selected: lower makespan and coach gap":"production_wave_builder selected: compacted coach waves"):(generated.candidates.length?"production_wave_builder not selected: not better":"production_wave_builder not selected: hard invalid"); generated.meta.productionWaveFeasibleButNotSelected=!accepted&&generated.candidates.length>0; generated.meta.productionWaveMovedTaskIds=ids; generated.meta.productionWaveMovedTalentNames=names; generated.meta.productionWaveBestAfter=compact(accepted?best:base); generated.meta.productionWaveCoachGapAfter=(accepted?best:base).maxCoachGapMinutes; generated.meta.productionWaveMakespanAfter=(accepted?best:base).makespan; generated.meta.productionWaveCandidateMetrics=generated.meta.productionWaveCandidateMetrics.map(m=>({...m,selected:accepted&&m.movedTaskIds.length===ids.length&&m.movedTaskIds.every(id=>ids.includes(id))})); return {output,meta:generated.meta};
};
