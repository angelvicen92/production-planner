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
    echo "Automatic restore could not complete cleanly. Your files remain safely stored in $stash_ref; nothing was dropped." >&2
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

# Execute the versioned applicator, but remove the two destructive child->parent
# cascade clauses from the generated Drizzle schema. A task-template snapshot is
# part of the same immutable day; deleting it must not silently delete the
# optimizer snapshot. Plan deletion still cascades from plans as intended.
tmp_applicator="$(mktemp)"
git show "origin/$BOOTSTRAP:scripts/apply-spec11-010-checkpoint2.cjs" > "$tmp_applicator"
python3 - "$tmp_applicator" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
needle = '.references(() => planTaskTemplateSnapshots.id, { onDelete: "cascade" })'
count = text.count(needle)
if count != 2:
    raise SystemExit(f"Expected exactly 2 optimizer template cascade clauses, found {count}")
path.write_text(text.replace(needle, '.references(() => planTaskTemplateSnapshots.id)'))
PY
node "$tmp_applicator"
rm -f "$tmp_applicator"

# Apply the same non-destructive relationship to migration 075 and validate the
# post-correction candidate. This is committed separately so the remote history
# records the safety correction explicitly; the final PR will be squash-merged.
python3 - <<'PY'
from pathlib import Path
path = Path('supabase/migrations/075_plan_optimizer_snapshots.sql')
text = path.read_text()
replacements = {
    'arrival_plan_template_snapshot_id BIGINT REFERENCES public.plan_task_template_snapshots(id) ON DELETE CASCADE,':
        'arrival_plan_template_snapshot_id BIGINT REFERENCES public.plan_task_template_snapshots(id),',
    'departure_plan_template_snapshot_id BIGINT REFERENCES public.plan_task_template_snapshots(id) ON DELETE CASCADE,':
        'departure_plan_template_snapshot_id BIGINT REFERENCES public.plan_task_template_snapshots(id),',
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f'Missing or ambiguous migration relationship: {old}')
    text = text.replace(old, new)
path.write_text(text)
PY

npx tsx --test server/planOptimizerSnapshot.spec.ts server/planOptimizerSnapshotPersistence.spec.ts server/planOptimizerSnapshotMigration.spec.ts server/planOptimizerSnapshotIntegration.spec.ts
npm run check:migrations
npm run check
git diff --check

if ! git diff --quiet -- supabase/migrations/075_plan_optimizer_snapshots.sql; then
  git add supabase/migrations/075_plan_optimizer_snapshots.sql
  git commit -m "SPEC11-010: keep daily snapshot references non-destructive"
  git push origin "HEAD:$TARGET"
fi

restore_untracked
trap - EXIT

echo
printf 'SPEC11-010 checkpoint 2 applicator completed on %s\n' "$(git rev-parse --abbrev-ref HEAD)"
printf 'HEAD: %s\n' "$(git rev-parse HEAD)"
printf 'Tracked status:\n'
git status --short --untracked-files=no
printf 'Untracked files preserved:\n'
git ls-files --others --exclude-standard
