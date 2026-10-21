#!/usr/bin/env bash
set -euo pipefail

# From the repository root, with the declared dependencies installed. All runs
# and persistence are local; the exact baseline uses the same node_modules.
task_output="${1:-/tmp/styling-entry-rematerialization}"
task_repo="$(git rev-parse --show-toplevel)"
task_base="7620449e77f280f6fb2341376aa12653eaffdf16"
task_capture="docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts"
task_evidence="docs/evidence/STYLING-ENTRY-CERTIFIED-REMATERIALIZATION"
mkdir -p "$task_output"
task_output="$(cd "$task_output" && pwd)"
for task_run in before after repeat; do
  if test -e "$task_output/$task_run/run.json"; then
    echo "Choose a fresh output directory: $task_output/$task_run/run.json exists" >&2
    exit 1
  fi
done
task_checkout="$(mktemp -d "$task_output/baseline-checkout.XXXXXX")"
git archive "$task_base" | tar -x -C "$task_checkout"
ln -s "$task_repo/node_modules" "$task_checkout/node_modules"
(cd "$task_checkout" && node --import tsx "$task_capture" "$task_output/before")
node --import tsx "$task_capture" "$task_output/after"
node --import tsx "$task_capture" "$task_output/repeat"
node --import tsx "$task_evidence/verify.ts" "$task_output/before" "$task_output/after" "$task_output/repeat" "$task_output"
npx --no-install tsc -p "$task_evidence/tsconfig.json"
