#!/usr/bin/env bash
set -uo pipefail
set +H

OUTPUT="plan-27-orc-causal-branch-outcome-memory-v1.json"
RUN_A="/tmp/plan-27-id319-run-a.json"
RUN_B="/tmp/plan-27-id319-run-b.json"
TMP_OUTPUT="/tmp/plan-27-id319-consolidated.json"

rm -f \
  "$OUTPUT" \
  "$RUN_A" \
  "$RUN_B" \
  "$TMP_OUTPUT" \
  /tmp/plan-27-id318-run-a.json \
  /tmp/plan-27-id318-run-b.json \
  /tmp/plan-27-id318-consolidated.json
trap 'rm -f "$RUN_A" "$RUN_B" "$TMP_OUTPUT"' EXIT

failures=0
checks_json='[]'

add_check() {
  local name="$1"
  local status="$2"
  checks_json=$(
    node -e '
      const checks = JSON.parse(process.argv[1]);
      checks.push({
        name: process.argv[2],
        passed: process.argv[3] === "pass"
      });
      console.log(JSON.stringify(checks));
    ' "$checks_json" "$name" "$status"
  )
}

run_check() {
  local name="$1"
  shift
  if "$@"; then
    add_check "$name" pass
  else
    add_check "$name" fail
    failures=$((failures + 1))
  fi
}

SNAPSHOT="${PLAN27_SNAPSHOT:-${1:-local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json}}"

# Presupuesto exacto utilizado por ID 317.
BUDGET='{"constructionSearchStrategy":"critical_chain_retained_alternatives","maxElapsedMs":90000,"maxExpandedPartialPlans":200,"maxGeneratedPartialPlans":600,"maxSuspendedPartialPlans":16,"initialExecutableFrontierBatchSize":4,"maxExecutableFrontierTasksScannedPerExpansion":32,"maxBranchEvaluationsPerFrontierTask":48,"maxRetainedValidBranchesPerFrontierTask":3,"maxChildrenPerDecision":3,"maxCrossCycleBacktracks":32,"initialTemporalCandidateBatchSize":8,"maxTemporalCandidatesPerAnchor":24,"maxBranchEvaluationsPerAnchor":48}'

run_check "npm run check" npm run check

TEST_FILES=(
  engine/orc/understanding/initialConstructionTaskUniverse.spec.ts
  engine/orc/understanding/initialConstructionMap.spec.ts
  engine/orc/understanding/initialConstructionExecutableFrontierPortfolio.spec.ts
  engine/orc/see/initialConstructionAnchorSelector.spec.ts
  engine/orc/see/initialConstructionBranchBuilder.spec.ts
  engine/orc/active/initialConstructionAnchorBlockerClassifier.spec.ts
  engine/orc/active/materializeInitialConstructionAnchorAttempt.spec.ts
  engine/orc/active/expandInitialConstructionPartialPlanOnce.spec.ts
  engine/orc/active/initialConstructionPartialPlanFutureFeasibility.spec.ts
  engine/orc/active/initialConstructionSuspendedFrontier.spec.ts
  engine/orc/active/conflictDirectedInitialConstructionBackjump.spec.ts
  engine/orc/active/initialConstructionCausalDecisionCheckpoint.spec.ts
  engine/orc/active/initialConstructionCausalBranchOutcomeLedger.spec.ts
  engine/orc/active/runInitialConstructionIterativeSession.spec.ts
  engine/orc/transformation/transformationEngine.spec.ts
  engine/orc/simulation/simulationEngine.spec.ts
  engine/orc/validation/validationEngine.spec.ts
  engine/tools/runInitialConstructionBenchmark.spec.ts
)

missing_test=0
for file in "${TEST_FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: falta el test esperado: $file" >&2
    missing_test=1
  fi
done

if [[ "$missing_test" -eq 0 ]]; then
  run_check "ORC focal regression suite" \
    npx tsx --test --test-reporter=dot "${TEST_FILES[@]}"
else
  add_check "ORC focal regression suite" fail
  failures=$((failures + 1))
fi

