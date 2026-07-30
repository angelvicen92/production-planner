import { planMainFlowAndFeeders } from "../../planMainFlowAndFeeders";
import { itinerantUnitsScenario } from "../../scenarios/itinerantUnitsScenario";

const exact = (actual: readonly string[] | undefined, expected: readonly string[]) =>
  !!actual && actual.length === expected.length && expected.every((id) => actual.includes(id));

export function createItinerantBehaviorProblem(reverse = false) {
  const problem = itinerantUnitsScenario();
  problem.resources = problem.resources.filter(({ id }) => !id.startsWith("mobile-unit-"));
  problem.resources.forEach((resource) => {
    resource.presencePreference = "OFF";
    resource.availability = resource.id === "camera-b" ? [{ start: 570, end: 930 }] : [{ ...problem.day }];
  });
  problem.spaces.push({ id: "location-c", availability: [{ start: 800, end: problem.day.end }] });
  problem.spaces.filter(({ id }) => id === "location-a1" || id === "location-b1").forEach((space) => { space.availability = [{ start: 600, end: 630 }]; });
  problem.participants.push({ id: "control-participant-c", availability: [{ ...problem.day }] });
  problem.tasks = problem.tasks.map((task) => task.id.startsWith("unit-a-")
    ? { ...task, duration: task.id === "unit-a-1" ? 30 : 15, requiredResourceIds: ["camera-a", "sound-a"] }
    : task.id.startsWith("unit-b-")
      ? { ...task, requiredResourceIds: ["camera-b", "sound-b"] }
      : task);
  problem.tasks = problem.tasks.filter((task) => !task.id.startsWith("unit-") || ["unit-a-1", "unit-b-1"].includes(task.id));
  problem.tasks.push({ id: "unit-c-1", kind: "auxiliary", participantId: "control-participant-c", duration: 20,
    spaceId: "location-c", dependencies: [], requiredResourceIds: ["camera-a", "camera-b", "sound-a"] });
  if (reverse) { problem.tasks.reverse(); problem.resources.reverse(); problem.spaces.reverse(); problem.participants.reverse(); }
  return problem;
}

export function runFocalA2ItinerantUnitBehavioralControls() {
  const problem = createItinerantBehaviorProblem();
  const before = JSON.stringify(problem);
  const first = planMainFlowAndFeeders(problem);
  const repeat = planMainFlowAndFeeders(createItinerantBehaviorProblem());
  const reversed = planMainFlowAndFeeders(createItinerantBehaviorProblem(true));
  const tasks = first.scheduledTasks.filter(({ id }) => id.startsWith("unit-"));
  const a = tasks.filter(({ id }) => id.startsWith("unit-a-"));
  const b = tasks.filter(({ id }) => id.startsWith("unit-b-"));
  const c = tasks.find(({ id }) => id === "unit-c-1");
  const parallel = a.some((left) => b.some((right) => left.start < right.end && right.start < left.end));
  const cAfter = !!c && [...a, ...b].every((task) => task.end <= c.start);
  const exactComposition = a.every((task) => exact(task.requiredResourceIds, ["camera-a", "sound-a"]))
    && b.every((task) => exact(task.requiredResourceIds, ["camera-b", "sound-b"]))
    && !!c && exact(c.requiredResourceIds, ["camera-a", "camera-b", "sound-a"]);
  const deterministic = first.metrics.planFingerprint === repeat.metrics.planFingerprint;
  const orderInvariant = first.metrics.planFingerprint === reversed.metrics.planFingerprint;
  return {
    status: first.complete && first.metrics.hardValid && exactComposition && parallel && cAfter ? "BEHAVIORALLY_SUPPORTED" : "FAILED",
    complete: first.complete, hardValid: first.metrics.hardValid, exactComposition, parallelUnits: parallel,
    recomposition: cAfter, exclusivity: first.metrics.resourceOverlapViolationCount === 0,
    availability: first.metrics.resourceAvailabilityViolationCount === 0,
    variableDurations: new Set(tasks.map((task) => task.end - task.start)).size > 1,
    locationChange: new Set(tasks.map(({ spaceId }) => spaceId)).size > 1,
    deterministic, orderInvariant, inputUnchanged: before === JSON.stringify(problem),
    illegalOverlapRejected: first.metrics.resourceOverlapViolationCount === 0,
    exactResourceSets: Object.fromEntries(tasks.map((task) => [task.id, task.requiredResourceIds ?? []])),
    fingerprint: first.metrics.planFingerprint, reversedFingerprint: reversed.metrics.planFingerprint,
  };
}
