#!/usr/bin/env bash
set -euo pipefail

tooling_ref="origin/tooling/spec10-021-totales-round-sync"
implementation_branch="spec10-021-totales-round-sync"
expected_main="3ac6b3c3ca0cb0b4ae12a9f87a4cb952e3e4cfaf"
expected_combined_b64_sha="d3f1baabf8784e9e55d7b792850f884184b9464c6a969a5ffa74acc5803500a8"
expected_applicator_sha="b1a3982d166d878e91663caf081aa8e52122aa0b60f799d8d957c79cfcfeb59e"

fail() {
  echo "SPEC10-021 contract checkpoint aborted: $*" >&2
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

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/spec10-021-contract.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

git fetch origin
[[ "$(git rev-parse origin/main)" == "$expected_main" ]] \
  || fail "origin/main is not the verified SPEC10-020 merge"

if git ls-remote --exit-code origin "refs/heads/$implementation_branch" >/dev/null 2>&1; then
  fail "remote branch $implementation_branch already exists"
fi

current_branch="$(git branch --show-current)"
delta_already_applied=false

if [[ "$current_branch" == "$implementation_branch" ]]; then
  [[ "$(git rev-parse HEAD)" == "$expected_main" ]] \
    || fail "local implementation branch does not point to verified main"
  mapfile -t current_changes < <(changed_files)
  if [[ "${#current_changes[@]}" -gt 0 ]]; then
    assert_expected_changed_files
    delta_already_applied=true
  fi
else
  [[ -z "$(git status --porcelain)" ]] || fail "working tree must be clean"
  git checkout main
  git pull --ff-only origin main
  [[ "$(git rev-parse HEAD)" == "$expected_main" ]] \
    || fail "main is not the verified SPEC10-020 merge"

  if git show-ref --verify --quiet "refs/heads/$implementation_branch"; then
    [[ "$(git rev-parse "$implementation_branch")" == "$expected_main" ]] \
      || fail "local implementation branch does not point to verified main"
    git checkout "$implementation_branch"
    [[ -z "$(git status --porcelain)" ]] \
      || fail "existing implementation branch has unexpected changes"
  else
    git checkout -b "$implementation_branch"
  fi
fi

mapfile -t chunks < <(
  git ls-tree -r --name-only "$tooling_ref" tools/spec10-021-exact \
    | grep '/chunk-' \
    | sort
)
[[ "${#chunks[@]}" -eq 4 ]] \
  || fail "expected 4 exact applicator chunks, found ${#chunks[@]}"

expected_blob_shas=(
  24baee929dc02b62861f1a6a5064804d496bb7cf
  f8a65cbe2ee892664062c0de9e4884b2d120b5e9
  20a9c2d1775ad4ff2ce3cb4d22432b26202d9eb6
  df17a7e679f7ed6d02026b0af4d6d178bb121995
)
for index in "${!chunks[@]}"; do
  actual_blob_sha="$(git rev-parse "$tooling_ref:${chunks[$index]}")"
  [[ "$actual_blob_sha" == "${expected_blob_shas[$index]}" ]] \
    || fail "chunk ${chunks[$index]} has unexpected blob $actual_blob_sha"
done

b64_file="$tmp_dir/applicator.cjs.gz.b64"
gz_file="$tmp_dir/applicator.cjs.gz"
cjs_file="$tmp_dir/applicator.cjs"
for chunk in "${chunks[@]}"; do
  git show "$tooling_ref:$chunk"
done > "$b64_file"

actual_combined_b64_sha="$(sha256sum "$b64_file" | cut -d' ' -f1)"
[[ "$actual_combined_b64_sha" == "$expected_combined_b64_sha" ]] \
  || fail "combined compressed applicator SHA mismatch: $actual_combined_b64_sha"

base64 --decode "$b64_file" > "$gz_file"
gzip -dc "$gz_file" > "$cjs_file"
actual_applicator_sha="$(sha256sum "$cjs_file" | cut -d' ' -f1)"
[[ "$actual_applicator_sha" == "$expected_applicator_sha" ]] \
  || fail "decoded applicator SHA mismatch: $actual_applicator_sha"
node --check "$cjs_file"

if [[ "$delta_already_applied" == false ]]; then
  node "$cjs_file"
  echo "SPEC10-021 contract checkpoint applied."
else
  echo "SPEC10-021 contract checkpoint already applied; resuming validation."
fi

assert_expected_changed_files

python - <<'PY'
from pathlib import Path
import re

path = Path("engine/planner-next/roundSynchronization.spec.ts")
text = path.read_text()
replacements = [
    (r'(["\']task:101["\']\s*,\s*)645\b', r'\g<1>690', "task:101"),
    (r'(["\']task:103["\']\s*,\s*)675\b', r'\g<1>720', "task:103"),
]
for pattern, replacement, task_id in replacements:
    updated, count = re.subn(pattern, replacement, text)
    if count == 0:
        expected_start = "690" if task_id == "task:101" else "720"
        already_fixed = re.search(rf'["\']{re.escape(task_id)}["\']\s*,\s*{expected_start}\b', text)
        if not already_fixed:
            raise SystemExit(f"SPEC10-021 fixture correction anchor missing for {task_id}")
    text = updated
path.write_text(text)
PY

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
