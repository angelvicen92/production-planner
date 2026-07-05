import assert from "node:assert/strict";
import test from "node:test";
import { auditProductionConceptAlignment } from "./productionConceptAlignmentAudit";

const task = (id:number, templateName:string, contestantId:number|null=null, extra:any={}) => ({ id, planId:1, templateId:id, templateName, contestantId, status:"pending" as const, ...extra });
const state = (planning:any[], extra:any={}) => ({ id:"s", planId:1, workDay:{start:"09:00",end:"18:00"}, planning, tasks: planning.map((p:any)=>p.task).filter(Boolean).map((x:any)=>x), resources:[{id:1,resourceItemId:1,typeId:1,typeCode:"coach",typeName:"Coach",name:"A",isAvailable:true},{id:2,resourceItemId:2,typeId:1,typeCode:"coach",typeName:"Coach",name:"B",isAvailable:true}], spaces:{parentById:{},nameById:{10:"Main"},capacityById:{},concurrencyById:{},exclusiveById:{},priorityById:{},zoneIdBySpaceId:{10:7},spaceIdsByZoneId:{7:[10]}}, availability:{workDay:{start:"09:00",end:"18:00"}, meal:null, mealWindow:{start:"13:00",end:"14:15"}, actualMeal:null, globalHardBreaks:[], protectedBreaks:[], contestantAvailabilityById:{}}, dependencies:[], locks:[], constraints:{mealMode:"flexible_meal_window", optimizer:{mainFlowSpaceId:10}}, operationalMetrics:{}, cognitive:{opportunities:[],searchSpaces:[],candidates:[],candidateStates:[],simulatedStates:[],validationResults:[],operationalValues:[],commitDecisions:[],evidence:[],metadata:{}}, source:"EngineInput" as const, schemaVersion:"ORC-SPEC-01" as const, ...extra });
const e = (taskId:number, start:string, end:string, res:number[], spaceId=10, t:any=task(taskId,`prod ${taskId}`,1,{countsAsWork:true, productive:true})) => ({taskId,startPlanned:start,endPlanned:end,assignedResourceIds:res,spaceId,operationalRole:"productive_task" as const, task:t});
const codes = (r:any) => r.rootCauses.map((x:any)=>x.code);

test("detects visible main-zone gap touching flexible meal window", () => {
  const s = state([e(1,"11:50","12:05",[1]), e(2,"14:20","14:40",[2])]);
  const r = auditProductionConceptAlignment({operationalState:s as any, previousMainZoneContinuity:{finalLargestMainZoneGapMinutes:0}});
  assert.ok(r.totalVisibleMainZoneIdleMinutes > 0);
  assert.ok(codes(r).includes("main_zone_visible_idle"));
  assert.ok(codes(r).includes("flexible_meal_window_treated_as_global_stop"));
});

test("does not mark gap covered by actual hard break", () => {
  const s = state([e(1,"12:50","13:00",[1]), e(2,"14:15","14:30",[1])], { constraints:{mealMode:"global_hard_break", optimizer:{mainFlowSpaceId:10}}, availability:{workDay:{start:"09:00",end:"18:00"}, meal:null, mealWindow:null, actualMeal:null, globalHardBreaks:[{start:"13:00",end:"14:15"}], protectedBreaks:[], contestantAvailabilityById:{}} });
  const r = auditProductionConceptAlignment({operationalState:s as any});
  assert.equal(r.gapsCoveredByActualHardBreak, 1);
  assert.ok(!codes(r).includes("flexible_meal_window_treated_as_global_stop"));
});

test("detects comparable coach span imbalance", () => {
  const s = state([e(1,"09:00","09:30",[1]), e(2,"12:00","12:30",[1]), e(3,"16:00","16:30",[1]), e(4,"12:30","13:00",[2]), e(5,"13:00","13:30",[2]), e(6,"13:30","14:00",[2])], { constraints:{mealMode:"flexible_meal_window", optimizer:{mainFlowSpaceId:10, comparableWorkloadToleranceMinutes:10, maxComparableResourceSpanImbalanceMinutes:60}} });
  const r = auditProductionConceptAlignment({operationalState:s as any});
  assert.ok(codes(r).includes("critical_resource_span_imbalance"));
});

