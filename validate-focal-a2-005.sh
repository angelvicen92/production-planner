#!/usr/bin/env bash
set -uo pipefail
artifact="planner-next-focal-a2-band-required-audit-v3.json"
legacy="planner-next-focal-a2-band-required-audit-v2.json"
failed="planner-next-focal-a2-band-required-audit-v3.failed.json"
manifest="engine/planner-next/benchmarks/focal-a2/focalA2BandRequiredCompositeV3HistoricalManifest.json"
requested_mode="${1:-auto}"
tmp1="$(mktemp)"; tmp2="$(mktemp)"
trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ local reason="${1:-UNKNOWN_FAILURE}"; node - "$failed" "$reason" <<'NODE'
const fs=require('node:fs');const [path,reason]=process.argv.slice(2);fs.writeFileSync(path,JSON.stringify({version:'planner-next-focal-a2-band-required-audit-v3',accepted:false,reason},null,2)+'\n');
NODE
exit 1; }
if [[ -f "$artifact" ]]; then mode=current; elif [[ -f "$legacy" ]]; then mode=legacy; else fail NO_CURRENT_OR_LEGACY_ARTIFACT; fi
[[ "$requested_mode" == auto || "$requested_mode" == "$mode" ]] || fail MODE_ARTIFACT_MISMATCH
[[ -f "$manifest" ]] || fail MISSING_HISTORICAL_MANIFEST
if [[ "$mode" == legacy ]]; then
  [[ "$(sha256sum "$legacy"|cut -d' ' -f1)" == eb4c95ecfd3b8d906805b2788e2e05fdddfad7330721799c87b3e6d5980c9985 ]] || fail LEGACY_SHA_MISMATCH
fi
protected="${artifact}"; [[ "$mode" == legacy ]] && protected="$legacy"; protected_sha="$(sha256sum "$protected"|cut -d' ' -f1)"
if [[ "${FOCAL_A2_005_SKIP_SUITES:-0}" == 1 && "$mode" == current ]]; then
 node - "$artifact" <<'NODE' || fail LEGACY_CURRENT_ARTIFACT_INVALID
const fs=require('node:fs');const a=JSON.parse(fs.readFileSync(process.argv[2]));const ok=a.version==='planner-next-focal-a2-band-required-audit-v3'&&a.status==='BAND_REQUIRED_COMPOSITE_FOUNDATION_ACCEPTED'&&a.acceptance.accepted&&Object.keys(a.scenarios).length===25&&a.currentOff.fingerprint==='76f52d292e810ab8506ba868d77036126f299bcf129462a62b6c3b49a13be4fc'&&a.preferredPlan.fingerprint==='cff587b5eac3b77d6e81589791035aead34187b65ab248d9586e462294e0087b'&&!a.currentRequiredFailure.complete;if(!ok)process.exit(1);
NODE
 rm -f "$failed"
 exit 0
fi
if [[ "${FOCAL_A2_005_SKIP_SUITES:-0}" != 1 ]]; then
 npm run check || fail NPM_CHECK_FAILED
 npx tsx --test engine/planner-next/requiredCompositeBlock.spec.ts engine/planner-next/planMainFlowAndFeeders.spec.ts engine/planner-next/benchmarks/focal-a2/focalA2RequiredFeasibilityAudit.spec.ts engine/planner-next/benchmarks/runPlannerNextFocalA2RequiredAuditBenchmark.spec.ts || fail FOCAL_TESTS_FAILED
 npm test || fail NPM_TEST_FAILED
fi
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2RequiredAuditBenchmark.ts >"$tmp1" || fail BENCHMARK_FIRST_RUN_FAILED
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2RequiredAuditBenchmark.ts >"$tmp2" || fail BENCHMARK_SECOND_RUN_FAILED
node - "$tmp1" "$tmp2" "$manifest" <<'NODE' || fail ARTIFACT_GATES_FAILED
const fs=require('node:fs'),crypto=require('node:crypto');const [ap,bp,mp]=process.argv.slice(2),[a,b,m]=[ap,bp,mp].map(p=>JSON.parse(fs.readFileSync(p)));
const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,clean(v[k])])):v;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(clean(v))).digest('hex');const expect=(v,c)=>{if(!v)throw Error(c)};
expect(JSON.stringify(clean(a))===JSON.stringify(clean(b)),'NON_DETERMINISTIC');expect(a.version==='planner-next-focal-a2-band-required-audit-v3'&&a.status==='BAND_REQUIRED_COMPOSITE_FOUNDATION_ACCEPTED','IDENTITY');
expect(a.acceptance.accepted&&Object.keys(a.scenarios).length===25&&Object.keys(m.scenarioDigests).length===24,'SCENARIOS');for(const [id,d] of Object.entries(m.scenarioDigests))expect(digest(a.scenarios[id])===d,'HISTORICAL_'+id);
const r=a.currentRequiredFailure,e=a.focalRequiredFeasibilityEvidence,s=a.scenarios.focalA2BandRequiredCompositeFoundationRepair;
expect(!r.complete&&!r.hardValid&&r.searchStopReason==='NO_COMPLETE_HARD_VALID_PLAN'&&r.fingerprint==='4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'&&r.branches<=1909,'REQUIRED');expect(r.scheduledTasks.length+r.scheduledSetupPreparations.length+r.scheduledSpaceMeals.length===0,'ATOMIC');
expect(e.certificateDeterministic&&e.certificateOrderInvariant&&e.certificateInputUnchanged,'CERTIFICATE_DETERMINISM');expect(s.martaEarliestMainStart===855&&s.pereEarliestMainStart===915,'MARGINS');expect(s.evaluatedCombinationCount<=s.structuralLimit&&!s.exhausted,'STRUCTURAL_LIMIT');
expect(a.currentOff.fingerprint==='76f52d292e810ab8506ba868d77036126f299bcf129462a62b6c3b49a13be4fc'&&a.currentOff.branches===64558,'OFF');expect(a.preferredPlan.fingerprint==='cff587b5eac3b77d6e81589791035aead34187b65ab248d9586e462294e0087b'&&a.preferredPlan.branches===15599,'PREFERRED');expect(a.historicalRegressionEvidence.intact,'MANIFEST');
NODE
if [[ "$mode" == current ]]; then
 node - "$tmp1" "$artifact" <<'NODE' || fail CURRENT_ARTIFACT_DIFFERS_FROM_FRESH_RUN
const fs=require('node:fs'),clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,clean(v[k])])):v;const [a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))process.exit(1);
NODE
 [[ "$(sha256sum "$artifact"|cut -d' ' -f1)" == "$protected_sha" ]] || fail CURRENT_ARTIFACT_SHA_CHANGED
else
 [[ "$(sha256sum "$legacy"|cut -d' ' -f1)" == "$protected_sha" ]] || fail LEGACY_ARTIFACT_SHA_CHANGED
 publish="${artifact}.new.$$"; cp "$tmp1" "$publish" && mv "$publish" "$artifact" || fail ATOMIC_PUBLICATION_FAILED
 rm -f "$legacy"
fi
[[ "$(find . -maxdepth 1 -type f -name 'planner-next-focal-a2-band-required-audit-v*.json' ! -name '*.failed.json'|wc -l)" -eq 1 ]] || fail MULTIPLE_ACTIVE_ARTIFACTS
rm -f "$failed"
