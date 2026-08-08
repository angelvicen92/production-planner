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

function assertMutationFails(mutator: (unit: any) => void): void {
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
  assert.equal(validation.status, "VALID", validation.issues.map((issue) => issue.code + ":" + issue.entityId).join("\n"));
  assert.deepEqual(validation.issues, []);
  assert.equal(validation.invariants.find((entry) => entry.code === "ITINERANT_UNITS")?.passed, true);
});

test("itinerant validation rejects mutated start, end and source", () => {
  assertMutationFails((unit) => { unit.availability.start = "11:05"; });
  assertMutationFails((unit) => { unit.availability.end = "13:55"; });
  assertMutationFails((unit) => { unit.availability.source = "OTHER_SOURCE"; });
});

test("checked-in Full A2 Evidence declares the canonical template valid", () => {
  const evidence = JSON.parse(readFileSync("docs/evidence/SPEC10-016-full-a2-canonical-template.json", "utf8"));
  assert.equal(evidence.validationStatus, "VALID");
  assert.deepEqual(evidence.validationIssues, []);
  const itinerant = evidence.invariants.find((entry: any) => entry.code === "ITINERANT_UNITS");
  assert.equal(itinerant?.passed, true);
  assert.deepEqual(itinerant?.issueCodes, []);
});
