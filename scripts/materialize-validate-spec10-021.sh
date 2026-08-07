#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
BASE_SHA="7ab93f1ed79d8e753379f962281b1e5192b90fb9"
TARGET_BRANCH="spec10-021-round-sync-candidate"
EXPECTED_TARGET_HEAD="627ef66b8bb8ac5dc20b2ee7ad9a19329b35f728"
TMP_DIR="$(mktemp -d /tmp/optiplan-spec10-021.XXXXXX)"

cleanup() {
  cd "$REPO_ROOT" || true
  git worktree remove --force "$TMP_DIR" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[SPEC10-021] Fetching audited refs..."
git fetch origin main "$TARGET_BRANCH" tooling/spec10-021-totales-round-sync
ACTUAL_TARGET_HEAD="$(git rev-parse "origin/$TARGET_BRANCH")"
if [[ "$ACTUAL_TARGET_HEAD" != "$EXPECTED_TARGET_HEAD" ]]; then
  echo "Refusing to continue: $TARGET_BRANCH moved."
  echo "Expected: $EXPECTED_TARGET_HEAD"
  echo "Actual:   $ACTUAL_TARGET_HEAD"
  exit 20
fi

echo "[SPEC10-021] Creating isolated worktree from audited contract checkpoint..."
git worktree add --detach "$TMP_DIR" "$BASE_SHA"
cd "$TMP_DIR"

if [[ -d "$REPO_ROOT/node_modules" && ! -e node_modules ]]; then
  ln -s "$REPO_ROOT/node_modules" node_modules
fi
if [[ ! -x node_modules/.bin/tsx ]]; then
  echo "[SPEC10-021] node_modules unavailable/incomplete in workspace; installing exact lockfile..."
  rm -f node_modules 2>/dev/null || true
  npm ci
fi

echo "[SPEC10-021] Applying exact-search delta..."
base64 --decode tools/spec10-021-exact-port.patch.gz.b64 | gzip --decompress > /tmp/spec10_021_exact.patch

# The audited contract checkpoint already contains the corrected 690/720 fixture
# from the historical WIP. The archived exact delta was generated one step earlier
# and therefore contains that same correction as a redundant hunk. Remove only that
# exact hunk when (and only when) the checkpoint proves the correction is present.
python3 - <<'PY'
from pathlib import Path

spec_path = Path("engine/planner-next/roundSynchronization.spec.ts")
patch_path = Path("/tmp/spec10_021_exact.patch")
spec = spec_path.read_text(encoding="utf-8")
patch = patch_path.read_text(encoding="utf-8")

already_corrected = (
    '"task:101": 690' in spec
    and '"task:103": 720' in spec
    and '"task:101": 645' not in spec
    and '"task:103": 675' not in spec
)

if already_corrected:
    file_marker = "diff -ruN '--exclude=.git' spec10021wip/engine/planner-next/roundSynchronization.spec.ts"
    hunk_marker = "@@ -37,8 +37,8 @@"
    next_hunk_marker = "@@ -161,12 +161,95 @@"
    file_pos = patch.find(file_marker)
    if file_pos < 0:
        raise SystemExit("SPEC10-021: expected roundSynchronization.spec.ts patch section not found")
    hunk_pos = patch.find(hunk_marker, file_pos)
    next_hunk_pos = patch.find(next_hunk_marker, hunk_pos + len(hunk_marker))
    if hunk_pos < 0 or next_hunk_pos < 0:
        raise SystemExit("SPEC10-021: redundant fixture hunk could not be identified safely")
    redundant = patch[hunk_pos:next_hunk_pos]
    expected_old = '    "task:101": 645,\n    "task:103": 675,'
    expected_new = '    "task:101": 690,\n    "task:103": 720,'
    if expected_old not in redundant or expected_new not in redundant:
        raise SystemExit("SPEC10-021: fixture hunk contents differ from audited expectation")
    patch = patch[:hunk_pos] + patch[next_hunk_pos:]
    patch_path.write_text(patch, encoding="utf-8")
    print("[SPEC10-021] Redundant 690/720 fixture hunk removed safely.")
else:
    print("[SPEC10-021] Fixture correction not pre-applied; keeping archived hunk.")
PY

git apply --check /tmp/spec10_021_exact.patch
git apply /tmp/spec10_021_exact.patch

echo "[SPEC10-021] Applying Full A2 Evidence delta..."
base64 --decode tools/spec10-021-benchmark-port.patch.gz.b64 | gzip --decompress > /tmp/spec10_021_benchmark.patch
git apply --check /tmp/spec10_021_benchmark.patch
git apply /tmp/spec10_021_benchmark.patch

echo "[SPEC10-021] Focal behavioral test before commit..."
npx tsx --test engine/planner-next/roundSynchronization.spec.ts

echo "[SPEC10-021] Regenerating Full A2 representability Evidence..."
npm run benchmark:planner-next:a2-full-template

if ! grep -q '^## SPEC10-021 — Sincronización exacta de rondas entre espacios$' README.md; then
cat >> README.md <<'EOF'

## SPEC10-021 — Sincronización exacta de rondas entre espacios

- **Objetivo (`DB Safe Merge`):** representar y construir dos carriles independientes con inicio sincronizado mientras ambos conservan trabajo elegible, sin convertirlos en un único espacio ni fijar parejas por orden de input.
- **Semántica:** `roundSynchronizations` usa elegibilidad explícita por IDs, emparejamiento ordinal dinámico y preparación entre rondas publicada como `ScheduledRoundPreparation`; el carril largo puede continuar con rondas residuales.
- **Búsqueda exacta:** la capacidad consume el mismo `ExactSearchLedger`, retrocede hacia asignaciones de ronda cuando falla trabajo posterior y mantiene publicación atómica al agotar presupuesto.
- **Validación:** el validador canónico comprueba sincronización, preparación, disponibilidad, comidas y ocupaciones; el fingerprint incluye las preparaciones de ronda.
- **Full A2:** la Evidence de representabilidad exige un probe conectado EngineInput → adapter → EXACT_CONSTRUCTIVE → validación, incluyendo ronda residual, determinismo, invariancia al orden y agotamiento atómico.
- **Fuera de alcance:** no fija los inputs de creación que la fuente A2 deja abiertos, no usa horarios humanos como seed, no añade DB/UI y no implementa todavía el comparador humano de KPIs.
EOF
fi

rm -f \
  tools/spec10-021-exact-port.patch.gz.b64 \
  tools/spec10-021-benchmark-port.patch.gz.b64 \
  .github/workflows/apply-spec10-021-round-sync-exact.yml

git config user.name "OptiPlan SPEC10-021 Gate"
git config user.email "actions@users.noreply.github.com"
git add -A
git diff --cached --check
git commit -m "SPEC10-021: sincronización exacta de rondas Totales"

echo "[SPEC10-021] Focused merge gate..."
npm run check:migrations
npx tsx --test \
  engine/planner-next/roundSynchronization.spec.ts \
  engine/planner-next/exactFlexibleSetupOrder.spec.ts \
  engine/planner-next/integration/engineInputAdapter.spec.ts \
  engine/planner-next/integration/engineInputPreflight.spec.ts \
  engine/planner-next/coverage/focalA2CapabilityAudit.spec.ts
npm run benchmark:planner-next:a2-full-template
git diff --exit-code

echo "[SPEC10-021] Full merge gate..."
npm run check
npm test
npm run build
git diff --check origin/main...HEAD

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to push: candidate worktree is dirty after validation."
  git status --short
  exit 21
fi

CANDIDATE_SHA="$(git rev-parse HEAD)"
echo "[SPEC10-021] All gates passed. Publishing candidate $CANDIDATE_SHA..."
git push --force-with-lease="refs/heads/$TARGET_BRANCH:$EXPECTED_TARGET_HEAD" origin "HEAD:refs/heads/$TARGET_BRANCH"

echo
printf 'SPEC10_021_CANDIDATE_SHA=%s\n' "$CANDIDATE_SHA"
echo "SPEC10_021_STATUS=VALIDATED_AND_PUSHED"
