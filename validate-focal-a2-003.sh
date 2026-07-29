#!/usr/bin/env bash
set -uo pipefail
artifact=planner-next-focal-a2-band-baseline-v1.json
legacy=planner-next-focal-a2-feeder-closure-v2.json
failed=planner-next-focal-a2-band-baseline-v1.failed.json
tmp1=$(mktemp); tmp2=$(mktemp); trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ printf '{"version":"planner-next-focal-a2-band-baseline-v1","accepted":false,"reason":"%s"}\n' "$1" > "$failed"; echo "FOCAL-A2-003 failed: $1" >&2; exit 1; }
[[ -f "$artifact" || -f "$legacy" ]] || fail NO_CURRENT_OR_LEGACY_ARTIFACT
before=""; [[ -f "$artifact" ]] && before=$(sha256sum "$artifact"|cut -d' ' -f1)
npm run check || fail CHECK_FAILED
node script/run-test-suite.mjs engine/planner-next || fail PLANNER_NEXT_TESTS_FAILED
npm test || fail FULL_TESTS_FAILED
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2BandBenchmark.ts > "$tmp1" || fail BENCHMARK_1_FAILED
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2BandBenchmark.ts > "$tmp2" || fail BENCHMARK_2_FAILED
node - "$tmp1" "$tmp2" "$artifact" <<'NODE' || fail ARTIFACT_VALIDATION_FAILED
const fs=require('fs'),a=JSON.parse(fs.readFileSync(process.argv[2])),b=JSON.parse(fs.readFileSync(process.argv[3]));const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,clean(v[k])])):v;if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))throw Error('NON_IDEMPOTENT');if(a.version!=='planner-next-focal-a2-band-baseline-v1'||a.status!=='BAND_GAP_CONFIRMED'||!a.acceptance.accepted||!a.acceptance.currentPlannerMeetsFocalBenchmark||a.acceptance.currentPlannerMeetsBandBenchmark||Object.keys(a.scenarios).length!==22||!a.historicalRegressionEvidence.historicalRegressionIntact||a.participantRequirementProfiles.length!==19||a.referenceBandPresence.operationalBlockCount!==4||a.acceptedFocalPlanBandPresence.operationalBlockCount!==6||a.expressibilityAudit.derivedGapCodes.length!==5)throw Error('ACCEPTANCE_FIELDS');if(fs.existsSync(process.argv[4])&&JSON.stringify(clean(a))!==JSON.stringify(clean(JSON.parse(fs.readFileSync(process.argv[4])))))throw Error('FRESH_MISMATCH');
NODE
if [[ -f "$artifact" ]]; then [[ "$before" == "$(sha256sum "$artifact"|cut -d' ' -f1)" ]] || fail ARTIFACT_MUTATED; else cp "$tmp1" "$artifact" || fail PUBLISH_FAILED; node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' "$artifact" || fail REOPEN_FAILED; rm -f "$legacy"; fi
rm -f "$failed"
echo 'FOCAL-A2-003 validation passed'
