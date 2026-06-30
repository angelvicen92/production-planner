import assert from "node:assert/strict";
import test from "node:test";
import type { ValidationViolationDetail } from "../contracts";
import { dominantViolationCodes, sampleViolationDetailsByCode } from "./protectedBreakScope";

const detail = (code: string, taskId: number): ValidationViolationDetail => ({
  code,
  constraintGroup: code === "SPACE_OVERLAP" ? "spaces" : code === "DIRECT_DEPENDENCY_BROKEN" ? "dependencies" : "time",
  severity: "hard",
  taskIds: [taskId],
  resourceIds: [],
  spaceIds: [],
  lockIds: [],
  breakWindow: null,
  timeWindow: null,
  relatedTimeWindow: null,
  message: code,
  diagnosticHint: code,
  readOnly: true,
});

test("sampleViolationDetailsByCode stratifies without mutating details", () => {
  const details = [
    ...Array.from({ length: 10 }, (_, i) => detail("DIRECT_DEPENDENCY_BROKEN", i + 1)),
    detail("SPACE_OVERLAP", 101),
    detail("PLANNING_CROSSES_PROTECTED_HARD_BREAK", 102),
  ];
  const before = JSON.stringify(details);
  const sample = sampleViolationDetailsByCode(details, { maxTotal: 4, minPerCode: 2 });
  assert.equal(JSON.stringify(details), before);
  assert.ok(sample.some((item) => item.code === "DIRECT_DEPENDENCY_BROKEN"));
  assert.ok(sample.some((item) => item.code === "SPACE_OVERLAP"));
  assert.ok(sample.some((item) => item.code === "PLANNING_CROSSES_PROTECTED_HARD_BREAK"));
  assert.deepEqual(JSON.parse(JSON.stringify(sample)), sample);
});

test("dominantViolationCodes counts details and ignores truncation sentinels", () => {
  const codes = dominantViolationCodes([detail("SPACE_OVERLAP", 1), detail("DIRECT_DEPENDENCY_BROKEN", 2), detail("SPACE_OVERLAP", 3), detail("VALIDATION_DETAILS_TRUNCATED", 4)], ["FALLBACK"]);
  assert.deepEqual(codes, ["SPACE_OVERLAP", "DIRECT_DEPENDENCY_BROKEN"]);
  assert.deepEqual(dominantViolationCodes([], ["B", "A", "B"]), ["B", "A"]);
});
