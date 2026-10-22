import type {
  PlannerNextProblem,
  ScheduledSetupPreparation,
  ScheduledSpaceMeal,
  ScheduledTask,
  Task,
} from "./contracts";
import type { ExactSearchLedger } from "./exactMainAndFeederCore";
import { canPlaceTask, exactTaskStartDomain } from "./placement";
import {continuityPenalty} from "./operationContinuity";
import {continuityBridgesWithinSpan,hasRequiredSecondaryContinuity} from "./secondaryContinuity";
import { scoreAuxiliaryTask } from "./placeAuxiliaryTasks";
import { eligibleSetupTasksForPolicy, setupFamilySequence } from "./setupGrouping";
import {
  createSetupPreparation,
  preparationAvoidsOccupations,
  preparationWithinAvailability,
  preparationWithinDay,
  setupPreparationDuration,
  spaceOccupations,
} from "./setupPreparation";
import { occupationAvoidsProtectedMeal } from "./spaceMeals";
import { findCanonicalPerfectMatching } from "./macroScheduling";

export interface ExactSetupBlockCandidate {
  tasks: ScheduledTask[];
  preparations: ScheduledSetupPreparation[];
  cost: number;
}

export interface ExactSetupBlockGenerationEvidence {
  branchesExplored: number;
  startsExplored: number;
  maximumDepth: number;
  completeCandidateCount: number;
  familyOrderCandidateCounts: Record<string, number>;
  matchingAttempts: number;
  matchingSuccesses: number;
  permutationBranchesAvoided: number;
}

export interface ExactSetupBlockGenerationResult {
  outcome: "COMPLETE" | "BUDGET_EXHAUSTED";
  candidates: ExactSetupBlockCandidate[];
  evidence: ExactSetupBlockGenerationEvidence;
}

export interface ExactSetupMacroDomain {
  domainSize: number;
  domainExact?: boolean;
  domainMeasure?: string;
  structuralCandidateCount?: number;
  matchingFeasibleCandidateCount?: number;
}

const byId = <T extends { id: string }>(left: T, right: T): number =>
  left.id.localeCompare(right.id);

const candidateSignature = (candidate: ExactSetupBlockCandidate): string => [
  ...candidate.tasks
    .slice()
    .sort(byId)
    .map((task) => `${task.id}@${task.start}-${task.end}`),
  ...candidate.preparations
    .slice()
    .sort(byId)
    .map((item) => `${item.id}@${item.start}-${item.end}`),
].join("|");

/**
 * Exhaustively enumerates one structured setup space under the shared exact
 * ledger. No beam, bestK truncation, fallback, or implicit order selection is
 * allowed here.
 */