if [[ -f "$SNAPSHOT" ]]; then
  run_check "benchmark run A" \
    npx tsx engine/tools/runInitialConstructionBenchmark.ts \
      "$SNAPSHOT" \
      "$BUDGET" \
      > "$RUN_A"

  run_check "benchmark run B" \
    npx tsx engine/tools/runInitialConstructionBenchmark.ts \
      "$SNAPSHOT" \
      "$BUDGET" \
      > "$RUN_B"
else
  echo "ERROR: no existe el snapshot de Plan 27: $SNAPSHOT" >&2
  echo '{}' > "$RUN_A"
  echo '{}' > "$RUN_B"
  add_check "benchmark inputs" fail
  failures=$((failures + 1))
fi

node - "$RUN_A" "$RUN_B" "$TMP_OUTPUT" "$checks_json" <<'NODE'
const fs = require("node:fs");

const [runAPath, runBPath, outputPath, checksRaw] =
  process.argv.slice(2);

const read = path => {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8") || "{}");
  } catch {
    return {};
  }
};

const a = read(runAPath);
const b = read(runBPath);
const checks = JSON.parse(checksRaw);

const id318Artifact = read(
  "plan-27-orc-causal-checkpoint-reopen-v1.json"
);
const id318 =
  Array.isArray(id318Artifact.runs) && id318Artifact.runs.length
    ? id318Artifact.runs[0]
    : id318Artifact.runA ?? {};

const stableEqual = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);

const budgetFields = [
  "maxElapsedMs",
  "maxSuspendedPartialPlans",
  "maxExpandedPartialPlans",
  "maxGeneratedPartialPlans",
  "maxTotalConstructivePartialPlans",
  "maxCriticalChainsPerDecision",
  "maxExecutableFrontierTasksPerChain",
  "maxRetainedChainBranches",
  "maxChildrenPerDecision",
  "maxCrossCycleBacktracks"
];

const normalizedBudget = run =>
  Object.fromEntries(
    budgetFields.map(key => [
      key,
      run?.resolvedRetainedAlternativesBudget?.[key] ?? null
    ])
  );

const budgetA = normalizedBudget(a);
const budgetB = normalizedBudget(b);
const budget318 = normalizedBudget(id318);

const sameBudgetAsID318 =
  stableEqual(budgetA, budget318) &&
  stableEqual(budgetB, budget318) &&
  budgetA.maxChildrenPerDecision === 3 &&
  budgetB.maxChildrenPerDecision === 3;

const deterministic =
  a.productiveAssignmentsReached ===
    b.productiveAssignmentsReached &&
  a.productiveTasksRemaining === b.productiveTasksRemaining &&
  a.expandedPartialPlanCount === b.expandedPartialPlanCount &&
  a.totalExpansionWorkUnitCount ===
    b.totalExpansionWorkUnitCount &&
  a.generatedAlternativeCount ===
    b.generatedAlternativeCount &&
  a.crossCycleBacktrackCount ===
    b.crossCycleBacktrackCount &&
  a.stopReason === b.stopReason &&
  stableEqual(
    a.finalProductiveAssignedTaskIds,
    b.finalProductiveAssignedTaskIds
  ) &&
  stableEqual(
    a.residualProductiveTaskIds,
    b.residualProductiveTaskIds
  ) &&
  stableEqual(
    a.selectedDecisionPath,
    b.selectedDecisionPath
  ) &&
  stableEqual(
    a.causalCheckpointSamples,
    b.causalCheckpointSamples
  ) &&
  stableEqual(
    a.causalSiblingRecoverySamples,
    b.causalSiblingRecoverySamples
  ) &&
  a.finalAssignmentsFingerprint ===
    b.finalAssignmentsFingerprint &&
  a.backtrackSelectionFingerprint ===
    b.backtrackSelectionFingerprint &&
  a.causalEvidenceFingerprint ===
    b.causalEvidenceFingerprint &&
  a.partialPlanSequenceFingerprint ===
    b.partialPlanSequenceFingerprint &&
  a.partialPlanGraphFingerprint ===
    b.partialPlanGraphFingerprint &&
  a.sessionFingerprint === b.sessionFingerprint;

