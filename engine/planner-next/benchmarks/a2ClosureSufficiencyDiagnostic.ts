import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { ScheduledTask, ScheduledOperationalMeal } from "../contracts";
import { buildCanonicalA2AssistedStage1Fixture } from "./canonicalA2AssistedStage1Fixture";
import { PreparedFutureCollectiveParticipantClosure } from "../futureCollectiveParticipantClosure";
import { PreparedFutureTechnicalChainAuthority } from "../technicalChainFutureFeasibility";
import { authorizedPipelineArchitectureMaterializations, preparePipelineBundleGraph, materializePreparedPipelineBundleMatching,
  fixedSupportingPipelineGeometryFrontier, futureStructuralWitnessV2FromAcceptedPipeline } from "../anonymousPipelineWitness";
import { createExactSearchLedger, runExactMainAndFeederSearch, deriveArchitectureFromProtectedMains,
  type ExactCoreLeafCandidate, type ExactCoreContinuationOutcome } from "../exactMainAndFeederCore";
import { searchExactItinerantAgenda } from "../exactItinerantPlan";
import { itinerantAgendaStructuralFrontier } from "../itinerantAgendaAuthority";
import { buildAssistedProblem, createPlanningScope } from "../assistedPlanning";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { engineTimeToMinute } from "../integration/engineTime";
import { runExactItinerantPlanSearch } from "../exactItinerantPlan";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export interface A2PairWitness {
  tasks: ScheduledTask[]; mainDigest: string; chainRoot: number; agendaPlacements: ScheduledTask[];
  matching: number; pendingTaskIds: string[];
}

/** Replay the actual accepted resource/unit snapshot through the canonical
 * adapter. In particular, a Main's accepted unit can differ from the raw source
 * template: applying its unit to the untouched template can return null. */
export function replayA2AcceptedTasks(rows: readonly { taskId: number; startPlanned: string | null; endPlanned: string | null;
  spaceId: number | null; itinerantTeamId?: number | null; assignedResourceIds?: readonly number[] | null }[]): ScheduledTask[] {
  const fixture = buildCanonicalA2AssistedStage1Fixture(), byProduct = new Map(rows.map(row => [row.taskId, row]));
  const input = structuredClone(fixture.input);
  input.tasks = input.tasks.map(task => {
    const row = byProduct.get(task.id); if (!row) return task;
    return { ...task, ...(row.spaceId === null ? {} : { spaceId: row.spaceId }),
      ...(row.itinerantTeamId == null ? {} : { itinerantTeamId: row.itinerantTeamId }),
      ...(row.assignedResourceIds == null ? {} : { assignedResourceIds: [...row.assignedResourceIds] }) };
  });
  const adapter = adaptEngineInputToPlannerNextProblem(input); assert.equal(adapter.status, "SUPPORTED");
  if (adapter.status !== "SUPPORTED") throw new Error("Unrepresentable accepted replay");
  const byId = new Map(adapter.problem.tasks.map(task => [task.id, task]));
  return rows.flatMap(row => {
    const task = byId.get(`task:${row.taskId}`); if (!task) return []; // meals have their own authority
    assert.ok(row.startPlanned && row.endPlanned);
    return [{ ...task, start: engineTimeToMinute(row.startPlanned), end: engineTimeToMinute(row.endPlanned) }];
  });
}

export function replayA2OperationalMeals(rows: readonly { policyId: string; startPlanned: string; endPlanned: string }[]): ScheduledOperationalMeal[] {
  const problem = buildCanonicalA2AssistedStage1Fixture().adapter.problem;
  return rows.map(row => {
    const policy = problem.operationalMealPolicies!.find(policy => policy.id === row.policyId); assert.ok(policy);
    return { id: policy.id, resourceIds: [...policy.resourceIds], spaceIds: [...policy.spaceIds], duration: policy.duration,
      start: engineTimeToMinute(row.startPlanned), end: engineTimeToMinute(row.endPlanned) };
  });
}

/** Identity-level inventory derived from the source, including direct edges.
 * Names are Evidence labels only; they never participate in solver decisions. */
