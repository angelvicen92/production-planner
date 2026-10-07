import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalFullA2EngineInput } from "../../engine/planner-next/benchmarks/canonicalFullA2EngineInput";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";
import { resolveAssistedScope } from "../assistedScopeResolver";
import { canonicalA2ManualSelectors } from "./runA2Assist8ManualEvidence";

test("manual A2 product flow declares five explicit supported user scopes without the recommender",()=>{
  const {input}=buildCanonicalFullA2EngineInput(),adapter=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapter.status,"SUPPORTED");
  if(adapter.status!=="SUPPORTED")return;const selectors=canonicalA2ManualSelectors();assert.equal(selectors.length,5);
  for(const selector of selectors)assert.ok(resolveAssistedScope(input,adapter,selector).scope.resolvedTaskIds.length>0);
  const itinerary=selectors[4];assert.equal(itinerary?.kind,"TASK_IDS");if(itinerary?.kind!=="TASK_IDS")return;
  assert.ok(itinerary.taskIds.every(id=>{const task=input.tasks.find(item=>item.id===id);return JSON.stringify([...(task?.allowedItinerantTeamIds??[])].sort((a,b)=>a-b))===JSON.stringify([5001,5002]);}));
});
