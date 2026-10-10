// Restricted, ephemeral diagnostic producer. No production wiring and no diagnostic solution seed.
import { createHash } from "node:crypto";
import type {
  PlannerNextProblem,
  ScheduledTask,
  Task,
} from "../../engine/planner-next/contracts";
import type { FutureJointCompletionWitnessV1 } from "../../engine/planner-next/anonymousPipelineWitness";
import {
  exactTaskStaticStartDomain,
  effectiveResourceTransitionMinutes,
} from "../../engine/planner-next/placement";
import { participantGapMinutes } from "../../engine/planner-next/participantTransition";
import { effectiveCoachTransitionMinutes } from "../../engine/planner-next/coachRouteTransitions";
import { materializeItinerantUnitAssignment } from "../../engine/planner-next/itinerantUnitAssignment";
import { revalidateJointCompletionWitness } from "../../engine/planner-next/jointCompletionWitness";
import { PLANNER_NEXT_SUPPORTED_TIME_GRID_MINUTES as GRID } from "../../engine/planner-next/integration/plannerNextCapabilities";
import {
  searchDomains,
  type Relation,
  type Capacity,
} from "./asst010JointComponentDomains";
export function produce(
  source: PlannerNextProblem,
  prior: FutureJointCompletionWitnessV1,
  fixed: readonly ScheduledTask[],
  consume: () => boolean,
  checkpoint: () => void = () => {},
  diagnostic?: FutureJointCompletionWitnessV1,
  stopAtFirstConflict = false,
) {
  const old = new Map(prior.tasks.map((t) => [t.id, t])),
    fixedById = new Map(fixed.map((t) => [t.id, t]));
  const tasks: Task[] = source.tasks.map((t) => {
    const unit = old.get(t.id)?.itinerantUnitId;
    return unit && unit !== t.itinerantUnitId
      ? materializeItinerantUnitAssignment(source, t, unit)!
      : t;
  });
  if (tasks.some((t) => !t) || tasks.some((t) => !old.has(t.id)))
    throw Error("Unsupported lineage");
  const ids = tasks.map((t) => t.id),
    durations = tasks.map((t) => t.duration),
    domains = tasks.map((t) =>
      [
        ...exactTaskStaticStartDomain(source, t, [
          ...prior.spaceMeals,
        ]).starts(),
      ].filter((s) =>
        prior.operationalMeals.every((m) => {
          const blocked =
            m.spaceIds.includes(t.spaceId) ||
            [...(t.requiredResourceIds ?? []), t.coachId].some(
              (id) => id && m.resourceIds.includes(id),
            );
          return !blocked || s + t.duration <= m.start || s >= m.end;
        }),
      ),
    );
  for (let i = 0; i < tasks.length; i++) {
    const f = fixedById.get(tasks[i]!.id);
    if (f) domains[i] = domains[i]!.filter((s) => s === f.start);
  }
  const mainSlots = prior.tasks
    .filter((t) => t.kind === "main")
    .map((t) => t.start);
  for (let i = 0; i < tasks.length; i++)
    if (tasks[i]!.kind === "main")
      domains[i] = domains[i]!.filter((s) => mainSlots.includes(s));
  for (const meal of source.participantMeals ?? []) {
    ids.push(meal.sourceTaskId);
    durations.push(meal.duration);
    const starts = [];
    for (
      let s = meal.window.start;
      s + meal.duration <= meal.window.end;
      s += GRID
    )
      if (!meal.fixedInterval || s === meal.fixedInterval.start) starts.push(s);
    domains.push(starts);
  }
  const byId = new Map(ids.map((id, i) => [id, i])),
    parent = ids.map((_, i) => i),
    offset = ids.map(() => 0);
  const root = (i: number): number => {
    if (parent[i] !== i) {
      const p = parent[i]!;
      parent[i] = root(p);
      offset[i]! += offset[p]!;
    }
    return parent[i]!;
  };
  const group = (groupIds: string[]) => {
    const first = groupIds[0];
    if (!first) return;
    const a = byId.get(first)!;
    for (const id of groupIds.slice(1)) {
      const b = byId.get(id)!,
        ra = root(a),
        rb = root(b);
      const delta = old.get(id)!.start - old.get(first)!.start;
      if (ra !== rb) {
        parent[rb] = ra;
        offset[rb] = offset[a]! + delta - offset[b]!;
      }
    }
  };
  for (const id of new Set(tasks.map((t) => t.jointGroupId).filter(Boolean)))
    group(tasks.filter((t) => t.jointGroupId === id).map((t) => t.id));
  for (const c of source.anchoredAccompaniments ?? [])
    group([...c.beforeTaskIds, c.anchorTaskId, ...c.afterTaskIds]);
  for (const c of source.technicalChains ?? []) group(c.orderedTaskIds);
  const transportGroups = new Map<string, string>(),
    transportEdges: { a: string; b: string; gap: number }[] = [];
  for (const direction of ["arrival", "departure"] as const) {
    const policy = source.transportPolicy?.[direction];
    if (!policy) continue;
    const gs = new Map<number, string[]>();
    for (const id of policy.taskIds) {
      const s = old.get(id)!.start;
      gs.set(s, [...(gs.get(s) ?? []), id]);
    }
    const ordered = [...gs].sort(([a], [b]) => a - b);
    for (const [at, g] of ordered) {
      group(g);
      for (const id of g) transportGroups.set(id, `${direction}:${at}`);
    }
    for (let i = 1; i < ordered.length; i++)
      transportEdges.push({
        a: ordered[i - 1]![1][0]!,
        b: ordered[i]![1][0]!,
        gap: policy.minGapMinutes,
      });
  }
  for (const policy of source.roundSynchronizations ?? [])
    group(policy.lanes.flatMap((l) => l.taskIds));
  const secondary = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.setupFamilyId) continue;
    const key = JSON.stringify([t.spaceId, t.setupFamilyId]);
    secondary.set(key, [...(secondary.get(key) ?? []), t.id]);
  }
  for (const g of secondary.values()) group(g);
  for (const s of source.spaces.filter(
    (s) => s.secondaryContinuity === "REQUIRED",
  ))
    group(tasks.filter((t) => t.spaceId === s.id).map((t) => t.id));
  const preparatories = [
    ...prior.preparations.map((p) => ({
      p,
      ref: tasks
        .filter(
          (t) => t.spaceId === p.spaceId && t.setupFamilyId === p.setupFamilyId,
        )
        .sort((a, b) => old.get(a.id)!.start - old.get(b.id)!.start)[0]?.id,
    })),
    ...prior.roundPreparations.map((p) => ({
      p,
      ref: source.roundSynchronizations?.find(
        (c) => c.id === p.synchronizationId,
      )?.lanes[0]?.taskIds[0],
    })),
  ];
  for (const { p, ref } of preparatories) {
    if (!ref) throw Error("Unsupported preparation");
    const pi = ids.length;
    ids.push(p.id);
    durations.push(p.duration);
    byId.set(p.id, pi);
    parent.push(pi);
    offset.push(0);
    const starts = [];
    for (let s = source.day.start; s + p.duration <= source.day.end; s += GRID)
      if (
        prior.operationalMeals.every(
          (m) =>
            !m.spaceIds.includes(p.spaceId) ||
            s + p.duration <= m.start ||
            s >= m.end,
        )
      )
        starts.push(s);
    domains.push(starts);
    const a = byId.get(ref)!,
      ra = root(a);
    parent[pi] = ra;
    offset[pi] = offset[a]! + p.start - old.get(ref)!.start;
  }
  const roots: number[] = [],
    varIndex: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const r = root(i);
    if (!roots.includes(r)) roots.push(r);
    varIndex[i] = roots.indexOf(r);
  }
  const values = roots.map((r) => domains[r]!.map((s) => s - offset[r]!));
  for (let i = 0; i < ids.length; i++)
    values[varIndex[i]!] = values[varIndex[i]!]!.filter((v) =>
      domains[i]!.includes(v + offset[i]!),
    );
  type Pair = { a: number; b: number; tests: ((diff: number) => boolean)[] };
  const pairs = new Map<string, Pair>();
  let impossible = false;
  const conflicts: any[] = [];
  const constraint = (
    a: number,
    b: number,
    allowed: (diff: number) => boolean,
  ) => {
    const av = varIndex[a]!,
      bv = varIndex[b]!,
      delta = offset[b]! - offset[a]!;
    if (av === bv) {
      if (!allowed(delta)) {
        impossible = true;
        conflicts.push({ a: ids[a], b: ids[b], delta });
      }
      return;
    }
    const x = Math.min(av, bv),
      y = Math.max(av, bv),
      key = `${x}:${y}`,
      p = pairs.get(key) ?? { a: x, b: y, tests: [] };
    p.tests.push((d) => allowed((av === x ? d : -d) + delta));
    pairs.set(key, p);
  };
  const precede = (a: string, b: string, gap: number) =>
    constraint(byId.get(a)!, byId.get(b)!, (diff) => diff >= gap);
  for (const t of tasks)
    for (const dep of t.dependencies)
      precede(dep, t.id, durations[byId.get(dep)!]!);
  for (const m of source.participantMeals ?? [])
    for (const dep of m.dependencies ?? [])
      precede(dep, m.sourceTaskId, durations[byId.get(dep)!]!);
  for (const e of transportEdges) precede(e.a, e.b, e.gap);
  const anchorForward = new Set(
    (source.anchoredAccompaniments ?? []).flatMap((c) => {
      const seq = [...c.beforeTaskIds, c.anchorTaskId, ...c.afterTaskIds];
      return seq.slice(1).map((id, i) => `${seq[i]}|${id}`);
    }),
  );
  const gap = (a: Task, b: Task) => {
    if (anchorForward.has(`${a.id}|${b.id}`)) return 0;
    let result = participantGapMinutes(source, a, b);
    if (a.spaceId !== b.spaceId) {
      if (a.coachId && a.coachId === b.coachId)
        result = Math.max(
          result,
          effectiveCoachTransitionMinutes(
            source,
            a.coachId,
            a.spaceId,
            b.spaceId,
          ),
        );
      for (const id of a.requiredResourceIds ?? [])
        if (b.requiredResourceIds?.includes(id))
          result = Math.max(
            result,
            effectiveResourceTransitionMinutes(source, id),
          );
      if (a.itinerantUnitId && a.itinerantUnitId === b.itinerantUnitId)
        result = Math.max(
          result,
          source.itinerantUnits?.find((u) => u.id === a.itinerantUnitId)
            ?.transitionMinutes ?? 0,
        );
    }
    return result;
  };
  const exclusive = (a: number, b: number, gapAB = 0, gapBA = 0) =>
    constraint(
      a,
      b,
      (diff) => diff >= durations[a]! + gapAB || diff <= -durations[b]! - gapBA,
    );
  for (let i = 0; i < tasks.length; i++)
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i]!,
        b = tasks[j]!;
      if (a.jointGroupId && a.jointGroupId === b.jointGroupId) continue;
      if (
        transportGroups.has(a.id) &&
        transportGroups.get(a.id) === transportGroups.get(b.id)
      )
        continue;
      if (
        (a.participantId && a.participantId === b.participantId) ||
        (a.coachId && a.coachId === b.coachId) ||
        a.spaceId === b.spaceId ||
        (a.requiredResourceIds ?? []).some((id) =>
          b.requiredResourceIds?.includes(id),
        ) ||
        (a.itinerantUnitId && a.itinerantUnitId === b.itinerantUnitId)
      )
        exclusive(i, j, gap(a, b), gap(b, a));
    }
  for (const m of source.participantMeals ?? [])
    for (let i = 0; i < tasks.length; i++)
      if (tasks[i]!.participantId === m.participantId)
        exclusive(i, byId.get(m.sourceTaskId)!);
  for (const { p } of preparatories)
    for (let i = 0; i < tasks.length; i++)
      if (tasks[i]!.spaceId === p.spaceId) exclusive(i, byId.get(p.id)!);
  const relations: Relation[] = [...pairs.values()].map((p) => ({
    a: p.a,
    b: p.b,
    allows: (a, b) => p.tests.every((t) => t(b - a)),
  }));
  const capacityGroups = new Map<string, number[]>();
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]!;
    for (const key of [
      `space:${t.spaceId}`,
      ...(t.requiredResourceIds ?? []).map((id) => `resource:${id}`),
    ])
      capacityGroups.set(key, [...(capacityGroups.get(key) ?? []), i]);
  }
  const capacities: Capacity[] = [];
  for (const [identity, group] of capacityGroups) {
    const seen = new Set<string>(),
      members = group
        .filter((i) => {
          const t = tasks[i]!,
            key = t.jointGroupId
              ? `joint:${t.jointGroupId}`
              : (transportGroups.get(t.id) ?? t.id);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((i) => ({
          variable: varIndex[i]!,
          offset: offset[i]!,
          duration: durations[i]!,
        }));
    if (members.length > 2) capacities.push({ identity, members, maximum: 1 });
  }
  if (source.participantMeals?.length)
    capacities.push({
      identity: "participant-meals",
      members: source.participantMeals.map((m) => {
        const i = byId.get(m.sourceTaskId)!;
        return {
          variable: varIndex[i]!,
          offset: offset[i]!,
          duration: m.duration,
        };
      }),
      maximum: source.participantMealCapacity!.maxSimultaneous,
    });
  const mains = tasks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.kind === "main");
  const distinct = [
    {
      members: mains.map(({ i }) => ({
        variable: varIndex[i]!,
        offset: offset[i]!,
      })),
      slots: mainSlots.slice().sort((a, b) => a - b),
    },
  ];
  const model = {
    variables: values.length,
    relations: relations.length,
    domains: values.map((v, i) => ({ id: ids[roots[i]!]!, count: v.length })),
    capacities: capacities.map((c) => ({
      identity: c.identity,
      maximum: c.maximum,
      members: c.members.map((m) => ({
        id: ids[roots[m.variable]!]!,
        offset: m.offset,
        duration: m.duration,
      })),
    })),
    groups: roots.map((r) => ids.filter((_, i) => root(i) === r)),
  };
  if (diagnostic) {
    const checked = new Map([
      ...diagnostic.tasks.map((t) => [t.id, t.start] as const),
      ...diagnostic.participantMeals.map(
        (t) => [t.sourceTaskId, t.start] as const,
      ),
      ...diagnostic.preparations.map((t) => [t.id, t.start] as const),
      ...diagnostic.roundPreparations.map((t) => [t.id, t.start] as const),
    ]);
    const point = roots.map((r) => checked.get(ids[r]!)! - offset[r]!);
    return {
      model,
      domainViolations: values.flatMap((v, i) =>
        v.includes(point[i]!) ? [] : [{ id: ids[roots[i]!]!, at: point[i] }],
      ),
      relationViolations: relations
        .filter((r) => !r.allows(point[r.a]!, point[r.b]!))
        .map((r) => ({
          a: ids[roots[r.a]!]!,
          b: ids[roots[r.b]!]!,
          aStart: point[r.a],
          bStart: point[r.b],
        })),
      equalityViolations: ids.filter(
        (id, i) => checked.get(id)! - offset[i] !== point[varIndex[i]!],
      ),
      conflicts,
    };
  }
  let witness: FutureJointCompletionWitnessV1 | null = null,
    rejected = 0;
  const result = impossible
    ? null
    : searchDomains(
        values,
        relations,
        consume,
        (solution) => {
          const starts = ids.map(
            (_, i) => solution[varIndex[i]!]! + offset[i]!,
          );
          const body = {
            kind: "JOINT_COMPLETION" as const,
            version: 1 as const,
            tasks: tasks.map(
              (t, i) =>
                fixedById.get(t.id) ?? {
                  ...t,
                  start: starts[i]!,
                  end: starts[i]! + t.duration,
                },
            ),
            preparations: prior.preparations.map((p) => ({
              ...p,
              start: starts[byId.get(p.id)!]!,
              end: starts[byId.get(p.id)!]! + p.duration,
            })),
            roundPreparations: prior.roundPreparations.map((p) => ({
              ...p,
              start: starts[byId.get(p.id)!]!,
              end: starts[byId.get(p.id)!]! + p.duration,
            })),
            participantMeals: (source.participantMeals ?? []).map((m) => ({
              id: m.id,
              sourceTaskId: m.sourceTaskId,
              participantId: m.participantId,
              duration: m.duration,
              start: starts[byId.get(m.sourceTaskId)!]!,
              end: starts[byId.get(m.sourceTaskId)!]! + m.duration,
            })),
            operationalMeals: structuredClone(prior.operationalMeals),
            spaceMeals: structuredClone(prior.spaceMeals),
          };
          const candidate = {
            ...body,
            fingerprint: createHash("sha256")
              .update(JSON.stringify(body))
              .digest("hex"),
          };
          const valid = revalidateJointCompletionWitness(
            source,
            candidate,
            fixed,
            consume,
          );
          if (valid === "PASS") {
            witness = candidate;
            return true;
          }
          if (valid === "BUDGET_EXHAUSTED")
            throw Object.assign(
              new Error("DIAGNOSTIC_LEDGER_EXHAUSTED_DURING_CERTIFICATION"),
              { outcome: "INCONCLUSIVE" },
            );
          rejected++;
          return false;
        },
        checkpoint,
        roots.map((r) =>
          Math.max(
            ...tasks.filter((t, i) => root(i) === r).map((t) => t.duration),
            1,
          ),
        ),
        capacities,
        distinct,
        roots.map((r, j) =>
          ids.filter((_, i) => root(i) === r).length > 1
            ? (old.get(ids[r]!)?.start ?? values[j]![0]!)
            : values[j]![0]!,
        ),
        stopAtFirstConflict,
      );
  return {
    result,
    witness: witness as FutureJointCompletionWitnessV1 | null,
    rejected,
    conflicts,
    model,
  };
}