export function generateExactSetupBlockCandidates(
  problem: PlannerNextProblem,
  tasks: Task[],
  placed: ScheduledTask[],
  preparations: ScheduledSetupPreparation[],
  meals: ScheduledSpaceMeal[],
  ledger: ExactSearchLedger,
  countOnly = false,
  acceptCandidate?: (candidate:ExactSetupBlockCandidate)=>boolean,
): ExactSetupBlockGenerationResult {
  const ordered = [...tasks].sort(byId);
  const spaceId = ordered[0]?.spaceId;
  const space = spaceId === undefined
    ? undefined
    : problem.spaces.find((candidate) => candidate.id === spaceId);
  const policy = space?.setupPolicy;
  const complete: ExactSetupBlockCandidate[] = [];
  const familyOrderCandidateCounts: Record<string, number> = {};
  let branchesExplored = 0;
  let startsExplored = 0;
  let maximumDepth = 0;
  let matchingAttempts = 0;
  let matchingSuccesses = 0;
  let permutationBranchesAvoided = 0;

  const finish = (
    outcome: ExactSetupBlockGenerationResult["outcome"],
  ): ExactSetupBlockGenerationResult => {
    complete.sort((left, right) =>
      left.cost - right.cost
      || (right.tasks[0]?.start ?? 0) - (left.tasks[0]?.start ?? 0)
      || candidateSignature(left).localeCompare(candidateSignature(right)));
    return {
      outcome,
      candidates: complete,
      evidence: {
        branchesExplored,
        startsExplored,
        maximumDepth,
        completeCandidateCount: Object.values(familyOrderCandidateCounts).reduce((sum, count) => sum + count, 0),
        familyOrderCandidateCounts: { ...familyOrderCandidateCounts },
        matchingAttempts,
        matchingSuccesses,
        permutationBranchesAvoided,
      },
    };
  };

  if (!spaceId || !space || !policy || ordered.length === 0
    || ordered.some((task) => task.spaceId !== spaceId
      || task.setupFamilyId === undefined&&policy.contractVersion!==2)) {
    return finish("COMPLETE");
  }

  let exhausted = false;
  // V2 extends this same setup explorer and ledger. Legacy geometry/matching
  // below remains exact for historical policies. No identity is collapsed here.
  if(policy.contractVersion===2){
    let stopped=false,preferGrouped=false;
    const emitted=new Set<string>();
    const fixedPauses=(problem.operationalMealPolicies??[]).filter(p=>p.spaceIds.includes(spaceId)&&p.duration===p.window.end-p.window.start)
      .map(p=>({id:p.id,...p.window}));
    const bridged=(cursor:number)=>{
      let end=cursor;
      for(const pause of [...fixedPauses].sort((a,b)=>a.start-b.start))if(pause.start===end)end=pause.end;
      return end;
    };
    const emit=(scheduled:ScheduledTask[],derived:ScheduledSetupPreparation[],cost:number)=>{
      const occupations=spaceOccupations(scheduled,derived,spaceId,meals);
      if(space.secondaryContinuity==="REQUIRED"&&!hasRequiredSecondaryContinuity([...occupations,...continuityBridgesWithinSpan(occupations,fixedPauses)]))return;
      const candidate={tasks:scheduled,preparations:derived,cost};
      const signature=candidateSignature(candidate);if(emitted.has(signature))return;emitted.add(signature);
      if(!countOnly)complete.push(candidate);
      const key=setupFamilySequence(scheduled).join(">");familyOrderCandidateCounts[key]=(familyOrderCandidateCounts[key]??0)+1;
      if(acceptCandidate?.(candidate))stopped=true;
    };
    const walk=(remaining:Task[],scheduled:ScheduledTask[],derived:ScheduledSetupPreparation[],cursor:number,compact:boolean,cost:number):void=>{
      if(stopped||exhausted)return;
      maximumDepth=Math.max(maximumDepth,scheduled.length);
      if(!remaining.length){emit(scheduled,derived,cost);return;}
      const orderingPolicy=preferGrouped?{...policy,groupingPolicy:"REQUIRED" as const,reentry:"FORBIDDEN" as const}:policy;
      let eligible=eligibleSetupTasksForPolicy(remaining,scheduled,orderingPolicy);
      if(compact&&orderingPolicy.groupingPolicy==="REQUIRED"&&!fixedPauses.length){
        for(const family of [...new Set(eligible.map(task=>task.setupFamilyId!))]){
          const members=remaining.filter(task=>task.setupFamilyId===family),ids=new Set(members.map(task=>task.id));
          if(new Set(members.map(task=>task.duration)).size!==1||members.some(task=>task.dependencies.some(id=>ids.has(id))))continue;
          const prior=scheduled.at(-1),prep=!prior?policy.initialPreparationMinutes:prior.setupFamilyId!==family?policy.preparationMinutesBetweenFamilies:0;
          const start=cursor+(prep??0),slots=members.map((_,index)=>String(index));
          if(!ledger.consume("STANDALONE")){exhausted=true;return;}branchesExplored+=1;matchingAttempts+=1;
          const matching=findCanonicalPerfectMatching(slots,members.map(task=>task.id),(id,slot)=>canPlaceTask(problem,members.find(task=>task.id===id)!,start+Number(slot)*members[0].duration,[...placed,...scheduled],meals));
          if(!matching)eligible=eligible.filter(task=>task.setupFamilyId!==family);else matchingSuccesses+=1;
          // A perfect matching only proves a necessary condition. Enumerate all
          // identity assignments below; future/resource distinctions remain.
        }
      }
      for(const task of eligible){
        const previous=scheduled.at(-1),changed=previous!==undefined&&previous.setupFamilyId!==task.setupFamilyId;
        const prepDuration=policy.groupingPolicy==="OFF"?undefined:!previous?policy.initialPreparationMinutes:changed?policy.preparationMinutesBetweenFamilies||undefined:undefined;
        const earliest=cursor+(prepDuration??0);
        const compactPreparationStart=bridged(cursor);
        const starts=compact?[bridged(compactPreparationStart+(prepDuration??0))]:exactTaskStartDomain(problem,task,[...placed,...scheduled],meals).starts();
        for(const start of starts){
          if(start<earliest||task.duration+start>problem.day.end)continue;
          if(!ledger.consume("STANDALONE")){exhausted=true;return;}branchesExplored+=1;
          if(!canPlaceTask(problem,task,start,[...placed,...scheduled],meals))continue;
          const entryIndex=1+scheduled.filter((item,index)=>item.setupFamilyId===task.setupFamilyId&&(index===0||scheduled[index-1].setupFamilyId!==item.setupFamilyId)).length;
          // A wait within a family does not create an entry/preparation.
          const actualEntry=previous?.setupFamilyId===task.setupFamilyId?entryIndex-1:entryIndex;
          const prepStarts=prepDuration===undefined?[undefined]:compact?[compactPreparationStart]:Array.from({length:Math.max(0,Math.floor((start-prepDuration-cursor)/5)+1)},(_,i)=>start-prepDuration-i*5);
          for(const prepStart of prepStarts){
            if(stopped||exhausted)return;
            const preparation=prepStart===undefined?undefined:createSetupPreparation(spaceId,task.setupFamilyId!,actualEntry,prepDuration!,prepStart);
            if(preparation){
              if(!ledger.consume("STANDALONE")){exhausted=true;return;}branchesExplored+=1;
              if(!preparationWithinDay(problem,preparation)||!preparationWithinAvailability(space.availability,preparation)||!occupationAvoidsProtectedMeal(problem,spaceId,preparation.start,preparation.end)
                ||!preparationAvoidsOccupations(preparation,spaceOccupations([...placed,...scheduled],[...preparations,...derived],spaceId,meals))
                ||fixedPauses.some(p=>p.start<preparation.end&&preparation.start<p.end))continue;
            }
            const scored=scoreAuxiliaryTask(problem,task,start,[...placed,...scheduled]);
            walk(remaining.filter(item=>item.id!==task.id),[...scheduled,scored.scheduled],preparation?[...derived,preparation]:derived,scored.scheduled.end,compact,cost+scored.cost);
          }
          if(stopped||exhausted)return;
        }
      }
    };
    // Compact alternatives first. Relaxed starts retain every material identity,
    // duration, permitted wait and reentry; preferences affect order/cost only.
    for(const compact of [true,false]){
      if(!compact&&space.secondaryContinuity==="REQUIRED")continue;
      // PREFERRED orders grouped alternatives first, then exposes every allowed
      // reentry. The first phase never turns the preference into a hard filter.
      for(const grouped of policy.groupingPolicy==="PREFERRED"?[true,false]:[false]){
        preferGrouped=grouped;
        for(let start=problem.day.start;start<(compact?problem.day.end:problem.day.start+1);start+=5){
          startsExplored+=1;walk(ordered,[],[],start,compact,0);
          if(stopped||exhausted)return finish(exhausted?"BUDGET_EXHAUSTED":"COMPLETE");
        }
      }
    }
    return finish("COMPLETE");
  }
  const visit = (
    canonicalStart: number,
    remaining: Task[],
    partialTasks: ScheduledTask[],
    partialPreparations: ScheduledSetupPreparation[],
    cost: number,
    depth: number,
  ): void => {
    if (exhausted) return;
    maximumDepth = Math.max(maximumDepth, depth);
    if (remaining.length === 0) {
      const candidate = {
        tasks: partialTasks,
        preparations: partialPreparations,
        cost,
      };
      if (!countOnly) complete.push(candidate);
      const key = setupFamilySequence(partialTasks).join(">");
      familyOrderCandidateCounts[key] =
        (familyOrderCandidateCounts[key] ?? 0) + 1;
      return;
    }

    const eligible = eligibleSetupTasksForPolicy(
      remaining,
      partialTasks,
      policy,
    );
    const eligibleFamilies = [...new Set(eligible.map(({ setupFamilyId }) => setupFamilyId!))].sort();
    for (const familyId of eligibleFamilies) {
      if (!ledger.consume("STANDALONE")) {
        exhausted = true;
        return;
      }
      branchesExplored += 1;
      const familyTasks = remaining.filter((task) => task.setupFamilyId === familyId).sort(byId);
      const firstOfFamily = !partialTasks.some((placedTask) => placedTask.setupFamilyId === familyId);
      const hasPriorFamily = partialTasks.some(
        (placedTask) => placedTask.setupFamilyId !== undefined,
      );
      const duration = firstOfFamily
        ? setupPreparationDuration(
          policy,
          familyId,
          hasPriorFamily,
        )
        : undefined;
      const cursor = partialTasks.at(-1)?.end ?? canonicalStart;
      const preparation = duration === undefined
        ? undefined
        : createSetupPreparation(
          spaceId,
          familyId,
          1,
          duration,
          cursor,
        );
      const start = preparation?.end ?? cursor;
      const priorTasks = [...placed, ...partialTasks];
      const priorPreparations = [
        ...preparations,
        ...partialPreparations,
      ];

      if (preparation && (
        !preparationWithinDay(problem, preparation)
        || !preparationWithinAvailability(space.availability, preparation)
        || !occupationAvoidsProtectedMeal(
          problem,
          preparation.spaceId,
          preparation.start,
          preparation.end,
        )
        || !preparationAvoidsOccupations(
          preparation,
          spaceOccupations(
            priorTasks,
            priorPreparations,
            spaceId,
            meals,
          ),
        )
      )) continue;

      const durations = [...new Set(familyTasks.map((task) => task.duration))];
      if (durations.length !== 1) continue;
      const slotIds = familyTasks.map((_task, index) => `${familyId}:${index}`);
      matchingAttempts += 1;
      const matching = findCanonicalPerfectMatching(slotIds, familyTasks.map(({ id }) => id), (taskId, slotId) => {
        const index = Number(slotId.slice(slotId.lastIndexOf(":") + 1));
        const task = familyTasks.find(({ id }) => id === taskId)!;
        return canPlaceTask(problem, task, start + index * task.duration, priorTasks, meals);
      });
      if (!matching) continue;
      const scheduledFamily = [...matching].map(([slotId, taskId]) => {
        const index = Number(slotId.slice(slotId.lastIndexOf(":") + 1));
        const task = familyTasks.find(({ id }) => id === taskId)!;
        return scoreAuxiliaryTask(problem, task, start + index * task.duration, priorTasks).scheduled;
      }).sort((a, b) => a.start - b.start || byId(a, b));
      if (scheduledFamily.some((task) => !canPlaceTask(problem, task, task.start,
        [...priorTasks, ...scheduledFamily.filter(({ id }) => id !== task.id)], meals))) continue;
      matchingSuccesses += 1;
      permutationBranchesAvoided += Math.max(0, familyTasks.length - 1);
      visit(
        canonicalStart,
        remaining.filter((task) => task.setupFamilyId !== familyId),
        [...partialTasks, ...scheduledFamily],
        preparation
          ? [...partialPreparations, preparation]
          : partialPreparations,
        cost + scheduledFamily.reduce((sum, task) => sum + scoreAuxiliaryTask(problem,
          familyTasks.find(({ id }) => id === task.id)!, task.start, priorTasks).cost, 0),
        depth + scheduledFamily.length,
      );
      if (exhausted) return;
    }
  };

  for (
    let canonicalStart = problem.day.start;
    canonicalStart < problem.day.end;
    canonicalStart += 5
  ) {
    startsExplored += 1;
    visit(canonicalStart, ordered, [], [], 0, 0);
    if (exhausted) return finish("BUDGET_EXHAUSTED");
  }
  return finish("COMPLETE");
}

