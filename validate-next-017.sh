#!/usr/bin/env bash
set -euo pipefail
artifact=planner-next-main-flow-meal-v1.json; legacy=planner-next-required-space-meal-v2.json; failed=planner-next-main-flow-meal-v1.failed.json
die(){ printf '{"version":"planner-next-main-flow-meal-v1","accepted":false,"reason":"%s"}\n' "$1" > "$failed"; exit 1; }
[[ -f "$artifact" || -f "$legacy" ]] || die NO_CURRENT_OR_LEGACY_ARTIFACT
npm run check
node script/run-test-suite.mjs engine/planner-next
npm test
one=$(mktemp); two=$(mktemp); trap 'rm -f "$one" "$two"' EXIT
npm run benchmark:planner-next:main-flow-meal > "$one"; npm run benchmark:planner-next:main-flow-meal > "$two"
node - "$one" "$two" <<'NODE'
const fs=require('fs');const parse=p=>JSON.parse(fs.readFileSync(p,'utf8').slice(fs.readFileSync(p,'utf8').indexOf('{')));const clean=x=>{if(x&&typeof x==='object')for(const k of Object.keys(x)){if(k==='runtimeMs')delete x[k];else clean(x[k])}return x};let a=parse(process.argv[2]),b=parse(process.argv[3]);if(JSON.stringify(clean(a))!==JSON.stringify(clean(b)))process.exit(1);if(a.version!=="planner-next-main-flow-meal-v1"||!a.acceptance.accepted||Object.keys(a.scenarios).length!==20)process.exit(1);
NODE
if [[ ! -f "$artifact" ]]; then cp "$one" "$artifact.tmp"; sed -i '1,/^{/{ /^{/!d; }' "$artifact.tmp"; mv "$artifact.tmp" "$artifact"; rm -f "$legacy"; fi
rm -f "$failed"
