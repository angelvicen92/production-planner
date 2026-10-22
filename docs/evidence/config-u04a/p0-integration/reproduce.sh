#!/usr/bin/env bash
set -euo pipefail
task_output="${1:-/tmp/u04a-p0-reproduction}"
task_base="7872b5817211dcddeafecf8c9e1a573cdf48a8bd"
task_repo="$(pwd)"
task_checkout="$(mktemp -d /tmp/u04a-p0-main.XXXXXX)"
trap 'git worktree remove --force "$task_checkout"' EXIT
git worktree add --detach "$task_checkout" "$task_base"
ln -s "$task_repo/node_modules" "$task_checkout/node_modules"
mkdir -p "$task_output"
(cd "$task_checkout" && node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/baseline")
(cd "$task_checkout" && node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/main-new-days")
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/candidate"
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/repeat"
node --import tsx docs/evidence/config-u06c/verify.ts "$task_output/baseline" "$task_output/candidate" "$task_output/repeat" "$task_output/a2-audit"
node --import tsx script/demo/smokeA2Integration.ts "$task_output/native-composition" --restricted-data-api --historical-topology --itinerant-composition --production-runtime
node --import tsx script/demo/smokeA2Integration.ts "$task_output/native-continuity" --operation-continuity
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/final-new-days"
node docs/evidence/config-u04a/p0-integration/compare.mjs "$task_output"
