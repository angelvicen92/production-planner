import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask, Task, TransportGroupingPolicy, ValidationViolationDetail } from "./contracts";
import { canPlaceTask } from "./placement";
import { createHash } from "node:crypto";

export type TransportDirection = "arrival" | "departure";

export interface TransportMaterializationDirectionEvidence {
  direction: TransportDirection;
  orderedTaskIds: string[];
  orderedParticipantIds: string[];
  orderedDeadlines: number[];
  packetSizes: number[];
  packetMembers: string[][];
  starts: number[];
  minGapMinutes: number;
  construction: "canonical" | "contiguous" | "interval-exact" | "fallback";
  alternativesExplored: number;
  classification: TransportContextClassification;
  classificationBreakers: string[];
  contiguousStatesExplored: number;
  membershipFallbackEntered: boolean;
  taskCount: number;
  candidateStartCount: number;
  contextClasses: string[][];
  algorithm: "CONTIGUOUS_EXACT" | "INTERVAL_CAPACITY_MATCHING" | "LEGACY_MEMBERSHIP_ENUMERATION";
  statesExplored: number;
  matchingChecks: number;
  matchingTraversals: number;
  membershipBranches: number;
  budgetExhausted: boolean;
  failureCause: "INFEASIBLE" | "BUDGET_EXHAUSTED" | null;
  contiguousFirstDeadEnd: {index:number;remaining:number;groupTaskIds:string[];groupSize:number;
    deadline:number;temporalLimit:number;startsBeforeBoundaryFilter:number;startsAfterBoundaryFilter:number}|null;
  hardPartitionFailure?: { reasonCode: "GROUP_CARDINALITY_PARTITION_IMPOSSIBLE"; count:number; minimumGroupSize:number; maximumGroupSize:number };
}

export interface TransportMaterializationEvidence {
  directions: TransportMaterializationDirectionEvidence[];
  fingerprint: string;
}

export type TransportMaterializationStatus = "FEASIBLE" | "INFEASIBLE" | "BUDGET_EXHAUSTED";
export interface DetailedTransportMaterialization {
  status: TransportMaterializationStatus;
  scheduled: ScheduledTask[] | null;
  evidence: TransportMaterializationEvidence;
}

export interface TransportMaterializationOptions {
  consumeFallbackBranch?: () => boolean;
  onEvidence?: (evidence: TransportMaterializationEvidence) => void;
  /** Internal recursion guard. Existing violations remain for independent
   * validation/AcceptedException; this never authorizes a new violation. */
  preserveFixedTransportDirections?: readonly TransportDirection[];
}

export type TransportContextClassification = "CONTIGUOUS_EXACT" | "MEMBERSHIP_REQUIRED";

const detailedFields = (tasks: readonly Task[], algorithm: TransportMaterializationDirectionEvidence["algorithm"]) => ({
  taskCount: tasks.length, candidateStartCount: 0,
  contextClasses: [...new Map(tasks.map((task) => [JSON.stringify({ duration: task.duration, spaceId: task.spaceId,
    resources: [...(task.requiredResourceIds ?? [])].sort() }), [] as string[]])).entries()].map(([key]) =>
    tasks.filter((task) => JSON.stringify({ duration: task.duration, spaceId: task.spaceId,
      resources: [...(task.requiredResourceIds ?? [])].sort() }) === key).map(({ id }) => id)),
  algorithm, statesExplored: 0, matchingChecks: 0, matchingTraversals: 0, membershipBranches: 0,
  budgetExhausted: false, failureCause: null as "INFEASIBLE" | "BUDGET_EXHAUSTED" | null,
  contiguousFirstDeadEnd: null as TransportMaterializationDirectionEvidence["contiguousFirstDeadEnd"],
});

export interface TransportArrivalFeasibility {
  status: "FEASIBLE" | "INFEASIBLE" | "INCONCLUSIVE";
  evidence: TransportMaterializationDirectionEvidence;
  scheduled: ScheduledTask[] | null;
}

export type CertifiedArrivalRejectCause = "ARRIVAL_ID_SET_MISMATCH" | "ARRIVAL_INVALID_PLACEMENT"
  | "ARRIVAL_DURATION_MISMATCH" | "ARRIVAL_SPACE_MISMATCH" | "ARRIVAL_PARTICIPANT_MISSING"
  | "ARRIVAL_GROUP_SIZE_INVALID" | "ARRIVAL_GROUP_POLICY_REJECTED" | "ARRIVAL_BOUNDARY_REJECTED";
export interface CertifiedArrivalValidation {
  readonly scheduled:readonly ScheduledTask[]|null;
  readonly rejectCause:CertifiedArrivalRejectCause|null;
  readonly rejectDetails:Readonly<Record<string,unknown>>|null;
  readonly packetStarts:readonly number[];
}

const byId = (left: Task, right: Task): number => left.id.localeCompare(right.id);

const lowerAndHolesKey = (windows: readonly { start: number; end: number }[] | undefined): string => {
  const ordered = [...(windows ?? [])].sort((left, right) => left.start - right.start || left.end - right.end);
  return JSON.stringify({ lower: ordered[0]?.start ?? null,
    holes: ordered.slice(0, -1).map((window, index) => [window.end, ordered[index + 1]!.start]) });
};

/** Deadlines come from placed obligations and deliberately are not part of this identity test. */
export function classifyTransportContext(problem: Readonly<PlannerNextProblem>, tasks: readonly Task[],
  fixedTaskIds: ReadonlySet<string> = new Set()): { classification: TransportContextClassification; breakers: string[] } {
  const first = tasks[0];
  if (!first) return { classification: "CONTIGUOUS_EXACT", breakers: [] };
  const participant = (task: Task) => problem.participants.find(({ id }) => id === task.participantId);
  const space = (task: Task) => problem.spaces.find(({ id }) => id === task.spaceId);
  const resources = (task: Task) => [...(task.requiredResourceIds ?? [])].sort().map((id) => {
    const resource = problem.resources.find((candidate) => candidate.id === id);
    return [id, lowerAndHolesKey(resource?.availability), resource?.assignedSpaceId ?? null];
  });
  const signature = (task: Task) => JSON.stringify({ duration: task.duration, spaceId: task.spaceId,
    resources: resources(task), taskAvailability: lowerAndHolesKey(task.availability),
    participantAvailability: lowerAndHolesKey(participant(task)?.availability),
    spaceAvailability: lowerAndHolesKey(space(task)?.availability), itinerantUnitId: task.itinerantUnitId ?? null });
  const reference = signature(first);
  const breakers: string[] = [];
  if (tasks.some((task) => fixedTaskIds.has(task.id))) breakers.push("FIXED_START_OR_LOCK");
  if (tasks.some((task) => signature(task) !== reference)) breakers.push("HARD_TRANSPORT_CONTEXT");
  return { classification: breakers.length ? "MEMBERSHIP_REQUIRED" : "CONTIGUOUS_EXACT", breakers };
}

