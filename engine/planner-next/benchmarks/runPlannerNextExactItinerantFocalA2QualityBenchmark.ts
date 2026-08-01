import assert from "node:assert/strict";
import { anchoredTaskIds } from "../anchoredAccompaniment";
import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask } from "../contracts";
import { compareCompleteParticipantQuality, constructExactItinerantPlan, runExactItinerantPlanSearch } from "../exactItinerantPlan";
import { evaluateParticipantItineraryQuality } from "../participantItineraryQuality";
import { createResidualObligationMainOrderer } from "../residualObligationAlignment";
import { validatePlan } from "../validate";
import { createAcceptedExactConstructiveFocalA2Problem } from "./focal-a2/focalA2ExactConstructiveConfiguration";
import { focalA2HumanItinerantReference } from "./focal-a2/focalA2HumanItinerantReference";
import { focalA2Participants, focalA2Reference } from "./focal-a2/focalA2Reference";
import { itinerantOperationProfiles } from "./focal-a2/focalA2RealityReference";

const BASELINE_FULL = "fded1fd188ba3daa833f68ce74533e6db43fd6e801d64f7f4cebea42aa5224d6";
const BASELINE_QUALITY = "a64f641fcde8d470808a1b3e2eda986b5a99390600dd5c70ab189d37fc16189f";
const CANDIDATE_FULL = "b5b1fc1fe3b1813e425b26b22cbf7932604718f1b194eb00a8e909f0937f7357";
const CANDIDATE_QUALITY = "256244c1ccad494ca319d921dfcdc8c696b54a4b16506d42567f2e29abb5657b";
const sorted = <T extends { id: string }>(items: readonly T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));

function createProblem(reversed = false): PlannerNextProblem {
  const problem = createAcceptedExactConstructiveFocalA2Problem(reversed ? [...itinerantOperationProfiles].reverse() : itinerantOperationProfiles);
  if (reversed) {
    problem.tasks.reverse(); problem.participants.reverse(); problem.spaces.reverse(); problem.resources.reverse(); problem.coaches.reverse();
    problem.anchoredAccompaniments?.reverse();
    for (const item of [...problem.tasks, ...problem.participants, ...problem.spaces, ...problem.resources, ...problem.coaches]) item.availability?.reverse();
  }
  return problem;
}

