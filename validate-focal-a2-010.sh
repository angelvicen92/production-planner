#!/usr/bin/env bash
set -uo pipefail
MODE="${1:-auto}"; ROOT="$(cd "$(dirname "$0")" && pwd)"; cd "$ROOT"
OUT=planner-next-focal-a2-itinerant-spec08-foundation-v4.json; SRC=engine/planner-next/benchmarks/focal-a2/focalA2Spec08FoundationV3AcceptedArtifact.json; EXPECTED=cf87e0ca0e9f8ad62b0a06fbd4a49206a8f0357b2a5003c833145c3b8f082bb5
[[ "$MODE" =~ ^(legacy|current|auto)$ ]] || { echo "usage: $0 legacy|current|auto" >&2; exit 2; }
[[ "$(sha256sum "$SRC"|cut -d' ' -f1)" == "$EXPECTED" ]] || { echo source-sha-mismatch >&2; exit 1; }
TMP="$(mktemp -d .focal-a2-010.XXXXXX)"; BACK="$TMP/previous"; [[ -f "$OUT" ]]&&mv "$OUT" "$BACK"
restore(){ local s=$?; [[ $s -eq 0 ]]||{ rm -f "$OUT";[[ -f "$BACK" ]]&&mv "$BACK" "$OUT";};rm -rf "$TMP";exit $s;};trap restore EXIT INT TERM
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV4Benchmark.ts > "$TMP/a.json" || exit 1
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV4Benchmark.ts > "$TMP/b.json" || exit 1
node - "$TMP/a.json" "$TMP/b.json" <<'NODE' || exit 1
const fs=require('fs'),[a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));const c=v=>Array.isArray(v)?v.map(c):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,c(v[k])])):v;if(JSON.stringify(c(a))!==JSON.stringify(c(b)))throw Error('non-deterministic');const s=a.scenarios[a.activeScenarioId];if(a.status!=='FOCAL_A2_SPEC08_MAIN_ANCHORED_ACCOMPANIMENT_ACCEPTED'||a.scenarioCount!==33||!s.complete||!s.hardValid||s.plannedTaskCount!==53||s.metrics.anchoredAccompanimentPlannedCount!==3||s.metrics.anchoredAccompanimentScheduledSegmentCount!==6||s.branchesExplored>s.maxBranchExpansions||s.humanScheduleUsedAsSeed)throw Error('acceptance failed');
NODE
mv "$TMP/a.json" "$TMP/publish"; mv "$TMP/publish" "$OUT"; node -e 'let x=require("./'$OUT'");if(!x.acceptance.accepted)process.exit(1)'
node script/run-test-suite.mjs engine/planner-next || exit 1
rm -f "$BACK"; echo "FOCAL-A2-010 $MODE accepted: $(sha256sum "$OUT"|cut -d' ' -f1)"
