/** Reparable supporting witness from an authentic API proposal; no writes. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {validatePlan} from '../../../engine/planner-next/validate';
import {certifyDailyTechnicalChain} from '../../../server/technicalChainCertificate';
const base=process.argv[2],read=(name:string)=>JSON.parse(readFileSync(`${base}/${name}.json`,'utf8'));
const r=read('A-fixed-scope-representative').assisted_result_json,p=read('A-fixed-adapter').problem,w=structuredClone(r.evidence.nominalPhysicalFutureWitness);
const supporting=r.evidence.supportingTaskIds.map((id:string)=>w.tasks.find((t:any)=>t.id===id));assert.equal(supporting.length,3);
const [left,right]=supporting;[left.start,right.start]=[right.start,left.start];left.end=left.start+left.duration;right.end=right.start+right.duration;
const validation=validatePlan(p,w.tasks,w.setupPreparations??[],w.spaceMeals??[],w.participantMeals??[],w.resourceMeals??[],w.itinerantUnitMeals??[],w.roundPreparations??[],w.operationalMeals??[]);
assert.ok(validation.hardValid);assert.equal(r.evidence.acceptedSupportingPlacements.length,0);const certificate=certifyDailyTechnicalChain(p,w.tasks.filter((t:any)=>r.proposal.some((row:any)=>t.id==='task:'+row.taskId)),0,w);assert.equal(certificate?.status,'WITNESS');
writeFileSync(process.argv[3],JSON.stringify({status:'PASS',memoryRepairOnly:true,source:'authentic API scope representative',changed:[left.id,right.id],acceptedSupportingPlacements:[],validation,certificate,proposal:r.proposal},null,2));
