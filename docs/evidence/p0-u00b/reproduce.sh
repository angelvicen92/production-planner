#!/usr/bin/env bash
set -euo pipefail
task_output="$(realpath -m "${1:-work/p0-u00b-reproduction}")"
task_repo="$(pwd)"
task_base="be5d817c23aec2cf69029bd675edeed8c7d5c0d6"
task_checkout="$(mktemp -d /tmp/p0-u00b-base.XXXXXX)"
trap 'rm -rf "$task_checkout"' EXIT
mkdir -p "$task_output"
git archive "$task_base" | tar -x -C "$task_checkout"
ln -s "$task_repo/node_modules" "$task_checkout/node_modules"
mkdir -p "$task_checkout/docs/evidence/p0-u00b"
cp docs/evidence/p0-u00b/causal.ts "$task_checkout/docs/evidence/p0-u00b/causal.ts"
(cd "$task_checkout" && node --import tsx docs/evidence/p0-u00b/causal.ts "$task_output/before")
node --import tsx docs/evidence/p0-u00b/causal.ts "$task_output/after"
(cd "$task_checkout" && node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/baseline")
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/candidate"
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/repeat"
node --import tsx docs/evidence/config-u06c/verify.ts "$task_output/baseline" "$task_output/candidate" "$task_output/repeat" "$task_output/a2-audit"
node docs/evidence/p0-u00b/finalize-a2.mjs "$task_output/a2-audit/a2-report.json"
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/native" --standalone-only
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/u00a"
node docs/evidence/p0-u00b/compare-u00a.mjs "$task_output/u00a" "$task_output/u00a-comparison.json"
