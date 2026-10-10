import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { PlannerNextProblem, ScheduledTask } from "../../engine/planner-next/contracts";
import type { FutureJointCompletionWitnessV1 } from "../../engine/planner-next/anonymousPipelineWitness";
import { validatePlan } from "../../engine/planner-next/validate";
import { revalidateJointCompletionWitness } from "../../engine/planner-next/jointCompletionWitness";
import { materializeScheduledItinerantUnitMeals } from "../../engine/planner-next/itinerantUnitMeals";
import { PreparedFutureCollectiveParticipantClosure } from "../../engine/planner-next/futureCollectiveParticipantClosure";

// Positive, read-only diagnostic audit. This script never invokes a search or proposal service.
const artifact = JSON.parse(readFileSync(process.argv[2] ?? "docs/evidence/ASST-010-S2-PROTECTED-FEASIBLE.json", "utf8")) as {
  source: PlannerNextProblem;
  protectedTasks: ScheduledTask[];
  protectedOperationalMeals: FutureJointCompletionWitnessV1["operationalMeals"];
  priorJoint: FutureJointCompletionWitnessV1;
  witness: FutureJointCompletionWitnessV1;
  provenance: { changedDurationTaskIds: string[]; cam1ResourceId: string };
};
const before = structuredClone(artifact);
const { source, witness, priorJoint, protectedTasks, protectedOperationalMeals } = artifact;
assert.equal(source.tasks.length, 247);
assert.deepEqual(witness.tasks.map(task => task.id).sort(), source.tasks.map(task => task.id).sort());
assert.equal(new Set(witness.tasks.map(task => task.id)).size, 247);
assert.equal(witness.participantMeals.length, 19);
assert.deepEqual(witness.participantMeals.map(meal => meal.sourceTaskId).sort(),
  source.participantMeals!.map(meal => meal.sourceTaskId).sort());
assert.equal(artifact.provenance.changedDurationTaskIds.length, 19);
for (const id of artifact.provenance.changedDurationTaskIds) {
  assert.equal(source.tasks.find(task => task.id === id)!.duration, 20);
  assert.equal(witness.tasks.find(task => task.id === id)!.end - witness.tasks.find(task => task.id === id)!.start, 20);
  assert.equal(priorJoint.tasks.find(task => task.id === id)!.duration, 10);
}
for (const fixed of protectedTasks) assert.deepEqual(witness.tasks.find(task => task.id === fixed.id), fixed);
for (const fixed of protectedOperationalMeals)
  assert.deepEqual(witness.operationalMeals.find(meal => meal.id === fixed.id), fixed);
const cam1 = witness.tasks.filter(task => task.requiredResourceIds?.includes(artifact.provenance.cam1ResourceId)).sort((a, b) => a.start - b.start);
assert.equal(cam1.length, 51);
assert.ok(cam1.slice(1).every((task, index) => cam1[index]!.end <= task.start));
const resourceMeals = (source.resourceMeals ?? []).map(meal => ({ id: meal.id, sourceTaskId: meal.sourceTaskId,
  resourceIds: [...meal.resourceIds], start: meal.interval.start, end: meal.interval.end, duration: meal.interval.end - meal.interval.start }));
const validation = validatePlan(source, [...witness.tasks], [...witness.preparations], [...witness.spaceMeals],
  [...witness.participantMeals], resourceMeals, materializeScheduledItinerantUnitMeals(source),
  [...witness.roundPreparations], [...witness.operationalMeals]);
assert.equal(validation.hardValid, true, JSON.stringify(validation));
assert.deepEqual(validation.reasonCodes, []);
assert.deepEqual(validation.violations, []);
let charges = 0;
const consume = () => charges < 100_000 ? (++charges, true) : false;
const priorReplay = revalidateJointCompletionWitness(source, priorJoint, protectedTasks, consume);
assert.equal(priorReplay, "STALE", "the pre-refresh witness must be recertified against current durations");
const priorCharges = charges;
const replay = revalidateJointCompletionWitness(source, witness, protectedTasks, consume);
assert.equal(replay, "PASS");
const replayCharges = charges - priorCharges;
const closure = new PreparedFutureCollectiveParticipantClosure(source).evaluate([...witness.tasks],
  [...witness.participantMeals], consume, "SUFFICIENT");
assert.equal(closure.status, "PASS");
assert.equal(closure.certified, true);
assert.deepEqual(artifact, before);
console.log(JSON.stringify({ feasibility: "FEASIBLE", tasks: witness.tasks.length, participantMeals: witness.participantMeals.length,
  refreshedEntries: artifact.provenance.changedDurationTaskIds.length, protectedTaskCount: protectedTasks.length,
  protectedOperationalMealCount: protectedOperationalMeals.length, protectedLiteral: true, cam1Tasks: cam1.length,
  cam1Overlaps: 0, hardValid: validation.hardValid, violations: validation.violations, priorReplay, priorCharges,
  replay, replayCharges, closureCertified: closure.certified, closureCharges: closure.branchesConsumed,
  totalAuditCharges: charges, witnessFingerprint: witness.fingerprint,
  sourceDigest: createHash("sha256").update(JSON.stringify(source)).digest("hex"), productionInjection: false }, null, 2));
