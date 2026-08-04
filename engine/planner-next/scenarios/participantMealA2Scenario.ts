import type { ParticipantMealObligation, PlannerNextProblem } from "../contracts";
import { mainFlowVocalScenario } from "./mainFlowVocalScenario";

export function participantMealA2Scenario(policy: PlannerNextProblem["searchPolicy"]): PlannerNextProblem {
  const problem = mainFlowVocalScenario();
  problem.searchPolicy = policy;
  problem.budget = { bestK: 20, maxBacktracks: 10_000, maxPatterns: 10_000, maxBranchExpansions: 300_000 };
  const meal = (sourceTaskId: string, participantId: string, window: { start: number; end: number }): ParticipantMealObligation => ({
    id: `participant-meal:${sourceTaskId}`, sourceTaskId, participantId, duration: 30, window, status: "pending",
  });
  problem.participantMeals = [
    meal("task:meal-a", "participant-a", { start: 780, end: 990 }),
    meal("task:meal-c", "participant-c", { start: 780, end: 990 }),
    meal("task:meal-e", "participant-e", { start: 780, end: 990 }),
  ];
  problem.participantMealCapacity = { maxSimultaneous: 2 };
  return problem;
}
