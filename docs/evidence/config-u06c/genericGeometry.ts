import{writeFileSync}from'node:fs';
import{operationContinuityScenario}from'../../../engine/planner-next/scenarios/operationContinuityScenario.ts';
import{materializeNominalPipelineWitness}from'../../../engine/planner-next/anonymousPipelineWitness.ts';
import{validatePlan}from'../../../engine/planner-next/validate.ts';
const problem=operationContinuityScenario();const result=materializeNominalPipelineWitness(problem,{pattern:['coach','coach','coach'],slots:[120,130,140]});
writeFileSync(process.argv[2],JSON.stringify({status:result.witness.status,reason:result.witness.reason??null,starts:result.witness.stylingSpots.map(s=>s.start),tasks:result.scheduledTasks,hardValid:result.witness.status==='FEASIBLE'?validatePlan(problem,[...result.scheduledTasks]).hardValid:null,diagnostic:result.diagnostic},null,2));
