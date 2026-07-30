#!/usr/bin/env bash
set -uo pipefail

artifact="planner-next-focal-a2-band-required-audit-v2.json"
legacy="planner-next-focal-a2-band-required-audit-v1.json"
preferred_legacy="planner-next-focal-a2-band-preferred-v2.json"
failed="planner-next-focal-a2-band-required-audit-v2.failed.json"
manifest="engine/planner-next/benchmarks/focal-a2/focalA2BandRequiredAuditHistoricalManifest.json"
requested_mode="${1:-auto}"
tmp1="$(mktemp)"; tmp2="$(mktemp)"
trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail() {
  local reason="${1:-UNKNOWN_FAILURE}"
  node - "$failed" "$reason" <<'NODE'
const fs=require("node:fs"); const [path,reason]=process.argv.slice(2);
fs.writeFileSync(path,JSON.stringify({version:"planner-next-focal-a2-band-required-audit-v2",accepted:false,reason},null,2)+"\n");
NODE
  exit 1
}
if [[ -f "$artifact" ]]; then mode=current; elif [[ -f "$legacy" ]]; then mode=legacy; elif [[ -f "$preferred_legacy" ]]; then legacy="$preferred_legacy"; mode=legacy; else fail NO_CURRENT_OR_LEGACY_ARTIFACT; fi
[[ "$requested_mode" == auto || "$requested_mode" == "$mode" ]] || fail MODE_ARTIFACT_MISMATCH
[[ -f "$manifest" ]] || fail MISSING_HISTORICAL_MANIFEST
protected="$artifact"; [[ "$mode" == legacy ]] && protected="$legacy"
protected_sha="$(sha256sum "$protected" | cut -d' ' -f1)"

if [[ "${FOCAL_A2_005_SKIP_SUITES:-0}" != 1 ]]; then
  npm run check || fail NPM_CHECK_FAILED
  npx tsx --test engine/planner-next/resourcePresence.spec.ts engine/planner-next/requiredCompositeBlock.spec.ts engine/planner-next/requiredContinuousResource.spec.ts || fail REQUIRED_TESTS_FAILED
  npx tsx --test engine/planner-next/benchmarks/focal-a2/focalA2RequiredFeasibilityAudit.spec.ts engine/planner-next/benchmarks/runPlannerNextFocalA2RequiredAuditBenchmark.spec.ts engine/planner-next/benchmarks/focal-a2/focalA2BandReference.spec.ts || fail FOCAL_TESTS_FAILED
  node script/run-test-suite.mjs engine/planner-next || fail PLANNER_NEXT_TESTS_FAILED
  npm test || fail NPM_TEST_FAILED
fi
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2RequiredAuditBenchmark.ts >"$tmp1" || fail BENCHMARK_FIRST_RUN_FAILED
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2RequiredAuditBenchmark.ts >"$tmp2" || fail BENCHMARK_SECOND_RUN_FAILED

node - "$tmp1" "$tmp2" "$manifest" <<'NODE' || fail ARTIFACT_GATES_FAILED
const fs=require("node:fs"); const [a,b,m]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));
const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).filter(k=>k!=="runtimeMs").sort().map(k=>[k,clean(v[k])])):v;
const expect=(x,c)=>{if(!x)throw Error(c)}; const manifest=m;
expect(JSON.stringify(clean(a))===JSON.stringify(clean(b)),"NON_DETERMINISTIC");
expect(a.version==="planner-next-focal-a2-band-required-audit-v2"&&a.status==="BAND_REQUIRED_COMPOSITE_ACCEPTED_FOCAL_REQUIRED_INFEASIBLE","IDENTITY");
expect(a.acceptance.accepted===true&&Object.keys(a.scenarios).length===24,"ACCEPTANCE");
const r=a.currentRequiredFailure,c=a.focalRequiredFeasibilityEvidence.certificate;
expect(!r.complete&&r.searchStopReason==="NO_COMPLETE_HARD_VALID_PLAN"&&JSON.stringify(r.reasonCodes)==='["NO_COMPLETE_HARD_VALID_PLAN"]',"REQUIRED_FAILURE");
expect(r.fingerprint===manifest.frozenCurrentRequiredFailure.fingerprint&&r.branches===manifest.frozenCurrentRequiredFailure.branches&&r.branchBudgetConsumed===manifest.frozenCurrentRequiredFailure.branches,"REQUIRED_FROZEN");
expect(r.scheduledTasks.length+r.scheduledSetupPreparations.length+r.scheduledSpaceMeals.length===0,"NOT_ATOMIC");
expect(c.infeasible&&c.feasibleRequiredWindowCount===0&&c.blockerTaskIds.includes("main-marta-fonrali")&&c.blockerTaskIds.includes("main-pere-portero"),"CERTIFICATE");
expect(a.focalRequiredFeasibilityEvidence.deterministic&&a.focalRequiredFeasibilityEvidence.orderInvariant&&a.focalRequiredFeasibilityEvidence.atomic,"EVIDENCE");
expect(a.requiredPolicyControls.feasibleContiguous.accepted&&a.requiredPolicyControls.feasibleWithAuthorizedMeal.accepted&&a.requiredPolicyControls.splitInvalid.accepted&&a.requiredPolicyControls.impossibleAtomic.accepted&&a.requiredPolicyControls.multipleRequiredResources.accepted,"CONTROLS");
expect(a.currentOff.fingerprint===manifest.frozenCurrentOff.fingerprint&&a.currentOff.branches===64558,"OFF");
expect(a.preferredPlan.fingerprint===manifest.frozenPreferredPlan.fingerprint&&a.preferredPlan.branches===15599,"PREFERRED");
expect(a.historicalRegressionEvidence.intact&&["scenarioDigestMismatchIds","evidenceDigestMismatchIds","fingerprintMismatchIds","branchBudgetMismatchIds","currentOffMismatchFields","preferredPlanMismatchFields","currentRequiredFailureMismatchFields"].every(k=>a.historicalRegressionEvidence[k].length===0),"MANIFEST");
NODE

if [[ "$mode" == current ]]; then
  node - "$tmp1" "$artifact" <<'NODE' || fail CURRENT_ARTIFACT_DIFFERS_FROM_FRESH_RUN
const fs=require("node:fs"),clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).filter(k=>k!=="runtimeMs").sort().map(k=>[k,clean(v[k])])):v;
const [a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))throw Error("DIFF");
NODE
  [[ "$(sha256sum "$artifact"|cut -d' ' -f1)" == "$protected_sha" ]] || fail CURRENT_ARTIFACT_SHA_CHANGED
else
  [[ "$(sha256sum "$legacy"|cut -d' ' -f1)" == "$protected_sha" ]] || fail LEGACY_ARTIFACT_SHA_CHANGED
  publish="${artifact}.new.$$"; cp "$tmp1" "$publish" || fail PUBLICATION_COPY_FAILED; mv "$publish" "$artifact" || fail ATOMIC_PUBLICATION_FAILED
  node -e 'let x=require("./planner-next-focal-a2-band-required-audit-v2.json");if(!x.acceptance.accepted||Object.keys(x.scenarios).length!==24)process.exit(1)' || fail PUBLISHED_ARTIFACT_INVALID
  rm -f "$legacy"
fi
[[ "$(find . -maxdepth 1 -type f -name 'planner-next-*.json' ! -name '*.failed.json'|wc -l)" -eq 1 ]] || fail MULTIPLE_ACTIVE_ARTIFACTS
rm -f "$failed"