function humanReference(problem: PlannerNextProblem) {
  const errors: string[] = [], source = new Map(problem.tasks.map((task) => [task.id, task]));
  const tasks = focalA2Reference.tasks.map((reference) => {
    const task = source.get(reference.id); if (!task) { errors.push(`MISSING_CORE:${reference.id}`); return undefined; }
    return { ...task, start: reference.start, end: reference.end } as ScheduledTask;
  }).filter((task): task is ScheduledTask => task !== undefined);
  const humanIntervals = new Map(focalA2HumanItinerantReference.map((item) => [item.operationId, item]));
  for (const profile of itinerantOperationProfiles.filter((item) => item.type === "STANDALONE")) {
    const task = source.get(profile.id), interval = humanIntervals.get(profile.id);
    if (!task || !interval) { errors.push(`INCOMPLETE_STANDALONE:${profile.id}`); continue; }
    if (interval.end - interval.start !== task.duration) errors.push(`DURATION:${profile.id}`);
    tasks.push({ ...task, start: interval.start, end: interval.end });
  }
  for (const profile of itinerantOperationProfiles.filter((item) => item.type === "ANCHORED_ACCOMPANIMENT")) {
    const contract = problem.anchoredAccompaniments?.find(({ id }) => id === profile.id), interval = humanIntervals.get(profile.id);
    const anchor = tasks.find(({ id }) => id === contract?.anchorTaskId);
    if (!contract || !interval || !anchor) { errors.push(`INCOMPLETE_ANCHORED:${profile.id}`); continue; }
    let cursor = interval.start;
    for (const id of contract.beforeTaskIds) { const task = source.get(id); if (!task) { errors.push(`MISSING_SEGMENT:${id}`); continue; }
      tasks.push({ ...task, start: cursor, end: cursor + task.duration }); cursor += task.duration; }
    if (cursor !== anchor.start) errors.push(`BEFORE_NOT_ADJACENT:${profile.id}:${cursor}:${anchor.start}`);
    cursor = anchor.end;
    for (const id of contract.afterTaskIds) { const task = source.get(id); if (!task) { errors.push(`MISSING_SEGMENT:${id}`); continue; }
      tasks.push({ ...task, start: cursor, end: cursor + task.duration }); cursor += task.duration; }
    if (cursor !== interval.end) errors.push(`AFTER_NOT_ADJACENT:${profile.id}:${cursor}:${interval.end}`);
  }
  const humanTasks = sorted(tasks), ids = humanTasks.map(({ id }) => id), unique = new Set(ids), problemIds = new Set(problem.tasks.map(({ id }) => id));
  const missingIds = [...problemIds].filter((id) => !unique.has(id)).sort(), additionalIds = [...unique].filter((id) => !problemIds.has(id)).sort();
  const duplicateIds = [...unique].filter((id) => ids.filter((candidate) => candidate === id).length > 1).sort();
  const durationMismatchIds = humanTasks.filter((task) => task.end - task.start !== source.get(task.id)?.duration).map(({ id }) => id);
  const anchoredIds = anchoredTaskIds(problem), standaloneIds = new Set(itinerantOperationProfiles.filter(({ type }) => type === "STANDALONE").map(({ id }) => id));
  const meals: ScheduledSpaceMeal[] = [{ id: `space-meal:${focalA2Reference.meal.spaceId}:1`, kind: "space-meal", entryIndex: 1, ...focalA2Reference.meal }];
  const validation = validatePlan(problem, humanTasks, [], meals);
  const integrity = {
    taskCount: humanTasks.length, uniqueTaskCount: unique.size, sameProblemIds: missingIds.length === 0 && additionalIds.length === 0,
    missingIds, additionalIds, duplicateIds, durationMismatchIds,
    mainCount: humanTasks.filter(({ kind }) => kind === "main").length, vocalCount: humanTasks.filter(({ kind }) => kind === "vocal").length,
    standaloneCount: humanTasks.filter(({ id }) => standaloneIds.has(id)).length,
    anchoredSegmentCount: humanTasks.filter(({ id }) => anchoredIds.has(id) && !id.startsWith("main-")).length,
    completeAnchoredContractCount: (problem.anchoredAccompaniments ?? []).filter((contract) => [contract.anchorTaskId, ...contract.beforeTaskIds, ...contract.afterTaskIds].every((id) => ids.filter((item) => item === id).length === 1)).length,
    itinerantOperationCount: itinerantOperationProfiles.length,
    itinerantMinutes: focalA2HumanItinerantReference.reduce((sum, item) => sum + item.end - item.start, 0),
    anchorsExactlyOnce: (problem.anchoredAccompaniments ?? []).every(({ anchorTaskId }) => ids.filter((id) => id === anchorTaskId).length === 1),
    segmentsExactlyOnce: (problem.anchoredAccompaniments ?? []).flatMap(({ beforeTaskIds, afterTaskIds }) => [...beforeTaskIds, ...afterTaskIds]).every((id) => ids.filter((item) => item === id).length === 1),
    reconstructionErrors: errors, hardValid: validation.hardValid, validationReasonCodes: validation.reasonCodes,
  };
  const valid = errors.length === 0 && humanTasks.length === 53 && unique.size === 53 && missingIds.length === 0 && additionalIds.length === 0 && duplicateIds.length === 0 && durationMismatchIds.length === 0 &&
    integrity.mainCount === 19 && integrity.vocalCount === 19 && integrity.standaloneCount === 9 && integrity.anchoredSegmentCount === 6 && integrity.completeAnchoredContractCount === 3 && integrity.itinerantMinutes === 375 && validation.hardValid;
  return { tasks: humanTasks, meals, validation, integrity: { ...integrity, valid } };
}