export function inventoryA2ClosureAncestors() {
  const fixture = buildCanonicalA2AssistedStage1Fixture(), source = fixture.adapter.problem, projected = fixture.assisted.problem;
  const closure = new PreparedFutureCollectiveParticipantClosure(projected);
  const pending = closure.pendingPredecessorTaskIds([]);
  const executable = new Set(projected.tasks.map(task => task.id));
  const round = new Set((projected.analyticalFutureRoundSynchronizations ?? []).flatMap(unit => unit.tasks.map(task => task.id)));
  const agenda = new Set((projected.analyticalFutureItinerantAgendas ?? []).flatMap(unit => [...unit.tasks, ...unit.prerequisiteTasks].map(task => task.id)));
  const technical = new Set((projected.analyticalFutureTechnicalChains ?? []).flatMap(unit => unit.tasks.map(task => task.id)));
  const departureIds = source.transportPolicy!.departure.taskIds;
  const closureIds = Object.keys(closure.evaluate([], [], undefined, "NECESSARY_ONLY").domains);
  const direct = new Set([...source.tasks.filter(task => [...closureIds, ...departureIds].includes(task.id)).flatMap(task => task.dependencies),
    ...(source.participantMeals ?? []).flatMap(meal => meal.dependencies ?? [])]);
  const names = new Map(fixture.input.tasks.map(task => [`task:${task.id}`, task.templateName]));
  const group = new Map<string, string[]>();
  const identities = pending.map(id => {
    const task = source.tasks.find(task => task.id === id)!;
    const producer = executable.has(id) ? "CURRENT_PIPELINE" : round.has(id) ? "FUTURE_ROUND" : agenda.has(id) ? "FUTURE_AGENDA"
      : technical.has(id) ? "TECHNICAL_WITNESS_NOT_COMPOSED" : "NO_CONTEXT_PRODUCER";
    const key = `${producer}:${names.get(id)}`; group.set(key, [...(group.get(key) ?? []), id]);
    return { id, producer, direct: direct.has(id), participantId: task.participantId, duration: task.duration,
      spaceId: task.spaceId, resources: task.requiredResourceIds ?? [], dependencies: task.dependencies,
      jointGroupId: task.jointGroupId ?? null,
      closureConsumers: closureIds.filter(closureId => source.tasks.find(task => task.id === closureId)!.dependencies.includes(id)),
      mealConsumers: (source.participantMeals ?? []).filter(meal => meal.dependencies?.includes(id)).map(meal => meal.sourceTaskId) };
  });
  return { sourceObligations: fixture.input.tasks.length, pendingCount: pending.length, directCount: pending.filter(id => direct.has(id)).length,
    transitiveOnly: pending.filter(id => !direct.has(id)),
    uncovered: identities.filter(row => ["NO_CONTEXT_PRODUCER", "TECHNICAL_WITNESS_NOT_COMPOSED"].includes(row.producer)).map(row => row.id),
    groups: [...group].map(([identity, taskIds]) => ({ identity, taskIds })), identities,
    canonicalContracts: { budget: source.budget, participantTransitionMinutes: source.participantTransitionMinutes,
      participantAvailability: source.participants.map(person => ({ id: person.id, availability: person.availability })),
      arrival: source.transportPolicy!.arrival, departure: source.transportPolicy!.departure,
      closureMargins: source.tasks.filter(task => [...closureIds, ...departureIds].includes(task.id)).map(task =>
        ({ id: task.id, before: task.participantMarginBeforeMinutes ?? null, after: task.participantMarginAfterMinutes ?? null })),
      closureSpaces: source.spaces.filter(space => source.tasks.some(task => closureIds.includes(task.id) && task.spaceId === space.id)),
      operationalMeals: source.operationalMealPolicies }, sourceDigest: digest(source) };
}

/** Bounded read-only experiment: exact pipeline -> exact C/EVA chain -> exact
 * A/B agenda -> necessary closure. It deliberately cannot certify the residual
 * P14/P15, round or post obligations. No proposal is accepted by this function. */
