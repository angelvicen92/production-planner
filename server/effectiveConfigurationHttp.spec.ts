import assert from "node:assert/strict";
import test from "node:test";
import { getEffectiveConfigurationResponse } from "./effectiveConfigurationHttp";

test("effective configuration API rejects invalid plan ids before storage",async()=>{
  const result=await getEffectiveConfigurationResponse({getPlan:()=>{throw new Error("should not run")}} as any,"nope");
  assert.deepEqual(result,{status:400,body:{message:"Plan inválido"}});
});

test("effective configuration API maps a missing real plan without Assisted state",async()=>{
  const result=await getEffectiveConfigurationResponse({getPlan:async()=>undefined} as any,"42");
  assert.deepEqual(result,{status:404,body:{message:"Plan no encontrado"}});
});