function execute(reversed = false) {
  const problem = createProblem(reversed), before = JSON.stringify(problem), baseline = constructExactItinerantPlan(problem);
  const coreIds = new Set(problem.tasks.filter(({ kind }) => kind === "main" || kind === "vocal").map(({ id }) => id));
  for (const id of anchoredTaskIds(problem)) coreIds.add(id);
  const orderer = createResidualObligationMainOrderer(problem, problem.tasks.filter(({ id }) => !coreIds.has(id)));
  const candidate = runExactItinerantPlanSearch(problem, { coreOrderer: orderer.options, standaloneCompletionSelection: "BEST_DOMINATING_WITHIN_BUDGET" });
  const human = humanReference(problem);
  return { problem, baseline, candidate, human, baselineValidation: validatePlan(problem, baseline.scheduledTasks, [], baseline.scheduledSpaceMeals),
    candidateValidation: validatePlan(problem, candidate.scheduledTasks, [], candidate.scheduledSpaceMeals), inputUnchanged: JSON.stringify(problem) === before };
}

const first = execute(), repeated = execute(), reversed = execute(true);
const planProjection = (run: ReturnType<typeof execute>) => ({ baseline: run.baseline, candidate: run.candidate, humanTasks: run.human.tasks, humanMeals: run.human.meals });
assert.deepEqual(planProjection(repeated), planProjection(first)); assert.deepEqual(planProjection(reversed), planProjection(first));
assert.equal(first.inputUnchanged && repeated.inputUnchanged && reversed.inputUnchanged, true);
assert.equal(first.baseline.status, "COMPLETE"); assert.equal(first.baseline.scheduledTasks.length, 53); assert.equal(first.baseline.remainingTaskIds.length, 0); assert.equal(first.baselineValidation.hardValid, true);
assert.equal(first.baseline.evidence.branchesExplored, 85_557); assert.equal(first.baseline.evidence.fullFingerprint, BASELINE_FULL);
const baselineQuality = evaluateParticipantItineraryQuality(first.problem, first.baseline.scheduledTasks);
assert.equal(baselineQuality.summary.qualityFingerprint, BASELINE_QUALITY);
assert.equal(first.candidate.status, "COMPLETE"); assert.equal(first.candidate.scheduledTasks.length, 53); assert.equal(first.candidate.remainingTaskIds.length, 0); assert.equal(first.candidateValidation.hardValid, true);
assert.equal(first.candidate.evidence.branchesExplored, 300_000); assert.equal(first.candidate.evidence.coreBranches, 48_224); assert.equal(first.candidate.evidence.standaloneBranches, 251_776);
assert.equal(first.candidate.evidence.completePlansObserved, 78); assert.equal(first.candidate.evidence.completeIncumbentReplacements, 2); assert.equal(first.candidate.evidence.completeSelectionStoppedByBudget, true);
assert.equal(first.candidate.evidence.fullFingerprint, CANDIDATE_FULL); assert.equal(first.candidate.evidence.selectedCompleteFingerprint, CANDIDATE_FULL);
const candidateQuality = evaluateParticipantItineraryQuality(first.problem, first.candidate.scheduledTasks), humanQuality = evaluateParticipantItineraryQuality(first.problem, first.human.tasks);
assert.equal(candidateQuality.summary.qualityFingerprint, CANDIDATE_QUALITY);
assert.equal(compareCompleteParticipantQuality(first.candidate.evidence.selectedCompleteQuality!, first.baseline.evidence.selectedCompleteQuality!), 1);

const qualityTable = (quality: typeof baselineQuality) => ({ totalPresence: quality.summary.totalPresenceSpanMinutes, productive: quality.summary.totalProductiveMinutes,
  idle: quality.summary.totalIdleMinutes, idleRatio: quality.summary.overallIdleRatio, maximumPresence: quality.summary.maximumParticipantPresenceSpanMinutes,
  maximumIdle: quality.summary.maximumParticipantIdleMinutes, maximumGap: quality.summary.maximumSingleGapMinutes,
  participantsWithInternalGaps: quality.summary.participantsWithInternalGaps, gaps: quality.summary.totalGapCount, spaceChanges: quality.summary.totalSpaceChangeCount });
