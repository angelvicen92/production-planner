#!/usr/bin/env bash
set -euo pipefail
task_output="$(realpath -m "${1:-/tmp/p0-u00c}")"
task_repo="$(pwd)"
task_base="$(mktemp -d /tmp/p0-u00c-base.XXXXXX)"
trap 'rm -rf "$task_base"' EXIT
mkdir -p "$task_output"
git archive 3bec719512ed4c30543460cb590c074c093bef91 | tar -x -C "$task_base"
ln -s "$task_repo/node_modules" "$task_base/node_modules"
(cd "$task_base" && node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/base")
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/candidate"
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/repeat"
node --import tsx docs/evidence/config-u06c/verify.ts "$task_output/base" "$task_output/candidate" "$task_output/repeat" "$task_output/a2-audit"
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/main" --post-bootstrap-additions
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/standalone" --standalone-only --post-bootstrap-additions
node docs/evidence/p0-u00c/compare.mjs "$task_output/main" "$task_output/standalone" "$task_output/regressions.json"
