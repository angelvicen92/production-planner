import type { PlannerNextProblem, Task } from "../contracts";
import { mainFlowVocalScenario } from "./mainFlowVocalScenario";

/** NEXT-006 adds long auxiliary work without introducing a domain-specific task type. */
export function longSecondaryBlockScenario(): PlannerNextProblem {
  const problem = mainFlowVocalScenario();
  const all = [{ ...problem.day }];
  problem.spaces.push(
    { id: "long-form-room", availability: all, secondaryContinuity: "REQUIRED" },
    { id: "flexible-room", availability: all },
  );
  const auxiliary: Task[] = [
    { id: "a-flexible-short-1", kind: "auxiliary", participantId: "participant-g", duration: 5, spaceId: "flexible-room", dependencies: [] },
    { id: "b-flexible-short-2", kind: "auxiliary", participantId: "participant-h", duration: 5, spaceId: "flexible-room", dependencies: [] },
    { id: "z-long-1", kind: "auxiliary", participantId: "participant-c", duration: 30, spaceId: "long-form-room", dependencies: [] },
    { id: "y-long-2", kind: "auxiliary", participantId: "participant-d", duration: 30, spaceId: "long-form-room", dependencies: [] },
    { id: "x-long-3", kind: "auxiliary", participantId: "participant-e", duration: 30, spaceId: "long-form-room", dependencies: [] },
    { id: "w-long-4", kind: "auxiliary", participantId: "participant-f", duration: 30, spaceId: "long-form-room", dependencies: [] },
  ];
  problem.tasks.push(...auxiliary);
  problem.auxiliaryPolicy = { participantPresencePreference: "HIGH" };
  problem.budget.bestK = 20;
  problem.budget.maxBranchExpansions = 500_000;
  return problem;
}
