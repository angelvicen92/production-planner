import test from "node:test";
import assert from "node:assert/strict";
import type { EngineInput } from "../../types";
import { resolveORCPlanningMode } from "./resolveORCPlanningMode";
const base=():EngineInput=>({planId:1,workDay:{start:"08:00",end:"18:00"},meal:{start:"13:00",end:"14:00"},camerasAvailable:1,tasks:[{id:1,planId:1,templateId:10,status:"pending",durationOverrideMin:30}],locks:[],zoneResourceAssignments:{},spaceResourceAssignments:{},zoneResourceTypeRequirements:{},spaceResourceTypeRequirements:{},planResourceItems:[],resourceItemComponents:{},groupingZoneIds:[]});
test("resolves INITIAL_CONSTRUCTION without official hard-valid complete planning",()=>{ assert.equal(resolveORCPlanningMode(base()).planningMode,"INITIAL_CONSTRUCTION"); });
test("resolves REPLANNING for protected execution or locks",()=>{ const input=base(); input.tasks[0].status="in_progress"; input.tasks[0].startPlanned="08:00"; input.tasks[0].endPlanned="08:30"; assert.equal(resolveORCPlanningMode(input).planningMode,"REPLANNING"); const locked=base(); locked.locks=[{id:1,planId:1,taskId:1,lockType:"time",lockedStart:"08:00",lockedEnd:"08:30"}]; assert.equal(resolveORCPlanningMode(locked).planningMode,"REPLANNING"); });
test("resolves IMPROVEMENT only with canonical hard-valid evidence",()=>{ const input=base() as any; input.tasks[0].startPlanned="08:00"; input.tasks[0].endPlanned="08:30"; input.canonicalValidation={result:"VALID"}; assert.equal(resolveORCPlanningMode(input).planningMode,"IMPROVEMENT"); });
