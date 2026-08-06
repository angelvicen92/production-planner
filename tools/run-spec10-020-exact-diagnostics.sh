#!/usr/bin/env bash
set -euo pipefail

if [[ "$(git branch --show-current)" != "spec10-020-flexible-setup-order" ]]; then
  echo "Expected branch spec10-020-flexible-setup-order" >&2
  exit 1
fi

tmp=".spec10-020-exact-diagnostic.ts"
trap 'rm -f "$tmp"' EXIT
cat > "$tmp" <<'TS'
import { createSpec10017JointGroupEngineInputFixture, createSpec10020FlexibleSetupOrderEngineInputFixture } from "./engine/planner-next/integration/engineInputAdapter.fixture";
import { preflightEngineInputForPlannerNext } from "./engine/planner-next/integration/engineInputPreflight";
import { adaptEngineInputToPlannerNextProblem } from "./engine/planner-next/integration/engineInputAdapter";
import { preflight } from "./engine/planner-next/validate";
import { executePlannerNext } from "./engine/planner-next/executePlannerNext";
import { runSpec10017Probe } from "./engine/planner-next/benchmarks/runSpec10017JointGroupsBenchmark";
import { analyzeCanonicalFullA2Representability, createCanonicalFullA2Template, expandCanonicalFullA2Template } from "./engine/planner-next/benchmarks/focal-a2/full-day/canonicalFullA2Template";

const inspectInput = (name: string, input: ReturnType<typeof createSpec10020FlexibleSetupOrderEngineInputFixture>) => {
  const enginePreflight = preflightEngineInputForPlannerNext(input);
  const adapter = adaptEngineInputToPlannerNextProblem(input);
  const plannerPreflight = adapter.status === "SUPPORTED" && adapter.problem ? preflight(adapter.problem) : [];
  const execution = adapter.status === "SUPPORTED" && adapter.problem ? executePlannerNext(adapter.problem) : null;
  console.log(JSON.stringify({
    name,
    enginePreflight: { status: enginePreflight.status, reasons: enginePreflight.reasonCodes },
    adapter: { status: adapter.status, reasons: adapter.reasonCodes },
    plannerPreflight,
    execution: execution && execution.kind === "EXACT_CONSTRUCTIVE" ? {
      kind: execution.kind,
      status: execution.result.status,
      complete: execution.result.complete,
      reasons: execution.result.evidence.reasonCodes,
      coreStatus: execution.result.evidence.coreStatus,
      coreReasons: execution.result.evidence.coreReasonCodes,
      branchesExplored: execution.result.evidence.branchesExplored,
      coreBranches: execution.result.evidence.coreBranches,
      standaloneBranches: execution.result.evidence.standaloneBranches,
      coreCompleteLeavesEvaluated: execution.result.evidence.coreCompleteLeavesEvaluated,
      coreLeavesRejectedByStandalone: execution.result.evidence.coreLeavesRejectedByStandalone,
      setupBlockSearchInvocations: execution.result.evidence.setupBlockSearchInvocations,
      setupBlockBranchesExplored: execution.result.evidence.setupBlockBranchesExplored,
      setupBlockCompleteCandidateCount: execution.result.evidence.setupBlockCompleteCandidateCount,
      setupBlockBudgetExhaustions: execution.result.evidence.setupBlockBudgetExhaustions,
      setupOrders: execution.result.evidence.setupFamilyOrderCandidateCountsBySpaceId,
    } : execution,
  }, null, 2));
};

const jointInput = createSpec10017JointGroupEngineInputFixture();
const jointPreflight = preflightEngineInputForPlannerNext(jointInput);
const jointAdapter = adaptEngineInputToPlannerNextProblem(jointInput);
console.log(JSON.stringify({
  name: "joint-direct",
  enginePreflight: { status: jointPreflight.status, reasons: jointPreflight.reasonCodes },
  adapter: { status: jointAdapter.status, reasons: jointAdapter.reasonCodes },
  plannerPreflight: jointAdapter.status === "SUPPORTED" && jointAdapter.problem ? preflight(jointAdapter.problem) : [],
}, null, 2));
try {
  const probe = runSpec10017Probe();
  console.log(JSON.stringify({ name: "joint-probe", ok: true, engineInputPreflightStatus: probe.engineInputPreflightStatus }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ name: "joint-probe", ok: false, error: error instanceof Error ? error.stack : String(error) }, null, 2));
}

inspectInput("flexible-setup", createSpec10020FlexibleSetupOrderEngineInputFixture());
const analysis = analyzeCanonicalFullA2Representability(expandCanonicalFullA2Template(createCanonicalFullA2Template()));
console.log(JSON.stringify({
  name: "representability",
  jointGroupProbe: analysis.jointGroupProbe,
  setupPolicyProbe: analysis.setupPolicyProbe,
  blockers: analysis.implementationBlockers.map((item) => item.code),
  next: analysis.nextImplementationBlocker?.code ?? null,
}, null, 2));
TS

npm exec tsx -- "$tmp"
