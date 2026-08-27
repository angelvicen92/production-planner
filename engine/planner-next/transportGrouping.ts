import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Task, TransportGroupingPolicy } from "./contracts";
import { canPlaceTask, exactStartDomainFromIntervals, exactTaskStartDomain, intersectExactStartIntervals, type ExactStartInterval } from "./placement";

export type TransportDirection = "arrival" | "departure";
export type TransportGroupingExplorerMode = "LEGACY_COMBINATIONS_FULL_GRID" | "EXACT_LAZY_ANALYTIC";

export interface TransportGroupingExplorerEvidence {
  transportGroupMembershipPartialsExpanded: number;
  transportGroupMembershipCandidatesEvaluated: number;
  transportGroupMembershipDomainPrunes: number;
  transportGroupResidualCapacityPrunes: number;
  transportGroupFullGridStarts: number;
  transportGroupAnalyticEligibleStarts: number;
  transportGroupAnalyticallyEliminatedStarts: number;
  transportGroupStartsEvaluated: number;
  transportGroupCompleteGroupsYielded: number;
  transportGroupBacktracks: number;
  transportGroupMaximumDepth: number;
}

export const emptyTransportGroupingExplorerEvidence=():TransportGroupingExplorerEvidence=>({
  transportGroupMembershipPartialsExpanded:0,transportGroupMembershipCandidatesEvaluated:0,
  transportGroupMembershipDomainPrunes:0,transportGroupResidualCapacityPrunes:0,
  transportGroupFullGridStarts:0,transportGroupAnalyticEligibleStarts:0,
  transportGroupAnalyticallyEliminatedStarts:0,transportGroupStartsEvaluated:0,
  transportGroupCompleteGroupsYielded:0,transportGroupBacktracks:0,transportGroupMaximumDepth:0,
});

const byId = (left: Task, right: Task): number => left.id.localeCompare(right.id);

export function transportTaskIds(problem: Readonly<PlannerNextProblem>): ReadonlySet<string> {
  return new Set(problem.transportPolicy
    ? [...problem.transportPolicy.arrival.taskIds, ...problem.transportPolicy.departure.taskIds]
    : []);
}

export function transportDirectionForTask(
  problem: Readonly<PlannerNextProblem>,
  taskId: string,
): TransportDirection | undefined {
  if (problem.transportPolicy?.arrival.taskIds.includes(taskId)) return "arrival";
  if (problem.transportPolicy?.departure.taskIds.includes(taskId)) return "departure";
  return undefined;
}

function combinations<T>(values: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  const result: T[][] = [];
  for (let index = 0; index <= values.length - size; index += 1) {
    const value = values[index]!;
    for (const tail of combinations(values.slice(index + 1), size - 1)) result.push([value, ...tail]);
  }
  return result;
}

export function canPartitionTransportCount(count: number, minimum: number, maximum: number): boolean {
  if (count === 0) return true;
  const minimumGroups = Math.ceil(count / maximum);
  const maximumGroups = Math.floor(count / minimum);
  return minimumGroups <= maximumGroups;
}

/** Canonical candidate groups containing the first remaining task; no invalid residual is emitted. */
export function transportGroupCandidates(
  tasks: readonly Task[],
  policy: Readonly<TransportGroupingPolicy>,
): Task[][] {
  const ordered = [...tasks].sort(byId);
  const [first, ...rest] = ordered;
  if (!first) return [];
  const sizes = Array.from(
    { length: Math.min(policy.maximumGroupSize, ordered.length) - policy.minimumGroupSize + 1 },
    (_, index) => policy.minimumGroupSize + index,
  ).filter((size) => canPartitionTransportCount(ordered.length - size, policy.minimumGroupSize, policy.maximumGroupSize));
  if (policy.groupingWeight > 0) sizes.sort((left, right) => right - left);
  return sizes.flatMap((size) => combinations(rest, size - 1).map((tail) => [first, ...tail]));
}

export function scheduleTransportGroup(tasks: readonly Task[], start: number): ScheduledTask[] {
  return [...tasks].sort(byId).map((task) => ({ ...task, start, end: start + task.duration }));
}

