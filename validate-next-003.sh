#!/usr/bin/env bash
set -uo pipefail
accepted="planner-next-resource-presence-v1.json"
failed="planner-next-resource-presence-v1.failed.json"
first="$(mktemp)"; second="$(mktemp)"
trap 'rm -f "$first" "$second"' EXIT

fail() { [ -s "$first" ] && cp "$first" "$failed"; echo "NEXT-003 validation failed" >&2; exit 1; }
npm run check || fail
npx tsx --test engine/planner-next/*.spec.ts || fail
npm test || fail
npm run --silent benchmark:planner-next:resource-presence > "$first" || fail
npm run --silent benchmark:planner-next:resource-presence > "$second" || fail
node --input-type=module - "$first" "$second" <<'NODE' || fail
import fs from "node:fs";
const [a,b] = process.argv.slice(2).map((path) => JSON.parse(fs.readFileSync(path, "utf8")));
const logical = (value) => JSON.stringify(value, (key, item) => key === "runtimeMs" ? undefined : item);
if (logical(a) !== logical(b) || !a.acceptance.accepted) throw new Error("acceptance or determinism failed");
const s=a.scenarios, zero=s.adversarialZeroBacktracks;
if (s.baseline.planFingerprint !== "070b4d4a2259b629b8e818fd6e34ea4bba63c05f87d60b4b5f4cbfc7b1b6848b"
 || s.adversarial.planFingerprint !== "dbd3d669a6fd2121bab29f6372d974366661399d797baf5df9eac2b28592176f"
 || s.adversarial.backtracks < 1 || zero.complete || zero.plannedTaskCount !== 0
 || zero.searchStopReason !== "BACKTRACK_BUDGET_EXHAUSTED"
 || s.resourceHigh.resourcePresenceMinutesById["shared-production-resource"] !== 60
 || s.resourceHigh.resourceInternalGapMinutesById["shared-production-resource"] !== 0
 || s.resourceOff.resourcePresenceMinutesById["shared-production-resource"] <= 60
 || Object.values(s).some((x) => x.runtimeMs >= 2000)
 || [s.baseline,s.adversarial,s.resourceOff,s.resourceHigh].some((x) => !x.complete || !x.hardValid || x.violationCount !== 0)) {
  throw new Error("NEXT-003 invariant failed");
}
NODE
cp "$first" "$accepted"
rm -f "$failed" planner-next-core-backtracking-v1.json
echo "NEXT-003 accepted: $accepted"
