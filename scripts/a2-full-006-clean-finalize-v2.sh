#!/usr/bin/env bash
set -euo pipefail

BRANCH="a2-full-006-clean-validator"
if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  echo "ERROR: expected $BRANCH, got $(git branch --show-current)" >&2
  exit 1
fi

git fetch origin main "$BRANCH"

node <<'NODE'
const fs = require('node:fs');

function replaceOnce(path, oldText, newText, label) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  fs.writeFileSync(path, source.replace(oldText, newText));
}

const validatePath = 'engine/planner-next/benchmarks/focal-a2/full-day/validate.ts';
replaceOnce(
  validatePath,
  'if (!actual || actual.memberResourceIds.join(",") !== unit.memberResourceIds.join(",") || actual.availability !== "creation_input_required") issues.push(issue("ITINERANT_UNITS", "ITINERANT_UNIT_SET_INVALID", unit.id, "Itinerant unit composition must match SPEC-08."));',
  'if (!actual || actual.memberResourceIds.join(",") !== unit.memberResourceIds.join(",") || actual.availability.start !== unit.availability.start || actual.availability.end !== unit.availability.end || actual.availability.source !== unit.availability.source) issues.push(issue("ITINERANT_UNITS", "ITINERANT_UNIT_SET_INVALID", unit.id, "Itinerant unit composition or availability must match SPEC-08."));',
  'stale itinerant validator',
);

const fullTest = 'engine/planner-next/benchmarks/__tests__/fullA2CanonicalTemplate.test.ts';
replaceOnce(
  fullTest,
  '  assert.equal(analysis.flexibleSetupOrderCapabilityProven, true);\n  assert.ok(!analysis.implementationBlockers.some((blocker) => blocker.code === "ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED"));',
  `  assert.equal(analysis.flexibleSetupOrderCapabilityProven, true);\n  assert.equal(analysis.roundSynchronizationProbe.executed, true);\n  assert.equal(analysis.roundSynchronizationProbe.exactPolicySelected, true);\n  assert.equal(analysis.roundSynchronizationProbe.complete, true);\n  assert.equal(analysis.roundSynchronizationProbe.hardValid, true);\n  assert.equal(analysis.roundSynchronizationProbe.roundSynchronizationViolationCount, 0);\n  assert.equal(analysis.roundSynchronizationProbe.roundPreparationViolationCount, 0);\n  assert.equal(analysis.roundSynchronizationProbe.residualRoundSupported, true);\n  assert.equal(analysis.roundSynchronizationProbe.deterministic, true);\n  assert.equal(analysis.roundSynchronizationProbe.orderInvariant, true);\n  assert.equal(analysis.roundSynchronizationProbe.inputImmutable, true);\n  assert.equal(analysis.roundSynchronizationProbe.sharedBudgetAccounting, true);\n  assert.equal(analysis.roundSynchronizationProbe.atomicOnBudgetExhaustion, true);\n  assert.equal(analysis.roundSynchronizationCapabilityProven, true);\n  assert.ok(!analysis.implementationBlockers.some((blocker) => blocker.code === "ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED"));`,
  'round synchronization positive coverage insertion',
);
replaceOnce(
  fullTest,
  '  assert.ok(analysis.implementationBlockers.some((blocker) => blocker.code === "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED"));',
  '  assert.ok(!analysis.implementationBlockers.some((blocker) => blocker.code === "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED"));',
  'stale round synchronization blocker expectation',
);
replaceOnce(
  fullTest,
  '  assert.equal(analysis.nextImplementationBlocker?.code, "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED");\n\n  const failedRouteAnalysis = analyzeCanonicalFullA2Representability(expansion, {',
  `  assert.equal(analysis.implementationBlockers.length, 0);\n  assert.equal(analysis.nextImplementationBlocker, null);\n\n  const failedRoundAnalysis = analyzeCanonicalFullA2Representability(expansion, {\n    adapterProbe: analysis.adapterProbe,\n    jointGroupProbe: analysis.jointGroupProbe,\n    setupPolicyProbe: analysis.setupPolicyProbe,\n    flexibleSetupOrderProbe: analysis.flexibleSetupOrderProbe,\n    roundSynchronizationProbe: {\n      ...analysis.roundSynchronizationProbe,\n      complete: false,\n    },\n  });\n  assert.equal(failedRoundAnalysis.roundSynchronizationCapabilityProven, false);\n  assert.ok(failedRoundAnalysis.implementationBlockers.some((blocker) => blocker.code === "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED"));\n  assert.equal(failedRoundAnalysis.nextImplementationBlocker?.code, "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED");\n\n  const failedRouteAnalysis = analyzeCanonicalFullA2Representability(expansion, {`,
  'round synchronization negative coverage insertion',
);

