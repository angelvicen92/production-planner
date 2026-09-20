import test from "node:test";
import assert from "node:assert/strict";
import { expandVisiblePrerequisites, resolveAssistedScope } from "./assistedScopeResolver";

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

test("includePrerequisites authority expands only eligible prerequisites, never analytical future work",()=>{
 const richInput:any={planId:7,tasks:[{id:1,status:"pending",spaceId:4},{id:3,status:"interrupted",spaceId:4},{id:8,status:"pending",spaceId:9}]};
 const task=(id:string,participantId:string,dependencies:string[]=[])=>({id,kind:"auxiliary",duration:5,spaceId:"S-four",participantId,dependencies});
 const richAdapter:any={status:"SUPPORTED",identityMap:[1,3,8].map(id=>({namespace:"task",sourceId:String(id),canonicalId:`T-${id}`})),problem:{
   day:{start:0,end:60},spaces:[{id:"S-four",availability:[{start:0,end:60}]}],resources:[],
   participants:[{id:"p",availability:[{start:0,end:60}]},{id:"future-p",availability:[{start:0,end:60}]}],coaches:[],
   tasks:[task("T-1","p",["T-3"]),task("T-3","p"),task("T-8","future-p")],
   mainFlow:{spaceId:"S-four",preferredEnd:60,continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1},
   participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:{bestK:1,maxBacktracks:5,maxPatterns:5,maxBranchExpansions:50},
 }};
 const hidden=resolveAssistedScope(richInput,richAdapter,{kind:"TASK_IDS",taskIds:[1]});
 assert.deepEqual(hidden.productTaskIds,[1]); assert.deepEqual(hidden.scope.resolvedTaskIds,["T-1"]);
 const visible=expandVisiblePrerequisites(richInput,hidden,richAdapter);
 assert.deepEqual(visible.productTaskIds,[1,3]); assert.deepEqual(visible.scope.resolvedTaskIds,["T-1","T-3"]);
 assert.equal(visible.scope.resolvedTaskIds.includes("T-8"),false);
});