assert.deepEqual(qualityTable(baselineQuality), { totalPresence:3515, productive:900, idle:2615, idleRatio:0.7439544807965861, maximumPresence:440, maximumIdle:380, maximumGap:225, participantsWithInternalGaps:19, gaps:28, spaceChanges:34 });
assert.deepEqual(qualityTable(candidateQuality), { totalPresence:3290, productive:900, idle:2390, idleRatio:0.7264437689969605, maximumPresence:425, maximumIdle:365, maximumGap:225, participantsWithInternalGaps:19, gaps:28, spaceChanges:34 });

const qualityVector = (quality: typeof baselineQuality) => [quality.summary.maximumParticipantIdleMinutes, quality.summary.maximumSingleGapMinutes, quality.summary.totalIdleMinutes, quality.summary.totalGapCount, quality.summary.totalSpaceChangeCount];
function dominance(left: number[], right: number[], leftLabel: string, rightLabel: string) { const better = left.some((value, i) => value < right[i]!), worse = left.some((value, i) => value > right[i]!);
  return !worse && better ? `${leftLabel}_DOMINATES_${rightLabel}` : !better && worse ? `${rightLabel}_DOMINATES_${leftLabel}` : better && worse ? `MIXED_${leftLabel}_VS_${rightLabel}` : `EQUIVALENT_${leftLabel}_AND_${rightLabel}`; }
const candidateVsHumanClassification = first.human.integrity.valid ? dominance(qualityVector(candidateQuality), qualityVector(humanQuality), "CANDIDATE", "HUMAN_REFERENCE") : "REFERENCE_INVALID_OR_INCOMPLETE";
const baselineByParticipant = new Map(baselineQuality.participants.map((item) => [item.participantId, item]));
const participants = candidateQuality.participants.map((candidate) => { const baseline = baselineByParticipant.get(candidate.participantId)!;
  const deltas = { presence: candidate.presenceSpanMinutes - baseline.presenceSpanMinutes, productive: candidate.productiveMinutes - baseline.productiveMinutes, idle: candidate.idleMinutes - baseline.idleMinutes,
    maximumGap: candidate.maximumGapMinutes - baseline.maximumGapMinutes, gaps: candidate.gapCount - baseline.gapCount, spaceChanges: candidate.spaceChangeCount - baseline.spaceChangeCount };
  const values = [deltas.presence, deltas.idle, deltas.maximumGap], improves = values.some((v) => v < 0), worsens = values.some((v) => v > 0);
  const classification = improves && worsens ? "MIXED" : improves ? "IMPROVED" : worsens ? "WORSENED" : "UNCHANGED";
  return { participantId: candidate.participantId, baselineFirstTask: { id: baseline.firstTaskId, start: baseline.firstTaskStart }, candidateFirstTask: { id: candidate.firstTaskId, start: candidate.firstTaskStart },
    baselineLastTask: { id: baseline.lastTaskId, end: baseline.lastTaskEnd }, candidateLastTask: { id: candidate.lastTaskId, end: candidate.lastTaskEnd },
    startDelta: candidate.firstTaskStart! - baseline.firstTaskStart!, endDelta: candidate.lastTaskEnd! - baseline.lastTaskEnd!, ...deltas, classification };
});
const rank = (items: typeof participants, direction: 1|-1) => [...items].sort((a,b) => direction * (b.presence-a.presence) || direction * (b.idle-a.idle) || a.participantId.localeCompare(b.participantId)).slice(0,5);
const participantComparison = { participants, summary: { improved: participants.filter(({ classification }) => classification === "IMPROVED").length, worsened: participants.filter(({ classification }) => classification === "WORSENED").length,
  mixed: participants.filter(({ classification }) => classification === "MIXED").length, unchanged: participants.filter(({ classification }) => classification === "UNCHANGED").length,
  grossPresenceReduction: participants.reduce((sum,p)=>sum+Math.max(0,-p.presence),0), grossPresenceIncrease: participants.reduce((sum,p)=>sum+Math.max(0,p.presence),0),
  grossIdleReduction: participants.reduce((sum,p)=>sum+Math.max(0,-p.idle),0), grossIdleIncrease: participants.reduce((sum,p)=>sum+Math.max(0,p.idle),0),
  fiveLargestImprovements: rank(participants,-1), fiveLargestHarms: rank(participants,1) } };

