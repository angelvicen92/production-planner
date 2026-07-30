import type { PlannerNextProblem, ScheduledSetupPreparation, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask } from "./placement";
import { occupationAvoidsProtectedMeal } from "./spaceMeals";
import { participantPresenceIncrement } from "./participantPresence";
import { presencePreferenceWeight, resourcePresenceIncrement } from "./resourcePresence";
import { requiredSecondarySpaces, secondaryTasks } from "./secondaryContinuity";
import { assessFutureFeasibility, type FutureBudget } from "./futureFeasibility";
import { eligibleSetupTasks } from "./setupGrouping";
import { createSetupPreparation, preparationAvoidsMeal, preparationAvoidsOccupations, preparationWithinAvailability, preparationWithinDay, setupPreparationDuration, spaceOccupations } from "./setupPreparation";
import { jointGroupIds, jointGroupMembers, jointGroupStarts, jointResources, jointWorkItemKey, scheduleJointGroup } from "./jointTasks";
import { canPlaceSpaceMeal, createScheduledSpaceMeal, isRequiredBlockMealSpace, pendingSpaceMealIds, spaceMealCandidateStarts, spaceMealPolicy } from "./spaceMeals";
import { generateTechnicalChainCandidates, getTechnicalChains, technicalChainProductiveDuration, technicalChainResourceIds, technicalChainWorkItemKey } from "./technicalChains";
import { constructSaturatedResourceWindowBlockCandidates, deriveSaturatedResourceWindowBlocks } from "./saturatedResourceWindowBlock";

export interface AuxiliaryPlacementResult {
  tasks: ScheduledTask[] | null; preparations: ScheduledSetupPreparation[]; meals:ScheduledSpaceMeal[]; branches: number; secondaryBranches: number; exhausted: boolean;
  secondaryExhausted: boolean; selectionOrder: string[]; workItemSelectionOrder: string[];
  candidateCounts: Record<string, number>; technicalCandidateCounts: Record<string, number>; blockCandidateCounts: Record<string, number>; futureExhausted: boolean; futureChecks: number; futureBranches: number; futurePruned: number; futureTopPruned: number; blockers: Record<string, number>; acceptedMinimum: number;
  jointCandidateCounts: Record<string,number>; technicalChainCandidateCounts:Record<string,number>; technicalChainBranches:number; mealCandidateCounts:Record<string,number>; spaceMealBranches:number;
  saturatedBlockCount:number; saturatedBlockPlannedCount:number; saturatedBlockBranches:number; saturatedCandidateCounts:Record<string,number>; saturatedTaskIds:Record<string,string[]>; saturatedResourceIds:Record<string,string[]>; saturatedStarts:Record<string,number>; saturatedEnds:Record<string,number>; saturatedSelectedOrders:Record<string,string[]>;
}
type State = { placed: ScheduledTask[]; preparations: ScheduledSetupPreparation[]; meals:ScheduledSpaceMeal[]; pending: Task[]; order: string[]; workOrder: string[]; counts: Record<string, number>; mealCounts:Record<string,number>; jointCounts:Record<string,number>; chainCounts:Record<string,number>; blockCounts: Record<string, number>; saturatedCounts:Record<string,number>; saturatedOrders:Record<string,string[]>; cost: number; futureMin: number; futureTotal: number; pathMin: number };
export type AuxiliaryStateRankingInput = Pick<State, "placed" | "cost">;

export function compareAuxiliaryStates(a: AuxiliaryStateRankingInput, b: AuxiliaryStateRankingInput): number {
  return a.cost - b.cost || signature(a.placed).localeCompare(signature(b.placed));
}
export type BlockCandidate = { tasks: ScheduledTask[]; preparations: ScheduledSetupPreparation[]; meals:ScheduledSpaceMeal[]; cost: number };
export interface BlockConstructionDiagnostics { startsExplored: number; expansions: number; completeCandidatesGenerated: number; maximumPartialStatesPerStart: number; mealAttemptsExplored?:number; completeCandidatesWithMeal?:number }
export interface BlockConstructionResult { candidates: BlockCandidate[]; consumed: number; secondaryBranches: number; exhausted: boolean; diagnostics: BlockConstructionDiagnostics }

