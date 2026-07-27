#!/usr/bin/env bash
set -uo pipefail

artifact="planner-next-core-backtracking-v1.json"
failed="planner-next-core-backtracking-v1.failed.json"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT

run_checks() {
  npm run check
  npx tsx --test engine/planner-next/planMainFlowAndFeeders.spec.ts
  npm test
  npm run --silent benchmark:planner-next:core >"$temporary/first.json"
  npm run --silent benchmark:planner-next:core >"$temporary/second.json"
  node --input-type=module - "$temporary/first.json" "$temporary/second.json" <<'NODE'
import { readFileSync } from "node:fs";
const [firstPath, secondPath] = process.argv.slice(2);
const first = JSON.parse(readFileSync(firstPath, "utf8"));
const second = JSON.parse(readFileSync(secondPath, "utf8"));
const frozen = "070b4d4a2259b629b8e818fd6e34ea4bba63c05f87d60b4b5f4cbfc7b1b6848b";
const logical = ({ runtimeMs, ...rest }) => rest;
if (!first.acceptance.accepted || !second.acceptance.accepted) throw new Error("benchmark acceptance failed");
if (first.scenarios.baseline.planFingerprint !== frozen) throw new Error("NEXT-001 fingerprint changed");
for (const key of Object.keys(first.scenarios)) {
  if (JSON.stringify(logical(first.scenarios[key])) !== JSON.stringify(logical(second.scenarios[key]))) {
    throw new Error(`logical benchmark mismatch: ${key}`);
  }
  if (first.scenarios[key].runtimeMs >= 2000 || second.scenarios[key].runtimeMs >= 2000) {
    throw new Error(`runtime budget exceeded: ${key}`);
  }
}
const success = first.scenarios.adversarial;
const stopped = first.scenarios.adversarialZeroBacktracks;
if (!success.complete || success.backtracks < 1 || success.plannedTaskCount !== 16 || success.violationCount !== 0) {
  throw new Error("real backtracking was not demonstrated");
}
if (stopped.complete || stopped.backtracks !== 0 || stopped.searchStopReason !== "BACKTRACK_BUDGET_EXHAUSTED") {
  throw new Error("zero backtrack budget was not enforced");
}
NODE
}

if run_checks; then
  cp "$temporary/first.json" "$artifact"
  rm -f "$failed"
  echo "NEXT-002 validation passed; wrote $artifact"
else
  status=$?
  if [[ -s "$temporary/first.json" ]]; then
    cp "$temporary/first.json" "$failed"
  else
    printf '{"version":"planner-next-core-backtracking-v1","acceptance":{"accepted":false}}\n' >"$failed"
  fi
  echo "NEXT-002 validation failed; preserved any existing $artifact and wrote $failed" >&2
  exit "$status"
fi
