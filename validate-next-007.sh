#!/usr/bin/env bash
set -euo pipefail
artifact=planner-next-future-feasibility-v1.json
failed=planner-next-future-feasibility-v1.failed.json
tmp1=$(mktemp); tmp2=$(mktemp); clean(){ rm -f "$tmp1" "$tmp2"; }; trap clean EXIT
fail(){ cp "$tmp1" "$failed" 2>/dev/null || true; echo "NEXT-007 validation failed" >&2; exit 1; }
npm run check || fail
npx tsx --test engine/planner-next/*.spec.ts || fail
npm test || fail
npm run benchmark:planner-next:future-feasibility | sed -n '/^{/,$p' > "$tmp1" || fail
npm run benchmark:planner-next:future-feasibility | sed -n '/^{/,$p' > "$tmp2" || fail
node --input-type=module - "$tmp1" "$tmp2" <<'NODE' || fail
import fs from 'node:fs';const [a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p,'utf8')));if(!a.acceptance.accepted||!b.acceptance.accepted)throw Error('acceptance failed');
for(const k of Object.keys(a.scenarios)){const strip=x=>{const y=structuredClone(x);delete y.runtimeMs;return y};if(JSON.stringify(strip(a.scenarios[k]))!==JSON.stringify(strip(b.scenarios[k])))throw Error(`nondeterministic ${k}`);if(a.scenarios[k].runtimeMs>=2000||b.scenarios[k].runtimeMs>=2000)throw Error(`runtime ${k}`)}
const n6=a.scenarios.longSecondaryBlock,n7=a.scenarios.futureFeasibility;if(n6.secondaryContinuityViolationCount||n6.secondarySpaceGapMinutesById['long-form-room']||n6.secondarySpaceBlockCountById['long-form-room']!==1||n6.secondarySpaceEndById['long-form-room']-n6.secondarySpaceStartById['long-form-room']!==120||n6.secondarySpaceStartById['long-form-room']<=540)throw Error('NEXT-006');if(!n7.complete||!n7.hardValid||n7.plannedTaskCount!==22||n7.violationCount||!n7.auxiliary['scarce-window-task']||n7.logicalMetrics.futureInfeasibleCandidatesPruned<1||n7.logicalMetrics.futureTopRankedCandidatesPruned<1||n7.logicalMetrics.futureBlockerCountByWorkItemKey['task:scarce-window-task']<1||n7.logicalMetrics.acceptedPathMinimumFutureAlternativeCount<1)throw Error('NEXT-007');
NODE
cp "$tmp1" "$artifact"; rm -f "$failed" planner-next-long-secondary-block-v1.json
echo "NEXT-007 validation passed: $artifact"
