#!/usr/bin/env bash
set -euo pipefail
task_output="${1:-/tmp/styling-closure-reproduction}"
task_repo="$(pwd)"
task_evidence="docs/evidence/STYLING-CLOSURE-CERTIFIED-REMATERIALIZATION"
task_capture="docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts"
task_base="78fc59b2e980ec3d86a27eaef95e5c77d3035f93"
mkdir -p "$task_output"
task_checkout="$(mktemp -d /tmp/closure-baseline.XXXXXX)"
trap 'rm -rf "$task_checkout"' EXIT
git archive "$task_base" | tar -x -C "$task_checkout"
ln -s "$task_repo/node_modules" "$task_checkout/node_modules"
(cd "$task_checkout" && node --import tsx "$task_capture" "$task_output/before")
node --import tsx "$task_capture" "$task_output/after"
node --import tsx "$task_capture" "$task_output/repeat"
node --import tsx "$task_evidence/verify.ts" "$task_output/before" "$task_output/after" "$task_output/repeat" "$task_output"
node node_modules/typescript/bin/tsc -p "$task_evidence/tsconfig.json"
