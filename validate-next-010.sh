#!/usr/bin/env bash
set -uo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
cd "$root"

artifact=planner-next-setup-grouping-v1.json
legacy=planner-next-branch-local-ranking-v2.json
failed=planner-next-setup-grouping-v1.failed.json
tmp1="$(mktemp)"
tmp2="$(mktemp)"
historical="$(mktemp)"
validation_error="$(mktemp)"

cleanup() {
  rm -f "$tmp1" "$tmp2" "$historical" "$validation_error"
}
trap cleanup EXIT

fail() {
  local reason="$1"
  node --input-type=module - "$failed" "$reason" <<'JS'
import fs from "node:fs";
const [path, reason] = process.argv.slice(2);
fs.writeFileSync(path, `${JSON.stringify({
  version: "planner-next-setup-grouping-v1",
  accepted: false,
  reason,
})}\n`);
JS
  printf '%s\n' "$reason" >&2
  exit 1
}

if [[ -f "$artifact" ]]; then
  mode=current
  if ! node --input-type=module - "$artifact" 2>"$validation_error" <<'JS'
import fs from "node:fs";
const path = process.argv[2];
let value;
try { value = JSON.parse(fs.readFileSync(path, "utf8")); }
catch { console.error("current accepted artifact is not valid JSON"); process.exit(1); }
if (value.version !== "planner-next-setup-grouping-v1") {
  console.error("current accepted artifact has an invalid version"); process.exit(1);
}
if (value.acceptance?.accepted !== true) {
  console.error("current artifact is not accepted"); process.exit(1);
}
JS
  then
    fail "$(cat "$validation_error")"
  fi
  artifact_sha_before="$(sha256sum "$artifact" | cut -d' ' -f1)"
elif [[ -f "$legacy" ]]; then
  mode=legacy
else
  fail "no accepted or legacy baseline artifact is available"
fi

