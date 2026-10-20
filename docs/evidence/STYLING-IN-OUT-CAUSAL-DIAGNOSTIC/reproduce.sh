#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root. All execution and persistence are local.
task_output="${1:-/tmp/styling-in-out-causal-diagnostic}"
task_evidence="docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC"
mkdir -p "$task_output"
node --import tsx "$task_evidence/capture.ts" "$task_output/with-capture"
node --import tsx "$task_evidence/capture.ts" "$task_output/without-capture" --without-capture
node --import tsx "$task_evidence/analyse.ts" "$task_output/with-capture" "$task_output"
node --import tsx "$task_evidence/focal.ts" "$task_output/with-capture" "$task_output"
node --import tsx "$task_evidence/verify.ts" "$task_output/with-capture" "$task_output/without-capture" "$task_output"
npx --no-install tsc -p "$task_evidence/tsconfig.json"
