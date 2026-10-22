import { continuityPenalty } from "./operationContinuity";
import type { FutureJointCompletionWitnessV1 } from "./anonymousPipelineWitness";
import type { PlannerNextProblem, ScheduledTask } from "./contracts";
import { ExactSearchTimeLimitReached, type ExactSearchLedger } from "./exactMainAndFeederCore";
import { PreparedFutureCollectiveParticipantClosure, type FutureCollectiveClosureResult } from "./futureCollectiveParticipantClosure";
import { fingerprintJointCompletionWitness, revalidateJointCompletionWitness } from "./jointCompletionWitness";
import { materializeTerminalTransportDetailed, type TransportMaterializationEvidence } from "./transportGrouping";

export interface EarlyClosureMaterializationEvidence {
  originalFingerprint: string;
  selectedFingerprint: string;
  closureTaskIds: string[];
  departureTaskIds: string[];
  matching: Record<string, number>;
  transport?: TransportMaterializationEvidence;
  outcome: string;
  moves: Array<{ taskId: string; from: number; to: number }>;
  branchesConsumed: number;
  stopReason: "COMPLETE" | "BRANCH_BUDGET_EXHAUSTED" | "TIME_LIMIT_REACHED";
}

/** Reconsider only visible, unprotected terminal work. Reuse the existing
 * closure matching and transport authorities; their failure is no impossibility
 * proof. The complete certified incumbent is retained until all gates pass. */
export function materializeEarlyClosure(source: PlannerNextProblem, original: FutureJointCompletionWitnessV1,
  originalClosure: FutureCollectiveClosureResult, visibleTaskIds: readonly string[],
  protectedTasks: readonly ScheduledTask[], ledger: ExactSearchLedger,
  acceptsProjection: (witness: FutureJointCompletionWitnessV1) => boolean) {
  let witness = original, closure = originalClosure;
  const before = ledger.branchesExplored;
  const visible = new Set(visibleTaskIds), fixed = new Set(protectedTasks.map(task => task.id));
  const departures = new Set((source.transportPolicy?.departure.taskIds ?? []).filter(id => visible.has(id) && !fixed.has(id)));
  const authority = new PreparedFutureCollectiveParticipantClosure(source);
  const participants = new Set(original.tasks.filter(task => departures.has(task.id)).map(task => task.participantId));
  const closures = new Set(authority.closureTaskIds().filter(id => {
    const task = source.tasks.find(task => task.id === id);
    return task?.kind === "auxiliary" && participants.has(task.participantId) && visible.has(id) && !fixed.has(id);
  }));
  const movable = new Set([...closures, ...departures]);
  const evidence: EarlyClosureMaterializationEvidence = { originalFingerprint: original.fingerprint,
    selectedFingerprint: original.fingerprint, closureTaskIds: [...closures].sort(), departureTaskIds: [...departures].sort(),
    matching: {}, outcome: "NO_VISIBLE_CLOSURE", moves: [], branchesConsumed: 0, stopReason: "COMPLETE" };
  const consume = () => {
    if (ledger.consume("STANDALONE")) return true;
    evidence.stopReason = "BRANCH_BUDGET_EXHAUSTED";
    return false;
  };
  try {
    if (departures.size) {
      // Monotonic local materialization: no participant or closure is delayed.
      // These bounds constrain only the proposal, never the original authority
      // or the semantics stored in the signed witness.
      const oldById = new Map(original.tasks.map(task => [task.id, task]));
      const bounded: PlannerNextProblem = { ...source, analyticalFutureParticipantClosure: undefined,
        tasks: source.tasks.map(task => movable.has(task.id) ? { ...task,
          availability: (task.availability?.length ? task.availability : [source.day])
            .flatMap(window => { const end = Math.min(window.end, oldById.get(task.id)!.end);
              return end > window.start ? [{ start: window.start, end }] : []; }) } : task) };
      // One charge for each rebuilt domain; matching and transport charge their
      // own alternatives through the same ledger.
      let ready = true;
      for (const _id of movable) if (!consume()) { ready = false; break; }
      if (ready) {
        const context = original.tasks.filter(task => !movable.has(task.id));
        const proposal = new PreparedFutureCollectiveParticipantClosure(bounded, context, {
          preserveFixedTransportDirections: ["arrival", "departure"], consumeIntervalBranch: consume,
          onEvidence: transport => { evidence.transport = transport; } })
          .evaluate(context, original.participantMeals, consume, "CERTIFY", original.spaceMeals);
        evidence.matching = proposal.matching;
        evidence.outcome = `MATCHING_${proposal.reason ?? proposal.status}`;
        if (proposal.certified) {
          const placed = original.tasks.filter(task => closures.has(task.id)).map(task => ({ ...task,
            start: proposal.matching[task.id]!, end: proposal.matching[task.id]! + task.duration }));
          const transport = materializeTerminalTransportDetailed(bounded, [...context, ...placed], original.participantMeals,
            { preserveFixedTransportDirections: ["arrival", "departure"], consumeFallbackBranch: consume, consumeIntervalBranch: consume });
          evidence.transport = transport.evidence;
          evidence.outcome = `TRANSPORT_${transport.status}`;
          if (transport.scheduled && consume()) {
            const replacements = new Map([...placed, ...transport.scheduled].map(task => [task.id, task]));
            const { fingerprint: _old, ...body } = original;
            const nextBody = { ...body, tasks: original.tasks.map(task => {
              const next = replacements.get(task.id);
              return next ? { ...task, start: next.start, end: next.end } : task;
            }) };
            const candidate = { ...nextBody, fingerprint: fingerprintJointCompletionWitness(nextBody) };
            const moves = candidate.tasks.filter(task => task.start !== oldById.get(task.id)!.start)
              .map(task => ({ taskId: task.id, from: oldById.get(task.id)!.start, to: task.start }));
            evidence.outcome = "NO_EARLIER_DEPARTURE";
            if (moves.some(move => departures.has(move.taskId)) && moves.every(move => movable.has(move.taskId) && move.to < move.from)) {
              const replay = revalidateJointCompletionWitness(source, candidate, protectedTasks, consume);
              evidence.outcome = replay;
              if (replay === "PASS") {
                const nextClosure = authority.evaluate(candidate.tasks, candidate.participantMeals, consume, "CERTIFY", candidate.spaceMeals);
                evidence.outcome = nextClosure.certified ? "PROJECTION_REJECTED" : `CLOSURE_${nextClosure.reason ?? nextClosure.status}`;
                if (nextClosure.certified && continuityPenalty(source,candidate.tasks)<=continuityPenalty(source,witness.tasks) && acceptsProjection(candidate)) {
                  witness = candidate; closure = nextClosure;
                  evidence.outcome = "CERTIFIED"; evidence.moves = moves;
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    if (!(error instanceof ExactSearchTimeLimitReached)) throw error;
    evidence.stopReason = "TIME_LIMIT_REACHED";
  }
  evidence.selectedFingerprint = witness.fingerprint;
  evidence.branchesConsumed = ledger.branchesExplored - before;
  return { witness, closure, evidence };
}
