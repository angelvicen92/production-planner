#!/usr/bin/env bash
set -euo pipefail
set +H

OUTPUT="plan-27-orc-structured-causal-backjump-v1.json"
RUN_A="/tmp/plan-27-structured-causal-backjump-a.json"
RUN_B="/tmp/plan-27-structured-causal-backjump-b.json"
SCENARIO="local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json"

BUDGET='{"constructionSearchStrategy":"critical_chain_retained_alternatives","maxElapsedMs":90000,"maxExpandedPartialPlans":200,"maxGeneratedPartialPlans":600,"maxSuspendedPartialPlans":16,"initialExecutableFrontierBatchSize":4,"maxExecutableFrontierTasksScannedPerExpansion":32,"maxBranchEvaluationsPerFrontierTask":48,"maxRetainedValidBranchesPerFrontierTask":3,"maxChildrenPerDecision":3,"maxCrossCycleBacktracks":32,"initialTemporalCandidateBatchSize":8,"maxTemporalCandidatesPerAnchor":24,"maxBranchEvaluationsPerAnchor":48}'

rm -f "$OUTPUT" "$RUN_A" "$RUN_B"

if [[ ! -f "$SCENARIO" ]]; then
  echo "ERROR: no existe el escenario: $SCENARIO" >&2
  exit 2
fi

npm run check

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
  engine/orc/active/runInitialConstructionIterativeSession.spec.ts
  engine/orc/transformation/transformationEngine.spec.ts
  engine/orc/simulation/simulationEngine.spec.ts
  engine/orc/validation/validationEngine.spec.ts
  engine/tools/runInitialConstructionBenchmark.spec.ts
)

for file in "${TEST_FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: falta el test esperado: $file" >&2
    exit 3
  fi
done

npx tsx --test --test-reporter=dot "${TEST_FILES[@]}"

npx tsx engine/tools/runInitialConstructionBenchmark.ts \
  "$SCENARIO" \
  "$BUDGET" \
  > "$RUN_A"

npx tsx engine/tools/runInitialConstructionBenchmark.ts \
  "$SCENARIO" \
  "$BUDGET" \
  > "$RUN_B"

node - "$RUN_A" "$RUN_B" "$OUTPUT" <<'NODE'
const fs = require("fs");

const [runAPath, runBPath, outputPath] = process.argv.slice(2);
const a = JSON.parse(fs.readFileSync(runAPath, "utf8"));
const b = JSON.parse(fs.readFileSync(runBPath, "utf8"));

const same = key => JSON.stringify(a[key]) === JSON.stringify(b[key]);

const requiredEvidenceKeys = [
  "structuredCausalConflictBuildCount",
  "structuredCausalConflictEvidenceCompleteCount",
  "structuredCausalConflictEvidenceIncompleteCount",
  "causalConflictAllActiveAssignmentsFallbackCount",
  "causalBlockerTaskIdUnsupportedByFailureEvidenceCount",
  "causalConflictTaskIdMissingFromActiveAssignmentsCount",
  "decisionLineageLookupCount",
  "decisionLineageLookupMissCount",
  "decisionPathStringParseCount",
  "conflictDirectedSelectionChangedLegacyChoiceCount",
  "conflictDirectedSelectionMatchedLegacyChoiceCount",
  "incompleteCausalEvidenceLegacyFallbackCount",
  "structuredCausalConflictSamples",
  "structuredCausalBackjumpSamples",
];

const missingEvidenceKeys = run => requiredEvidenceKeys.filter(
  key => !Object.prototype.hasOwnProperty.call(run, key) || run[key] === undefined
);

