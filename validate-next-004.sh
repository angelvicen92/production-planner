#!/usr/bin/env bash
set -euo pipefail
failed=planner-next-auxiliary-scarcity-v1.failed.json
one=$(mktemp); two=$(mktemp)
trap 'rm -f "$one" "$two"' EXIT
if npm run check && npx tsx --test engine/planner-next/*.spec.ts && npm test \
  && npm run --silent benchmark:planner-next:auxiliary-scarcity >"$one" \
  && npm run --silent benchmark:planner-next:auxiliary-scarcity >"$two" \
  && node --input-type=module - "$one" "$two" <<'NODE'
import fs from "node:fs";
const [a,b]=process.argv.slice(2).map((p)=>JSON.parse(fs.readFileSync(p,"utf8")));
const strip=(x)=>JSON.stringify(x,(key,value)=>key==="runtimeMs"?undefined:value);
if (!a.acceptance.accepted || !b.acceptance.accepted || strip(a)!==strip(b)) process.exit(1);
NODE
then
  cp "$one" planner-next-auxiliary-scarcity-v1.json
  rm -f "$failed" planner-next-resource-presence-v1.json planner-next-core-backtracking-v1.json planner-next-main-flow-vocal-v1.json plan-27-orc-*.json
else
  cp "$one" "$failed" 2>/dev/null || printf '{"acceptance":{"accepted":false}}\n' >"$failed"
  exit 1
fi
