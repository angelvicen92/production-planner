import test from "node:test";
import assert from "node:assert/strict";
import { compareCompactPlanning, compareOperationalMetrics, evaluateReplayOperationalMetrics, parseHHMMToMinutes, toOptionalNumber } from "./replayOperationalMetrics";
import type { EngineInput } from "../types";

const input = (): EngineInput => ({ planId:1, workDay:{start:"09:00",end:"18:00"}, meal:{start:"13:00",end:"14:00"}, camerasAvailable:2, tasks:[
 {id:1,planId:1,templateId:10,templateName:"A",zoneId:1,spaceId:101,contestantId:1,status:"pending",dependsOnTaskIds:[]},
 {id:2,planId:1,templateId:10,templateName:"A",zoneId:1,spaceId:101,contestantId:1,status:"pending"},
 {id:3,planId:1,templateId:11,templateName:"B",zoneId:1,spaceId:102,contestantId:1,status:"pending",dependsOnTaskIds:[2]},
 {id:4,planId:1,templateId:99,templateName:"Meal",zoneId:2,spaceId:201,contestantId:1,status:"pending",breakKind:"itinerant_meal"},
 {id:5,planId:1,templateId:12,templateName:"C",zoneId:2,spaceId:201,contestantId:null,status:"pending",operationalRole:"space_break_placeholder"},
 {id:6,planId:1,templateId:13,templateName:"Protected",zoneId:1,spaceId:101,contestantId:2,status:"done",startPlanned:"10:00",endPlanned:"10:30"},
 {id:7,planId:1,templateId:14,templateName:"D",zoneId:2,spaceId:202,contestantId:2,status:"pending"},
 ], locks:[], zoneResourceAssignments:{}, spaceResourceAssignments:{}, zoneResourceTypeRequirements:{}, spaceResourceTypeRequirements:{}, planResourceItems:[], resourceItemComponents:{}, groupingZoneIds:[1], optimizerMainZoneId:1, spaceIdsByZoneId:{1:[101,102]}, maxTemplateChangesByZoneId:{1:0}, contestantAvailabilityById:{2:{start:"09:00",end:"10:15"}} });
const output = { plannedTasks:[
 {taskId:1,startPlanned:"09:00",endPlanned:"09:30",assignedSpace:101,assignedResources:[1]},
 {taskId:2,startPlanned:"09:30",endPlanned:"10:00",assignedSpace:101,assignedResources:[1]},
 {taskId:3,startPlanned:"10:20",endPlanned:"10:50",assignedSpace:102,assignedResources:[2]},
 {taskId:4,startPlanned:"10:05",endPlanned:"10:15",assignedSpace:201,assignedResources:[]},
 {taskId:5,startPlanned:"09:35",endPlanned:"09:50",assignedSpace:201,assignedResources:[]},
 {taskId:6,startPlanned:"09:55",endPlanned:"10:25",assignedSpace:101,assignedResources:[3]},
 {taskId:7,startPlanned:"10:10",endPlanned:"10:40",assignedSpace:202,assignedResources:[3]},
 ], unplanned:[{taskId:8}] };

test("optional number conversion is null-safe", () => { assert.equal(toOptionalNumber(null), null); assert.equal(toOptionalNumber(undefined), null); assert.equal(toOptionalNumber(""), null); assert.equal(toOptionalNumber("12"), 12); assert.equal(toOptionalNumber(12), 12); assert.equal(toOptionalNumber(NaN), null); assert.equal(toOptionalNumber(Infinity), null); assert.equal(toOptionalNumber({}), null); assert.equal(toOptionalNumber([]), null); });
test("HH:mm parser rejects invalid values and does not support midnight rollover", () => { assert.equal(parseHHMMToMinutes("09:05"), 545); assert.equal(parseHHMMToMinutes("24:00"), null); assert.equal(parseHHMMToMinutes("9:00"), null); assert.equal(parseHHMMToMinutes(""), null); });
test("operational metrics cover makespan gaps meals templates overlaps deps availability protected", () => { const r=evaluateReplayOperationalMetrics(input(), output); const m=r.operationalMetrics; assert.equal(m.makespanMinutes,110); assert.equal(m.productiveTaskCount,5); assert.equal(m.contestantMealTaskCount,1); assert.equal(m.syntheticTaskCount,1); assert.equal(m.unplannedTaskCount,1); assert.equal(m.totalContestantIdleMinutes,10); assert.equal(m.maximumContestantIdleMinutes,10); assert.equal(m.totalContestantSpanMinutes,155); assert.equal(m.maximumContestantSpanMinutes,110); assert.equal(m.mainZoneVisibleIdleMinutes,0); assert.equal(m.mainZoneLargestGapMinutes,0); assert.equal(m.mainZoneGapCount,0); assert.equal(m.templateChangesByZoneId["1"].changes,2); assert.equal(m.zonesExceedingTemplateChangeLimit.includes("1"), true); assert.ok(m.contestantOverlapCount>=1); assert.ok(m.spaceOverlapCount>=1); assert.ok(m.resourceOverlapCount>=1); assert.equal(m.dependencyViolationCount,0); assert.ok(m.availabilityViolationCount>=1); assert.ok(m.protectedTaskMutationCount>=1); assert.equal(r.operationalMetricsMs < 1000, true); });
test("main-zone continuity merges overlapping and contiguous intervals", () => { const r=evaluateReplayOperationalMetrics(input(), {plannedTasks:[{taskId:1,startPlanned:"09:00",endPlanned:"09:30",assignedSpace:101},{taskId:2,startPlanned:"09:20",endPlanned:"09:40",assignedSpace:101},{taskId:3,startPlanned:"09:40",endPlanned:"10:00",assignedSpace:102}], unplanned:[]}); assert.equal(r.operationalMetrics.mainZoneGapCount,0); assert.equal(r.operationalMetrics.mainZoneVisibleIdleMinutes,0); });
test("planning equivalence detects metadata-only, timing, and resource changes", () => { const a=evaluateReplayOperationalMetrics(input(), output).compactPlanning; const b=a.map(x=>({...x, templateName:"changed metadata"})); assert.equal(compareCompactPlanning(a,b).equivalentPlanning,true); const c=a.map(x=>x.taskId===1?{...x,startPlanned:"09:01"}:x); assert.equal(compareCompactPlanning(a,c).timingChangedTaskCount,1); const d=a.map(x=>x.taskId===1?{...x,assignedResourceIds:[99]}:x); assert.equal(compareCompactPlanning(a,d).assignmentChangedTaskCount,1); });
test("metric comparison reports improved worsened equal unavailable with directions", () => { const cmp=compareOperationalMetrics({makespanMinutes:10,plannedTaskCount:1,unplannedTaskCount:1,totalTemplateChanges:null},{makespanMinutes:8,plannedTaskCount:1,unplannedTaskCount:2,totalTemplateChanges:null}); assert.equal(cmp.makespanMinutes.assessment,"improved"); assert.equal(cmp.unplannedTaskCount.assessment,"worsened"); assert.equal(cmp.plannedTaskCount.assessment,"equal"); assert.equal(cmp.totalTemplateChanges.assessment,"unavailable"); });
