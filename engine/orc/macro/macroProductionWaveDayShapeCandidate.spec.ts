import test from "node:test";
import assert from "node:assert/strict";
import { buildMacroProductionWaveDayShapeCandidates } from "./macroProductionWaveDayShapeCandidate";
import { analyzeProductionWaveBlocks } from "./productionWaveCoachBlockAnalyzer";
import { rankProductionWaveSubjects } from "./productionWaveTalentPriority";
import { resolveProductionWavePolicy } from "./productionWavePolicy";
import { classifyMacroProductionWaveTasks } from "./macroProductionWaveTaskClassifier";
import { buildMacroProductionWaveLanes } from "./macroProductionWaveLaneBuilder";

const base = (over:any={}) => ({
 id:"s", planId:1, workDay:{start:"09:00",end:"18:00"}, constraints:{optimizer:{mainFlowSpaceId:900}}, locks:[], resources:[], spaces:{parentById:{},nameById:{},capacityById:{},concurrencyById:{},exclusiveById:{},priorityById:{}},
 availability:{workDay:{start:"09:00",end:"18:00"},meal:null,mealWindow:{start:"12:00",end:"13:00"},actualMeal:null,globalHardBreaks:[],protectedBreaks:[],contestantAvailabilityById:{1:{start:"09:00",end:"11:30"},2:{start:"09:00",end:"18:00"}}}, dependencies:[], operationalMetrics:{}, cognitive:{}, source:"EngineInput", schemaVersion:"ORC-SPEC-01", ...over
});
const planState = (ids={space:900,a:501,b:502}) => base({ constraints:{optimizer:{mainFlowSpaceId:ids.space}}, tasks:[
 {id:1,planId:1,templateId:1,status:"pending",contestantId:1}, {id:2,planId:1,templateId:2,status:"pending",contestantId:1,dependsOnTaskIds:[1]},
 {id:3,planId:1,templateId:1,status:"pending",contestantId:2}, {id:4,planId:1,templateId:2,status:"pending",contestantId:2,dependsOnTaskIds:[3]},
 {id:5,planId:1,templateId:3,status:"pending",contestantId:2}], planning:[
 {taskId:2,startPlanned:"09:00",endPlanned:"09:30",spaceId:ids.space,assignedResourceIds:[ids.a],operationalRole:"productive_task",countsAsWork:true},
 {taskId:5,startPlanned:"09:30",endPlanned:"10:15",spaceId:777,assignedResourceIds:[999],operationalRole:"productive_task",countsAsWork:true},
 {taskId:1,startPlanned:"10:15",endPlanned:"10:30",spaceId:701,assignedResourceIds:[ids.a],operationalRole:"productive_task",countsAsWork:true},
 {taskId:4,startPlanned:"11:15",endPlanned:"11:45",spaceId:ids.space,assignedResourceIds:[ids.b],operationalRole:"productive_task",countsAsWork:true},
 {taskId:3,startPlanned:"11:45",endPlanned:"12:00",spaceId:702,assignedResourceIds:[ids.b],operationalRole:"productive_task",countsAsWork:true}],
});

test("agrupa prerequisitos y main flow por recurso crítico",()=>{ const r=buildMacroProductionWaveDayShapeCandidates({operationalState:planState() as any}); assert.equal(r.candidates[0].metadata.family,"macro-production-wave-day-shape"); assert.ok((r.candidates[0].metadata.coachBlockPlan as any[]).length>=2); const c=r.candidates.find(c=>c.assignments.some(a=>a.taskId===4))??r.candidates[0]; const a3=c.assignments.find(a=>a.taskId===3)!; const a4=c.assignments.find(a=>a.taskId===4)!; assert.ok(a3.endPlanned!<=a4.startPlanned!); assert.equal((r.summary.preflight as any).accepted,true); assert.ok((r.summary.preflightMetrics as any).mainFlowIdleAfter <= (r.summary.preflightMetrics as any).mainFlowIdleBefore); });

test("respeta talento con salida temprana",()=>{ const st=planState(); const analysis=analyzeProductionWaveBlocks({operationalState:st as any, productionWavePolicy:resolveProductionWavePolicy(st), mainZoneTarget:{configured:true,mainSpaceIds:[900],mainZoneIds:[]}}); const rank=rankProductionWaveSubjects({operationalState:st as any, analysis}); assert.equal(rank.orderedSubjects[0].subjectId,1); });

test("no hardcodea recursos ni espacios",()=>{ const r=buildMacroProductionWaveDayShapeCandidates({operationalState:planState({space:3210,a:8101,b:8102}) as any}); assert.ok(r.candidates[0].id.startsWith("candidate:macro-production-wave-day-shape:")); assert.ok((r.summary.scopeOptions as any[]).some(o=>o.resourceIds.includes(8101)||o.resourceIds.includes(8102))); });

test("comida flexible no bloquea toda la producción",()=>{ const r=buildMacroProductionWaveDayShapeCandidates({operationalState:planState() as any}); assert.equal((r.candidates[0].metadata.mealUsagePlan as any).treatAsHardStop,false); assert.ok(r.candidates[0].assignments.some(a=>a.startPlanned!<"13:00"&&a.endPlanned!>"12:00") || (r.candidates[0].metadata.mealUsagePlan as any).flexible); });

