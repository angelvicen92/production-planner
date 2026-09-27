import assert from "node:assert/strict";
import test from "node:test";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { buildCanonicalFullA2EngineInput } from "./canonicalFullA2EngineInput";

test("canonical P15 projects CAM2 through both member spaces with preferred concentration", () => {
  const { input, expansion } = buildCanonicalFullA2EngineInput();
  const p15SpaceIds = ["p15-croma", "p15-estrellas-sillon"].map(id =>
    3001 + expansion.spaces.findIndex(space => space.id === id));
  const cam2Id = 4001 + expansion.resources.findIndex(resource => resource.id === "cam-2");
  for (const spaceId of p15SpaceIds) assert.deepEqual(input.spaceResourceAssignments[spaceId], [cam2Id]);

  const adapted = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapted.status, "SUPPORTED");
  if (adapted.status !== "SUPPORTED") return;
  const canonicalCam2 = `plan-resource:${cam2Id}`;
  assert.equal(adapted.problem.resources.find(resource => resource.id === canonicalCam2)?.presenceConcentrationPolicy, "PREFERRED");
  for (const spaceId of p15SpaceIds) {
    const tasks = adapted.problem.tasks.filter(task => task.spaceId === `space:${spaceId}`);
    assert.ok(tasks.length > 0);
    assert.ok(tasks.every(task => task.requiredResourceIds?.includes(canonicalCam2)));
  }
});