export function placeAuxiliaryTasks(problem: PlannerNextProblem, initial: ScheduledTask[], branchAllowance: number, initialMeals: ScheduledSpaceMeal[] = []): AuxiliaryPlacementResult {
  const required = new Set(requiredSecondarySpaces(problem).map(({ id }) => id));
  const initiallyPlaced=new Set(initial.map(x=>x.id));
  let beam: State[] = [{ placed: initial, preparations: [], meals:[...initialMeals], pending: problem.tasks.filter((x) => (x.kind === "auxiliary" || x.kind === "technical")&&!initiallyPlaced.has(x.id)), order: [], workOrder: [], counts: {}, mealCounts:{}, jointCounts:{}, chainCounts:{}, blockCounts: {}, saturatedCounts:{}, saturatedOrders:{}, cost: 0, futureMin: 0, futureTotal: 0, pathMin: Number.POSITIVE_INFINITY }];
  // branches is the shared logical total; secondaryBranches and futureBranches classify disjoint probes.
  let branches = 0, secondaryBranches = 0, technicalChainBranches=0, spaceMealBranches=0, saturatedBlockBranches=0, futureChecks = 0, futureBranches = 0, futurePruned = 0, futureTopPruned = 0;
  const initialSaturatedBlocks=deriveSaturatedResourceWindowBlocks(problem,problem.tasks,initial);
  const blockers: Record<string, number> = {};
  let futureExhausted = false;
  const countsFor = (state: State | undefined, kind: "auxiliary" | "technical") => Object.fromEntries(Object.entries(state?.counts ?? {}).filter(([id]) => problem.tasks.find((task) => task.id === id)?.kind === kind));
  const saturatedEvidence=(state?:State)=>({saturatedBlockCount:initialSaturatedBlocks.length,saturatedBlockPlannedCount:Object.keys(state?.saturatedOrders??{}).length,saturatedBlockBranches,saturatedCandidateCounts:state?.saturatedCounts??{},saturatedTaskIds:Object.fromEntries(initialSaturatedBlocks.map(b=>[b.key,b.taskIds])),saturatedResourceIds:Object.fromEntries(initialSaturatedBlocks.map(b=>[b.key,b.resourceIds])),saturatedStarts:Object.fromEntries(initialSaturatedBlocks.map(b=>[b.key,b.window.start])),saturatedEnds:Object.fromEntries(initialSaturatedBlocks.map(b=>[b.key,b.window.end])),saturatedSelectedOrders:state?.saturatedOrders??{}});
  const failed = (secondaryExhausted: boolean, state?: State): AuxiliaryPlacementResult => ({ tasks: null, preparations: [], meals:[], branches, secondaryBranches, technicalChainBranches, spaceMealBranches, exhausted: !secondaryExhausted, secondaryExhausted, selectionOrder: state?.order ?? [], workItemSelectionOrder: state?.workOrder ?? [], candidateCounts: countsFor(state, "auxiliary"), technicalCandidateCounts: countsFor(state, "technical"), technicalChainCandidateCounts:state?.chainCounts??{}, jointCandidateCounts:state?.jointCounts??{}, mealCandidateCounts:state?.mealCounts??{}, blockCandidateCounts: state?.blockCounts ?? {}, futureExhausted, futureChecks, futureBranches, futurePruned, futureTopPruned, blockers, acceptedMinimum: 0,...saturatedEvidence(state) });
  function forward(added: ScheduledTask[], addedPreparations: ScheduledSetupPreparation[], addedCost: number, key: string, taskId: string | undefined, state: State, next: State[], taskCount?: number, block?: {spaceId:string; count:number}, top = false, joint?:{id:string;count:number},chain?:{id:string;count:number},addedMeals:ScheduledSpaceMeal[]=[],saturated?:{key:string;count:number;order:string[]}): boolean {
    const ids = new Set(added.map(x=>x.id)); const placed = [...state.placed, ...added]; const meals=[...state.meals,...addedMeals]; const pending = state.pending.filter(x=>!ids.has(x.id));
    let min=0,total=0;
    if (pending.length || pendingSpaceMealIds(problem,meals).length) {
      futureChecks += 1; const budget: FutureBudget = { remaining: branchAllowance - branches };
      const assessment = assessFutureFeasibility(problem, placed, pending, budget, (tasks, p, b, limit) => probeBlock(problem, tasks, p, b, limit, meals,(secondary,meal)=>{secondaryBranches+=secondary;spaceMealBranches+=meal}), meals);
      branches += assessment.branchesConsumed; futureBranches += assessment.branchesConsumed;
      if (assessment.exhausted) { futureExhausted = true; return false; }
      if (!assessment.feasible) { futurePruned += 1; if(top) futureTopPruned += 1; for(const blocker of assessment.blockingWorkItemKeys) blockers[blocker]=(blockers[blocker]??0)+1; return true; }
      min=assessment.minimumAlternativeCount; total=assessment.totalAlternativeCount;
    }
    next.push({placed,meals,preparations:[...state.preparations,...addedPreparations],pending,order:[...state.order,...added.map(x=>x.id)],workOrder:[...state.workOrder,key],mealCounts:state.mealCounts,counts:taskId?{...state.counts,[taskId]:taskCount??0}:state.counts,jointCounts:joint?{...state.jointCounts,[joint.id]:joint.count}:state.jointCounts,chainCounts:chain?{...state.chainCounts,[chain.id]:chain.count}:state.chainCounts,blockCounts:block?{...state.blockCounts,[block.spaceId]:block.count}:state.blockCounts,saturatedCounts:saturated?{...state.saturatedCounts,[saturated.key]:saturated.count}:state.saturatedCounts,saturatedOrders:saturated?{...state.saturatedOrders,[saturated.key]:saturated.order}:state.saturatedOrders,cost:state.cost+addedCost,futureMin:min,futureTotal:total,pathMin:pending.length||pendingSpaceMealIds(problem,meals).length?Math.min(state.pathMin,min):state.pathMin}); return true;
  }
  while (beam.length && (beam[0]!.pending.length || pendingSpaceMealIds(problem,beam[0]!.meals).length)) {
    const next: State[] = [];
    for (const state of beam) {
      const saturatedBlocks=deriveSaturatedResourceWindowBlocks(problem,state.pending,state.placed);
      const saturatedIds=new Set(saturatedBlocks.flatMap(block=>block.taskIds));
      const saturated=saturatedBlocks.map(block=>{const generated=constructSaturatedResourceWindowBlockCandidates(problem,block,state.placed,branchAllowance-branches);branches+=generated.branchesExplored;saturatedBlockBranches+=generated.branchesExplored;return {kind:"saturated" as const,key:block.key,duration:block.window.end-block.window.start,resources:block.resourceIds.length,block,candidates:generated.candidates.map(candidate=>({tasks:candidate.tasks,preparations:[],meals:[],cost:0,order:candidate.order})),alternativeCount:generated.candidates.length,exhausted:generated.exhausted};});
      if(saturated.some(item=>item.exhausted))return failed(false,state);
      const chainTasks=getTechnicalChains(state.pending), chainIds=new Set(chainTasks.flat().map(t=>t.id));
      const individual = state.pending.filter((task) => !saturatedIds.has(task.id) && !chainIds.has(task.id) && !required.has(task.spaceId) && task.jointGroupId===undefined).map((task) => ({ kind: "task" as const, key: `task:${task.id}`, duration: task.duration, resources: task.requiredResourceIds?.length ?? 0, task, starts: startsFor(problem, task, state.placed,state.meals) }));
      const chains=chainTasks.map(tasks=>{const root=tasks[0]!;const generated=generateTechnicalChainCandidates(problem,tasks,state.placed,branchAllowance-branches);branches+=generated.consumed;technicalChainBranches+=generated.consumed;if(generated.exhausted)return {kind:"chain" as const,key:technicalChainWorkItemKey(root.id),rootId:root.id,duration:technicalChainProductiveDuration(tasks),resources:technicalChainResourceIds(tasks).length,candidates:[],alternativeCount:0,exhausted:true};return {kind:"chain" as const,key:technicalChainWorkItemKey(root.id),rootId:root.id,duration:technicalChainProductiveDuration(tasks),resources:technicalChainResourceIds(tasks).length,candidates:generated.candidates,alternativeCount:generated.candidates.length,exhausted:false};});
      if(chains.some(x=>x.exhausted))return failed(false,state);
      const joints=jointGroupIds(state.pending).map(id=>{const tasks=jointGroupMembers(state.pending,id);return {kind:"joint" as const,key:jointWorkItemKey(id),id,tasks,duration:tasks[0]?.duration??0,resources:jointResources(tasks).length,starts:jointGroupStarts(problem,tasks,state.placed)}});
      const blocks: Array<{ kind: "space"; key: string; duration: number; resources: number; spaceId: string; candidates: BlockCandidate[]; alternativeCount: number }> = [];
      for (const spaceId of [...new Set(state.pending.filter((task) => required.has(task.spaceId)).map(({ spaceId }) => spaceId))].sort()) {
        const tasks = secondaryTasks(state.pending, spaceId);
        const generated = generateBlockCandidates(problem, tasks, state.placed, branchAllowance - branches, secondaryBranches,"SEARCH",1,state.meals);
        secondaryBranches = generated.secondaryBranches;
        spaceMealBranches += generated.diagnostics.mealAttemptsExplored ?? 0;
        branches += generated.consumed;
        if (generated.exhausted) return failed(true, state);
        blocks.push({ kind: "space", key: `space:${spaceId}`, duration: tasks.reduce((sum, task) => sum + task.duration, 0), resources: tasks.reduce((sum, task) => sum + (task.requiredResourceIds?.length ?? 0), 0), spaceId, candidates: generated.candidates, alternativeCount: Math.min(generated.candidates.length, problem.budget.bestK) });
      }
      const mealChoices=pendingSpaceMealIds(problem,state.meals).map(spaceId=>{const starts=spaceMealCandidateStarts(problem,spaceId,state.placed,state.meals);return {kind:"meal" as const,key:`meal:${spaceId}`,spaceId,duration:spaceMealPolicy(problem,spaceId)!.duration,resources:0,starts}});
      const choices = [...individual, ...joints, ...blocks, ...chains,...mealChoices,...saturated].sort((a, b) => alternatives(a) - alternatives(b) || b.duration - a.duration || b.resources - a.resources || a.key.localeCompare(b.key));
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
      } else if(selected.kind==="meal") {
        for(const start of selected.starts){if(branches>=branchAllowance)return failed(false,state);branches+=1;spaceMealBranches+=1;const meal=createScheduledSpaceMeal(selected.spaceId,start,selected.duration);const ns={...state,meals:[...state.meals,meal],workOrder:[...state.workOrder,selected.key],mealCounts:{...state.mealCounts,[selected.spaceId]:selected.starts.length}};let min=0,total=0;const pendingMeals=pendingSpaceMealIds(problem,ns.meals);if(state.pending.length||pendingMeals.length){futureChecks+=1;const budget={remaining:branchAllowance-branches};const a=assessFutureFeasibility(problem,state.placed,state.pending,budget,(tasks,p,b,l)=>probeBlock(problem,tasks,p,b,l,ns.meals,(secondary,mealAttempts)=>{secondaryBranches+=secondary;spaceMealBranches+=mealAttempts}),ns.meals);branches+=a.branchesConsumed;futureBranches+=a.branchesConsumed;if(a.exhausted){futureExhausted=true;return failed(false,state)}if(!a.feasible){futurePruned+=1;for(const blocker of a.blockingWorkItemKeys)blockers[blocker]=(blockers[blocker]??0)+1;continue}min=a.minimumAlternativeCount;total=a.totalAlternativeCount}next.push({...ns,futureMin:min,futureTotal:total,pathMin:state.pending.length||pendingMeals.length?Math.min(state.pathMin,min):state.pathMin})}
        next.splice(0,next.length,...next.sort(compareAuxiliaryStates).slice(0,problem.budget.bestK));
      } else if(selected.kind==="joint") {
        for(const start of selected.starts){if(branches>=branchAllowance)return failed(false,state);branches+=1;const added=scheduleJointGroup(selected.tasks,start);const cost=scoreJoint(problem,added,state.placed);if(!forward(added,[],cost,selected.key,undefined,state,next,undefined,undefined,selected.starts[0]===start,{id:selected.id,count:selected.starts.length}))return failed(false,state);}
        next.splice(0,next.length,...next.sort(compareAuxiliaryStates).slice(0,problem.budget.bestK));
      } else if(selected.kind==="chain") {
        for(const candidate of selected.candidates)if(!forward(candidate.tasks,[],candidate.cost,selected.key,undefined,state,next,undefined,undefined,selected.candidates[0]===candidate,undefined,{id:selected.rootId,count:selected.candidates.length}))return failed(false,state);
        next.splice(0,next.length,...next.sort(compareAuxiliaryStates).slice(0,problem.budget.bestK));
      } else if(selected.kind==="saturated") {
        for(const candidate of selected.candidates)if(!forward(candidate.tasks,[],candidate.cost,selected.key,undefined,state,next,undefined,undefined,selected.candidates[0]===candidate,undefined,undefined,[],{key:selected.key,count:selected.candidates.length,order:candidate.order}))return failed(false,state);
        next.splice(0,next.length,...next.sort(compareAuxiliaryStates).slice(0,problem.budget.bestK));
      } else {
        for (const candidate of selected.candidates) {
          if (!forward(candidate.tasks, candidate.preparations, candidate.cost, selected.key, undefined, state, next, undefined, { spaceId: selected.spaceId, count: selected.candidates.length }, selected.candidates[0] === candidate,undefined,undefined,candidate.meals)) return failed(false, state);
        }
      }
    }
    beam = next.sort(compareAuxiliaryStates).slice(0, problem.budget.bestK);
  }
  const result = beam[0];
  return { tasks: result?.placed ?? null, preparations: result?.preparations ?? [], meals:result?.meals??[], branches, secondaryBranches, technicalChainBranches, spaceMealBranches, exhausted: false, secondaryExhausted: false, selectionOrder: result?.order ?? [], workItemSelectionOrder: result?.workOrder ?? [], candidateCounts: countsFor(result, "auxiliary"), technicalCandidateCounts: countsFor(result, "technical"), technicalChainCandidateCounts:result?.chainCounts??{}, jointCandidateCounts:result?.jointCounts??{}, mealCandidateCounts:result?.mealCounts??{}, blockCandidateCounts: result?.blockCounts ?? {}, futureExhausted, futureChecks, futureBranches, futurePruned, futureTopPruned, blockers, acceptedMinimum: result && Number.isFinite(result.pathMin) ? result.pathMin : 0,...saturatedEvidence(result) };
}

