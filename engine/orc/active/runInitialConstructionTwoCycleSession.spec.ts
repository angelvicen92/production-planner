import test from "node:test"; import assert from "node:assert/strict";
import { runInitialConstructionTwoCycleSession } from "./runInitialConstructionTwoCycleSession";
test("two-cycle compatibility projection remains read-only when residual anchor is absent",()=>{ const r=runInitialConstructionTwoCycleSession({originInput:{tasks:[],workDay:{start:"09:00",end:"10:00"}} as any,originOperationalState:{id:"s",planning:[]} as any,stage2:{selectedAssignments:[]},stage3:{executed:false}}); assert.equal(r.executed,false); assert.equal(r.readOnly,true); });
