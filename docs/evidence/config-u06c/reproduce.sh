#!/usr/bin/env bash
set -euo pipefail
task_output="${1:-/tmp/u06c-reproduction}"
task_repo="$(pwd)"
task_base="49d826c9a5ecdd3e0488a64d2b6a05dd3aad98b5"
task_checkout="$(mktemp -d /tmp/u06c-baseline.XXXXXX)"
trap 'rm -rf "$task_checkout"' EXIT
mkdir -p "$task_output"
git archive "$task_base" | tar -x -C "$task_checkout"
ln -s "$task_repo/node_modules" "$task_checkout/node_modules"
mkdir -p "$task_checkout/docs/evidence/config-u06c"
cp engine/planner-next/scenarios/operationContinuityScenario.ts "$task_checkout/engine/planner-next/scenarios/"
cp docs/evidence/config-u06c/genericGeometry.ts "$task_checkout/docs/evidence/config-u06c/"
(cd "$task_checkout" && node --import tsx docs/evidence/config-u06c/genericGeometry.ts "$task_output/generic-before.json")
node --import tsx docs/evidence/config-u06c/genericGeometry.ts "$task_output/generic-after.json"
(cd "$task_checkout" && node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/before")
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/after"
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/repeat"
node --import tsx docs/evidence/config-u06c/verify.ts "$task_output/before" "$task_output/after" "$task_output/repeat" "$task_output"
