export interface MacroUnitConstrainedness {
  readonly id: string;
  readonly domainSize: number;
  readonly domainExact: boolean;
  readonly hardResourceAvailabilityMinutes: number;
  readonly exclusiveResourceCount: number;
  readonly synchronizedSlotCount: number;
  readonly totalDuration: number;
  readonly affectedTaskCount: number;
}

const compareSemanticConstrainedness = (a: MacroUnitConstrainedness, b: MacroUnitConstrainedness): number =>
  a.hardResourceAvailabilityMinutes - b.hardResourceAvailabilityMinutes
  || b.exclusiveResourceCount - a.exclusiveResourceCount
  || b.synchronizedSlotCount - a.synchronizedSlotCount
  || b.totalDuration - a.totalDuration
  || b.affectedTaskCount - a.affectedTaskCount
  || a.id.localeCompare(b.id, "en");

/**
 * Exact domains use MRV. For mixed measures, each class elects its own candidate
 * before a class policy is applied: a certified singleton remains forced;
 * otherwise the winners from each measurement class are compared by semantic
 * pressure. A sound zero remains stronger than either policy.
 */
export function selectMostConstrainedUnit<T extends MacroUnitConstrainedness>(units: readonly T[]): T | undefined {
  const zeros = units.filter(({ domainSize, domainExact }) => domainSize === 0 && domainExact).sort(compareSemanticConstrainedness);
  if (zeros.length > 0) return zeros[0] as T;
  const exact = units.filter(({ domainExact }) => domainExact).sort((a, b) =>
    a.domainSize - b.domainSize || compareSemanticConstrainedness(a, b));
  const inexact = units.filter(({ domainExact }) => !domainExact).sort(compareSemanticConstrainedness);
  if (exact.length === 0) return inexact[0] as T | undefined;
  if (inexact.length === 0) return exact[0] as T;
  if (exact[0]!.domainSize === 1) return exact[0] as T;
  return compareSemanticConstrainedness(exact[0]!, inexact[0]!) <= 0 ? exact[0] as T : inexact[0] as T;
}

export interface ExactSlotMatchingEvidence {
  edgeChecks: number;
  augmentingPaths: number;
}

/**
 * Canonical exact bipartite matching. Augmenting paths preserve completeness
 * (unlike first-fit greedy) without enumerating participant permutations.
 */
export function findCanonicalPerfectMatching(
  slotIds: readonly string[],
  itemIds: readonly string[],
  compatible: (itemId: string, slotId: string) => boolean,
  evidence?: ExactSlotMatchingEvidence,
): ReadonlyMap<string, string> | null {
  const slots = [...slotIds].sort((a, b) => a.localeCompare(b, "en"));
  const items = [...itemIds].sort((a, b) => a.localeCompare(b, "en"));
  if (slots.length !== items.length || new Set(slots).size !== slots.length || new Set(items).size !== items.length) return null;
  const edges = new Map(items.map((item) => [item, slots.filter((slot) => {
    if (evidence) evidence.edgeChecks += 1;
    return compatible(item, slot);
  })]));
  const slotToItem = new Map<string, string>();
  const augment = (item: string, seen: Set<string>): boolean => {
    for (const slot of edges.get(item) ?? []) {
      if (seen.has(slot)) continue;
      seen.add(slot);
      const incumbent = slotToItem.get(slot);
      if (incumbent === undefined || augment(incumbent, seen)) {
        slotToItem.set(slot, item);
        if (evidence) evidence.augmentingPaths += 1;
        return true;
      }
    }
    return false;
  };
  for (const item of items) if (!augment(item, new Set())) return null;
  return new Map([...slotToItem].sort(([a], [b]) => a.localeCompare(b, "en")));
}
