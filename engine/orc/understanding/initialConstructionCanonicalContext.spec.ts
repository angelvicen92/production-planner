import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildInitialConstructionCanonicalContext } from "./initialConstructionCanonicalContext";

const input:any={tasks:[{id:2,status:"pending",contestantId:1,templateId:20,dependsOnTaskId:1},{id:1,status:"pending",contestantId:1,templateId:10},{id:3,status:"pending",contestantId:1,templateId:30,dependsOnTemplateId:20}]};

describe("initialConstructionCanonicalContext",()=>{
  it("builds a readonly fallback context once",()=>{
    const built=buildInitialConstructionCanonicalContext({input});
    assert.equal(built.canonicalContextBuildCount,1);
    assert.equal(built.dependencyGraphFallbackResolutionCount,1);
    assert.equal(built.hotPathDependencyGraphResolutionCount,0);
    assert.equal(built.context.source,"single-resolution-fallback");
    assert.deepEqual(built.context.taskIds,[1,2,3]);
    assert.deepEqual(built.context.prerequisitesByTaskId.get(3),[2]);
    assert.deepEqual(built.context.topologicalTaskIds,[1,2,3]);
    assert.equal(typeof built.context.fingerprint,"string");
  });
  it("reuses stage1 graph without fallback resolution",()=>{
    const fallback=buildInitialConstructionCanonicalContext({input});
    const stage1={initialConstructionMap:{dependencyGraph:fallback.context.dependencyGraph}};
    const built=buildInitialConstructionCanonicalContext({input,stage1});
    assert.equal(built.context.source,"stage1-initial-construction-map");
    assert.equal(built.dependencyGraphFallbackResolutionCount,0);
    assert.deepEqual(built.context.prerequisitesByTaskId.get(2),[1]);
    assert.deepEqual(built.context.dependentsByTaskId.get(2),[3]);
  });
});
