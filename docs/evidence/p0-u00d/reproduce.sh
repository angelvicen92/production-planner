#!/usr/bin/env bash
set -euo pipefail
task_output="$(realpath -m "${1:-/tmp/p0-u00d-reproduction}")"
task_repo="$(pwd)"
task_base="$(mktemp -d /tmp/p0-u00d-base.XXXXXX)"
trap 'rm -rf "$task_base"' EXIT
mkdir -p "$task_output"
git archive e8f892719600d924e25ecaf56b7fca426204d5a2 | tar -x -C "$task_base"
ln -s "$task_repo/node_modules" "$task_base/node_modules"
mkdir -p "$task_base/docs/evidence/p0-u00d"
cp script/demo/smokeNewDayIntegration.ts script/demo/smokeNewDayItinerantJourney.ts "$task_base/script/demo/"
cp docs/evidence/p0-u00d/diagnose.ts "$task_base/docs/evidence/p0-u00d/"
(cd "$task_base" && node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/before" --itinerant-consumption --expect-blocked)
(cd "$task_base" && node --import tsx docs/evidence/p0-u00d/diagnose.ts "$task_output/before/technical-input.json" "$task_output/counterfactual.json" --baseline-input)
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/native" --itinerant-consumption
node --import tsx docs/evidence/p0-u00d/verify.ts "$task_output/native" "$task_output/physical-occupations.json"
# Serialize Docker/Chromium stacks: network removal can interrupt another browser.
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/regression-main" --post-bootstrap-additions
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/regression-standalone" --standalone-only --post-bootstrap-additions
node docs/evidence/p0-u00c/compare.mjs "$task_output/regression-main" "$task_output/regression-standalone" "$task_output/regressions.json"
(cd "$task_base" && node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/a2-base")
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/a2-candidate"
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/a2-repeat"
node --import tsx docs/evidence/config-u06c/verify.ts "$task_output/a2-base" "$task_output/a2-candidate" "$task_output/a2-repeat" "$task_output/a2-audit"
node docs/evidence/p0-u00d/compare.mjs "$task_output"