/** Legacy exact projection; v2 uses an analytic upper bound, never an unbudgeted enumeration. */
export function probeExactSetupMacroDomain(
  problem: PlannerNextProblem,
  tasks: Task[],
  placed: ScheduledTask[],
  preparations: ScheduledSetupPreparation[],
  meals: ScheduledSpaceMeal[],
): ExactSetupMacroDomain {
  if(tasks.some(task=>problem.spaces.find(space=>space.id===task.spaceId)?.setupPolicy?.contractVersion===2)){
    const counts=tasks.map(task=>exactTaskStartDomain(problem,task,placed,meals).eligibleStartCount);
    const upper=counts.reduce((product,count)=>Math.min(Number.MAX_SAFE_INTEGER,product*count),1);
    return {domainSize:upper,domainExact:false,domainMeasure:"independent-task-domain-product-upper-bound"};
  }
  const ledger: ExactSearchLedger = {
    limit: Number.POSITIVE_INFINITY, branchesExplored: 0, coreBranches: 0,
    standaloneBranches: 0, lastExhaustionPhase: null, consume: () => true,
  };
  const result = generateExactSetupBlockCandidates(problem, tasks, placed, preparations, meals, ledger, true);
  return { domainSize: result.evidence.completeCandidateCount,
    structuralCandidateCount: result.evidence.startsExplored,
    matchingFeasibleCandidateCount: result.evidence.completeCandidateCount };
}
