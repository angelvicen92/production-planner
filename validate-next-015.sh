#!/usr/bin/env bash
set -euo pipefail
artifact=planner-next-space-meal-v1.json; legacy=planner-next-technical-chain-v2.json; failed=planner-next-space-meal-v1.failed.json
clean(){ rm -f "$failed"; }; trap 'rm -f "$failed"' EXIT
if [[ ! -f "$artifact" && ! -f "$legacy" ]]; then echo 'NEXT-015: neither current nor legacy artifact exists' >&2; exit 1; fi
npm run check
npx tsx --test engine/planner-next/*.spec.ts
npm test
generate(){ npx tsx engine/planner-next/benchmarks/runPlannerNextSpaceMealBenchmark.ts; }
if [[ -f "$artifact" ]]; then before=$(sha256sum "$artifact"|cut -d' ' -f1); generate > "$failed"; generate > /tmp/next015-second.json; node - "$artifact" "$failed" /tmp/next015-second.json <<'NODE'
const fs=require('fs'),clean=x=>{x=structuredClone(x);for(const s of Object.values(x.scenarios))delete s.runtimeMs;return x},[a,b,c]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));if(!a.acceptance.accepted||Object.keys(a.scenarios).length!==18||JSON.stringify(clean(a))!==JSON.stringify(clean(b))||JSON.stringify(clean(b))!==JSON.stringify(clean(c)))process.exit(1)
NODE
[[ "$before" == "$(sha256sum "$artifact"|cut -d' ' -f1)" ]]; clean; exit 0
fi
generate > "$failed"
node - "$legacy" "$failed" <<'NODE'
const fs=require('fs'),[old,n]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));if(n.version!=="planner-next-space-meal-v1"||!n.acceptance.accepted||Object.keys(n.scenarios).length!==18)process.exit(1);for(const [k,v] of Object.entries(old.scenarios))if(JSON.stringify(v)!==JSON.stringify(n.scenarios[k]))process.exit(1);const s=n.scenarios.spaceMeal;if(s.plannedTaskCount!==31||s.scheduledSpaceMeals?.[0]?.id!=="space-meal:meal-room:1"||s.scheduledSpaceMeals[0].start!==620||s.scheduledSpaceMeals[0].end!==640||s.mealCandidateCount!==1||s.workItemSelectionOrder[0]!=="meal:meal-room"||s.internalGapMinutes!==0||s.occupiedBlockCount!==1||s.violationCount!==0||s.runtimeMs>=2000)process.exit(1)
NODE
mv "$failed" "$artifact"; node -e 'let x=require("./planner-next-space-meal-v1.json");if(!x.acceptance.accepted)process.exit(1)'; rm "$legacy"; trap - EXIT; clean
