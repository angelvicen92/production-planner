import test from "node:test";
import assert from "node:assert/strict";
import { buildMacroProductionWaveDayShapeCandidates } from "./macroProductionWaveDayShapeCandidate";
import { analyzeProductionWaveBlocks } from "./productionWaveCoachBlockAnalyzer";
import { rankProductionWaveSubjects } from "./productionWaveTalentPriority";
import { resolveProductionWavePolicy } from "./productionWavePolicy";

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

test("agrupa prerequisitos y main flow por recurso crítico",()=>{ const r=buildMacroProductionWaveDayShapeCandidates({operationalState:planState() as any}); assert.equal(r.candidates[0].metadata.family,"macro-production-wave-day-shape"); assert.ok((r.candidates[0].metadata.coachBlockPlan as any[]).length>=2); const a1=r.candidates[0].assignments.find(a=>a.taskId===1)!; const a2=r.candidates[0].assignments.find(a=>a.taskId===2)!; assert.ok(a1.endPlanned!<=a2.startPlanned!); assert.ok((r.summary.mainFlowIdleAfter as number) < (r.summary.mainFlowIdleBefore as number)); });

test("respeta talento con salida temprana",()=>{ const st=planState(); const analysis=analyzeProductionWaveBlocks({operationalState:st as any, productionWavePolicy:resolveProductionWavePolicy(st), mainZoneTarget:{configured:true,mainSpaceIds:[900],mainZoneIds:[]}}); const rank=rankProductionWaveSubjects({operationalState:st as any, analysis}); assert.equal(rank.orderedSubjects[0].subjectId,1); });

test("no hardcodea recursos ni espacios",()=>{ const r=buildMacroProductionWaveDayShapeCandidates({operationalState:planState({space:3210,a:8101,b:8102}) as any}); assert.equal(r.candidates[0].id,"candidate:macro-production-wave-day-shape:1"); assert.deepEqual((r.candidates[0].metadata.affectedResourceIds as number[]).slice(0,2),[8101,8102]); });

test("comida flexible no bloquea toda la producción",()=>{ const r=buildMacroProductionWaveDayShapeCandidates({operationalState:planState() as any}); assert.equal((r.candidates[0].metadata.mealUsagePlan as any).treatAsHardStop,false); assert.ok(r.candidates[0].assignments.some(a=>a.startPlanned!<"13:00"&&a.endPlanned!>"12:00") || (r.candidates[0].metadata.mealUsagePlan as any).flexible); });

test("rechazo explícito si no mejora OperationalValue",()=>{ const st=planState(); st.planning=[{taskId:1,startPlanned:"09:00",endPlanned:"09:15",spaceId:701,assignedResourceIds:[501],operationalRole:"productive_task"},{taskId:2,startPlanned:"09:15",endPlanned:"09:45",spaceId:900,assignedResourceIds:[501],operationalRole:"productive_task"},{taskId:3,startPlanned:"09:45",endPlanned:"10:00",spaceId:702,assignedResourceIds:[502],operationalRole:"productive_task"},{taskId:4,startPlanned:"10:00",endPlanned:"10:30",spaceId:900,assignedResourceIds:[502],operationalRole:"productive_task"}]; const r=buildMacroProductionWaveDayShapeCandidates({operationalState:st as any}); assert.ok(r.summary.rejectionReasons.includes("no_improvement_operational_value")); });

test("caso tipo plan 27 genera candidato o rechazo estratégico con bloques",()=>{ const r=buildMacroProductionWaveDayShapeCandidates({operationalState:planState({space:27,a:335,b:336}) as any}); assert.equal(r.summary.executed,true); assert.ok(r.summary.candidateCount>0 || r.summary.rejectedCandidateDetails.length>0); assert.ok(r.summary.coachBlockPlan.length>0); assert.ok(r.summary.talentPriorityOrder.length>0); assert.ok(r.summary.mainFlowBlockPlan.length>0); assert.ok(Object.keys(r.summary.prerequisitePlacementPlan).length>0); });
