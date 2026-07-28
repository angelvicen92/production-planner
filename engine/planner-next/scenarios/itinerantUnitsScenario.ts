import type { PlannerNextProblem, Resource, Task } from "../contracts";
import { hm } from "../time";
import { mainFlowVocalScenario } from "./mainFlowVocalScenario";

/** NEXT-005 composes itinerant units exclusively from exact resources. */
export function itinerantUnitsScenario(): PlannerNextProblem {
  const problem = mainFlowVocalScenario();
  problem.spaces.push(
    { id: "location-a1", availability: [{ ...problem.day }] },
    { id: "location-a2", availability: [{ ...problem.day }] },
    { id: "location-b1", availability: [{ ...problem.day }] },
    { id: "location-b2", availability: [{ ...problem.day }] },
  );
  const all = [{ ...problem.day }];
  const resources: Resource[] = [
    { id: "mobile-unit-a", availability: all, presencePreference: "HIGH", transitionMinutes: 10 },
    { id: "camera-a", availability: all, presencePreference: "OFF", transitionMinutes: 5 },
    { id: "sound-a", availability: all, presencePreference: "OFF", transitionMinutes: 5 },
    { id: "mobile-unit-b", availability: all, presencePreference: "HIGH", transitionMinutes: 20 },
    { id: "camera-b", availability: all, presencePreference: "OFF", transitionMinutes: 10 },
    { id: "sound-b", availability: all, presencePreference: "OFF", transitionMinutes: 5 },
  ];
  problem.resources.push(...resources);
  const auxiliary: Task[] = [
    { id: "unit-a-1", kind: "auxiliary", participantId: "participant-c", duration: 15, spaceId: "location-a1", dependencies: [], requiredResourceIds: ["mobile-unit-a", "camera-a", "sound-a"] },
    { id: "unit-a-2", kind: "auxiliary", participantId: "participant-d", duration: 15, spaceId: "location-a1", dependencies: [], requiredResourceIds: ["mobile-unit-a", "camera-a", "sound-a"] },
    { id: "unit-a-3", kind: "auxiliary", participantId: "participant-e", duration: 15, spaceId: "location-a2", dependencies: [], requiredResourceIds: ["mobile-unit-a", "camera-a", "sound-a"] },
    { id: "unit-b-1", kind: "auxiliary", participantId: "participant-f", duration: 15, spaceId: "location-b1", dependencies: [], requiredResourceIds: ["mobile-unit-b", "camera-b", "sound-b"] },
    { id: "unit-b-2", kind: "auxiliary", participantId: "participant-g", duration: 15, spaceId: "location-b2", dependencies: [], requiredResourceIds: ["mobile-unit-b", "camera-b", "sound-b"] },
    { id: "unit-b-3", kind: "auxiliary", participantId: "participant-h", duration: 15, spaceId: "location-b2", dependencies: [], requiredResourceIds: ["mobile-unit-b", "camera-b", "sound-b"] },
  ];
  problem.tasks.push(...auxiliary);
  problem.auxiliaryPolicy = { participantPresencePreference: "OFF" };
  problem.budget.bestK = 20;
  problem.budget.maxBranchExpansions = 200_000;
  return problem;
}
