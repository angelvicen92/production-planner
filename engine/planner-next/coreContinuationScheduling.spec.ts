import assert from "node:assert/strict";
import test from "node:test";
import { boundedCoreContinuation, createExactSearchLedger, incrementallyRepairMatchingWitness,
  runExactMainAndFeederSearch, type ExactCoreContinuationOutcome,
  type ExactMainAndFeederSearchOptions } from "./exactMainAndFeederCore";
import type { PlannerNextProblem } from "./contracts";
import { validatePlan } from "./validate";

function fixture(starts = [60, 80], ids = ["a"], positionDomain?: ReadonlyMap<string, number[]>) {
  const availability = [{ start: 0, end: 120 }];
  const problem: PlannerNextProblem = {
    day: { start: 0, end: 120 }, resources: [],
    spaces: ["main", "feed"].map(id => ({ id, availability })),
    participants: ids.map(id => ({ id, availability })), coaches: [{ id: "coach", availability }],
    tasks: ids.flatMap(id => [
      { id: `feeder-${id}`, kind: "vocal" as const, participantId: id, coachId: "coach",
        duration: 10, spaceId: "feed", dependencies: [] },
      { id: `main-${id}`, kind: "main" as const, participantId: id, coachId: "coach",
        duration: 10, spaceId: "main", dependencies: [`feeder-${id}`], blockKey: "coach" },
    ]),
    mainFlow: { spaceId: "main", preferredEnd: 120, continuity: "REQUIRED", maxBlocksByKey: 1, minTasksPerBlock: 1 },
    participantTransitionMinutes: 0, resourceTransitionMinutes: 0,
    budget: { bestK: 1, maxBacktracks: 0, maxPatterns: 20, maxBranchExpansions: 10_000 },
  };
  const bundles = starts.map(start => {
    const positions = positionDomain ?? new Map(ids.map(id => [`main-${id}`, ids.map((_, index) => index)]));
    const materialize = (matching: ReadonlyMap<string, number>) => [...matching].flatMap(([id, position]) => [
      { ...problem.tasks.find(task => task.id === id.replace("main", "feeder"))!, start: 20 + 10 * position, end: 30 + 10 * position },
      { ...problem.tasks.find(task => task.id === id)!, start: start + 10 * position, end: start + 10 * position + 10 },
    ]);
    const matching = new Map(ids.map((id, index) => [`main-${id}`, index]));
    return {
      architecture: { pattern: ids.map(() => "coach"), slots: ids.map((_, index) => start + 10 * index) },
      architectureFingerprint: `geometry-${start}`,
      bundle: { scheduledTasks: materialize(matching), matching, forbiddenEdges: new Set<string>() },
      repair(previous: { matching: ReadonlyMap<string, number>; forbiddenEdges: ReadonlySet<string> },
        forbidden: ReadonlySet<string>, consume: () => boolean) {
        const repaired = incrementallyRepairMatchingWitness(ids.map(id => `main-${id}`), positions,
          forbidden, previous.forbiddenEdges, previous.matching, consume);
        return repaired.outcome === "PERFECT" ? { scheduledTasks: materialize(repaired.matching!),
          matching: repaired.matching!, forbiddenEdges: forbidden } : null;
      },
    };
  });
  return { problem, bundles };
}

test("an early certificate preserves the original ledger and never defers", () => {
  const { problem, bundles } = fixture();
  const before = structuredClone(problem), ledger = createExactSearchLedger(100);
  const result = runExactMainAndFeederSearch(problem, { ledger, structuralBundleCandidates: bundles,
    onStructuralCoreContinuation: () => boundedCoreContinuation(ledger, 2, () => {
      assert.equal(ledger.consume("STANDALONE"), true); return "ACCEPT";
    }) });
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.scheduledTasks.find(task => task.kind === "main")!.start, 60);
  assert.equal(ledger.standaloneBranches, 1);
  assert.equal(result.evidence.bundleContinuationDeferrals, 0);
  assert.equal(validatePlan(problem, result.scheduledTasks).hardValid, true);
  assert.deepEqual(problem, before);
});

test("a later certificate is reached while the first viable root stays deferred", () => {
  const { problem, bundles } = fixture(), ledger = createExactSearchLedger(100);
  const visited: string[] = [];
  const result = runExactMainAndFeederSearch(problem, { ledger, structuralBundleCandidates: bundles,
    onStructuralCoreContinuation(candidate) {
      return boundedCoreContinuation(ledger, 2, () => {
        visited.push(candidate.architectureFingerprint!);
        const work = candidate.architectureFingerprint === "geometry-60" ? 5 : 1;
        for (let index = 0; index < work; index++) if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        return "ACCEPT";
      });
    } });
  assert.equal(result.status, "COMPLETE");
  assert.deepEqual(visited, ["geometry-60", "geometry-80"]);
  assert.equal(ledger.standaloneBranches, 4); // three first-attempt decisions, one late certificate
  assert.equal(result.evidence.bundleContinuationDeferrals, 1);
  assert.equal(result.evidence.bundlePendingContinuations, 1);
  assert.equal(result.evidence.bundleContinuationResumptions, 0);
  assert.equal(result.evidence.bundleNogoodsCreated, 0);
  assert.equal(result.evidence.bundleHardValidationRejects, 0);
});

