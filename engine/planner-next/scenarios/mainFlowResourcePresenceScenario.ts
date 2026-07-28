import type { PlannerNextProblem, PreferenceLevel, Task } from "../contracts";
import { hm } from "../time";

export function mainFlowResourcePresenceScenario(preference: PreferenceLevel): PlannerNextProblem {
  const day = { start: hm("09:00"), end: hm("17:00") };
  const all = [{ ...day }];
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const resourceParticipants = new Set(["a", "d", "e", "h"]);
  const tasks: Task[] = ids.flatMap((suffix) => {
    const participantId = `participant-${suffix}`;
    const coachId = suffix <= "d" ? "coach-a" : "coach-b";
    return [{
      id: `vocal-${participantId}`, kind: "vocal" as const, participantId, coachId,
      duration: 15, spaceId: coachId === "coach-a" ? "vocal-room-a" : "vocal-room-b", dependencies: [],
    }, {
      id: `main-${participantId}`, kind: "main" as const, participantId, coachId,
      duration: 15, spaceId: "main-stage", dependencies: [`vocal-${participantId}`], blockKey: coachId,
      ...(resourceParticipants.has(suffix) ? { requiredResourceIds: ["shared-production-resource"] } : {}),
    }];
  });
  return {
    day, protectedMeal: { start: hm("15:00"), end: hm("16:00") },
    spaces: ["main-stage", "vocal-room-a", "vocal-room-b"].map((id) => ({ id, availability: all })),
    resources: [{ id: "shared-production-resource", availability: all, presencePreference: preference }],
    participants: ids.map((id) => ({ id: `participant-${id}`, availability: all })),
    coaches: ["coach-a", "coach-b"].map((id) => ({ id, availability: all })), tasks,
    mainFlow: { spaceId: "main-stage", preferredEnd: hm("15:00"), continuity: "REQUIRED", maxBlocksByKey: 2, minTasksPerBlock: 2 },
    participantTransitionMinutes: 5, resourceTransitionMinutes: 15,
    budget: { bestK: 20, maxBacktracks: 10, maxPatterns: 100, maxBranchExpansions: 50_000 },
  };
}
