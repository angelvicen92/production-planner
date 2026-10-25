import assert from 'node:assert/strict';
import {buildCanonicalA2AssistedStage1Fixture} from '../../../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture';
import {revalidateJointCompletionWitness} from '../../../engine/planner-next/jointCompletionWitness';
import {validatePlan} from '../../../engine/planner-next/validate';
import {materializeScheduledItinerantUnitMeals} from '../../../engine/planner-next/itinerantUnitMeals';
import {PreparedFutureCollectiveParticipantClosure} from '../../../engine/planner-next/futureCollectiveParticipantClosure';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
/** Same three canonical authorities and 100,000 audit charges as buildA2Demo.
 * Eleven full certificates per fresh process; candidate + repeat must total 22. */
export function certificates(report:any,snapshots:any[]){
 const fixture=buildCanonicalA2AssistedStage1Fixture(100_000,711);assert.equal(fixture.adapter.status,'SUPPORTED');
 const adapter=fixture.adapter as Extract<typeof fixture.adapter,{status:'SUPPORTED'}>;
 const results:any[]=[];
 for(const [i,iteration] of report.iterations.entries()){
  const joint=iteration.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION');assert.ok(joint);
  const before=i===0?{tasks:[]}:snapshots[i-1];
  const protectedIds=new Set(before.tasks.filter((t:any)=>t.startPlanned&&t.endPlanned).map((t:any)=>`task:${t.taskId}`));
  const protectedTasks=joint.tasks.filter((t:any)=>protectedIds.has(t.id));
  let charges=0;const consume=()=>charges<100_000?(charges++,true):false;
  const replay=revalidateJointCompletionWitness(adapter.problem,joint,protectedTasks,consume);assert.equal(replay,'PASS');
  const validation=validatePlan(adapter.problem,joint.tasks,joint.preparations,joint.spaceMeals,joint.participantMeals,[],materializeScheduledItinerantUnitMeals(adapter.problem),joint.roundPreparations,joint.operationalMeals);
  assert.equal(validation.hardValid,true);assert.deepEqual(validation.violations,[]);
  const closure=new PreparedFutureCollectiveParticipantClosure(adapter.problem).evaluate(joint.tasks,joint.participantMeals,consume,'CERTIFY');assert.equal(closure.certified,true);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(snapshots[i]),iteration.acceptedStageFingerprint);
  assert.equal(iteration.protectedEqualityProof.equal,true);assert.ok(iteration.acceptedStageProposalRunId!=null);
  results.push({stage:i+1,witnessFingerprint:joint.fingerprint,replay,validation:'PASS',closure:'CERTIFIED',protectedLiteral:true,charges});
 }
 assert.equal(results.length,11);return results;
}
