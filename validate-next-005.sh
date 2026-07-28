#!/usr/bin/env bash
set -euo pipefail
accepted=planner-next-itinerant-units-v1.json
failed=planner-next-itinerant-units-v1.failed.json
one=$(mktemp); two=$(mktemp)
trap 'rm -f "$one" "$two"' EXIT
if npm run check && npx tsx --test engine/planner-next/*.spec.ts && npm test \
  && npm run --silent benchmark:planner-next:itinerant-units >"$one" \
  && npm run --silent benchmark:planner-next:itinerant-units >"$two" \
  && node --input-type=module - "$one" "$two" <<'NODE'
import fs from "node:fs";
const [a,b]=process.argv.slice(2).map((path)=>JSON.parse(fs.readFileSync(path,"utf8")));
const logical=(value)=>JSON.stringify(value,(key,item)=>key==="runtimeMs"?undefined:item);
if (!a.acceptance.accepted || !b.acceptance.accepted || logical(a)!==logical(b)) process.exit(1);
if (Object.values(a.scenarios).some((scenario)=>scenario.runtimeMs>=2000)) process.exit(1);
NODE
then
  cp "$one" "$accepted"
  rm -f "$failed" planner-next-auxiliary-scarcity-v1.json planner-next-resource-presence-v1.json planner-next-core-backtracking-v1.json planner-next-main-flow-vocal-v1.json plan-27-orc-*.json
else
  cp "$one" "$failed" 2>/dev/null || printf '{"acceptance":{"accepted":false}}\n' >"$failed"
  exit 1
fi
