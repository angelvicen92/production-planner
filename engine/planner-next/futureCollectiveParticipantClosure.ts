import { createHash } from "node:crypto";
import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledSpaceMeal, ScheduledTask, Task } from "./contracts";
import { canPlaceTask, diagnoseTaskPlacement, exactTaskStartDomain, prepareTaskPlacementAuthority } from "./placement";
import { materializeTerminalTransportDetailed, validateCertifiedArrivalSchedule } from "./transportGrouping";
import { analyticParticipantMealDomain, participantMealCandidates } from "./participantMeals";
import { participantGapMinutes } from "./participantTransition";
import { anchoredSequence, materializeAnchoredOperation } from "./anchoredAccompaniment";
import { canPlaceJointGroup, jointGroupIds, jointGroupMembers } from "./jointTasks";

export interface FutureCollectiveClosureHall {
  closureTaskIds: string[];
  participantIds: string[];
  neighbourSlots: number[];
  taskCount: number;
  slotCount: number;
}
export interface FutureCollectiveClosureResult {
  status: "PASS" | "INFEASIBLE" | "ABSTAIN";
  reason: "HALL" | "UNCERTIFIED_GEOMETRY" | "PENDING_PREDECESSORS" | "MEALS_PENDING" | "DEPARTURE_CONTINUATION" | "BUDGET_EXHAUSTED" | null;
  /** A necessary-only PASS is explicitly not an acceptance certificate. */
  certified: boolean;
  requiredCount: number;
  maximumMatching: number;
  matching: Record<string, number>;
  domains: Record<string, number[]>;
  releaseBoundsByClosure: Record<string, { earliestStart: number; predecessorTaskIds: string[] }>;
  pendingPredecessorTaskIds: string[];
  participantIds: string[];
  hall: FutureCollectiveClosureHall | null;
  branchesConsumed: number;
  matchingTraversals: number;
  cacheHit: boolean;
  signature: string;
  witnessFingerprint: string | null;
  uncertifiedPlacement?:{taskId:string;reason:string|null;blockingTaskId:string|null};
}
export interface FutureCollectiveClosureEvidence {
  futureCollectiveClosureChecks: number;
  futureCollectiveClosureCacheHits: number;
  futureCollectiveClosureRequiredCount: number;
  futureCollectiveClosureMaximumMatching: number;
  futureCollectiveClosureBranchesConsumed: number;
  futureCollectiveClosureMatchingTraversals: number;
  futureCollectiveClosureHall: FutureCollectiveClosureHall | null;
  futureCollectiveClosureFirstPrune: { beforeMatchingCardinality: number; afterMatchingCardinality: number;
    affectedParticipantIds: string[]; causingTaskIds: string[]; blockingClosureTaskIds: string[] } | null;
  futureCollectiveClosureWitnessFingerprint: string | null;
  futureCollectiveClosureAbstentions: Record<string, number>;
  futureCollectiveClosureInconclusiveLeaves: number;
  futureCollectiveClosureLastCertificate: null | { fingerprint: string; contextTaskIds: string[];
    closureTaskIds: string[]; mealTaskIds: string[]; departureTaskIds: string[] };
  futureCollectiveClosurePendingPredecessorTaskIds: string[];
  futureCollectiveClosureFirstUncertifiedPlacement:FutureCollectiveClosureResult["uncertifiedPlacement"]|null;
}
export const futureCollectiveClosureEvidenceKeys = ["futureCollectiveClosureChecks", "futureCollectiveClosureCacheHits",
  "futureCollectiveClosureRequiredCount", "futureCollectiveClosureMaximumMatching", "futureCollectiveClosureBranchesConsumed",
  "futureCollectiveClosureMatchingTraversals", "futureCollectiveClosureHall", "futureCollectiveClosureFirstPrune",
  "futureCollectiveClosureWitnessFingerprint", "futureCollectiveClosureAbstentions",
  "futureCollectiveClosureInconclusiveLeaves", "futureCollectiveClosureLastCertificate",
  "futureCollectiveClosurePendingPredecessorTaskIds","futureCollectiveClosureFirstUncertifiedPlacement"] as const;
