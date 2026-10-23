#!/usr/bin/env bash
set -euo pipefail
# Run on Node 20, with Docker, Chromium and the locked dependencies installed.
[[ "$(node -p 'process.versions.node.split(".")[0]')" = 20 ]]
task_output="$(realpath -m "${1:-/tmp/p0-u00e-v2-reproduction}")"
task_repo="$(pwd)"
task_base="$(mktemp -d /tmp/p0-u00e-v2-base.XXXXXX)"
trap 'rm -rf "$task_base"' EXIT
mkdir -p "$task_output"
git archive 3a05cb099a74d7263c0d630d7055746fcd722114 | tar -x -C "$task_base"
ln -s "$task_repo/node_modules" "$task_base/node_modules"
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 engine/planner-next/integration/newDaySetupFamilies.spec.ts engine/planner-next/integration/spacePoliciesV2.spec.ts
# Serialize native stacks and A2; keep all existing budgets/timeouts.
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/native" --setup-families
node --import tsx docs/evidence/p0-u00e/v2/verify-native.ts "$task_output/native" "$task_output/policy-comparison.json"
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/regression-main" --post-bootstrap-additions
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/regression-standalone" --standalone-only --post-bootstrap-additions
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/regression-itinerant" --itinerant-consumption
node docs/evidence/p0-u00c/compare.mjs "$task_output/regression-main" "$task_output/regression-standalone" "$task_output/u00a-b-comparison.json"
(cd "$task_base" && node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/a2-base")
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/a2-candidate"
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/a2-repeat"
node --import tsx docs/evidence/config-u06c/verify.ts "$task_output/a2-base" "$task_output/a2-candidate" "$task_output/a2-repeat" "$task_output/a2-audit"
node docs/evidence/p0-u00e/compare.mjs "$task_output"
