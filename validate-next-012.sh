#!/usr/bin/env bash
set -euo pipefail
artifact=planner-next-joint-auxiliary-tasks-v1.json
legacy=planner-next-setup-preparation-v1.json
failed=planner-next-joint-auxiliary-tasks-v1.failed.json
tmp1=$(mktemp); tmp2=$(mktemp); trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ printf '{"reason":%s}\n' "$(node -p 'JSON.stringify(process.argv[1])' "$1")" > "$failed"; echo "$1" >&2; exit 1; }
[[ -f "$artifact" || -f "$legacy" ]] || fail "NO_ACCEPTED_BASELINE_ARTIFACT"
npm run check || fail "TYPECHECK_FAILED"
npx tsx --test engine/planner-next/*.spec.ts || fail "PLANNER_NEXT_TESTS_FAILED"
npm test || fail "FULL_TEST_SUITE_FAILED"
npx tsx engine/planner-next/benchmarks/runPlannerNextJointAuxiliaryTasksBenchmark.ts > "$tmp1" || fail "BENCHMARK_FIRST_RUN_FAILED"
npx tsx engine/planner-next/benchmarks/runPlannerNextJointAuxiliaryTasksBenchmark.ts > "$tmp2" || fail "BENCHMARK_SECOND_RUN_FAILED"
node --input-type=module - "$tmp1" "$tmp2" "$artifact" "$legacy" <<'NODE' || exit 1
import fs from "node:fs";import crypto from "node:crypto";
const [freshPath,againPath,artifact,legacy]=process.argv.slice(2), fresh=JSON.parse(fs.readFileSync(freshPath)), again=JSON.parse(fs.readFileSync(againPath));
const clean=x=>Array.isArray(x)?x.map(clean):x&&typeof x==="object"?Object.fromEntries(Object.entries(x).filter(([k])=>k!=="runtimeMs").map(([k,v])=>[k,clean(v)])):x;
const die=r=>{fs.writeFileSync("planner-next-joint-auxiliary-tasks-v1.failed.json",JSON.stringify({reason:r},null,2)+"\n");process.exit(1)};
if(JSON.stringify(clean(fresh))!==JSON.stringify(clean(again)))die("NON_DETERMINISTIC_LOGICAL_RESULT");
if(!fresh.acceptance?.accepted||Object.keys(fresh.scenarios??{}).length!==15)die("NEXT_012_ACCEPTANCE_FAILED");
const j=fresh.scenarios.jointAuxiliaryTasks;if(j.plannedTaskCount!==26||j.members?.length!==2||j.resourcePresence!==20||j.resourceInternalGap!==0||j.jointGroupViolationCount!==0||j.workItemSelectionOrder.filter(x=>x==="joint:shared-operation-1").length!==1)die("NEXT_012_EVIDENCE_FAILED");
if(fs.existsSync(artifact)){const old=JSON.parse(fs.readFileSync(artifact));if(JSON.stringify(clean(old))!==JSON.stringify(clean(fresh)))die("CURRENT_ARTIFACT_LOGICAL_MISMATCH");}
else {const old=JSON.parse(fs.readFileSync(legacy));for(const [name,value] of Object.entries(old.scenarios))if(JSON.stringify(clean(value))!==JSON.stringify(clean(fresh.scenarios[name])))die(`HISTORICAL_SCENARIO_CHANGED:${name}`);fs.copyFileSync(freshPath,artifact);fs.unlinkSync(legacy);}
if(!JSON.parse(fs.readFileSync(artifact)).acceptance?.accepted)die("PUBLISHED_ARTIFACT_INVALID");
console.log(`artifactSha256=${crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex")}`);
NODE
rm -f "$failed"