const budgetPassedFor = run =>
  Number(
    run.totalExpansionWorkUnitCount ??
      run.expandedPartialPlanCount ??
      Infinity
  ) <= 200 &&
  Number(run.generatedAlternativeCount ?? Infinity) <= 600 &&
  Number(run.suspendedFrontierPeak ?? Infinity) <= 16 &&
  Number(run.crossCycleBacktrackCount ?? Infinity) <= 32 &&
  Number(run.exclusiveConstructiveRuntimeMs ?? Infinity) < 90000;

const budgetPassed =
  budgetPassedFor(a) && budgetPassedFor(b);

const branchOutcomeLedgerObserved =
  Number(a.causalBranchOutcomeLedgerEntryCount ?? 0) > 0 &&
  Number(b.causalBranchOutcomeLedgerEntryCount ?? 0) > 0;
const branchNoGoodObserved =
  Number(a.causalBranchNoGoodRegisteredCount ?? 0) > 0 &&
  Number(b.causalBranchNoGoodRegisteredCount ?? 0) > 0;
const branchSkipObserved =
  Number(a.causalFailedBranchSubtreeSkipCount ?? 0) > 0 &&
  Number(b.causalFailedBranchSubtreeSkipCount ?? 0) > 0 &&
  Number(a.nogoodTransitionActuallySkippedCount ?? 0) > 0 &&
  Number(b.nogoodTransitionActuallySkippedCount ?? 0) > 0 &&
  Number(a.repeatedEquivalentDeadEndActuallyAvoidedCount ?? 0) > 0 &&
  Number(b.repeatedEquivalentDeadEndActuallyAvoidedCount ?? 0) > 0;

const checkpointResolved =
  Number(a.causalDecisionCheckpointResolvedCount ?? 0) > 0 &&
  Number(b.causalDecisionCheckpointResolvedCount ?? 0) > 0;

const causalAlternativeObservedFor = run =>
  Number(run.existingCausalSiblingRecoveredCount ?? 0) +
    Number(run.evictedCausalSiblingRecoveredCount ?? 0) +
    Number(run.causalCheckpointReopenAcceptedCount ?? 0) >
  0;

const causalAlternativeObserved =
  causalAlternativeObservedFor(a) &&
  causalAlternativeObservedFor(b);

const baseline = {
  productiveAssignmentsReached:
    id318.productiveAssignmentsReached ?? null,
  productiveTasksRemaining:
    id318.productiveTasksRemaining ?? null,
  crossCycleBacktrackCount:
    id318.crossCycleBacktrackCount ?? null,
  finalAssignmentsFingerprint:
    id318.finalAssignmentsFingerprint ?? null
};

const nonRegressionPassed =
  Number(a.productiveAssignmentsReached ?? -1) >=
    Number(baseline.productiveAssignmentsReached ?? 32) &&
  Number(b.productiveAssignmentsReached ?? -1) >=
    Number(baseline.productiveAssignmentsReached ?? 32) &&
  Number(a.productiveTasksRemaining ?? Infinity) <=
    Number(baseline.productiveTasksRemaining ?? 142) &&
  Number(b.productiveTasksRemaining ?? Infinity) <=
    Number(baseline.productiveTasksRemaining ?? 142);

const productiveConstructionImproved =
  nonRegressionPassed &&
  Number(a.productiveAssignmentsReached ?? 0) >
    Number(baseline.productiveAssignmentsReached ?? 32) &&
  Number(b.productiveAssignmentsReached ?? 0) >
    Number(baseline.productiveAssignmentsReached ?? 32);

