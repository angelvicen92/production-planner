#!/usr/bin/env bash
set -uo pipefail
mode="${1:-current}"; failed="planner-next-focal-a2-band-preferred-v1.failed.json"
tmp1="$(mktemp)"; tmp2="$(mktemp)"; trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ cp "$tmp1" "$failed" 2>/dev/null || true; exit 1; }
npm run check || fail
node script/run-test-suite.mjs engine/planner-next || fail
npm test || fail
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2BandPreferredBenchmark.ts > "$tmp1" || fail
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2BandPreferredBenchmark.ts > "$tmp2" || fail
node - "$tmp1" "$tmp2" <<'NODE' || fail
const fs=require('fs'); const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,clean(v[k])])):v;
const [a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p))); if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))throw Error('NON_DETERMINISTIC');
if(a.status!=='BAND_PREFERRED_POLICY_ACCEPTED'||!a.preferredPolicyAccepted||a.fullBandBenchmarkPassed!==false)throw Error('FOCAL_ACCEPTANCE_FAILED');
NODE
if [[ "$mode" == legacy ]]; then cp "$tmp1" planner-next-focal-a2-band-preferred-v1.json.new && mv planner-next-focal-a2-band-preferred-v1.json.new planner-next-focal-a2-band-preferred-v1.json; elif [[ "$mode" != current ]]; then fail; fi
rm -f "$failed"
