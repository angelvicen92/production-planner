#!/usr/bin/env bash
set -euo pipefail

repo="angelvicen92/production-planner"
tooling_ref="origin/tooling/spec10-021-totales-round-sync"
implementation_branch="spec10-021-totales-round-sync"
expected_main="3ac6b3c3ca0cb0b4ae12a9f87a4cb952e3e4cfaf"

fail() {
  echo "SPEC10-021 contract checkpoint aborted: $*" >&2
  exit 1
}

git fetch origin

[[ -z "$(git status --porcelain)" ]] || fail "working tree must be clean"

git checkout main
git pull --ff-only origin main

actual_main="$(git rev-parse HEAD)"
[[ "$actual_main" == "$expected_main" ]] || fail "main SHA is $actual_main; expected $expected_main"
[[ "$(git rev-parse origin/main)" == "$expected_main" ]] || fail "origin/main is not the verified SPEC10-020 merge"

if git show-ref --verify --quiet "refs/heads/$implementation_branch"; then
  fail "local branch $implementation_branch already exists"
fi
if git ls-remote --exit-code --heads origin "$implementation_branch" >/dev/null 2>&1; then
  fail "remote branch $implementation_branch already exists"
fi

git checkout -b "$implementation_branch"

mapfile -t parts < <(
  git ls-tree -r --name-only "$tooling_ref" tools/spec10-021-contract \
    | grep '/apply\.part-' \
    | sort
)
[[ "${#parts[@]}" -eq 5 ]] || fail "expected 5 applicator parts, found ${#parts[@]}"

for part in "${parts[@]}"; do
  git show "$tooling_ref:$part"
done | node

mapfile -t actual_files < <(
  {
    git diff --name-only
    git ls-files --others --exclude-standard
  } | sort -u
)
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

if [[ "$(printf '%s\n' "${actual_files[@]}")" != "$(printf '%s\n' "${expected_files[@]}")" ]]; then
  printf 'Unexpected changed-file set.\nExpected:\n%s\nActual:\n%s\n' \
    "$(printf '%s\n' "${expected_files[@]}")" \
    "$(printf '%s\n' "${actual_files[@]}")" >&2
  exit 1
fi

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
