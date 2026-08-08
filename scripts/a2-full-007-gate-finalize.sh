#!/usr/bin/env bash
set -euo pipefail

BRANCH="a2-full-007-source-defaults"
if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  echo "ERROR: expected $BRANCH, got $(git branch --show-current)" >&2
  exit 1
fi

git fetch origin main "$BRANCH"

npx tsx --test engine/planner-next/benchmarks/focal-a2/full-day/benchmarkConfiguration.spec.ts
npm run check:migrations
npm run check
npm test
npm run build
npm run benchmark:planner-next:a2-full-template

# Benchmark/config capture must not silently mutate any product artifact.
git diff --exit-code -- . \
  ':(exclude).github/workflows/a2-full-007-gate.yml' \
  ':(exclude)scripts/a2-full-007-gate-finalize.sh'

git diff --check origin/main...HEAD

rm -f .github/workflows/a2-full-007-gate.yml scripts/a2-full-007-gate-finalize.sh
git add -A
git diff --cached --check

if git diff --cached --quiet; then
  echo "ERROR: expected temporary tooling deletions" >&2
  exit 1
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -m "[skip a2-full-007] A2-FULL-007: publicar defaults de fuente validados"
git push origin HEAD:"$BRANCH"

echo "A2-FULL-007 candidate published at $(git rev-parse HEAD)"
