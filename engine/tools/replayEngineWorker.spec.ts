import test from "node:test";
import assert from "node:assert/strict";
import { stableReplayOutputFingerprint } from "./replayEngineWorker";
test("fingerprint ignores runtime and generatedAt",()=>{ const a={output:{plannedTasks:[{taskId:1,startPlanned:"09:00"}],unplanned:[],feasible:true,complete:true}, runtimeMs:10, generatedAt:"a"}; const b={generatedAt:"b", runtimeMs:999, output:{complete:true,feasible:true,unplanned:[],plannedTasks:[{startPlanned:"09:00",taskId:1}]}}; assert.equal(stableReplayOutputFingerprint(a), stableReplayOutputFingerprint(b)); });
import { replayOptionalNumber } from "./replayEngineWorker";
test("replay optional numbers never coerce nullish values to zero",()=>{ assert.equal(replayOptionalNumber(null), null); assert.equal(replayOptionalNumber(undefined), null); assert.equal(replayOptionalNumber(""), null); assert.equal(replayOptionalNumber("0"), 0); });
import { compactInitialConstructionStage2 } from "./replayEngineWorker";

test("replay compact evidence exposes Initial Construction Stage 2 without full simulated states", () => {
  const compact = compactInitialConstructionStage2({
    version: "v",
    executed: true,
    executedBeforeV4: true,
    inputSource: "original",
    v4SeedUsed: false,
    selectedAnchorTaskId: 1,
    stage1SelectedAnchorTaskId: 1,
    anchorMatchesStage1: true,
    closureTaskIds: [2, 1],
    closureTaskCount: 2,
    topologicalTaskOrder: [2, 1],
    branchCandidateCount: 1,
    attemptedBranchCount: 1,
    branchAttempts: Array.from({ length: 12 }, (_, index) => ({ branchId: String(index), operationalStateSnapshot: { huge: true } })),
    selectedAssignments: Array.from({ length: 12 }, (_, taskId) => ({ taskId, resourceIds: [] })),
    recursiveAssignmentBacktrackCount: 0,
    branchRetryCount: 0,
    branchesRejectedBeforeSelection: 0,
    capabilityAudit: { fullFutureFeasibilityImplemented: false, recursiveAssignmentBacktrackingSupported: true, recursiveAssignmentBacktrackingObserved: false, branchAlternativeEvaluationSupported: true, branchRetryObserved: false },
    readOnly: true,
  });
  assert.equal(compact?.executed, true);
  assert.equal(compact?.selectedAssignmentsSample.length, 10);
  assert.equal(compact?.branchAttempts.length, 10);
  assert.equal((compact?.branchAttempts[0] as any).operationalStateSnapshot, undefined);
  assert.equal(compact?.recursiveBacktrackCount, 0);
  assert.equal(compact?.branchesRejectedBeforeSelection, 0);
  assert.equal((compact?.capabilityAudit as any).recursiveAssignmentBacktrackingObserved, false);
});
