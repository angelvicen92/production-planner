import assert from "node:assert/strict";
import test from "node:test";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { buildCanonicalFullA2EngineInput } from "./canonicalFullA2EngineInput";
import type { PlannerNextProblem, ScheduledTask } from "../contracts";
import { canPlaceTask, exactTaskStartDomain } from "../placement";
import { validatePlan } from "../validate";
import { buildCanonicalA2AssistedStage1Fixture } from "./canonicalA2AssistedStage1Fixture";
import { recommendNextAssistedScope } from "../../../server/assistedScopeOrchestrator";

const sourceSpaceId = (fixture: ReturnType<typeof buildCanonicalFullA2EngineInput>, id: string) =>
  fixture.input.planSpaceSettings![fixture.expansion.spaces.findIndex(space => space.id === id)]!.spaceId;

function adaptedProblem(input: ReturnType<typeof buildCanonicalFullA2EngineInput>["input"]): PlannerNextProblem {
  const adapted = adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapted.status, "SUPPORTED");
  if (adapted.status !== "SUPPORTED") throw new Error("canonical fixture must adapt");
  return adapted.problem;
}

/** Isolate capacity from prerequisite timing; the complete canonical problem is not changed. */
function capacityTask(problem: PlannerNextProblem, fixture: ReturnType<typeof buildCanonicalFullA2EngineInput>, id: string) {
  const task = problem.tasks.find(task => task.id === `task:${fixture.taskId.get(id)}`);
  assert.ok(task);
  return { ...task, dependencies: [] };
}

test("canonical P14 projects exclusive CAM1 to every Recursos/Pasillo task and never to Giratuto", () => {
  const fixture = buildCanonicalFullA2EngineInput();
  const cam1 = fixture.input.planResourceItems.find(resource => resource.name === "cam-1");
  assert.ok(cam1, "Fuente 06 v2.7 §7.5 requires CAM1 in the canonical resource graph");
  const problem = adaptedProblem(fixture.input);
  const cam1Id = `plan-resource:${cam1.id}`;
  assert.ok(problem.resources.some(resource => resource.id === cam1Id));
  for (const space of ["p14-recursos", "p14-pasillo"]) {
    const spaceId = sourceSpaceId(fixture, space);
    assert.deepEqual(fixture.input.spaceResourceAssignments[spaceId], [cam1.id]);
    const tasks = problem.tasks.filter(task => task.spaceId === `space:${spaceId}`);
    assert.ok(tasks.length > 0);
    assert.ok(tasks.every(task => task.requiredResourceIds?.includes(cam1Id)));
  }
  const otherTasks = problem.tasks.filter(task => !["p14-recursos", "p14-pasillo"]
    .some(space => task.spaceId === `space:${sourceSpaceId(fixture, space)}`));
  assert.ok(otherTasks.every(task => !task.requiredResourceIds?.includes(cam1Id)));
  assert.equal(fixture.input.tasks.length, 266);
  assert.equal(fixture.input.tasks.filter(task => task.templateName === "SODEXO").length, 19);
});

test("a missing shared resource admits the old cross-space conflict; effective CAM1 rejects it in placement, domains and HARD validation", () => {
  const fixture = buildCanonicalFullA2EngineInput();
  const legacyInput = structuredClone(fixture.input);
  for (const space of ["p14-recursos", "p14-pasillo"]) {
    delete legacyInput.spaceResourceAssignments[sourceSpaceId(fixture, space)];
  }
  const legacy = adaptedProblem(legacyInput);
  const redes = capacityTask(legacy, fixture, "C01.redes");
  const pasillo = capacityTask(legacy, fixture, "C12.pasillo");
  const start = 13 * 60 + 5;
  const placed: ScheduledTask[] = [{ ...redes, start, end: start + redes.duration }];
  assert.equal(canPlaceTask(legacy, pasillo, start, placed), true);
  assert.ok([...exactTaskStartDomain(legacy, pasillo, placed).starts()].includes(start));
  assert.equal(validatePlan(legacy, [...placed, { ...pasillo, start, end: start + pasillo.duration }]).resourceOverlapViolationCount, 0);

  const correctedInput = structuredClone(legacyInput);
  let cam1 = correctedInput.planResourceItems.find(resource => resource.name === "cam-1");
  if (!cam1) {
    // Before the fix, use the same generic assignment contract as the existing CAM2 fixture.
    cam1 = { ...correctedInput.planResourceItems[0]!, id: Math.max(...correctedInput.planResourceItems.map(resource => resource.id)) + 1,
      resourceItemId: Math.max(...correctedInput.planResourceItems.map(resource => resource.resourceItemId)) + 1,
      typeId: Math.max(...correctedInput.planResourceItems.map(resource => resource.typeId)) + 1, name: "cam-1" };
    correctedInput.planResourceItems.push(cam1);
  }
  for (const space of ["p14-recursos", "p14-pasillo"]) {
    correctedInput.spaceResourceAssignments[sourceSpaceId(fixture, space)] = [cam1.id];
  }
  const corrected = adaptedProblem(correctedInput);
  const correctedRedes = capacityTask(corrected, fixture, "C01.redes");
  const correctedPasillo = capacityTask(corrected, fixture, "C12.pasillo");
  const correctedPlaced: ScheduledTask[] = [{ ...correctedRedes, start, end: start + correctedRedes.duration }];
  assert.equal(canPlaceTask(corrected, correctedPasillo, start, correctedPlaced), false);
  assert.ok(![...exactTaskStartDomain(corrected, correctedPasillo, correctedPlaced).starts()].includes(start));
  const validation = validatePlan(corrected, [...correctedPlaced, { ...correctedPasillo, start, end: start + correctedPasillo.duration }]);
  assert.equal(validation.resourceOverlapViolationCount, 1);
  assert.ok(validation.violations?.some(violation => violation.ruleCode === "RESOURCE_OVERLAP_VIOLATION"
    && violation.severity === "HARD"));
});