const deterministic =
  a.productiveAssignmentsReached === b.productiveAssignmentsReached &&
  a.productiveTasksRemaining === b.productiveTasksRemaining &&
  a.expandedPartialPlanCount === b.expandedPartialPlanCount &&
  a.generatedAlternativeCount === b.generatedAlternativeCount &&
  a.retainedAlternativeCount === b.retainedAlternativeCount &&
  a.deadEndPartialPlanCount === b.deadEndPartialPlanCount &&
  a.crossCycleBacktrackCount === b.crossCycleBacktrackCount &&
  a.structuredCausalConflictBuildCount === b.structuredCausalConflictBuildCount &&
  a.structuredCausalConflictEvidenceCompleteCount === b.structuredCausalConflictEvidenceCompleteCount &&
  a.structuredCausalConflictEvidenceIncompleteCount === b.structuredCausalConflictEvidenceIncompleteCount &&
  a.causalConflictAllActiveAssignmentsFallbackCount === b.causalConflictAllActiveAssignmentsFallbackCount &&
  a.causalBlockerTaskIdUnsupportedByFailureEvidenceCount === b.causalBlockerTaskIdUnsupportedByFailureEvidenceCount &&
  a.decisionLineageLookupCount === b.decisionLineageLookupCount &&
  a.decisionLineageLookupMissCount === b.decisionLineageLookupMissCount &&
  a.decisionPathStringParseCount === b.decisionPathStringParseCount &&
  a.conflictDirectedBackjumpAcceptedCount === b.conflictDirectedBackjumpAcceptedCount &&
  a.conflictDirectedSelectionChangedLegacyChoiceCount === b.conflictDirectedSelectionChangedLegacyChoiceCount &&
  a.conflictDirectedSelectionMatchedLegacyChoiceCount === b.conflictDirectedSelectionMatchedLegacyChoiceCount &&
  same("selectedDecisionPath") &&
  same("finalProductiveAssignedTaskIds") &&
  same("residualProductiveTaskIds") &&
  same("structuredCausalConflictSamples") &&
  same("structuredCausalBackjumpSamples") &&
  a.frontierAdmissionFingerprint === b.frontierAdmissionFingerprint &&
  a.frontierEvictionFingerprint === b.frontierEvictionFingerprint &&
  a.frontierFinalFingerprint === b.frontierFinalFingerprint &&
  a.backtrackSelectionFingerprint === b.backtrackSelectionFingerprint &&
  a.partialPlanSequenceFingerprint === b.partialPlanSequenceFingerprint &&
  a.partialPlanGraphFingerprint === b.partialPlanGraphFingerprint &&
  a.finalAssignmentsFingerprint === b.finalAssignmentsFingerprint &&
  a.sessionFingerprint === b.sessionFingerprint;

const suspendedFrontierPassed = run =>
  run.constructionSearchStrategy === "critical_chain_retained_alternatives" &&
  run.frontierAdmissionOrderInvariant === true &&
  run.blindSuspendedFrontierRejectionCount === 0 &&
  run.bestRankedSuspendedAlternativeEvictedCount === 0 &&
  (run.suspendedFrontierPeak ?? 0) <= 16 &&
  run.repeatedFrontierMaterializationCount === 0;

const causalIntegrityPassed = run =>
  missingEvidenceKeys(run).length === 0 &&
  (run.structuredCausalConflictBuildCount ?? 0) >= 0 &&
  (run.structuredCausalConflictEvidenceCompleteCount ?? 0) >= 0 &&
  (run.structuredCausalConflictEvidenceIncompleteCount ?? 0) >= 0 &&
  run.causalConflictAllActiveAssignmentsFallbackCount === 0 &&
  run.causalBlockerTaskIdUnsupportedByFailureEvidenceCount === 0 &&
  run.decisionPathStringParseCount === 0 &&
  (run.decisionLineageLookupCount ?? 0) >= (run.conflictDirectedBackjumpAcceptedCount ?? 0) &&
  Array.isArray(run.structuredCausalConflictSamples) &&
  Array.isArray(run.structuredCausalBackjumpSamples);

const budgetPassed = run =>
  (run.expandedPartialPlanCount ?? 0) <= 200 &&
  (run.generatedAlternativeCount ?? 0) <= 600 &&
  (run.suspendedFrontierPeak ?? 0) <= 16 &&
  (run.crossCycleBacktrackCount ?? 0) <= 32 &&
  (run.exclusiveConstructiveRuntimeMs ?? Infinity) < 90000;

const executionPassed = run =>
  run.totalCanonicalProductiveTaskCount === 174 &&
  run.canonicalConstructiveTargetFingerprint ===
    "509eb88e48a7403a09fe722edcd2b5dc6c0c1e42b79ce998663fbfc8ba738245" &&
  run.delegatedSinglePathRunCount === 0 &&
  (run.transformationsExecuted ?? 0) > 0 &&
  (run.simulationsExecuted ?? 0) > 0 &&
  (run.validationsExecuted ?? 0) > 0 &&
  run.selectedBestPartialPlanMatchesObservedMaximum === true &&
  run.finalValidationResult === "VALID" &&
  run.terminalRepairInvoked === false &&
  run.v4SeedUsed === false &&
  (run.commitsExecuted ?? -1) === 0 &&
  run.protectedAssignmentsModified === false &&
  Array.isArray(run.duplicateTaskIds) &&
  run.duplicateTaskIds.length === 0;

const contractPassed =
  deterministic &&
  suspendedFrontierPassed(a) &&
  suspendedFrontierPassed(b) &&
  causalIntegrityPassed(a) &&
  causalIntegrityPassed(b) &&
  budgetPassed(a) &&
  budgetPassed(b) &&
  executionPassed(a) &&
  executionPassed(b);

