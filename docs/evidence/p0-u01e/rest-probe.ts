/** Isolate resource rest from visual/space occupancy on an authentic receipt. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {validatePlan} from '../../../engine/planner-next/validate';
const base=process.argv[2],output=process.argv[3];
const read=(n:string)=>JSON.parse(readFileSync(`${base}/${n}.json`,'utf8'));
const input=read('D-rest-competition-input'),record=read('D-rest-competition-memory-partial'),problem=record.adapter.problem,witness=structuredClone(record.result.evidence.nominalPhysicalFutureWitness);
const rival=witness.tasks.find((t:any)=>t.id==='task:'+input.tasks.at(-3).id),rest=witness.operationalMeals[0];
assert.ok(!rest.spaceIds.includes(rival.spaceId));rival.start=rest.start;rival.end=rival.start+rival.duration;assert.equal(rival.end,rest.end);
const validate=(p:any,w:any)=>validatePlan(p,w.tasks,w.setupPreparations??[],w.spaceMeals??[],w.participantMeals??[],w.resourceMeals??[],w.itinerantUnitMeals??[],w.roundPreparations??[],w.operationalMeals??[]);
const affected=validate(problem,witness);assert.equal(affected.hardValid,false);
const withoutAProblem=structuredClone(problem),withoutAWitness=structuredClone(witness),a=rival.requiredResourceIds[0];
withoutAProblem.operationalMealPolicies[0].resourceIds=withoutAProblem.operationalMealPolicies[0].resourceIds.filter((id:string)=>id!==a);
withoutAWitness.operationalMeals[0].resourceIds=withoutAWitness.operationalMeals[0].resourceIds.filter((id:string)=>id!==a);
const unaffected=validate(withoutAProblem,withoutAWitness);assert.equal(unaffected.hardValid,true);
writeFileSync(output,JSON.stringify({memoryOnly:true,stage:false,intervention:'Move the genuine A competitor into the genuine rest interval in its own independent space. Then change only the A membership of the rest authority and matching rest witness.',rival,rest,affected,withoutAResource:unaffected,conclusion:'The resource rest alone rejects the same physical occupation; space occupancy and visual location cannot explain that rejection.'},null,2));
