import assert from "node:assert/strict";
import test from "node:test";
import { AssistedProposalError, AssistedProposalService, type AssistedProposalRunAccess } from "./assistedProposalService";

const request = { selector: { kind: "TASK_IDS" as const, taskIds: [101] }, includePrerequisites: false,
  expectedDraftFingerprint: "a".repeat(64), expectedBaseStageId: 4 };
function access(overrides: Partial<AssistedProposalRunAccess> = {}): AssistedProposalRunAccess {
  return {
    create: async () => ({data:{id:9},error:null}), find: async () => ({data:null,error:null}),
    fail: async () => ({error:null}), finish: async () => ({error:null}), apply: async () => ({error:null}), ...overrides,
  };
}

test("request requires an ACTIVE session before creating or scheduling a run", async () => {
  let created=0; let deferred=0;
  const runs=access({create:async()=>{created++;return {data:{id:9},error:null};}});
  const service=new AssistedProposalService({getActiveAssistedPlanningSession:async()=>null} as any,()=>{deferred++;},runs);
  await assert.rejects(service.request(701,request),(error:unknown)=>error instanceof AssistedProposalError&&error.code==="RUN_SESSION_MISMATCH");
  assert.equal(created,0); assert.equal(deferred,0);
});

test("apply performs one RPC and propagates stale guards without client-side writes", async () => {
  let applies=0; let creates=0; let failures=0; let finishes=0;
  const runs=access({
    create:async()=>{creates++;return {data:{id:1},error:null};}, fail:async()=>{failures++;return {error:null};},
    finish:async()=>{finishes++;return {error:null};},
    apply:async parameters=>{applies++;assert.deepEqual(parameters,{p_plan_id:701,p_run_id:9,p_expected_fingerprint:"a".repeat(64),p_expected_base:4});return {error:{message:"STALE_DRAFT"}};},
  });
  const service=new AssistedProposalService({} as any,queueMicrotask,runs);
  await assert.rejects(service.apply(701,9,"a".repeat(64),4),(error:unknown)=>error instanceof AssistedProposalError&&error.code==="STALE_DRAFT");
  assert.deepEqual({applies,creates,failures,finishes},{applies:1,creates:0,failures:0,finishes:0});
});

test("get rejects a run belonging to another plan or execution kind as RUN_NOT_FOUND", async () => {
  const service=new AssistedProposalService({} as any,queueMicrotask,access({find:async()=>({data:null,error:null})}));
  await assert.rejects(service.get(702,9),(error:unknown)=>error instanceof AssistedProposalError&&error.code==="RUN_NOT_FOUND");
});