const humanByTask = new Map(first.human.tasks.map((task) => [task.id, task])), candidateByTask = new Map(first.candidate.scheduledTasks.map((task) => [task.id, task]));
const standaloneIds = new Set(itinerantOperationProfiles.filter(({type})=>type==="STANDALONE").map(({id})=>id)), anchoredIds = anchoredTaskIds(first.problem);
const taskRows = sorted(first.problem.tasks).map((source) => { const human=humanByTask.get(source.id)!, candidate=candidateByTask.get(source.id)!;
  const category = source.kind === "main" ? "MAIN" : source.kind === "vocal" ? "VOCAL" : standaloneIds.has(source.id) ? "STANDALONE" : anchoredIds.has(source.id) ? "ANCHORED_SEGMENT" : "UNKNOWN";
  return { taskId:source.id, participantId:source.participantId, category, humanStart:human.start, candidateStart:candidate.start, startDelta:candidate.start-human.start,
    humanEnd:human.end, candidateEnd:candidate.end, endDelta:candidate.end-human.end, absoluteStartDifference:Math.abs(candidate.start-human.start), absoluteEndDifference:Math.abs(candidate.end-human.end) }; });
const taskCategories = ["MAIN","VOCAL","STANDALONE","ANCHORED_SEGMENT"].map(category=>{const rows=taskRows.filter(row=>row.category===category); return { category, taskCount:rows.length,
  sameStart:rows.filter(r=>r.startDelta===0).length, earlier:rows.filter(r=>r.startDelta<0).length, later:rows.filter(r=>r.startDelta>0).length,
  meanAbsoluteStartDifference:rows.reduce((s,r)=>s+r.absoluteStartDifference,0)/rows.length, maximumAbsoluteStartDifference:Math.max(...rows.map(r=>r.absoluteStartDifference)),
  meanAbsoluteEndDifference:rows.reduce((s,r)=>s+r.absoluteEndDifference,0)/rows.length, maximumAbsoluteEndDifference:Math.max(...rows.map(r=>r.absoluteEndDifference)) };});

const candidateParticipant = new Map(candidateQuality.participants.map(item=>[item.participantId,item]));
const envelopeRows = focalA2Participants.map(reference=>{const candidate=candidateParticipant.get(reference.participantId)!; return { participantId:reference.participantId,
  humanPresenceStart:reference.presenceStart, candidateFirstObligation:candidate.firstTaskStart!, startDifference:candidate.firstTaskStart!-reference.presenceStart,
  humanPresenceEnd:reference.presenceEnd, candidateLastObligation:candidate.lastTaskEnd!, endDifference:candidate.lastTaskEnd!-reference.presenceEnd,
  humanSpan:reference.presenceEnd-reference.presenceStart, candidateSpan:candidate.presenceSpanMinutes, spanDelta:candidate.presenceSpanMinutes-(reference.presenceEnd-reference.presenceStart) };});
const presenceEnvelopeComparison={ participants:envelopeRows, summary:{ beforeHumanStart:envelopeRows.filter(r=>r.startDifference<0).length, afterHumanEnd:envelopeRows.filter(r=>r.endDifference>0).length,
  fullyInside:envelopeRows.filter(r=>r.startDifference>=0&&r.endDifference<=0).length, largerSpan:envelopeRows.filter(r=>r.spanDelta>0).length, equalSpan:envelopeRows.filter(r=>r.spanDelta===0).length, smallerSpan:envelopeRows.filter(r=>r.spanDelta<0).length } };

