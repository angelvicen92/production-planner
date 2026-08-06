#!/usr/bin/env bash
set -euo pipefail

implementation_branch="spec10-021-totales-round-sync"
expected_main="3ac6b3c3ca0cb0b4ae12a9f87a4cb952e3e4cfaf"

fail() {
  echo "SPEC10-021 resume aborted: $*" >&2
  exit 1
}

mapfile -t expected_files < <(printf '%s\n' \
  engine/planner-next/contracts.ts \
  engine/planner-next/exactItinerantPlan.ts \
  engine/planner-next/integration/engineInputAdapter.fixture.ts \
  engine/planner-next/integration/engineInputAdapter.ts \
  engine/planner-next/integration/engineInputPreflight.ts \
  engine/planner-next/integration/engineInputRoundSynchronizations.ts \
  engine/planner-next/roundSynchronization.spec.ts \
  engine/planner-next/roundSynchronization.ts \
  engine/planner-next/validate.ts \
  engine/types.ts \
  | sort)

changed_files() {
  {
    git diff --name-only
    git ls-files --others --exclude-standard
  } | sort -u
}

assert_expected_changed_files() {
  mapfile -t actual_files < <(changed_files)
  if [[ "$(printf '%s\n' "${actual_files[@]}")" != "$(printf '%s\n' "${expected_files[@]}")" ]]; then
    printf 'Unexpected changed-file set.\nExpected:\n%s\nActual:\n%s\n' \
      "$(printf '%s\n' "${expected_files[@]}")" \
      "$(printf '%s\n' "${actual_files[@]}")" >&2
    exit 1
  fi
}

git fetch origin
[[ "$(git branch --show-current)" == "$implementation_branch" ]] \
  || fail "current branch is not $implementation_branch"
[[ "$(git rev-parse HEAD)" == "$expected_main" ]] \
  || fail "implementation branch no longer points to verified SPEC10-020 main"
[[ "$(git rev-parse origin/main)" == "$expected_main" ]] \
  || fail "origin/main is not the verified SPEC10-020 merge"
if git ls-remote --exit-code origin "refs/heads/$implementation_branch" >/dev/null 2>&1; then
  fail "remote branch $implementation_branch already exists"
fi

assert_expected_changed_files

node --input-type=commonjs <<'NODE'
const fs = require("node:fs");
const path = "engine/planner-next/roundSynchronization.spec.ts";
let text = fs.readFileSync(path, "utf8");

function replaceStart(taskId, oldStart, newStart) {
  const escaped = taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const oldPattern = new RegExp(`(["']${escaped}["']\\s*,\\s*)${oldStart}\\b`, "g");
  const newPattern = new RegExp(`["']${escaped}["']\\s*,\\s*${newStart}\\b`);
  let replacements = 0;
  text = text.replace(oldPattern, (_match, prefix) => {
    replacements += 1;
    return `${prefix}${newStart}`;
  });
  if (replacements === 0 && !newPattern.test(text)) {
    throw new Error(`SPEC10-021 fixture correction anchor missing for ${taskId}`);
  }
}

replaceStart("task:101", 645, 690);
replaceStart("task:103", 675, 720);
fs.writeFileSync(path, text);
NODE

echo "SPEC10-021 fixture corrected without Python."
assert_expected_changed_files

npx tsx --test \
  engine/planner-next/roundSynchronization.spec.ts \
  engine/planner-next/integration/engineInputPreflight.spec.ts \
  engine/planner-next/integration/engineInputAdapter.spec.ts \
  engine/planner-next/exactFlexibleSetupOrder.spec.ts \
  engine/planner-next/flexibleSetupOrder.spec.ts

npm run check
git diff --check

git add -- "${expected_files[@]}"
git commit -m "SPEC10-021-WIP: project synchronized round contract"
git push -u origin "$implementation_branch"

echo "SPEC10-021 contract checkpoint pushed."
echo "The A2 round-synchronization blocker intentionally remains until exact search integration."
echo "Do not open a PR or merge this WIP checkpoint."
