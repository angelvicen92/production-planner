#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP="automation/spec11-010-checkpoint2-bootstrap"
TARGET="spec11-010-checkpoint2-optimizer-snapshot-db"
STASH_MARKER="optiplan-temp-spec11-010-checkpoint2"

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

# The versioned applicator was authored before the relationship-safety review.
# Filter exactly the two Drizzle task-template references while streaming it to
# Node. No Python dependency and no mutation of the bootstrap source are needed.
original_applicator="$(mktemp)"
tmp_applicator="$(mktemp)"
git show "origin/$BOOTSTRAP:scripts/apply-spec11-010-checkpoint2.cjs" > "$original_applicator"
needle='.references(() => planTaskTemplateSnapshots.id, { onDelete: "cascade" })'
needle_count="$(grep -F -o "$needle" "$original_applicator" | wc -l | tr -d ' ')"
if [[ "$needle_count" != "2" ]]; then
  echo "Expected exactly 2 optimizer template cascade clauses in applicator, found $needle_count. Refusing stale transformation." >&2
  rm -f "$original_applicator" "$tmp_applicator"
  exit 4
fi
sed 's/\.references(() => planTaskTemplateSnapshots\.id, { onDelete: "cascade" })/.references(() => planTaskTemplateSnapshots.id)/g' "$original_applicator" > "$tmp_applicator"
rm -f "$original_applicator"
node "$tmp_applicator"
rm -f "$tmp_applicator"

# Apply the same non-destructive relationship to migration 075. Plan deletion
# still cascades from plans; deleting a task-template snapshot must not silently
# delete the optimizer snapshot.
migration='supabase/migrations/075_plan_optimizer_snapshots.sql'
arrival_old='arrival_plan_template_snapshot_id BIGINT REFERENCES public.plan_task_template_snapshots(id) ON DELETE CASCADE,'
departure_old='departure_plan_template_snapshot_id BIGINT REFERENCES public.plan_task_template_snapshots(id) ON DELETE CASCADE,'
arrival_count="$(grep -F -c "$arrival_old" "$migration" || true)"
departure_count="$(grep -F -c "$departure_old" "$migration" || true)"
if [[ "$arrival_count" != "1" || "$departure_count" != "1" ]]; then
  echo "Migration 075 relationship anchors are missing or ambiguous; refusing stale transformation." >&2
  exit 5
fi
sed -i \
  -e 's/arrival_plan_template_snapshot_id BIGINT REFERENCES public\.plan_task_template_snapshots(id) ON DELETE CASCADE,/arrival_plan_template_snapshot_id BIGINT REFERENCES public.plan_task_template_snapshots(id),/' \
  -e 's/departure_plan_template_snapshot_id BIGINT REFERENCES public\.plan_task_template_snapshots(id) ON DELETE CASCADE,/departure_plan_template_snapshot_id BIGINT REFERENCES public.plan_task_template_snapshots(id),/' \
  "$migration"

npx tsx --test server/planOptimizerSnapshot.spec.ts server/planOptimizerSnapshotPersistence.spec.ts server/planOptimizerSnapshotMigration.spec.ts server/planOptimizerSnapshotIntegration.spec.ts
npm run check:migrations
npm run check
git diff --check

if ! git diff --quiet -- "$migration"; then
  git add "$migration"
  git commit -m "SPEC11-010: keep daily snapshot references non-destructive"
  git push origin "HEAD:$TARGET"
fi

tracked_after="$(git status --porcelain --untracked-files=no)"
if [[ -n "$tracked_after" ]]; then
  echo "Unexpected tracked changes remain after checkpoint applicator:" >&2
  printf '%s\n' "$tracked_after" >&2
  exit 6
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
