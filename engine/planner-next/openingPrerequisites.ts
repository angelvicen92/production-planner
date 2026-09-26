import type { PlannerNextProblem, Task } from "./contracts";

/**
 * Domain classification shared by Assisted projection and pipeline construction.
 * An entry prerequisite is identified exclusively from the transport/dependency
 * graph: it is participant-local, depends on that participant's ARRIVAL and is
 * itself a direct prerequisite of Main.
 */
export interface OpeningPrerequisiteBundle {
  readonly participantId: string;
  readonly arrival: Task;
  readonly entry: Task;
  readonly main: Task;
}

export function openingPrerequisiteBundles(problem: Readonly<PlannerNextProblem>): readonly OpeningPrerequisiteBundle[] {
  const arrivals = new Set(problem.transportPolicy?.arrival.taskIds ?? []);
  const byId = new Map(problem.tasks.map(task => [task.id, task]));
  return problem.tasks
    .filter(main => main.kind === "main" && main.participantId !== undefined)
    .flatMap(main => main.dependencies.flatMap(entryId => {
      const entry = byId.get(entryId);
      if (!entry || entry.kind !== "auxiliary" || entry.participantId !== main.participantId) return [];
      const arrival = entry.dependencies.map(id => byId.get(id)).find((task): task is Task =>
        task !== undefined && arrivals.has(task.id) && task.participantId === main.participantId);
      return arrival ? [{ participantId: main.participantId!, arrival, entry, main }] : [];
    }))
    .sort((left, right) => left.participantId.localeCompare(right.participantId)
      || left.main.id.localeCompare(right.main.id));
}
