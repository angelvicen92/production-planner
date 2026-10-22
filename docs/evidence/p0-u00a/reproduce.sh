#!/usr/bin/env bash
set -euo pipefail
task_output="${1:-/tmp/p0-u00a-reproduction}"
task_base="b9802860d8e48b26938e38f82648c328122efd26"
task_repo="$(pwd)"
task_checkout="$(mktemp -d /tmp/p0-u00a-baseline.XXXXXX)"
trap 'rm -rf "$task_checkout"' EXIT
mkdir -p "$task_output"
git archive "$task_base" | tar -x -C "$task_checkout"
ln -s "$task_repo/node_modules" "$task_checkout/node_modules"
(cd "$task_checkout" && node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/baseline")
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/final"
node --import tsx docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts "$task_output/repeat"
node --import tsx docs/evidence/config-u06c/verify.ts "$task_output/baseline" "$task_output/final" "$task_output/repeat" "$task_output/a2"
node --input-type=module - "$task_output/a2/a2-report.json" "$task_base" <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const path=process.argv[2],report=JSON.parse(readFileSync(path,'utf8'));
report.base=process.argv[3];
report.observer='docs/evidence/config-u06c/verify.ts (assertions unchanged)';
writeFileSync(path,JSON.stringify(report,null,2));
JS
node --import tsx script/demo/smokeNewDayIntegration.ts "$task_output/native"
