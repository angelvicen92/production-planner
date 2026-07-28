import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { participantPresenceIncrement } from "./participantPresence";
import { presencePreferenceWeight, resourcePresenceIncrement } from "./resourcePresence";
import { requiredSecondarySpaces, secondaryTasks } from "./secondaryContinuity";

export interface AuxiliaryPlacementResult {
  tasks: ScheduledTask[] | null; branches: number; secondaryBranches: number; exhausted: boolean;
  secondaryExhausted: boolean; selectionOrder: string[]; workItemSelectionOrder: string[];
  candidateCounts: Record<string, number>; blockCandidateCounts: Record<string, number>;
}
type State = { placed: ScheduledTask[]; pending: Task[]; order: string[]; workOrder: string[]; counts: Record<string, number>; blockCounts: Record<string, number>; cost: number };
type BlockCandidate = { tasks: ScheduledTask[]; cost: number };

export function placeAuxiliaryTasks(problem: PlannerNextProblem, initial: ScheduledTask[], branchAllowance: number): AuxiliaryPlacementResult {
  const required = new Set(requiredSecondarySpaces(problem).map(({ id }) => id));
  let beam: State[] = [{ placed: initial, pending: problem.tasks.filter((x) => x.kind === "auxiliary"), order: [], workOrder: [], counts: {}, blockCounts: {}, cost: 0 }];
  let branches = 0, secondaryBranches = 0;
  const failed = (secondaryExhausted: boolean, state?: State): AuxiliaryPlacementResult => ({ tasks: null, branches, secondaryBranches, exhausted: !secondaryExhausted, secondaryExhausted, selectionOrder: state?.order ?? [], workItemSelectionOrder: state?.workOrder ?? [], candidateCounts: state?.counts ?? {}, blockCandidateCounts: state?.blockCounts ?? {} });
  while (beam.length && beam[0]!.pending.length) {
    const next: State[] = [];
    for (const state of beam) {
      const individual = state.pending.filter((task) => !required.has(task.spaceId)).map((task) => ({ kind: "task" as const, key: `task:${task.id}`, duration: task.duration, resources: task.requiredResourceIds?.length ?? 0, task, starts: startsFor(problem, task, state.placed) }));
      const blocks: Array<{ kind: "space"; key: string; duration: number; resources: number; spaceId: string; candidates: BlockCandidate[] }> = [];
      for (const spaceId of [...new Set(state.pending.filter((task) => required.has(task.spaceId)).map(({ spaceId }) => spaceId))].sort()) {
        const tasks = secondaryTasks(state.pending, spaceId);
        const generated = generateBlockCandidates(problem, tasks, state.placed, branchAllowance - branches, secondaryBranches);
        secondaryBranches = generated.secondaryBranches;
        branches += generated.consumed;
        if (generated.exhausted) return failed(true, state);
        blocks.push({ kind: "space", key: `space:${spaceId}`, duration: tasks.reduce((sum, task) => sum + task.duration, 0), resources: tasks.reduce((sum, task) => sum + (task.requiredResourceIds?.length ?? 0), 0), spaceId, candidates: generated.candidates });
      }
      const choices = [...individual, ...blocks].sort((a, b) => alternatives(a) - alternatives(b) || b.duration - a.duration || b.resources - a.resources || a.key.localeCompare(b.key));
      const selected = choices[0];
      if (!selected || alternatives(selected) === 0) continue;
      if (selected.kind === "task") {
        const scored = selected.starts.map((start) => scoreTask(problem, selected.task, start, state.placed)).sort(candidateOrder);
        for (const candidate of scored) {
          if (branches >= branchAllowance) return failed(false, state);
          branches += 1;
          next.push({ placed: [...state.placed, candidate.scheduled], pending: state.pending.filter((x) => x.id !== selected.task.id), order: [...state.order, selected.task.id], workOrder: [...state.workOrder, selected.key], counts: { ...state.counts, [selected.task.id]: selected.starts.length }, blockCounts: state.blockCounts, cost: state.cost + candidate.cost });
        }
      } else {
        for (const candidate of selected.candidates) {
          const ids = new Set(candidate.tasks.map(({ id }) => id));
          next.push({ placed: [...state.placed, ...candidate.tasks], pending: state.pending.filter((x) => !ids.has(x.id)), order: [...state.order, ...candidate.tasks.map(({ id }) => id)], workOrder: [...state.workOrder, selected.key], counts: state.counts, blockCounts: { ...state.blockCounts, [selected.spaceId]: selected.candidates.length }, cost: state.cost + candidate.cost });
        }
      }
    }
    beam = next.sort((a, b) => a.cost - b.cost || signature(a.placed).localeCompare(signature(b.placed))).slice(0, problem.budget.bestK);
  }
  const result = beam[0];
  return { tasks: result?.placed ?? null, branches, secondaryBranches, exhausted: false, secondaryExhausted: false, selectionOrder: result?.order ?? [], workItemSelectionOrder: result?.workOrder ?? [], candidateCounts: result?.counts ?? {}, blockCandidateCounts: result?.blockCounts ?? {} };
}