function mainFlow(tasks: ScheduledTask[], meals: ScheduledSpaceMeal[]) { const main=tasks.filter(({kind})=>kind==="main").sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id)), meal=meals.find(({spaceId})=>spaceId===first.problem.mainFlow.spaceId);
  const gaps=main.slice(1).map((task,i)=>({start:main[i]!.end,end:task.start})).filter(g=>g.end>g.start&&!(meal&&g.start===meal.start&&g.end===meal.end));
  const morning=main.filter(task=>!meal||task.end<=meal.start), afternoon=main.filter(task=>meal&&task.start>=meal.end), blocks=main.map(task=>task.blockKey??null);
  return { firstMain:main[0]&&{id:main[0].id,start:main[0].start}, lastMain:main.at(-1)&&{id:main.at(-1)!.id,end:main.at(-1)!.end}, morningDuration:morning.length?morning.at(-1)!.end-morning[0]!.start:0,
    meal:meal??null, firstAfternoon:afternoon[0]&&{id:afternoon[0].id,start:afternoon[0].start}, lastAfternoon:afternoon.at(-1)&&{id:afternoon.at(-1)!.id,end:afternoon.at(-1)!.end},
    unauthorizedGapCount:gaps.length, unauthorizedGapMinutes:gaps.reduce((s,g)=>s+g.end-g.start,0), participantOrder:main.map(t=>t.participantId), coachBlocks:blocks,
    blockChanges:blocks.slice(1).filter((block,i)=>block!==blocks[i]).length, requiredContinuityPreserved:gaps.length===0 } }
const mainFlowComparison={human:mainFlow(first.human.tasks,first.human.meals),baseline:mainFlow(first.baseline.scheduledTasks,first.baseline.scheduledSpaceMeals),candidate:mainFlow(first.candidate.scheduledTasks,first.candidate.scheduledSpaceMeals)};

function operations(tasks: ScheduledTask[]) { const byId=new Map(tasks.map(t=>[t.id,t])); return itinerantOperationProfiles.map(profile=>{const contract=first.problem.anchoredAccompaniments?.find(({id})=>id===profile.id);
  const members=profile.type==="STANDALONE"?[byId.get(profile.id)!]:[...contract!.beforeTaskIds,contract!.anchorTaskId,...contract!.afterTaskIds].map(id=>byId.get(id)!);
  return {operationId:profile.id,participantId:profile.participantId,type:profile.type,start:Math.min(...members.map(t=>t.start)),end:Math.max(...members.map(t=>t.end)),unitId:profile.unitId,duration:members.reduce((s,t)=>s+t.duration,0),anchorTaskId:profile.type==="ANCHORED_ACCOMPANIMENT"?profile.anchorTaskId:null};}).sort((a,b)=>a.operationId.localeCompare(b.operationId)); }
const baselineOperations=operations(first.baseline.scheduledTasks), candidateOperations=operations(first.candidate.scheduledTasks), humanOperations=operations(first.human.tasks);
const itinerantRows=humanOperations.map((human,i)=>{const baseline=baselineOperations[i]!,candidate=candidateOperations[i]!;return {...human,humanStart:human.start,humanEnd:human.end,baselineStart:baseline.start,baselineEnd:baseline.end,candidateStart:candidate.start,candidateEnd:candidate.end,
  baselineStartDifference:baseline.start-human.start,baselineEndDifference:baseline.end-human.end,candidateStartDifference:candidate.start-human.start,candidateEndDifference:candidate.end-human.end};});
const operationAggregate=(key:"baselineStartDifference"|"candidateStartDifference")=>({sameStart:itinerantRows.filter(r=>r[key]===0).length,earlier:itinerantRows.filter(r=>r[key]<0).length,later:itinerantRows.filter(r=>r[key]>0).length,
  meanAbsoluteStartDifference:itinerantRows.reduce((s,r)=>s+Math.abs(r[key]),0)/itinerantRows.length,maximumAbsoluteStartDifference:Math.max(...itinerantRows.map(r=>Math.abs(r[key])))});