function probeBlock(problem: PlannerNextProblem, tasks: Task[], placed: ScheduledTask[], budget: FutureBudget, limit: number, meals:ScheduledSpaceMeal[]=[], classify?:(secondary:number,meal:number)=>void): {count:number; exhausted:boolean} {
  const generated = generateBlockCandidates(problem,tasks,placed,budget.remaining,0,"PROBE",limit,meals);
  classify?.(generated.secondaryBranches,generated.diagnostics.mealAttemptsExplored??0);
  budget.remaining -= generated.consumed;
  return {count:generated.candidates.length,exhausted:generated.exhausted};
}

export function generateBlockCandidates(problem: PlannerNextProblem, tasks: Task[], placed: ScheduledTask[], allowance: number, priorSecondary = 0, mode: "SEARCH" | "PROBE" = "SEARCH", probeLimit = 1, existingMeals:ScheduledSpaceMeal[]=[]): BlockConstructionResult {
  const spaceId=taskSpace(tasks);
  if(spaceId&&isRequiredBlockMealSpace(problem,spaceId))return generateRequiredMealBlockCandidates(problem,tasks,placed,allowance,priorSecondary,mode,probeLimit,existingMeals);
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
        if (preparation && (!space || !preparationWithinDay(problem, preparation) || !preparationWithinAvailability(space.availability, preparation) || !occupationAvoidsProtectedMeal(problem,preparation.spaceId,preparation.start,preparation.end) || !preparationAvoidsOccupations(preparation, spaceOccupations([...placed, ...state.tasks], state.preparations, task.spaceId)))) continue;
        if (!canPlaceTask(problem, task, start, [...placed, ...state.tasks])) continue;
        const scored = scoreTask(problem, task, start, [...placed, ...state.tasks]);
        next.push({ tasks: [...state.tasks, scored.scheduled], preparations: preparation ? [...state.preparations, preparation] : state.preparations, remaining: state.remaining.filter(({ id }) => id !== task.id), cost: state.cost + scored.cost, start: state.start });
      }
      states = next.sort((a, b) => a.cost - b.cost || signature(a.tasks).localeCompare(signature(b.tasks))).slice(0, problem.budget.bestK);
      maximumPartialStatesPerStart = Math.max(maximumPartialStatesPerStart, states.length);
      if (!states.length) break;
    }
    for (const state of states) if (state.remaining.length === 0) {
      complete.push({tasks:state.tasks,preparations:state.preparations,meals:[],cost:state.cost});
      if (mode === "PROBE" && complete.length >= probeLimit) return finish(false);
    }
  }
  complete.sort((a, b) => a.cost - b.cost || (b.tasks[0]?.start ?? 0) - (a.tasks[0]?.start ?? 0) || signature(a.tasks).localeCompare(signature(b.tasks)));
  return finish(false);
}

