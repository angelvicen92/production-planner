import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildInitialConstructionExecutableFrontierPortfolio } from "./initialConstructionExecutableFrontierPortfolio";

const chain = (goalTaskId:number, executionTaskId:number, rankSlack=10, main=false) => ({
  goalTaskId,
  executableFrontierTaskIds:[executionTaskId],
  topologicalPendingChainTaskIds:[executionTaskId, goalTaskId],
  goalMainFlow:main,
  feedsMainFlow:!main,
  chainSlackMinutes:rankSlack,
  ownSlackMinutes:rankSlack+5,
  downstreamCriticalDurationMinutes:goalTaskId,
  unlockPotential:1,
  resourcePressure:0,
  spacePressure:0,
  inheritedCriticalitySourceTaskIds:[goalTaskId],
  priorityKey:{hardRiskRank:0,chainSlackMinutes:rankSlack,deterministicTaskId:goalTaskId},
  fingerprint:`chain:${goalTaskId}:${executionTaskId}:${rankSlack}`,
  readOnly:true,
});

describe("initialConstructionExecutableFrontierPortfolio", () => {
  it("groups shared executable frontier occurrences by executionTaskId", () => {
    const portfolio = buildInitialConstructionExecutableFrontierPortfolio({
      parentAssignmentsFingerprint:"parent",
      initialConstructionMap:{criticalChains:[chain(10, 3), chain(20, 3), chain(30, 3)]},
      canonicalAnchors:[{anchorTaskId:3,fingerprint:"anchor:3",lexicographicPriority:[0]}],
    });
    assert.equal(portfolio.chainFrontierOccurrenceCount, 3);
    assert.equal(portfolio.uniqueExecutableFrontierTaskCount, 1);
    assert.equal(portfolio.duplicateChainFrontierOccurrenceCount, 2);
    assert.equal(portfolio.sharedExecutableFrontierTaskCount, 1);
    assert.equal(portfolio.candidates[0].executionTaskId, 3);
    assert.deepEqual(portfolio.candidates[0].supportedGoalTaskIds, [10,20,30]);
    assert.equal(portfolio.candidates[0].supportingChainCount, 3);
  });

  it("keeps primary goal from the best ranked chain while preserving secondary goals", () => {
    const portfolio = buildInitialConstructionExecutableFrontierPortfolio({
      parentAssignmentsFingerprint:"parent",
      initialConstructionMap:{criticalChains:[chain(10, 3, 1), chain(20, 3, 1), chain(30, 3, 1)]},
      canonicalAnchors:[{anchorTaskId:3,fingerprint:"anchor:3",lexicographicPriority:[0]}],
    });
    assert.equal(portfolio.candidates[0].primaryGoalTaskId, 10);
    assert.deepEqual(portfolio.candidates[0].supportedGoalTaskIds, [10,20,30]);
  });

  it("uses shared fanout as a deterministic tie breaker after chain rank and slack", () => {
    const portfolio = buildInitialConstructionExecutableFrontierPortfolio({
      parentAssignmentsFingerprint:"parent",
      initialConstructionMap:{criticalChains:[chain(10, 3, 5, true), chain(20, 3, 5, true), chain(30, 3, 5, true), chain(40, 4, 5, true)]},
      canonicalAnchors:[{anchorTaskId:3,fingerprint:"anchor:3",lexicographicPriority:[0]},{anchorTaskId:4,fingerprint:"anchor:4",lexicographicPriority:[0]}],
    });
    assert.equal(portfolio.candidates[0].executionTaskId, 3);
    assert.deepEqual(portfolio.candidates.map(c=>c.executionTaskId), [3,4]);
  });
});