export const createFutureCollectiveClosureEvidence = (): FutureCollectiveClosureEvidence => ({
  futureCollectiveClosureChecks: 0, futureCollectiveClosureCacheHits: 0, futureCollectiveClosureRequiredCount: 0,
  futureCollectiveClosureMaximumMatching: 0, futureCollectiveClosureBranchesConsumed: 0, futureCollectiveClosureMatchingTraversals: 0,
  futureCollectiveClosureHall: null, futureCollectiveClosureFirstPrune: null, futureCollectiveClosureWitnessFingerprint: null,
  futureCollectiveClosureAbstentions: {},
  futureCollectiveClosureInconclusiveLeaves: 0, futureCollectiveClosureLastCertificate: null,
  futureCollectiveClosurePendingPredecessorTaskIds: [],
  futureCollectiveClosureFirstUncertifiedPlacement:null,
});
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonical = <T extends { id: string }>(rows: readonly T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

/** Prepared, read-only authority; witnesses never enter executable/protected task lists. */
export class PreparedFutureCollectiveParticipantClosure {
  private readonly source: PlannerNextProblem;
  private readonly placementSource: PlannerNextProblem;
  private readonly pairs: Array<{ closure: Task; departure: Task }>;
  private readonly cache = new Map<string, FutureCollectiveClosureResult>();
  private readonly sourceSignature: string;
  private readonly missingIds: string[];

  constructor(problem: PlannerNextProblem) {
    const projection = problem.analyticalFutureParticipantClosure;
    this.source = structuredClone({ ...problem,
      tasks: projection?.tasks ?? problem.tasks,
      participantMeals: projection?.meals ?? problem.participantMeals,
      transportPolicy: projection ? { arrival: { ...projection.departure, taskIds: [] }, departure: projection.departure }
        : problem.transportPolicy ? { ...problem.transportPolicy, arrival: { ...problem.transportPolicy.arrival, taskIds: [] } } : undefined,
    });
    // Replay supplied prerequisite geometry with its existing arrival membership;
    // only terminal transport materialization suppresses arrivals.
    this.placementSource = { ...this.source, transportPolicy: this.source.transportPolicy
      ? { ...this.source.transportPolicy, arrival: structuredClone(problem.transportPolicy?.arrival ?? this.source.transportPolicy.arrival) } : undefined };
    const byId = new Map(this.source.tasks.map(task => [task.id, task]));
    const mealIds = new Set(this.source.participantMeals?.map(meal => meal.sourceTaskId));
    this.missingIds = [...new Set([...(this.source.transportPolicy?.departure.taskIds ?? []),
      ...this.source.tasks.flatMap(task => task.dependencies), ...(this.source.participantMeals ?? []).flatMap(meal => meal.dependencies ?? [])]
      .filter(id => !byId.has(id) && !mealIds.has(id)))];
    this.sourceSignature = hash([this.source.day, canonical(this.source.tasks).map(task => ({ ...task, dependencies: [...task.dependencies].sort() })),
      canonical(this.source.spaces), canonical(this.source.resources), canonical(this.source.participants), canonical(this.source.coaches),
      canonical(this.source.participantMeals ?? []), { ...this.placementSource.transportPolicy?.arrival,
        taskIds: [...(this.placementSource.transportPolicy?.arrival.taskIds ?? [])].sort() }, { ...this.source.transportPolicy?.departure,
        taskIds: [...(this.source.transportPolicy?.departure.taskIds ?? [])].sort() }, this.source.participantTransitionMinutes,
      this.source.resourceTransitionMinutes, this.source.anchoredAccompaniments, this.source.participantMealCapacity,
      this.source.protectedMeal, canonical(this.source.itinerantUnits ?? []), this.source.itinerantUnitMeals,
      this.source.resourceMeals, this.source.coachRouteTransitions, this.source.operationalMealPolicies]);
    const dependsOn = (id: string, target: string, seen = new Set<string>()): boolean => {
      if (seen.has(id)) return false;
      seen.add(id);
      return (byId.get(id)?.dependencies ?? []).some(dep => dep === target || dependsOn(dep, target, seen));
    };
    this.pairs = (this.source.transportPolicy?.departure.taskIds ?? []).sort().flatMap(id => {
      const departure = byId.get(id);
      if (!departure) return [];
      // Retain the terminal frontier, not redundant earlier dependency vertices.
      const frontier = departure.dependencies.filter(dep => !mealIds.has(dep)
        && !departure.dependencies.some(other => other !== dep && dependsOn(other, dep)));
      return frontier.flatMap(dep => {
        const closure = byId.get(dep);
        return closure?.participantId !== undefined && closure.participantId === departure.participantId
          ? [{ closure, departure }] : [];
      });
    });
  }

  /** Task identities required for a sufficient closure witness, never placements. */
  closureTaskIds():string[] { return [...new Set(this.pairs.map(pair=>pair.closure.id))].sort(); }

  pendingPredecessorTaskIds(fixed: readonly ScheduledTask[]): string[] {
    const fixedIds = new Set(fixed.map(task => task.id)), byId = new Map(this.source.tasks.map(task => [task.id, task]));
    const meals = new Map(this.source.participantMeals?.map(meal => [meal.sourceTaskId, meal]));
    const pending = new Set<string>(), visited = new Set<string>();
    const requireDependencies = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const dep of byId.get(id)?.dependencies ?? meals.get(id)?.dependencies ?? []) {
        if (!fixedIds.has(dep) && !meals.has(dep)) pending.add(dep);
        requireDependencies(dep);
      }
    };
    for (const id of [...this.pairs.flatMap(pair => [pair.closure.id, pair.departure.id]), ...meals.keys()]) requireDependencies(id);
    for (const { closure } of this.pairs) pending.delete(closure.id);
    return [...pending].sort();
  }

  evaluate(fixed: readonly ScheduledTask[], meals: readonly ScheduledParticipantMeal[] = [],
    consume: () => boolean = () => true, mode: "NECESSARY_ONLY" | "CERTIFY" = "CERTIFY",
    spaceMeals: readonly ScheduledSpaceMeal[] = []): FutureCollectiveClosureResult {
    return this.evaluateContext(fixed,meals,consume,mode,spaceMeals,null);
  }

  /** A zero domain for an affected participant proves this edge impossible in
   * the supplied context. PASS remains a relaxation, never a joint certificate. */
  evaluateIndividualContinuation(fixed:readonly ScheduledTask[],added:readonly ScheduledTask[],consume:()=>boolean,
    spaceMeals:readonly ScheduledSpaceMeal[]=[]):FutureCollectiveClosureResult {
    return this.evaluateContext(fixed,[],consume,"NECESSARY_ONLY",spaceMeals,
      [...new Set(added.flatMap(task=>task.participantId?[task.participantId]:[]))].sort());
  }

  private evaluateContext(fixed:readonly ScheduledTask[],meals:readonly ScheduledParticipantMeal[],consume:()=>boolean,
    mode:"NECESSARY_ONLY"|"CERTIFY",spaceMeals:readonly ScheduledSpaceMeal[],participants:readonly string[]|null):FutureCollectiveClosureResult {
    const signature = hash([this.sourceSignature, mode, canonical(fixed), canonical(meals), spaceMeals,participants]);
    const cached = this.cache.get(signature);
    if (cached) return { ...structuredClone(cached), cacheHit: true, branchesConsumed: 0, matchingTraversals: 0 };
    let branchesConsumed = 0, matchingTraversals = 0;
    const charge = () => { if (!consume()) return false; branchesConsumed++; return true; };
    const fixedIds = new Set(fixed.map(task => task.id));
    const pairs = this.pairs.filter(pair => !fixedIds.has(pair.closure.id)
      &&(participants===null||participants.includes(pair.closure.participantId!)));
    const closures = canonical([...new Map(pairs.map(pair => [pair.closure.id, pair.closure])).values()]);
    const domains: Record<string, number[]> = {};
    const releaseBoundsByClosure: FutureCollectiveClosureResult["releaseBoundsByClosure"] = {};
    let matching = new Map<string, number>();
    const base: FutureCollectiveClosureResult = { status: "PASS", reason: null, certified: false,
      requiredCount: closures.length, maximumMatching: 0, matching: {}, domains, releaseBoundsByClosure, pendingPredecessorTaskIds: [],
      participantIds: [...new Set(closures.flatMap(task => task.participantId ? [task.participantId] : []))].sort(),
      hall: null, branchesConsumed: 0, matchingTraversals: 0, cacheHit: false, signature, witnessFingerprint: null };
    const finish = (status: FutureCollectiveClosureResult["status"], reason: FutureCollectiveClosureResult["reason"],
      certified = false): FutureCollectiveClosureResult => {
      const result = { ...base, status, reason, certified, maximumMatching: matching.size,
        matching: Object.fromEntries([...matching].sort(([a], [b]) => a.localeCompare(b))), branchesConsumed, matchingTraversals };
      if (certified) result.witnessFingerprint = hash([result.matching, canonical(meals), signature]);
      if (reason !== "BUDGET_EXHAUSTED") this.cache.set(signature, structuredClone(result));
      return result;
    };
    if (!this.source.transportPolicy?.departure.taskIds.length) return finish("PASS", null, mode === "CERTIFY");
    if (this.missingIds.some(id => !fixedIds.has(id))) return finish("ABSTAIN", "UNCERTIFIED_GEOMETRY");
    const mealTasks: ScheduledTask[] = meals.map(meal => ({ id: meal.sourceTaskId, kind: "auxiliary", spaceId: "",
      participantId: meal.participantId, duration: meal.duration, start: meal.start, end: meal.end,
      dependencies: this.source.participantMeals?.find(item => item.sourceTaskId === meal.sourceTaskId)?.dependencies ?? [],
      // Participant meals use their existing overlap/dependency contract, without travel margins.
      participantMarginBeforeMinutes: 0, participantMarginAfterMinutes: 0 }));
    const occupied = [...fixed, ...mealTasks];
    const taskById = new Map(this.source.tasks.map(task => [task.id, task]));
    const fixedById = new Map(occupied.map(task => [task.id, task]));
    const mealById = new Map(this.source.participantMeals?.map(meal => [meal.sourceTaskId, meal]));
    // Missing task ancestors are independent of the provisional meal combination.
    // Meals themselves are supplied by the existing exact meal solver.
    const pending = new Set(this.pendingPredecessorTaskIds(fixed));
    base.pendingPredecessorTaskIds = [...pending];
    const earliestEnds = new Map<string, number>();
    // Necessary dependency bounds only. No predecessor placement is selected or
    // persisted: each bound comes from an existing exact domain and canonical gap.
    const earliestEnd = (id: string, visiting = new Set<string>()): number => {
      const fixedTask = fixedById.get(id);
      if (fixedTask) return fixedTask.end;
      const cachedEnd = earliestEnds.get(id);
      if (cachedEnd !== undefined) return cachedEnd;
      if (visiting.has(id)) return Infinity;
      const nextVisiting = new Set(visiting).add(id), task = taskById.get(id), meal = mealById.get(id);
      if (!task && !meal) return -Infinity; // Unknown context cannot prove infeasibility.
      const dependencies = task?.dependencies ?? meal?.dependencies ?? [];
      const lower = Math.max(this.source.day.start, ...dependencies.map(dep => {
        const predecessor = fixedById.get(dep) ?? taskById.get(dep);
        return earliestEnd(dep, nextVisiting) + (task && predecessor ? participantGapMinutes(this.source, predecessor, task) : 0);
      }));
      const starts = task ? exactTaskStartDomain(this.source, task, occupied, [...spaceMeals]).starts()
        : analyticParticipantMealDomain(this.source, meal!, occupied).ranges.flatMap(range =>
          Array.from({ length: Math.floor((range.last - range.first) / 5) + 1 }, (_, index) => range.first + index * 5));
      let end = Infinity;
      for (const start of starts) if (start >= lower) { end = start + (task?.duration ?? meal!.duration); break; }
      earliestEnds.set(id, end); return end;
    };
    for (const meal of meals) {
      const obligation = mealById.get(meal.sourceTaskId);
      if ((obligation?.dependencies ?? []).some(dep => earliestEnd(dep) > meal.start))
        return finish("INFEASIBLE", "MEALS_PENDING");
    }
    for (const closure of closures) {
      const departures = pairs.filter(pair => pair.closure.id === closure.id).map(pair => pair.departure);
      const departureAuthorities = departures.map(departure => prepareTaskPlacementAuthority(this.source, departure, occupied, [...spaceMeals]));
      const releases = closure.dependencies.map(dep => {
        const predecessor = fixedById.get(dep) ?? taskById.get(dep);
        return { id: dep, start: earliestEnd(dep) + (predecessor ? participantGapMinutes(this.source, predecessor, closure) : 0) };
      });
      const lower = Math.max(this.source.day.start, ...releases.map(item => item.start));
      releaseBoundsByClosure[closure.id] = { earliestStart: lower,
        predecessorTaskIds: releases.filter(item => item.start === lower).map(item => item.id).sort() };
      domains[closure.id] = [...exactTaskStartDomain(this.source, closure, occupied, [...spaceMeals]).starts()].filter(start => {
        if (start < lower) return false;
        if (!canPlaceTask(this.source, closure, start, occupied, [...spaceMeals])) return false;
        const scheduled = { ...closure, start, end: start + closure.duration }, withClosure = [...occupied, scheduled];
        return departures.every((departure, index) => [...departureAuthorities[index]!.domain([scheduled]).starts()]
          .some(outStart => canPlaceTask(this.source, departure, outStart, withClosure, [...spaceMeals])));
      });
    }
    // Only certify the exact unit-slot geometry. Other geometries need their own authority.
    // The affected-edge relaxation with one vertex is just a domain-emptiness
    // check, like the existing analytic participant probe; no matching search runs.
    if(participants!==null&&closures.length===1){
      const closure=closures[0]!,starts=domains[closure.id]!;
      if(starts.length){matching.set(closure.id,starts[0]!);return finish("PASS",null);}
      base.hall={closureTaskIds:[closure.id],participantIds:[closure.participantId!],neighbourSlots:[],taskCount:1,slotCount:0};
      return finish("INFEASIBLE","HALL");
    }
    const first = closures[0];
    const slots = [...new Set(Object.values(domains).flat())].sort((a, b) => a - b);
    if (first && (closures.some(task => task.duration !== first.duration || task.spaceId !== first.spaceId
      || task.jointGroupId !== undefined || task.setupFamilyId !== undefined)
      || new Set(closures.map(task => task.participantId)).size !== closures.length
      || slots.some((slot, index) => index > 0 && slot - slots[index - 1]! < first.duration)))
      return finish("ABSTAIN", "UNCERTIFIED_GEOMETRY");
    const maximum = (tasks: readonly Task[], blocked = new Set<number>()) => {
      const owner = new Map<number, string>(), assigned = new Map<string, number>();
      const augment = (id: string, seen: Set<number>): boolean => {
        for (const slot of domains[id] ?? []) {
          if (blocked.has(slot) || seen.has(slot)) continue;
          seen.add(slot); matchingTraversals++;
          const old = owner.get(slot);
          if (old === undefined || augment(old, seen)) { owner.set(slot, id); assigned.set(id, slot); return true; }
        }
        return false;
      };
      for (const task of tasks) augment(task.id, new Set());
      return assigned;
    };
    if (!charge()) return finish("ABSTAIN", "BUDGET_EXHAUSTED");
    matching = maximum(closures);
    if (matching.size < closures.length) {
      const owner = new Map([...matching].map(([id, start]) => [start, id]));
      const seenTasks = new Set(closures.filter(task => !matching.has(task.id)).map(task => task.id));
      const seenSlots = new Set<number>(), pending = [...seenTasks];
      while (pending.length) for (const slot of domains[pending.pop()!] ?? []) {
        seenSlots.add(slot); const old = owner.get(slot);
        if (old && !seenTasks.has(old)) { seenTasks.add(old); pending.push(old); }
      }
      base.hall = { closureTaskIds: [...seenTasks].sort(), participantIds: [...new Set(closures
        .filter(task => seenTasks.has(task.id)).flatMap(task => task.participantId ? [task.participantId] : []))].sort(),
        neighbourSlots: [...seenSlots].sort((a, b) => a - b), taskCount: seenTasks.size, slotCount: seenSlots.size };
      return finish("INFEASIBLE", "HALL");
    }
    if (mode === "NECESSARY_ONLY") return finish("PASS", null);
    if ((this.source.participantMeals ?? []).some(meal => !meals.some(item => item.sourceTaskId === meal.sourceTaskId)))
      return finish("ABSTAIN", "MEALS_PENDING");
    // Release lower bounds prove only a necessary domain. Certification requires
    // a joint supplied context for every pending ancestor of closure, meals and OUT.
    // Existing exact future/prerequisite explorers may supply that context later;
    // this authority neither schedules predecessors nor promotes bounds to a witness.
    if (pending.size) return finish("ABSTAIN", "PENDING_PREDECESSORS");
    const prerequisiteIds = new Set<string>(), visited = new Set<string>();
    const collect = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const dep of taskById.get(id)?.dependencies ?? mealById.get(id)?.dependencies ?? []) {
        prerequisiteIds.add(dep); collect(dep);
      }
    };
    for (const id of [...this.pairs.flatMap(pair => [pair.closure.id, pair.departure.id]), ...mealById.keys()]) collect(id);
    // Simultaneous IN vertices are one transport packet, not ordinary exclusive
    // space placements. Replay that packet with the canonical transport authority
    // before exempting its vertices from the ordinary prerequisite check.
    const arrivalIds = new Set(this.placementSource.transportPolicy?.arrival.taskIds ?? []);
    if (arrivalIds.size) {
      const arrival = validateCertifiedArrivalSchedule(this.placementSource,
        occupied.filter(task => !arrivalIds.has(task.id)), fixed.filter(task => arrivalIds.has(task.id)));
      if (!arrival.scheduled) {
        base.uncertifiedPlacement = { taskId: fixed.find(task => arrivalIds.has(task.id))?.id ?? [...arrivalIds].sort()[0]!,
          reason: arrival.rejectCause, blockingTaskId: null };
        return finish("ABSTAIN", "UNCERTIFIED_GEOMETRY");
      }
    }
    const compositeIds = new Set(arrivalIds);
    for (const contract of this.placementSource.anchoredAccompaniments ?? []) {
      const ids = new Set(anchoredSequence(contract));
      if (![...ids].some(id => prerequisiteIds.has(id))) continue;
      const anchor = fixedById.get(contract.anchorTaskId), sourceAnchor = taskById.get(contract.anchorTaskId);
      const operation = anchor && sourceAnchor ? materializeAnchoredOperation(this.placementSource, sourceAnchor, anchor.start,
        occupied.filter(task => !ids.has(task.id)), [...spaceMeals]) : null;
      if (!operation || operation.tasks.some(task => {
        const actual = fixedById.get(task.id);
        return !actual || actual.start !== task.start || actual.end !== task.end || actual.spaceId !== task.spaceId;
      })) {
        base.uncertifiedPlacement = { taskId: contract.anchorTaskId, reason: "ANCHORED_OPERATION_REPLAY_REJECTED", blockingTaskId: null };
        return finish("ABSTAIN", "UNCERTIFIED_GEOMETRY");
      }
      for (const id of ids) compositeIds.add(id);
    }
    for (const groupId of jointGroupIds(this.placementSource.tasks)) {
      const members = jointGroupMembers(this.placementSource.tasks, groupId), ids = new Set(members.map(task => task.id));
      if (!members.some(task => prerequisiteIds.has(task.id))) continue;
      const first = fixedById.get(members[0]!.id), external = occupied.filter(task => !ids.has(task.id));
      if (!first || members.some(task => {
        const actual = fixedById.get(task.id);
        return !actual || actual.start !== first.start || actual.end !== first.start + task.duration || actual.spaceId !== task.spaceId;
      }) || !canPlaceJointGroup(this.placementSource, members, first.start, external)
        || members.some(task => !canPlaceTask(this.placementSource, task, first.start, external, [...spaceMeals]))) {
        base.uncertifiedPlacement = { taskId: members[0]!.id, reason: "JOINT_OPERATION_REPLAY_REJECTED", blockingTaskId: null };
        return finish("ABSTAIN", "UNCERTIFIED_GEOMETRY");
      }
      for (const id of ids) compositeIds.add(id);
    }
    for (const task of fixed.filter(task => prerequisiteIds.has(task.id) && !compositeIds.has(task.id))) {
      const placement=diagnoseTaskPlacement(this.placementSource,task,task.start,occupied.filter(other=>other.id!==task.id),[...spaceMeals]);
      if (!placement.valid){
        base.uncertifiedPlacement={taskId:task.id,reason:placement.firstRejectionReason,blockingTaskId:placement.blockingPlacedTaskId};
        return finish("ABSTAIN", "UNCERTIFIED_GEOMETRY");
      }
    }
    // Choose the lexicographically earliest complete matching, using residual matching
    // rather than freezing an arbitrary augmenting-path assignment.
    const earliest = new Map<string, number>(), used = new Set<number>();
    for (let index = 0; index < closures.length; index++) {
      const task = closures[index]!;
      for (const start of domains[task.id] ?? []) {
        if (used.has(start)) continue;
        if (!charge()) return finish("ABSTAIN", "BUDGET_EXHAUSTED");
        if (maximum(closures.slice(index + 1), new Set([...used, start])).size === closures.length - index - 1) {
          earliest.set(task.id, start); used.add(start); break;
        }
      }
    }
    matching = earliest;
    const scheduled = closures.map(task => ({ ...task, start: matching.get(task.id)!, end: matching.get(task.id)! + task.duration }));
    if (scheduled.some(task => !canPlaceTask(this.source, task, task.start,
      [...occupied, ...scheduled.filter(other => other.id !== task.id)], [...spaceMeals])))
      return finish("ABSTAIN", "UNCERTIFIED_GEOMETRY");
    for (const obligation of this.source.participantMeals ?? []) {
      const meal = meals.find(item => item.sourceTaskId === obligation.sourceTaskId)!;
      if (!participantMealCandidates(this.source, obligation, [...fixed, ...scheduled], meals.filter(item => item !== meal))
        .some(candidate => candidate.start === meal.start && candidate.end === meal.end))
        return finish("ABSTAIN", "MEALS_PENDING");
    }
    const transport = materializeTerminalTransportDetailed(this.source, [...fixed, ...scheduled], meals,
      { consumeFallbackBranch: charge });
    if (transport.status === "BUDGET_EXHAUSTED") return finish("ABSTAIN", "BUDGET_EXHAUSTED");
    // Failure of this witness is not proof that every matching fails.
    if (transport.status !== "FEASIBLE") return finish("ABSTAIN", "DEPARTURE_CONTINUATION");
    return finish("PASS", null, true);
  }
}
