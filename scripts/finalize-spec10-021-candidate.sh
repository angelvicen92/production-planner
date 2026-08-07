#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
BASE_SHA="7ab93f1ed79d8e753379f962281b1e5192b90fb9"
TMP="$(mktemp -d /tmp/optiplan-spec10-021-final.XXXXXX)"

cleanup() {
  cd "$ROOT" || true
  git worktree remove --force "$TMP" >/dev/null 2>&1 || true
  rm -rf "$TMP" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git fetch origin spec10-021-round-sync-exact tooling/spec10-021-totales-round-sync

git worktree add --detach "$TMP" "$BASE_SHA"
cd "$TMP"

# 1) Reconstruct exact-search final from the audited contract checkpoint.
base64 --decode tools/spec10-021-exact-port.patch.gz.b64 | gzip --decompress > /tmp/spec10_021_exact.patch
node --input-type=commonjs <<'NODE'
const fs = require("node:fs");
const patchPath = "/tmp/spec10_021_exact.patch";
const replacementPath = "/tmp/spec10_021_exact_tests.txt";
let patch = fs.readFileSync(patchPath, "utf8").replace(/\r\n/g, "\n");
const startMarker = "--- a/engine/planner-next/roundSynchronization.spec.ts\n+++ b/engine/planner-next/roundSynchronization.spec.ts";
const nextMarker = "--- a/engine/planner-next/roundSynchronization.ts\n+++ b/engine/planner-next/roundSynchronization.ts";
const start = patch.indexOf(startMarker);
const next = patch.indexOf(nextMarker, start + startMarker.length);
if (start < 0 || next < 0 || patch.indexOf(startMarker, start + 1) >= 0) throw new Error("SPEC10-021: stale test patch section missing or ambiguous");
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
if (exactStart < 0 || newText.indexOf(exactMarker, exactStart + 1) >= 0) throw new Error("SPEC10-021: exact test replacement missing or ambiguous");
const replacement = newText.slice(exactStart).trimEnd();
for (const required of [
  'test("exact synchronization supports a residual round after the shorter lane finishes"',
  'test("round synchronization is deterministic under task and eligible-set order changes"',
  'test("round synchronization exhausts the shared budget atomically"',
]) if (!replacement.includes(required)) throw new Error(`SPEC10-021: missing exact regression ${required}`);
fs.writeFileSync(replacementPath, replacement + "\n", "utf8");
patch = patch.slice(0, start) + patch.slice(next);
fs.writeFileSync(patchPath, patch, "utf8");
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
if (oldStart < 0 || text.indexOf(oldMarker, oldStart + 1) >= 0) throw new Error("SPEC10-021: obsolete exact-route test missing or ambiguous");
if (!text.includes('"task:101": 690') || !text.includes('"task:103": 720') || text.includes('"task:101": 645') || text.includes('"task:103": 675')) throw new Error("SPEC10-021: audited fixture correction missing");
if (!text.includes('test("canonical validation permits residual rounds after the shorter lane is exhausted"')) throw new Error("SPEC10-021: canonical residual regression missing");
text = text.slice(0, oldStart) + replacement + "\n";
fs.writeFileSync(path, text, "utf8");
NODE

# 2) Add the connected Full A2 probe, then fix its residual-round assertions.
base64 --decode tools/spec10-021-benchmark-port.patch.gz.b64 | gzip --decompress > /tmp/spec10_021_benchmark.patch
git apply --check /tmp/spec10_021_benchmark.patch
git apply /tmp/spec10_021_benchmark.patch
node --input-type=commonjs <<'NODE'
const fs = require("node:fs");
const path = "engine/planner-next/benchmarks/spec10021RoundSynchronizationProbe.ts";
let text = fs.readFileSync(path, "utf8");
const strict = `  assert.deepEqual(probe.projectedLaneTaskCounts, [2, 2]);\n  assert.equal(probe.scheduledRoundPreparationCount, 2);\n  assert.equal(probe.synchronizedRoundCount, 2);\n  assert.equal(probe.residualRoundCount, 0);`;
const generic = `  assert.ok(probe.projectedLaneTaskCounts.length >= 2);\n  assert.ok(probe.projectedLaneTaskCounts.every((count) => count > 0));\n  assert.ok(probe.scheduledRoundPreparationCount >= 0);\n  assert.ok(probe.synchronizedRoundCount > 0);\n  assert.ok(probe.residualRoundCount >= 0);`;
if (!text.includes(strict)) throw new Error("SPEC10-021: historical strict probe assertions not found");
text = text.replace(strict, generic);
const oldResidual = `export function runSpec10021ResidualProbe(): Spec10021ProbeRun {\n  return runSpec10021Probe(() => {\n    const input = createSpec10021RoundSynchronizationEngineInputFixture();\n    input.contestantAvailabilityById = {\n      ...input.contestantAvailabilityById,\n      215: { start: "08:00", end: "17:00" },\n    };\n    input.tasks.push({\n      ...structuredClone(input.tasks.find(({ id }) => id === 402)!),\n      id: 405,\n      contestantId: 215,\n    });\n    input.roundSynchronizations![0]!.lanes[0]!.taskIds.push(405);\n    return input;\n  });\n}`;
const newResidual = `export function runSpec10021ResidualProbe(): Spec10021ProbeRun {\n  const probe = runSpec10021Probe(() => {\n    const input = createSpec10021RoundSynchronizationEngineInputFixture();\n    input.contestantAvailabilityById = {\n      ...input.contestantAvailabilityById,\n      215: { start: "08:00", end: "17:00" },\n    };\n    input.tasks.push({\n      ...structuredClone(input.tasks.find(({ id }) => id === 402)!),\n      id: 405,\n      contestantId: 215,\n    });\n    input.roundSynchronizations![0]!.lanes[0]!.taskIds.push(405);\n    return input;\n  });\n  assert.deepEqual(probe.projectedLaneTaskCounts, [3, 2]);\n  assert.equal(probe.scheduledRoundPreparationCount, 3);\n  assert.equal(probe.synchronizedRoundCount, 2);\n  assert.equal(probe.residualRoundCount, 1);\n  return probe;\n}`;
if (!text.includes(oldResidual)) throw new Error("SPEC10-021: historical residual probe body not found");
text = text.replace(oldResidual, newResidual);
fs.writeFileSync(path, text);
NODE

# 3) Overlay the already-merged A2-FULL-004 source-configuration contract.
cp "$ROOT/engine/planner-next/benchmarks/focal-a2/full-day/benchmarkConfiguration.ts" engine/planner-next/benchmarks/focal-a2/full-day/benchmarkConfiguration.ts
cp "$ROOT/engine/planner-next/benchmarks/focal-a2/full-day/benchmarkConfiguration.spec.ts" engine/planner-next/benchmarks/focal-a2/full-day/benchmarkConfiguration.spec.ts
node --input-type=commonjs <<'NODE'
const fs = require("node:fs");
const manifestPath = "engine/planner-next/benchmarks/focal-a2/full-day/manifest.ts";
let manifest = fs.readFileSync(manifestPath, "utf8");
const importLine = 'import { CONTRACT_VERSION, PARTICIPANT_IDS } from "./types";';
if (!manifest.includes('A2_BENCHMARK_SOURCE_CONFIGURATION')) manifest = manifest.replace(importLine, `${importLine}\nimport { A2_BENCHMARK_SOURCE_CONFIGURATION } from "./benchmarkConfiguration";`);
const resourcesStart = manifest.indexOf("export const CANONICAL_RESOURCES");
const unitsStart = manifest.indexOf("export const CANONICAL_ITINERANT_UNITS");
if (resourcesStart < 0 || unitsStart <= resourcesStart) throw new Error("SPEC10-021: resource block missing");
const resources = manifest.slice(resourcesStart, unitsStart);
manifest = manifest.slice(0, resourcesStart) + resources.replaceAll('availability: "creation_input_required"', 'availability: "inherits_day_unless_overridden"') + manifest.slice(unitsStart);
const oldInputs = `    requiredCreationInputs: [\n      "daily_participant_availability",\n      "daily_resource_availability",\n      "daily_space_availability",\n      "daily_itinerant_unit_availability",\n      "effective_day_window",\n      "execution_date",\n      "future_productive_ids",\n      "general_meal_window",\n      "out_transport_policy",\n    ],`;
if (manifest.includes(oldInputs)) manifest = manifest.replace(oldInputs, "    requiredCreationInputs: A2_BENCHMARK_SOURCE_CONFIGURATION.unresolvedCreationInputs,");
fs.writeFileSync(manifestPath, manifest);

const typesPath = "engine/planner-next/benchmarks/focal-a2/full-day/types.ts";
let types = fs.readFileSync(typesPath, "utf8");
types = types.replace('export const CONTRACT_VERSION = "SPEC10-016.full-a2-template.v2";', 'export const CONTRACT_VERSION = "SPEC10-016.full-a2-template.v3";');
const resourceType = 'readonly availability: "creation_input_required";\n}\n\nexport interface AnchoredOperationContract';
if (types.includes(resourceType)) types = types.replace(resourceType, 'readonly availability: "inherits_day_unless_overridden";\n}\n\nexport interface AnchoredOperationContract');
fs.writeFileSync(typesPath, types);
NODE

npx tsx --test engine/planner-next/roundSynchronization.spec.ts engine/planner-next/benchmarks/focal-a2/full-day/benchmarkConfiguration.spec.ts
npm run benchmark:planner-next:a2-full-template

git add -A
mapfile -t changed < <(git diff --cached --name-only)
cd "$ROOT"
for file in "${changed[@]}"; do
  if [[ -f "$TMP/$file" ]]; then
    mkdir -p "$(dirname "$file")"
    cp "$TMP/$file" "$file"
  fi
done

# 4) Candidate-level gates on current main + SPEC10-021.
npx tsx --test \
  engine/planner-next/roundSynchronization.spec.ts \
  engine/planner-next/exactFlexibleSetupOrder.spec.ts \
  engine/planner-next/integration/engineInputAdapter.spec.ts \
  engine/planner-next/integration/engineInputPreflight.spec.ts \
  engine/planner-next/coverage/focalA2CapabilityAudit.spec.ts \
  engine/planner-next/benchmarks/focal-a2/full-day/benchmarkConfiguration.spec.ts
npm run benchmark:planner-next:a2-full-template

if grep -q 'PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED' docs/coverage/SPEC10-016-FULL-A2-TEMPLATE.md; then
  echo "SPEC10-021: Full A2 still reports round synchronization unsupported" >&2
  exit 30
fi
if [[ "$(grep -c '^\- \*\*.*\*\*: La fuente exige este dato' docs/coverage/SPEC10-016-FULL-A2-TEMPLATE.md)" -ne 4 ]]; then
  echo "SPEC10-021: expected exactly four remaining creation inputs" >&2
  exit 31
fi
if ! grep -q 'roundSynchronizationCapabilityProven=true' docs/coverage/SPEC10-016-FULL-A2-TEMPLATE.md; then
  echo "SPEC10-021: connected round synchronization proof missing" >&2
  exit 32
fi

npm run check:migrations
npm run check
npm test
npm run build

if ! grep -q '^## SPEC10-021 — Sincronización exacta de rondas entre espacios$' README.md; then
  cat >> README.md <<'EOF'

## SPEC10-021 — Sincronización exacta de rondas entre espacios

- **Objetivo (`DB Safe Merge`):** representar y construir dos carriles independientes con inicio sincronizado mientras ambos conservan trabajo elegible, sin convertirlos en un único espacio ni fijar parejas por orden de input.
- **Semántica:** `roundSynchronizations` usa elegibilidad explícita por IDs, emparejamiento ordinal dinámico y preparación entre rondas publicada como `ScheduledRoundPreparation`; el carril largo puede continuar con rondas residuales.
- **Búsqueda exacta:** la capacidad consume el mismo `ExactSearchLedger`, retrocede hacia asignaciones de ronda cuando falla trabajo posterior y mantiene publicación atómica al agotar presupuesto.
- **Validación:** el validador canónico comprueba sincronización, preparación, disponibilidad, comidas y ocupaciones; el fingerprint incluye las preparaciones de ronda.
- **Full A2:** el probe conectado EngineInput → adapter → EXACT_CONSTRUCTIVE → validación demuestra ronda residual, determinismo, invariancia al orden y agotamiento atómico. Tras A2-FULL-004 no quedan blockers técnicos de representabilidad; permanecen cuatro decisiones de configuración fuente.
- **Fuera de alcance:** no inventa disponibilidades, comidas scoped ni política OUT, no usa horarios humanos como seed y no aumenta presupuesto para ocultar inviabilidad.
EOF
fi

rm -f \
  tools/spec10-021-exact-port.patch.gz.b64 \
  tools/spec10-021-benchmark-port.patch.gz.b64 \
  .github/workflows/apply-spec10-021-round-sync-exact.yml \
  .github/workflows/finalize-spec10-021.yml \
  scripts/finalize-spec10-021-candidate.sh

git add -A
git diff --cached --check
git config user.name "OptiPlan Automation"
git config user.email "actions@users.noreply.github.com"
git commit -m "SPEC10-021: sincronización exacta de rondas Totales"
git push origin HEAD:spec10-021-round-sync-final
