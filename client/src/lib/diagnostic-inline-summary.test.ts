import assert from "node:assert/strict";
import test from "node:test";
import { summarizeInlineDiagnosticValue } from "../lib/diagnostic-inline-summary";

test("summarizeInlineDiagnosticValue does not inline giant diagnostic objects", () => {
  const large = { gates: Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`gate_${index}`, true])), bestCandidateTrace: Array.from({ length: 1000 }, (_, index) => ({ index })) };
  const summary = summarizeInlineDiagnosticValue(large);
  assert.ok(summary.length <= 220);
  assert.doesNotMatch(summary, /gate_499/);
});