test("detects too early arrival", () => {
  const arr=task(10,"IN",5,{operationalRole:"transport_arrival"}); const prod=task(11,"prod",5,{countsAsWork:true, productive:true});
  const s=state([{taskId:10,startPlanned:"09:00",endPlanned:"09:05",assignedResourceIds:[],operationalRole:"transport_arrival",task:arr},{...e(11,"10:30","11:00",[1],10,prod)}], {transportSettings:{arrivalTemplateName:"IN", departureTemplateName:"OUT"}});
  const r=auditProductionConceptAlignment({operationalState:s as any});
  assert.equal(r.talentInitialWaits[0].excessiveInitialWait, true);
  assert.ok(codes(r).includes("call_time_not_linked_to_first_productive_task"));
});

test("detects delayed departure and missing release policy", () => {
  const prod=task(20,"prod",6,{countsAsWork:true, productive:true}); const meal=task(21,"meal",6,{isMeal:true,isPlaceholder:true}); const out=task(22,"OUT",6,{operationalRole:"transport_departure"});
  const s=state([{...e(20,"11:00","11:30",[1],10,prod)},{taskId:21,startPlanned:"13:00",endPlanned:"13:40",assignedResourceIds:[],operationalRole:"meal_break_placeholder",task:meal},{taskId:22,startPlanned:"15:00",endPlanned:"15:05",assignedResourceIds:[],operationalRole:"transport_departure",task:out}], {transportSettings:{arrivalTemplateName:"IN", departureTemplateName:"OUT"}});
  const r=auditProductionConceptAlignment({operationalState:s as any});
  assert.ok(codes(r).includes("departure_not_linked_to_last_required_task"));
  assert.ok(codes(r).includes("release_policy_not_configured"));
});

test("detects flexible meal over-blocking", () => {
  const s=state([e(1,"11:00","11:30",[1]), e(2,"15:00","15:30",[2])]);
  const r=auditProductionConceptAlignment({operationalState:s as any});
  assert.ok(codes(r).includes("meal_window_over_blocking_suspected"));
});

test("detects missing coach switch policy", () => {
  const s=state([e(1,"10:00","10:30",[1]), e(2,"10:30","11:00",[2])]);
  const r=auditProductionConceptAlignment({operationalState:s as any});
  assert.ok(codes(r).includes("main_zone_coach_switch_policy_missing"));
});

test("v4-40-like conceptual audit", () => {
  const arr=task(100,"IN",9,{operationalRole:"transport_arrival"}); const out=task(101,"OUT",9,{operationalRole:"transport_departure"});
  const s=state([{taskId:100,startPlanned:"09:00",endPlanned:"09:05",assignedResourceIds:[],operationalRole:"transport_arrival",task:arr}, e(305,"11:30","12:05",[1],10,task(305,"prod",9,{countsAsWork:true,productive:true})), e(306,"14:20","14:50",[2],10,task(306,"prod",9,{countsAsWork:true,productive:true})), e(307,"16:30","17:00",[1],10,task(307,"prod2",8,{countsAsWork:true,productive:true})), {taskId:101,startPlanned:"17:30",endPlanned:"17:35",assignedResourceIds:[],operationalRole:"transport_departure",task:out}], {transportSettings:{arrivalTemplateName:"IN", departureTemplateName:"OUT"}, constraints:{mealMode:"flexible_meal_window", optimizer:{mainFlowSpaceId:10, comparableWorkloadToleranceMinutes:40, maxComparableResourceSpanImbalanceMinutes:30}}});
  const r=auditProductionConceptAlignment({operationalState:s as any, previousMainZoneContinuity:{finalLargestMainZoneGapMinutes:0}});
  assert.equal(r.verdict, "conceptually_misaligned");
  assert.equal(r.macroPlannerRequired, true);
  for (const c of ["macro_day_shape_missing","main_zone_visible_idle","critical_resource_span_imbalance","call_time_not_linked_to_first_productive_task"]) assert.ok(codes(r).includes(c), c);
});
