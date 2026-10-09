import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCanonicalA2AssistedStage1Fixture } from "../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { PreparedFutureCollectiveParticipantClosure, futureCollectiveClosureEvidenceKeys } from "../../engine/planner-next/futureCollectiveParticipantClosure";
import { exactTaskStartDomain, diagnoseTaskPlacement, canPlaceTask } from "../../engine/planner-next/placement";
import { materializeItinerantUnitAssignment } from "../../engine/planner-next/itinerantUnitAssignment";
import { engineTimeToMinute } from "../../engine/planner-next/integration/engineTime";
import type { ScheduledTask } from "../../engine/planner-next/contracts";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";
import { buildAssistedProblem, createPlanningScope } from "../../engine/planner-next/assistedPlanning";
import { inventoryA2ClosureAncestors, replayA2AcceptedTasks, replayA2OperationalMeals,
  probeA2ResidualFrontier, probeA2PipelineChainAgenda } from "../../engine/planner-next/benchmarks/a2ClosureSufficiencyDiagnostic";
import { createHash } from "node:crypto";
import type { FutureStructuralWitness } from "../../engine/planner-next/anonymousPipelineWitness";

const matchingCardinality = (domains: Array<{ closureTaskId: string; starts: number[] }>) => {
  const byId = new Map(domains.map(row => [row.closureTaskId, row.starts])), owner = new Map<number, string>();
  const augment = (id: string, seen: Set<number>): boolean => {
    for (const start of byId.get(id) ?? []) {
      if (seen.has(start)) continue; seen.add(start);
      const prior = owner.get(start);
      if (prior === undefined || augment(prior, seen)) { owner.set(start, id); return true; }
    } return false;
  };
  for (const row of domains) augment(row.closureTaskId, new Set());
  return owner.size;
};