function individualTransportBoundary(problem: Readonly<PlannerNextProblem>, task: Task,
  direction: TransportDirection, obligationBoundary: number): number {
  const participant = problem.participants.find(({ id }) => id === task.participantId);
  const space = problem.spaces.find(({ id }) => id === task.spaceId);
  const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((item) => item.id === id));
  const windows = [task.availability, participant?.availability, space?.availability,
    ...resources.map((resource) => resource?.availability)]
    .filter((item): item is Array<{ start: number; end: number }> => Boolean(item?.length));
  if (direction === "arrival") {
    const latestEnd = Math.min(problem.day.end, ...windows.map((items) => Math.max(...items.map(({ end }) => end))));
    return Math.min(obligationBoundary, latestEnd);
  }
  const earliestStart = Math.max(problem.day.start, ...windows.map((items) => Math.min(...items.map(({ start }) => start))));
  return Math.max(obligationBoundary, earliestStart);
}

/** Validates one certified Arrival realization literally; it never discovers a replacement schedule. */
export function validateCertifiedArrivalSchedule(problem:PlannerNextProblem,substantiveContext:readonly ScheduledTask[],
  certifiedPlacements:readonly Pick<ScheduledTask,"id"|"start"|"end"|"spaceId">[]):CertifiedArrivalValidation {
  const reject=(rejectCause:CertifiedArrivalRejectCause,rejectDetails:Record<string,unknown>):CertifiedArrivalValidation=>
    ({scheduled:null,rejectCause,rejectDetails,packetStarts:[]});
  const policy=problem.transportPolicy?.arrival;
  const expectedIds=new Set(policy?.taskIds??[]),certifiedById=new Map(certifiedPlacements.map(item=>[item.id,item]));
  const missingIds=[...expectedIds].filter(id=>!certifiedById.has(id)).sort();
  const unexpectedIds=[...certifiedById.keys()].filter(id=>!expectedIds.has(id)).sort();
  if(!policy||certifiedById.size!==certifiedPlacements.length||missingIds.length||unexpectedIds.length)
    return reject("ARRIVAL_ID_SET_MISMATCH",{missingIds,unexpectedIds,duplicateIds:certifiedPlacements.length-certifiedById.size});
  const scheduled:ScheduledTask[]=[];
  for(const id of [...expectedIds].sort()){
    const task=problem.tasks.find(candidate=>candidate.id===id),item=certifiedById.get(id)!;
    if(!task||!Number.isFinite(item.start)||!Number.isFinite(item.end)||item.end<=item.start)
      return reject("ARRIVAL_INVALID_PLACEMENT",{taskId:id,placement:item,taskFound:Boolean(task)});
    if(!task.participantId||!problem.participants.some(participant=>participant.id===task.participantId))
      return reject("ARRIVAL_PARTICIPANT_MISSING",{taskId:id,participantId:task.participantId??null});
    if(item.end-item.start!==task.duration)return reject("ARRIVAL_DURATION_MISMATCH",{taskId:id,expected:task.duration,actual:item.end-item.start});
    if(item.spaceId!==task.spaceId)return reject("ARRIVAL_SPACE_MISMATCH",{taskId:id,expected:task.spaceId,actual:item.spaceId});
    scheduled.push({...task,start:item.start,end:item.end});
  }
  const grouped=new Map<number,ScheduledTask[]>();
  for(const task of scheduled){const key=task.start;const group=grouped.get(key)??[];group.push(task);grouped.set(key,group);}
  const groups=[...grouped.values()].sort((left,right)=>left[0]!.start-right[0]!.start||left[0]!.end-right[0]!.end);
  const previousStarts:number[]=[];
  for(const group of groups){
    const start=group[0]!.start,size=group.length;
    if(size<policy.minimumGroupSize||size>policy.maximumGroupSize)
      return reject("ARRIVAL_GROUP_SIZE_INVALID",{taskIds:group.map(task=>task.id).sort(),size,minimum:policy.minimumGroupSize,maximum:policy.maximumGroupSize});
    if(!canPlaceTransportGroup(problem,group,start,substantiveContext,previousStarts,policy))
      return reject("ARRIVAL_GROUP_POLICY_REJECTED",{taskIds:group.map(task=>task.id).sort(),start,previousStarts:[...previousStarts],minGapMinutes:policy.minGapMinutes});
    for(const task of group){
      const obligations=substantiveContext.filter(placed=>placed.participantId===task.participantId&&!expectedIds.has(placed.id));
      const obligationBoundary=obligations.length?Math.min(...obligations.map(({start})=>start)):problem.day.end;
      const boundary=individualTransportBoundary(problem,task,"arrival",obligationBoundary);
      if(task.end>boundary)return reject("ARRIVAL_BOUNDARY_REJECTED",{taskId:task.id,start:task.start,end:task.end,boundary,obligationBoundary});
    }
    previousStarts.push(start);
  }
  return {scheduled:scheduled.sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id)),rejectCause:null,rejectDetails:null,
    packetStarts:groups.map(group=>group[0]!.start)};
}

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
  if (![count,minimum,maximum].every(Number.isInteger) || count < 0 || minimum < 1 || maximum < minimum) return false;
  if (count === 0) return true;
  const minimumGroups = Math.ceil(count / maximum);
  const maximumGroups = Math.floor(count / minimum);
  return minimumGroups <= maximumGroups;
}

/** A cold direction needs a complete cardinality partition independently of
 * target or timing. Abstain with protected members: accepted exceptions and
 * partially filled fixed groups require their full material context. */
