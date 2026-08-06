#!/usr/bin/env bash
set -euo pipefail

ref="origin/tooling/spec10-020-flexible-setup-order"
mapfile -t parts < <(git ls-tree -r --name-only "$ref" tools/spec10-020-final | grep '/apply\.part-' | sort)
if [[ "${#parts[@]}" -ne 6 ]]; then
  echo "Expected 6 final applicator parts in $ref, found ${#parts[@]}" >&2
  exit 1
fi
for part in "${parts[@]}"; do
  git show "$ref:$part"
done | node