/** Baseline snapshots are observations, never scheduling hints or seeds. */
export function diagnoseA2CollectiveClosureStages() {
  const baseline = JSON.parse(readFileSync("docs/evidence/A2-ASSIST-8-assisted-completion.json", "utf8"));
  assert.equal(baseline.completedObligationCount, 209);
  const { adapter } = buildCanonicalA2AssistedStage1Fixture();
  const problem = adapter.problem, byId = new Map(problem.tasks.map(task => [task.id, task]));
  const authority = new PreparedFutureCollectiveParticipantClosure(problem);
  const state = replayA2AcceptedTasks;
  let before: ScheduledTask[] = [];
  const stages = baseline.iterations.filter((stage: any) => stage.acceptedSnapshotAfter).map((stage: any) => {
    const fixed = state(stage.acceptedSnapshotAfter), prior = authority.evaluate(before, [], undefined, "NECESSARY_ONLY");
    const after = authority.evaluate(fixed, [], undefined, "NECESSARY_ONLY");
    const domains = Object.entries(after.domains).map(([id, starts]) => {
      const task = byId.get(id)!;
      const rawStarts = [...exactTaskStartDomain(problem, task, fixed).starts()];
      const earliest = rawStarts[0], rejection = earliest === undefined ? null : diagnoseTaskPlacement(problem, task, earliest - 5, fixed);
      const departures = problem.transportPolicy!.departure.taskIds.flatMap(outId => {
        const out = byId.get(outId)!;
        return out.dependencies.includes(id) ? [{ task: out, starts: [...exactTaskStartDomain(problem, out, fixed).starts()] }] : [];
      });
      const meal = problem.participantMeals?.find(item => item.participantId === task.participantId);
      const directOutCompatible = rawStarts.filter(start => {
        const withClosure = [...fixed, { ...task, start, end: start + task.duration }];
        return departures.every(({ task: out }) => [...exactTaskStartDomain(problem, out, withClosure).starts()]
          .some(outStart => canPlaceTask(problem, out, outStart, withClosure)));
      });
      return { closureTaskId: id, participantId: task.participantId, duration: task.duration, spaceId: task.spaceId,
        directDomain: rawStarts, directOutCompatible, continuationDomain: starts, release: after.releaseBoundsByClosure[id],
        acceptedPredecessor: fixed.find(item => item.id === rejection?.blockingPlacedTaskId) ?? null,
        availability: problem.participants.find(person => person.id === task.participantId)?.availability,
        departures, departurePolicy: problem.transportPolicy!.departure,
        meal: meal ? { obligation: meal, materialized: stage.acceptedSnapshotAfter.some((row: any) => `task:${row.taskId}` === meal.sourceTaskId) } : null };
    });
    let firstCausalDecision: unknown = null;
    if (prior.maximumMatching === prior.requiredCount && after.maximumMatching < after.requiredCount) {
      const knownIds = new Set(before.map(task => task.id));
      const added = fixed.filter(task => !knownIds.has(task.id)).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
      const groups = new Map<string, ScheduledTask[]>();
      for (const task of added) { const id = task.jointGroupId ?? task.id; groups.set(id, [...(groups.get(id) ?? []), task]); }
      const prefix = [...before];
      for (const [decisionId, tasks] of groups) {
        const old = authority.evaluate(prefix, [], undefined, "NECESSARY_ONLY"); prefix.push(...tasks);
        const current = authority.evaluate(prefix, [], undefined, "NECESSARY_ONLY");
        if (current.maximumMatching < current.requiredCount) {
          firstCausalDecision = { decisionId, tasks, beforeMatchingCardinality: old.maximumMatching,
            afterMatchingCardinality: current.maximumMatching, hall: current.hall }; break;
        }
      }
    }
    const result = { stage: stage.ordinal, completed: stage.completedObligationCount, closuresPending: after.requiredCount,
      beforeMatchingCardinality: prior.maximumMatching, afterMatchingCardinality: after.maximumMatching,
      directMatchingCardinality: matchingCardinality(domains.map(row => ({ closureTaskId: row.closureTaskId, starts: row.directDomain }))),
      directOutCompatibleMatchingCardinality: matchingCardinality(domains.map(row => ({ closureTaskId: row.closureTaskId, starts: row.directOutCompatible }))),
      affectedParticipantIds: after.hall?.participantIds ?? [], blockingClosureTaskIds: after.hall?.closureTaskIds ?? [],
      causingTaskIds: (firstCausalDecision as any)?.tasks.map((task: ScheduledTask) => task.id) ?? [],
      hall: after.hall, firstCausalDecision, domains };
    before = fixed; return result;
  });
  return { base: "c00bb3d0b6211badad8d3b1352741b3dac1672ee", source: "A2-ASSIST-8 accepted snapshots",
    mode: "READ_ONLY_NECESSARY_CAPACITY_WITH_PENDING_PREDECESSOR_RELEASES", stages };
}

export function collectiveClosureDeterministicMaterial(result: Awaited<ReturnType<typeof runA2Assist8Evidence>>) {
  return result.iterations.map(stage => ({ scope: stage.resolvedTaskIds, outcome: stage.proposalOutcome,
    completed: stage.completedObligationCount, branches: stage.branchesExplored, stageFingerprint: stage.acceptedStageFingerprint,
    accepted: stage.acceptedSnapshotAfter, preparations: stage.selectedSetupPreparations, rounds: stage.selectedRoundPreparations,
    meals: stage.acceptedMealWitnesses, operationalMeals: stage.proposedSnapshotOperationalMeals,
    futureWitnesses: stage.futureStructuralWitnesses, witnessSet: stage.futureWitnessSet,
    closure: Object.fromEntries(futureCollectiveClosureEvidenceKeys.map(key => [key, stage.standaloneDiagnostic?.[key]])),
    hardRequired: stage.hardRequiredValidation, globalMealGate: stage.sodexoMeals?.globalMealGate }));
}