export function canPlaceTransportGroup(
  problem: PlannerNextProblem,
  tasks: readonly Task[],
  start: number,
  placed: readonly ScheduledTask[],
  previousGroupStarts: readonly number[],
  policy: Readonly<TransportGroupingPolicy>,
): boolean {
  const first = tasks[0];
  return first !== undefined
    && tasks.every((task) => task.duration === first.duration)
    && new Set(tasks.map((task) => task.participantId)).size === tasks.length
    && previousGroupStarts.every((other) => Math.abs(start - other) >= policy.minGapMinutes)
    && tasks.every((task) => task.dependencies.every((dependencyId) => {
      const dependency = placed.find(({ id }) => id === dependencyId);
      return dependency !== undefined && dependency.end <= start;
    }))
    // Each member is checked against all external occupations. Members deliberately do not
    // become external occupations for one another because the synchronized group is one operation.
    && tasks.every((task) => canPlaceTask(problem, task, start, [...placed]));
}

export function transportGroupStarts(
  problem: PlannerNextProblem,
  tasks: readonly Task[],
  placed: readonly ScheduledTask[],
  previousGroupStarts: readonly number[],
  policy: Readonly<TransportGroupingPolicy>,
): number[] {
  const duration = tasks[0]?.duration ?? 0;
  const starts: number[] = [];
  for (let start = problem.day.start; start + duration <= problem.day.end; start += 5) {
    if (canPlaceTransportGroup(problem, tasks, start, placed, previousGroupStarts, policy)) starts.push(start);
  }
  return starts;
}

/** Lazy exact membership/start explorer. Complete memberships and surviving grid starts are
 * charged at the point at which they become material search alternatives. */
export function exploreTransportGroups(
  problem:PlannerNextProblem,tasks:readonly Task[],placed:readonly ScheduledTask[],previousGroupStarts:readonly number[],
  policy:Readonly<TransportGroupingPolicy>,consume:()=>boolean,evidence:TransportGroupingExplorerEvidence,
  visit:(group:readonly Task[],start:number)=>"CONTINUE"|"STOP",
  mode:TransportGroupingExplorerMode="EXACT_LAZY_ANALYTIC",
):"COMPLETE"|"STOP"|"BUDGET_EXHAUSTED" {
  const ordered=[...tasks].sort(byId),first=ordered[0];
  if(!first)return "COMPLETE";
  const duration=first.duration;
  const fullGrid=Math.max(0,Math.floor((problem.day.end-duration-problem.day.start)/5)+1);
  const sizes=Array.from({length:Math.max(0,Math.min(policy.maximumGroupSize,ordered.length)-policy.minimumGroupSize+1)},(_,i)=>policy.minimumGroupSize+i);
  if(policy.groupingWeight>0)sizes.sort((a,b)=>b-a);
  const memberDomain=(task:Task):ExactStartInterval[]=>exactTaskStartDomain(problem,task,[...placed]).intervals.map(x=>({...x}));
  const evaluate=(group:Task[],domain:ExactStartInterval[]):"COMPLETE"|"STOP"|"BUDGET_EXHAUSTED"=>{
    if(!consume())return "BUDGET_EXHAUSTED";
    evidence.transportGroupMembershipCandidatesEvaluated+=1;
    evidence.transportGroupFullGridStarts+=fullGrid;
    const starts=mode==="LEGACY_COMBINATIONS_FULL_GRID"
      ? Array.from({length:fullGrid},(_,i)=>problem.day.start+i*5)
      : [...exactStartDomainFromIntervals(problem,domain).starts()].filter(start=>previousGroupStarts.every(other=>Math.abs(start-other)>=policy.minGapMinutes));
    evidence.transportGroupAnalyticEligibleStarts+=starts.length;
    evidence.transportGroupAnalyticallyEliminatedStarts+=fullGrid-starts.length;
    let yielded=false;
    for(const start of starts){
      if(!consume())return "BUDGET_EXHAUSTED";
      evidence.transportGroupStartsEvaluated+=1;
      if(!canPlaceTransportGroup(problem,group,start,placed,previousGroupStarts,policy))continue;
      yielded=true;evidence.transportGroupCompleteGroupsYielded+=1;
      if(visit(group,start)==="STOP")return "STOP";
    }
    if(!yielded)evidence.transportGroupBacktracks+=1;
    return "COMPLETE";
  };
  if(mode==="LEGACY_COMBINATIONS_FULL_GRID"){
    for(const group of transportGroupCandidates(ordered,policy)){const result=evaluate(group,[{start:problem.day.start,end:problem.day.end-duration}]);if(result!=="COMPLETE")return result;}
    return "COMPLETE";
  }
  for(const size of sizes){
    if(!canPartitionTransportCount(ordered.length-size,policy.minimumGroupSize,policy.maximumGroupSize)){evidence.transportGroupResidualCapacityPrunes+=1;continue;}
    const walk=(next:number,group:Task[],domain:ExactStartInterval[]):"COMPLETE"|"STOP"|"BUDGET_EXHAUSTED"=>{
      evidence.transportGroupMaximumDepth=Math.max(evidence.transportGroupMaximumDepth,group.length);
      if(group.length===size)return evaluate(group,domain);
      const need=size-group.length;
      for(let index=next;index<=ordered.length-need;index+=1){
        evidence.transportGroupMembershipPartialsExpanded+=1;
        const task=ordered[index]!,intersection=intersectExactStartIntervals(domain,memberDomain(task));
        if(intersection.length===0){evidence.transportGroupMembershipDomainPrunes+=1;continue;}
        const result=walk(index+1,[...group,task],intersection);if(result!=="COMPLETE")return result;
      }
      return "COMPLETE";
    };
    const initial=memberDomain(first);
    if(initial.length===0){evidence.transportGroupMembershipDomainPrunes+=1;continue;}
    const result=walk(1,[first],initial);if(result!=="COMPLETE")return result;
  }
  return "COMPLETE";
}