const deterministicEvidence = JSON.stringify(planProjection(first))===JSON.stringify(planProjection(repeated)), invariantEvidence=JSON.stringify(planProjection(first))===JSON.stringify(planProjection(reversed));
const candidateDominatesBaseline=compareCompleteParticipantQuality(first.candidate.evidence.selectedCompleteQuality!,first.baseline.evidence.selectedCompleteQuality!)===1;
const ready=first.human.integrity.valid&&first.candidate.status==="COMPLETE"&&first.candidateValidation.hardValid&&deterministicEvidence&&invariantEvidence&&first.inputUnchanged&&repeated.inputUnchanged&&reversed.inputUnchanged&&candidateDominatesBaseline;
const operationalWarnings=participants.some(({classification})=>classification==="WORSENED")||envelopeRows.some(r=>r.startDifference<0||r.endDifference>0)||["MIXED_CANDIDATE_VS_HUMAN","HUMAN_REFERENCE_DOMINATES_CANDIDATE"].includes(candidateVsHumanClassification);
const evidence={ referenceIntegrity:first.human.integrity,
  baseline:{status:first.baseline.status,taskCount:first.baseline.scheduledTasks.length,remainingTaskCount:first.baseline.remainingTaskIds.length,hardValid:first.baselineValidation.hardValid,metrics:qualityTable(baselineQuality),fingerprint:first.baseline.evidence.fullFingerprint,qualityFingerprint:baselineQuality.summary.qualityFingerprint,branches:first.baseline.evidence.branchesExplored},
  candidate:{status:first.candidate.status,taskCount:first.candidate.scheduledTasks.length,remainingTaskCount:first.candidate.remainingTaskIds.length,hardValid:first.candidateValidation.hardValid,metrics:qualityTable(candidateQuality),fingerprint:first.candidate.evidence.fullFingerprint,qualityFingerprint:candidateQuality.summary.qualityFingerprint,
    branches:first.candidate.evidence.branchesExplored,coreBranches:first.candidate.evidence.coreBranches,standaloneBranches:first.candidate.evidence.standaloneBranches,completePlansObserved:first.candidate.evidence.completePlansObserved,replacements:first.candidate.evidence.completeIncumbentReplacements,exhaustedWithCompleteIncumbent:first.candidate.evidence.completeSelectionStoppedByBudget},
  human:{hardValid:first.human.validation.hardValid,metrics:first.human.integrity.valid?qualityTable(humanQuality):null},
  candidateVsBaseline:{classification:candidateDominatesBaseline?"CANDIDATE_DOMINATES_BASELINE":"CANDIDATE_ENGINE_REGRESSION",metrics:{baseline:qualityVector(baselineQuality),candidate:qualityVector(candidateQuality)}},
  candidateVsHuman:{classification:candidateVsHumanClassification,metrics:first.human.integrity.valid?{human:qualityVector(humanQuality),candidate:qualityVector(candidateQuality)}:null},
  participantComparison,taskTimingComparison:{tasks:taskRows,categories:taskCategories},presenceEnvelopeComparison,mainFlowComparison,
  itinerantComparison:{operations:itinerantRows,baseline:operationAggregate("baselineStartDifference"),candidate:operationAggregate("candidateStartDifference")},
  acceptance:{decision:ready?"READY_FOR_HUMAN_REVIEW":"NOT_READY_FOR_HUMAN_REVIEW",operationalWarnings,candidateActivated:false,finalDecisionOwner:"HUMAN"},
  executionChecks:{deterministicPlan:deterministicEvidence,orderInvariantPlan:invariantEvidence,deterministicEvidence,orderInvariantEvidence:invariantEvidence,inputUnchanged:first.inputUnchanged&&repeated.inputUnchanged&&reversed.inputUnchanged} };
process.stdout.write(`${JSON.stringify(evidence,null,2)}\n`);
