import type { PlannerNextProblem, Task } from "../contracts";
import { hm } from "../time";

export function mainFlowVocalBacktrackingScenario(): PlannerNextProblem {
  const day = { start: hm("09:00"), end: hm("17:00") };
  const allDay = [{ ...day }];
  const participantWindows: Record<string, { start: number; end: number }> = {
    "participant-z": { start: hm("09:30"), end: hm("14:15") },
    "participant-c": { start: hm("11:30"), end: hm("13:30") },
    "participant-d": { start: hm("10:00"), end: hm("13:45") },
    "participant-e": { start: hm("10:45"), end: hm("14:30") },
    "participant-a": { start: hm("09:00"), end: hm("14:30") },
    "participant-f": { start: hm("12:30"), end: hm("15:30") },
    "participant-g": { start: hm("12:45"), end: hm("15:30") },
    "participant-h": { start: hm("10:45"), end: hm("14:00") },
  };
  const participantIds = Object.keys(participantWindows);
  const coachFor = (id: string): string => [
    "participant-z", "participant-c", "participant-d", "participant-e",
  ].includes(id) ? "coach-a" : "coach-b";
  const vocalRoomFor = (id: string): string => [
    "participant-c", "participant-f", "participant-g",
  ].includes(id) ? "vocal-room-b" : "vocal-room-a";
  const tasks: Task[] = participantIds.flatMap((participantId) => {
    const coachId = coachFor(participantId);
    return [
      {
        id: `vocal-${participantId}`,
        kind: "vocal",
        participantId,
        coachId,
        duration: 15,
        spaceId: vocalRoomFor(participantId),
        dependencies: [],
      },
      {
        id: `main-${participantId}`,
        kind: "main",
        participantId,
        coachId,
        duration: 15,
        spaceId: "main-stage",
        dependencies: [`vocal-${participantId}`],
        blockKey: coachId,
      },
    ];
  });
  return {
    day,
    protectedMeal: { start: hm("15:00"), end: hm("16:00") },
    resources: [],
    spaces: [
      { id: "main-stage", availability: allDay },
      { id: "vocal-room-a", availability: allDay },
      { id: "vocal-room-b", availability: allDay },
    ],
    participants: participantIds.map((id) => ({ id, availability: [{ ...participantWindows[id] }] })),
    coaches: [
      { id: "coach-a", availability: allDay },
      { id: "coach-b", availability: allDay },
    ],
    tasks,
    mainFlow: {
      spaceId: "main-stage",
      preferredEnd: hm("15:00"),
      continuity: "REQUIRED",
      maxBlocksByKey: 2,
      minTasksPerBlock: 2,
    },
    participantTransitionMinutes: 5,
    resourceTransitionMinutes: 15,
    budget: {
      bestK: 10,
      maxBacktracks: 10,
      maxPatterns: 100,
      maxBranchExpansions: 20_000,
    },
  };
}