export function transportPartitionFailures(problem:Readonly<PlannerNextProblem>,fixed:readonly ScheduledTask[]=[]) {
  const fixedIds=new Set(fixed.map(task=>task.id));
  const taskIds=new Set(problem.tasks.map(task=>task.id));
  return (["arrival","departure"] as const).flatMap(direction=>{
    const policy=problem.transportPolicy?.[direction];
    if(!policy || !Array.isArray(policy.taskIds) || new Set(policy.taskIds).size!==policy.taskIds.length
      || policy.taskIds.some(id=>fixedIds.has(id)||!taskIds.has(id))
      || !Number.isInteger(policy.minimumGroupSize) || !Number.isInteger(policy.maximumGroupSize)
      || policy.minimumGroupSize<1 || policy.maximumGroupSize<policy.minimumGroupSize
      || canPartitionTransportCount(policy.taskIds.length,policy.minimumGroupSize,policy.maximumGroupSize))return [];
    return [{direction,count:policy.taskIds.length,minimumGroupSize:policy.minimumGroupSize,
      maximumGroupSize:policy.maximumGroupSize,taskIds:[...policy.taskIds].sort()}];
  });
}

/** Canonical candidate groups containing the first remaining task; no invalid residual is emitted. */
export function transportGroupCandidates(
  tasks: readonly Task[],
  policy: Readonly<TransportGroupingPolicy>,
): Task[][] {
  const ordered = [...tasks];
  const [first, ...rest] = ordered;
  if (!first) return [];
  const sizes = Array.from(
    { length: Math.min(policy.maximumGroupSize, ordered.length) - policy.minimumGroupSize + 1 },
    (_, index) => policy.minimumGroupSize + index,
  ).filter((size) => canPartitionTransportCount(ordered.length - size, policy.minimumGroupSize, policy.maximumGroupSize));
  const target = Math.max(policy.minimumGroupSize, Math.min(policy.targetGroupSize ?? 1, policy.maximumGroupSize));
  sizes.sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || left - right);
  return sizes.flatMap((size) => combinations(rest, size - 1).map((tail) => [first, ...tail]));
}

export function scheduleTransportGroup(tasks: readonly Task[], start: number): ScheduledTask[] {
  return [...tasks].sort(byId).map((task) => ({ ...task, start, end: start + task.duration }));
}

export function transportContiguousGroupSizes(
  count: number,
  policy: Readonly<TransportGroupingPolicy>,
  direction: TransportDirection,
): number[] | null {
  if (count < 0 || !Number.isInteger(count)) return null;
  if (!canPartitionTransportCount(count, policy.minimumGroupSize, policy.maximumGroupSize)) return null;
  const target = Math.max(policy.minimumGroupSize,
    Math.min(policy.targetGroupSize ?? (direction === "arrival" ? 3 : 1), policy.maximumGroupSize));
  const memo = new Map<number, number[] | null>();
  const best = (remaining: number): number[] | null => {
    if (remaining === 0) return [];
    if (memo.has(remaining)) return memo.get(remaining)!;
    const candidates = Array.from({ length: Math.min(policy.maximumGroupSize, remaining) - policy.minimumGroupSize + 1 },
      (_, index) => policy.minimumGroupSize + index)
      .filter((size) => canPartitionTransportCount(remaining - size, policy.minimumGroupSize, policy.maximumGroupSize))
      .map((size) => ({ size, tail: best(remaining - size) }))
      .filter((candidate): candidate is { size: number; tail: number[] } => candidate.tail !== null)
      .map(({ size, tail }) => [size, ...tail])
      .sort((left, right) => {
        const leftCost = left.reduce((sum, size) => sum + Math.abs(size - target), 0);
        const rightCost = right.reduce((sum, size) => sum + Math.abs(size - target), 0);
        const difference = left.findIndex((size, index) => size !== right[index]);
        return leftCost - rightCost || left.length - right.length
          || (difference >= 0 ? left[difference]! - right[difference]! : 0);
      });
    const result = candidates[0] ?? null;
    memo.set(remaining, result);
    return result;
  };
  return best(count);
}

/**
 * Deterministic terminal logistics. The preferred witness uses contiguous boundary-ordered
 * packets; an exact fallback explores hard-valid packet sizes and memberships.
 */
