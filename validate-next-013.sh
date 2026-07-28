#!/usr/bin/env bash
set -euo pipefail
artifact=planner-next-technical-operation-v1.json
legacy=planner-next-joint-auxiliary-tasks-v2.json
failed=planner-next-technical-operation-v1.failed.json
tmp1=$(mktemp); tmp2=$(mktemp)
trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail() { printf '{"version":"planner-next-technical-operation-v1","accepted":false,"reason":%s}\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1")" > "$failed"; echo "$1" >&2; exit 1; }
[[ -f "$artifact" || -f "$legacy" ]] || fail "NO_CURRENT_OR_LEGACY_ARTIFACT"
original_sha=""; [[ ! -f "$artifact" ]] || original_sha=$(sha256sum "$artifact" | cut -d' ' -f1)
npm run check || fail "CHECK_FAILED"
npx tsx --test engine/planner-next/*.spec.ts || fail "PLANNER_NEXT_TESTS_FAILED"
npm test || fail "FULL_TEST_SUITE_FAILED"
npx tsx engine/planner-next/benchmarks/runPlannerNextTechnicalOperationBenchmark.ts > "$tmp1" || fail "BENCHMARK_FIRST_RUN_FAILED"
npx tsx engine/planner-next/benchmarks/runPlannerNextTechnicalOperationBenchmark.ts > "$tmp2" || fail "BENCHMARK_SECOND_RUN_FAILED"
node - "$tmp1" "$tmp2" <<'NODE' || fail "BENCHMARK_ACCEPTANCE_OR_DETERMINISM_FAILED"
const fs=require("fs"), [a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p,"utf8")));
const strip=v=>Array.isArray(v)?v.map(strip):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).filter(([k])=>k!=="runtimeMs").map(([k,x])=>[k,strip(x)])):v;
if(!a.acceptance?.accepted||Object.keys(a.scenarios??{}).length!==16||JSON.stringify(strip(a))!==JSON.stringify(strip(b)))process.exit(1);
NODE
if [[ -f "$artifact" ]]; then
  node - "$artifact" "$tmp1" <<'NODE' || fail "CURRENT_ARTIFACT_LOGICAL_MISMATCH"
const fs=require("fs"),[a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p,"utf8")));const strip=v=>Array.isArray(v)?v.map(strip):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).filter(([k])=>k!=="runtimeMs").map(([k,x])=>[k,strip(x)])):v;if(JSON.stringify(strip(a))!==JSON.stringify(strip(b)))process.exit(1);
NODE
  [[ "$original_sha" == "$(sha256sum "$artifact" | cut -d' ' -f1)" ]] || fail "CURRENT_ARTIFACT_WAS_MODIFIED"
else
  node - "$legacy" "$tmp1" <<'NODE' || fail "LEGACY_REGRESSION_MISMATCH"
const fs=require("fs"),[old,next]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p,"utf8")));const strip=v=>Array.isArray(v)?v.map(strip):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).filter(([k])=>k!=="runtimeMs").map(([k,x])=>[k,strip(x)])):v;for(const [name,value] of Object.entries(old.scenarios)){if(JSON.stringify(strip(value))!==JSON.stringify(strip(next.scenarios[name])))process.exit(1)}
NODE
  cp "$tmp1" "$artifact"
  node -e 'const x=require("./planner-next-technical-operation-v1.json");if(!x.acceptance.accepted)process.exit(1)' || fail "PUBLISHED_ARTIFACT_INVALID"
  rm -f "$legacy"
fi
rm -f "$failed"
echo "NEXT-013 validation accepted: $artifact"