test("deferred roots reenter with growing quanta and charge reconstruction to the same ledger", () => {
  const { problem, bundles } = fixture(), ledger = createExactSearchLedger(100);
  const fixed = { ...problem.tasks.find(task => task.kind === "vocal")!, start: 20, end: 30 };
  const reservations = [{ structureId: "pending-chain", fingerprint: "retained-reservation", rootStart: 100,
    phaseOrder: ["pending"], scheduledTasks: [], productiveInterval: { start: 100, end: 110 }, branchCost: 1, ledgerDelta: 0 }];
  const retainedBundles = bundles.map(bundle => ({ ...bundle, selectedFutureReservations: reservations,
    selectedFutureReservationFingerprints: ["retained-reservation"] }));
  const entered: Array<{ root: string; fingerprint: string; reservations: unknown }> = [];
  const result = runExactMainAndFeederSearch(problem, { ledger, structuralBundleCandidates: retainedBundles, fixedPlacements: [fixed],
    onStructuralCoreContinuation(candidate) {
      return boundedCoreContinuation(ledger, 2, () => {
        assert.equal(candidate.selectedFutureReservations, reservations);
        assert.deepEqual(candidate.selectedFutureReservationFingerprints, ["retained-reservation"]);
        assert.deepEqual(candidate.tasks.find(task => task.id === fixed.id), fixed);
        entered.push({ root: candidate.architectureFingerprint!, fingerprint: candidate.fingerprint, reservations: candidate.selectedFutureReservations });
        if (candidate.architectureFingerprint === "geometry-80") return "REJECT";
        for (let index = 0; index < 5; index++) if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        return "ACCEPT";
      });
    } });
  assert.equal(result.status, "COMPLETE");
  assert.deepEqual(entered.map(row => row.root), ["geometry-60", "geometry-80", "geometry-60", "geometry-60"]);
  assert.equal(new Set(entered.filter(row => row.root === "geometry-60").map(row => row.fingerprint)).size, 1);
  assert.equal(ledger.standaloneBranches, 13); // 3 + 5 + 5, including both interruption decisions
  assert.equal(result.evidence.bundleContinuationDeferrals, 2);
  assert.equal(result.evidence.bundleContinuationResumptions, 2);
  assert.equal(result.evidence.bundlePendingContinuations, 0);
  assert.equal(result.evidence.bundleNogoodsCreated, 0);
  assert.equal(ledger.limit, 100);
  assert.deepEqual(result.scheduledTasks.find(task => task.id === fixed.id), fixed);
  assert.deepEqual(reservations[0]!.scheduledTasks, [], "a retained reservation never becomes a protected placement");
});

test("a certificate returned after reentry repairs its original graph before ordinary DFS", () => {
  const { problem, bundles } = fixture([60, 80], ["a", "b"]), ledger = createExactSearchLedger(100);
  const entered: string[] = [];
  const result = runExactMainAndFeederSearch(problem, { ledger, structuralBundleCandidates: bundles,
    onHardValidCoreLeaf: () => { assert.fail("structural repair must complete before ordinary DFS"); },
    onStructuralCoreContinuation(candidate) {
      const first = candidate.tasks.filter(task => task.kind === "main").sort((a, b) => a.start - b.start)[0]!;
      return boundedCoreContinuation(ledger, 2, () => {
        entered.push(`${candidate.architectureFingerprint}:${first.participantId}`);
        if (candidate.architectureFingerprint === "geometry-80") return "REJECT";
        if (first.participantId === "b") return "ACCEPT";
        for (let index = 0; index < 3; index++) if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        return { outcome: "CERTIFIED_BACKJUMP", targetDepth: 1 };
      });
    } });
  assert.equal(result.status, "COMPLETE");
  assert.deepEqual(entered, ["geometry-60:a", "geometry-80:a", "geometry-60:a", "geometry-60:b"]);
  assert.equal(result.evidence.bundleContinuationResumptions, 1);
  assert.equal(result.evidence.bundleCertifiedRepairs, 1);
  assert.equal(result.scheduledTasks.find(task => task.id === "main-a")!.start, 70);
  assert.equal(validatePlan(problem, result.scheduledTasks).hardValid, true);
});

test("no certificate exhausts deferred continuations before reporting infeasibility", () => {
  const { problem, bundles } = fixture([60]), ledger = createExactSearchLedger(10_000);
  problem.tasks.forEach(task => { task.availability = task.kind === "main" ? [{ start: 60, end: 70 }] : [{ start: 20, end: 30 }]; });
  const result = runExactMainAndFeederSearch(problem, { ledger, structuralBundleCandidates: bundles,
    onHardValidCoreLeaf: () => "REJECT",
    onStructuralCoreContinuation: () => boundedCoreContinuation(ledger, 2, () => {
      for (let index = 0; index < 5; index++) if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
      return "REJECT";
    }) });
  assert.equal(result.status, "INFEASIBLE");
  assert.equal(result.evidence.bundleContinuationResumptions, 2);
  assert.equal(result.evidence.bundlePendingContinuations, 0);
  assert.equal(ledger.standaloneBranches, 13);
  assert.equal(result.evidence.bundleNogoodsCreated, 0);
});

test("global exhaustion stops reentry without declaring the deferred root infeasible", () => {
  const { problem, bundles } = fixture(), ledger = createExactSearchLedger(10);
  const result = runExactMainAndFeederSearch(problem, { ledger, structuralBundleCandidates: bundles,
    onStructuralCoreContinuation(candidate) {
      return boundedCoreContinuation(ledger, 2, () => {
        if (candidate.architectureFingerprint === "geometry-80") return "REJECT";
        for (let index = 0; index < 20; index++) if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        return "ACCEPT";
      });
    } });
  assert.equal(result.status, "BRANCH_BUDGET_EXHAUSTED");
  assert.equal(ledger.branchesExplored, 10);
  assert.equal(result.evidence.bundleContinuationDeferrals, 2);
  assert.equal(result.evidence.bundleNogoodsCreated, 0);
  assert.equal(result.evidence.bundleHardValidationRejects, 0);
});

test("reentry retains the matching graph and every certified repair sibling", () => {
  const { problem, bundles } = fixture([60, 80], ["a", "b", "c"],
    new Map([["main-a", [0, 2]], ["main-b", [1, 2]], ["main-c", [0, 1, 2]]]));
  const before = structuredClone(problem), ledger = createExactSearchLedger(200);
  const visited: string[] = [], rootFingerprints = new Map<string, Set<string>>();
  const result = runExactMainAndFeederSearch(problem, { ledger, structuralBundleCandidates: bundles,
    onHardValidCoreLeaf: () => "REJECT",
    onStructuralCoreContinuation(candidate) {
      const ordered = candidate.tasks.filter(task => task.kind === "main").sort((a, b) => a.start - b.start);
      const order = ordered.map(task => task.participantId).join("");
      const key = `${candidate.architectureFingerprint}:${order}`;
      return boundedCoreContinuation(ledger, 2, () => {
        visited.push(key);
        const seen = rootFingerprints.get(key) ?? new Set(); seen.add(candidate.fingerprint); rootFingerprints.set(key, seen);
        if (candidate.architectureFingerprint === "geometry-80") return "REJECT";
        if (order === "abc") return { outcome: "CERTIFIED_BACKJUMP", targetDepth: 1, conflictDecisionDepths: [1, 2] };
        for (let index = 0; index < 5; index++) if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        return order === "acb" ? "ACCEPT" : "REJECT";
      });
    } });
  assert.equal(result.status, "COMPLETE");
  assert.ok(visited.includes("geometry-60:cba"), JSON.stringify(visited));
  assert.ok(visited.includes("geometry-60:acb"), JSON.stringify(visited));
  assert.ok(visited.indexOf("geometry-80:abc") < visited.lastIndexOf("geometry-60:cba"));
  assert.ok([...rootFingerprints.values()].every(seen => seen.size === 1));
  assert.equal(result.evidence.bundleNogoodsCreated, 1, "deferrals do not create matching nogoods");
  assert.equal(result.evidence.bundleCertifiedRepairs, 2);
  assert.equal(result.evidence.bundleContinuationResumptions, 4);
  assert.equal(validatePlan(problem, result.scheduledTasks).hardValid, true);
  assert.deepEqual(problem, before);
});

test("local continuation quotas never interrupt a CORE authority after it advances", () => {
  const ledger = createExactSearchLedger(20);
  const result = boundedCoreContinuation(ledger, 1, () => {
    assert.equal(ledger.consume("CORE", 5), true);
    assert.equal(ledger.consume("STANDALONE"), true);
    return "ACCEPT";
  });
  assert.equal(result, "ACCEPT");
  assert.equal(ledger.coreBranches, 5);
  assert.equal(ledger.standaloneBranches, 1);
});

test("scheduling, ledger and preserved roots are deterministic and restore consume on failure", () => {
  const { problem, bundles } = fixture();
  const run = () => {
    const ledger = createExactSearchLedger(100);
    const onStructuralCoreContinuation: NonNullable<ExactMainAndFeederSearchOptions["onStructuralCoreContinuation"]> = candidate =>
      boundedCoreContinuation(ledger, 2, (): ExactCoreContinuationOutcome => {
        if (candidate.architectureFingerprint === "geometry-80") return "REJECT";
        for (let index = 0; index < 5; index++) if (!ledger.consume("STANDALONE")) return "BUDGET_EXHAUSTED";
        return "ACCEPT";
      });
    return runExactMainAndFeederSearch(problem, { ledger, structuralBundleCandidates: bundles, onStructuralCoreContinuation });
  };
  assert.deepEqual(run(), run());
  const ledger = createExactSearchLedger(10), consume = ledger.consume;
  assert.throws(() => boundedCoreContinuation(ledger, 2, () => { throw new Error("fixture failure"); }), /fixture failure/);
  assert.equal(ledger.consume, consume);
  assert.equal(ledger.consume("CORE"), true);
});