function solveContiguousDirection(
  problem: PlannerNextProblem,
  direction: TransportDirection,
  tasks: readonly Task[],
  substantive: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[],
  alreadyPlaced: readonly ScheduledTask[],
  policy: Readonly<TransportGroupingPolicy>,
  consumeAlternative?: () => boolean,
): { scheduled: ScheduledTask[] | null; packetSizes: number[]; starts: number[]; states: number; alternatives: number;
  budgetExhausted: boolean; firstDeadEnd:TransportMaterializationDirectionEvidence["contiguousFirstDeadEnd"] } {
  const transportIds = transportTaskIds(problem);
  const obligationsFor = (participantId: string) => [
    ...substantive.filter((task) => task.participantId === participantId && !transportIds.has(task.id)),
    ...participantMeals.filter((meal) => meal.participantId === participantId),
  ];
  const boundary = (task: Task): number => {
    const obligations = obligationsFor(task.participantId!);
    const obligationBoundary = direction === "arrival"
      ? (obligations.length ? Math.min(...obligations.map(({ start }) => start)) : problem.day.end)
      : (obligations.length ? Math.max(...obligations.map(({ end }) => end)) : problem.day.start);
    return individualTransportBoundary(problem, task, direction, obligationBoundary);
  };
  const target = Math.max(policy.minimumGroupSize,
    Math.min(policy.targetGroupSize ?? (direction === "arrival" ? 3 : 1), policy.maximumGroupSize));
  const sizeCandidates = (remaining: number) => Array.from(
    { length: Math.min(policy.maximumGroupSize, remaining) - policy.minimumGroupSize + 1 },
    (_, index) => policy.minimumGroupSize + index,
  ).filter((size) => canPartitionTransportCount(remaining - size, policy.minimumGroupSize, policy.maximumGroupSize))
    .sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || left - right);
  let states = 0, alternatives = 0, budgetExhausted = false;
  let firstDeadEnd:TransportMaterializationDirectionEvidence["contiguousFirstDeadEnd"]=null;
  const failed = new Set<string>();
  const search = (index: number, temporalLimit: number, local: ScheduledTask[], sizes: number[], starts: number[]): boolean => {
    states += 1;
    if (index >= tasks.length) return true;
    const key = `${index}@${temporalLimit}`;
    if (failed.has(key)) return false;
    const remaining = tasks.length - index;
    for (const [candidateIndex, size] of sizeCandidates(remaining).entries()) {
      if (candidateIndex > 0) alternatives += 1;
      if (consumeAlternative && !consumeAlternative()) { budgetExhausted = true; return false; }
      const from = index;
      const group = tasks.slice(from, from + size);
      const deadline = direction === "arrival" ? Math.min(...group.map(boundary)) : Math.max(...group.map(boundary));
      const startsBeforeBoundaryFilter=transportGroupStarts(problem, group, [...substantive, ...alreadyPlaced, ...local], [], policy);
      const candidates = startsBeforeBoundaryFilter
        .filter((start) => direction === "arrival"
          ? start + group[0]!.duration <= deadline && start >= temporalLimit
          : start >= deadline && start >= temporalLimit)
        .sort((left, right) => left - right);
      if(candidates.length===0&&!firstDeadEnd)firstDeadEnd={index,remaining,groupTaskIds:group.map(task=>task.id),
        groupSize:size,deadline,temporalLimit,startsBeforeBoundaryFilter:startsBeforeBoundaryFilter.length,
        startsAfterBoundaryFilter:candidates.length};
      for (const start of candidates) {
        const scheduled = scheduleTransportGroup(group, start);
        local.push(...scheduled);
        sizes.push(size); starts.push(start);
        const nextLimit = start + policy.minGapMinutes;
        if (search(index + size, nextLimit, local, sizes, starts)) return true;
        local.splice(local.length - scheduled.length, scheduled.length);
        sizes.pop(); starts.pop();
        if (budgetExhausted) return false;
      }
    }
    failed.add(key);
    return false;
  };
  const scheduled: ScheduledTask[] = [], packetSizes: number[] = [], starts: number[] = [];
  return { scheduled: search(0, Number.NEGATIVE_INFINITY, scheduled, packetSizes, starts) ? scheduled : null,
    packetSizes, starts, states, alternatives, budgetExhausted,firstDeadEnd };
}

export function assessCoreArrivalTransportFeasibility(
  problem: PlannerNextProblem,
  coreTasks: readonly ScheduledTask[],
  options: Readonly<TransportMaterializationOptions> = {},
): TransportArrivalFeasibility {
  const policy = problem.transportPolicy?.arrival;
  const transportIds = transportTaskIds(problem);
  const substantiveCoreTasks = coreTasks.filter(({ id }) => !transportIds.has(id));
  const tasks = policy?.taskIds.map((id) => problem.tasks.find((task) => task.id === id)!).filter(Boolean) ?? [];
  const ordered = [...tasks].sort((left, right) => {
    const deadline = (task: Task) => {
      const obligations = substantiveCoreTasks.filter((placed) => placed.participantId === task.participantId);
      const obligationBoundary = obligations.length ? Math.min(...obligations.map(({ start }) => start)) : problem.day.end;
      return individualTransportBoundary(problem, task, "arrival", obligationBoundary);
    };
    return deadline(left) - deadline(right) || left.participantId!.localeCompare(right.participantId!) || byId(left, right);
  });
  const classified = classifyTransportContext(problem, ordered);
  const base = { direction: "arrival" as const, orderedTaskIds: ordered.map(({ id }) => id),
    orderedParticipantIds: ordered.map(({ participantId }) => participantId!), packetSizes: [] as number[],
    orderedDeadlines: ordered.map((task) => {
      const obligations = substantiveCoreTasks.filter((placed) => placed.participantId === task.participantId);
      return individualTransportBoundary(problem, task, "arrival",
        obligations.length ? Math.min(...obligations.map(({ start }) => start)) : problem.day.end);
    }),
    packetMembers: [] as string[][], starts: [] as number[], minGapMinutes: policy?.minGapMinutes ?? 0,
    construction: "contiguous" as const, alternativesExplored: 0, classification: classified.classification,
    classificationBreakers: classified.breakers, contiguousStatesExplored: 0, membershipFallbackEntered: false,
    ...detailedFields(ordered,"CONTIGUOUS_EXACT") };
  if (!policy || classified.classification === "MEMBERSHIP_REQUIRED")
    return { status: "INCONCLUSIVE", evidence: base, scheduled: null };
  const solved = solveContiguousDirection(problem, "arrival", ordered, substantiveCoreTasks, [], [], policy, options.consumeFallbackBranch);
  const groups: string[][] = []; let offset = 0;
  for (const size of solved.packetSizes) { groups.push(ordered.slice(offset, offset + size).map(({ id }) => id)); offset += size; }
  const evidence = { ...base, packetSizes: solved.packetSizes, packetMembers: groups, starts: solved.starts,
    alternativesExplored: solved.alternatives, contiguousStatesExplored: solved.states, statesExplored: solved.states,
    budgetExhausted: solved.budgetExhausted,
    contiguousFirstDeadEnd:solved.firstDeadEnd,
    failureCause: solved.scheduled ? null : solved.budgetExhausted ? "BUDGET_EXHAUSTED" as const : "INFEASIBLE" as const };
  return { status: solved.scheduled ? "FEASIBLE" : solved.budgetExhausted ? "INCONCLUSIVE" : "INFEASIBLE",
    evidence, scheduled: solved.scheduled };
}