test("preflight captura outside work day antes del prefilter global",()=>{ const st=planState(); st.workDay={start:"09:00",end:"09:40"}; const r=buildMacroProductionWaveDayShapeCandidates({operationalState:st as any}); assert.equal(r.summary.candidateCount,0); assert.ok(r.summary.candidatePreflightRejectedCount>=1); assert.ok(r.summary.rejectedCandidateDetails.some((d:any)=>d.reason==="outside-work-day" && d.proposedStart && d.proposedEnd && d.allowedWindow)); });

test("caso tipo plan 27 genera candidato o rechazo estratégico con bloques",()=>{ const r=buildMacroProductionWaveDayShapeCandidates({operationalState:planState({space:27,a:335,b:336}) as any}); assert.equal(r.summary.executed,true); assert.ok(r.summary.candidateCount>0 || r.summary.rejectedCandidateDetails.length>0); assert.ok(r.summary.coachBlockPlan.length>0); assert.ok(r.summary.talentPriorityOrder.length>0); assert.ok(r.summary.mainFlowBlockPlan.length>0); assert.ok(Object.keys(r.summary.prerequisitePlacementPlan).length>0); });


test("main flow classification strict ignora prerequisito fuera del plató aunque countsForMainFlow",()=>{ const st=planState(); (st.planning as any[]).find(e=>e.taskId===1)!.countsForMainFlow=true; (st.planning as any[]).find(e=>e.taskId===2)!.countsForMainFlow=true; const c=classifyMacroProductionWaveTasks({operationalState:st as any, mainZoneTarget:{configured:true,mainSpaceIds:[900],mainZoneIds:[]}}); assert.deepEqual(c.mainFlowTaskIds,[2,4]); assert.deepEqual(c.upstreamPrerequisiteTaskIdsByMainTask[2],[1]); assert.ok(c.countsForMainFlowIgnoredTaskIds.includes(1)); });

test("detecta identidad de sujeto con campos mixtos",()=>{ const st=planState(); st.tasks=[{id:1,contestantId:1,status:"pending"},{id:2,contestant_id:2,status:"pending"},{id:3,talentId:3,status:"pending"},{id:4,itinerantTeamId:4,status:"pending"},{id:5,status:"pending"}] as any; const analysis=analyzeProductionWaveBlocks({operationalState:st as any, productionWavePolicy:resolveProductionWavePolicy(st), mainZoneTarget:{configured:true,mainSpaceIds:[900],mainZoneIds:[]}}); const rank=rankProductionWaveSubjects({operationalState:st as any, analysis}); assert.ok(rank.orderedSubjects.length>0); assert.ok(rank.subjectIdentitySource.includes("contestantId")); assert.ok(rank.subjectIdentitySource.includes("contestant_id")); assert.ok(rank.subjectIdentitySource.includes("talentId")); assert.ok(rank.subjectIdentitySource.includes("itinerantTeamId")); assert.ok(rank.tasksWithoutSubjectId.includes(5)); });

test("lanes paralelos no serializan recursos independientes",()=>{ const st=planState(); const c=classifyMacroProductionWaveTasks({operationalState:st as any, mainZoneTarget:{configured:true,mainSpaceIds:[900],mainZoneIds:[]}}); const lanes=buildMacroProductionWaveLanes({operationalState:st as any, taskClassification:c, mainTaskIds:[2,4], prerequisiteTaskIds:[1,3], resourceIds:[501,502], startMinute:9*60}); assert.ok(lanes.lanePlan.parallelLaneCount>=2); const p1=lanes.assignments.find(a=>a.taskId===1)!; const p3=lanes.assignments.find(a=>a.taskId===3)!; assert.equal(p1.startPlanned,p3.startPlanned); });

test("scope limit reduce candidato y no declara 80 movimientos",()=>{ const tasks:any[]=[]; const planning:any[]=[]; for(let i=1;i<=80;i++){tasks.push({id:i,status:"pending",contestantId:i}); planning.push({taskId:i,startPlanned:`${String(9+Math.floor((i-1)/4)).padStart(2,"0")}:${String(((i-1)%4)*15).padStart(2,"0")}`,endPlanned:`${String(9+Math.floor(i/4)).padStart(2,"0")}:${String((i%4)*15).padStart(2,"0")}`,spaceId:900,assignedResourceIds:[500+i%3],operationalRole:"productive_task",countsAsWork:true}); } const st=base({tasks,planning,constraints:{optimizer:{mainFlowSpaceId:900,productionWavePolicy:{runtime:{macroDayShapeMaxMovedTasks:30}}}}}); const r=buildMacroProductionWaveDayShapeCandidates({operationalState:st as any}); assert.ok((r.candidates[0]?.metadata?.movedTaskIds as any[] ?? []).length<=30); });

test("candidato hard-feasible queda listo para simulación",()=>{ const r=buildMacroProductionWaveDayShapeCandidates({operationalState:planState() as any}); assert.ok(r.summary.candidateCount>0); assert.equal((r.summary.preflight as any).accepted,true); });
