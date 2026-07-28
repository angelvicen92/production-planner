#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")" && pwd); cd "$root"
failed=planner-next-long-secondary-block-v1.failed.json
first=$(mktemp); second=$(mktemp); trap 'rm -f "$first" "$second"' EXIT
fail() { cp "$first" "$failed" 2>/dev/null || printf '{"acceptance":{"accepted":false}}\n' > "$failed"; echo "NEXT-006 validation failed" >&2; exit 1; }
npm run check || fail
npx tsx --test engine/planner-next/*.spec.ts || fail
npm test || fail
npm run --silent benchmark:planner-next:long-secondary-block > "$first" || fail
npm run --silent benchmark:planner-next:long-secondary-block > "$second" || fail
node --input-type=module - "$first" "$second" <<'NODE' || fail
import fs from "node:fs";
const [a,b]=process.argv.slice(2).map((p)=>JSON.parse(fs.readFileSync(p,"utf8")));
const clean=(x)=>JSON.stringify(x,(key,value)=>key==="runtimeMs"?undefined:value);
if(!a.acceptance.accepted||!b.acceptance.accepted||clean(a)!==clean(b)) process.exit(1);
if(Object.values(a.scenarios).some((x)=>x.runtimeMs>=2000)) process.exit(1);
NODE
cp "$first" planner-next-long-secondary-block-v1.json
rm -f "$failed" planner-next-itinerant-units-v1.json planner-next-auxiliary-scarcity-v1.json planner-next-resource-presence-v1.json planner-next-core-backtracking-v1.json planner-next-main-flow-vocal-v1.json
echo "NEXT-006 validation accepted"