/** Exact lower/upper-capacity matching for a chosen set of starts. */
function intervalCapacityMatching(domains: readonly ReadonlySet<number>[], starts: readonly number[], minimum: number,
  maximum: number): { assignment: number[] | null; traversals: number } {
  type Edge={to:number;rev:number;cap:number;initial:number;lower:number};
  const n=domains.length,k=starts.length,s=0,task0=1,slot0=task0+n,t=slot0+k,ss=t+1,tt=ss+1;
  const graph:Edge[][]=Array.from({length:tt+1},()=>[]);const demand=Array(tt+1).fill(0);let traversals=0;
  const add=(from:number,to:number,lower:number,upper:number)=>{const a:Edge={to,rev:graph[to]!.length,cap:upper-lower,initial:upper-lower,lower};const b:Edge={to:from,rev:graph[from]!.length,cap:0,initial:0,lower:0};graph[from]!.push(a);graph[to]!.push(b);demand[from]-=lower;demand[to]+=lower;return a;};
  for(let i=0;i<n;i++){add(s,task0+i,1,1);for(let j=0;j<k;j++)if(domains[i]!.has(starts[j]!))add(task0+i,slot0+j,0,1);}
  for(let j=0;j<k;j++)add(slot0+j,t,minimum,maximum);add(t,s,0,n);
  let required=0;for(let v=0;v<=t;v++){if(demand[v]>0){add(ss,v,0,demand[v]);required+=demand[v];}else if(demand[v]<0)add(v,tt,0,-demand[v]);}
  const flow=(source:number,sink:number)=>{let total=0;for(;;){const level=Array(graph.length).fill(-1),queue=[source];level[source]=0;for(let q=0;q<queue.length;q++)for(const edge of graph[queue[q]!]!){traversals++;if(edge.cap>0&&level[edge.to]<0){level[edge.to]=level[queue[q]!]+1;queue.push(edge.to);}}if(level[sink]<0)return total;const next=Array(graph.length).fill(0);const dfs=(v:number,pushed:number):number=>{if(v===sink)return pushed;for(;next[v]<graph[v]!.length;next[v]++){const edge=graph[v]![next[v]!]!;traversals++;if(edge.cap<=0||level[edge.to]!==level[v]+1)continue;const sent=dfs(edge.to,Math.min(pushed,edge.cap));if(sent){edge.cap-=sent;graph[edge.to]![edge.rev]!.cap+=sent;return sent;}}return 0;};for(let sent;(sent=dfs(source,Number.MAX_SAFE_INTEGER))>0;)total+=sent;}};
  if(flow(ss,tt)!==required)return {assignment:null,traversals};
  const assignment=Array(n).fill(-1);for(let i=0;i<n;i++)for(const edge of graph[task0+i]!)if(edge.to>=slot0&&edge.to<slot0+k&&edge.initial-edge.cap>0)assignment[i]=edge.to-slot0;
  return {assignment:assignment.every(value=>value>=0)?assignment:null,traversals};
}

/** Testable generic authority used by interval transport batching. */
export function exactIntervalCapacityAssignment(domains:readonly (readonly number[])[],starts:readonly number[],minimum:number,maximum:number):number[]|null {
  return intervalCapacityMatching(domains.map(domain=>new Set(domain)),starts,minimum,maximum).assignment;
}

function solveIntervalDirection(problem:PlannerNextProblem,direction:TransportDirection,tasks:readonly Task[],fixed:readonly ScheduledTask[],
  policy:Readonly<TransportGroupingPolicy>,boundary:(task:Task)=>number): {supported:boolean;scheduled:ScheduledTask[]|null;groups:Task[][];starts:number[];candidateStarts:number;states:number;checks:number;traversals:number} {
  const domains=tasks.map(task=>new Set(transportGroupStarts(problem,[task],fixed,[],policy).filter(start=>direction==="arrival"?start+task.duration<=boundary(task):start>=boundary(task))));
  const supported=tasks.every(task=>task.duration===tasks[0]?.duration)&&domains.every(domain=>{const values=[...domain].sort((a,b)=>a-b);return values.every((value,index)=>index===0||value-values[index-1]===5);});
  const candidates=[...new Set(domains.flatMap(domain=>[...domain]))].filter(start=>domains.filter(domain=>domain.has(start)).length>=policy.minimumGroupSize).sort((a,b)=>a-b);
  let states=0,checks=0,traversals=0;if(!supported)return {supported,scheduled:null,groups:[],starts:[],candidateStarts:candidates.length,states,checks,traversals};
  const minGroups=Math.ceil(tasks.length/policy.maximumGroupSize),maxGroups=Math.floor(tasks.length/policy.minimumGroupSize);
  const target=Math.max(policy.minimumGroupSize,Math.min(policy.targetGroupSize??1,policy.maximumGroupSize));
  const counts=Array.from({length:maxGroups-minGroups+1},(_,i)=>minGroups+i).sort((a,b)=>Math.abs(tasks.length/a-target)-Math.abs(tasks.length/b-target)||b-a);
  for(const count of counts){const selected:number[]=[];let found:number[]|null=null;
    const choose=(from:number):boolean=>{states++;if(selected.length===count){checks++;const match=intervalCapacityMatching(domains,selected,policy.minimumGroupSize,policy.maximumGroupSize);traversals+=match.traversals;if(match.assignment){found=match.assignment;return true;}return false;}for(let i=from;i<candidates.length;i++){if(selected.length&&candidates[i]!-selected.at(-1)!<policy.minGapMinutes)continue;if(candidates.length-i<count-selected.length)break;selected.push(candidates[i]!);if(choose(i+1))return true;selected.pop();}return false;};
    if(choose(0)&&found){const assignment=found as number[];const groups=selected.map((_,slot)=>tasks.filter((__,index)=>assignment[index]===slot));return {supported,scheduled:groups.flatMap((group,index)=>scheduleTransportGroup(group,selected[index]!)),groups,starts:[...selected],candidateStarts:candidates.length,states,checks,traversals};}
  }
  return {supported,scheduled:null,groups:[],starts:[],candidateStarts:candidates.length,states,checks,traversals};
}

