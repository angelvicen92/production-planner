import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { participantPresenceIncrement } from "./participantPresence";
import { presencePreferenceWeight, resourcePresenceIncrement } from "./resourcePresence";

export interface AuxiliaryPlacementResult { tasks: ScheduledTask[] | null; branches: number; exhausted: boolean; selectionOrder: string[]; candidateCounts: Record<string, number> }
export function placeAuxiliaryTasks(problem: PlannerNextProblem, initial: ScheduledTask[], branchAllowance: number): AuxiliaryPlacementResult {
  const pending = problem.tasks.filter((x) => x.kind === "auxiliary");
  let beam = [{ placed: initial, pending, order: [] as string[], counts: {} as Record<string, number>, cost: 0 }];
  let branches = 0;
  while (beam.length && beam[0]!.pending.length) {
    const next: typeof beam = [];
    for (const state of beam) {
      const choices = state.pending.map((task) => ({ task, starts: startsFor(problem, task, state.placed) }))
        .sort((a, b) => a.starts.length - b.starts.length || b.task.duration - a.task.duration
          || (b.task.requiredResourceIds?.length ?? 0) - (a.task.requiredResourceIds?.length ?? 0) || a.task.id.localeCompare(b.task.id));
      const selected = choices[0];
      if (!selected || selected.starts.length === 0) continue;
      const scored = selected.starts.map((start) => {
        const scheduled = { ...selected.task, start, end: start + selected.task.duration };
        const participantWeight = presencePreferenceWeight(problem.auxiliaryPolicy?.participantPresencePreference ?? "OFF");
        const participantCost = participantPresenceIncrement(selected.task.participantId, state.placed, scheduled) * participantWeight;
        const resourceCost = (selected.task.requiredResourceIds ?? []).reduce((sum, id) => {
          const resource = problem.resources.find((x) => x.id === id);
          return sum + resourcePresenceIncrement(id, state.placed, scheduled) * presencePreferenceWeight(resource?.presencePreference ?? "OFF");
        }, 0);
        return { scheduled, cost: participantCost + resourceCost };
      }).sort((a, b) => a.cost - b.cost || a.scheduled.end - b.scheduled.end || a.scheduled.start - b.scheduled.start);
      for (const candidate of scored) {
        if (branches >= branchAllowance) return { tasks: null, branches, exhausted: true, selectionOrder: state.order, candidateCounts: state.counts };
        branches += 1;
        next.push({ placed: [...state.placed, candidate.scheduled], pending: state.pending.filter((x) => x.id !== selected.task.id),
          order: [...state.order, selected.task.id], counts: { ...state.counts, [selected.task.id]: selected.starts.length }, cost: state.cost + candidate.cost });
      }
    }
    beam = next.sort((a, b) => a.cost - b.cost || signature(a.placed).localeCompare(signature(b.placed))).slice(0, problem.budget.bestK);
  }
  const result = beam[0];
  return { tasks: result?.placed ?? null, branches, exhausted: false, selectionOrder: result?.order ?? [], candidateCounts: result?.counts ?? {} };
}
function startsFor(problem: PlannerNextProblem, task: Task, placed: ScheduledTask[]): number[] {
  const starts: number[] = [];
  for (let start = problem.day.start; start + task.duration <= problem.day.end; start += 5) if (canPlaceTask(problem, task, start, placed)) starts.push(start);
  return starts;
}
function signature(tasks: ScheduledTask[]): string { return [...tasks].sort((a,b) => a.id.localeCompare(b.id)).map((x) => `${x.id}@${x.start}`).join("|"); }
