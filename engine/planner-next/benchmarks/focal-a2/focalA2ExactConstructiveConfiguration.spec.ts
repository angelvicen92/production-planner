import assert from "node:assert/strict";
import test from "node:test";
import {
  createAcceptedExactConstructiveFocalA2Problem,
  focalA2ExactConstructiveAuxiliaryPolicy,
  focalA2ExactConstructiveEvidence,
} from "./focalA2ExactConstructiveConfiguration";
import { focalA2RealityAuxiliaryPolicy } from "./focalA2RealityOperationalConfiguration";
import {
  itinerantOperationProfiles,
  projectCombinedFocalA2ItinerantProblem,
} from "./focalA2RealityReference";

const stable = (value: unknown) => JSON.stringify(value);

test("keeps historical OFF isolated from the accepted exact LOW configuration", () => {
  const historicalBefore = stable(focalA2RealityAuxiliaryPolicy);
  const historicalFirst = projectCombinedFocalA2ItinerantProblem();
  const accepted = createAcceptedExactConstructiveFocalA2Problem();
  const historicalSecond = projectCombinedFocalA2ItinerantProblem();

  assert.equal(
    historicalFirst.auxiliaryPolicy?.participantPresencePreference,
    "OFF",
  );
  assert.equal(
    focalA2ExactConstructiveAuxiliaryPolicy.participantPresencePreference,
    "LOW",
  );
  assert.equal(accepted.auxiliaryPolicy?.participantPresencePreference, "LOW");
  assert.equal(accepted.searchPolicy, "EXACT_CONSTRUCTIVE");
  assert.equal(
    historicalSecond.auxiliaryPolicy?.participantPresencePreference,
    "OFF",
  );
  assert.equal(stable(focalA2RealityAuxiliaryPolicy), historicalBefore);
});

test("returns fresh problems without mutating the source corpus or its windows", () => {
  const corpusBefore = stable(itinerantOperationProfiles);
  const first = createAcceptedExactConstructiveFocalA2Problem();
  const second = createAcceptedExactConstructiveFocalA2Problem();

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.tasks, second.tasks);
  assert.notStrictEqual(first.auxiliaryPolicy, second.auxiliaryPolicy);

  first.tasks.reverse();
  first.participants.reverse();
  first.spaces.reverse();
  first.resources.reverse();
  first.coaches.reverse();
  first.anchoredAccompaniments?.reverse();
  for (const item of [
    ...first.participants,
    ...first.coaches,
    ...first.spaces,
    ...first.resources,
  ]) {
    item.availability.reverse();
  }
  for (const task of first.tasks) task.availability?.reverse();

  assert.equal(stable(itinerantOperationProfiles), corpusBefore);
  assert.deepEqual(second, createAcceptedExactConstructiveFocalA2Problem());
});

test("keeps LOW explicit for reversed corpus and does not infer it from identifiers", () => {
  const reversedCorpus = [...itinerantOperationProfiles].reverse();
  const renamedCorpus = itinerantOperationProfiles.map((operation) => ({
    ...operation,
    id: `unrelated-${operation.id}`,
  }));

  for (const problem of [
    createAcceptedExactConstructiveFocalA2Problem(reversedCorpus),
    createAcceptedExactConstructiveFocalA2Problem(renamedCorpus),
  ]) {
    assert.equal(problem.searchPolicy, "EXACT_CONSTRUCTIVE");
    assert.equal(problem.auxiliaryPolicy?.participantPresencePreference, "LOW");
  }
});

test("publishes explanatory Evidence without claiming defaults, calibration, or fallback", () => {
  assert.deepEqual(
    {
      iteration: focalA2ExactConstructiveEvidence.iteration,
      sourceExperiment: focalA2ExactConstructiveEvidence.sourceExperiment,
      policyClass: focalA2ExactConstructiveEvidence.policyClass,
      representativePolicy:
        focalA2ExactConstructiveEvidence.representativePolicy,
      officialDefaultChanged:
        focalA2ExactConstructiveEvidence.officialDefaultChanged,
      historicalPolicyChanged:
        focalA2ExactConstructiveEvidence.historicalPolicyChanged,
      engineDefaultChanged:
        focalA2ExactConstructiveEvidence.engineDefaultChanged,
      weightCalibrationClaimed:
        focalA2ExactConstructiveEvidence.weightCalibrationClaimed,
      fallbackUsed: focalA2ExactConstructiveEvidence.fallbackUsed,
    },
    {
      iteration: "SPEC09-008",
      sourceExperiment: "SPEC09-007",
      policyClass: "POSITIVE",
      representativePolicy: "LOW",
      officialDefaultChanged: false,
      historicalPolicyChanged: false,
      engineDefaultChanged: false,
      weightCalibrationClaimed: false,
      fallbackUsed: false,
    },
  );
});
