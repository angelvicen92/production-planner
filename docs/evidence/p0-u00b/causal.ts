/** Read-only observer, also runnable in the exact baseline checkout. */
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {adaptEngineInputToPlannerNextProblem} from "../../../engine/planner-next/integration/engineInputAdapter";
import {runExactMainAndFeederSearch} from "../../../engine/planner-next/exactMainAndFeederCore";
import {executePlannerNext} from "../../../engine/planner-next/executePlannerNext";
const directory=resolve(process.argv[2]);mkdirSync(directory,{recursive:true});
const input=JSON.parse(readFileSync("docs/evidence/p0-u00a/native/first-input.json","utf8"));
input.tasks=input.tasks.slice(0,3).map((task:any,index:number)=>({...task,plannerNextKind:"auxiliary",
  templateName:`Actividad auxiliar ${index+1}`,dependsOnTaskIds:[],dependsOnTaskId:null,declaredResourceIds:[]}));
input.planResourceItems=[];input.coachResourceIds=[];input.vocalCoachPlanResourceItemIdByContestantId={};
const observe=(source:any,label:string)=>{
  const adapter=adaptEngineInputToPlannerNextProblem(source);
  writeFileSync(resolve(directory,`${label}-input.json`),JSON.stringify(source,null,2));
  writeFileSync(resolve(directory,`${label}-preflight.json`),JSON.stringify(adapter,null,2));
  if(adapter.status!=="SUPPORTED")return {status:adapter.status,reasonCodes:adapter.reasonCodes};
  const core=runExactMainAndFeederSearch(adapter.problem),execution=executePlannerNext(adapter.problem,{fixedPlacementsAsContext:true});
  return {status:adapter.status,coreStatus:core.status,coreReasons:core.evidence.reasonCodes,
    execution:execution.result,problemFingerprint:adapter.problemFingerprint};
};
const mainContract=observe(input,"unnecessary-main-contract");
const absent=structuredClone(input);delete absent.plannerNext.mainFlow;
const intentional=structuredClone(absent);intentional.plannerNext.profile="STANDALONE_ONLY";
const report={unnecessaryMainContract:mainContract,missingMain:observe(absent,"missing-main"),
  standalone:observe(intentional,"standalone")};
writeFileSync(resolve(directory,"causal.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify({mainContract:mainContract.coreReasons,missing:report.missingMain.reasonCodes,
  standalone:report.standalone.status,complete:report.standalone.execution?.complete}));
