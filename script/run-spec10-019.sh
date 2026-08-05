#!/usr/bin/env bash
set -euo pipefail

BRANCH="spec10-019-coach-route-transition"
BASE_SHA="a2a647cfb5393735189c42525caa27f3e631bf0b"

if [ "$(git branch --show-current)" != "$BRANCH" ]; then
  echo "Rama incorrecta: $(git branch --show-current)"
  echo "Esperada: $BRANCH"
  exit 2
fi

if ! git merge-base --is-ancestor "$BASE_SHA" HEAD; then
  echo "La rama no parte del main esperado $BASE_SHA"
  exit 3
fi

if [ -n "$(git status --short)" ]; then
  echo "El repositorio no está limpio:"
  git status --short
  exit 4
fi

python3 script/apply-spec10-019-bootstrap.py

npm run check
node script/run-test-suite.mjs engine/planner-next

TMPDIR_SPEC="$(mktemp -d)"
npm run benchmark:planner-next:spec10-019
cp docs/evidence/SPEC10-019-coach-route-transition.json "$TMPDIR_SPEC/spec10-019-run1.json"
cp docs/coverage/SPEC10-019-COACH-ROUTE-TRANSITION.md "$TMPDIR_SPEC/spec10-019-coverage-run1.md"

npm run benchmark:planner-next:spec10-019
cmp "$TMPDIR_SPEC/spec10-019-run1.json" docs/evidence/SPEC10-019-coach-route-transition.json
cmp "$TMPDIR_SPEC/spec10-019-coverage-run1.md" docs/coverage/SPEC10-019-COACH-ROUTE-TRANSITION.md

npm run benchmark:planner-next:a2-full-template
./validate-focal-a2-010.sh current

git restore -- planner-next-focal-a2-itinerant-spec08-foundation-v4.json 2>/dev/null || true

git diff --check

rm -f script/apply-spec10-019-bootstrap.py script/run-spec10-019.sh

git add -A
git diff --cached --check

git config user.name >/dev/null 2>&1 || git config user.name "OptiPlan"
git config user.email >/dev/null 2>&1 || git config user.email "optiplan-validation@users.noreply.github.com"

git commit -m "SPEC10-019: support directional coach transitions"
git push origin "HEAD:$BRANCH"

echo
echo "=== RESULTADO ==="
echo "Head:"
git rev-parse HEAD
echo
echo "Estado:"
git status --short
echo
echo "No se ha realizado merge."
