/** Independent operational authorities. Absence preserves conservative legacy defaults. */
export type TaskAgendaScope = "PHYSICAL_SPACE" | "ITINERANT_UNIT";
export type TaskResourceInheritance = "LOCATION" | "OPERATION_ONLY";
export interface TaskOperationScope {
  agendaScope?: TaskAgendaScope;
  resourceInheritance?: TaskResourceInheritance;
  /** Authored direct requirements, separate from a materialized unit composition. */
  declaredResourceIds?: readonly number[];
}
export interface TaskOperationPresentation extends TaskOperationScope {
  taskId: number;
  blocksSpace?: boolean;
  itinerantTeamId?: number;
  itinerantTeamRequirement?: string | null;
}

/** A selected team is not by itself an authority to move the task's agenda. */
export function usesItinerantAgenda(task: TaskOperationScope & { breakKind?: string; operationalMealScope?: string }) {
  return task.agendaScope === "ITINERANT_UNIT" || task.breakKind === "itinerant_meal" || task.operationalMealScope === "team";
}

/** Location remains intact: this projection changes no physical occupation. */
export function projectTaskOperationScopes<T extends { id: number; itinerantTeamId?: number | null }>(
  tasks: readonly T[], operations: readonly TaskOperationPresentation[] = [],
): (T & TaskOperationScope & { blocksSpace?: boolean; itinerantTeamId?: number | null })[] {
  const byId = new Map(operations.map(operation => [operation.taskId, operation]));
  return tasks.map(task => {
    const operation = byId.get(task.id);
    // A declared fixed team is authoritative. Eligible teams never imply selection.
    const fixedTeam = operation?.itinerantTeamId;
    return { ...task, agendaScope: operation?.agendaScope ?? "PHYSICAL_SPACE",
      resourceInheritance: operation?.resourceInheritance ?? "LOCATION",
      declaredResourceIds: operation?.declaredResourceIds,
      blocksSpace: operation?.blocksSpace,
      itinerantTeamId: task.itinerantTeamId ?? fixedTeam ?? null };
  });
}
