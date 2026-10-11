import { createHash } from "node:crypto";
import type { FutureStructuralWitness } from "./anonymousPipelineWitness";
import type { ScheduledTask, ScheduledRoundPreparation } from "./contracts";

export type FutureWitnessOutcome = "FOUND" | "DEAD_END" | "BUDGET_EXHAUSTED" | "INCONCLUSIVE";
type ExplorerOutcome = Exclude<FutureWitnessOutcome, "INCONCLUSIVE">;
/** Analytical state only. No placement in this context is an accepted decision. */
export interface FutureWitnessContext {
  readonly tasks: readonly ScheduledTask[];
  readonly roundPreparations: readonly ScheduledRoundPreparation[];
  readonly mealReservations: readonly { policyId: string; start: number; end: number }[];
}
export interface FutureWitnessCandidate {
  readonly witness: FutureStructuralWitness;
  readonly context: FutureWitnessContext;
}
export interface FutureWitnessUnit {
  readonly identity: string;
  /** Cheap material ordering: deadline, slack, negative load, stable identity. */
  readonly ordering: readonly number[];
  readonly priorFound: boolean;
  revalidate(context: FutureWitnessContext):
    | { status: "PASS"; candidate: FutureWitnessCandidate }
    | { status: "STALE" | "REJECT" | "BUDGET_EXHAUSTED"; reason: string };
  explore(context: FutureWitnessContext, continuation: (candidate: FutureWitnessCandidate) => ExplorerOutcome): ExplorerOutcome;
}
export interface FutureWitnessUnitEvidence {
  priorFound: boolean; priorRevalidation: string | null; priorTried: boolean;
  priorJointContinuationFailed: boolean; priorReused: boolean; fallbackEntered: boolean;
  candidateCount: number; rejectAuthority: string | null;
}
export interface FutureWitnessSetEvidence {
  futureWitnessSetSearchInvocations: number; futureWitnessSetUnits: number;
  futureWitnessSetCombinationsAttempted: number; futureWitnessSetBacktracks: number;
  futureWitnessSetBranchesConsumed: number; futureWitnessSetFound: number;
  futureWitnessSetInconclusiveCombinations: number;
  byIdentity: Record<string, FutureWitnessUnitEvidence>;
  finalSet: null | { identities: string[]; witnessFingerprints: string[]; fingerprint: string;
    ephemeralContextCount: number; mealReservations: FutureWitnessContext["mealReservations"]; totalBranches: number };
}
export function createFutureWitnessSetEvidence(): FutureWitnessSetEvidence {
  return { futureWitnessSetSearchInvocations: 0, futureWitnessSetUnits: 0,
    futureWitnessSetCombinationsAttempted: 0, futureWitnessSetBacktracks: 0,
    futureWitnessSetBranchesConsumed: 0, futureWitnessSetFound: 0, futureWitnessSetInconclusiveCombinations: 0, byIdentity: {}, finalSet: null };
}

/** Composes typed exact explorers through their continuations, without merging their identities. */
export function certifyFutureStructuralWitnessSet(units: readonly FutureWitnessUnit[], initial: FutureWitnessContext,
  globalGate: (context: FutureWitnessContext) => FutureWitnessOutcome,
  branches: () => number, evidence = createFutureWitnessSetEvidence()):
  { outcome: FutureWitnessOutcome; witnesses: FutureStructuralWitness[]; evidence: FutureWitnessSetEvidence } {
  const ordered = [...units].sort((a, b) => {
    for (let i = 0; i < Math.max(a.ordering.length, b.ordering.length); i++) {
      const delta = (a.ordering[i] ?? 0) - (b.ordering[i] ?? 0); if (delta) return delta;
    }
    return a.identity.localeCompare(b.identity, "en");
  });
  if (new Set(ordered.map(unit => unit.identity)).size !== ordered.length) throw new Error("Duplicate future unit identity");
  const before = branches(); let selected: FutureStructuralWitness[] = [], inconclusive = false;
  evidence.futureWitnessSetSearchInvocations++; evidence.futureWitnessSetUnits += ordered.length;
  const visit = (index: number, context: FutureWitnessContext, witnesses: FutureStructuralWitness[], reused: string[]): ExplorerOutcome => {
    if (index === ordered.length) {
      evidence.futureWitnessSetCombinationsAttempted++;
      const result = globalGate(context);
      if (result === "INCONCLUSIVE") {
        inconclusive = true; evidence.futureWitnessSetInconclusiveCombinations++;
        // Exact explorers use DEAD_END as "try the next candidate". Retain the
        // uncertainty separately so exhaustive traversal cannot prove infeasibility.
        return "DEAD_END";
      }
      if (result === "FOUND") {
        selected = [...witnesses]; evidence.futureWitnessSetFound++;
        const pairs = witnesses.map((witness, i) => [ordered[i]!.identity, witness.fingerprint]).sort(([a], [b]) => a!.localeCompare(b!));
        evidence.finalSet = { identities: pairs.map(pair => pair[0]!), witnessFingerprints: pairs.map(pair => pair[1]!),
          fingerprint: createHash("sha256").update(JSON.stringify(pairs)).digest("hex"),
          ephemeralContextCount: context.tasks.length - initial.tasks.length,
          mealReservations: structuredClone(context.mealReservations), totalBranches: branches() - before };
        for (const [identity, row] of Object.entries(evidence.byIdentity)) row.priorReused = reused.includes(identity);
      }
      return result;
    }
    const unit = ordered[index]!;
    const row = evidence.byIdentity[unit.identity] ??= { priorFound: unit.priorFound, priorRevalidation: null,
      priorTried: false, priorJointContinuationFailed: false, priorReused: false, fallbackEntered: false,
      candidateCount: 0, rejectAuthority: null };
    const continueWith = (candidate: FutureWitnessCandidate, prior: boolean): ExplorerOutcome => {
      row.candidateCount++;
      const result = visit(index + 1, candidate.context, [...witnesses, candidate.witness], prior ? [...reused, unit.identity] : reused);
      if (result === "DEAD_END") { evidence.futureWitnessSetBacktracks++; if (prior) row.priorJointContinuationFailed = true; }
      return result;
    };
    if (unit.priorFound) {
      const replay = unit.revalidate(context); row.priorRevalidation = replay.status;
      if (replay.status === "BUDGET_EXHAUSTED") { row.rejectAuthority = replay.reason; return "BUDGET_EXHAUSTED"; }
      if (replay.status === "PASS") {
        row.priorTried = true;
        const result = continueWith(replay.candidate, true); if (result !== "DEAD_END") return result;
      } else row.rejectAuthority = replay.reason;
    }
    row.fallbackEntered = true;
    return unit.explore(context, candidate => continueWith(candidate, false));
  };
  const outcome = visit(0, initial, [], []);
  evidence.futureWitnessSetBranchesConsumed += branches() - before;
  return { outcome: outcome === "DEAD_END" && inconclusive ? "INCONCLUSIVE" : outcome, witnesses: selected, evidence };
}