/** Compact Evidence from two clean product observations; never a planning seed. */
export function runA2CollectiveClosureCompletionEvidence(first: Awaited<ReturnType<typeof runA2Assist8Evidence>>,
  second: Awaited<ReturnType<typeof runA2Assist8Evidence>>) {
  const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const material = collectiveClosureDeterministicMaterial(first);
  assert.deepEqual(material, collectiveClosureDeterministicMaterial(second));
  const source = buildCanonicalA2AssistedStage1Fixture().adapter.problem;
  const stages = first.iterations.map((stage, index) => {
    const repeated = second.iterations[index]!, diagnostic = stage.standaloneDiagnostic!;
    const witness = stage.futureStructuralWitnesses.find((item: FutureStructuralWitness) => item.kind === "JOINT_COMPLETION");
    assert.ok(witness?.kind === "JOINT_COMPLETION");
    assert.ok(diagnostic.futureCollectiveClosureLastCertificate);
    assert.equal(stage.proposalOutcome, "PROPOSAL");
    assert.equal(stage.protectedPlacementsPreserved, true);
    assert.equal(stage.protectedEqualityProof?.equal, true);
    assert.equal(stage.newHardViolationCount, 0); assert.equal(stage.newRequiredViolationCount, 0);
    assert.deepEqual(stage.unstructuredReasonCodes, []);
    assert.equal(stage.branchesExplored, stage.work.coreBranches! + stage.work.standaloneBranches!);
    assert.ok(stage.branchesExplored <= source.budget.maxBranchExpansions!);
    assert.ok(stage.durationMs <= 300_000 && repeated.durationMs <= 300_000);
    assert.equal(witness.tasks.length, source.tasks.length);
    assert.equal(witness.participantMeals.length, source.participantMeals!.length);
    const newObligations = stage.completedObligationCount - (first.iterations[index - 1]?.completedObligationCount ?? 0);
    return { stage: stage.ordinal, scope: stage.scopeSelector, newObligations,
      newTaskPlacements: stage.newObligationCount, newParticipantMealPlacements: newObligations - stage.newObligationCount,
      completed: stage.completedObligationCount, pending: stage.remainingObligationCount,
      durationMs: [stage.durationMs, repeated.durationMs], ledger: { limit: source.budget.maxBranchExpansions,
        core: stage.work.coreBranches, continuation: stage.work.standaloneBranches, total: stage.branchesExplored,
        exhausted: false, nonzeroWorkCounters: Object.fromEntries(Object.entries(stage.work).filter(([, value]) => typeof value === "number" && value > 0)) },
      certificate: { closure: diagnostic.futureCollectiveClosureLastCertificate!.fingerprint,
        joint: witness.fingerprint, taskCount: witness.tasks.length, participantMealCount: witness.participantMeals.length,
        setupPreparationCount: witness.preparations.length, roundPreparationCount: witness.roundPreparations.length,
        operationalMealCount: witness.operationalMeals.length, contextDigest: digest(witness) },
      acceptedFingerprint: stage.acceptedStageFingerprint, acceptedTasksDigest: digest(stage.acceptedSnapshotAfter),
      preparationsDigest: digest([stage.selectedSetupPreparations, stage.selectedRoundPreparations]),
      mealsDigest: digest(stage.acceptedMealWitnesses), protection: stage.protectedEqualityProof,
      participantMealProtection: stage.participantMealPreservationProof, validation: stage.hardRequiredValidation };
  });
  for (const run of [first, second]) {
    assert.equal(run.status, "PASS"); assert.equal(run.completedObligationCount, 266);
    assert.equal(run.finalObligationIdsMatchSource, true); assert.equal(run.duplicateFinalIds, 0);
    assert.equal(run.manualChanges, 0); assert.equal(run.acceptedHardExceptions, 0);
    assert.equal(run.dailyTasksMatchesLastAcceptedStage, true); assert.equal(run.firstBlocker, null);
  }
  const result = { conclusion: "ASSISTED_COMPLETION", productionCapabilityAchieved: true,
    comparison: { base: { head: "c00bb3d0b6211badad8d3b1352741b3dac1672ee", completed: 209, lostCollectiveCapacityAt: "S3" },
      previous: { head: "8a2bfa8ec9863ef8b232797792fab641e9b99c77", completed: 38, rejectedAt: "S3" },
      reviewed: { head: "ffc35446ac2d4685dfbace367cf637945eb2a8f4", completed: 0, branches: 0,
        reason: "104 ancestors without joint producer; no global impossibility proof" } },
    invocation: "runA2Assist8Evidence({reportIterationDurations:true})", initialSnapshot: null, historicalSeed: null,
    proof: { completed: 266, sourceObligations: 266, pending: 0, finalStage: first.milestone,
      sourceTasks: source.tasks.length, participantMeals: source.participantMeals!.length,
      effectiveInConfiguration: first.effectiveInConfiguration, branchBudgetPerRequest: source.budget.maxBranchExpansions,
      oneSharedLedgerPerRequest: true, noBudgetOrTimeoutIncrease: true, protectedDecisionsExact: true,
      finalHardViolationCount: 0, finalRequiredViolationCount: 0, firstBlocker: null,
      dailyTasksMatchesLastAcceptedStage: true, finalObligationIdsMatchSource: true,
      deterministicEquivalent: true, deterministicMaterialDigest: digest(material), finalFingerprint: first.deterministicFingerprint,
      interactiveTargetMs: 120_000, blockingCeilingMs: 300_000,
      interactiveTargetMet: stages.every(stage => stage.durationMs.every(ms => ms <= 120_000)), blockingCeilingMet: true },
    certificateScope: "All canonical tasks, participant/operational meals, preparations and OUT jointly validated; necessary Hall PASS is never acceptance. Context stays ephemeral and is revalidated or rebuilt before each Stage.",
    stages };
  writeFileSync("docs/evidence/A2-COLLECTIVE-CLOSURE-COMPLETION.json", `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

/** Coverage audit only: a representation is not a joint geometry witness. */
export function auditPriorA2CollectiveCertificates() {
  const prior = JSON.parse(readFileSync("docs/evidence/A2-COLLECTIVE-CLOSURE.json", "utf8"));
  const { adapter } = buildCanonicalA2AssistedStage1Fixture(), problem = adapter.problem;
  const byId = new Map(problem.tasks.map(task => [task.id, task]));
  const authority = new PreparedFutureCollectiveParticipantClosure(problem);
  return prior.first.slice(0, 2).map((stage: any, index: number) => {
    const fixed = replayA2AcceptedTasks(stage.accepted);
    const scope = createPlanningScope({ kind: "ids", value: stage.scope.join(",") }, {}, stage.scope.map((id: number) => `task:${id}`));
    const built = buildAssistedProblem(problem, scope, fixed, new Set(problem.tasks.map(task => task.id)),
      replayA2OperationalMeals(stage.operationalMeals ?? []));
    const represented = new Set([...built.problem.tasks,
      ...(built.problem.analyticalFutureRoundSynchronizations ?? []).flatMap(future => future.tasks),
      ...(built.problem.analyticalFutureItinerantAgendas ?? []).flatMap(future => [...future.tasks, ...future.prerequisiteTasks])].map(task => task.id));
    const necessary = authority.evaluate(fixed, [], undefined, "NECESSARY_ONLY");
    const uncovered = necessary.pendingPredecessorTaskIds.filter(id => !represented.has(id));
    return { stage: index + 1, historicalFingerprint: stage.closure.futureCollectiveClosureWitnessFingerprint,
      historicalFingerprintIsCompletionCertificate: false,
      necessaryCapacity: { status: necessary.status, certified: necessary.certified,
        required: necessary.requiredCount, matching: necessary.maximumMatching },
      certifiedCollectiveCompletion: "NOT_DEMONSTRATED",
      futureStructuralWitnessSet: stage.witnessSet,
      globalMealGate: stage.globalMealGate,
      uncoveredPredecessors: uncovered.map(id => ({ task: byId.get(id),
        requiredTechnicalChains: (problem.technicalChains ?? []).filter(policy => policy.orderedTaskIds.includes(id)).map(policy => policy.id) })),
      proofLimit: "Existing context-producing units do not cover these ancestors; independent witnesses are not a joint completion proof." };
  });
}

export async function runA2CollectiveClosureContractEvidence() {
  const prior = JSON.parse(readFileSync("docs/evidence/A2-COLLECTIVE-CLOSURE.json", "utf8"));
  const first = await runA2Assist8Evidence({ reportIterationDurations: true });
  const second = await runA2Assist8Evidence({ reportIterationDurations: true });
  assert.deepEqual(collectiveClosureDeterministicMaterial(first), collectiveClosureDeterministicMaterial(second));
  assert.equal(first.status, second.status); assert.equal(first.completedObligationCount, second.completedObligationCount);
  assert.deepEqual(first.firstBlocker, second.firstBlocker);
  const accepted = first.iterations.filter(stage => stage.acceptedSnapshotAfter);
  const old = JSON.parse(readFileSync("docs/evidence/A2-ASSIST-8-assisted-completion.json", "utf8"));
  for (const stage of accepted.filter(stage => stage.ordinal <= 2)) {
    assert.deepEqual(stage.acceptedSnapshotAfter, old.iterations[stage.ordinal - 1].acceptedSnapshotAfter);
    assert.equal(stage.acceptedStageFingerprint, old.iterations[stage.ordinal - 1].acceptedStageFingerprint);
  }
  const last = first.iterations.at(-1)!;
  const result = { previousHead: "8a2bfa8ec9863ef8b232797792fab641e9b99c77",
    previousHeadObservation: prior.proof, historicalCertificates: auditPriorA2CollectiveCertificates(),
    deterministicEquivalent: true, proof: {
      completed: first.completedObligationCount, blockedAtStage: last.ordinal, branches: last.branchesExplored,
      branchBudget: buildCanonicalA2AssistedStage1Fixture().adapter.problem.budget.maxBranchExpansions,
      budgetExhausted: first.firstBlocker?.reasonCodes.some((code: string) => /BUDGET/.test(code)) ?? false,
      conclusion: first.firstBlocker?.reasonCodes.includes("FUTURE_COLLECTIVE_CLOSURE_INCONCLUSIVE") ? "INCONCLUSIVE_MISSING_JOINT_CONTEXT" : "SEE_EXACT_BLOCKER",
      acceptedStageCount: accepted.length, newAcceptedDecisionsEqualToBaseline: accepted.filter(stage => stage.ordinal <= 2).length,
      missingContextTaskIds: last.standaloneDiagnostic?.futureCollectiveClosurePendingPredecessorTaskIds,
      lastCollectiveCertificate: last.standaloneDiagnostic?.futureCollectiveClosureLastCertificate,
      noGlobalA2ImpossibilityClaim: true, rawProductBlocker: first.firstBlocker },
    first: collectiveClosureDeterministicMaterial(first), second: collectiveClosureDeterministicMaterial(second) };
  writeFileSync("docs/evidence/A2-COLLECTIVE-CLOSURE-CONTRACT.json", `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result.proof));
  return result;
}