export interface TransportValidation {
  violationCount: number;
  groupsByDirection: Readonly<Record<TransportDirection, readonly ScheduledTask[][]>>;
}

function participantBoundaryViolation(
  direction: TransportDirection,
  transportTask: ScheduledTask,
  scheduled: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[],
): boolean {
  const participantId = transportTask.participantId;
  if (!participantId) return true;
  const otherObligations = [
    ...scheduled.filter((task) => task.participantId === participantId && task.id !== transportTask.id),
    ...participantMeals.filter((meal) => meal.participantId === participantId),
  ];
  return direction === "arrival"
    ? otherObligations.some((obligation) => obligation.start < transportTask.end)
    : otherObligations.some((obligation) => obligation.end > transportTask.start);
}

/** Independent final validation: derives groups solely from direction plus executed interval. */
export function validateTransportGrouping(
  problem: Readonly<PlannerNextProblem>,
  scheduled: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[] = [],
): TransportValidation {
  const groupsByDirection = { arrival: [] as ScheduledTask[][], departure: [] as ScheduledTask[][] };
  let violationCount = 0;
  if (!problem.transportPolicy) return { violationCount, groupsByDirection };
  for (const direction of ["arrival", "departure"] as const) {
    const policy = problem.transportPolicy[direction];
    const expected = [...policy.taskIds].sort();
    const actual = scheduled.filter((task) => expected.includes(task.id));
    if (actual.length !== expected.length
      || expected.some((id) => actual.filter((task) => task.id === id).length !== 1)) violationCount += 1;
    if (actual.some((task) => !task.participantId)
      || new Set(actual.map((task) => task.participantId)).size !== actual.length) violationCount += 1;
    const byInterval = new Map<string, ScheduledTask[]>();
    for (const task of actual) {
      const key = `${task.start}:${task.end}`;
      byInterval.set(key, [...(byInterval.get(key) ?? []), task]);
    }
    const groups = [...byInterval.values()]
      .map((group) => group.sort((left, right) => left.id.localeCompare(right.id)))
      .sort((left, right) => left[0]!.start - right[0]!.start || left[0]!.id.localeCompare(right[0]!.id));
    groupsByDirection[direction].push(...groups);
    if (groups.some((group) => group.length < policy.minimumGroupSize
      || group.length > policy.maximumGroupSize
      || group.some((task) => task.start !== group[0]!.start || task.end !== group[0]!.end))) violationCount += 1;
    for (let index = 1; index < groups.length; index += 1) {
      if (groups[index]![0]!.start - groups[index - 1]![0]!.start < policy.minGapMinutes) violationCount += 1;
    }
    if (actual.some((task) => participantBoundaryViolation(direction, task, scheduled, participantMeals))) violationCount += 1;
  }
  return { violationCount, groupsByDirection };
}

export function synchronizedTransportTasks(
  problem: Readonly<PlannerNextProblem>,
  left: ScheduledTask,
  right: ScheduledTask,
): boolean {
  const direction = transportDirectionForTask(problem, left.id);
  return direction !== undefined && transportDirectionForTask(problem, right.id) === direction
    && left.start === right.start && left.end === right.end;
}
