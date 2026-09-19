import assert from "node:assert/strict";
import { runA2AnonymousPipelineWitnessProbe } from "../../engine/planner-next/benchmarks/runA2AnonymousPipelineWitnessProbe";

/** Verifies arrival Future Feasibility on the current anonymous pipeline route. */
export function runA2ArrivalFeasibilityProbe() {
  const result = runA2AnonymousPipelineWitnessProbe();
  assert.equal(result.arrivalSolverExecuted, true, "anonymous witness must execute the arrival solver");
  assert.ok(result.arrivalClassification);
  return {
    classification: result.arrivalClassification,
    contiguousSizeStatesExplored: result.arrivalContiguousStatesExplored,
    feasibility: result.firstFeasibleRunCount == null ? "INFEASIBLE" : "FEASIBLE",
    membershipFallbackEntered: Number(result.arrivalMembershipFallbackEntered),
    inputImmutable: result.inputImmutable,
  };
}

if (import.meta.url === `file://${process.argv[1]}`)
  process.stdout.write(`${JSON.stringify(runA2ArrivalFeasibilityProbe(), null, 2)}\n`);