const readmePath = 'README.md';
let readme = fs.readFileSync(readmePath, 'utf8');
const heading = '## A2-FULL-006 — Validación canónica de disponibilidad itinerante';
if (!readme.includes(heading)) {
  readme += `\n\n${heading}\n\n- **Objetivo (DB Safe Merge):** corregir la regresión de benchmark introducida al materializar las ventanas Reality de SPEC-08: el validador seguía esperando el sentinel histórico \`creation_input_required\`.\n- **Semántica:** la composición y disponibilidad de cada unidad itinerante se validan exactamente contra el contrato canónico estructurado (inicio, fin y procedencia), sin defaults ni uso del planning humano como seed.\n- **Regresión histórica detectada:** el test Full A2 conservaba la expectativa anterior a SPEC10-021 de que la sincronización exacta de rondas seguía bloqueada. Se actualiza para exigir capacidad probada en el caso normal y reaparición del blocker cuando el probe de rondas falla.\n- **Gate reforzado:** Full A2 debe conservar \`validationStatus=VALID\`, cero \`validationIssues\`, \`ITINERANT_UNITS.passed=true\`, cero blockers técnicos y únicamente los tres inputs de producción todavía no configurados.\n- **Fuera de alcance:** no cambia Planner Next, presupuesto, DB/UI ni resuelve disponibilidad de participantes, comidas scoped o política OUT.\n`;
  fs.writeFileSync(readmePath, readme);
}
NODE

rm -f .github/A2_FULL_006_FAILURE.log

echo '=== regenerate Full A2 Evidence ==='
npm run benchmark:planner-next:a2-full-template

node <<'NODE'
const fs = require('node:fs');
const e = JSON.parse(fs.readFileSync('docs/evidence/SPEC10-016-full-a2-canonical-template.json', 'utf8'));
const expectedInputs = ['daily_participant_availability', 'out_transport_policy', 'scoped_meal_policies'];
const fail = (message) => { throw new Error(message); };
if (e.validationStatus !== 'VALID') fail(`validationStatus=${e.validationStatus}`);
if (!Array.isArray(e.validationIssues) || e.validationIssues.length !== 0) fail('validationIssues must be empty');
const itinerant = e.invariants?.find((entry) => entry.code === 'ITINERANT_UNITS');
if (!itinerant?.passed || (itinerant.issueCodes?.length ?? 0) !== 0) fail('ITINERANT_UNITS must pass with zero issue codes');
if (JSON.stringify(e.requiredCreationInputs) !== JSON.stringify(expectedInputs)) fail(`requiredCreationInputs=${JSON.stringify(e.requiredCreationInputs)}`);
if ((e.implementationBlockers?.length ?? -1) !== 0) fail('implementationBlockers must be empty');
if (e.nextImplementationBlocker !== null) fail('nextImplementationBlocker must be null');
if (e.roundSynchronizationCapabilityProven !== true) fail('roundSynchronizationCapabilityProven must remain true');
if (e.representabilityStatus !== 'BLOCKED') fail(`representabilityStatus=${e.representabilityStatus}`);
NODE

echo '=== focused Full A2 regression ==='
npx tsx --test \
  engine/planner-next/benchmarks/__tests__/fullA2CanonicalTemplate.test.ts \
  engine/planner-next/benchmarks/__tests__/fullA2ItinerantAvailabilityValidation.test.ts

echo '=== remove tooling and restore official CI ==='
git checkout origin/main -- .github/workflows/baseline-ci.yml
rm -f scripts/a2-full-006-clean-finalize-v2.sh

mapfile -t changed < <(git status --short | sed -E 's/^.. //' | sort)
printf '%s\n' "${changed[@]}"
allowed_re='^(README\.md|engine/planner-next/benchmarks/focal-a2/full-day/validate\.ts|engine/planner-next/benchmarks/__tests__/fullA2CanonicalTemplate\.test\.ts|engine/planner-next/benchmarks/__tests__/fullA2ItinerantAvailabilityValidation\.test\.ts|docs/evidence/SPEC10-016-full-a2-canonical-template\.json|docs/coverage/SPEC10-016-FULL-A2-TEMPLATE\.md|\.github/workflows/baseline-ci\.yml|\.github/A2_FULL_006_FAILURE\.log|scripts/a2-full-006-clean-finalize-v2\.sh)$'
for f in "${changed[@]}"; do
  [[ "$f" =~ $allowed_re ]] || { echo "ERROR: unexpected changed file: $f" >&2; exit 1; }
done

git add -A
git diff --cached --check
git config user.name 'OptiPlan Automation'
git config user.email 'actions@users.noreply.github.com'
git commit -m '[skip a2-full-006] A2-FULL-006: corregir validación canónica y regresión focal'

CANDIDATE_SHA="$(git rev-parse HEAD)"
echo "=== exact DB Safe Merge gate $CANDIDATE_SHA ==="
npm run check:migrations
npm run check
npm test
npm run build
npm run benchmark:planner-next:a2-full-template
git diff --exit-code
git diff --check origin/main...HEAD
test -z "$(git status --porcelain)"

git push origin HEAD:"$BRANCH"
echo "A2-FULL-006 candidate published at $CANDIDATE_SHA"
