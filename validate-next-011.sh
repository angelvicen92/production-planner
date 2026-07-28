#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
artifact=planner-next-setup-preparation-v1.json; legacy=planner-next-setup-grouping-v1.json; failed=planner-next-setup-preparation-v1.failed.json
a=$(mktemp); b=$(mktemp); err=$(mktemp); trap 'rm -f "$a" "$b" "$err"' EXIT
fail(){ node -e 'require("fs").writeFileSync(process.argv[1],JSON.stringify({version:"planner-next-setup-preparation-v1",accepted:false,reason:process.argv[2]})+"\n")' "$failed" "$1"; echo "$1" >&2; exit 1; }
if [[ -f $artifact ]]; then mode=current; before=$(sha256sum "$artifact"|cut -d' ' -f1); elif [[ -f $legacy ]];then mode=legacy;else fail 'no accepted or legacy baseline artifact is available';fi
npm run check || fail 'npm run check failed'
npx tsx --test engine/planner-next/*.spec.ts || fail 'Planner Next tests failed'
npm test || fail 'full test suite failed'
npm run --silent benchmark:planner-next:setup-preparation >"$a" || fail 'first NEXT-011 benchmark failed'
npm run --silent benchmark:planner-next:setup-preparation >"$b" || fail 'second NEXT-011 benchmark failed'
node --input-type=module - "$a" "$b" "$legacy" "$mode" <<'JS' || fail 'NEXT-011 logical validation failed'
import fs from 'node:fs';const [ap,bp,legacy,mode]=process.argv.slice(2),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='runtimeMs').map(([k,x])=>[k,clean(x)])):v;
const a=read(ap),b=read(bp),s=a.scenarios?.setupPreparation,p=s?.scheduledSetupPreparations;
if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))throw Error('benchmarks differ');
if(a.version!=='planner-next-setup-preparation-v1'||a.acceptance?.accepted!==true||Object.keys(a.scenarios??{}).length!==14)throw Error('invalid artifact');
if(s.complete!==true||s.hardValid!==true||s.plannedTaskCount!==24||p?.length!==3||JSON.stringify(p.map(x=>x.duration))!==JSON.stringify([10,15,5])||s.setupPreparationMinutesBySpaceId?.['setup-room']!==30||s.occupiedSpanMinutes!==120||s.gap!==0||s.blockCount!==1||s.violationCounts?.setupPreparation!==0||s.violationCounts?.setup!==0||s.workItemSelectionOrder?.[0]!=='space:setup-room'||s.runtimeMs>=2000)throw Error('acceptance evidence failed');
if(a.scenarios.setupGrouping.planFingerprint!=='ce38430a30274f3369f34b75f855ed0e94b7bd74acf5f82415de2e9bfa50ea7d')throw Error('NEXT-010 fingerprint changed');
if(mode==='legacy'){const old=read(legacy);for(const [name,value] of Object.entries(old.scenarios))if(JSON.stringify(clean(value))!==JSON.stringify(clean(a.scenarios[name])))throw Error(`historical scenario changed: ${name}`)}
JS
if [[ $mode == current ]];then node --input-type=module - "$artifact" "$a" <<'JS' || fail 'current artifact differs logically'
import fs from'node:fs';const c=v=>Array.isArray(v)?v.map(c):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='runtimeMs').map(([k,x])=>[k,c(x)])):v;const [x,y]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));if(JSON.stringify(c(x))!==JSON.stringify(c(y)))process.exit(1)
JS
[[ $(sha256sum "$artifact"|cut -d' ' -f1) == "$before" ]]||fail 'artifact SHA changed'
else cp "$a" "$artifact"||fail 'publication failed'; node -e 'let x=require("./'$artifact'");if(!x.acceptance.accepted)process.exit(1)'||{ rm -f "$artifact";fail 'published artifact invalid';};rm -f "$legacy";fi
rm -f "$failed"