export function probeA2PipelineChainAgenda(fixed: readonly ScheduledTask[] = [],
  protectedOperationalMeals: readonly ScheduledOperationalMeal[] = []) {
  const fixture = buildCanonicalA2AssistedStage1Fixture();
  const problem = buildAssistedProblem(fixture.adapter.problem, fixture.scope, fixed, fixture.futureEligible, protectedOperationalMeals).problem;
  const anonymousSource = buildAssistedProblem(fixture.adapter.problem, fixture.scope, [], fixture.futureEligible, protectedOperationalMeals).problem;
  const saved = structuredClone({ problem, fixed, protectedOperationalMeals });
  const ledger = createExactSearchLedger(problem.budget.maxBranchExpansions);
  const technical = new PreparedFutureTechnicalChainAuthority(problem, () => ledger.limit - ledger.branchesExplored,
    count => ledger.consume("STANDALONE", count), fixed);
  const closure = new PreparedFutureCollectiveParticipantClosure(problem);
  const agenda = problem.analyticalFutureItinerantAgendas![0]!;
  const analytical = { ...problem, tasks: [...new Map([...problem.tasks,
    ...problem.analyticalFutureTechnicalChains!.flatMap(unit => unit.tasks), ...agenda.tasks].map(task => [task.id, task])).values()] };
  let architectures = 0, hardLeaves = 0, chainCandidates = 0, agendaCandidates = 0, hallPrunes = 0;
  const traces: Array<{ architecture: string | null; mainDigest: string; chainCandidates: number; agendaCandidates: number;
    frontiers: number[]; outcome: string }> = [];
  let selected: A2PairWitness | null = null;
  function* bundles() {
    for (const { architecture, materialized } of authorizedPipelineArchitectureMaterializations(problem, undefined,
      { operationalMealBudget: () => ({ remaining: ledger.limit - ledger.branchesExplored,
        consume: (count = 1) => ledger.consume("CORE", count) }) })) {
      architectures++;
      const prepared = preparePipelineBundleGraph(problem, architecture, fixed, materialized); if (!prepared) continue;
      const matching = materializePreparedPipelineBundleMatching(problem, prepared, new Set(), undefined,
        () => ledger.consume("CORE"), tasks => technical.intrusion(tasks));
      if (!matching) { if (ledger.branchesExplored >= ledger.limit) return; continue; }
      yield { architecture, architectureFingerprint: prepared.witness.fingerprint, bundle: matching,
        repair: (previous: Parameters<typeof materializePreparedPipelineBundleMatching>[3], forbidden: ReadonlySet<string>, consume: () => boolean) =>
          materializePreparedPipelineBundleMatching(problem, prepared, forbidden, previous, consume, tasks => technical.intrusion(tasks)) };
    }
  }
  const continueLeaf = (leaf: ExactCoreLeafCandidate): ExactCoreContinuationOutcome => {
      hardLeaves++;
      for (const accepted of fixed) assert.deepEqual(leaf.tasks.find(task => task.id === accepted.id), accepted);
      const mainDigest = digest(leaf.tasks.filter(task => task.kind === "main"));
      const trace = { architecture: leaf.architectureFingerprint ?? null, mainDigest, chainCandidates: 0,
        agendaCandidates: 0, frontiers: [] as number[], outcome: "SEARCHING" }; traces.push(trace);
      let cursor = 0;
      while (true) {
        const next = technical.nextExactReservation(technical.reservationStructureIds()[0]!, leaf.tasks, cursor); cursor = next.nextCursor;
        if (next.status === "BUDGET_EXHAUSTED") { trace.outcome = "BUDGET_EXHAUSTED"; return "BUDGET_EXHAUSTED"; }
        if (next.status === "EXHAUSTED") { trace.outcome = "EXHAUSTED_PAIR_FOR_THIS_BUNDLE"; return "REJECT"; }
        const context = [...leaf.tasks, ...next.reservation!.scheduledTasks]; chainCandidates++; trace.chainCandidates++;
        const necessary = closure.evaluate(context, [], () => ledger.consume("STANDALONE"), "NECESSARY_ONLY");
        if (necessary.reason === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
        if (necessary.status === "INFEASIBLE") { hallPrunes++; continue; }
        const frontier = itinerantAgendaStructuralFrontier(analytical, agenda.unitIds, context);
        if (!trace.frontiers.includes(frontier)) trace.frontiers.push(frontier);
        const result = searchExactItinerantAgenda(analytical, agenda.tasks, agenda.unitIds, context, leaf.meals, frontier,
          () => ledger.consume("STANDALONE"), tasks => {
            agendaCandidates++; trace.agendaCandidates++;
            const necessary = closure.evaluate([...context, ...tasks], [], () => ledger.consume("STANDALONE"), "NECESSARY_ONLY");
            if (necessary.reason === "BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
            if (necessary.status !== "PASS") return "DEAD_END";
            selected = { tasks: [...context, ...tasks], mainDigest, chainRoot: next.reservation!.rootStart,
              agendaPlacements: [...tasks], matching: necessary.maximumMatching, pendingTaskIds: necessary.pendingPredecessorTaskIds };
            return "FOUND";
          });
        if (result.outcome === "FOUND") { trace.outcome = "FOUND_PAIR_ONLY"; return "ACCEPT"; }
        if (result.outcome === "BUDGET_EXHAUSTED") { trace.outcome = "BUDGET_EXHAUSTED"; return "BUDGET_EXHAUSTED"; }
      }
    };
  const options = { ledger, fixedPlacements: fixed, fixedPlacementsAsContext: true,
    structuralSearchBudgetExhausted: () => ledger.branchesExplored >= ledger.limit, onHardValidCoreLeaf: continueLeaf };
  let core, anonymousGeometryUncertainty = false;
  if (!fixed.length) core = runExactMainAndFeederSearch(problem, { ...options, structuralBundleCandidates: bundles() });
  else {
    const architecture = deriveArchitectureFromProtectedMains(problem, fixed);
    assert.ok(architecture, "This experiment requires the complete accepted Main stage");
    // Anonymous source geometry is generated without imposing nominal identity
    // singleton windows. The exact bundle graph, replay and hard gate subsequently
    // enforce EVERY accepted identity, time, resource and unit from this execution.
    // No old fingerprint or historical support placement is seeded here.
    for (const materialized of fixedSupportingPipelineGeometryFrontier(anonymousSource, architecture, observation => {
      anonymousGeometryUncertainty ||= observation.status === "INCONCLUSIVE";
    })) {
      architectures++;
      const prepared = preparePipelineBundleGraph(problem, architecture, fixed, materialized); if (!prepared) continue;
      const matching = materializePreparedPipelineBundleMatching(problem, prepared, new Set(), undefined,
        () => ledger.consume("CORE"), tasks => technical.intrusion(tasks));
      if (!matching) { if (ledger.branchesExplored >= ledger.limit) break; continue; }
      const prior = futureStructuralWitnessV2FromAcceptedPipeline(problem, architecture, prepared.witness.fingerprint, matching.scheduledTasks);
      core = runExactMainAndFeederSearch(problem, { ...options, priorFutureStructuralWitness: prior });
      if (selected || ledger.branchesExplored >= ledger.limit) break;
    }
  }
  assert.deepEqual({ problem, fixed, protectedOperationalMeals }, saved);
  return { outcome: selected ? "PAIR_WITNESS_ONLY" : ledger.branchesExplored >= ledger.limit ? "BUDGET_EXHAUSTED"
    : anonymousGeometryUncertainty ? "INCONCLUSIVE_GEOMETRY" : "NO_PAIR_IN_EXPLORED_DOMAIN",
    fullClosureCertificate: false, acceptedStages: 0, branches: ledger.branchesExplored, budget: ledger.limit,
    architectures, hardLeaves, chainCandidates, agendaCandidates, hallPrunes, anonymousGeometryUncertainty,
    coreStatus: core?.status ?? "NO_HARD_VALID_BUNDLE", coreReasons: core?.evidence.reasonCodes ?? [], traces,
    selected: selected as A2PairWitness | null };
}

/** Final bounded experiment uses the EXISTING residual solver, rather than a
 * new scheduling layer. Its combined scope is analytical only; product scope
 * ordering, proposals and acceptance are untouched. */
export function probeA2ResidualFrontier(pair: A2PairWitness, causalDiagnostic = false) {
  const fixture = buildCanonicalA2AssistedStage1Fixture(), fixed = pair.tasks;
  const saved = structuredClone(pair), source = fixture.adapter.problem;
  const closure = new PreparedFutureCollectiveParticipantClosure(source), pending = closure.pendingPredecessorTaskIds(fixed);
  const roundIds = new Set((source.roundSynchronizations ?? []).flatMap(policy => policy.lanes.flatMap(lane => lane.taskIds)));
  const productiveIds = pending.filter(id => !roundIds.has(id)), mealIds = (source.participantMeals ?? []).map(meal => meal.sourceTaskId);
  const ids = [...productiveIds, ...mealIds];
  const mains = fixed.filter(task => task.kind === "main").sort((a, b) => a.start - b.start);
  const gap = mains.slice(1).map((task, index) => ({ start: mains[index]!.end, end: task.start })).find(window => window.start < window.end)!;
  const mainMeal = source.operationalMealPolicies!.find(policy => policy.spaceIds.includes(source.mainFlow.spaceId))!;
  assert.equal(gap.end - gap.start, mainMeal.duration);
  const fixedMeals = [{ id: mainMeal.id, resourceIds: mainMeal.resourceIds, spaceIds: mainMeal.spaceIds, duration: mainMeal.duration, ...gap }];
  const scope = createPlanningScope({ kind: "ids", value: ids.join(",") }, {}, ids);
  const built = buildAssistedProblem(source, scope, fixed, fixture.futureEligible, fixedMeals);
  const architecture = deriveArchitectureFromProtectedMains(built.problem, fixed); assert.ok(architecture);
  const prior = futureStructuralWitnessV2FromAcceptedPipeline(built.problem, architecture, digest(fixed), fixed);
  const result = runExactItinerantPlanSearch(built.problem, { fixedPlacements: fixed, fixedPlacementsAsContext: true,
    priorFutureStructuralWitness: prior, causalDiagnostic });
  assert.deepEqual(pair, saved);
  const evidence = result.evidence;
  return { status: result.status, complete: result.complete, acceptedStages: 0, branches: evidence.branchesExplored,
    budget: built.problem.budget.maxBranchExpansions, reasons: evidence.reasonCodes,
    fixedTaskCount: fixed.length, residualProductiveCount: productiveIds.length, residualMealCount: mealIds.length,
    futureRoundCount: pending.filter(id => roundIds.has(id)).length,
    macroOrder: evidence.macroSelectionOrder, macroDomains: evidence.macroDomainSizes,
    completeLeaves: evidence.standaloneCompleteLeafCount,
    branchesBeforeFirstOrdinaryLeaf: evidence.standaloneBranchesBeforeFirstOrdinaryCompleteLeaf,
    branchesAfterFirstOrdinaryLeaf: evidence.standaloneBranchesAfterFirstOrdinaryCompleteLeaf,
    preferredResource: evidence.preferredResourceUnit ? { geometryCount: evidence.preferredResourceUnit.geometryCount,
      matchingAttempts: evidence.preferredResourceUnit.matchingAttempts, matchingSuccesses: evidence.preferredResourceUnit.matchingSuccesses } : null,
    closureChecks: evidence.futureCollectiveClosureChecks, firstClosurePrune: evidence.futureCollectiveClosureFirstPrune,
    lastCertificate: evidence.futureCollectiveClosureLastCertificate, lastHall: evidence.futureCollectiveClosureHall,
    scheduledDigest: digest(result.scheduledTasks), fixedContextDigest: digest({ fixed, fixedMeals }) };
}
