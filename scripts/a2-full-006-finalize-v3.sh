#!/usr/bin/env bash
set -euo pipefail

BRANCH="a2-full-006-fix-itinerant-validation"
if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  echo "ERROR: expected branch $BRANCH, got $(git branch --show-current)" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: worktree must be clean before running finalizer" >&2
  git status --short >&2
  exit 1
fi

VALIDATE="engine/planner-next/benchmarks/focal-a2/full-day/validate.ts"
OLD='if (!actual || actual.memberResourceIds.join(",") !== unit.memberResourceIds.join(",") || actual.availability !== "creation_input_required") issues.push(issue("ITINERANT_UNITS", "ITINERANT_UNIT_SET_INVALID", unit.id, "Itinerant unit composition must match SPEC-08."));'
NEW='if (!actual || actual.memberResourceIds.join(",") !== unit.memberResourceIds.join(",") || actual.availability.start !== unit.availability.start || actual.availability.end !== unit.availability.end || actual.availability.source !== unit.availability.source) issues.push(issue("ITINERANT_UNITS", "ITINERANT_UNIT_SET_INVALID", unit.id, "Itinerant unit composition or availability must match SPEC-08."));'

node - "$VALIDATE" "$OLD" "$NEW" <<'NODE'
const fs = require("node:fs");
const [path, oldText, newText] = process.argv.slice(2);
const text = fs.readFileSync(path, "utf8");
const count = text.split(oldText).length - 1;
if (count !== 1) {
  console.error(`Expected exactly one stale itinerant availability assertion, found ${count}`);
  process.exit(1);
}
fs.writeFileSync(path, text.replace(oldText, newText));
NODE

TEST="engine/planner-next/benchmarks/__tests__/fullA2ItinerantAvailabilityValidation.test.ts"
cat > "$TEST" <<'EOF'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createCanonicalFullA2Template,
  expandCanonicalFullA2Template,
  validateExpandedCanonicalFullA2Template,
  type ExpandedCanonicalFullA2Template,
} from "../focal-a2/full-day/canonicalFullA2Template";

function cloneExpansion(): ExpandedCanonicalFullA2Template {
  return structuredClone(expandCanonicalFullA2Template(createCanonicalFullA2Template())) as ExpandedCanonicalFullA2Template;
}

function assertItinerantAvailabilityMutationFails(mutator: (unit: any) => void): void {
  const expansion: any = cloneExpansion();
  const unit = expansion.itinerantUnits.find((entry: any) => entry.id === "reality-unit-a");
  assert.ok(unit);
  mutator(unit);
  const validation = validateExpandedCanonicalFullA2Template(expansion);
  const invariant = validation.invariants.find((entry) => entry.code === "ITINERANT_UNITS");
  assert.equal(validation.status, "INVALID");
  assert.equal(invariant?.passed, false);
  assert.ok(invariant?.issueCodes.includes("ITINERANT_UNIT_SET_INVALID"));
}

test("canonical SPEC-08 itinerant windows remain canonically valid", () => {
  const validation = validateExpandedCanonicalFullA2Template(cloneExpansion());
  assert.equal(validation.status, "VALID", validation.issues.map((issue) => `${issue.code}:${issue.entityId}`).join("\n"));
  assert.deepEqual(validation.issues, []);
  assert.equal(validation.invariants.find((entry) => entry.code === "ITINERANT_UNITS")?.passed, true);
});

test("itinerant unit validation rejects mutated start, end and source", () => {
  assertItinerantAvailabilityMutationFails((unit) => { unit.availability.start = "11:05"; });
  assertItinerantAvailabilityMutationFails((unit) => { unit.availability.end = "13:55"; });
  assertItinerantAvailabilityMutationFails((unit) => { unit.availability.source = "OTHER_SOURCE"; });
});

test("checked-in Full A2 Evidence cannot declare an invalid canonical template", () => {
  const evidence = JSON.parse(readFileSync("docs/evidence/SPEC10-016-full-a2-canonical-template.json", "utf8"));
  assert.equal(evidence.validationStatus, "VALID");
  assert.deepEqual(evidence.validationIssues, []);
  const itinerant = evidence.invariants.find((entry: any) => entry.code === "ITINERANT_UNITS");
  assert.equal(itinerant?.passed, true);
  assert.deepEqual(itinerant?.issueCodes, []);
});
EOF