function generateBlockCandidates(problem: PlannerNextProblem, tasks: Task[], placed: ScheduledTask[], allowance: number, priorSecondary: number): { candidates: BlockCandidate[]; consumed: number; secondaryBranches: number; exhausted: boolean } {
  let states: Array<{ tasks: ScheduledTask[]; remaining: Task[]; cost: number; start: number }> = [];
  let consumed = 0, secondaryBranches = priorSecondary;
  for (let start = problem.day.start; start < problem.day.end; start += 5) states.push({ tasks: [], remaining: tasks, cost: 0, start });
  for (let depth = 0; depth < tasks.length; depth += 1) {
    const next: typeof states = [];
    for (const state of states) for (const task of state.remaining) {
      if (consumed >= allowance) return { candidates: [], consumed, secondaryBranches, exhausted: true };
      consumed += 1; secondaryBranches += 1;
      const start = state.tasks.at(-1)?.end ?? state.start;
      if (!canPlaceTask(problem, task, start, [...placed, ...state.tasks])) continue;
      const scored = scoreTask(problem, task, start, [...placed, ...state.tasks]);
      next.push({ tasks: [...state.tasks, scored.scheduled], remaining: state.remaining.filter(({ id }) => id !== task.id), cost: state.cost + scored.cost, start: state.start });
    }
    states = next.sort((a, b) => a.cost - b.cost || signature(a.tasks).localeCompare(signature(b.tasks))).slice(0, problem.budget.bestK);
  }
  return { candidates: states.map(({ tasks: block, cost }) => ({ tasks: block, cost })).sort((a, b) => a.cost - b.cost || (b.tasks[0]?.start ?? 0) - (a.tasks[0]?.start ?? 0) || signature(a.tasks).localeCompare(signature(b.tasks))), consumed, secondaryBranches, exhausted: false };
}
function alternatives(choice: { starts?: number[]; candidates?: BlockCandidate[] }): number { return choice.starts?.length ?? choice.candidates?.length ?? 0; }
function startsFor(problem: PlannerNextProblem, task: Task, placed: ScheduledTask[]): number[] { const starts: number[] = []; for (let start = problem.day.start; start + task.duration <= problem.day.end; start += 5) if (canPlaceTask(problem, task, start, placed)) starts.push(start); return starts; }
function scoreTask(problem: PlannerNextProblem, task: Task, start: number, placed: ScheduledTask[]) { const scheduled = { ...task, start, end: start + task.duration }; const participantCost = participantPresenceIncrement(task.participantId, placed, scheduled) * presencePreferenceWeight(problem.auxiliaryPolicy?.participantPresencePreference ?? "OFF"); const resourceCost = (task.requiredResourceIds ?? []).reduce((sum, id) => { const resource = problem.resources.find((x) => x.id === id); return sum + resourcePresenceIncrement(id, placed, scheduled) * presencePreferenceWeight(resource?.presencePreference ?? "OFF"); }, 0); return { scheduled, cost: participantCost + resourceCost }; }
function candidateOrder(a: ReturnType<typeof scoreTask>, b: ReturnType<typeof scoreTask>): number { return a.cost - b.cost || a.scheduled.end - b.scheduled.end || a.scheduled.start - b.scheduled.start; }
function signature(tasks: ScheduledTask[]): string { return [...tasks].sort((a,b) => a.id.localeCompare(b.id)).map((x) => `${x.id}@${x.start}`).join("|"); }
