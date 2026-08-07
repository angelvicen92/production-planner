#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP="automation/spec11-010-checkpoint2-bootstrap"
TARGET="spec11-010-checkpoint2-optimizer-snapshot-db"
STASH_MARKER="optiplan-temp-spec11-010-checkpoint2"

# Never hide or overwrite tracked work. Only local untracked artifacts may be
# parked temporarily so the versioned applicator can switch branches safely.
tracked_dirty="$(git status --porcelain --untracked-files=no)"
if [[ -n "$tracked_dirty" ]]; then
  echo "Tracked working-tree changes detected. Refusing to modify or stash them." >&2
  printf '%s\n' "$tracked_dirty" >&2
  exit 2
fi

untracked="$(git ls-files --others --exclude-standard)"
stash_ref=""
restore_untracked() {
  if [[ -z "$stash_ref" ]]; then
    return 0
  fi
  echo
  echo "Restoring preserved untracked workspace files from $stash_ref ..."
  if git stash pop "$stash_ref"; then
    stash_ref=""
  else
    echo "Automatic restore could not complete cleanly. Your files remain محفوظ/ محفوظ in $stash_ref; nothing was dropped." >&2
    echo "Inspect with: git stash show --stat $stash_ref" >&2
    return 1
  fi
}
trap 'restore_untracked || true' EXIT

if [[ -n "$untracked" ]]; then
  echo "Preserving untracked workspace files temporarily (no deletion):"
  printf '%s\n' "$untracked"
  git stash push --include-untracked -m "$STASH_MARKER" >/dev/null
  stash_ref="$(git stash list --format='%gd %s' | awk -v marker="$STASH_MARKER" 'index($0, marker) {print $1; exit}')"
  if [[ -z "$stash_ref" ]]; then
    echo "Could not identify temporary stash; refusing to continue." >&2
    exit 3
  fi
fi

git fetch origin main "$TARGET" "$BOOTSTRAP"
git show "origin/$BOOTSTRAP:scripts/apply-spec11-010-checkpoint2.cjs" | node

restore_untracked
trap - EXIT

echo
printf 'SPEC11-010 checkpoint 2 applicator completed on %s\n' "$(git rev-parse --abbrev-ref HEAD)"
printf 'HEAD: %s\n' "$(git rev-parse HEAD)"
printf 'Tracked status:\n'
git status --short --untracked-files=no
printf 'Untracked files preserved:\n'
git ls-files --others --exclude-standard