test("P14 keeps own-space exclusivity and Giratuto parallelism independently of shared CAM1", () => {
  const fixture = buildCanonicalFullA2EngineInput();
  const problem = adaptedProblem(fixture.input);
  const redes = capacityTask(problem, fixture, "C01.redes");
  const start = 13 * 60 + 5;
  const placed: ScheduledTask[] = [{ ...redes, start, end: start + redes.duration }];
  assert.equal(canPlaceTask(problem, capacityTask(problem, fixture, "C02.redes"), start, placed), false);
  const pasillo = capacityTask(problem, fixture, "C12.pasillo");
  const placedPasillo: ScheduledTask[] = [{ ...pasillo, start, end: start + pasillo.duration }];
  assert.equal(canPlaceTask(problem, capacityTask(problem, fixture, "C02.pasillo"), start, placedPasillo), false);
  const giratuto = capacityTask(problem, fixture, "C04.giratuto");
  for (const occupations of [placed, placedPasillo]) {
    assert.equal(canPlaceTask(problem, giratuto, start, occupations), true);
    assert.ok([...exactTaskStartDomain(problem, giratuto, occupations).starts()].includes(start));
    assert.equal(validatePlan(problem, [...occupations, { ...giratuto, start, end: start + giratuto.duration }]).resourceOverlapViolationCount, 0);
  }
});

test("Stage-1 analytical future retains P14 CAM1 requirements without making P14 visible or protected", () => {
  const fixture = buildCanonicalA2AssistedStage1Fixture();
  const cam1 = fixture.input.planResourceItems.find(resource => resource.name === "cam-1");
  assert.ok(cam1);
  const pending = fixture.assisted.problem.analyticalFutureCollectiveContinuation?.tasks;
  assert.ok(pending);
  const cam1Tasks = fixture.adapter.problem.tasks.filter(task => task.requiredResourceIds?.includes(`plan-resource:${cam1.id}`));
  assert.ok(cam1Tasks.length > 0);
  for (const task of cam1Tasks) {
    assert.ok(pending.some(candidate => candidate.id === task.id
      && candidate.requiredResourceIds?.includes(`plan-resource:${cam1.id}`)));
    assert.ok(!fixture.scope.resolvedTaskIds.includes(task.id));
    assert.ok(!fixture.assisted.protectedPlacements.some(candidate => candidate.id === task.id));
  }
});

test("P14 remains one Assisted unit containing all three spaces", () => {
  const fixture = buildCanonicalFullA2EngineInput();
  const recommendation = recommendNextAssistedScope(fixture.input, { tasks: [] });
  const unit = recommendation?.candidates.find(candidate => candidate.authorityIds.includes("p14-operations"));
  assert.ok(unit);
  const spaces = ["p14-recursos", "p14-pasillo", "p14-giratuto"].map(space => sourceSpaceId(fixture, space)).sort((a, b) => a - b);
  assert.deepEqual(unit.memberSpaceIds, spaces);
  assert.deepEqual(unit.memberTaskIds, fixture.input.tasks.filter(task => task.spaceId != null && spaces.includes(task.spaceId))
    .map(task => task.id).sort((a, b) => a - b));
  assert.equal(unit.memberTaskIds.length, 58);
});

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
