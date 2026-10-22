#!/usr/bin/env bash
# Historical diagnosis at 9985c81, BEFORE explicit version 2 adoption.
set -euo pipefail
task_output="$(realpath -m "${1:-/tmp/p0-u00e-initial-diagnosis}")"
task_repo="$(pwd)"
task_base="$(mktemp -d /tmp/p0-u00e-original-base.XXXXXX)"
task_initial="$(mktemp -d /tmp/p0-u00e-original-candidate.XXXXXX)"
trap 'rm -rf "$task_base" "$task_initial"' EXIT
mkdir -p "$task_output"
git archive 037500b139d43bf5f82c1087db4fe6ed90fc8074 | tar -x -C "$task_base"
git archive 9985c81cf033c94655cf754ec1f14dc22e6d8e07 | tar -x -C "$task_initial"
ln -s "$task_repo/node_modules" "$task_base/node_modules"
ln -s "$task_repo/node_modules" "$task_initial/node_modules"
cp "$task_initial/script/demo/smokeNewDaySetupJourney.ts" "$task_base/script/demo/"
python3 - "$task_base/script/demo/smokeNewDayIntegration.ts" <<'PATCH'
import sys
from pathlib import Path
p=Path(sys.argv[1]);s=p.read_text().replace('const {runNewDayJourney}=process.argv.includes("--itinerant-consumption")','const {runNewDayJourney}=process.argv.includes("--setup-families")\n    ?{runNewDayJourney:(await import("./smokeNewDaySetupJourney")).runNewDaySetupJourney}\n    :process.argv.includes("--itinerant-consumption")');p.write_text(s)
PATCH
(cd "$task_base" && node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/before" --setup-families --expect-blocked)
(cd "$task_initial" && node --import tsx docs/evidence/p0-u00e/diagnose.ts "$task_output/before/setup-input.json" "$task_output/counterfactual.json")
(cd "$task_initial" && node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/compact-native" --setup-families)
(cd "$task_initial" && node --import tsx docs/evidence/p0-u00e/diagnose-logical-gap.ts "$task_output/compact-native/setup-input.json" "$task_output/logical-gap-blocker.json")
