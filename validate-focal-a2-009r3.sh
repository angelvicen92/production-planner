#!/usr/bin/env bash
set -uo pipefail
CURRENT=planner-next-focal-a2-itinerant-spec08-foundation-v3.json
LEGACY=planner-next-focal-a2-itinerant-spec08-foundation-v2.json
FAILED=planner-next-focal-a2-itinerant-spec08-foundation-v3.failed.json
MODE=${1:-auto}
EXPECTED_LEGACY_SHA=8e7b46925c1469b538e14e928c3e83ca871e57e9089b5c4eb8956ea53a182faa
TMP=$(mktemp -d .focal-a2-009r3.XXXXXX)
OLD="$TMP/current.old.json"; A="$TMP/a.json"; B="$TMP/b.json"
cleanup(){ rm -rf "$TMP"; }
fail(){ local message=$1; printf '{"status":"FAILED","message":%s}\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$message")" > "$FAILED"; [[ -f "$OLD" ]] && cp "$OLD" "$CURRENT"; cleanup; exit 1; }
trap 'fail "validator interrupted"' INT TERM
[[ "$MODE" == legacy || "$MODE" == current || "$MODE" == auto ]] || fail "mode must be legacy, current, or auto"
[[ "$MODE" != auto ]] || { [[ -f "$LEGACY" ]] && MODE=legacy || MODE=current; }
if [[ "$MODE" == legacy ]]; then
  [[ -f "$LEGACY" ]] || fail "legacy artifact missing"
  [[ "$(sha256sum "$LEGACY" | cut -d' ' -f1)" == "$EXPECTED_LEGACY_SHA" ]] || fail "legacy SHA mismatch"
fi
node <<'NODE' || fail "protected fixture or manifest mismatch"
const fs=require('fs'),crypto=require('crypto');const fixturePath='engine/planner-next/benchmarks/focal-a2/focalA2Spec08V3ProtectedSubstrate.json',manifest=require('./engine/planner-next/benchmarks/focal-a2/focalA2Spec08FoundationV3HistoricalManifest.json'),fixture=require('./'+fixturePath);const sha=crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex');if(sha!==manifest.protectedSubstrateSha256||Object.keys(fixture.scenarios).length!==31)process.exit(1);
NODE
[[ -f "$CURRENT" ]] && mv "$CURRENT" "$OLD"
rm -f "$FAILED"
npm run check || fail "npm run check failed"
npx tsx --test engine/planner-next/saturatedResourceWindowBlock.spec.ts engine/planner-next/auxiliaryTasks.spec.ts engine/planner-next/futureFeasibility.spec.ts engine/planner-next/taskAvailability.spec.ts engine/planner-next/benchmarks/focal-a2/*.spec.ts engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV3Benchmark.spec.ts || fail "focused tests failed"
node script/run-test-suite.mjs engine/planner-next || fail "Planner Next suite failed"
npm test || fail "repository tests failed"
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV3Benchmark.ts > "$A" || fail "first fresh benchmark failed"
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV3Benchmark.ts > "$B" || fail "second fresh benchmark failed"
node - "$A" "$B" <<'NODE' || fail "candidate validation or canonical comparison failed"
const fs=require('fs');const [a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p,'utf8')));const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,clean(v[k])])):v;
if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))throw Error('non-deterministic artifact');
if(a.version!=='planner-next-focal-a2-itinerant-spec08-foundation-v3'||a.scenarioCount!==32||!a.acceptance?.accepted)throw Error('invalid acceptance');
if(!a.requiredPositiveChecks.every(id=>a.checks?.[id]?.passed))throw Error('required check failed');
const s=a.scenarios?.focalA2Spec08NeutralStandaloneBlockRepair;if(!s?.standalone?.complete||!s?.standalone?.hardValid||s.standalone.plannedTaskCount!==47||s.saturatedBlock?.count!==1||s.saturatedBlock?.plannedCount!==1)throw Error('standalone/block evidence failed');
if(a.remainingGapCodes?.join()!=='GENERIC_ANCHORED_ACCOMPANIMENT_NOT_SUPPORTED')throw Error('remaining gap mismatch');
NODE
if [[ -f "$OLD" ]]; then node - "$OLD" "$A" <<'NODE' || fail "current artifact changed beyond runtimeMs"
const fs=require('fs');const [a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p,'utf8')));const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,clean(v[k])])):v;if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))throw Error('stored/current mismatch');
NODE
fi
cp "$A" "$TMP/publish.json" && mv "$TMP/publish.json" "$CURRENT" || fail "atomic publish failed"
node -e "const a=require('./$CURRENT');if(!a.acceptance.accepted||a.scenarioCount!==32)process.exit(1)" || fail "published artifact reopen failed"
[[ "$MODE" == legacy ]] && rm -f "$LEGACY"
node script/run-test-suite.mjs engine/planner-next || fail "Planner Next suite after legacy retirement failed"
rm -f "$FAILED"; cleanup; trap - INT TERM
printf 'FOCAL-A2-009R3 %s validation passed\n' "$MODE"
