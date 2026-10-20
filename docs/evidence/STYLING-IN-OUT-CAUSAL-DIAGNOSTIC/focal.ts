import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCanonicalA2AssistedStage1Fixture } from "../../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { materializeNominalPipelineWitness } from "../../../engine/planner-next/anonymousPipelineWitness";

// Re-evaluate only the already-selected architecture with the existing witness
// diagnostic. No product instrumentation, new candidates or larger budget.
const directory = resolve(process.argv[2] ?? "/tmp/styling-causal-baseline");
const destination = resolve(process.argv[3] ?? directory);
const run = JSON.parse(readFileSync(resolve(directory, "run.json"), "utf8"));
const fixture = buildCanonicalA2AssistedStage1Fixture();
const producer = fixture.assisted.collectiveCoreProjection ?? fixture.assisted;
const problem = { ...producer.problem, participantMeals: [...(producer.problem.participantMeals ?? []), ...producer.analyticalParticipantMeals] };
const certificate = run.iterations[0].futureStructuralWitnesses.find((w: any) => w.kind === "FIXED_SUPPORTING_PIPELINE");
assert.ok(certificate);
const architecture = JSON.parse(certificate.architectureFingerprint);
const joint = run.iterations[0].futureStructuralWitnesses.find((w: any) => w.kind === "JOINT_COMPLETION");
const mainMeal = joint.operationalMeals.find((meal: any) => meal.spaceIds.includes(problem.mainFlow.spaceId));
assert.ok(mainMeal, "selected main-flow meal must accompany the selected timeline");
architecture.mealStart = mainMeal.start;
const nominal = materializeNominalPipelineWitness(problem, architecture);
const expected = [...certificate.ephemeralSupportingPlacements].sort((a, b) => a.id.localeCompare(b.id));
const expectedIds = new Set(expected.map(task => task.id));
const actual = nominal.scheduledTasks.filter(task => expectedIds.has(task.id))
  .map(({ id, start, end, spaceId }) => ({ id, start, end, spaceId })).sort((a, b) => a.id.localeCompare(b.id));
assert.equal(nominal.witness.status, "FEASIBLE");
// Matching may permute identities after this anonymous geometry is built.
const selectedEntryStarts = expected.filter(task => !problem.transportPolicy!.arrival.taskIds.includes(task.id)).map(task => task.start).sort((a, b) => a - b);
const nominalEntryStarts = nominal.witness.stylingSpots.map(spot => spot.start).sort((a, b) => a - b);
assert.deepEqual(nominalEntryStarts, selectedEntryStarts);
const result = { architecture, status: nominal.witness.status, reason: nominal.witness.reason ?? null,
  anonymousEntryStartsEqualSelected: true,
  nominalSupportingEqualsSelected: JSON.stringify(actual) === JSON.stringify(expected),
  selectedSupporting: expected, nominalSupporting: actual, diagnostic: nominal.diagnostic,
  geometry: nominal.witness, projectionTaskCount: problem.tasks.length };
writeFileSync(resolve(destination, "selected-geometry.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ status: result.status, nominalSupportingEqualsSelected: result.nominalSupportingEqualsSelected,
  start: nominal.diagnostic.selectedEntryBlockStart, candidates: nominal.diagnostic.entryCandidateStartsConsidered,
  rejectedByArrival: nominal.diagnostic.entryCandidatesRejectedByArrival }));