/** Exact contiguous scheduling for interchangeable identities, retaining membership fallback otherwise. */
export function materializeTerminalTransportDetailed(
  problem: PlannerNextProblem,
  substantive: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[] = [],
  options: Readonly<TransportMaterializationOptions> = {},
): DetailedTransportMaterialization {
  if (!problem.transportPolicy) return {status:"FEASIBLE",scheduled:[],evidence:{directions:[],fingerprint:createHash("sha256").update("[]").digest("hex")}};
  const transportIds = transportTaskIds(problem);
  const alreadyMaterializedTransportIds=new Set(substantive.filter(task=>transportIds.has(task.id)).map(({id})=>id));
  // A protected member may complete a pending packet. Solve the entire affected
  // direction with singleton availability for fixed rows, rather than proving
  // impossibility from the pending count alone. Return only newly placed rows.
  const preservedDirections=new Set(options.preserveFixedTransportDirections??[]);
  const fixedGroups=(direction:TransportDirection)=>{
    const groups=new Map<number,ScheduledTask[]>();
    for(const task of substantive.filter(task=>problem.transportPolicy![direction].taskIds.includes(task.id)))
      groups.set(task.start,[...(groups.get(task.start)??[]),task]);
    return [...groups.values()];
  };
  for(const direction of ["arrival","departure"] as const){
    const policy=problem.transportPolicy[direction];
    // An oversized or unsynchronized fixed group cannot be repaired by adding
    // members. Retain its literal violation for the independent acceptance gate.
    if(fixedGroups(direction).some(group=>group.length>policy.maximumGroupSize||group.some(task=>task.end!==group[0]!.end)))
      preservedDirections.add(direction);
  }
  const recursiveOptions={...options,preserveFixedTransportDirections:[...preservedDirections]};
  const affectedDirections = (["arrival","departure"] as const).filter(direction =>
    !preservedDirections.has(direction)
    && problem.transportPolicy![direction].taskIds.some(id=>alreadyMaterializedTransportIds.has(id))
    && problem.transportPolicy![direction].taskIds.some(id=>!alreadyMaterializedTransportIds.has(id)));
  if (affectedDirections.length) {
    const included = new Set(affectedDirections.flatMap(direction=>problem.transportPolicy![direction].taskIds));
    const fixed = new Map(substantive.filter(task=>included.has(task.id)).map(task=>[task.id,task]));
    const constrained:PlannerNextProblem = {...problem,tasks:problem.tasks.map(task=>{
      const row=fixed.get(task.id);
      if(!row)return task;
      const availability=(task.availability?.length?task.availability:[problem.day]).flatMap(window=>{
        const start=Math.max(window.start,row.start),end=Math.min(window.end,row.end);
        return end-start===task.duration?[{start,end}]:[];
      });
      // Empty availability is unconstrained elsewhere; retain an impossible
      // singleton for an incompatible protected row instead of silently opening it.
      return {...task,availability:availability.length?availability:[{start:row.start,end:row.start}]};
    })};
    const result=materializeTerminalTransportDetailed(constrained,substantive.filter(task=>!fixed.has(task.id)),participantMeals,recursiveOptions);
    const existingViolationDirections=affectedDirections.filter(direction=>
      fixedGroups(direction).some(group=>group.length<problem.transportPolicy![direction].minimumGroupSize));
    if(result.status!=="FEASIBLE"&&existingViolationDirections.length)
      return materializeTerminalTransportDetailed(problem,substantive,participantMeals,{...recursiveOptions,
        preserveFixedTransportDirections:[...preservedDirections,...existingViolationDirections]});
    return {...result,scheduled:result.scheduled?.filter(task=>!fixed.has(task.id))??null};
  }
  const obligationsFor = (participantId: string) => [
    ...substantive.filter((task) => task.participantId === participantId && !transportIds.has(task.id)),
    ...participantMeals.filter((meal) => meal.participantId === participantId),
  ];
  const placed: ScheduledTask[] = [];
  const directionEvidence: TransportMaterializationDirectionEvidence[] = [];
  for (const direction of ["arrival", "departure"] as const) {
    const policy = problem.transportPolicy[direction];
    const boundary = (task: Task) => { const obligations = obligationsFor(task.participantId!);
      const obligationBoundary = direction === "arrival"
        ? (obligations.length ? Math.min(...obligations.map(({ start }) => start)) : problem.day.end)
        : (obligations.length ? Math.max(...obligations.map(({ end }) => end)) : problem.day.start);
      return individualTransportBoundary(problem, task, direction, obligationBoundary); };
    const tasks = policy.taskIds.filter(id=>!alreadyMaterializedTransportIds.has(id))
      .map((id) => problem.tasks.find((task) => task.id === id)!).filter(Boolean)
      .sort((left, right) => boundary(left) - boundary(right)
        || left.participantId!.localeCompare(right.participantId!) || byId(left, right));
    const classified = classifyTransportContext(problem, tasks);
    if (classified.classification === "CONTIGUOUS_EXACT") {
      const solved = solveContiguousDirection(problem, direction, tasks, substantive, participantMeals, placed, policy,
        options.consumeFallbackBranch);
      if (!solved.scheduled) {
        const item:TransportMaterializationDirectionEvidence={ direction, orderedTaskIds: tasks.map(({id})=>id),orderedParticipantIds:tasks.map(({participantId})=>participantId!),orderedDeadlines:tasks.map(boundary),packetSizes:[],packetMembers:[],starts:[],minGapMinutes:policy.minGapMinutes,construction:"contiguous",alternativesExplored:solved.alternatives,classification:classified.classification,classificationBreakers:[],contiguousStatesExplored:solved.states,membershipFallbackEntered:false,...detailedFields(tasks,"CONTIGUOUS_EXACT"),statesExplored:solved.states,failureCause:"INFEASIBLE"};
        if(!canPartitionTransportCount(tasks.length,policy.minimumGroupSize,policy.maximumGroupSize))
          item.hardPartitionFailure={reasonCode:"GROUP_CARDINALITY_PARTITION_IMPOSSIBLE",count:tasks.length,minimumGroupSize:policy.minimumGroupSize,maximumGroupSize:policy.maximumGroupSize};
        item.budgetExhausted=solved.budgetExhausted;
        item.failureCause=solved.budgetExhausted?"BUDGET_EXHAUSTED":"INFEASIBLE";
        directionEvidence.push(item);const evidence={directions:directionEvidence,fingerprint:createHash("sha256").update(JSON.stringify(directionEvidence)).digest("hex")};options.onEvidence?.(evidence);return {status:solved.budgetExhausted?"BUDGET_EXHAUSTED":"INFEASIBLE",scheduled:null,evidence};
      }
      const packetMembers: string[][] = []; let offset = 0;
      for (const size of solved.packetSizes) { packetMembers.push(tasks.slice(offset, offset + size).map(({ id }) => id)); offset += size; }
      directionEvidence.push({ direction, orderedTaskIds: tasks.map(({ id }) => id),
        orderedParticipantIds: tasks.map(({ participantId }) => participantId!), packetSizes: solved.packetSizes,
        orderedDeadlines: tasks.map(boundary),
        packetMembers, starts: solved.starts, minGapMinutes: policy.minGapMinutes, construction: "contiguous",
        alternativesExplored: solved.alternatives, classification: classified.classification,
        classificationBreakers: [], contiguousStatesExplored: solved.states, membershipFallbackEntered: false,
        ...detailedFields(tasks,"CONTIGUOUS_EXACT"), statesExplored: solved.states });
      placed.push(...solved.scheduled);
      continue;
    }
    const interval=solveIntervalDirection(problem,direction,tasks,[...substantive,...participantMeals.map(meal=>({...meal,kind:"auxiliary" as const,spaceId:"",dependencies:[]})),...placed],policy,boundary);
    if(interval.supported){
      const item:TransportMaterializationDirectionEvidence={direction,orderedTaskIds:tasks.map(({id})=>id),orderedParticipantIds:tasks.map(({participantId})=>participantId!),orderedDeadlines:tasks.map(boundary),packetSizes:interval.groups.map(group=>group.length),packetMembers:interval.groups.map(group=>group.map(({id})=>id)),starts:interval.starts,minGapMinutes:policy.minGapMinutes,construction:"interval-exact",alternativesExplored:0,classification:classified.classification,classificationBreakers:classified.breakers,contiguousStatesExplored:0,membershipFallbackEntered:false,...detailedFields(tasks,"INTERVAL_CAPACITY_MATCHING"),candidateStartCount:interval.candidateStarts,statesExplored:interval.states,matchingChecks:interval.checks,matchingTraversals:interval.traversals,failureCause:interval.scheduled?null:"INFEASIBLE"};
      directionEvidence.push(item);if(!interval.scheduled){const evidence={directions:directionEvidence,fingerprint:createHash("sha256").update(JSON.stringify(directionEvidence)).digest("hex")};options.onEvidence?.(evidence);return {status:"INFEASIBLE",scheduled:null,evidence};}placed.push(...interval.scheduled);continue;
    }
    let alternativesExplored = 0;
    const partitions = function* (remaining: readonly Task[], groups: Task[][] = []): Generator<Task[][]> {
      if (!remaining.length) { yield groups; return; }
      for (const group of transportGroupCandidates(remaining, policy)) {
        const ids = new Set(group.map(({ id }) => id));
        yield* partitions(remaining.filter(({ id }) => !ids.has(id)), [...groups, group]);
      }
    };
    let witness: ScheduledTask[] | null = null, witnessGroups: Task[][] = [], witnessStarts: number[] = [], budgetExhausted=false;
    for (const groups of partitions(tasks)) {
      alternativesExplored += 1;
      if (options.consumeFallbackBranch && !options.consumeFallbackBranch()) {budgetExhausted=true;break;}
      const local: ScheduledTask[] = [], starts: number[] = [];
      const indices = groups.map((_, index) => index);
      const place = (position: number): boolean => {
        if (position === indices.length) return true;
        const index = indices[position]!;
        const group = groups[index]!;
        const limit = (starts[index - 1] ?? Number.NEGATIVE_INFINITY) + policy.minGapMinutes;
        const deadline = direction === "arrival" ? Math.min(...group.map(boundary)) : Math.max(...group.map(boundary));
        const candidates = transportGroupStarts(problem, group, [...substantive, ...placed, ...local], [], policy)
          .filter((candidate) => direction === "arrival" ? candidate + group[0]!.duration <= deadline && candidate >= limit : candidate >= deadline && candidate >= limit)
          .sort((left, right) => left - right);
        for (const start of candidates) {
          const scheduled = scheduleTransportGroup(group, start);
          starts[index] = start; local.push(...scheduled);
          if (place(position + 1)) return true;
          local.splice(local.length - scheduled.length, scheduled.length);
        }
        return false;
      };
      if (place(0)) { witness = local; witnessGroups = groups; witnessStarts = starts; break; }
    }
    if (!witness) {const item:TransportMaterializationDirectionEvidence={direction,orderedTaskIds:tasks.map(({id})=>id),orderedParticipantIds:tasks.map(({participantId})=>participantId!),orderedDeadlines:tasks.map(boundary),packetSizes:[],packetMembers:[],starts:[],minGapMinutes:policy.minGapMinutes,construction:"fallback",alternativesExplored,classification:classified.classification,classificationBreakers:classified.breakers,contiguousStatesExplored:0,membershipFallbackEntered:true,...detailedFields(tasks,"LEGACY_MEMBERSHIP_ENUMERATION"),membershipBranches:alternativesExplored,budgetExhausted,failureCause:budgetExhausted?"BUDGET_EXHAUSTED":"INFEASIBLE"};directionEvidence.push(item);const evidence={directions:directionEvidence,fingerprint:createHash("sha256").update(JSON.stringify(directionEvidence)).digest("hex")};options.onEvidence?.(evidence);return {status:budgetExhausted?"BUDGET_EXHAUSTED":"INFEASIBLE",scheduled:null,evidence};}
    directionEvidence.push({ direction, orderedTaskIds: tasks.map(({ id }) => id), orderedParticipantIds: tasks.map(({ participantId }) => participantId!),
      orderedDeadlines: tasks.map(boundary),
      packetSizes: witnessGroups.map(({ length }) => length), packetMembers: witnessGroups.map((group) => group.map(({ id }) => id)),
      starts: witnessStarts, minGapMinutes: policy.minGapMinutes, construction: "fallback", alternativesExplored,
      classification: classified.classification, classificationBreakers: classified.breakers,
      contiguousStatesExplored: 0, membershipFallbackEntered: true,
      ...detailedFields(tasks,"LEGACY_MEMBERSHIP_ENUMERATION"), membershipBranches: alternativesExplored });
    placed.push(...witness);
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(directionEvidence)).digest("hex");
  options.onEvidence?.({ directions: directionEvidence, fingerprint });
  return {status:"FEASIBLE",scheduled:placed,evidence:{directions:directionEvidence,fingerprint}};
}

