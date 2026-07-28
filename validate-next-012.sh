#!/usr/bin/env bash
set -euo pipefail
artifact=planner-next-joint-auxiliary-tasks-v2.json
legacy=planner-next-joint-auxiliary-tasks-v1.json
failed=planner-next-joint-auxiliary-tasks-v2.failed.json
tmp1=$(mktemp); tmp2=$(mktemp); trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({version:"planner-next-joint-auxiliary-tasks-v2",accepted:false,reason:process.argv[2]},null,2)+"\n")' "$failed" "$1"; echo "$1" >&2; exit 1; }
[[ -f "$artifact" || -f "$legacy" ]] || fail "NO_ACCEPTED_BASELINE_ARTIFACT"
npm run check || fail "TYPECHECK_FAILED"
npx tsx --test engine/planner-next/*.spec.ts || fail "PLANNER_NEXT_TESTS_FAILED"
npm test || fail "FULL_TEST_SUITE_FAILED"
npx tsx engine/planner-next/benchmarks/runPlannerNextJointAuxiliaryTasksBenchmark.ts > "$tmp1" || fail "BENCHMARK_FIRST_RUN_FAILED"
npx tsx engine/planner-next/benchmarks/runPlannerNextJointAuxiliaryTasksBenchmark.ts > "$tmp2" || fail "BENCHMARK_SECOND_RUN_FAILED"
node --input-type=module - "$tmp1" "$tmp2" "$artifact" "$legacy" "$failed" <<'NODE' || exit 1
import fs from "node:fs";import crypto from "node:crypto";
const [freshPath,againPath,artifact,legacy,failed]=process.argv.slice(2),fresh=JSON.parse(fs.readFileSync(freshPath)),again=JSON.parse(fs.readFileSync(againPath));
const clean=x=>Array.isArray(x)?x.map(clean):x&&typeof x==="object"?Object.fromEntries(Object.entries(x).filter(([k])=>k!=="runtimeMs").map(([k,v])=>[k,clean(v)])):x;
const die=reason=>{fs.writeFileSync(failed,JSON.stringify({version:"planner-next-joint-auxiliary-tasks-v2",accepted:false,reason},null,2)+"\n");process.exit(1)};
if(JSON.stringify(clean(fresh))!==JSON.stringify(clean(again)))die("NON_DETERMINISTIC_LOGICAL_RESULT");
if(fresh.version!=="planner-next-joint-auxiliary-tasks-v2"||!fresh.acceptance?.accepted||Object.keys(fresh.scenarios??{}).length!==15)die("NEXT_012_ACCEPTANCE_FAILED");
const e=fresh.jointFutureFeasibilityEvidence;
if(!fresh.acceptance.jointFutureFeasibilityBudgetAccepted||e?.shortBudget?.exhausted!==true||e.shortBudget.feasible!==false||e.shortBudget.branchesConsumed!==2||e.shortBudget.budgetRemaining!==0||e?.bestK?.assessment?.alternativeCount!==3||e.bestK.assessment.kind!=="joint"||e.bestK.assessment.key!=="joint:shared-operation-1")die("JOINT_FUTURE_FEASIBILITY_EVIDENCE_FAILED");
const j=fresh.scenarios.jointAuxiliaryTasks;
if(j.planFingerprint!=="4ecc23301acb7406643159020f124b408e79c61a6c4e4c3605faf5b470fde7aa"||j.plannedTaskCount!==26||j.members?.length!==2||j.members.some(x=>x.start!==610||x.end!==630||x.spaceId!=="joint-room"||!x.resourceIds.includes("joint-resource"))||j.candidateCount!==9||j.resourcePresence!==20||j.resourceInternalGap!==0||j.jointGroupViolationCount!==0||j.violationCount!==0||j.workItemSelectionOrder.filter(x=>x==="joint:shared-operation-1").length!==1)die("NEXT_012_OPERATIONAL_EVIDENCE_FAILED");
if(Object.values(fresh.scenarios).some(x=>x.runtimeMs>=2000||x.violationCount!==0)||j.logicalMetrics.branchBudgetMaximum!==300000||fresh.scenarios.itinerantUnits.logicalMetrics.branchBudgetMaximum!==300000||fresh.scenarios.itinerantUnits.logicalMetrics.branchBudgetConsumed>285317)die("BUDGET_RUNTIME_OR_VALIDATION_FAILED");
if(fs.existsSync(artifact)){const old=JSON.parse(fs.readFileSync(artifact));if(JSON.stringify(clean(old))!==JSON.stringify(clean(fresh)))die("CURRENT_ARTIFACT_LOGICAL_MISMATCH");}
else{
 const old=JSON.parse(fs.readFileSync(legacy)),names=Object.keys(old.scenarios);if(names.length!==15)die("LEGACY_SCENARIO_COUNT_INVALID");
 for(const name of names.filter(x=>x!=="jointAuxiliaryTasks"))if(JSON.stringify(clean(old.scenarios[name]))!==JSON.stringify(clean(fresh.scenarios[name])))die(`HISTORICAL_SCENARIO_CHANGED:${name}`);
 const stripBranches=x=>{const y=clean(x),m=y.logicalMetrics;for(const k of ["futureFeasibilityBranchesExplored","auxiliaryBranchesExplored","branchBudgetConsumed","branchesExplored"])delete m[k];delete y.branches;return y};
 if(JSON.stringify(stripBranches(old.scenarios.jointAuxiliaryTasks))!==JSON.stringify(stripBranches(fresh.scenarios.jointAuxiliaryTasks)))die("NEXT_012_NON_BRANCH_EVIDENCE_CHANGED");
 fs.copyFileSync(freshPath,artifact);if(!JSON.parse(fs.readFileSync(artifact)).acceptance?.accepted)die("PUBLISHED_ARTIFACT_INVALID");fs.unlinkSync(legacy);
}
console.log(`artifactSha256=${crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex")}`);
NODE
rm -f "$failed"
