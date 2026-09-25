import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssistedScope } from "../../../server/assistedScopeResolver";
import { buildCanonicalA2AssistedStage1Fixture, fingerprintCanonicalA2AssistedStage1Problem } from "./canonicalA2AssistedStage1Fixture";

test("canonical A2 benchmark fixture is the product Stage-1 SPACE projection",()=>{
  const fixture=buildCanonicalA2AssistedStage1Fixture(5_000);
  const product=resolveAssistedScope(fixture.input,fixture.adapter,fixture.selector);
  assert.equal(product.productTaskIds.length,19);
  assert.deepEqual(product.productTaskIds,fixture.resolution.productTaskIds);
  assert.deepEqual(product.scope.resolvedTaskIds,fixture.scope.resolvedTaskIds);
  assert.ok(fixture.adapter.problem.transportPolicy?.arrival);
  assert.equal(fixture.futureEligible.size,fixture.input.tasks.filter(task=>task.status==="pending"||task.status==="interrupted").length);
  const second=buildCanonicalA2AssistedStage1Fixture(5_000);
  assert.equal(fingerprintCanonicalA2AssistedStage1Problem(fixture),fingerprintCanonicalA2AssistedStage1Problem(second));
});
