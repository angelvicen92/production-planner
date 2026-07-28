#!/usr/bin/env bash
set -uo pipefail
artifact=planner-next-branch-local-ranking-v1.json
failed=planner-next-branch-local-ranking-v1.failed.json
tmp1=$(mktemp); tmp2=$(mktemp); trap 'rm -f "$tmp1" "$tmp2"' EXIT
fail(){ printf '{"version":"planner-next-branch-local-ranking-v1","accepted":false,"reason":%s}\n' "$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1")" > "$failed"; echo "$1" >&2; exit 1; }
npm run check || fail 'npm run check failed'
npx tsx --test engine/planner-next/*.spec.ts || fail 'Planner Next tests failed'
npm test || fail 'full test suite failed'
npm run --silent benchmark:planner-next:branch-local-ranking > "$tmp1" || fail 'first benchmark failed'
npm run --silent benchmark:planner-next:branch-local-ranking > "$tmp2" || fail 'second benchmark failed'
reason=$(node - "$tmp1" "$tmp2" <<'NODE'
const fs=require('fs'),[a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));
const reject=message=>{process.stdout.write(message);process.exit(1)};
const clean=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='runtimeMs'?undefined:v));
if(!a.acceptance.accepted||!b.acceptance.accepted)reject('benchmark acceptance.accepted is false');
if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))reject('benchmark logical outputs differ between runs');
const names=['baseline','adversarial','adversarialZeroBacktracks','resourceOff','resourceHigh','auxiliaryOff','auxiliaryHigh','itinerantUnits','longSecondaryBlock','futureFeasibility','boundedFutureFeasibility','branchHistoryIsolatedPruning'];
if(JSON.stringify(Object.keys(a.scenarios))!==JSON.stringify(names))reject('benchmark does not contain the twelve ordered scenarios');
const expected=a.acceptance.frozenFingerprints;
for(const [name,fingerprint] of Object.entries(expected))if(a.scenarios[name]?.planFingerprint!==fingerprint)reject(`fingerprint mismatch for ${name}`);
const h=a.branchHistoryInvariance;if(!h.projectionsEqual||!h.originalWorkItemOrderEqual||!h.isolatedTasksPlanned||h.isolatedFuturePrunes<1||h.isolatedTopLocalPrunes<1)reject('branch-history invariance evidence is incorrect');if(!Object.keys(h.isolatedBlockers).every(k=>h.isolatedTaskIds.some(id=>k===`task:${id}`)))reject('non-isolated blocker recorded');const variant=a.scenarios.branchHistoryIsolatedPruning;if(!variant.complete||!variant.hardValid||variant.plannedTaskCount!==22||variant.violationCount!==0)reject('isolated variant invalid');const historical=a.scenarios.futureFeasibility,bounded=a.scenarios.boundedFutureFeasibility,e=bounded.boundedEvidence,c=a.boundedBlockConstruction;
if(historical.bestK!==5||bounded.bestK!==1||e.bestK!==1||c.bestK!==1)reject('NEXT-007/NEXT-008 Best-K evidence is incorrect');
if(e.topLocalCandidateFeasible!==false||!e.topLocalCandidateBlockers.includes('task:scarce-window-task'))reject('top local candidate blocker evidence is incorrect');
if(e.secondLocalCandidateFeasible!==true||!e.acceptedBlockIsViableAlternative)reject('viable local alternative evidence is incorrect');
if(!bounded.complete||!bounded.hardValid||bounded.plannedTaskCount!==22||bounded.violationCount!==0)reject('bounded scenario completion or validity evidence is incorrect');
if(!c.withinBound||!c.deterministic||c.maximumPartialStatesPerStart>1||c.searchBranches>c.polynomialUpperBound||c.probeBranchesLimit1>=c.searchBranches||c.probeBranchesLimitBestK>c.searchBranches||c.completeCandidatesGenerated<2)reject('bounded construction or early PROBE evidence is incorrect');
for(const [name,x] of Object.entries(a.scenarios)){
 const m=x.logicalMetrics;
 if(x.runtimeMs>=2000)reject(`${name} runtime reached two seconds`);
 if(m.branchBudgetConsumed>m.branchBudgetMaximum)reject(`${name} exceeded its branch budget`);
 if(m.secondaryBlockBranchesExplored+m.futureFeasibilityBranchesExplored>m.auxiliaryBranchesExplored)reject(`${name} has incoherent auxiliary branch counters`);
}
NODE
) || fail "${reason:-benchmark validation failed}"
cp "$tmp1" "$artifact"; rm -f "$failed" planner-next-bounded-future-feasibility-v1.json planner-next-future-feasibility-v1.json
