import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  itinerantOperationProfiles,
  itinerantUnitProfiles,
  projectStandaloneFocalA2RealityProblem,
  realityReferenceValidation,
} from "./focalA2RealityReference";

test("generic itinerant contract separates standalone and wrapped operations", () => {
  assert.deepEqual(realityReferenceValidation, {
    operationProfileCount: 12, wrappedOperationCount: 3, standaloneOperationCount: 9,
    wrappedBeforeSegmentCount: 3, wrappedAfterSegmentCount: 3, wrappedAnchorCount: 3,
    totalItinerantResourceMinutes: 375, projectedTaskCountWhenSupported: 53,
  });
  const wrapped = itinerantOperationProfiles.filter((operation) => operation.type === "ANCHORED_ACCOMPANIMENT");
  assert.deepEqual(wrapped.map((operation) => operation.participantId).sort(), ["cristina-zuloaga", "jose-javier-cuenca", "julio-gomez"]);
  assert.ok(wrapped.every((operation) => operation.before.duration === 15 && operation.after.duration === 15 && operation.adjacency === "REQUIRED"));
});

test("unit IDs group configuration but never become required resources", () => {
  assert.deepEqual(itinerantUnitProfiles.map((unit) => unit.memberResourceIds), [
    ["reality-camera-3", "reality-sound-1"],
    ["reality-camera-4", "reality-sound-2"],
    ["reality-camera-3", "reality-camera-4", "reality-sound-1"],
  ]);
  assert.deepEqual(itinerantUnitProfiles.map(unit=>unit.availability), [[{start:660,end:840}],[{start:675,end:810}],[{start:960,end:1080}]]);
  const problem = projectStandaloneFocalA2RealityProblem();
  const unitIds = new Set(itinerantUnitProfiles.map((unit) => unit.id));
  assert.equal(problem.tasks.filter((task) => task.id.startsWith("reality-operation")).length, 9);
  assert.ok(problem.tasks.every((task) => task.requiredResourceIds?.every((id) => !unitIds.has(id)) ?? true));
  assert.equal(problem.tasks.length, 47);
});
test("standalone projection applies neutral availability and contains no human schedule seed",()=>{const source=fs.readFileSync(new URL("./focalA2RealityReference.ts",import.meta.url),"utf8");assert.ok(!source.includes("focalA2HumanItinerantReference"));assert.ok(!source.includes("_start"));assert.ok(!source.includes("Math.max"));const problem=projectStandaloneFocalA2RealityProblem();for(const [id,availability] of Object.entries({"lina-isabel-garcia-salcedo":[{start:570,end:1080}],"marta-fonrali":[{start:670,end:1080}],"linet-varela":[{start:600,end:1080}],"carmen-maria-saborido":[{start:570,end:1080}],"eva-martin-fernandez":[{start:630,end:1080}]}))assert.deepEqual(problem.participants.find(p=>p.id===id)?.availability,availability);assert.equal(problem.auxiliaryPolicy?.participantPresencePreference,"OFF")});