export function materializeTerminalTransport(problem:PlannerNextProblem,substantive:readonly ScheduledTask[],participantMeals:readonly ScheduledParticipantMeal[]=[],options:Readonly<TransportMaterializationOptions>={}):ScheduledTask[]|null {
  return materializeTerminalTransportDetailed(problem,substantive,participantMeals,options).scheduled;
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
  const direction = first && transportDirectionForTask(problem,first.id);
  const peers = direction ? placed.filter(task=>transportDirectionForTask(problem,task.id)===direction) : [];
  const simultaneous = peers.filter(task=>task.start===start);
  return first !== undefined
    && tasks.length + simultaneous.length <= policy.maximumGroupSize
    && simultaneous.every(task=>task.end===start+first.duration)
    && tasks.every((task) => task.duration === first.duration)
    && new Set(tasks.map((task) => task.participantId)).size === tasks.length
    && [...previousGroupStarts,...peers.map(task=>task.start)].every((other) => other===start || Math.abs(start - other) >= policy.minGapMinutes)
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

export interface TransportValidation {
  violationCount: number;
  groupsByDirection: Readonly<Record<TransportDirection, readonly ScheduledTask[][]>>;
  violations: ValidationViolationDetail[];
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

/** Independent final validation: equal starts form one group per direction. */
export function validateTransportGrouping(
  problem: Readonly<PlannerNextProblem>,
  scheduled: readonly ScheduledTask[],
  participantMeals: readonly ScheduledParticipantMeal[] = [],
): TransportValidation {
  const groupsByDirection = { arrival: [] as ScheduledTask[][], departure: [] as ScheduledTask[][] };
  const violations:ValidationViolationDetail[]=[];
  let violationCount = 0;
  if (!problem.transportPolicy) return { violationCount, groupsByDirection, violations };
  for (const direction of ["arrival", "departure"] as const) {
    const detail=(kind:string,taskIds:readonly string[],dimensions:Record<string,unknown>)=>violations.push({
      ruleCode:'TRANSPORT_GROUPING_VIOLATION',severity:'HARD',affectedTaskIds:[...new Set(taskIds)].sort(),
      affectedResourceIds:[],affectedSpaceIds:[],dimensions:{direction,kind,...dimensions},
    });
    const policy = problem.transportPolicy[direction];
    const expected = [...policy.taskIds].sort();
    const actual = scheduled.filter((task) => expected.includes(task.id)).sort((a,b)=>a.id.localeCompare(b.id)||a.start-b.start||a.end-b.end);
    if (actual.length !== expected.length
      || expected.some((id) => actual.filter((task) => task.id === id).length !== 1)) {
      violationCount += 1;
      const defective=expected.filter(id=>actual.filter(t=>t.id===id).length!==1);
      detail('TASK_COVERAGE',defective,{tasks:defective.map(taskId=>({taskId,expectedCount:1,placements:actual.filter(t=>t.id===taskId).map(({start,end})=>({start,end}))}))});
    }
    if (actual.some((task) => !task.participantId)
      || new Set(actual.map((task) => task.participantId)).size !== actual.length) {
      violationCount += 1;
      const defective=actual.filter(t=>!t.participantId||actual.filter(other=>other.participantId===t.participantId).length>1);
      detail('PARTICIPANT_IDENTITY',defective.map(t=>t.id),{tasks:defective.map(({id,participantId,start,end})=>({taskId:id,participantId:participantId??null,start,end}))});
    }
    const byInterval = new Map<number, ScheduledTask[]>();
    for (const task of actual) {
      const key = task.start;
      byInterval.set(key, [...(byInterval.get(key) ?? []), task]);
    }
    const groups = [...byInterval.values()]
      .map((group) => group.sort((left, right) => left.id.localeCompare(right.id)))
      .sort((left, right) => left[0]!.start - right[0]!.start || left[0]!.id.localeCompare(right[0]!.id));
    groupsByDirection[direction].push(...groups);
    const invalidGroups=groups.filter((group) => group.length < policy.minimumGroupSize || group.length > policy.maximumGroupSize);
    if (invalidGroups.length) violationCount += 1;
    for(const group of invalidGroups)detail('GROUP_SIZE',group.map(t=>t.id),{start:group[0]!.start,end:group[0]!.end,
      actualGroupSize:group.length,minimumGroupSize:policy.minimumGroupSize,maximumGroupSize:policy.maximumGroupSize});
    const unsynchronized=groups.filter(group=>group.some(task=>task.end!==group[0]!.end));
    if(unsynchronized.length)violationCount+=1;
    for(const group of unsynchronized)detail('GROUP_SYNCHRONIZATION',group.map(t=>t.id),{
      start:group[0]!.start,members:group.map(({id,end})=>({taskId:id,end}))});
    for (let index = 1; index < groups.length; index += 1) {
      const previous=groups[index-1]!,current=groups[index]!;
      if (current[0]!.start - previous[0]!.start < policy.minGapMinutes) {
        violationCount += 1;
        detail('GROUP_GAP',[...previous,...current].map(t=>t.id),{previousStart:previous[0]!.start,previousEnd:previous[0]!.end,
          start:current[0]!.start,end:current[0]!.end,previousTaskIds:previous.map(t=>t.id),currentTaskIds:current.map(t=>t.id),
          actualGapMinutes:current[0]!.start-previous[0]!.start,minGapMinutes:policy.minGapMinutes});
      }
    }
    const invalidBoundaries=actual.filter(task=>participantBoundaryViolation(direction,task,scheduled,participantMeals));
    if (invalidBoundaries.length) violationCount += 1;
    for(const task of invalidBoundaries){
      const obligations=[...scheduled.filter(other=>other.participantId===task.participantId&&other.id!==task.id).map(other=>({taskId:other.id,start:other.start,end:other.end})),
        ...participantMeals.filter(meal=>meal.participantId===task.participantId).map(meal=>({taskId:meal.sourceTaskId,start:meal.start,end:meal.end}))]
        .filter(other=>direction==='arrival'?other.start<task.end:other.end>task.start)
        .sort((a,b)=>a.taskId.localeCompare(b.taskId)||a.start-b.start||a.end-b.end);
      detail('PARTICIPANT_BOUNDARY',[task.id,...obligations.map(other=>other.taskId)],{transportTaskId:task.id,
        participantId:task.participantId??null,start:task.start,end:task.end,obligations});
    }
  }
  return { violationCount, groupsByDirection, violations };
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
