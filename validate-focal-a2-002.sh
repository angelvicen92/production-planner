#!/usr/bin/env bash
set -uo pipefail
artifact=planner-next-focal-a2-feeder-closure-v2.json
legacy=planner-next-focal-a2-feeder-closure-v1.json
failed=planner-next-focal-a2-feeder-closure-v2.failed.json
tmp1=$(mktemp); tmp2=$(mktemp); trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ printf '{"version":"planner-next-focal-a2-feeder-closure-v2","accepted":false,"reason":"%s"}\n' "$1" > "$failed"; exit 1; }
[[ -f "$artifact" || -f "$legacy" ]] || fail ARTIFACT_NOT_FOUND
sha=""; [[ -f "$artifact" ]] && sha=$(sha256sum "$artifact"|cut -d' ' -f1)
npm run check || fail CHECK_FAILED
npx tsx --test engine/planner-next/*.spec.ts || fail PLANNER_NEXT_TESTS_FAILED
npm test || fail FULL_TEST_SUITE_FAILED
npm run benchmark:planner-next:focal-a2 --silent > "$tmp1" || fail BENCHMARK_FIRST_RUN_FAILED
npm run benchmark:planner-next:focal-a2 --silent > "$tmp2" || fail BENCHMARK_SECOND_RUN_FAILED
normalize(){ jq 'walk(if type=="object" then del(.runtimeMs) else . end)' "$1"; }
diff -u <(normalize "$tmp1") <(normalize "$tmp2") >/dev/null || fail NON_DETERMINISTIC
jq -e '.version=="planner-next-focal-a2-feeder-closure-v2" and .status=="FOCAL_BENCHMARK_PASSED" and .acceptance.accepted and .acceptance.currentPlannerMeetsFocalBenchmark and .acceptance.historicalRegressionIntact and .historicalRegressionEvidence.intact and .acceptance.focalMakespanAccepted and .acceptance.focalEvidenceTruthful and .acceptance.referenceScheduleHardValid and .acceptance.spaceLocalMealSemanticsAccepted and .acceptance.boundedFeederClosureAccepted and (.scenarios|length)==21 and .scenarios.focalA2.metrics.plannedTaskCount==38 and .scenarios.focalA2.metrics.mainFlowMealStart==840 and .scenarios.focalA2.metrics.mainFlowMealEnd==915 and .scenarios.focalA2.metrics.mainFlowMorningTaskCount==11 and .scenarios.focalA2.metrics.mainFlowAfternoonTaskCount==8 and .scenarios.focalA2.metrics.mainFlowSelectedSplitIndex==11 and .scenarios.focalA2.metrics.mainFlowGapMinutes==0 and .scenarios.focalA2.metrics.totalParticipantPresenceMinutes==2345 and .scenarios.focalA2.metrics.maxParticipantPresenceMinutes==215 and .comparison.makespan.reference==450 and .comparison.makespan.planner==450 and .comparison.makespan.delta==0 and .scenarios.focalA2.metrics.feederClosureMaximumPartialStates==5 and .scenarios.focalA2.metrics.feederClosureBranchesExplored==48959 and .scenarios.focalA2.metrics.feederClosureCompleteCandidateCount==2 and (.scenarios.focalA2.metrics.feederClosureSelectedOrder|length)==19 and (.scenarios.focalA2.metrics.feederClosureSelectedOrder|unique|length)==19 and (.scenarios.focalA2.metrics.feederClosureZeroAlternativeTaskIds|length)==0 and .scenarios.focalA2.metrics.branchBudgetConsumed==64558 and .scenarios.focalA2.metrics.planFingerprint=="76f52d292e810ab8506ba868d77036126f299bcf129462a62b6c3b49a13be4fc" and .scenarios.focalA2.currentPlannerRun.deterministic and .scenarios.focalA2.currentPlannerRun.orderInvariant' "$tmp1" >/dev/null || fail ACCEPTANCE_CHECK_FAILED
if [[ -f "$artifact" ]]; then diff -u <(normalize "$artifact") <(normalize "$tmp1") >/dev/null || fail CURRENT_ARTIFACT_DIFFERS; [[ $(sha256sum "$artifact"|cut -d' ' -f1) == "$sha" ]] || fail CURRENT_ARTIFACT_MUTATED; else cp "$tmp1" "$artifact" || fail ARTIFACT_PUBLICATION_FAILED; jq -e '.acceptance.accepted and .status=="FOCAL_BENCHMARK_PASSED"' "$artifact" >/dev/null || fail PUBLISHED_ARTIFACT_INVALID; rm -f "$legacy"; fi
rm -f "$failed"
