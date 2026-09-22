import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildAssistedProblem } from "../assistedPlanning";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { analyticalFutureEligibleTaskIds, resolveAssistedScope } from "../../../server/assistedScopeResolver";
import { buildCanonicalFullA2EngineInput } from "./canonicalFullA2EngineInput";

/** The single benchmark projection of the same first SPACE stage requested by product. */
export function buildCanonicalA2AssistedStage1Fixture(branchBudget=100_000,planId?:number) {
  const canonical=buildCanonicalFullA2EngineInput({branchBudget,...(planId===undefined?{}:{planId})});
  const adapter=adaptEngineInputToPlannerNextProblem(canonical.input);
  assert.equal(adapter.status,"SUPPORTED");
  if(adapter.status!=="SUPPORTED")throw new Error("canonical A2 adapter is unsupported");
  const mainFlowSpaceId=canonical.input.plannerNext?.mainFlow?.spaceId;
  assert.ok(mainFlowSpaceId!=null,"canonical A2 requires a main-flow space");
  const selector={kind:"SPACE" as const,spaceId:mainFlowSpaceId};
  const resolution=resolveAssistedScope(canonical.input,adapter,selector);
  const futureEligible=analyticalFutureEligibleTaskIds(canonical.input,adapter.identityMap);
  const assisted=buildAssistedProblem(adapter.problem,resolution.scope,[],futureEligible);
  return {canonical,input:canonical.input,adapter,selector,resolution,scope:resolution.scope,futureEligible,assisted};
}

export const fingerprintCanonicalA2AssistedStage1Problem=(fixture:ReturnType<typeof buildCanonicalA2AssistedStage1Fixture>):string=>
  createHash("sha256").update(JSON.stringify({problem:fixture.assisted.problem,scope:fixture.scope,
    futureEligible:[...fixture.futureEligible].sort()})).digest("hex");
