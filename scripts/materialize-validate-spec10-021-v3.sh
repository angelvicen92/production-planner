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

echo "[SPEC10-021] Preparing exact-search delta against audited checkpoint..."
base64 --decode tools/spec10-021-exact-port.patch.gz.b64 | gzip --decompress > /tmp/spec10_021_exact.patch

# The archived exact patch was generated against the first contract WIP. The audited
# checkpoint later corrected the 690/720 fixture and added an independent canonical
# residual-round validation test. Rebase ONLY roundSynchronization.spec.ts semantically:
# derive the desired new exact-route tests from the patch itself, remove that file's
# stale patch section, apply every other exact-search hunk normally, then replace only
# the obsolete final "rejects until search integration" test in the audited file.
node --input-type=commonjs <<'NODE'
const fs = require("node:fs");

const patchPath = "/tmp/spec10_021_exact.patch";
const replacementPath = "/tmp/spec10_021_exact_tests.txt";
let patch = fs.readFileSync(patchPath, "utf8").replace(/\r\n/g, "\n");

const startMarker = "--- a/engine/planner-next/roundSynchronization.spec.ts\n+++ b/engine/planner-next/roundSynchronization.spec.ts";
const nextMarker = "--- a/engine/planner-next/roundSynchronization.ts\n+++ b/engine/planner-next/roundSynchronization.ts";
const start = patch.indexOf(startMarker);
const next = patch.indexOf(nextMarker, start + startMarker.length);
if (start < 0 || next < 0 || patch.indexOf(startMarker, start + 1) >= 0) {
  throw new Error("SPEC10-021: roundSynchronization.spec.ts patch section is missing or ambiguous");
}

const section = patch.slice(start, next);
const newSide = [];
for (const line of section.split("\n")) {
  if (line.startsWith("@@") || line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("\\ No newline")) continue;
  if (line.startsWith("-")) continue;
  if (line.startsWith("+") || line.startsWith(" ")) newSide.push(line.slice(1));
}
const newText = newSide.join("\n");
const exactMarker = 'test("the exact route schedules synchronized rounds and explicit preparations", () => {';
const exactStart = newText.indexOf(exactMarker);
if (exactStart < 0 || newText.indexOf(exactMarker, exactStart + 1) >= 0) {
  throw new Error("SPEC10-021: desired exact-route test replacement is missing or ambiguous");
}
const replacement = newText.slice(exactStart).trimEnd();
if (!replacement.includes('test("exact synchronization supports a residual round after the shorter lane finishes"')) {
  throw new Error("SPEC10-021: residual-round exact test missing from derived replacement");
}
if (!replacement.includes('test("round synchronization is deterministic under task and eligible-set order changes"')) {
  throw new Error("SPEC10-021: determinism exact test missing from derived replacement");
}
if (!replacement.includes('test("round synchronization exhausts the shared budget atomically"')) {
  throw new Error("SPEC10-021: budget atomicity exact test missing from derived replacement");
}
fs.writeFileSync(replacementPath, replacement + "\n", "utf8");
patch = patch.slice(0, start) + patch.slice(next);
fs.writeFileSync(patchPath, patch, "utf8");
console.log("[SPEC10-021] Stale spec-test patch section isolated; all other exact hunks retained.");
NODE

git apply --check /tmp/spec10_021_exact.patch
git apply /tmp/spec10_021_exact.patch

node --input-type=commonjs <<'NODE'
const fs = require("node:fs");
const path = "engine/planner-next/roundSynchronization.spec.ts";
let text = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const replacement = fs.readFileSync("/tmp/spec10_021_exact_tests.txt", "utf8").trimEnd();
const oldMarker = 'test("the exact route rejects the new shape explicitly until search integration", () => {';
const oldStart = text.indexOf(oldMarker);
if (oldStart < 0 || text.indexOf(oldMarker, oldStart + 1) >= 0) {
  throw new Error("SPEC10-021: obsolete exact-route test is missing or ambiguous in audited checkpoint");
}
if (!text.includes('"task:101": 690') || !text.includes('"task:103": 720')
  || text.includes('"task:101": 645') || text.includes('"task:103": 675')) {
  throw new Error("SPEC10-021: audited 690/720 fixture correction is not in the expected state");
}
if (!text.includes('test("canonical validation permits residual rounds after the shorter lane is exhausted"')) {
  throw new Error("SPEC10-021: audited canonical residual-round regression test is missing");
}
text = text.slice(0, oldStart) + replacement + "\n";
if (text.includes(oldMarker)) throw new Error("SPEC10-021: obsolete exact-route test survived semantic replacement");
fs.writeFileSync(path, text, "utf8");
console.log("[SPEC10-021] Exact-route tests rebased semantically; audited residual validation preserved.");
NODE

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