export async function runA2CollectiveClosureEvidence() {
  const baseline = diagnoseA2CollectiveClosureStages();
  const first = await runA2Assist8Evidence({ reportIterationDurations: true });
  const second = await runA2Assist8Evidence({ reportIterationDurations: true });
  assert.deepEqual(collectiveClosureDeterministicMaterial(first), collectiveClosureDeterministicMaterial(second));
  const old = JSON.parse(readFileSync("docs/evidence/A2-ASSIST-8-assisted-completion.json", "utf8"));
  for (let index = 0; index < 2; index++) {
    assert.deepEqual(first.iterations[index]!.acceptedSnapshotAfter, old.iterations[index].acceptedSnapshotAfter);
    assert.equal(first.iterations[index]!.acceptedStageFingerprint, old.iterations[index].acceptedStageFingerprint);
  }
  const last = first.iterations.at(-1)!;
  const macroCandidates = last.standaloneDiagnostic?.macroCandidateCausalTraces ?? [];
  const terminalFutures = last.futureWitnessSetCandidateTraces ?? [];
  const { adapter } = buildCanonicalA2AssistedStage1Fixture();
  const byId = new Map(adapter.problem.tasks.map(task => [task.id, task]));
  const fixed = last.acceptedSnapshotBefore.flatMap((row: any) => {
    const task = byId.get(`task:${row.taskId}`); if (!task) return [];
    return [{ ...(row.itinerantTeamId ? materializeItinerantUnitAssignment(adapter.problem, task, `itinerant-team:${row.itinerantTeamId}`)! : task),
      start: engineTimeToMinute(row.startPlanned), end: engineTimeToMinute(row.endPlanned) }];
  });
  const authority = new PreparedFutureCollectiveParticipantClosure(adapter.problem);
  const candidateCapacity = macroCandidates.map((trace: any) => {
    const tasks = trace.candidate.starts.map((placement: any) => ({ ...byId.get(placement.taskId)!, start: placement.start, end: placement.end }));
    const capacity = authority.evaluate([...fixed, ...tasks], [], undefined, "NECESSARY_ONLY");
    return { fingerprint: trace.fingerprint, status: capacity.status, maximumMatching: capacity.maximumMatching,
      required: capacity.requiredCount, hall: capacity.hall, releaseBounds: capacity.releaseBoundsByClosure };
  });
  const capacityOutcomes = candidateCapacity.reduce((counts: Record<string, number>, row: any) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1; return counts;
  }, {});
  const proof = { completed: first.completedObligationCount, stage: last.ordinal,
    branchBudget: adapter.problem.budget.maxBranchExpansions, branches: last.branchesExplored,
    budgetExhausted: first.firstBlocker?.reasonCodes?.some((code: string) => /BUDGET/.test(code)) ?? false,
    exactMacroCandidateCount: macroCandidates.length, macroDomain: last.standaloneDiagnostic?.macroDomainSizes,
    capacityOutcomes, previousStagesEqualToBaseline: true,
    completeLeaves: last.standaloneDiagnostic?.standaloneCompleteLeafCount,
    closureAbstentions: last.standaloneDiagnostic?.futureCollectiveClosureAbstentions,
    closurePreservingGeometriesReachingFutureSet: terminalFutures.length,
    futureSetCompleteCombinations: last.futureWitnessSet?.futureWitnessSetCombinationsAttempted,
    frontierOutcomes: terminalFutures.map((trace: any) => ({ frontiers: trace.frontiers, outcome: trace.outcome,
      itineraryAlternatives: trace.itineraryAlternatives, branches: trace.branches })),
    finalBlocker: first.firstBlocker,
  };
  const result = { baseline, deterministicEquivalent: true, proof,
    first: collectiveClosureDeterministicMaterial(first), second: collectiveClosureDeterministicMaterial(second),
    exactMacroCandidateTraces: macroCandidates, candidateCapacity };
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync("docs/evidence/A2-COLLECTIVE-CLOSURE.json", `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ completed: proof.completed, deterministicEquivalent: true,
    stage: proof.stage, candidates: proof.exactMacroCandidateCount, branches: proof.branches, abstentions: proof.closureAbstentions }));
  return result;
}

/** Compact diagnostic Evidence from independently replayed, immutable states.
 * The observations directory contains the two-run assertions of the exported
 * Assisted runner and pair probes; it is never loaded by product planning. */
export function runA2CollectiveClosureSufficiencyEvidence(observationsDirectory: string) {
  const read = (name: string) => JSON.parse(readFileSync(resolve(observationsDirectory, name), "utf8"));
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const inventory = inventoryA2ClosureAncestors();
  const replays = ["parent", "previous", "current"].map(label => {
    const replay = read(`closure-replay-${label}.json`), summary = read(`closure-replay-${label}-summary.json`);
    assert.equal(summary.deterministic, true);
    assert.equal(hash(collectiveClosureDeterministicMaterial(replay)), summary.materialDigest);
    return { state: label, completed: replay.completedObligationCount, twoCleanRunsEquivalent: true,
      materialDigest: summary.materialDigest, stages: summary.stages,
      reasons: replay.firstBlocker?.reasonCodes ?? [] };
  });
  assert.deepEqual(replays.map(replay => replay.completed), [209, 38, 0]);
  const pairObservations = [0, 1, 2].map(mode => {
    const observation = read(`closure-pair-matrix-${mode}.json`); assert.equal(observation.deterministic, true);
    assert.equal(observation.first.fullClosureCertificate, false); assert.equal(observation.first.acceptedStages, 0);
    return observation;
  });
  const pair = pairObservations[0]!.first.selected; assert.ok(pair);
  const plainResidual = probeA2ResidualFrontier(pair, false), diagnosticResidual = probeA2ResidualFrontier(pair, true);
  assert.deepEqual(diagnosticResidual, plainResidual, "diagnostic must preserve residual decisions and accounting");
  const baseline = diagnoseA2CollectiveClosureStages();
  const result = { conclusion: "INCONCLUSIVE", productionCapabilityAchieved: false,
    sourceAnchors: { parent: "c00bb3d0b6211badad8d3b1352741b3dac1672ee", previous: "8a2bfa8ec9863ef8b232797792fab641e9b99c77",
      currentProduct: "176cfa40bf9ac4303f73b750c4e74b1b437609cb" },
    inventory: { ...inventory, identities: undefined },
    replays, baselineCapacity: baseline.stages.map((stage: any) => ({ stage: stage.stage, completed: stage.completed,
      matching: stage.afterMatchingCardinality, required: stage.closuresPending, hall: stage.hall,
      firstCausalDecision: stage.firstCausalDecision })),
    pairExperiments: pairObservations.map(({ mode, protectedCount, deterministic, first }) => ({ mode, protectedCount,
      twoRunsEquivalent: deterministic, ...first, selected: first.selected ? {
        mainDigest: first.selected.mainDigest, chainRoot: first.selected.chainRoot, matching: first.selected.matching,
        pendingTaskIds: first.selected.pendingTaskIds, agendaPlacements: first.selected.agendaPlacements,
        ephemeralTaskCount: first.selected.tasks.length, ephemeralGeometryDigest: hash(first.selected.tasks) } : null })),
    residualExperiment: { neutralAndDeterministic: true, ...plainResidual },
    certificateScope: "Joint supplied ancestors + canonical meals + unit-slot closure matching + OUT; exact chain/round/setup/operational authorities remain required.",
    missingProof: "A bounded joint residual continuation for the 96 productive tasks, 19 meals and 19 round tasks compatible with the chosen pipeline/chain/agenda. Also unresolved: alternative vocal/support bundle under protected Main; the existing fixed-support frontier varies styling geometry only.",
    minimalNextExperiment: "Use the existing continuations to test residual deadline/slot preservation before committing a bundle, retaining all canonical context and the 100k ledger. Require an exact positive witness; BUDGET/ABSTAIN stay unknown. No new global scheduler.",
    ci: { inheritedRun: "https://github.com/angelvicen92/production-planner/actions/runs/37839622776", inheritedJob: 113525400199,
      inherited: ["A2-ASSIST-1 canonical 19 at 6000: proposalCount 0 vs 1", "Planner Next isolation: unlisted server/benchmarks/runA2Assist8ManualEvidence.spec.ts",
        "ASST-010: standalone branch budget exhausted, NO_PROPOSAL vs PROPOSAL"],
      focusedParent: { passed: 8, failed: 3 }, focusedCurrent: { passed: 7, failed: 5 },
      additionalCurrentFailures: ["A2-ASSIST-1 small-budget contract: INCONCLUSIVE is neither proposal nor budget exhaustion",
        "A2-ASSIST-8 first accepted Stage: 0 vs 19"], productExpectationsChanged: false },
  };
  writeFileSync("docs/evidence/A2-COLLECTIVE-CLOSURE-SUFFICIENCY.json", `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify({ conclusion: result.conclusion, replayCounts: replays.map(replay => replay.completed),
    pair: pairObservations[0]!.first.outcome, residual: plainResidual.status, neutral: true }));
  return result;
}

