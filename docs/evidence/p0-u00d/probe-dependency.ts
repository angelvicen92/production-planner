/** Controlled read-only dependency probe over the native UI problem; no DB writes. */
import {readFileSync,writeFileSync} from 'node:fs';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
const [source,output]=process.argv.slice(2);
const {problem}=JSON.parse(readFileSync(source,'utf8'));
const child=problem.tasks.find((t:any)=>(t.allowedItinerantUnitIds?.length??0)>1);
const parent=problem.tasks.find((t:any)=>t.itinerantUnitId===child.allowedItinerantUnitIds[1]);
child.dependencies=[parent.id];
const result=executeAssistedPlanning(buildAssistedProblem(problem,createPlanningScope({kind:'DAY',value:'dependency-counterexample'},{},problem.tasks.map((t:any)=>t.id)),[]));
writeFileSync(output,JSON.stringify({mode:'CONTROLLED_NATIVE_DEPENDENCY',problem,result},null,2));
console.log(JSON.stringify({complete:result.evidence.completeForScope,reasonCodes:result.evidence.reasonCodes}));