const nonRegressionPassed =
  contractPassed &&
  a.productiveAssignmentsReached >= 32 &&
  b.productiveAssignmentsReached >= 32 &&
  a.productiveTasksRemaining <= 142 &&
  b.productiveTasksRemaining <= 142 &&
  a.minimumResidualProductiveTaskCountObserved <= 142 &&
  b.minimumResidualProductiveTaskCountObserved <= 142;

const causalSelectionChangedLegacy =
  (a.conflictDirectedSelectionChangedLegacyChoiceCount ?? 0) > 0 &&
  (b.conflictDirectedSelectionChangedLegacyChoiceCount ?? 0) > 0;

const productiveConstructionImproved =
  nonRegressionPassed &&
  a.productiveAssignmentsReached > 32 &&
  b.productiveAssignmentsReached > 32 &&
  a.productiveTasksRemaining < 142 &&
  b.productiveTasksRemaining < 142;

const productiveConstructionCompleted =
  nonRegressionPassed &&
  a.productiveAssignmentsReached === 174 &&
  b.productiveAssignmentsReached === 174 &&
  a.productiveTasksRemaining === 0 &&
  b.productiveTasksRemaining === 0 &&
  (a.completeProductiveSolutionCount ?? 0) > 0 &&
  (b.completeProductiveSolutionCount ?? 0) > 0;

const summary = run => ({
  productive: run.productiveAssignmentsReached,
  remaining: run.productiveTasksRemaining,
  bestObserved: run.maximumConstructiveTargetAssignmentCountObserved,
  minimumResidualObserved: run.minimumResidualProductiveTaskCountObserved,
  expanded: run.expandedPartialPlanCount,
  generated: run.generatedAlternativeCount,
  deadEnds: run.deadEndPartialPlanCount,
  backtracks: run.crossCycleBacktrackCount,
  structuredConflicts: run.structuredCausalConflictBuildCount,
  completeConflictEvidence: run.structuredCausalConflictEvidenceCompleteCount,
  incompleteConflictEvidence: run.structuredCausalConflictEvidenceIncompleteCount,
  causalBackjumps: run.conflictDirectedBackjumpAcceptedCount,
  changedLegacySelections: run.conflictDirectedSelectionChangedLegacyChoiceCount,
  matchedLegacySelections: run.conflictDirectedSelectionMatchedLegacyChoiceCount,
  nonCausalSkipped: run.nonCausalAlternativeSkippedCount,
  sameConflictSkipped: run.sameConflictAlternativeSkippedCount,
  nogoodHits: run.nogoodHitCount,
  inventedBlockers: run.causalBlockerTaskIdUnsupportedByFailureEvidenceCount,
  allAssignmentsFallback: run.causalConflictAllActiveAssignmentsFallbackCount,
  decisionPathStringParses: run.decisionPathStringParseCount,
  stopReason: run.stopReason,
  runtimeMs: run.exclusiveConstructiveRuntimeMs,
});

const result = {
  version: "PLAN-27-ORC-STRUCTURED-CAUSAL-BACKJUMP-V1",
  deterministic,
  suspendedFrontierContractPassed: suspendedFrontierPassed(a) && suspendedFrontierPassed(b),
  causalEvidenceIntegrityPassed: causalIntegrityPassed(a) && causalIntegrityPassed(b),
  budgetContractPassed: budgetPassed(a) && budgetPassed(b),
  executionContractPassed: executionPassed(a) && executionPassed(b),
  structuredCausalBackjumpContractPassed: contractPassed,
  nonRegressionPassed,
  causalSelectionChangedLegacy,
  productiveConstructionImproved,
  productiveConstructionCompleted,
  missingEvidenceKeys: {
    runA: missingEvidenceKeys(a),
    runB: missingEvidenceKeys(b),
  },
  baseline: {
    productiveAssignmentsReached: 32,
    productiveTasksRemaining: 142,
  },
  runs: [a, b],
};

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

console.log(JSON.stringify({
  deterministic,
  suspendedFrontierContractPassed: result.suspendedFrontierContractPassed,
  causalEvidenceIntegrityPassed: result.causalEvidenceIntegrityPassed,
  budgetContractPassed: result.budgetContractPassed,
  executionContractPassed: result.executionContractPassed,
  structuredCausalBackjumpContractPassed: result.structuredCausalBackjumpContractPassed,
  nonRegressionPassed,
  causalSelectionChangedLegacy,
  productiveConstructionImproved,
  productiveConstructionCompleted,
  missingEvidenceKeys: result.missingEvidenceKeys,
  output: outputPath,
  runA: summary(a),
  runB: summary(b),
}, null, 2));

if (!contractPassed) {
  process.exitCode = 1;
}
NODE

echo
echo "Artefacto generado: $OUTPUT"
ls -lh "$OUTPUT"
