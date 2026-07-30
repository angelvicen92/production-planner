#!/usr/bin/env bash
set -uo pipefail
v3="planner-next-focal-a2-band-required-audit-v3.json"
v4="planner-next-focal-a2-band-semantics-v4.json"
failed="planner-next-focal-a2-band-semantics-v4.failed.json"
manifest="engine/planner-next/benchmarks/focal-a2/focalA2BandSemanticsV4HistoricalManifest.json"
requested="${1:-auto}"
tmp1="$(mktemp)"; tmp2="$(mktemp)"
trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ printf '{"version":"planner-next-focal-a2-band-semantics-v4","accepted":false,"reason":"%s"}\n' "${1:-UNKNOWN}" > "$failed"; exit 1; }
if [[ -f "$v4" ]]; then mode=current; elif [[ -f "$v3" ]]; then mode=legacy; else fail NO_CURRENT_OR_LEGACY_ARTIFACT; fi
[[ "$requested" == auto || "$requested" == "$mode" ]] || fail MODE_ARTIFACT_MISMATCH
[[ -f "$manifest" ]] || fail MISSING_MANIFEST
expected_sha="$(node -e "console.log(require('./$manifest').sourceArtifactSha256)")"
if [[ "$mode" == legacy ]]; then [[ "$(sha256sum "$v3" | cut -d' ' -f1)" == "$expected_sha" ]] || fail V3_SHA_MISMATCH; fi
protected="$v4"; [[ "$mode" == legacy ]] && protected="$v3"; protected_sha="$(sha256sum "$protected" | cut -d' ' -f1)"
if [[ "${SKIP_SUITES:-0}" != 1 ]]; then
  npm run check || fail NPM_CHECK_FAILED
  npx tsx --test engine/planner-next/benchmarks/focal-a2/focalA2BandReference.spec.ts engine/planner-next/benchmarks/runPlannerNextFocalA2RequiredAuditBenchmark.spec.ts || fail FOCAL_TESTS_FAILED
  npm test || fail NPM_TEST_FAILED
fi
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2RequiredAuditBenchmark.ts > "$tmp1" || fail BENCHMARK_FIRST_FAILED
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2RequiredAuditBenchmark.ts > "$tmp2" || fail BENCHMARK_SECOND_FAILED
node - "$tmp1" "$tmp2" "$manifest" <<'NODE' || fail GATES_FAILED
const fs=require('fs'),crypto=require('crypto');const [ap,bp,mp]=process.argv.slice(2),a=JSON.parse(fs.readFileSync(ap)),b=JSON.parse(fs.readFileSync(bp)),m=JSON.parse(fs.readFileSync(mp));
const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,clean(v[k])])):v;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(clean(v))).digest('hex'),expect=(v,c)=>{if(!v)throw Error(c)};
expect(JSON.stringify(clean(a))===JSON.stringify(clean(b)),'NON_DETERMINISTIC');expect(a.version==='planner-next-focal-a2-band-semantics-v4'&&a.status==='BAND_OPERATIONAL_SCOPE_ACCEPTED_INSTRUMENT_INFORMATIONAL','IDENTITY');
expect(Object.keys(a.scenarios).length===26&&Object.keys(m.scenarioDigests).length===25,'SCENARIO_COUNT');for(const [id,d] of Object.entries(m.scenarioDigests))expect(digest(a.scenarios[id])===d,'HISTORY_'+id);
const s=a.scenarios.focalA2InstrumentMetadataSemantics,c=Object.fromEntries(s.flagCombinations.map(x=>[x.id,x]));expect(s.annotations.length===6&&s.informationalVariantDigests.length===3&&new Set(s.executionFingerprints).size===1,'VARIANTS');expect(s.noInstrumentResources&&c.NEITHER.projection.requiredResourceIds.length===0&&c.INSTRUMENT_ONLY.projection.requiredResourceIds.length===0,'NO_INSTRUMENT_RESOURCE');expect(JSON.stringify(c.BAND_ONLY.projection.requiredResourceIds)===JSON.stringify(c.BOTH.projection.requiredResourceIds),'BOTH');
expect(a.withdrawnAssumptionCodes.length===1&&a.withdrawnAssumptionCodes[0]==='MAIN_FLOW_INSTRUMENT_REQUIREMENT_NOT_REPRESENTABLE'&&a.withdrawalEvidence.status==='WITHDRAWN_INVALID_OPERATIONAL_ASSUMPTION'&&a.remainingGapCodes.length===0,'GAPS');expect(a.acceptance.accepted&&a.acceptance.currentOffFrozen&&a.acceptance.currentPreferredFrozen&&a.acceptance.currentRequiredFrozen,'ACCEPTANCE');
NODE
if [[ "$mode" == current ]]; then
  node - "$tmp1" "$v4" <<'NODE' || fail CURRENT_DIFFERS
const fs=require('fs'),clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,clean(v[k])])):v;const [a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))process.exit(1);
NODE
  [[ "$(sha256sum "$v4"|cut -d' ' -f1)" == "$protected_sha" ]] || fail CURRENT_SHA_CHANGED
else
  [[ "$(sha256sum "$v3"|cut -d' ' -f1)" == "$protected_sha" ]] || fail V3_CHANGED
  publish="${v4}.new.$$"; cp "$tmp1" "$publish" && mv "$publish" "$v4" || fail ATOMIC_PUBLICATION_FAILED
  rm -f "$v3"
fi
[[ "$(find . -maxdepth 1 -type f -name 'planner-next-focal-a2-*.json' ! -name '*.failed.json' | wc -l)" -eq 1 ]] || fail MULTIPLE_FOCAL_ARTIFACTS
rm -f "$failed"
