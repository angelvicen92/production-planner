import { selectMostConstrainedUnit } from "../macroScheduling";

export type A3MiniKind = "PARTICIPANT_MEAL" | "RESOURCE_TASK" | "ROUND_SYNCHRONIZATION" | "SETUP_GROUP" | "TECHNICAL_CHAIN";

type Unit = {
  id: string; kind: A3MiniKind; slots: number[]; domainExact: boolean;
  hardResourceAvailabilityMinutes: number; exclusiveResourceCount: number;
  synchronizedSlotCount: number; totalDuration: number; affectedTaskCount: number;
};
type Placement = { id: string; slot: number };
export type A3MiniDecision = {
  unitId: string; kind: A3MiniKind; domainSize: number; domainExact: boolean; selectionReason: string;
  pendingStructuralObligations: string[]; firstImpossibleFutureAuthority: string | null;
  depth: number; frontier: string[]; branchesConsumed: number;
};

const phase: Record<A3MiniKind, number> = {
  PARTICIPANT_MEAL: 1, RESOURCE_TASK: 2, ROUND_SYNCHRONIZATION: 3, SETUP_GROUP: 4, TECHNICAL_CHAIN: 5,
};
const scarceUsers = new Set(["resource:scarce-unit", "round:reduced", "setup:family", "technical:flexible"]);
const units = (): Unit[] => [
  { id: "meal:operator", kind: "PARTICIPANT_MEAL", slots: [6], domainExact: false, hardResourceAvailabilityMinutes: 10,
    exclusiveResourceCount: 0, synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 1 },
  { id: "resource:scarce-unit", kind: "RESOURCE_TASK", slots: [2, 3, 4], domainExact: true, hardResourceAvailabilityMinutes: 30,
    exclusiveResourceCount: 1, synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 1 },
  { id: "round:reduced", kind: "ROUND_SYNCHRONIZATION", slots: [2, 3, 4], domainExact: false, hardResourceAvailabilityMinutes: 30,
    exclusiveResourceCount: 0, synchronizedSlotCount: 2, totalDuration: 20, affectedTaskCount: 2 },
  { id: "setup:family", kind: "SETUP_GROUP", slots: [2, 3, 4], domainExact: false, hardResourceAvailabilityMinutes: 30,
    exclusiveResourceCount: 0, synchronizedSlotCount: 0, totalDuration: 20, affectedTaskCount: 2 },
  { id: "technical:flexible", kind: "TECHNICAL_CHAIN", slots: [2, 5], domainExact: true, hardResourceAvailabilityMinutes: 20,
    exclusiveResourceCount: 0, synchronizedSlotCount: 0, totalDuration: 10, affectedTaskCount: 1 },
];

const available = (unit: Unit, placed: Placement[]): number[] => unit.slots.filter((slot) =>
  !placed.some((item) => item.slot === slot && scarceUsers.has(unit.id) && scarceUsers.has(item.id)));
const firstImpossible = (remaining: Unit[], placed: Placement[]): string | null => {
  const individual = remaining.find((unit) => available(unit, placed).length === 0);
  if (individual) return individual.id;
  const pendingScarce = remaining.filter(({ id }) => scarceUsers.has(id));
  const distinctSlots = new Set(pendingScarce.flatMap((unit) => available(unit, placed)));
  return distinctSlots.size < pendingScarce.length ? "scarce-unit-capacity" : null;
};
const reason = (selected: Unit & { domainSize: number }, candidates: Array<Unit & { domainSize: number }>): string => {
  if (candidates.some((candidate) => candidate.domainExact !== selected.domainExact)) return "mixed-domain-exact-mrv";
  return "minimum-macro-domain";
};

/** A benchmark-only discrete replay of the ordering decision; it does not alter Planner Next search. */
export function runA3Mini(method: "GLOBAL_SELECTOR" | "STRUCTURAL", branchBudget = 1) {
  const core = [{ id: "feeder", slot: 0, dependencies: [] as string[] },
    { id: "main", slot: 1, dependencies: ["feeder"] }];
  const remaining = units(), placed: Placement[] = [...core], trace: A3MiniDecision[] = [];
  let branchesConsumed = 0, exhausted = false;
  // The current pipeline reserves the meal before entering global macro selection.
  if (method === "GLOBAL_SELECTOR") {
    const mealIndex = remaining.findIndex(({ kind }) => kind === "PARTICIPANT_MEAL");
    const meal = remaining.splice(mealIndex, 1)[0]!;
    placed.push({ id: meal.id, slot: meal.slots[0]! });
    trace.push({ unitId: meal.id, kind: meal.kind, domainSize: 1, domainExact: meal.domainExact,
      selectionReason: "current-pre-macro-reservation", pendingStructuralObligations: remaining.sort((a, b) => phase[a.kind] - phase[b.kind]).map(({ id }) => id),
      firstImpossibleFutureAuthority: null, depth: 0, frontier: remaining.map(({ id }) => id).sort(), branchesConsumed });
  }
  while (remaining.length > 0) {
    const candidates = remaining.map((unit) => ({ ...unit, domainSize: available(unit, placed).length }));
    const selected = method === "GLOBAL_SELECTOR"
      ? selectMostConstrainedUnit(candidates)!
      : [...candidates].sort((a, b) => phase[a.kind] - phase[b.kind] || a.id.localeCompare(b.id))[0]!;
    const domain = available(selected, placed);
    let chosen: number | undefined;
    for (const slot of domain) {
      branchesConsumed += 1;
      const provisional = [...placed, { id: selected.id, slot }];
      const impossible = firstImpossible(remaining.filter(({ id }) => id !== selected.id), provisional);
      trace.push({ unitId: selected.id, kind: selected.kind, domainSize: domain.length, domainExact: selected.domainExact,
        selectionReason: method === "GLOBAL_SELECTOR" ? reason(selected, candidates) : "structural-phase-order",
        pendingStructuralObligations: remaining.filter(({ id }) => id !== selected.id).sort((a, b) => phase[a.kind] - phase[b.kind]).map(({ id }) => id),
        firstImpossibleFutureAuthority: impossible, depth: placed.length - core.length,
        frontier: remaining.map(({ id }) => id).sort(), branchesConsumed });
      if (!impossible) { chosen = slot; break; }
      if (branchesConsumed >= branchBudget) { exhausted = true; break; }
    }
    if (chosen === undefined) break;
    placed.push({ id: selected.id, slot: chosen });
    remaining.splice(remaining.findIndex(({ id }) => id === selected.id), 1);
  }
  return { status: remaining.length === 0 ? "COMPLETE" as const : exhausted ? "BUDGET_EXHAUSTED" as const : "INFEASIBLE" as const,
    hardValid: remaining.length === 0 && core.every((task) => task.dependencies.every((dependency) =>
      core.some((candidate) => candidate.id === dependency && candidate.slot < task.slot))),
    placements: placed, trace, branchesConsumed };
}
