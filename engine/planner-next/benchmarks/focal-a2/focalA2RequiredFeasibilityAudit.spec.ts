import assert from "node:assert/strict";
import test from "node:test";
import { projectFocalA2BandProblem } from "./focalA2BandReference";
import { auditFocalA2RequiredFeasibility, FOCAL_REQUIRED_INFEASIBLE } from "./focalA2RequiredFeasibilityAudit";

test("the independent oracle derives the real Focal A2 impossibility", () => {
  const audit = auditFocalA2RequiredFeasibility();
  assert.deepEqual([audit.mainTaskCount, audit.requiredTaskCount, audit.nonRequiredTaskCount], [19, 13, 6]);
  assert.deepEqual(audit.coachTaskCounts, { "coach-jose-maria": 11, "coach-lucia": 8 });
  assert.deepEqual(audit.requiredTaskCountsByCoach, { "coach-jose-maria": 8, "coach-lucia": 5 });
  assert.deepEqual(audit.nonRequiredTaskCountsByCoach, { "coach-jose-maria": 3, "coach-lucia": 3 });
  assert.equal(audit.legalCoachPatternCount, 15);
  assert.equal(audit.membershipCompatiblePatternWindowCount, 10);
  assert.deepEqual(audit.compatibleStartIndexes, [3]);
  assert.deepEqual(audit.latestPrefixMainStartByPosition.slice(0, 3), [675, 690, 705]);
  assert.deepEqual(audit.blockerTaskIds, ["main-marta-fonrali", "main-pere-portero"]);
  assert.equal(audit.feasibleRequiredWindowCount, 0);
  assert.equal(audit.infeasible, true);
  assert.deepEqual(audit.reasonCodes, [FOCAL_REQUIRED_INFEASIBLE]);
});

test("the oracle detects viability when feeder and participant windows are widened", () => {
  const problem = projectFocalA2BandProblem("CURRENT_REQUIRED");
  for (const item of [...problem.participants, ...problem.coaches]) item.availability = [{ ...problem.day }];
  for (const space of problem.spaces.filter((s) => s.id.startsWith("vocal-room"))) space.availability = [{ ...problem.day }];
  const audit = auditFocalA2RequiredFeasibility({ problem });
  assert.ok(audit.feasibleRequiredWindowCount > 0);
  assert.equal(audit.infeasible, false);
  assert.deepEqual(audit.blockerTaskIds, []);
});

test("the oracle is canonical, immutable, and derives changed resource membership", () => {
  const problem = projectFocalA2BandProblem("CURRENT_REQUIRED");
  const before = JSON.stringify(problem);
  const first = auditFocalA2RequiredFeasibility({ problem });
  const reversed = { ...problem, tasks: [...problem.tasks].reverse(), participants: [...problem.participants].reverse(), coaches: [...problem.coaches].reverse(), spaces: [...problem.spaces].reverse(), resources: [...problem.resources].reverse() };
  const reordered = auditFocalA2RequiredFeasibility({ problem: reversed });
  assert.deepEqual({ ...first, inputDigest: "x" }, { ...reordered, inputDigest: "x" });
  assert.equal(JSON.stringify(problem), before);
  assert.equal(first.inputUnchanged, true);
  const changed = structuredClone(problem);
  changed.tasks.find((t) => t.kind === "main" && !(t.requiredResourceIds ?? []).length)!.requiredResourceIds = [problem.resources[0]!.id];
  assert.equal(auditFocalA2RequiredFeasibility({ problem: changed }).requiredTaskCount, 14);
});
