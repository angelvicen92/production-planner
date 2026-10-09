import type { PlannerNextProblem, ScheduledParticipantMeal, ScheduledTask } from "../contracts";
import { PreparedFutureCollectiveParticipantClosure } from "../futureCollectiveParticipantClosure";
import { PreparedFutureTechnicalChainAuthority } from "../technicalChainFutureFeasibility";
import { assessParticipantMealFutureFeasibility } from "../participantMeals";
import { materializeTerminalTransportDetailed } from "../transportGrouping";
import { validatePlan } from "../validate";
import { createExactSearchLedger } from "../exactMainAndFeederCore";

export interface ClosureSufficiencyProbeResult {
  outcome: "CERTIFIED_FRONTIER" | "REJECTED_CANDIDATE" | "INCONCLUSIVE" | "BUDGET_EXHAUSTED";
  branches: number;
  candidates: number;
  missingContextTaskIds: string[];
  reason: string;
  /** Execution-local analytical geometry, never a proposal or accepted placement. */
  witness: null | { tasks: ScheduledTask[]; meals: ScheduledParticipantMeal[]; fingerprint: string };
}

/** Diagnostic adapter for ONE existing exact technical-chain explorer and its
 * meal/closure/OUT continuation. This is intentionally not a residual scheduler:
 * an uncovered task, multiple chains or unsupported continuation stays unknown.
 * The caller supplies accepted/current placements; no historical hint is used. */
export function probeSingleChainClosureContinuation(source: PlannerNextProblem,
  fixed: readonly ScheduledTask[]): ClosureSufficiencyProbeResult {
  const problem = structuredClone(source), protectedById = new Map(fixed.map(task => [task.id, task]));
  const constrain = (task: PlannerNextProblem["tasks"][number]) => {
    const accepted = protectedById.get(task.id);
    return accepted ? { ...task, availability: [{ start: accepted.start, end: accepted.end }] } : task;
  };
  problem.tasks = problem.tasks.map(constrain);
  problem.analyticalFutureTechnicalChains = problem.analyticalFutureTechnicalChains?.map(chain =>
    ({ ...chain, tasks: chain.tasks.map(constrain) }));
  const ledger = createExactSearchLedger(problem.budget.maxBranchExpansions);
  const closure = new PreparedFutureCollectiveParticipantClosure(problem);
  const chains = problem.analyticalFutureTechnicalChains ?? [];
  const supplied = new Set([...fixed.map(task => task.id), ...chains.flatMap(chain => chain.tasks.map(task => task.id))]);
  const missingContextTaskIds = closure.pendingPredecessorTaskIds(fixed).filter(id => !supplied.has(id));
  let candidates = 0;
  const result = (outcome: ClosureSufficiencyProbeResult["outcome"], reason: string,
    witness: ClosureSufficiencyProbeResult["witness"] = null): ClosureSufficiencyProbeResult =>
    ({ outcome, reason, branches: ledger.branchesExplored, candidates, missingContextTaskIds, witness });
  if (missingContextTaskIds.length) return result("INCONCLUSIVE", "UNCOVERED_RESIDUAL_TASKS");
  if (chains.length !== 1) return result("INCONCLUSIVE", "ONE_CHAIN_EXPERIMENT_ONLY");
  // The explorer constructs the complete atomic chain. Accepted members are
  // exact singleton domains, rather than duplicate occupants of their own chain.
  const memberIds = new Set(chains[0]!.tasks.map(task => task.id));
  const technical = new PreparedFutureTechnicalChainAuthority(problem,
    () => ledger.limit - ledger.branchesExplored, count => ledger.consume("STANDALONE", count),
    fixed.filter(task => !memberIds.has(task.id)));
  let cursor = 0, uncertain = false;
  while (true) {
    const next = technical.nextExactReservation(chains[0]!.policy.id, fixed, cursor); cursor = next.nextCursor;
    if (next.status === "BUDGET_EXHAUSTED") return result("BUDGET_EXHAUSTED", "TECHNICAL_EXPLORER_BUDGET");
    if (next.status === "EXHAUSTED") return result(uncertain ? "INCONCLUSIVE" : "REJECTED_CANDIDATE",
      uncertain ? "UNPROVED_CONTINUATION" : "EXACT_CHAIN_CONTINUATIONS_EXHAUSTED");
    candidates++;
    const reservation = next.reservation!;
    if (reservation.scheduledTasks.some(task => {
      const accepted = protectedById.get(task.id);
      return accepted && (task.start !== accepted.start || task.end !== accepted.end || task.spaceId !== accepted.spaceId
        || task.itinerantUnitId !== accepted.itinerantUnitId);
    })) { uncertain = true; continue; }
    const tasks = [...fixed, ...reservation.scheduledTasks.filter(task => !protectedById.has(task.id))];
    const necessary = closure.evaluate(tasks, [], () => ledger.consume("STANDALONE"), "NECESSARY_ONLY");
    if (necessary.reason === "BUDGET_EXHAUSTED") return result("BUDGET_EXHAUSTED", "MATCHING_BUDGET");
    if (necessary.status === "INFEASIBLE") continue;
    let selected: ClosureSufficiencyProbeResult["witness"] = null;
    const meals = assessParticipantMealFutureFeasibility(problem, tasks,
      { remaining: ledger.limit - ledger.branchesExplored, consume: (count = 1) => ledger.consume("STANDALONE", count) },
      "MATERIALIZE", (candidateMeals, complete) => {
        const certificate = closure.evaluate(tasks, candidateMeals, () => ledger.consume("STANDALONE"),
          complete ? "CERTIFY" : "NECESSARY_ONLY");
        if (certificate.reason === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (certificate.status === "INFEASIBLE") return "REJECT";
        if (!complete) return certificate.status === "ABSTAIN" ? "ABSTAIN" : "ACCEPT";
        if (!certificate.certified) { uncertain = true; return "ABSTAIN"; }
        const byId = new Map(problem.tasks.map(task => [task.id, task]));
        const closures = Object.entries(certificate.matching).map(([id, start]) =>
          ({ ...byId.get(id)!, start, end: start + byId.get(id)!.duration }));
        const transport = materializeTerminalTransportDetailed(problem, [...tasks, ...closures], candidateMeals,
          { consumeFallbackBranch: () => ledger.consume("STANDALONE") });
        if (transport.status === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (transport.status !== "FEASIBLE") { uncertain = true; return "ABSTAIN"; }
        const completion = [...tasks, ...closures, ...transport.scheduled!];
        // Placement replay alone does not certify chain adjacency, round/setup or
        // operational breaks. Preserve the full canonical HARD/REQUIRED gate.
        const validation = validatePlan(source, completion, [], [], [...candidateMeals]);
        if (!validation.hardValid) { uncertain = true; return "ABSTAIN"; }
        selected = { tasks: completion, meals: [...candidateMeals], fingerprint: certificate.witnessFingerprint! };
        return "ACCEPT";
      });
    if (meals.reasonCodes.some(code => code.includes("BUDGET_EXHAUSTED"))) return result("BUDGET_EXHAUSTED", "MEAL_CONTINUATION_BUDGET");
    if (selected) return result("CERTIFIED_FRONTIER", "EXACT_JOINT_CHAIN_MEALS_CLOSURE_OUT", selected);
    if (meals.reasonCodes.includes("PARTICIPANT_MEAL_TERMINAL_ABSTAIN")) uncertain = true;
  }
}
