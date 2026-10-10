import assert from 'node:assert/strict';
import {buildA2ImportRows} from './a2ImportRows';
import {a2ImportStorageFixture} from './a2ImportStorageFixture';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {revalidateJointCompletionWitness} from '../../engine/planner-next/jointCompletionWitness';
import {validatePlan} from '../../engine/planner-next/validate';
import {materializeScheduledItinerantUnitMeals} from '../../engine/planner-next/itinerantUnitMeals';
import {PreparedFutureCollectiveParticipantClosure} from '../../engine/planner-next/futureCollectiveParticipantClosure';

/** Independent post-run certification against the effective rows before each stage. */
export async function auditA2ImportedRun(result:any){
 const rows=buildA2ImportRows('2026-10-30'),fixture=a2ImportStorageFixture(rows),audit=[];
 let acceptedIds=new Set<number>();
 for(const stage of result.iterations){
  const input=await buildEngineInput(rows.input.planId,fixture.storage),adapter=adaptEngineInputToPlannerNextProblem(input);
  assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('Invalid persisted stage input');
  const witness=stage.futureStructuralWitnesses.find((w:any)=>w.kind==='JOINT_COMPLETION');assert.ok(witness);
  let charges=0;const consume=()=>charges<100_000?(charges++,true):false;
  const protectedTasks=witness.tasks.filter((t:any)=>acceptedIds.has(Number(t.id.split(':').at(-1))));
  assert.equal(revalidateJointCompletionWitness(adapter.problem,witness,protectedTasks,consume),'PASS');
  const validation=validatePlan(adapter.problem,witness.tasks,witness.preparations,witness.spaceMeals,witness.participantMeals,[],materializeScheduledItinerantUnitMeals(adapter.problem),witness.roundPreparations,witness.operationalMeals);
  assert.equal(validation.hardValid,true);assert.deepEqual(validation.violations,[]);
  const closure=new PreparedFutureCollectiveParticipantClosure(adapter.problem).evaluate(witness.tasks,witness.participantMeals,consume,'CERTIFY');assert.equal(closure.certified,true);
  assert.equal(stage.protectedEqualityProof.equal,true);assert.ok(stage.acceptedStageProposalRunId!=null);
  for(const task of stage.acceptedSnapshotAfter){const row=fixture.tables.daily_tasks.find((r:any)=>r.id===task.taskId);Object.assign(row,{start_planned:task.startPlanned,end_planned:task.endPlanned,zone_id:task.zoneId,space_id:task.spaceId,location_label:task.locationLabel,duration_override:task.durationOverride,cameras_override:task.camerasOverride});if(task.assignedResourceIds)row.assigned_resource_ids=[...task.assignedResourceIds];}
  acceptedIds=new Set(stage.acceptedSnapshotAfter.map((t:any)=>t.taskId));
  audit.push({stage:audit.length+1,validation:'PASS',replay:'PASS',closure:'CERTIFIED',protectedSnapshotLiteral:true,charges,witnessFingerprint:witness.fingerprint});
 }
 return audit;
}
