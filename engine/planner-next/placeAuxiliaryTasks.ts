import type { PlannerNextProblem, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { participantPresenceIncrement } from "./participantPresence";
import { presencePreferenceWeight, resourcePresenceIncrement } from "./resourcePresence";
import { requiredSecondarySpaces, secondaryTasks } from "./secondaryContinuity";
import { assessFutureFeasibility, type FutureBudget } from "./futureFeasibility";

export interface AuxiliaryPlacementResult {
  tasks: ScheduledTask[] | null; branches: number; secondaryBranches: number; exhausted: boolean;
  secondaryExhausted: boolean; selectionOrder: string[]; workItemSelectionOrder: string[];
  candidateCounts: Record<string, number>; blockCandidateCounts: Record<string, number>; futureExhausted: boolean; futureChecks: number; futureBranches: number; futurePruned: number; futureTopPruned: number; blockers: Record<string, number>; acceptedMinimum: number;
}
type State = { placed: ScheduledTask[]; pending: Task[]; order: string[]; workOrder: string[]; counts: Record<string, number>; blockCounts: Record<string, number>; cost: number; futureMin: number; futureTotal: number; pathMin: number };
type BlockCandidate = { tasks: ScheduledTask[]; cost: number };

export function placeAuxiliaryTasks(problem: PlannerNextProblem, initial: ScheduledTask[], branchAllowance: number): AuxiliaryPlacementResult {
  const required = new Set(requiredSecondarySpaces(problem).map(({ id }) => id));
  let beam: State[] = [{ placed: initial, pending: problem.tasks.filter((x) => x.kind === "auxiliary"), order: [], workOrder: [], counts: {}, blockCounts: {}, cost: 0, futureMin: 0, futureTotal: 0, pathMin: Number.POSITIVE_INFINITY }];
  // branches is the shared logical total; secondaryBranches and futureBranches classify disjoint probes.
  let branches = 0, secondaryBranches = 0, futureChecks = 0, futureBranches = 0, futurePruned = 0, futureTopPruned = 0;
  const blockers: Record<string, number> = {};
  let futureExhausted = false;
  const failed = (secondaryExhausted: boolean, state?: State): AuxiliaryPlacementResult => ({ tasks: null, branches, secondaryBranches, exhausted: !secondaryExhausted, secondaryExhausted, selectionOrder: state?.order ?? [], workItemSelectionOrder: state?.workOrder ?? [], candidateCounts: state?.counts ?? {}, blockCandidateCounts: state?.blockCounts ?? {}, futureExhausted, futureChecks, futureBranches, futurePruned, futureTopPruned, blockers, acceptedMinimum: 0 });
  function forward(added: ScheduledTask[], addedCost: number, key: string, taskId: string | undefined, state: State, next: State[], taskCount?: number, block?: {spaceId:string; count:number}, top = false): boolean {
    const ids = new Set(added.map(x=>x.id)); const placed = [...state.placed, ...added]; const pending = state.pending.filter(x=>!ids.has(x.id));
    let min=0,total=0;
    if (pending.length) {
      futureChecks += 1; const budget: FutureBudget = { remaining: branchAllowance - branches };
      const assessment = assessFutureFeasibility(problem, placed, pending, budget, (tasks, p, b, limit) => probeBlock(problem, tasks, p, b, limit));
      branches += assessment.branchesConsumed; futureBranches += assessment.branchesConsumed;
      if (assessment.exhausted) { futureExhausted = true; return false; }
      if (!assessment.feasible) { futurePruned += 1; if(top) futureTopPruned += 1; for(const blocker of assessment.blockingWorkItemKeys) blockers[blocker]=(blockers[blocker]??0)+1; return true; }
      min=assessment.minimumAlternativeCount; total=assessment.totalAlternativeCount;
    }
    next.push({placed,pending,order:[...state.order,...added.map(x=>x.id)],workOrder:[...state.workOrder,key],counts:taskId?{...state.counts,[taskId]:taskCount??0}:state.counts,blockCounts:block?{...state.blockCounts,[block.spaceId]:block.count}:state.blockCounts,cost:state.cost+addedCost,futureMin:min,futureTotal:total,pathMin:pending.length?Math.min(state.pathMin,min):state.pathMin}); return true;
  }
  while (beam.length && beam[0]!.pending.length) {
    const next: State[] = [];
    for (const state of beam) {
      const individual = state.pending.filter((task) => !required.has(task.spaceId)).map((task) => ({ kind: "task" as const, key: `task:${task.id}`, duration: task.duration, resources: task.requiredResourceIds?.length ?? 0, task, starts: startsFor(problem, task, state.placed) }));
      const blocks: Array<{ kind: "space"; key: string; duration: number; resources: number; spaceId: string; candidates: BlockCandidate[]; alternativeCount: number }> = [];
      for (const spaceId of [...new Set(state.pending.filter((task) => required.has(task.spaceId)).map(({ spaceId }) => spaceId))].sort()) {
        const tasks = secondaryTasks(state.pending, spaceId);
        const generated = generateBlockCandidates(problem, tasks, state.placed, branchAllowance - branches, secondaryBranches);
        secondaryBranches = generated.secondaryBranches;
        branches += generated.consumed;
        if (generated.exhausted) return failed(true, state);
        blocks.push({ kind: "space", key: `space:${spaceId}`, duration: tasks.reduce((sum, task) => sum + task.duration, 0), resources: tasks.reduce((sum, task) => sum + (task.requiredResourceIds?.length ?? 0), 0), spaceId, candidates: generated.candidates, alternativeCount: Math.min(generated.candidates.length, problem.budget.bestK) });
      }
      const choices = [...individual, ...blocks].sort((a, b) => alternatives(a) - alternatives(b) || b.duration - a.duration || b.resources - a.resources || a.key.localeCompare(b.key));
      const selected = choices[0];
      if (!selected || alternatives(selected) === 0) continue;
      if (selected.kind === "task") {
        const scored = selected.starts.map((start) => scoreTask(problem, selected.task, start, state.placed)).sort(candidateOrder);
        for (const candidate of scored) {
          if (branches >= branchAllowance) return failed(false, state);
          branches += 1;
          if (!forward([candidate.scheduled], candidate.cost, selected.key, selected.task.id, state, next, selected.starts.length, undefined, scored[0] === candidate)) return failed(false, state);
        }
      } else {
        for (const candidate of selected.candidates) {
          if (!forward(candidate.tasks, candidate.cost, selected.key, undefined, state, next, undefined, { spaceId: selected.spaceId, count: selected.candidates.length }, selected.candidates[0] === candidate)) return failed(false, state);
        }
      }
    }
    beam = next.sort((a, b) => a.cost - b.cost || (futurePruned > 0 ? b.futureMin - a.futureMin || b.futureTotal - a.futureTotal : 0) || signature(a.placed).localeCompare(signature(b.placed))).slice(0, problem.budget.bestK);
  }
  const result = beam[0];
  return { tasks: result?.placed ?? null, branches, secondaryBranches, exhausted: false, secondaryExhausted: false, selectionOrder: result?.order ?? [], workItemSelectionOrder: result?.workOrder ?? [], candidateCounts: result?.counts ?? {}, blockCandidateCounts: result?.blockCounts ?? {}, futureExhausted, futureChecks, futureBranches, futurePruned, futureTopPruned, blockers, acceptedMinimum: result && Number.isFinite(result.pathMin) ? result.pathMin : 0 };
}

function probeBlock(problem: PlannerNextProblem, tasks: Task[], placed: ScheduledTask[], budget: FutureBudget, limit: number): {count:number; exhausted:boolean} {
  const generated = generateBlockCandidates(problem,tasks,placed,budget.remaining,0,"PROBE",limit);
  budget.remaining -= generated.consumed;
  return {count:generated.candidates.length,exhausted:generated.exhausted};
}

function generateBlockCandidates(problem: PlannerNextProblem, tasks: Task[], placed: ScheduledTask[], allowance: number, priorSecondary: number, mode: "SEARCH" | "PROBE" = "SEARCH", probeLimit = 1): { candidates: BlockCandidate[]; consumed: number; secondaryBranches: number; exhausted: boolean } {
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
    states = next.sort((a, b) => a.cost - b.cost || signature(a.tasks).localeCompare(signature(b.tasks)));
  }
  const complete = states.map(({ tasks: block, cost }) => ({ tasks: block, cost })).sort((a, b) => a.cost - b.cost || (b.tasks[0]?.start ?? 0) - (a.tasks[0]?.start ?? 0) || signature(a.tasks).localeCompare(signature(b.tasks)));
  return { candidates: mode === "PROBE" ? complete.slice(0, probeLimit) : complete, consumed, secondaryBranches, exhausted: false };
}
function alternatives(choice: { starts?: number[]; candidates?: BlockCandidate[]; alternativeCount?: number }): number { return choice.starts?.length ?? choice.alternativeCount ?? choice.candidates?.length ?? 0; }
function startsFor(problem: PlannerNextProblem, task: Task, placed: ScheduledTask[]): number[] { const starts: number[] = []; for (let start = problem.day.start; start + task.duration <= problem.day.end; start += 5) if (canPlaceTask(problem, task, start, placed)) starts.push(start); return starts; }
function scoreTask(problem: PlannerNextProblem, task: Task, start: number, placed: ScheduledTask[]) { const scheduled = { ...task, start, end: start + task.duration }; const participantCost = participantPresenceIncrement(task.participantId, placed, scheduled) * presencePreferenceWeight(problem.auxiliaryPolicy?.participantPresencePreference ?? "OFF"); const resourceCost = (task.requiredResourceIds ?? []).reduce((sum, id) => { const resource = problem.resources.find((x) => x.id === id); return sum + resourcePresenceIncrement(id, placed, scheduled) * presencePreferenceWeight(resource?.presencePreference ?? "OFF"); }, 0); return { scheduled, cost: participantCost + resourceCost }; }
function candidateOrder(a: ReturnType<typeof scoreTask>, b: ReturnType<typeof scoreTask>): number { return a.cost - b.cost || a.scheduled.end - b.scheduled.end || a.scheduled.start - b.scheduled.start; }
function signature(tasks: ScheduledTask[]): string { return [...tasks].sort((a,b) => a.id.localeCompare(b.id)).map((x) => `${x.id}@${x.start}`).join("|"); }