function generateRequiredMealBlockCandidates(problem:PlannerNextProblem,tasks:Task[],placed:ScheduledTask[],allowance:number,priorSecondary:number,mode:"SEARCH"|"PROBE",probeLimit:number,existingMeals:ScheduledSpaceMeal[]):BlockConstructionResult{
  type Partial={tasks:ScheduledTask[];preparations:ScheduledSetupPreparation[];meals:ScheduledSpaceMeal[];remaining:Task[];mealPlaced:boolean;cost:number;cursor:number};
  const spaceId=taskSpace(tasks)! , policy=spaceMealPolicy(problem,spaceId)! , ordered=[...tasks].sort((a,b)=>a.id.localeCompare(b.id)),complete:BlockCandidate[]=[];
  let consumed=0,secondaryBranches=priorSecondary,startsExplored=0,maximumPartialStatesPerStart=0,mealAttemptsExplored=0;
  const diagnostics=():BlockConstructionDiagnostics=>({startsExplored,expansions:consumed,completeCandidatesGenerated:complete.length,maximumPartialStatesPerStart,mealAttemptsExplored,completeCandidatesWithMeal:complete.length});
  const finish=(exhausted:boolean):BlockConstructionResult=>({candidates:complete.sort(blockCandidateOrder).slice(0,mode==="PROBE"?probeLimit:problem.budget.bestK),consumed,secondaryBranches,exhausted,diagnostics:diagnostics()});
  const stateSignature=(s:Partial)=>`${signature(s.tasks)}|${s.meals.map(m=>`${m.id}:${m.start}-${m.end}`).sort().join("|")}|${s.cursor}|${s.mealPlaced}`;
  for(let canonicalStart=problem.day.start;canonicalStart<problem.day.end;canonicalStart+=5){
    startsExplored+=1;const totalDuration=ordered.reduce((sum,task)=>sum+task.duration,policy.duration),space=problem.spaces.find(candidate=>candidate.id===spaceId);if(!space?.availability.some(window=>window.start<=canonicalStart&&canonicalStart+totalDuration<=window.end))continue;let states:Partial[]=[{tasks:[],preparations:[],meals:[],remaining:ordered,mealPlaced:false,cost:0,cursor:canonicalStart}];maximumPartialStatesPerStart=Math.max(maximumPartialStatesPerStart,states.length);
    for(let depth=0;depth<ordered.length+1;depth+=1){const next:Partial[]=[];
      for(const state of states){const operations:Array<["task",Task]|["meal",undefined]>=[];for(const task of state.remaining)operations.push(["task",task]);if(!state.mealPlaced)operations.push(["meal",undefined]);
        operations.sort((a,b)=>a[0].localeCompare(b[0])||(a[1]?.id??"").localeCompare(b[1]?.id??""));
        for(const [kind,task] of operations){if(consumed>=allowance)return finish(true);consumed+=1;secondaryBranches+=1;
          let candidate:Partial;
          if(kind==="meal"){mealAttemptsExplored+=1;if(!canPlaceSpaceMeal(problem,spaceId,state.cursor,[...placed,...state.tasks],[...existingMeals,...state.meals]))continue;const meal=createScheduledSpaceMeal(spaceId,state.cursor,policy.duration);candidate={...state,meals:[meal],mealPlaced:true,cursor:meal.end};}
          else {const start=state.cursor;if(!task||!canPlaceTask(problem,task,start,[...placed,...state.tasks],[...existingMeals,...state.meals]))continue;const scored=scoreTask(problem,task,start,[...placed,...state.tasks]);candidate={...state,tasks:[...state.tasks,scored.scheduled],remaining:state.remaining.filter(x=>x.id!==task.id),cost:state.cost+scored.cost,cursor:scored.scheduled.end};}
          if(!candidate.remaining.length&&candidate.mealPlaced&&candidate.meals.length===1){complete.push({tasks:candidate.tasks,preparations:[],meals:candidate.meals,cost:candidate.cost});if(mode==="PROBE"&&complete.length>=probeLimit)return finish(false);}
          else next.push(candidate);
        }
      }
      states=next.sort((a,b)=>a.cost-b.cost||stateSignature(a).localeCompare(stateSignature(b))).slice(0,problem.budget.bestK);maximumPartialStatesPerStart=Math.max(maximumPartialStatesPerStart,states.length);if(!states.length)break;
    }
  }
  return finish(false);
}
function blockCandidateOrder(a:BlockCandidate,b:BlockCandidate):number{return a.cost-b.cost||`${signature(a.tasks)}|${a.meals.map(m=>`${m.id}:${m.start}-${m.end}`).sort().join("|")}`.localeCompare(`${signature(b.tasks)}|${b.meals.map(m=>`${m.id}:${m.start}-${m.end}`).sort().join("|")}`)}
function taskSpace(tasks: Task[]): string | undefined { return tasks[0]?.spaceId; }
function alternatives(choice: { starts?: number[]; candidates?: BlockCandidate[]; alternativeCount?: number }): number { return choice.starts?.length ?? choice.alternativeCount ?? choice.candidates?.length ?? 0; }
function startsFor(problem: PlannerNextProblem, task: Task, placed: ScheduledTask[], meals:ScheduledSpaceMeal[]=[]): number[] { const starts: number[] = []; for (let start = problem.day.start; start + task.duration <= problem.day.end; start += 5) if (canPlaceTask(problem, task, start, placed,meals)) starts.push(start); return starts; }
function scoreTask(problem: PlannerNextProblem, task: Task, start: number, placed: ScheduledTask[]) { const scheduled = { ...task, start, end: start + task.duration }; const participantCost = participantPresenceIncrement(task.participantId, placed, scheduled) * presencePreferenceWeight(problem.auxiliaryPolicy?.participantPresencePreference ?? "OFF"); const resourceCost = (task.requiredResourceIds ?? []).reduce((sum, id) => { const resource = problem.resources.find((x) => x.id === id); return sum + resourcePresenceIncrement(id, placed, scheduled) * presencePreferenceWeight(resource?.presencePreference ?? "OFF"); }, 0); return { scheduled, cost: participantCost + resourceCost }; }
function scoreJoint(problem:PlannerNextProblem,tasks:ScheduledTask[],placed:ScheduledTask[]):number { const participant=tasks.reduce((sum,t)=>sum+participantPresenceIncrement(t.participantId,placed,t)*presencePreferenceWeight(problem.auxiliaryPolicy?.participantPresencePreference??"OFF"),0); const first=tasks[0]; return participant+(first?.requiredResourceIds??[]).reduce((sum,id)=>{const r=problem.resources.find(x=>x.id===id);return sum+resourcePresenceIncrement(id,placed,first!)*presencePreferenceWeight(r?.presencePreference??"OFF")},0); }
function candidateOrder(a: ReturnType<typeof scoreTask>, b: ReturnType<typeof scoreTask>): number { return a.cost - b.cost || a.scheduled.end - b.scheduled.end || a.scheduled.start - b.scheduled.start; }
function signature(tasks: ScheduledTask[]): string { return [...tasks].sort((a,b) => a.id.localeCompare(b.id)).map((x) => `${x.id}@${x.start}`).join("|"); }
