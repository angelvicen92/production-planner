import type { PlannerNextProblem, Task } from "../contracts";
import { hm } from "../time";
import { auxiliaryScarcityScenario } from "./auxiliaryScarcityScenario";

export const isolatedTaskIds = ["isolated-choice-task", "isolated-scarce-task"] as const;
export const isolatedParticipantIds = ["isolated-choice-participant", "isolated-scarce-participant"] as const;

export function branchHistoryControlScenario(): PlannerNextProblem {
  return auxiliaryScarcityScenario("OFF");
}

export function branchHistoryIsolatedPruningScenario(): PlannerNextProblem {
  const problem = auxiliaryScarcityScenario("OFF");
  problem.participants.push(
    { id: isolatedParticipantIds[0], availability: [{ start: hm("09:00"), end: hm("09:55") }] },
    { id: isolatedParticipantIds[1], availability: [{ start: hm("09:10"), end: hm("09:25") }] },
  );
  problem.spaces.push(
    { id: "isolated-space-a", availability: [{ start: hm("09:00"), end: hm("09:25") }, { start: hm("09:30"), end: hm("09:55") }] },
    { id: "isolated-space-b", availability: [{ start: hm("09:10"), end: hm("09:25") }] },
  );
  problem.resources.push({ id: "isolated-resource", availability: [{ start: hm("09:00"), end: hm("09:55") }], presencePreference: "OFF", transitionMinutes: 0 });
  const tasks: Task[] = [
    { id: isolatedTaskIds[0], kind: "auxiliary", participantId: isolatedParticipantIds[0], duration: 25, spaceId: "isolated-space-a", dependencies: [], requiredResourceIds: ["isolated-resource"] },
    { id: isolatedTaskIds[1], kind: "auxiliary", participantId: isolatedParticipantIds[1], duration: 5, spaceId: "isolated-space-b", dependencies: [], requiredResourceIds: ["isolated-resource"] },
  ];
  problem.tasks.push(...tasks);
  return problem;
}
