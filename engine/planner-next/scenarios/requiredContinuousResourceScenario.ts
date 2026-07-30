import type { PlannerNextProblem, ScheduledSpaceMeal, ScheduledTask, Task } from "../contracts";
import { mainFlowMealScenario } from "./mainFlowMealScenario";

export type RequiredContinuousResourceVariant = "FEASIBLE_CONTIGUOUS" | "FEASIBLE_WITH_AUTHORIZED_MEAL" | "SPLIT_INVALID" | "IMPOSSIBLE_ATOMIC" | "MULTIPLE_REQUIRED_RESOURCES";
const all = [{ start: 540, end: 900 }];

export function requiredContinuousResourceScenario(variant: RequiredContinuousResourceVariant): PlannerNextProblem {
  if (variant === "FEASIBLE_WITH_AUTHORIZED_MEAL") {
    const problem = mainFlowMealScenario();
    problem.resources.push({ id: "resource-one", availability: [{ ...problem.day }], presencePreference: "MAXIMUM", presenceConcentrationPolicy: "REQUIRED", assignedSpaceId: problem.mainFlow.spaceId });
    for (const task of problem.tasks) if (task.kind === "main") (task.requiredResourceIds ??= []).push("resource-one");
    return problem;
  }
  const ids = variant === "MULTIPLE_REQUIRED_RESOURCES" ? ["a", "b", "c", "d"] : ["a", "b", "c"];
  const impossible = variant === "IMPOSSIBLE_ATOMIC";
  const tasks: Task[] = ids.flatMap((id, index) => {
    const requiredResourceIds = id === "b" && (variant === "SPLIT_INVALID" || impossible) ? []
      : variant === "MULTIPLE_REQUIRED_RESOURCES" && id === "b" ? ["resource-one", "resource-two"]
      : variant === "MULTIPLE_REQUIRED_RESOURCES" ? [index < 3 ? "resource-one" : "resource-two"] : ["resource-one"];
    return [
      { id: `feed-${id}`, kind: "vocal", participantId: id, coachId: "coach", duration: 15, spaceId: "feed-room", dependencies: [] },
      { id: `main-${id}`, kind: "main", participantId: id, coachId: "coach", blockKey: "coach", duration: 15, spaceId: "main", dependencies: [`feed-${id}`], requiredResourceIds },
    ];
  });
  if (impossible) {
    // Fixed participant windows force resource/non-resource/resource in the only main order.
    const windows = [[540, 620], [540, 700], [540, 780]];
    return base(tasks, ids.map((id, i) => ({ id, availability: [{ start: windows[i]![0], end: windows[i]![1] }] })));
  }
  const problem = base(tasks, ids.map((id) => ({ id, availability: all })));
  if (variant === "MULTIPLE_REQUIRED_RESOURCES") problem.resources.push({ id: "resource-two", availability: all, presencePreference: "MAXIMUM", presenceConcentrationPolicy: "REQUIRED", assignedSpaceId: "main" });
  return problem;
}

function base(tasks: Task[], participants: PlannerNextProblem["participants"]): PlannerNextProblem {
  return {
    day: { start: 540, end: 900 }, protectedMeal: { start: 840, end: 900 },
    spaces: [{ id: "main", availability: all }, { id: "feed-room", availability: all }],
    resources: [{ id: "resource-one", availability: all, presencePreference: "MAXIMUM", presenceConcentrationPolicy: "REQUIRED", assignedSpaceId: "main" }],
    participants, coaches: [{ id: "coach", availability: all }], tasks,
    mainFlow: { spaceId: "main", preferredEnd: 840, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 5, resourceTransitionMinutes: 15,
    budget: { bestK: 20, maxBacktracks: 20, maxPatterns: 100, maxBranchExpansions: 50_000 },
  };
}

export function dividedRequiredSchedule(problem: PlannerNextProblem): { tasks: ScheduledTask[]; meals: ScheduledSpaceMeal[] } {
  const mains = ["main-a", "main-b", "main-c"].map((id) => problem.tasks.find((t) => t.id === id)!);
  return { tasks: mains.map((task, i) => ({ ...task, dependencies: [], start: 795 + i * 15, end: 810 + i * 15 })) as ScheduledTask[], meals: [] };
}