const contracts = {
  sameBudgetAsID318,
  deterministic,
  budgetPassed,
  checkpointResolved,
  branchOutcomeLedgerObserved,
  branchNoGoodObserved,
  branchSkipObserved,
  causalAlternativeObserved,
  nonRegressionPassed,
  productiveConstructionImproved,
  runA: {
    resolvedBudget: budgetA,
    productiveAssignmentsReached:
      a.productiveAssignmentsReached ?? null,
    productiveTasksRemaining:
      a.productiveTasksRemaining ?? null,
    expandedPartialPlanCount:
      a.expandedPartialPlanCount ?? null,
    totalExpansionWorkUnitCount:
      a.totalExpansionWorkUnitCount ?? null,
    generatedAlternativeCount:
      a.generatedAlternativeCount ?? null,
    suspendedFrontierPeak:
      a.suspendedFrontierPeak ?? null,
    crossCycleBacktrackCount:
      a.crossCycleBacktrackCount ?? null,
    exclusiveConstructiveRuntimeMs:
      a.exclusiveConstructiveRuntimeMs ?? null,
    stopReason: a.stopReason ?? null,
    existingCausalSiblingRecoveredCount:
      a.existingCausalSiblingRecoveredCount ?? null,
    causalCheckpointReopenAcceptedCount:
      a.causalCheckpointReopenAcceptedCount ?? null,
    causalBranchOutcomeLedgerEntryCount: a.causalBranchOutcomeLedgerEntryCount ?? null,
    causalBranchNoGoodRegisteredCount: a.causalBranchNoGoodRegisteredCount ?? null,
    causalFailedBranchSubtreeSkipCount: a.causalFailedBranchSubtreeSkipCount ?? null
  },
  runB: {
    resolvedBudget: budgetB,
    productiveAssignmentsReached:
      b.productiveAssignmentsReached ?? null,
    productiveTasksRemaining:
      b.productiveTasksRemaining ?? null,
    expandedPartialPlanCount:
      b.expandedPartialPlanCount ?? null,
    totalExpansionWorkUnitCount:
      b.totalExpansionWorkUnitCount ?? null,
    generatedAlternativeCount:
      b.generatedAlternativeCount ?? null,
    suspendedFrontierPeak:
      b.suspendedFrontierPeak ?? null,
    crossCycleBacktrackCount:
      b.crossCycleBacktrackCount ?? null,
    exclusiveConstructiveRuntimeMs:
      b.exclusiveConstructiveRuntimeMs ?? null,
    stopReason: b.stopReason ?? null,
    existingCausalSiblingRecoveredCount:
      b.existingCausalSiblingRecoveredCount ?? null,
    causalCheckpointReopenAcceptedCount:
      b.causalCheckpointReopenAcceptedCount ?? null,
    causalBranchOutcomeLedgerEntryCount: b.causalBranchOutcomeLedgerEntryCount ?? null,
    causalBranchNoGoodRegisteredCount: b.causalBranchNoGoodRegisteredCount ?? null,
    causalFailedBranchSubtreeSkipCount: b.causalFailedBranchSubtreeSkipCount ?? null
  },
  baselineID318: baseline
};

const result = {
  id: 319,
  artifact:
    "plan-27-orc-causal-branch-outcome-memory-v1",
  validationVersion:
    "ID319-SAME-BUDGET-AS-ID318-V1",
  checks,
  contracts,
  runA: a,
  runB: b
};

fs.writeFileSync(
  outputPath,
  JSON.stringify(result, null, 2)
);

console.log(
  JSON.stringify(
    {
      output:
        "plan-27-orc-causal-branch-outcome-memory-v1.json",
      sameBudgetAsID318,
      deterministic,
      budgetPassed,
      checkpointResolved,
      causalAlternativeObserved,
      nonRegressionPassed,
      productiveConstructionImproved,
      baselineID318: baseline,
      runA: contracts.runA,
      runB: contracts.runB
    },
    null,
    2
  )
);

if (
  !sameBudgetAsID318 ||
  !deterministic ||
  !budgetPassed ||
  !checkpointResolved ||
  !branchOutcomeLedgerObserved ||
  !branchNoGoodObserved ||
  !branchSkipObserved ||
  !nonRegressionPassed
) {
  process.exitCode = 2;
}
NODE

node_status=$?

if [[ -f "$TMP_OUTPUT" ]]; then
  cp "$TMP_OUTPUT" "$OUTPUT"
else
  echo "ERROR: no se creó el consolidado temporal" >&2
  failures=$((failures + 1))
fi

if [[ "$node_status" -ne 0 ]]; then
  failures=$((failures + 1))
fi

echo
if [[ -f "$OUTPUT" ]]; then
  echo "Artefacto generado:"
  ls -lh "$OUTPUT"
else
  echo "No se pudo generar $OUTPUT" >&2
fi

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi
