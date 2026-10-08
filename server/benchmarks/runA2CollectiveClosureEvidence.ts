import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCanonicalA2AssistedStage1Fixture } from "../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture";
import { PreparedFutureCollectiveParticipantClosure, futureCollectiveClosureEvidenceKeys } from "../../engine/planner-next/futureCollectiveParticipantClosure";
import { exactTaskStartDomain, diagnoseTaskPlacement, canPlaceTask } from "../../engine/planner-next/placement";
import { materializeItinerantUnitAssignment } from "../../engine/planner-next/itinerantUnitAssignment";
import { engineTimeToMinute } from "../../engine/planner-next/integration/engineTime";
import type { ScheduledTask } from "../../engine/planner-next/contracts";
import { runA2Assist8Evidence } from "./runA2Assist8Evidence";

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
  const state = (rows: any[]): ScheduledTask[] => rows.flatMap(row => {
    const task = byId.get(`task:${row.taskId}`);
    if (!task) return [];
    const assigned = row.itinerantTeamId ? materializeItinerantUnitAssignment(problem, task, `itinerant-team:${row.itinerantTeamId}`)! : task;
    return [{ ...assigned, start: engineTimeToMinute(row.startPlanned), end: engineTimeToMinute(row.endPlanned) }];
  });
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
    futureWitnesses: stage.futureStructuralWitnesses, witnessSet: stage.futureWitnessSet?.finalSet,
    closure: Object.fromEntries(futureCollectiveClosureEvidenceKeys.map(key => [key, stage.standaloneDiagnostic?.[key]])),
    hardRequired: stage.hardRequiredValidation, globalMealGate: stage.sodexoMeals?.globalMealGate }));
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.includes("--diagnose")) console.log(JSON.stringify(diagnoseA2CollectiveClosureStages(), null, 2));
  else await runA2CollectiveClosureEvidence();
}
