#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"; cd "$root"
failed=planner-next-setup-grouping-v1.failed.json
old=planner-next-branch-local-ranking-v2.json
tmp1=$(mktemp); tmp2=$(mktemp); historical=$(mktemp)
trap 'code=$?; rm -f "$tmp1" "$tmp2" "$historical"; if ((code)); then printf "{\"version\":\"planner-next-setup-grouping-v1\",\"accepted\":false,\"exitCode\":%d}\n" "$code" > "$failed"; fi' EXIT
npm run check
npx tsx --test engine/planner-next/*.spec.ts
npm test
test -f "$old"
npx tsx engine/planner-next/benchmarks/runPlannerNextBranchLocalRankingBenchmark.ts > "$historical"
node --input-type=module - "$old" "$historical" <<'JS'
import fs from "node:fs";const [expectedPath,actualPath]=process.argv.slice(2),expected=JSON.parse(fs.readFileSync(expectedPath)),actual=JSON.parse(fs.readFileSync(actualPath));
const clean=x=>{if(Array.isArray(x))return x.map(clean);if(x&&typeof x==="object")return Object.fromEntries(Object.entries(x).filter(([k])=>k!=="runtimeMs").map(([k,v])=>[k,clean(v)]));return x};
if(JSON.stringify(clean(expected))!==JSON.stringify(clean(actual)))throw new Error("the twelve historical scenarios changed logically");
JS
npx tsx engine/planner-next/benchmarks/runPlannerNextSetupGroupingBenchmark.ts > "$tmp1"
npx tsx engine/planner-next/benchmarks/runPlannerNextSetupGroupingBenchmark.ts > "$tmp2"
node --input-type=module - "$tmp1" "$tmp2" <<'JS'
import fs from "node:fs";const [aPath,bPath]=process.argv.slice(2),a=JSON.parse(fs.readFileSync(aPath)),b=JSON.parse(fs.readFileSync(bPath));
const clean=x=>{if(Array.isArray(x))return x.map(clean);if(x&&typeof x==="object")return Object.fromEntries(Object.entries(x).filter(([k])=>k!=="runtimeMs").map(([k,v])=>[k,clean(v)]));return x};
if(!a.acceptance.accepted||JSON.stringify(clean(a))!==JSON.stringify(clean(b)))throw new Error("benchmark acceptance/determinism failed");
const s=a.scenarios.setupGrouping,m=s.logicalMetrics,e=a.setupEvidence,i=a.scenarios.itinerantUnits;
if(s.plannedTaskCount!==24||JSON.stringify(e.familySequence["setup-room"])!==JSON.stringify(["family-a","family-b","family-c"])||Object.values(e.blockCounts).some(x=>x!==1)||e.switches["setup-room"]!==2||s.secondarySpaceEndById["setup-room"]-s.secondarySpaceStartById["setup-room"]!==90||e.workItemSelectionOrder[0]!=="space:setup-room"||s.setupViolationCount!==0||s.secondaryContinuityViolationCount!==0)throw new Error("NEXT-010 evidence failed");
if(i.logicalMetrics.branchBudgetMaximum!==300000||i.logicalMetrics.branchBudgetConsumed>285317)throw new Error("itinerant budget regression");
if(Object.values(a.scenarios).some(s=>s.runtimeMs>=2000))throw new Error("runtime threshold failed");
JS
cp "$tmp1" planner-next-setup-grouping-v1.json
rm -f "$failed" "$old"
