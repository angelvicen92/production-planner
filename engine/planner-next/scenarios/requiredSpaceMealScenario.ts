import { spaceMealScenario } from "./spaceMealScenario";

export function requiredSpaceMealScenario() {
  const problem = spaceMealScenario();
  for (const suffix of ["a", "b", "c", "d"]) {
    problem.participants.push({ id: `required-meal-participant-${suffix}`, availability: [{ start: 660, end: 760 }] });
    problem.tasks.push({ id: `required-meal-task-${suffix}`, kind: "auxiliary", participantId: `required-meal-participant-${suffix}`, duration: 20, spaceId: "required-meal-room", dependencies: [] });
  }
  problem.spaces.push({ id: "required-meal-room", availability: [{ start: 660, end: 760 }], secondaryContinuity: "REQUIRED", mealPolicy: { window: { start: 700, end: 720 }, duration: 20 } });
  return problem;
}