HEADING="## A2-FULL-006 — Validación canónica de disponibilidad itinerante"
if ! grep -Fq "$HEADING" README.md; then
  cat >> README.md <<'EOF'

## A2-FULL-006 — Validación canónica de disponibilidad itinerante

- **Objetivo (DB Safe Merge):** corregir la regresión de benchmark introducida al materializar las ventanas Reality de SPEC-08: el validador seguía esperando el sentinel histórico `creation_input_required`.
- **Semántica:** la composición y disponibilidad de cada unidad itinerante se validan exactamente contra el contrato canónico estructurado (inicio, fin y procedencia), sin defaults ni uso del planning humano como seed.
- **Gate reforzado:** el Full A2 regenerado debe conservar `validationStatus=VALID`, cero `validationIssues`, `ITINERANT_UNITS.passed=true`, cero blockers técnicos y únicamente los tres inputs de producción todavía no configurados.
- **Fuera de alcance:** no cambia Planner Next, presupuesto, DB/UI ni resuelve disponibilidad de participantes, comidas scoped o política OUT.
EOF
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi

npx tsx --test \
  engine/planner-next/benchmarks/__tests__/fullA2CanonicalTemplate.test.ts \
  engine/planner-next/benchmarks/__tests__/fullA2ItinerantAvailabilityValidation.test.ts

npm run benchmark:planner-next:a2-full-template

node <<'NODE'
const fs = require("node:fs");
const evidence = JSON.parse(fs.readFileSync("docs/evidence/SPEC10-016-full-a2-canonical-template.json", "utf8"));
const expectedInputs = ["daily_participant_availability", "out_transport_policy", "scoped_meal_policies"];
const fail = (message) => { console.error(message); process.exit(1); };
if (evidence.validationStatus !== "VALID") fail(`validationStatus=${evidence.validationStatus}`);
if (!Array.isArray(evidence.validationIssues) || evidence.validationIssues.length !== 0) fail("validationIssues must be empty");
const itinerant = evidence.invariants?.find((entry) => entry.code === "ITINERANT_UNITS");
if (!itinerant?.passed || (itinerant.issueCodes?.length ?? 0) !== 0) fail("ITINERANT_UNITS must pass with zero issue codes");
if (JSON.stringify(evidence.requiredCreationInputs) !== JSON.stringify(expectedInputs)) fail(`requiredCreationInputs=${JSON.stringify(evidence.requiredCreationInputs)}`);
if ((evidence.implementationBlockers?.length ?? -1) !== 0) fail("implementationBlockers must remain empty");
if (evidence.nextImplementationBlocker !== null) fail("nextImplementationBlocker must remain null");
if (evidence.roundSynchronizationCapabilityProven !== true) fail("round synchronization capability regressed");
if (evidence.representabilityStatus !== "BLOCKED") fail(`representabilityStatus=${evidence.representabilityStatus}`);
NODE

rm -f \
  .github/A2_FULL_006_TRIGGER \
  .github/workflows/a2-full-006-materialize.yml \
  .github/workflows/a2-full-006-pr-materialize.yml \
  scripts/a2-full-006-finalize.mjs \
  scripts/a2-full-006-finalize-v2.sh \
  scripts/a2-full-006-finalize-v3.sh

git add -A
git diff --cached --check

git config user.name "OptiPlan Automation"
git config user.email "actions@users.noreply.github.com"
git commit -m "A2-FULL-006: corregir validación de ventanas itinerantes"

npm run check:migrations
npm run check
npm test
npm run build
npm run benchmark:planner-next:a2-full-template

git diff --exit-code
git diff --check origin/main...HEAD
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: full gate left the worktree dirty" >&2
  git status --short >&2
  exit 1
fi

git push origin HEAD:"$BRANCH"
echo
echo "A2-FULL-006 candidate published at $(git rev-parse HEAD)"
