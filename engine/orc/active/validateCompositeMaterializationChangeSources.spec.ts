import test from "node:test";
import assert from "node:assert/strict";
import { validateCompositeMaterializationChangeSources } from "./validateCompositeMaterializationChangeSources";

const state = (ids: number[], changed: number[] = []) => ({ id:"s", tasks:[], resources:[], spaces:[], teams:[], contestants:[], constraints:[], metadata:{}, planning: ids.map((taskId) => ({ taskId, startPlanned: changed.includes(taskId) ? "10:00" : "09:00", endPlanned: changed.includes(taskId) ? "11:00" : "10:00", assignedSpace: 1, assignedResourceIds:[1] })) } as any);

test("accepts applied baseline and continuity sources with rejected optional improvement", () => {
  const r = validateCompositeMaterializationChangeSources({ originalState: state([1,2,3,4,5,6,7,8]), selectedFinalState: state([1,2,3,4,5,6,7,8], [1,2,3,4,5,6,7]), changeSources: { baselineOverlapRepair:{changedTaskIds:[1]}, postRepairMainZoneContinuity:{changedTaskIds:[2,3,4,5,6,7]} }, rejectedOptionalImprovements: { criticalResourceIdleCompression:{ rejected:true, changedTaskIds:[8] } } });
  assert.equal(r.summaryContractValid, true);
  assert.ok(!r.warnings.includes("composite_materialization_change_sources_do_not_explain_final_diff"));
  assert.deepEqual(r.appliedChangeSourceKeys, ["baselineOverlapRepair", "postRepairMainZoneContinuity"]);
  assert.deepEqual(r.rejectedChangeSourceKeys, ["criticalResourceIdleCompression"]);
  assert.deepEqual(r.unexplainedChangedTaskIds, []);
});

test("rejects unexplained final diff", () => {
  const r = validateCompositeMaterializationChangeSources({ originalState: state([1,2]), selectedFinalState: state([1,2], [1,2]), changeSources: { baselineOverlapRepair:{changedTaskIds:[1]} } });
  assert.equal(r.summaryContractValid, false);
  assert.ok(r.warnings.includes("composite_materialization_change_sources_do_not_explain_final_diff"));
  assert.deepEqual(r.unexplainedChangedTaskIds, [2]);
});

test("warns when an applied source declares unchanged task", () => {
  const r = validateCompositeMaterializationChangeSources({ originalState: state([1,2]), selectedFinalState: state([1,2], [1]), changeSources: { baselineOverlapRepair:{changedTaskIds:[1,2]} } });
  assert.equal(r.summaryContractValid, false);
  assert.ok(r.warnings.includes("composite_materialization_declared_change_not_present"));
  assert.deepEqual(r.declaredButUnchangedTaskIds, [2]);
});

test("conceptual read-only audit does not invalidate a valid materialization", () => {
  const r = validateCompositeMaterializationChangeSources({ originalState: state([1]), selectedFinalState: state([1], [1]), changeSources: { baselineOverlapRepair:{changedTaskIds:[1]} }, productionConceptAlignment: { verdict:"conceptually_misaligned", macroPlannerRequired:true } });
  assert.equal(r.summaryContractValid, true);
  assert.equal(r.readOnlyAuditDoesNotAffectGate, true);
});
