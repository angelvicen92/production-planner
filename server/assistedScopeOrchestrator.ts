import type { EngineInput, TaskInput } from "../engine/types";
import type { AssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";
import type { AssistedScopeSelector } from "../shared/assistedProposalContracts";

export type OperationalUnitKind = "MAIN_PIPELINE" | "TECHNICAL_CHAIN" | "ROUND_SYNCHRONIZATION" |
  "OPERATIONAL_MEAL" | "ITINERANT_AGENDA" | "SETUP_FAMILY" | "SPACE_FALLBACK";

export interface OperationalUnitPriority {
  readonly structuralClass: number;
  readonly requiredCoupling: number;
  readonly downstreamImpact: number;
  readonly effectiveDeadline: string | null;
  readonly pendingDurationMinutes: number;
  readonly pendingTaskCount: number;
  readonly sharedResourcePressure: number;
  /** Load on the most constrained concrete resource/unit (or task window). */
  readonly effectiveWindowLoadMinutes: number;
  readonly effectiveWindowCapacityMinutes: number;
  readonly effectiveWindowSlackMinutes: number;
  readonly sharedResourceDemandCount: number;
}
export interface OperationalUnitEvidence {
  readonly unitId: string;
  readonly unitKind: OperationalUnitKind;
  readonly selector: AssistedScopeSelector;
  readonly memberTaskIds: readonly number[];
  readonly memberSpaceIds: readonly number[];
  readonly authorityIds: readonly string[];
  readonly priority: OperationalUnitPriority;
}
export interface AssistedScopeRecommendation {
  readonly selectedUnitId: string;
  readonly selectedUnitKind: OperationalUnitKind;
  readonly selector: AssistedScopeSelector;
  readonly memberTaskIds: readonly number[];
  readonly memberSpaceIds: readonly number[];
  readonly authorityIds: readonly string[];
  readonly priority: OperationalUnitPriority;
  readonly reason: string;
  readonly candidates: readonly OperationalUnitEvidence[];
}

// This order only gives a connected unit a stable descriptive kind.  It is
// deliberately not used to rank independent operational units.
const authorityKindOrder: Record<OperationalUnitKind, number> = {
  MAIN_PIPELINE: 0, TECHNICAL_CHAIN: 1, ROUND_SYNCHRONIZATION: 2, OPERATIONAL_MEAL: 3,
  ITINERANT_AGENDA: 4, SETUP_FAMILY: 5, SPACE_FALLBACK: 6,
};
const compareNumbers = (a: number, b: number) => a - b;
const canonical = (values: Iterable<number>) => [...new Set(values)].sort(compareNumbers);
const pending = (task: TaskInput, accepted: ReadonlySet<number>) =>
  (task.status === "pending" || task.status === "interrupted") && !accepted.has(task.id);
const minute = (value: string) => { const [hour, part] = value.split(":").map(Number); return hour! * 60 + part!; };
const windowMinutes = (start: string, end: string) => Math.max(0, minute(end) - minute(start));
const unionWindowMinutes=(windows:readonly {start:string;end:string}[],lower:number,upper:number)=>{
  const sorted=windows.map(window=>({start:Math.max(lower,minute(window.start)),end:Math.min(upper,minute(window.end))}))
    .filter(window=>window.end>window.start).sort((left,right)=>left.start-right.start||left.end-right.end);
  let total=0,start=-1,end=-1;
  for(const window of sorted){if(window.start>end){total+=Math.max(0,end-start);start=window.start;end=window.end;}else end=Math.max(end,window.end);}
  return total+Math.max(0,end-start);
};

/**
 * Pure Assisted authority: explicit operational contracts form units; resource
 * coincidence never does. Priority is lexicographic and IDs are only the final
 * tie-break after operational components have compared equal.
 */
export function recommendNextAssistedScope(
  input: EngineInput,
  snapshot: Pick<AssistedPlanningSnapshotV1, "tasks">,
  obligationIds: readonly number[] = input.tasks.map(task => task.id),
): AssistedScopeRecommendation | null {
  const accepted = new Set(snapshot.tasks.filter(row => row.startPlanned && row.endPlanned).map(row => row.taskId));
  const obligations = new Set(obligationIds);
  const tasks = input.tasks.filter(task => obligations.has(task.id) && pending(task, accepted));
  if (!tasks.length) return null;
  const byId = new Map(input.tasks.map(task => [task.id, task]));
  const parent = new Map(tasks.map(task => [task.id, task.id]));
  const find = (id: number): number => { const p = parent.get(id)!; if (p === id) return id; const root = find(p); parent.set(id, root); return root; };
  const union = (ids: readonly number[]) => { const present = canonical(ids.filter(id => parent.has(id))); if (present.length < 2) return; const root = find(present[0]!); for (const id of present.slice(1)) parent.set(find(id), root); };
  const authorities = new Map<number, { kind: OperationalUnitKind; id: string }[]>();
  const attach = (ids: readonly number[], kind: OperationalUnitKind, id: string) => {
    const present = ids.filter(taskId => parent.has(taskId)); if (!present.length) return;
    union(present); for (const taskId of present) { const list = authorities.get(taskId) ?? []; list.push({ kind, id }); authorities.set(taskId, list); }
  };

  const mainIds = tasks.filter(task => task.spaceId === input.plannerNext?.mainFlow.spaceId).map(task => task.id);
  attach(mainIds, "MAIN_PIPELINE", "plannerNext.mainFlow");
  // Anchored accompaniment closure is consumed by buildAssistedProblem; it is
  // deliberately not made visible in the first human scope.
  const feederSpaceIds=new Set((input.coachRouteTransitions??[]).map(route=>route.fromSpaceId));
  const mainSupportingTaskIds=new Set(input.tasks.filter(task=>task.spaceId!=null&&feederSpaceIds.has(task.spaceId)).map(task=>task.id));
  if(feederSpaceIds.size)attach([...mainSupportingTaskIds],
    "TECHNICAL_CHAIN","plannerNext.mainFlow.feeders");
  for (const chain of input.technicalChains ?? []) {
    const members = [...chain.orderedTaskIds];
    // Joint identity is an explicit authority and therefore closes chain members losslessly.
    const jointIds = new Set(members.map(id => byId.get(id)?.jointGroupId).filter((id): id is string => Boolean(id)));
    members.push(...input.tasks.filter(task => task.jointGroupId && jointIds.has(task.jointGroupId)).map(task => task.id));
    attach(members, "TECHNICAL_CHAIN", chain.id);
  }
  for (const rounds of input.roundSynchronizations ?? []) attach(rounds.lanes.flatMap(lane => lane.taskIds), "ROUND_SYNCHRONIZATION", rounds.id);
  for (const meal of input.operationalMealPolicies ?? []) {
    if (!meal.spaceIds?.length) continue;
    attach(input.tasks.filter(task => task.spaceId != null && meal.spaceIds!.includes(task.spaceId)).map(task => task.id), "OPERATIONAL_MEAL", meal.id);
  }
  for (const setup of input.setupPolicies ?? []) attach(input.tasks.filter(task => task.spaceId === setup.spaceId && task.setupFamilyId).map(task => task.id), "SETUP_FAMILY", `setup:${setup.spaceId}`);
  const itinerantKeys = new Map<string, number[]>();
  for (const task of tasks) {
    if(authorities.has(task.id))continue;
    // This consumes only eligibility already declared by EngineInput.  It does
    // not infer interchangeable teams from names/resources, and it does not
    // add alternative-team support to the Planner Next adapter or solver.
    const ids = canonical([...(task.allowedItinerantTeamIds ?? []), ...(task.itinerantTeamId == null ? [] : [task.itinerantTeamId])]);
    if (!ids.length) continue; const key = ids.join(","); itinerantKeys.set(key, [...(itinerantKeys.get(key) ?? []), task.id]);
  }
  for (const [key, ids] of itinerantKeys) attach(ids, "ITINERANT_AGENDA", `itinerant:${key}`);

  // A SPACE selector resolves every pending obligation in that space.  Close
  // fallback components over that exact scope before producing evidence.
  // Otherwise several one-task candidates can advertise the same selector.
  const fallbackSpaceIds=new Set(tasks.filter(task=>!authorities.has(task.id)&&task.spaceId!=null).map(task=>task.spaceId!));
  for(const spaceId of fallbackSpaceIds)union(tasks.filter(task=>task.spaceId===spaceId).map(task=>task.id));
  union(tasks.filter(task=>!authorities.has(task.id)&&task.spaceId==null).map(task=>task.id));

  const groups = new Map<number, TaskInput[]>();
  for (const task of tasks) { const root = find(task.id); groups.set(root, [...(groups.get(root) ?? []), task]); }
  const dependants = new Map<number, number>();
  for (const task of input.tasks) for (const dependency of task.dependsOnTaskIds ?? []) dependants.set(dependency, (dependants.get(dependency) ?? 0) + 1);
  const dayStart=minute(input.workDay.start),dayEnd=minute(input.workDay.end);
  const resourceWindows=new Map(input.planResourceItems.filter(resource=>resource.isAvailable).map(resource=>{
    const start=Math.max(dayStart,resource.availabilityStart?minute(resource.availabilityStart):dayStart);
    const end=Math.min(dayEnd,resource.availabilityEnd?minute(resource.availabilityEnd):dayEnd);
    return [resource.id,Math.max(0,end-start)] as const;
  }));
  const teamWindows=new Map((input.itinerantTeamAvailability??[]).map(team=>[team.itinerantTeamId,
    unionWindowMinutes(team.windows,dayStart,dayEnd)] as const));
  const pendingResourceUsers=new Map<number,Set<number>>();
  for(const task of tasks)for(const resourceId of task.assignedResourceIds??[]){
    const users=pendingResourceUsers.get(resourceId)??new Set<number>();users.add(task.id);pendingResourceUsers.set(resourceId,users);
  }
  const candidates: OperationalUnitEvidence[] = [...groups.values()].map(members => {
    const memberTaskIds = canonical(members.map(task => task.id));
    const authority = memberTaskIds.flatMap(id => authorities.get(id) ?? []);
    const kind = authority.map(item => item.kind).sort((a, b) => authorityKindOrder[a] - authorityKindOrder[b])[0] ?? "SPACE_FALLBACK";
    const authorityIds = [...new Set(authority.filter(item => item.kind === kind).map(item => item.id))].sort();
    const memberSpaceIds = canonical(members.flatMap(task => task.spaceId == null ? [] : [task.spaceId]));
    const duration = members.reduce((sum, task) => sum + (task.durationOverrideMin ?? 0), 0);
    const deadline = members.map(task => task.fixedWindowEnd).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
    const resources = members.flatMap(task => task.assignedResourceIds ?? []);
    const sharedResourcePressure = resources.length - new Set(resources).size;
    const loads:{load:number;capacity:number}[]=[];
    const loadByResource=new Map<number,number>();
    const loadByTeam=new Map<number,number>();
    for(const task of members){
      const taskDuration=task.durationOverrideMin??0;
      for(const resourceId of task.assignedResourceIds??[])loadByResource.set(resourceId,(loadByResource.get(resourceId)??0)+taskDuration);
      if(task.itinerantTeamId!=null)loadByTeam.set(task.itinerantTeamId,(loadByTeam.get(task.itinerantTeamId)??0)+taskDuration);
      if(task.fixedWindowStart&&task.fixedWindowEnd)loads.push({load:taskDuration,capacity:windowMinutes(task.fixedWindowStart,task.fixedWindowEnd)});
    }
    for(const [id,load] of loadByResource)loads.push({load,capacity:resourceWindows.get(id)??Math.max(0,dayEnd-dayStart)});
    for(const [id,load] of loadByTeam)loads.push({load,capacity:teamWindows.get(id)??Math.max(0,dayEnd-dayStart)});
    const bottleneck=loads.sort((left,right)=>right.load*left.capacity-left.load*right.capacity||left.capacity-right.capacity)[0]
      // Duration alone is not window pressure: absent a structured resource,
      // unit or task window, this dimension must remain neutral.
      ??{load:0,capacity:Math.max(0,dayEnd-dayStart)};
    const memberSet=new Set(memberTaskIds);
    const sharedResourceDemandCount=[...new Set(resources)].filter(id=>[...(pendingResourceUsers.get(id)??[])].some(taskId=>!memberSet.has(taskId))).length;
    // Main and its explicit route-connected support retain their declared
    // proximity. Every independent unit competes on measurable pressure.
    const supportsMain=memberTaskIds.some(id=>mainSupportingTaskIds.has(id));
    const priority: OperationalUnitPriority = { structuralClass: kind === "MAIN_PIPELINE" ? 3 : supportsMain ? 2 : authority.length ? 1 : 0, requiredCoupling: authority.length,
      downstreamImpact: members.reduce((sum, task) => sum + (dependants.get(task.id) ?? 0), 0), effectiveDeadline: deadline,
      pendingDurationMinutes: duration, pendingTaskCount: members.length, sharedResourcePressure,
      effectiveWindowLoadMinutes:bottleneck.load,effectiveWindowCapacityMinutes:bottleneck.capacity,
      effectiveWindowSlackMinutes:bottleneck.capacity-bottleneck.load,sharedResourceDemandCount };
    const unitId = authorityIds.length ? `${kind}:${authorityIds.join("+")}` : `SPACE_FALLBACK:${memberSpaceIds.join("+") || "unlocated"}`;
    const selector: AssistedScopeSelector = memberSpaceIds.length === 1 && (kind === "SPACE_FALLBACK" || kind === "MAIN_PIPELINE")
      ? { kind: "SPACE", spaceId: memberSpaceIds[0]! } : { kind: "TASK_IDS", taskIds: memberTaskIds };
    return Object.freeze({ unitId, unitKind: kind, selector, memberTaskIds, memberSpaceIds, authorityIds, priority });
  });
  const compareDensity=(aNumerator:number,aDenominator:number,bNumerator:number,bDenominator:number)=>(
    bNumerator*aDenominator-aNumerator*bDenominator
  );
  const compare = (a: OperationalUnitEvidence, b: OperationalUnitEvidence) => {
    const mainAuthority=b.priority.structuralClass===3?1:a.priority.structuralClass===3?-1:0;
    const mainSupport=(a.priority.structuralClass>=2||b.priority.structuralClass>=2)
      ? b.priority.structuralClass-a.priority.structuralClass:0;
    return mainAuthority
    || mainSupport
    || compareDensity(a.priority.effectiveWindowLoadMinutes,a.priority.effectiveWindowCapacityMinutes,
      b.priority.effectiveWindowLoadMinutes,b.priority.effectiveWindowCapacityMinutes)
    || (a.priority.effectiveDeadline ?? "99:99").localeCompare(b.priority.effectiveDeadline ?? "99:99")
    || b.priority.structuralClass - a.priority.structuralClass
    // Compare pressure per pending obligation so a broad, flexible scope does
    // not win merely because it contains more rows.
    || compareDensity(a.priority.downstreamImpact,a.priority.pendingTaskCount,b.priority.downstreamImpact,b.priority.pendingTaskCount)
    || compareDensity(a.priority.requiredCoupling,a.priority.pendingTaskCount,b.priority.requiredCoupling,b.priority.pendingTaskCount)
    || b.priority.pendingDurationMinutes - a.priority.pendingDurationMinutes
    || b.priority.pendingTaskCount - a.priority.pendingTaskCount
    || b.priority.sharedResourcePressure - a.priority.sharedResourcePressure
    || b.priority.sharedResourceDemandCount-a.priority.sharedResourceDemandCount
    || a.unitId.localeCompare(b.unitId, "en");
  };
  candidates.sort(compare);
  if(new Set(candidates.map(candidate=>candidate.unitId)).size!==candidates.length)
    throw new Error("DUPLICATE_OPERATIONAL_UNIT_ID");
  const winner = candidates[0]!;
  return Object.freeze({ selectedUnitId: winner.unitId, selectedUnitKind: winner.unitKind, selector: winner.selector,
    memberTaskIds: winner.memberTaskIds, memberSpaceIds: winner.memberSpaceIds, authorityIds: winner.authorityIds,
    priority: winner.priority, reason: "LEXICOGRAPHIC_OPERATIONAL_CRITICALITY", candidates: Object.freeze(candidates) });
}
