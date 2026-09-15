import test from "node:test";
import assert from "node:assert/strict";
import { resolveAssistedScope } from "./assistedScopeResolver";

const input:any={planId:7,tasks:[
 {id:1,status:"pending",spaceId:4},{id:2,status:"cancelled",spaceId:4},
 {id:3,status:"interrupted",spaceId:4},{id:4,status:"done",spaceId:4},
 {id:5,status:"in_progress",spaceId:4},{id:8,status:"pending",spaceId:9}]};
const adapter:any={status:"SUPPORTED",problem:{tasks:[]},identityMap:[
 ...[1,2,3,4,5,8].map(id=>({namespace:"task",sourceId:String(id),canonicalId:`T-${id}`})),
 {namespace:"space",sourceId:"4",canonicalId:"S-four"},{namespace:"space",sourceId:"9",canonicalId:"S-nine"}]};

test("TASK_IDS accepts only pending/interrupted product obligations",()=>{
 const result=resolveAssistedScope(input,adapter,{kind:"TASK_IDS",taskIds:[3,1]});
 assert.deepEqual(result.productTaskIds,[1,3]); assert.deepEqual(result.scope.resolvedTaskIds,["T-1","T-3"]);
 for(const id of [2,4,5]) assert.throws(()=>resolveAssistedScope(input,adapter,{kind:"TASK_IDS",taskIds:[id]}),/INVALID_SCOPE/);
});
test("SPACE resolves only pending/interrupted while protected and cancelled remain context",()=>{
 const result=resolveAssistedScope(input,adapter,{kind:"SPACE",spaceId:4});
 assert.deepEqual(result.productTaskIds,[1,3]);
 assert.throws(()=>resolveAssistedScope(input,adapter,{kind:"SPACE",spaceId:404}),/INVALID_SCOPE/);
});
