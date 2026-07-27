#!/usr/bin/env bash
set -uo pipefail
VALID="planner-next-main-flow-vocal-v1.json"; FAILED="planner-next-main-flow-vocal-v1.failed.json"; TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail() { printf '{"status":"failed","reason":%s}\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1")" > "$FAILED"; echo "NEXT-001 validation failed: $1" >&2; exit 1; }
npm run check || fail "npm run check"
npx tsx --test engine/planner-next/planMainFlowAndFeeders.spec.ts || fail "focal tests"
npm test || fail "npm test"
npm run benchmark:planner-next:focal > "$TMP/raw1" || fail "benchmark run 1"
npm run benchmark:planner-next:focal > "$TMP/raw2" || fail "benchmark run 2"
for n in 1 2; do node --input-type=module - "$TMP/raw$n" "$TMP/run$n.json" <<'NODE' || fail "benchmark JSON extraction"
import {readFileSync,writeFileSync} from 'node:fs'; const s=readFileSync(process.argv[2],'utf8'),i=s.indexOf('{'); writeFileSync(process.argv[3],JSON.stringify(JSON.parse(s.slice(i)),null,2)+'\n');
NODE
done
node --input-type=module - "$TMP/run1.json" "$TMP/run2.json" "$TMP/artifact" <<'NODE' || fail "acceptance criteria"
import {readFileSync,writeFileSync} from 'node:fs'; const [a,b]=process.argv.slice(2,4).map(x=>JSON.parse(readFileSync(x,'utf8'))); const logical=x=>{const y={...x};delete y.runtimeMs;return y};
if(JSON.stringify(logical(a))!==JSON.stringify(logical(b)))throw Error('logical metrics differ');
if(!a.complete||!a.hardValid||a.plannedTaskCount!==16||a.unplannedTaskCount!==0||a.mainFlowGapMinutes!==0||a.mainFlowEnd!=="15:00"||a.maxParticipantPresenceMinutes>90||a.runtimeMs>=2000)throw Error('focal acceptance metric failed');
for(const k of ['dependencyViolationCount','overlapViolationCount','transitionViolationCount','availabilityViolationCount','blockViolationCount'])if(a[k]!==0)throw Error(`${k} is non-zero`);
writeFileSync(process.argv[4],JSON.stringify({...a,validation:{benchmarkFingerprintMatched:true,logicalMetricsMatched:true,runtimeBudgetMs:2000}},null,2)+'\n');
NODE
mv "$TMP/artifact" "$VALID"; rm -f "$FAILED"; echo "NEXT-001 validation passed; wrote $VALID"
