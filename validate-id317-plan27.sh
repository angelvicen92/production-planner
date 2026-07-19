#!/usr/bin/env bash
set -euo pipefail
set +H
ARTIFACT="plan-27-orc-window-causal-attribution-v1.json"
if [[ -e "$ARTIFACT" ]]; then
  echo "ERROR: refusing to overwrite existing artifact: $ARTIFACT" >&2
  exit 2
fi
SCENARIO="local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json"
RUN1="/tmp/id317-plan27-run1-$$.json"
RUN2="/tmp/id317-plan27-run2-$$.json"
TMP="/tmp/id317-plan27-consolidated-$$.json"
BUDGET='{"constructionSearchStrategy":"critical_chain_retained_alternatives","maxElapsedMs":90000,"maxExpandedPartialPlans":200,"maxGeneratedPartialPlans":600,"maxSuspendedPartialPlans":16,"initialExecutableFrontierBatchSize":4,"maxExecutableFrontierTasksScannedPerExpansion":32,"maxBranchEvaluationsPerFrontierTask":48,"maxRetainedValidBranchesPerFrontierTask":3,"maxChildrenPerDecision":3,"maxCrossCycleBacktracks":32,"initialTemporalCandidateBatchSize":8,"maxTemporalCandidatesPerAnchor":24,"maxBranchEvaluationsPerAnchor":48}'
status="passed"
errors=()
run_step(){ local name="$1"; shift; if ! "$@"; then status="failed"; errors+=("$name"); fi }
run_step check npm run check
run_step focal-tests npx tsx --test engine/orc/active/initialConstructionRepairProblem.spec.ts engine/orc/active/runInitialConstructionRepairNeighborhoodSession.spec.ts engine/tools/runInitialConstructionBenchmark.spec.ts
run_step benchmark-1 bash -c 'npx tsx engine/tools/runInitialConstructionBenchmark.ts "$1" "$2" > "$3"' _ "$SCENARIO" "$BUDGET" "$RUN1"
run_step benchmark-2 bash -c 'npx tsx engine/tools/runInitialConstructionBenchmark.ts "$1" "$2" > "$3"' _ "$SCENARIO" "$BUDGET" "$RUN2"
node - "$RUN1" "$RUN2" "$TMP" "$status" "${errors[*]-}" <<'NODE'
const fs=require('fs'); const [r1p,r2p,out,status,err]=process.argv.slice(2);
const read=p=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null; const r1=read(r1p), r2=read(r2p);
const same=JSON.stringify(r1?.sessionFingerprint??r1?.causalEvidenceFingerprint??null)===JSON.stringify(r2?.sessionFingerprint??r2?.causalEvidenceFingerprint??null);
const consolidated={version:'ID317_PLAN27_WINDOW_CAUSAL_ATTRIBUTION_V1',status:status==='passed'&&same?'passed':'failed',errors:err?err.split(/\s+/).filter(Boolean):[],deterministic:same,technicalContracts:{completeTaskWindowConflictWithoutExplanationCount:r1?.completeTaskWindowConflictWithoutExplanationCount??0,nogoodMatchCount:r1?.nogoodMatchCount??0,nogoodTransitionActuallySkippedCount:r1?.nogoodTransitionActuallySkippedCount??0,repeatedEquivalentDeadEndActuallyAvoidedCount:r1?.repeatedEquivalentDeadEndActuallyAvoidedCount??0},nonRegression:{budgetContractPassed:r1?.budgetContractPassed??null,crossCycleBacktrackCount:r1?.crossCycleBacktrackCount??null,productiveAssignmentsReached:r1?.productiveAssignmentsReached??null,productiveTasksRemaining:r1?.productiveTasksRemaining??null},windowConflictClassification:{rejectedTemporalCandidateEvidenceCount:r1?.rejectedTemporalCandidateEvidenceCount??0,repairableRejectedTemporalCandidateCount:r1?.repairableRejectedTemporalCandidateCount??0,staticRejectedTemporalCandidateCount:r1?.staticRejectedTemporalCandidateCount??0,immutableRejectedTemporalCandidateCount:r1?.immutableRejectedTemporalCandidateCount??0,incompleteRejectedTemporalCandidateCount:r1?.incompleteRejectedTemporalCandidateCount??0,shiftableWindowConflictCount:r1?.shiftableWindowConflictCount??0,staticWindowConflictCount:r1?.staticWindowConflictCount??0},deadEndEvidence:r1?.selectedFrontierFailureCandidateSamples??[],comparisonAgainstId316:{baselineArtifact:'plan-27-orc-structured-causal-backjump-v1.json',nogoodSemantics:'matches are separated from actually skipped transitions'},productiveResult:{assignments:r1?.productiveAssignmentsReached??null,remaining:r1?.productiveTasksRemaining??null},runs:[r1,r2]};
fs.writeFileSync(out, JSON.stringify(consolidated,null,2));
NODE
cp "$TMP" "$ARTIFACT"
[ "$status" = passed ]
