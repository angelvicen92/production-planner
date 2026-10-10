// Diagnostic finite-domain experiment only. Never imported by the production planner.
export interface Relation {
  a: number;
  b: number;
  allows: (a: number, b: number) => boolean;
}
export interface Capacity {
  identity?: string;
  members: { variable: number; offset: number; duration: number }[];
  maximum: number;
}
export interface Distinct {
  members: { variable: number; offset: number }[];
  slots: number[];
}
export interface DomainSearchStats {
  decisions: number;
  propagations: number;
  revisions: number;
  supportChecks: number;
  leaves: number;
  backtracks: number;
  maximumDepth: number;
  variables: number;
  relations: number;
  backjumps: number;
  firstPath: number[];
  zeroDomainFailures: Record<string, number>;
  capacityFailures: Record<string, number>;
  nogoods: number;
  nogoodHits: number;
  nogoodLengths: number[];
  deepestAssignments: Record<string, number>;
  firstConflict: null | {
    variable: number;
    relation: { from: number; to: number };
    explanationVariables: number[];
    assignedValues: Record<string, number>;
    remainingDomains: number[][];
  };
}
export function searchDomains(
  values: number[][],
  relations: Relation[],
  consume: () => boolean,
  accept: (values: number[]) => boolean,
  checkpoint: () => void = () => {},
  priority: number[] = values.map(() => 0),
  capacities: Capacity[] = [],
  distinct: Distinct[] = [],
  preferred: number[] = [],
  stopAtFirstConflict = false,
) {
  if (
    values.some((domain) =>
      domain.some(
        (value, index) =>
          !Number.isFinite(value) || (index > 0 && domain[index - 1]! >= value),
      ),
    )
  )
    throw Error("UNSUPPORTED_DIAGNOSTIC_DOMAIN_ORDER");
  const stats: DomainSearchStats = {
    decisions: 0,
    propagations: 0,
    revisions: 0,
    supportChecks: 0,
    leaves: 0,
    backtracks: 0,
    maximumDepth: 0,
    variables: values.length,
    relations: relations.length,
    backjumps: 0,
    firstPath: [],
    zeroDomainFailures: {},
    capacityFailures: {},
    nogoods: 0,
    nogoodHits: 0,
    nogoodLengths: [],
    deepestAssignments: {},
    firstConflict: null,
  };
  const observedCheckpoint = checkpoint;
  checkpoint = () => {
    try {
      observedCheckpoint();
    } catch (e) {
      Object.assign(e as object, { stats });
      throw e;
    }
  };
  const widths = values.map((v) => Math.ceil(v.length / 32)),
    offsets: number[] = [];
  let words = 0;
  for (const w of widths) {
    offsets.push(words);
    words += w;
  }
  const initial = new Uint32Array(words);
  for (let i = 0; i < values.length; i++)
    for (let v = 0; v < values[i]!.length; v++)
      initial[offsets[i]! + (v >>> 5)]! |= 1 << (v & 31);
  type Arc = {
    from: number;
    to: number;
    supports: Uint32Array[];
    relation: number;
  };
  const arcs: Arc[] = [],
    incoming: number[][] = values.map(() => []),
    weights = relations.map(() => 1);
  for (const relation of relations) {
    if (!consume())
      return { outcome: "BUDGET_EXHAUSTED", stats, solution: null };
    checkpoint();
    const { a, b } = relation;
    const ab = values[a]!.map(() => new Uint32Array(widths[b])),
      ba = values[b]!.map(() => new Uint32Array(widths[a]));
    for (let i = 0; i < values[a]!.length; i++)
      for (let j = 0; j < values[b]!.length; j++)
        if (relation.allows(values[a]![i]!, values[b]![j]!)) {
          ab[i]![j >>> 5]! |= 1 << (j & 31);
          ba[j]![i >>> 5]! |= 1 << (i & 31);
        }
    const ri = arcs.length / 2;
    incoming[b]!.push(arcs.length);
    arcs.push({ from: a, to: b, supports: ab, relation: ri });
    incoming[a]!.push(arcs.length);
    arcs.push({ from: b, to: a, supports: ba, relation: ri });
  }
  let budget = false,
    solution: number[] | null = null;
  const count = (state: Uint32Array, i: number) => {
    let total = 0;
    for (let w = 0; w < widths[i]!; w++) {
      let n = state[offsets[i]! + w]!;
      while (n) {
        n &= n - 1;
        total++;
      }
    }
    return total;
  };
  const reasonWidth = Math.ceil(values.length / 32),
    valueOffsets: number[] = [];
  let valueCount = 0;
  for (const v of values) {
    valueOffsets.push(valueCount);
    valueCount += v.length;
  }
  type Reasons = (Uint32Array | undefined)[];
  const initialReasons: Reasons = Array(valueCount);
  let conflict = new Uint32Array(reasonWidth);
  const merge = (
    into: Uint32Array,
    intoOffset: number,
    from: Uint32Array,
    fromOffset: number,
  ) => {
    for (let w = 0; w < reasonWidth; w++)
      into[intoOffset + w]! |= from[fromOffset + w]!;
  };
  const indices = (state: Uint32Array, i: number) => {
    const result: number[] = [];
    for (let w = 0; w < widths[i]!; w++) {
      let bits = state[offsets[i]! + w]!;
      while (bits) {
        const bit = bits & -bits;
        bits ^= bit;
        result.push((w << 5) + (31 - Math.clz32(bit)));
      }
    }
    return result;
  };
  const reasonAt = (reasons: Reasons, variable: number, vi: number) =>
    reasons[valueOffsets[variable]! + vi];
  const domainReason = (
    state: Uint32Array,
    reasons: Reasons,
    variable: number,
    predicate: (vi: number) => boolean = () => true,
  ) => {
    const result = new Uint32Array(reasonWidth);
    for (let vi = 0; vi < values[variable]!.length; vi++)
      if (
        !(state[offsets[variable]! + (vi >>> 5)]! & (1 << (vi & 31))) &&
        predicate(vi)
      ) {
        const why = reasonAt(reasons, variable, vi);
        if (why) merge(result, 0, why, 0);
      }
    return result;
  };
  const trail = values.map(() => -1),
    nogoods: { variable: number; vi: number }[][] = [],
    learned = new Set<string>();
  const learn = () => {
    const atoms = trail.flatMap((vi, variable) =>
      vi >= 0 && conflict[variable >>> 5]! & (1 << (variable & 31))
        ? [{ variable, vi }]
        : [],
    );
    if (!atoms.length) return;
    const key = atoms.map((a) => `${a.variable}:${a.vi}`).join("|");
    if (!learned.has(key)) {
      learned.add(key);
      nogoods.push(atoms);
      stats.nogoods++;
      stats.nogoodLengths.push(atoms.length);
    }
  };
  const propagate = (
    state: Uint32Array,
    reasons: Reasons,
    seeds: number[],
  ): boolean => {
    if (!consume()) {
      budget = true;
      return false;
    }
    stats.propagations++;
    const queue = [...seeds],
      queued = new Uint8Array(arcs.length);
    for (const a of queue) queued[a] = 1;
    for (let qi = 0; qi <= queue.length; qi++) {
      if (qi === queue.length) {
        let changed = false;
        for (const nogood of nogoods) {
          let contradicted = false,
            unknown = -1,
            multiple = false;
          const why = new Uint32Array(reasonWidth);
          for (let i = 0; i < nogood.length; i++) {
            const atom = nogood[i]!;
            if (
              !(
                state[offsets[atom.variable]! + (atom.vi >>> 5)]! &
                (1 << (atom.vi & 31))
              )
            ) {
              contradicted = true;
              break;
            }
            if (count(state, atom.variable) > 1) {
              if (unknown !== -1) {
                multiple = true;
                break;
              }
              unknown = i;
            } else
              merge(why, 0, domainReason(state, reasons, atom.variable), 0);
          }
          if (contradicted || multiple) continue;
          stats.nogoodHits++;
          if (unknown === -1) {
            conflict = why;
            return false;
          }
          const atom = nogood[unknown]!;
          state[offsets[atom.variable]! + (atom.vi >>> 5)]! &= ~(
            1 <<
            (atom.vi & 31)
          );
          reasons[valueOffsets[atom.variable]! + atom.vi] = why;
          changed = true;
          for (const ai of incoming[atom.variable]!)
            if (!queued[ai]) {
              queue.push(ai);
              queued[ai] = 1;
            }
        }
        for (const all of distinct) {
          const edges = all.members.map((m) =>
            indices(state, m.variable)
              .map((vi) => ({
                vi,
                slot: all.slots.indexOf(values[m.variable]![vi]! + m.offset),
              }))
              .filter((e) => e.slot >= 0),
          );
          const matched = all.slots.map(() => -1),
            varMatch = all.members.map(() => -1);
          const augment = (v: number, seen: Set<number>): boolean => {
            for (const e of edges[v]!) {
              if (seen.has(e.slot)) continue;
              seen.add(e.slot);
              if (matched[e.slot] === -1 || augment(matched[e.slot]!, seen)) {
                matched[e.slot] = v;
                varMatch[v] = e.slot;
                return true;
              }
            }
            return false;
          };
          const why = new Uint32Array(reasonWidth);
          for (const m of all.members)
            merge(why, 0, domainReason(state, reasons, m.variable), 0);
          if (!all.members.every((_, i) => augment(i, new Set()))) {
            conflict = why;
            return false;
          }
          if (all.members.length !== all.slots.length) continue;
          const n = all.members.length,
            adj: number[][] = Array.from(
              { length: n + all.slots.length },
              () => [],
            );
          for (let v = 0; v < n; v++)
            for (const e of edges[v]!)
              if (varMatch[v] === e.slot) adj[n + e.slot]!.push(v);
              else adj[v]!.push(n + e.slot);
          const index = adj.map(() => -1),
            low = adj.map(() => 0),
            stack: number[] = [],
            on = adj.map(() => false),
            scc = adj.map(() => -1);
          let at = 0,
            component = 0;
          const tarjan = (v: number) => {
            index[v] = low[v] = at++;
            stack.push(v);
            on[v] = true;
            for (const w of adj[v]!) {
              if (index[w] === -1) {
                tarjan(w);
                low[v] = Math.min(low[v]!, low[w]!);
              } else if (on[w]) low[v] = Math.min(low[v]!, index[w]!);
            }
            if (low[v] === index[v]) {
              let w;
              do {
                w = stack.pop()!;
                on[w] = false;
                scc[w] = component;
              } while (w !== v);
              component++;
            }
          };
          for (let v = 0; v < adj.length; v++) if (index[v] === -1) tarjan(v);
          for (let v = 0; v < n; v++)
            for (const e of edges[v]!)
              if (e.slot !== varMatch[v] && scc[v] !== scc[n + e.slot]) {
                const variable = all.members[v]!.variable;
                state[offsets[variable]! + (e.vi >>> 5)]! &= ~(
                  1 <<
                  (e.vi & 31)
                );
                reasons[valueOffsets[variable]! + e.vi] = why;
                changed = true;
                for (const ai of incoming[variable]!)
                  if (!queued[ai]) {
                    queue.push(ai);
                    queued[ai] = 1;
                  }
              }
        }
        for (
          let capacityIndex = 0;
          capacityIndex < capacities.length;
          capacityIndex++
        ) {
          const capacity = capacities[capacityIndex]!;
          const bounds = capacity.members.map((m) => {
            const available = indices(state, m.variable);
            return {
              ...m,
              lo: values[m.variable]![available[0]!]! + m.offset,
              hi:
                values[m.variable]![available.at(-1)!]! + m.offset + m.duration,
            };
          });
          // Every job whose entire feasible span lies within a window must fit there.
          const starts = [...new Set(bounds.map((b) => b.lo))],
            ends = [...new Set(bounds.map((b) => b.hi))];
          for (const lo of starts) {
            const inside = bounds
              .filter((b) => b.lo >= lo)
              .sort((a, b) => a.hi - b.hi);
            let energy = 0;
            for (const b of inside) {
              energy += b.duration;
              if (energy > capacity.maximum * (b.hi - lo)) {
                stats.capacityFailures[capacityIndex] =
                  (stats.capacityFailures[capacityIndex] ?? 0) + 1;
                conflict = new Uint32Array(reasonWidth);
                for (const member of inside.filter((x) => x.hi <= b.hi))
                  merge(
                    conflict,
                    0,
                    domainReason(state, reasons, member.variable),
                    0,
                  );
                return false;
              }
            }
            for (const hi of ends) {
              if (hi <= lo) continue;
              const overlap = (s: number, duration: number) =>
                Math.max(0, Math.min(hi, s + duration) - Math.max(lo, s));
              const energies = bounds.map((b) =>
                Math.min(
                  overlap(b.lo, b.duration),
                  overlap(b.hi - b.duration, b.duration),
                ),
              );
              const total = energies.reduce((a, b) => a + b, 0),
                slack = capacity.maximum * (hi - lo) - total;
              if (slack < 0) {
                stats.capacityFailures[capacityIndex] =
                  (stats.capacityFailures[capacityIndex] ?? 0) + 1;
                conflict = new Uint32Array(reasonWidth);
                bounds.forEach((b, i) => {
                  if (energies[i]! > 0)
                    merge(
                      conflict,
                      0,
                      domainReason(
                        state,
                        reasons,
                        b.variable,
                        (vi) =>
                          overlap(
                            values[b.variable]![vi]! + b.offset,
                            b.duration,
                          ) < energies[i]!,
                      ),
                      0,
                    );
                });
                return false;
              }
              for (let i = 0; i < bounds.length; i++) {
                const b = bounds[i]!,
                  limit = slack + energies[i]!;
                if (limit >= Math.min(b.duration, hi - lo)) continue;
                const removed = indices(state, b.variable).filter(
                  (vi) =>
                    overlap(values[b.variable]![vi]! + b.offset, b.duration) >
                    limit,
                );
                if (!removed.length) continue;
                const why = new Uint32Array(reasonWidth);
                bounds.forEach((member, j) => {
                  if (j !== i && energies[j]! > 0)
                    merge(
                      why,
                      0,
                      domainReason(
                        state,
                        reasons,
                        member.variable,
                        (vi) =>
                          overlap(
                            values[member.variable]![vi]! + member.offset,
                            member.duration,
                          ) < energies[j]!,
                      ),
                      0,
                    );
                });
                for (const vi of removed) {
                  state[offsets[b.variable]! + (vi >>> 5)]! &= ~(
                    1 <<
                    (vi & 31)
                  );
                  reasons[valueOffsets[b.variable]! + vi] = why;
                }
                changed = true;
                if (count(state, b.variable) === 0) {
                  conflict = domainReason(state, reasons, b.variable);
                  return false;
                }
                for (const ai of incoming[b.variable]!)
                  if (!queued[ai]) {
                    queue.push(ai);
                    queued[ai] = 1;
                  }
              }
            }
          }
        }
        if (!changed) break;
        // Process newly affected binary arcs, then recheck the global fixed point.
        if (qi === queue.length) break;
      }
      if ((qi & 255) === 0) checkpoint();
      const ai = queue[qi]!,
        arc = arcs[ai]!;
      queued[ai] = 0;
      stats.revisions++;
      let changed = false;
      for (let w = 0; w < widths[arc.from]!; w++) {
        const index = offsets[arc.from]! + w;
        let bits = state[index]!;
        while (bits) {
          const bit = bits & -bits,
            vi = (w << 5) + (31 - Math.clz32(bit));
          bits ^= bit;
          const support = arc.supports[vi]!;
          let found = false;
          for (let k = 0; k < support.length; k++) {
            stats.supportChecks++;
            if (support[k]! & state[offsets[arc.to]! + k]!) {
              found = true;
              break;
            }
          }
          if (!found) {
            state[index]! &= ~bit;
            changed = true;
            const why = new Uint32Array(reasonWidth);
            for (let k = 0; k < support.length; k++) {
              let supported = support[k]!;
              while (supported) {
                const supportBit = supported & -supported;
                supported ^= supportBit;
                const otherVi = (k << 5) + (31 - Math.clz32(supportBit)),
                  proof = reasonAt(reasons, arc.to, otherVi);
                if (proof) merge(why, 0, proof, 0);
              }
            }
            reasons[valueOffsets[arc.from]! + vi] = why;
          }
        }
      }
      if (changed) {
        if (count(state, arc.from) === 0) {
          stats.zeroDomainFailures[arc.from] =
            (stats.zeroDomainFailures[arc.from] ?? 0) + 1;
          weights[arc.relation]!++;
          conflict = domainReason(state, reasons, arc.from);
          if (!stats.firstConflict) {
            stats.firstConflict = {
              variable: arc.from,
              relation: { from: arc.from, to: arc.to },
              explanationVariables: values.flatMap((_, i) =>
                conflict[i >>> 5]! & (1 << (i & 31)) ? [i] : [],
              ),
              assignedValues: Object.fromEntries(
                trail.flatMap((vi, i) =>
                  vi >= 0 ? [[i, values[i]![vi]]] : [],
                ),
              ),
              remainingDomains: values.map((domain, i) =>
                indices(state, i).map((vi) => domain[vi]!),
              ),
            };
          }
          if (stopAtFirstConflict)
            throw Object.assign(
              new Error("DIAGNOSTIC_FIRST_CONFLICT_CAPTURED"),
              { stats },
            );

          return false;
        }
        for (const a of incoming[arc.from]!)
          if (!queued[a]) {
            queue.push(a);
            queued[a] = 1;
          }
      }
    }
    return values.every((_, i) => count(state, i) > 0);
  };
  const dfs = (
    state: Uint32Array,
    reasons: Reasons,
    depth: number,
  ): boolean => {
    if (depth > stats.maximumDepth) {
      stats.maximumDepth = depth;
      stats.deepestAssignments = Object.fromEntries(
        trail.flatMap((vi, v) => (vi >= 0 ? [[v, values[v]![vi]]] : [])),
      );
    }
    while (true) {
      let selected = -1,
        best = Infinity;
      const counts = values.map((_, i) => count(state, i));
      for (let i = 0; i < values.length; i++) {
        const n = counts[i]!;
        if (n === 0) {
          conflict = domainReason(state, reasons, i);
          return false;
        }
        if (n > 1) {
          const weight = incoming[i]!.reduce(
            (sum, a) =>
              sum +
              (counts[arcs[a]!.from]! > 1 ? weights[arcs[a]!.relation]! : 0),
            0,
          );
          const score = n / ((1 + weight) * (priority[i] || 1));
          if (score < best) {
            best = score;
            selected = i;
          }
        }
      }
      if (selected === -1) {
        stats.leaves++;
        const result = values.map((v, i) => v[indices(state, i)[0]!]!);
        if (accept(result)) {
          solution = result;
          return true;
        }
        conflict = new Uint32Array(reasonWidth);
        for (let i = 0; i < values.length; i++)
          merge(conflict, 0, domainReason(state, reasons, i), 0);
        return false;
      }
      if (stats.firstPath.length === depth) stats.firstPath.push(selected);
      const vi = indices(state, selected).sort(
        (a, b) =>
          Math.abs(values[selected]![a]! - preferred[selected]!) -
            Math.abs(values[selected]![b]! - preferred[selected]!) ||
          values[selected]![a]! - values[selected]![b]!,
      )[0]!;
      if (!consume()) {
        budget = true;
        return false;
      }
      stats.decisions++;
      const branch = state.slice();
      for (let w = 0; w < widths[selected]!; w++)
        branch[offsets[selected]! + w] = 0;
      branch[offsets[selected]! + (vi >>> 5)] = 1 << (vi & 31);
      const branchReasons = reasons.slice(),
        choice = new Uint32Array(reasonWidth);
      choice[selected >>> 5]! |= 1 << (selected & 31);
      for (const other of indices(state, selected))
        if (other !== vi)
          branchReasons[valueOffsets[selected]! + other] = choice;
      trail[selected] = vi;
      if (
        propagate(branch, branchReasons, incoming[selected]!) &&
        dfs(branch, branchReasons, depth + 1)
      )
        return true;
      if (!budget) learn();
      trail[selected] = -1;
      if (budget) return false;
      stats.backtracks++;
      if (!(conflict[selected >>> 5]! & (1 << (selected & 31)))) {
        stats.backjumps++;
        return false;
      }
      // Refuting this value is a scoped nogood. Propagate the retained domain,
      // rather than repeatedly restoring it and hiding all the failed values.
      conflict[selected >>> 5]! &= ~(1 << (selected & 31));
      state[offsets[selected]! + (vi >>> 5)]! &= ~(1 << (vi & 31));
      reasons[valueOffsets[selected]! + vi] = conflict.slice();
      if (!propagate(state, reasons, incoming[selected]!)) return false;
    }
  };
  if (
    propagate(
      initial,
      initialReasons,
      arcs.map((_, i) => i),
    )
  )
    dfs(initial, initialReasons, 0);
  return {
    outcome: solution
      ? "COMPLETE"
      : budget
        ? "BUDGET_EXHAUSTED"
        : "EXHAUSTED_RESTRICTED",
    stats,
    solution,
  };
}
