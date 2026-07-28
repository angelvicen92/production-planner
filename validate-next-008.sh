#!/usr/bin/env bash
set -uo pipefail
artifact=planner-next-bounded-future-feasibility-v1.json
failed=planner-next-bounded-future-feasibility-v1.failed.json
tmp1=$(mktemp); tmp2=$(mktemp); trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ printf '{"version":"planner-next-bounded-future-feasibility-v1","accepted":false,"reason":%s}\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1")" > "$failed"; echo "$1" >&2; exit 1; }
npm run check || fail 'npm run check failed'
npx tsx --test engine/planner-next/*.spec.ts || fail 'Planner Next tests failed'
npm test || fail 'full test suite failed'
npm run --silent benchmark:planner-next:bounded-future-feasibility > "$tmp1" || fail 'first benchmark failed'
npm run --silent benchmark:planner-next:bounded-future-feasibility > "$tmp2" || fail 'second benchmark failed'
node - "$tmp1" "$tmp2" <<'NODE' || fail 'benchmark acceptance or determinism failed'
const fs=require('fs'),[a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));
const clean=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='runtimeMs'?undefined:v));
if(!a.acceptance.accepted||JSON.stringify(clean(a))!==JSON.stringify(clean(b)))process.exit(1);
if(a.scenarios.futureFeasibility.boundedEvidence.bestK!==1||!a.boundedBlockConstruction.withinBound||!a.boundedBlockConstruction.deterministic)process.exit(1);
for(const x of Object.values(a.scenarios)){if(x.runtimeMs>=2000||x.logicalMetrics.branchBudgetConsumed>x.logicalMetrics.branchBudgetConsumed+1)process.exit(1)}
NODE
cp "$tmp1" "$artifact"; rm -f "$failed" planner-next-future-feasibility-v1.json
