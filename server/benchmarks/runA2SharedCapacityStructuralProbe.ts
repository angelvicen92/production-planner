import assert from "node:assert/strict";
import { buildCanonicalFullA2EngineInput } from "../../engine/planner-next/benchmarks/canonicalFullA2EngineInput";
import { buildAssistedProblem } from "../../engine/planner-next/assistedPlanning";
import { constructExactMainAndFeederCore } from "../../engine/planner-next/exactMainAndFeederCore";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";
import { resolveAssistedScope } from "../assistedScopeResolver";

/** Runs the real A2 S1 projection through core architecture evaluation, never standalone search. */
export function runA2SharedCapacityStructuralProbe(branchBudget = 300_000) {
  const canonical = buildCanonicalFullA2EngineInput({ planId: 711, branchBudget });
  const adapter = adaptEngineInputToPlannerNextProblem(canonical.input);
  assert.equal(adapter.status, "SUPPORTED");
  if (adapter.status !== "SUPPORTED") throw new Error("canonical A2 adapter is unsupported");
  const mainFlowSpaceId = canonical.input.plannerNext?.mainFlow?.spaceId;
  assert.ok(mainFlowSpaceId != null);
  const resolution = resolveAssistedScope(canonical.input, adapter,
    { kind: "SPACE", spaceId: mainFlowSpaceId });
  const assisted = buildAssistedProblem(adapter.problem, resolution.scope, []);
  const before = JSON.stringify(assisted.problem);
  const result = constructExactMainAndFeederCore(assisted.problem);
  assert.equal(JSON.stringify(assisted.problem), before);
  const evidence = result.evidence;
  return {
    coreStatus: result.status,
    coreReasonCodes: evidence.reasonCodes,
    branchesExplored: evidence.branchesExplored,
    effectiveInConfiguration: {
      targetGroupSize: canonical.input.arrivalGroupingTarget,
      maximumGroupSize: canonical.input.arrivalMaximumGroupSize ?? canonical.input.vanCapacity,
      minGapMinutes: canonical.input.arrivalMinGapMinutes,
    },
    architecturesChecked: evidence.architecturesChecked,
    sharedCapacityChecksByAuthority: evidence.prerequisiteSharedCapacityChecksByAuthority,
    sharedCapacityAbstentionsByAuthority: evidence.prerequisiteSharedCapacityAbstentionsByAuthority,
    sharedCapacityPrunes: evidence.prerequisiteSharedCapacityPrunes,
    firstSharedCapacityPrune: evidence.firstSharedCapacityPrune,
    firstSharedCapacityPass: evidence.firstSharedCapacityPass,
    firstArchitectureReachingNominalMatching: evidence.firstExactArchitecture,
    fingerprint: evidence.sharedCapacityFingerprint,
    inputImmutable: JSON.stringify(assisted.problem) === before,
  };
}

if (import.meta.url === `file://${process.argv[1]}`)
  process.stdout.write(`${JSON.stringify(runA2SharedCapacityStructuralProbe(), null, 2)}\n`);
