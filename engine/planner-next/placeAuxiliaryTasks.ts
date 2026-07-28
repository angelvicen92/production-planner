import type { PlannerNextProblem, ScheduledSetupPreparation, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { participantPresenceIncrement } from "./participantPresence";
import { presencePreferenceWeight, resourcePresenceIncrement } from "./resourcePresence";
import { requiredSecondarySpaces, secondaryTasks } from "./secondaryContinuity";
import { assessFutureFeasibility, type FutureBudget } from "./futureFeasibility";
import { eligibleSetupTasks } from "./setupGrouping";
import { createSetupPreparation, preparationAvoidsMeal, preparationAvoidsOccupations, preparationWithinAvailability, preparationWithinDay, setupPreparationDuration, spaceOccupations } from "./setupPreparation";
import { jointGroupIds, jointGroupMembers, jointGroupStarts, jointResources, jointWorkItemKey, scheduleJointGroup } from "./jointTasks";

export interface AuxiliaryPlacementResult {
  tasks: ScheduledTask[] | null; preparations: ScheduledSetupPreparation[]; branches: number; secondaryBranches: number; exhausted: boolean;
  secondaryExhausted: boolean; selectionOrder: string[]; workItemSelectionOrder: string[];
  candidateCounts: Record<string, number>; technicalCandidateCounts: Record<string, number>; blockCandidateCounts: Record<string, number>; futureExhausted: boolean; futureChecks: number; futureBranches: number; futurePruned: number; futureTopPruned: number; blockers: Record<string, number>; acceptedMinimum: number;
  jointCandidateCounts: Record<string,number>;
}
type State = { placed: ScheduledTask[]; preparations: ScheduledSetupPreparation[]; pending: Task[]; order: string[]; workOrder: string[]; counts: Record<string, number>; jointCounts:Record<string,number>; blockCounts: Record<string, number>; cost: number; futureMin: number; futureTotal: number; pathMin: number };
export type AuxiliaryStateRankingInput = Pick<State, "placed" | "cost">;

export function compareAuxiliaryStates(a: AuxiliaryStateRankingInput, b: AuxiliaryStateRankingInput): number {
  return a.cost - b.cost || signature(a.placed).localeCompare(signature(b.placed));
}
type BlockCandidate = { tasks: ScheduledTask[]; preparations: ScheduledSetupPreparation[]; cost: number };
export interface BlockConstructionDiagnostics { startsExplored: number; expansions: number; completeCandidatesGenerated: number; maximumPartialStatesPerStart: number }
export interface BlockConstructionResult { candidates: BlockCandidate[]; consumed: number; secondaryBranches: number; exhausted: boolean; diagnostics: BlockConstructionDiagnostics }

export function placeAuxiliaryTasks(problem: PlannerNextProblem, initial: ScheduledTask[], branchAllowance: number): AuxiliaryPlacementResult {
  const required = new Set(requiredSecondarySpaces(problem).map(({ id }) => id));
  let beam: State[] = [{ placed: initial, preparations: [], pending: problem.tasks.filter((x) => x.kind === "auxiliary" || x.kind === "technical"), order: [], workOrder: [], counts: {}, jointCounts:{}, blockCounts: {}, cost: 0, futureMin: 0, futureTotal: 0, pathMin: Number.POSITIVE_INFINITY }];
  // branches is the shared logical total; secondaryBranches and futureBranches classify disjoint probes.
  let branches = 0, secondaryBranches = 0, futureChecks = 0, futureBranches = 0, futurePruned = 0, futureTopPruned = 0;
  const blockers: Record<string, number> = {};
  let futureExhausted = false;
  const countsFor = (state: State | undefined, kind: "auxiliary" | "technical") => Object.fromEntries(Object.entries(state?.counts ?? {}).filter(([id]) => problem.tasks.find((task) => task.id === id)?.kind === kind));
  const failed = (secondaryExhausted: boolean, state?: State): AuxiliaryPlacementResult => ({ tasks: null, preparations: [], branches, secondaryBranches, exhausted: !secondaryExhausted, secondaryExhausted, selectionOrder: state?.order ?? [], workItemSelectionOrder: state?.workOrder ?? [], candidateCounts: countsFor(state, "auxiliary"), technicalCandidateCounts: countsFor(state, "technical"), jointCandidateCounts:state?.jointCounts??{}, blockCandidateCounts: state?.blockCounts ?? {}, futureExhausted, futureChecks, futureBranches, futurePruned, futureTopPruned, blockers, acceptedMinimum: 0 });
  function forward(added: ScheduledTask[], addedPreparations: ScheduledSetupPreparation[], addedCost: number, key: string, taskId: string | undefined, state: State, next: State[], taskCount?: number, block?: {spaceId:string; count:number}, top = false, joint?:{id:string;count:number}): boolean {
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
    next.push({placed,preparations:[...state.preparations,...addedPreparations],pending,order:[...state.order,...added.map(x=>x.id)],workOrder:[...state.workOrder,key],counts:taskId?{...state.counts,[taskId]:taskCount??0}:state.counts,jointCounts:joint?{...state.jointCounts,[joint.id]:joint.count}:state.jointCounts,blockCounts:block?{...state.blockCounts,[block.spaceId]:block.count}:state.blockCounts,cost:state.cost+addedCost,futureMin:min,futureTotal:total,pathMin:pending.length?Math.min(state.pathMin,min):state.pathMin}); return true;
  }
  while (beam.length && beam[0]!.pending.length) {
    const next: State[] = [];
    for (const state of beam) {
      const individual = state.pending.filter((task) => !required.has(task.spaceId) && task.jointGroupId===undefined).map((task) => ({ kind: "task" as const, key: `task:${task.id}`, duration: task.duration, resources: task.requiredResourceIds?.length ?? 0, task, starts: startsFor(problem, task, state.placed) }));
      const joints=jointGroupIds(state.pending).map(id=>{const tasks=jointGroupMembers(state.pending,id);return {kind:"joint" as const,key:jointWorkItemKey(id),id,tasks,duration:tasks[0]?.duration??0,resources:jointResources(tasks).length,starts:jointGroupStarts(problem,tasks,state.placed)}});
      const blocks: Array<{ kind: "space"; key: string; duration: number; resources: number; spaceId: string; candidates: BlockCandidate[]; alternativeCount: number }> = [];
      for (const spaceId of [...new Set(state.pending.filter((task) => required.has(task.spaceId)).map(({ spaceId }) => spaceId))].sort()) {
        const tasks = secondaryTasks(state.pending, spaceId);
        const generated = generateBlockCandidates(problem, tasks, state.placed, branchAllowance - branches, secondaryBranches);
        secondaryBranches = generated.secondaryBranches;
        branches += generated.consumed;
        if (generated.exhausted) return failed(true, state);
        blocks.push({ kind: "space", key: `space:${spaceId}`, duration: tasks.reduce((sum, task) => sum + task.duration, 0), resources: tasks.reduce((sum, task) => sum + (task.requiredResourceIds?.length ?? 0), 0), spaceId, candidates: generated.candidates, alternativeCount: Math.min(generated.candidates.length, problem.budget.bestK) });
      }
      const choices = [...individual, ...joints, ...blocks].sort((a, b) => alternatives(a) - alternatives(b) || b.duration - a.duration || b.resources - a.resources || a.key.localeCompare(b.key));
      const selected = choices[0];
      if (!selected || alternatives(selected) === 0) continue;
      if (selected.kind === "task") {
        const scored = selected.starts.map((start) => scoreTask(problem, selected.task, start, state.placed)).sort(candidateOrder);
        for (const candidate of scored) {
          if (branches >= branchAllowance) return failed(false, state);
          branches += 1;
          if (!forward([candidate.scheduled], [], candidate.cost, selected.key, selected.task.id, state, next, selected.starts.length, undefined, scored[0] === candidate)) return failed(false, state);
        }
        next.splice(0, next.length, ...next.sort(compareAuxiliaryStates).slice(0, problem.budget.bestK));
      } else if(selected.kind==="joint") {
        for(const start of selected.starts){if(branches>=branchAllowance)return failed(false,state);branches+=1;const added=scheduleJointGroup(selected.tasks,start);const cost=scoreJoint(problem,added,state.placed);if(!forward(added,[],cost,selected.key,undefined,state,next,undefined,undefined,selected.starts[0]===start,{id:selected.id,count:selected.starts.length}))return failed(false,state);}
        next.splice(0,next.length,...next.sort(compareAuxiliaryStates).slice(0,problem.budget.bestK));
      } else {
        for (const candidate of selected.candidates) {
          if (!forward(candidate.tasks, candidate.preparations, candidate.cost, selected.key, undefined, state, next, undefined, { spaceId: selected.spaceId, count: selected.candidates.length }, selected.candidates[0] === candidate)) return failed(false, state);
        }
      }
    }
    beam = next.sort(compareAuxiliaryStates).slice(0, problem.budget.bestK);
  }
  const result = beam[0];
  return { tasks: result?.placed ?? null, preparations: result?.preparations ?? [], branches, secondaryBranches, exhausted: false, secondaryExhausted: false, selectionOrder: result?.order ?? [], workItemSelectionOrder: result?.workOrder ?? [], candidateCounts: countsFor(result, "auxiliary"), technicalCandidateCounts: countsFor(result, "technical"), jointCandidateCounts:result?.jointCounts??{}, blockCandidateCounts: result?.blockCounts ?? {}, futureExhausted, futureChecks, futureBranches, futurePruned, futureTopPruned, blockers, acceptedMinimum: result && Number.isFinite(result.pathMin) ? result.pathMin : 0 };
}

function probeBlock(problem: PlannerNextProblem, tasks: Task[], placed: ScheduledTask[], budget: FutureBudget, limit: number): {count:number; exhausted:boolean} {
  const generated = generateBlockCandidates(problem,tasks,placed,budget.remaining,0,"PROBE",limit);
  budget.remaining -= generated.consumed;
  return {count:generated.candidates.length,exhausted:generated.exhausted};
}

export function generateBlockCandidates(problem: PlannerNextProblem, tasks: Task[], placed: ScheduledTask[], allowance: number, priorSecondary = 0, mode: "SEARCH" | "PROBE" = "SEARCH", probeLimit = 1): BlockConstructionResult {
  type Partial = { tasks: ScheduledTask[]; preparations: ScheduledSetupPreparation[]; remaining: Task[]; cost: number; start: number };
  const complete: BlockCandidate[] = [];
  let consumed = 0, secondaryBranches = priorSecondary, startsExplored = 0, maximumPartialStatesPerStart = 0;
  const diagnostics = (): BlockConstructionDiagnostics => ({ startsExplored, expansions: consumed, completeCandidatesGenerated: complete.length, maximumPartialStatesPerStart });
  const finish = (exhausted: boolean): BlockConstructionResult => ({ candidates: complete, consumed, secondaryBranches, exhausted, diagnostics: diagnostics() });
  const orderedTasks = [...tasks].sort((a,b)=>a.id.localeCompare(b.id));
  for (let canonicalStart = problem.day.start; canonicalStart < problem.day.end; canonicalStart += 5) {
    startsExplored += 1;
    let states: Partial[] = [{ tasks: [], preparations: [], remaining: orderedTasks, cost: 0, start: canonicalStart }];
    maximumPartialStatesPerStart = Math.max(maximumPartialStatesPerStart, states.length);
    for (let depth = 0; depth < orderedTasks.length; depth += 1) {
      const next: Partial[] = [];
      for (const state of states) for (const task of (() => {
        const policy = problem.spaces.find((space) => space.id === taskSpace(tasks))?.setupPolicy;
        return policy ? eligibleSetupTasks(state.remaining, policy.familyOrder) : state.remaining;
      })()) {
        if (consumed >= allowance) return finish(true);
        consumed += 1;
        if (mode === "SEARCH") secondaryBranches += 1;
        const policy = problem.spaces.find((space) => space.id === task.spaceId)?.setupPolicy;
        const firstOfFamily = !state.tasks.some((placedTask) => placedTask.setupFamilyId === task.setupFamilyId);
        const duration = task.setupFamilyId && firstOfFamily ? setupPreparationDuration(policy, task.setupFamilyId) : undefined;
        const preparation = duration === undefined ? undefined : createSetupPreparation(task.spaceId, task.setupFamilyId!, 1, duration, state.tasks.at(-1)?.end ?? state.start);
        const start = preparation?.end ?? state.tasks.at(-1)?.end ?? state.start;
        const space = problem.spaces.find((candidate) => candidate.id === task.spaceId);
        if (preparation && (!space || !preparationWithinDay(problem, preparation) || !preparationWithinAvailability(space.availability, preparation) || !preparationAvoidsMeal(problem.protectedMeal, preparation) || !preparationAvoidsOccupations(preparation, spaceOccupations([...placed, ...state.tasks], state.preparations, task.spaceId)))) continue;
        if (!canPlaceTask(problem, task, start, [...placed, ...state.tasks])) continue;
        const scored = scoreTask(problem, task, start, [...placed, ...state.tasks]);
        next.push({ tasks: [...state.tasks, scored.scheduled], preparations: preparation ? [...state.preparations, preparation] : state.preparations, remaining: state.remaining.filter(({ id }) => id !== task.id), cost: state.cost + scored.cost, start: state.start });
      }
      states = next.sort((a, b) => a.cost - b.cost || signature(a.tasks).localeCompare(signature(b.tasks))).slice(0, problem.budget.bestK);
      maximumPartialStatesPerStart = Math.max(maximumPartialStatesPerStart, states.length);
      if (!states.length) break;
    }
    for (const state of states) if (state.remaining.length === 0) {
      complete.push({tasks:state.tasks,preparations:state.preparations,cost:state.cost});
      if (mode === "PROBE" && complete.length >= probeLimit) return finish(false);
    }
  }
  complete.sort((a, b) => a.cost - b.cost || (b.tasks[0]?.start ?? 0) - (a.tasks[0]?.start ?? 0) || signature(a.tasks).localeCompare(signature(b.tasks)));
  return finish(false);
}
function taskSpace(tasks: Task[]): string | undefined { return tasks[0]?.spaceId; }
function alternatives(choice: { starts?: number[]; candidates?: BlockCandidate[]; alternativeCount?: number }): number { return choice.starts?.length ?? choice.alternativeCount ?? choice.candidates?.length ?? 0; }
function startsFor(problem: PlannerNextProblem, task: Task, placed: ScheduledTask[]): number[] { const starts: number[] = []; for (let start = problem.day.start; start + task.duration <= problem.day.end; start += 5) if (canPlaceTask(problem, task, start, placed)) starts.push(start); return starts; }
function scoreTask(problem: PlannerNextProblem, task: Task, start: number, placed: ScheduledTask[]) { const scheduled = { ...task, start, end: start + task.duration }; const participantCost = participantPresenceIncrement(task.participantId, placed, scheduled) * presencePreferenceWeight(problem.auxiliaryPolicy?.participantPresencePreference ?? "OFF"); const resourceCost = (task.requiredResourceIds ?? []).reduce((sum, id) => { const resource = problem.resources.find((x) => x.id === id); return sum + resourcePresenceIncrement(id, placed, scheduled) * presencePreferenceWeight(resource?.presencePreference ?? "OFF"); }, 0); return { scheduled, cost: participantCost + resourceCost }; }
function scoreJoint(problem:PlannerNextProblem,tasks:ScheduledTask[],placed:ScheduledTask[]):number { const participant=tasks.reduce((sum,t)=>sum+participantPresenceIncrement(t.participantId,placed,t)*presencePreferenceWeight(problem.auxiliaryPolicy?.participantPresencePreference??"OFF"),0); const first=tasks[0]; return participant+(first?.requiredResourceIds??[]).reduce((sum,id)=>{const r=problem.resources.find(x=>x.id===id);return sum+resourcePresenceIncrement(id,placed,first!)*presencePreferenceWeight(r?.presencePreference??"OFF")},0); }
function candidateOrder(a: ReturnType<typeof scoreTask>, b: ReturnType<typeof scoreTask>): number { return a.cost - b.cost || a.scheduled.end - b.scheduled.end || a.scheduled.start - b.scheduled.start; }
function signature(tasks: ScheduledTask[]): string { return [...tasks].sort((a,b) => a.id.localeCompare(b.id)).map((x) => `${x.id}@${x.start}`).join("|"); }
