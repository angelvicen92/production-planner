#!/usr/bin/env bash
set -uo pipefail
MODE=${1:-auto}; OUT=planner-next-focal-a2-itinerant-spec08-foundation-v4.json
SRC=engine/planner-next/benchmarks/focal-a2/focalA2Spec08FoundationV3AcceptedArtifact.json
EXPECTED=cf87e0ca0e9f8ad62b0a06fbd4a49206a8f0357b2a5003c833145c3b8f082bb5
[[ "$MODE" =~ ^(legacy|current|auto)$ ]] || { echo 'mode must be legacy, current, or auto' >&2; exit 2; }
REQUESTED=$MODE; if [[ "$MODE" == auto ]]; then [[ -f "$OUT" ]] && MODE=current || MODE=legacy; fi
[[ "$MODE" != current || -f "$OUT" ]] || { echo 'current artifact missing' >&2; exit 1; }
[[ "$(sha256sum "$SRC"|cut -d' ' -f1)" == "$EXPECTED" ]] || { echo source-sha-mismatch >&2; exit 1; }
TMP=$(mktemp -d .focal-a2-010r1.XXXXXX); PREVIOUS=$TMP/previous.json; [[ -f "$OUT" ]] && cp "$OUT" "$PREVIOUS"
cleanup(){ rm -rf "$TMP"; }
fail(){ local s=$?; rm -f "$OUT"; [[ -f "$PREVIOUS" ]]&&cp "$PREVIOUS" "$OUT"; cleanup; echo "FOCAL-A2-010R1 validation failed" >&2; exit ${s:-1}; }
trap fail INT TERM ERR
rm -f "$OUT"
COMMANDS=("npm run check" "npm run build" "npx tsx --test engine/planner-next/anchoredAccompaniment.spec.ts" "node script/run-test-suite.mjs engine-planner-next" "npm test")
npm run check
npm run build
npx tsx --test engine/planner-next/anchoredAccompaniment.spec.ts
node script/run-test-suite.mjs engine-planner-next
npm test
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV4Benchmark.ts > "$TMP/direct.json"
node - "$TMP/direct.json" <<'NODE'
const a=JSON.parse(require("fs").readFileSync(process.argv[2],"utf8"));if(a.acceptance.accepted||a.acceptance.finalRepositoryTestsAccepted||a.status!=="FOCAL_A2_SPEC08_VALIDATION_REQUIRED")throw Error("direct benchmark accepted");
NODE
node - "$TMP/receipt.json" "$MODE" "$EXPECTED" <<'NODE'
const fs=require('fs');fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:"focal-a2-010r1-validator-v1",completedCommands:["npm run check","npm run build","npx tsx --test engine/planner-next/anchoredAccompaniment.spec.ts","node script/run-test-suite.mjs engine-planner-next","npm test"],mode:process.argv[3],sourceArtifactObservedSha256:process.argv[4]},null,2));
NODE
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV4Benchmark.ts --validation-evidence "$TMP/receipt.json" > "$TMP/a.json"
npx tsx engine/planner-next/benchmarks/runPlannerNextFocalA2Spec08FoundationV4Benchmark.ts --validation-evidence "$TMP/receipt.json" > "$TMP/b.json"
node - "$TMP/a.json" "$TMP/b.json" <<'NODE'
const fs=require('fs'),[a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));const c=v=>Array.isArray(v)?v.map(c):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='runtimeMs').sort().map(k=>[k,c(v[k])])):v;if(JSON.stringify(c(a))!==JSON.stringify(c(b)))throw Error('non-deterministic evidence');const s=a.scenarios[a.activeScenarioId];if(!a.acceptance.accepted||a.status!=="FOCAL_A2_SPEC08_MAIN_ANCHORED_ACCOMPANIMENT_ACCEPTED"||a.scenarioCount!==33||!Object.values(s.checks).every(Boolean)||s.plannedTaskCount!==53||s.operationCount!==12||s.productiveMinutes!==375||s.partialOperationCount!==0)throw Error('acceptance failed');
NODE
mv "$TMP/a.json" "$TMP/publish.json"; mv "$TMP/publish.json" "$OUT"
node -e 'const a=require("./planner-next-focal-a2-itinerant-spec08-foundation-v4.json");if(!a.acceptance.accepted||a.evidenceRevision!=="FOCAL-A2-010R1")process.exit(1)'
node script/run-test-suite.mjs engine-planner-next
find . -maxdepth 1 -type f -name 'planner-next-focal-a2-itinerant-spec08-foundation-v*.json' ! -name "$OUT" -delete
trap - INT TERM ERR; cleanup
echo "FOCAL-A2-010R1 $REQUESTED ($MODE) accepted: $(sha256sum "$OUT"|cut -d' ' -f1)"
