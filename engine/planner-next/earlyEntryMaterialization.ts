import type { FutureJointCompletionWitnessV1 } from "./anonymousPipelineWitness";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { ExactSearchTimeLimitReached, type ExactSearchLedger } from "./exactMainAndFeederCore";
import { PreparedFutureCollectiveParticipantClosure, type FutureCollectiveClosureResult } from "./futureCollectiveParticipantClosure";
import { fingerprintJointCompletionWitness, revalidateJointCompletionWitness } from "./jointCompletionWitness";
import { canPlaceTask, exactTaskStartDomain } from "./placement";

export interface EarlyEntryMaterializationEvidence {
  originalFingerprint: string;
  selectedFingerprint: string;
  taskOrder: Array<{ taskId: string; earlierStartCount: number; availabilityEnd: number }>;
  attempts: Array<{ taskId: string; start: number; outcome: string }>;
  moves: Array<{ taskId: string; from: number; to: number }>;
  branchesConsumed: number;
  stopReason: "COMPLETE" | "BRANCH_BUDGET_EXHAUSTED" | "TIME_LIMIT_REACHED";
}

/** Nominal materialization of visible pipeline entries, after the original full
 * replay/closure has passed. Every other vertex stays fixed, including IN and
 * future work. A failed or interrupted improvement keeps the last certificate. */
export function materializeEarlyEntries(source: PlannerNextProblem, original: FutureJointCompletionWitnessV1,
  originalClosure: FutureCollectiveClosureResult, visibleTaskIds: readonly string[],
  protectedTasks: readonly ScheduledTask[], ledger: ExactSearchLedger,
  acceptsProjection: (witness: FutureJointCompletionWitnessV1) => boolean) {
  let witness = original, closure = originalClosure;
  const before = ledger.branchesExplored;
  const evidence: EarlyEntryMaterializationEvidence = { originalFingerprint: original.fingerprint,
    selectedFingerprint: original.fingerprint, taskOrder: [], attempts: [], moves: [], branchesConsumed: 0, stopReason: "COMPLETE" };
  const visible = new Set(visibleTaskIds), fixed = new Set(protectedTasks.map(task => task.id));
  const arrivals = new Set(source.transportPolicy?.arrival.taskIds ?? []);
  // Same structural identity used by the existing pipeline certificate producer.
  const entries = source.tasks.filter(task => task.kind === "auxiliary" && visible.has(task.id) && !fixed.has(task.id)
    && !arrivals.has(task.id) && task.dependencies.some(id => arrivals.has(id))
    && source.tasks.some(main => main.kind === "main" && main.participantId === task.participantId && main.dependencies.includes(task.id)));
  const consume = () => {
    if (ledger.consume("STANDALONE")) return true;
    evidence.stopReason = "BRANCH_BUDGET_EXHAUSTED";
    return false;
  };
  const authority = new PreparedFutureCollectiveParticipantClosure(source);
  try {
    const ranked = [];
    for (const task of entries) {
      if (!consume()) break;
      const placed = witness.tasks.find(item => item.id === task.id)!;
      const domain = exactTaskStartDomain(source, placed, witness.tasks.filter(item => item.id !== task.id), [...witness.spaceMeals]);
      const earlierStartCount = [...domain.starts()].filter(start => start < placed.start).length;
      const availabilityEnd = Math.max(...(source.participants.find(person => person.id === task.participantId)?.availability ?? [source.day]).map(window => window.end));
      ranked.push({ taskId: task.id, earlierStartCount, availabilityEnd });
    }
    // Local exact domain pressure, then effective availability; identity only
    // breaks operational ties. This does not reorder structural construction.
    ranked.sort((a, b) => a.earlierStartCount - b.earlierStartCount || a.availabilityEnd - b.availabilityEnd || a.taskId.localeCompare(b.taskId));
    evidence.taskOrder = ranked;
    for (const row of ranked) {
      if (evidence.stopReason !== "COMPLETE" || !consume()) break;
      const task = witness.tasks.find(item => item.id === row.taskId)!;
      const others = witness.tasks.filter(item => item.id !== task.id);
      const domain = exactTaskStartDomain(source, task, others, [...witness.spaceMeals]);
      for (const start of domain.starts()) {
        if (start >= task.start || !consume()) break;
        const attempt = { taskId: task.id, start, outcome: "PLACEMENT_REJECTED" };
        evidence.attempts.push(attempt);
        if (!canPlaceTask(source, task, start, others, [...witness.spaceMeals])) continue;
        const { fingerprint: _old, ...body } = witness;
        const nextBody = { ...body, tasks: witness.tasks.map(item => item.id === task.id ? { ...item, start, end: start + item.duration } : item) };
        const candidate = { ...nextBody, fingerprint: fingerprintJointCompletionWitness(nextBody) };
        const replay = revalidateJointCompletionWitness(source, candidate, protectedTasks, consume);
        attempt.outcome = replay;
        if (replay === "BUDGET_EXHAUSTED") break;
        if (replay !== "PASS") continue;
        const nextClosure = authority.evaluate(candidate.tasks, candidate.participantMeals, consume, "CERTIFY", candidate.spaceMeals);
        attempt.outcome = nextClosure.certified ? "PROJECTION_REJECTED" : `CLOSURE_${nextClosure.reason ?? nextClosure.status}`;
        if (!nextClosure.certified || !acceptsProjection(candidate)) continue;
        witness = candidate; closure = nextClosure;
        attempt.outcome = "CERTIFIED";
        evidence.moves.push({ taskId: task.id, from: task.start, to: start });
        break;
      }
    }
  } catch (error) {
    if (!(error instanceof ExactSearchTimeLimitReached)) throw error;
    evidence.stopReason = "TIME_LIMIT_REACHED";
  }
  evidence.branchesConsumed = ledger.branchesExplored - before;
  evidence.selectedFingerprint = witness.fingerprint;
  return { witness, closure, evidence };
}
