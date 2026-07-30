import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFocalA2RealityUnits } from "./evaluateFocalA2RealityUnits";
import { itinerantOperationProfiles, itinerantUnitProfiles } from "./focalA2RealityReference";
import { focalA2HumanItinerantReference } from "./focalA2HumanItinerantReference";

test("oracle evaluates only valid standalone operations and member resources", () => {
  const standalone = itinerantOperationProfiles.filter((operation) => operation.type === "STANDALONE");
  const tasks = standalone.map((operation) => ({
    id: operation.id, participantId: operation.participantId,
    start: focalA2HumanItinerantReference.find(row => row.operationId === operation.id)!.start, end: focalA2HumanItinerantReference.find(row => row.operationId === operation.id)!.end,
    spaceId: operation.spaceId,
    requiredResourceIds: itinerantUnitProfiles.find((unit) => unit.id === operation.unitId)!.memberResourceIds,
  }));
  const evaluation = evaluateFocalA2RealityUnits(tasks, true);
  assert.equal(evaluation.plannedTaskCount, 9);
  assert.deepEqual(evaluation.sharedResourceConflicts, []);
  assert.deepEqual(evaluation.participantOverlapConflicts, []);
  assert.equal(evaluation.inputUnchanged, true);
});