/** Reproducible read-only collection: each revision runs from clean memory and
 * preserves only what it accepts. Detached roots are supplied explicitly. */
export async function collectA2ClosureSufficiencyObservations(parentRoot: string, previousRoot: string, directory: string) {
  mkdirSync(directory, { recursive: true });
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  for (const [label, root] of [["parent", parentRoot], ["previous", previousRoot], ["current", "."]]) {
    const runner = (await import(pathToFileURL(resolve(root!, "server/benchmarks/runA2Assist8Evidence.ts")).href)).runA2Assist8Evidence as typeof runA2Assist8Evidence;
    const first = await runner(), second = await runner();
    assert.deepEqual(collectiveClosureDeterministicMaterial(first), collectiveClosureDeterministicMaterial(second));
    assert.deepEqual(first.firstBlocker, second.firstBlocker);
    const summary = { label, completed: first.completedObligationCount, deterministic: true,
      materialDigest: hash(collectiveClosureDeterministicMaterial(first)),
      stages: first.iterations.map(stage => ({ stage: stage.ordinal, completed: stage.completedObligationCount,
        branches: stage.branchesExplored, accepted: stage.acceptedStageFingerprint ?? null,
        protected: stage.protectedPlacementsPreserved, macroDomain: stage.standaloneDiagnostic?.macroDomainSizes,
        pending: stage.standaloneDiagnostic?.futureCollectiveClosurePendingPredecessorTaskIds })) };
    writeFileSync(resolve(directory, `closure-replay-${label}.json`), JSON.stringify(first));
    writeFileSync(resolve(directory, `closure-replay-${label}-summary.json`), JSON.stringify(summary));
  }
  const parent = JSON.parse(readFileSync(resolve(directory, "closure-replay-parent.json"), "utf8"));
  for (const mode of [0, 1, 2]) {
    const stage = mode ? parent.iterations[mode - 1] : null;
    const fixed = stage ? replayA2AcceptedTasks(stage.acceptedSnapshotAfter) : [];
    const meals = stage ? replayA2OperationalMeals(stage.proposedSnapshotOperationalMeals) : [];
    if (stage) { assert.deepEqual(stage.selectedSetupPreparations, []); assert.deepEqual(stage.selectedRoundPreparations, []); }
    const first = probeA2PipelineChainAgenda(fixed, meals), second = probeA2PipelineChainAgenda(fixed, meals);
    assert.deepEqual(first, second);
    writeFileSync(resolve(directory, `closure-pair-matrix-${mode}.json`), JSON.stringify({ mode, protectedCount: fixed.length, deterministic: true, first }));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argument = (name: string) => {
    const position = process.argv.indexOf(name); assert.ok(position >= 0 && process.argv[position + 1], `${name} is required`);
    return process.argv[position + 1]!;
  };
  if (process.argv.includes("--completion-observations")) {
    const first = JSON.parse(readFileSync(argument("--first"), "utf8"));
    const second = JSON.parse(readFileSync(argument("--second"), "utf8"));
    console.log(JSON.stringify(runA2CollectiveClosureCompletionEvidence(first, second).proof));
  } else if (process.argv.includes("--collect-sufficiency-observations")) {
    await collectA2ClosureSufficiencyObservations(argument("--parent-root"), argument("--previous-root"), argument("--observations-directory"));
  } else if (process.argv.includes("--sufficiency-diagnosis")) {
    const position = process.argv.indexOf("--observations-directory");
    assert.ok(position >= 0 && process.argv[position + 1], "--observations-directory is required");
    runA2CollectiveClosureSufficiencyEvidence(process.argv[position + 1]!);
  } else if (process.argv.includes("--diagnose")) console.log(JSON.stringify(diagnoseA2CollectiveClosureStages(), null, 2));
  else if (process.argv.includes("--legacy-capacity-evidence")) await runA2CollectiveClosureEvidence();
  else await runA2CollectiveClosureContractEvidence();
}
