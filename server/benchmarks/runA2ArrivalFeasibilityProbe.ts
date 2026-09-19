import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildCanonicalFullA2EngineInput } from "../../engine/planner-next/benchmarks/canonicalFullA2EngineInput";
import { buildAssistedProblem } from "../../engine/planner-next/assistedPlanning";
import { runExactMainAndFeederSearch } from "../../engine/planner-next/exactMainAndFeederCore";
import { adaptEngineInputToPlannerNextProblem } from "../../engine/planner-next/integration/engineInputAdapter";
import { assessCoreArrivalTransportFeasibility, type TransportArrivalFeasibility } from "../../engine/planner-next/transportGrouping";
import { resolveAssistedScope } from "../assistedScopeResolver";

/** Stops immediately after the first real A2 core leaf has run arrival Future Feasibility. */
export function runA2ArrivalFeasibilityProbe(branchBudget = 300_000) {
  const canonical = buildCanonicalFullA2EngineInput({ planId: 711, branchBudget });
  const adapter = adaptEngineInputToPlannerNextProblem(canonical.input);
  assert.equal(adapter.status, "SUPPORTED");
  if (adapter.status !== "SUPPORTED") throw new Error("canonical A2 adapter is unsupported");
  const spaceId = canonical.input.plannerNext?.mainFlow?.spaceId;
  assert.ok(spaceId != null);
  const scope = resolveAssistedScope(canonical.input, adapter, { kind: "SPACE", spaceId }).scope;
  const problem = buildAssistedProblem(adapter.problem, scope, []).problem;
  const before = JSON.stringify(problem);
  let arrival: TransportArrivalFeasibility | null = null;
  const started = performance.now();
  const core = runExactMainAndFeederSearch(problem, { onHardValidCoreLeaf(candidate) {
    arrival = assessCoreArrivalTransportFeasibility(problem, candidate.tasks);
    return "BUDGET_EXHAUSTED";
  } });
  const elapsedMs = Number((performance.now() - started).toFixed(3));
  assert.ok(arrival, "probe must reach a hard-valid core leaf");
  assert.equal(JSON.stringify(problem), before);
  const evidence = (arrival as TransportArrivalFeasibility).evidence;
  return { classification: evidence.classification, classificationBreakers: evidence.classificationBreakers,
    orderedDeadlines: evidence.orderedDeadlines, contiguousSizeStatesExplored: evidence.contiguousStatesExplored, packetSizes: evidence.packetSizes,
    starts: evidence.starts, feasibility: (arrival as TransportArrivalFeasibility).status,
    coreLeafTransportPrunes: Number((arrival as TransportArrivalFeasibility).status === "INFEASIBLE"),
    membershipFallbackEntered: Number(evidence.membershipFallbackEntered), coreBranches: core.evidence.branchesExplored,
    elapsedMs, inputImmutable: JSON.stringify(problem) === before };
}

if (import.meta.url === `file://${process.argv[1]}`)
  process.stdout.write(`${JSON.stringify(runA2ArrivalFeasibilityProbe(), null, 2)}\n`);
