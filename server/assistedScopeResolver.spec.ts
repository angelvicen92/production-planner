import test from "node:test";
import assert from "node:assert/strict";
import { resolveAssistedScope } from "./assistedScopeResolver";

const input:any={planId:7,tasks:[{id:3,status:"pending",spaceId:4},{id:2,status:"cancelled",spaceId:4},{id:1,status:"pending",spaceId:4},{id:8,status:"pending",spaceId:9}]};
const adapter:any={status:"SUPPORTED",problem:{tasks:[]},identityMap:[
 {namespace:"task",sourceId:"1",canonicalId:"T-one"},{namespace:"task",sourceId:"3",canonicalId:"T-three"},
 {namespace:"task",sourceId:"8",canonicalId:"T-eight"},{namespace:"space",sourceId:"4",canonicalId:"S-four"},
 {namespace:"space",sourceId:"9",canonicalId:"S-nine"}]};
test("TASK_IDS resolves deterministically through identityMap",()=>{
 const result=resolveAssistedScope(input,adapter,{kind:"TASK_IDS",taskIds:[3,1]});
 assert.deepEqual(result.productTaskIds,[1,3]); assert.deepEqual(result.scope.resolvedTaskIds,["T-one","T-three"]);
 assert.throws(()=>resolveAssistedScope(input,adapter,{kind:"TASK_IDS",taskIds:[2]}),/INVALID_SCOPE/);
});
test("SPACE resolves active obligations without name inference",()=>{
 const result=resolveAssistedScope(input,adapter,{kind:"SPACE",spaceId:4});
 assert.deepEqual(result.productTaskIds,[1,3]);
 assert.throws(()=>resolveAssistedScope(input,adapter,{kind:"SPACE",spaceId:404}),/INVALID_SCOPE/);
});
