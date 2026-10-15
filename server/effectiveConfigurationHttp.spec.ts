import assert from "node:assert/strict";
import test from "node:test";
import { getEffectiveConfigurationResponse } from "./effectiveConfigurationHttp";
import { PlanPlannerNextConfigurationError } from "./planPlannerNextConfiguration";

test("effective configuration API rejects invalid plan ids before storage",async()=>{
  const result=await getEffectiveConfigurationResponse({getPlan:()=>{throw new Error("should not run")}} as any,"nope");
  assert.deepEqual(result,{status:400,body:{message:"Plan inválido"}});
});

test('known configuration conflicts have an actionable public category without internal identifiers',async()=>{
 for(const reason of ['TASK_OPERATIONS_MISMATCH','LOCKED_LEGACY_BREAK','INVALID_CONTRACT'] as const){
  const failure=new PlanPlannerNextConfigurationError(reason,{inputTaskCount:318,operationCount:266});
  const response=await getEffectiveConfigurationResponse({getPlan:async()=>{throw failure;}} as any,'27002');
  assert.equal(response.status,500);assert.equal((response.body as any).code,'PLANNING_CONFIGURATION_CONFLICT');
  assert.match(response.body.message,/revis/i);
  assert.doesNotMatch(JSON.stringify(response.body),/318|266|TASK_OPERATIONS|LOCKED_LEGACY|INVALID_CONTRACT|plan_breaks|stack|cause/);
 }
});

test("effective configuration API maps a missing real plan without Assisted state",async()=>{
  const result=await getEffectiveConfigurationResponse({getPlan:async()=>undefined} as any,"42");
  assert.deepEqual(result,{status:404,body:{message:"Plan no encontrado"}});
});

test("authority failures return a useful JSON 500 without fabricating configuration or exposing database internals",async()=>{
  const storage={getPlan:async()=>{throw Object.assign(new Error("column main_before_meal_blocks does not exist"),{code:"42703"});}};
  const result=await getEffectiveConfigurationResponse(storage as any,"42");
  assert.equal(result.status,500);
  assert.equal((result.body as any).code,"EFFECTIVE_CONFIGURATION_UNAVAILABLE");
  assert.match(result.body.message,/versión del esquema/);
  assert.doesNotMatch(JSON.stringify(result.body),/main_before|42703|values/);
});