npm run check || fail "npm run check failed"
npx tsx --test engine/planner-next/*.spec.ts || fail "Planner Next tests failed"
npm test || fail "full test suite failed"

if [[ "$mode" == legacy ]]; then
  npm run --silent benchmark:planner-next:branch-local-ranking >"$historical" \
    || fail "historical benchmark failed"
  if ! node --input-type=module - "$legacy" "$historical" 2>"$validation_error" <<'JS'
import fs from "node:fs";
const [expectedPath, actualPath] = process.argv.slice(2);
const read = path => {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); }
  catch { console.error("legacy validation output is not valid JSON"); process.exit(1); }
};
const clean = value => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "runtimeMs").map(([key, item]) => [key, clean(item)]),
  );
  return value;
};
if (JSON.stringify(clean(read(expectedPath))) !== JSON.stringify(clean(read(actualPath)))) {
  console.error("the twelve historical scenarios changed logically"); process.exit(1);
}
JS
  then
    fail "$(cat "$validation_error")"
  fi
fi

npm run --silent benchmark:planner-next:setup-grouping >"$tmp1" \
  || fail "first NEXT-010 benchmark failed"
npm run --silent benchmark:planner-next:setup-grouping >"$tmp2" \
  || fail "second NEXT-010 benchmark failed"

if ! node --input-type=module - "$tmp1" "$tmp2" 2>"$validation_error" <<'JS'
import fs from "node:fs";
const [firstPath, secondPath] = process.argv.slice(2);
const read = (path, label) => {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); }
  catch { console.error(`${label} does not contain valid JSON`); process.exit(1); }
};
const clean = value => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "runtimeMs").map(([key, item]) => [key, clean(item)]),
  );
  return value;
};
const fail = reason => { console.error(reason); process.exit(1); };
const a = read(firstPath, "first NEXT-010 benchmark");
const b = read(secondPath, "second NEXT-010 benchmark");
if (a.version !== "planner-next-setup-grouping-v1" || b.version !== "planner-next-setup-grouping-v1") fail("NEXT-010 benchmark version is invalid");
if (a.acceptance?.accepted !== true || b.acceptance?.accepted !== true) fail("NEXT-010 benchmark acceptance failed");
if (Object.keys(a.scenarios ?? {}).length !== 13 || Object.keys(b.scenarios ?? {}).length !== 13) fail("NEXT-010 benchmark does not contain the 13 expected scenarios");
if (JSON.stringify(clean(a)) !== JSON.stringify(clean(b))) fail("NEXT-010 benchmarks differ logically");

const s = a.scenarios.setupGrouping;
const expectedSequence = ["family-a", "family-b", "family-c"];
if (s?.complete !== true || s.hardValid !== true || s.plannedTaskCount !== 24 ||
    s.mainFlowStart !== 780 || s.mainFlowEnd !== 900 || s.mainFlowGapMinutes !== 0 ||
    s.secondarySpaceEndById?.["setup-room"] - s.secondarySpaceStartById?.["setup-room"] !== 90 ||
    s.secondarySpaceGapMinutesById?.["setup-room"] !== 0 ||
    s.secondarySpaceBlockCountById?.["setup-room"] !== 1 ||
    JSON.stringify(s.setupFamilySequenceBySpaceId?.["setup-room"]) !== JSON.stringify(expectedSequence) ||
    s.setupBlockCountBySpaceAndFamily?.["setup-room|family-a"] !== 1 ||
    s.setupBlockCountBySpaceAndFamily?.["setup-room|family-b"] !== 1 ||
    s.setupBlockCountBySpaceAndFamily?.["setup-room|family-c"] !== 1 ||
    s.setupSwitchCountBySpaceId?.["setup-room"] !== 2 ||
    s.workItemSelectionOrder?.[0] !== "space:setup-room" || s.setupViolationCount !== 0 ||
    s.secondaryContinuityViolationCount !== 0 || s.violationCount !== 0) fail("NEXT-010 setup-grouping evidence failed");

const i = a.scenarios.itinerantUnits;
if (i?.logicalMetrics?.branchBudgetMaximum !== 300000 || i.logicalMetrics.branchBudgetConsumed > 285317) fail("itinerant budget regression");
if (Object.values(a.scenarios).some(scenario => scenario.runtimeMs >= 2000)) fail("runtime threshold failed");
if (Object.keys(a.acceptance.frozenFingerprints ?? {}).length !== 10 ||
    a.scenarios.baseline?.bestK !== 5 || a.scenarios.boundedFutureFeasibility?.bestK !== 1 ||
    a.boundedBlockConstruction?.withinBound !== true) fail("historical acceptance evidence failed");
const h = a.branchHistoryInvariance;
if (h?.regionStructurallyIndependent !== true || h.projectionsEqual !== true ||
    h.originalWorkItemOrderEqual !== true || h.originalParticipantPresenceEqual !== true ||
    h.originalAuxiliaryCandidateCountsEqual !== true || h.originalResourcePresenceEqual !== true ||
    h.isolatedBlockers?.["task:isolated-scarce-task"] !== 1) fail("branch-history acceptance evidence failed");
JS
then
  fail "$(cat "$validation_error")"
fi

if [[ "$mode" == current ]]; then
  if ! node --input-type=module - "$artifact" "$tmp1" 2>"$validation_error" <<'JS'
import fs from "node:fs";
const [artifactPath, freshPath] = process.argv.slice(2);
const clean = value => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "runtimeMs").map(([key, item]) => [key, clean(item)]),
  );
  return value;
};
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const fresh = JSON.parse(fs.readFileSync(freshPath, "utf8"));
if (JSON.stringify(clean(artifact)) !== JSON.stringify(clean(fresh))) {
  console.error("current accepted artifact differs logically from fresh validation"); process.exit(1);
}
JS
  then
    fail "$(cat "$validation_error")"
  fi
  artifact_sha_after="$(sha256sum "$artifact" | cut -d' ' -f1)"
  [[ "$artifact_sha_after" == "$artifact_sha_before" ]] \
    || fail "current accepted artifact SHA-256 changed during validation"
else
  cp "$tmp1" "$artifact" || fail "failed to publish the accepted artifact"
  if ! node --input-type=module - "$artifact" 2>"$validation_error" <<'JS'
import fs from "node:fs";
let value;
try { value = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); }
catch { console.error("published artifact is not valid JSON"); process.exit(1); }
if (value.version !== "planner-next-setup-grouping-v1" || value.acceptance?.accepted !== true) {
  console.error("published artifact is not accepted"); process.exit(1);
}
JS
  then
    rm -f "$artifact"
    fail "$(cat "$validation_error")"
  fi
  rm -f "$legacy"
fi

rm -f "$failed"
