import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

const run = (command) => {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit", shell: "/bin/bash" });
};
const capture = (command) => execSync(command, { encoding: "utf8", shell: "/bin/bash" }).trim();

const branch = capture("git branch --show-current");
if (branch !== "a2-full-006-fix-itinerant-validation") {
  throw new Error(`Expected branch a2-full-006-fix-itinerant-validation, got ${branch}`);
}
if (capture("git status --porcelain") !== "") {
  throw new Error("Worktree must be clean before running the finalizer.");
}

const validatePath = "engine/planner-next/benchmarks/focal-a2/full-day/validate.ts";
let validateSource = readFileSync(validatePath, "utf8");
const oldText = 'if (!actual || actual.memberResourceIds.join(",") !== unit.memberResourceIds.join(",") || actual.availability !== "creation_input_required") issues.push(issue("ITINERANT_UNITS", "ITINERANT_UNIT_SET_INVALID", unit.id, "Itinerant unit composition must match SPEC-08."));';
const newText = 'if (!actual || actual.memberResourceIds.join(",") !== unit.memberResourceIds.join(",") || actual.availability.start !== unit.availability.start || actual.availability.end !== unit.availability.end || actual.availability.source !== unit.availability.source) issues.push(issue("ITINERANT_UNITS", "ITINERANT_UNIT_SET_INVALID", unit.id, "Itinerant unit composition or availability must match SPEC-08."));';
const matches = validateSource.split(oldText).length - 1;
if (matches !== 1) throw new Error(`Expected exactly one stale itinerant availability assertion, found ${matches}`);
validateSource = validateSource.replace(oldText, newText);
writeFileSync(validatePath, validateSource);

const testPath = "engine/planner-next/benchmarks/__tests__/fullA2ItinerantAvailabilityValidation.test.ts";
writeFileSync(testPath, `import assert from "node:assert/strict";
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
  assert.equal(validation.status, "VALID", validation.issues.map((issue) => `${issue.code}:${issue.entityId}`).join("\\n"));
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
`);

const readmePath = "README.md";
let readme = readFileSync(readmePath, "utf8");
const heading = "## A2-FULL-006 — Validación canónica de disponibilidad itinerante";
if (!readme.includes(heading)) {
  readme += `\n\n${heading}\n\n- **Objetivo (DB Safe Merge):** corregir la regresión de benchmark introducida al materializar las ventanas Reality de SPEC-08: el validador seguía esperando el sentinel histórico \`creation_input_required\`.\n- **Semántica:** la composición y disponibilidad de cada unidad itinerante se validan exactamente contra el contrato canónico estructurado (inicio, fin y procedencia), sin defaults ni uso del planning humano como seed.\n- **Gate reforzado:** el Full A2 regenerado debe conservar \`validationStatus=VALID\`, cero \`validationIssues\`, \`ITINERANT_UNITS.passed=true\`, cero blockers técnicos y únicamente los tres inputs de producción todavía no configurados.\n- **Fuera de alcance:** no cambia Planner Next, presupuesto, DB/UI ni resuelve disponibilidad de participantes, comidas scoped o política OUT.\n`;
  writeFileSync(readmePath, readme);
}

if (!existsSync("node_modules")) run("npm ci");
run("npx tsx --test engine/planner-next/benchmarks/__tests__/fullA2CanonicalTemplate.test.ts engine/planner-next/benchmarks/__tests__/fullA2ItinerantAvailabilityValidation.test.ts");
run("npm run benchmark:planner-next:a2-full-template");

const evidence = JSON.parse(readFileSync("docs/evidence/SPEC10-016-full-a2-canonical-template.json", "utf8"));
const expectedInputs = ["daily_participant_availability", "out_transport_policy", "scoped_meal_policies"];
if (evidence.validationStatus !== "VALID") throw new Error(`validationStatus=${evidence.validationStatus}`);
if (!Array.isArray(evidence.validationIssues) || evidence.validationIssues.length !== 0) throw new Error("validationIssues must be empty");
const itinerant = evidence.invariants?.find((entry) => entry.code === "ITINERANT_UNITS");
if (!itinerant?.passed || (itinerant.issueCodes?.length ?? 0) !== 0) throw new Error("ITINERANT_UNITS must pass with zero issue codes");
if (JSON.stringify(evidence.requiredCreationInputs) !== JSON.stringify(expectedInputs)) throw new Error(`requiredCreationInputs=${JSON.stringify(evidence.requiredCreationInputs)}`);
if ((evidence.implementationBlockers?.length ?? -1) !== 0) throw new Error("implementationBlockers must remain empty");
if (evidence.nextImplementationBlocker !== null) throw new Error("nextImplementationBlocker must remain null");
if (evidence.roundSynchronizationCapabilityProven !== true) throw new Error("round synchronization capability regressed");
if (evidence.representabilityStatus !== "BLOCKED") throw new Error(`representabilityStatus=${evidence.representabilityStatus}`);

for (const path of [
  ".github/A2_FULL_006_TRIGGER",
  ".github/workflows/a2-full-006-materialize.yml",
  ".github/workflows/a2-full-006-pr-materialize.yml",
  "scripts/a2-full-006-finalize.mjs",
]) {
  rmSync(path, { force: true });
}

const allowed = new Set([
  "README.md",
  "engine/planner-next/benchmarks/focal-a2/full-day/validate.ts",
  "engine/planner-next/benchmarks/__tests__/fullA2ItinerantAvailabilityValidation.test.ts",
  "docs/evidence/SPEC10-016-full-a2-canonical-template.json",
  "docs/coverage/SPEC10-016-FULL-A2-TEMPLATE.md",
]);
const changed = capture("git status --porcelain").split("\n").filter(Boolean).map((line) => line.slice(3));
const unexpected = changed.filter((path) => !allowed.has(path) && !path.startsWith(".github/") && path !== "scripts/a2-full-006-finalize.mjs");
if (unexpected.length) throw new Error(`Unexpected changed files: ${unexpected.join(", ")}`);

run("git add -A");
run("git diff --cached --check");
run("git config user.name 'OptiPlan Automation'");
run("git config user.email 'actions@users.noreply.github.com'");
run("git commit -m 'A2-FULL-006: corregir validación de ventanas itinerantes'");

run("npm run check:migrations");
run("npm run check");
run("npm test");
run("npm run build");
run("npm run benchmark:planner-next:a2-full-template");
run("git diff --exit-code");
run("git diff --check origin/main...HEAD");
run("git push origin HEAD:a2-full-006-fix-itinerant-validation");

console.log(`\nA2-FULL-006 candidate published at ${capture("git rev-parse HEAD")}`);
