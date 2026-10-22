#!/usr/bin/env bash
set -euo pipefail
task_output="$(realpath -m "${1:-/tmp/p0-u00e-reproduction}")"
task_repo="$(pwd)"
task_base="$(mktemp -d /tmp/p0-u00e-base.XXXXXX)"
trap 'rm -rf "$task_base"' EXIT
mkdir -p "$task_output"
git archive 037500b139d43bf5f82c1087db4fe6ed90fc8074 | tar -x -C "$task_base"
ln -s "$task_repo/node_modules" "$task_base/node_modules"
cp script/demo/smokeNewDaySetupJourney.ts "$task_base/script/demo/"
# Add only the setup diagnostic recipe to the baseline harness; product stays exact.
python3 - "$task_base/script/demo/smokeNewDayIntegration.ts" <<'PY'
import sys
from pathlib import Path
p=Path(sys.argv[1]);s=p.read_text().replace('const {runNewDayJourney}=process.argv.includes("--itinerant-consumption")','const {runNewDayJourney}=process.argv.includes("--setup-families")\n    ?{runNewDayJourney:(await import("./smokeNewDaySetupJourney")).runNewDaySetupJourney}\n    :process.argv.includes("--itinerant-consumption")');p.write_text(s)
PY
(cd "$task_base" && node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/before" --setup-families --expect-blocked)
node --import tsx docs/evidence/p0-u00e/diagnose.ts "$task_output/before/setup-input.json" "$task_output/counterfactual.json"
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/native" --setup-families
node --import tsx docs/evidence/p0-u00e/diagnose-logical-gap.ts "$task_output/native/setup-input.json" "$task_output/logical-gap-blocker.json"
# This acceptance test currently FAILS on the diagnosed gap. Do not suppress it.
# node --import tsx --test engine/planner-next/integration/newDaySetupFamilies.spec.ts
# Serialize all disposable Docker/Chromium stacks.
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/regression-main" --post-bootstrap-additions
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/regression-standalone" --standalone-only --post-bootstrap-additions
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/regression-itinerant" --itinerant-consumption
node docs/evidence/p0-u00c/compare.mjs "$task_output/regression-main" "$task_output/regression-standalone" "$task_output/regressions.json"
(cd "$task_base" && node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/a2-base")
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/a2-candidate"
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/a2-repeat"
node --import tsx docs/evidence/config-u06c/verify.ts "$task_output/a2-base" "$task_output/a2-candidate" "$task_output/a2-repeat" "$task_output/a2-audit"
