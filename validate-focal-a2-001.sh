#!/usr/bin/env bash
set -euo pipefail
artifact=planner-next-focal-a2-baseline-v1.json
legacy=planner-next-main-flow-meal-v1.json
failed=planner-next-focal-a2-baseline-v1.failed.json
temps=(); cleanup(){ ((${#temps[@]})) && rm -f "${temps[@]}"; }; trap cleanup EXIT
if [[ ! -f "$artifact" && ! -f "$legacy" ]]; then
  printf '%s\n' '{"version":"planner-next-focal-a2-baseline-v1","accepted":false,"reason":"NO_CURRENT_OR_LEGACY_ARTIFACT"}' > "$failed"
  exit 1
fi
original=""; [[ -f "$artifact" ]] && original=$(sha256sum "$artifact" | cut -d' ' -f1)
npm run check
node script/run-test-suite.mjs engine/planner-next
npm test
for _ in 1 2; do t=$(mktemp); temps+=("$t"); npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Benchmark.ts > "$t"; done
node - "${temps[0]}" "${temps[1]}" <<'NODE'
const fs=require('fs'),read=p=>JSON.parse(fs.readFileSync(p));const a=read(process.argv[2]),b=read(process.argv[3]);
const strip=x=>Array.isArray(x)?x.map(strip):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='runtimeMs').map(([k,v])=>[k,strip(v)])):x;
if(JSON.stringify(strip(a))!==JSON.stringify(strip(b)))throw Error('NON_DETERMINISTIC_OUTPUT');
const x=a,v=x.referenceValidation,e=x.expressibilityAudit,ac=x.acceptance;
if(x.version!=='planner-next-focal-a2-baseline-v1'||x.status!=='BASELINE_GAP_CONFIRMED'||!ac.artifactAccepted||!ac.focalCorpusAccepted||!ac.referenceScheduleHardValid||!ac.currentPlannerRunRecorded||!ac.modelGapConfirmed||ac.currentPlannerMeetsFocalBenchmark!==false||!ac.historicalRegressionIntact)throw Error('INVALID_ACCEPTANCE');
if(Object.keys(x.scenarios).length!==21||v.participantCount!==19||v.taskCount!==38||v.dependencyCount!==19||v.mainFlowMorningTaskCount!==11||v.mainFlowAfternoonTaskCount!==8||v.mainFlowMealStart!==840||v.mainFlowMealEnd!==915||v.hardViolationCount!==0||v.totalParticipantPresenceMinutes!==2345||v.maxParticipantPresenceMinutes!==230||v.focalMakespanMinutes!==450)throw Error('INVALID_REFERENCE');
if(e.gapCode!=='GLOBAL_PROTECTED_MEAL_BLOCKS_SPACE_LOCAL_WORK'||e.globalProtectedMealConflictCount!==5||JSON.stringify(e.globalProtectedMealConflictTaskIds)!==JSON.stringify(['vocal-eva-martin-fernandez','vocal-noa-marcos-diez','vocal-claudia-torrent','vocal-pere-portero','vocal-daniel-hernan-barres'])||e.affectedSpaceIds.length!==2||!x.currentPlannerRun.executedTwice||!x.currentPlannerRun.deterministic||x.plannerInputProjection.budget.maxBranchExpansions!==300000)throw Error('INVALID_AUDIT');
NODE
if [[ -n "$original" ]]; then [[ "$original" == "$(sha256sum "$artifact"|cut -d' ' -f1)" ]]; else cp "${temps[0]}" "$artifact"; node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' "$artifact"; rm -f "$legacy"; fi
rm -f "$failed"
