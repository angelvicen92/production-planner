import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { planMainFlowAndFeeders } from "../planMainFlowAndFeeders";
import { evaluateAnchoredAccompaniments } from "../anchoredAccompaniment";
import { projectCombinedFocalA2ItinerantProblem, itinerantOperationProfiles } from "./focal-a2/focalA2RealityReference";

const OUTPUT="planner-next-focal-a2-itinerant-spec08-foundation-v4.json";
const sourceUrl=new URL("./focal-a2/focalA2Spec08FoundationV3AcceptedArtifact.json",import.meta.url);
const sourceBytes=fs.readFileSync(sourceUrl),source=JSON.parse(sourceBytes.toString());
const sourceSha256=crypto.createHash("sha256").update(sourceBytes).digest("hex");
const EXPECTED_SOURCE_SHA="cf87e0ca0e9f8ad62b0a06fbd4a49206a8f0357b2a5003c833145c3b8f082bb5";
const REQUIRED_COMMANDS=["npm run check","npm run build","npx tsx --test engine/planner-next/anchoredAccompaniment.spec.ts","node script/run-test-suite.mjs engine-planner-next","npm test"];
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).filter(k=>k!=="runtimeMs").sort().map(k=>[k,canonical(v[k])])):v;
const digest=(v:any)=>crypto.createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
interface Receipt {schemaVersion:string;completedCommands:string[];sourceArtifactObservedSha256:string;mode:"legacy"|"current"|"auto"}
function readReceipt():Receipt|null{const i=process.argv.indexOf("--validation-evidence");if(i<0||!process.argv[i+1])return null;try{return JSON.parse(fs.readFileSync(process.argv[i+1]!,"utf8"))}catch{return null}}
const validReceipt=(r:Receipt|null)=>Boolean(r&&r.schemaVersion==="focal-a2-010r1-validator-v1"&&JSON.stringify(r.completedCommands)===JSON.stringify(REQUIRED_COMMANDS)&&r.sourceArtifactObservedSha256===EXPECTED_SOURCE_SHA);

export function runSpec08FoundationV4Benchmark(receipt=readReceipt()){
 const outputPresentAtStart=fs.existsSync(OUTPUT),problem=projectCombinedFocalA2ItinerantProblem(),before=JSON.stringify(problem),result=planMainFlowAndFeeders(problem),repeat=planMainFlowAndFeeders(projectCombinedFocalA2ItinerantProblem());
 const reversedProblem=projectCombinedFocalA2ItinerantProblem();reversedProblem.tasks.reverse();reversedProblem.anchoredAccompaniments!.reverse();const reversed=planMainFlowAndFeeders(reversedProblem);
 const anchored=evaluateAnchoredAccompaniments(problem,result.scheduledTasks),byId=new Map(result.scheduledTasks.map(t=>[t.id,t]));
 const operations=itinerantOperationProfiles.map(profile=>profile.type==="STANDALONE"?[byId.get(profile.id)].filter(Boolean):[byId.get(`${profile.id}-before`),byId.get(profile.anchorTaskId),byId.get(`${profile.id}-after`)].filter(Boolean));
 const operationDurations=operations.map(tasks=>tasks.reduce((n,t)=>n+t!.duration,0)), partialOperationCount=operations.filter((tasks,i)=>tasks.length!==(itinerantOperationProfiles[i]!.type==="STANDALONE"?1:3)).length;
 const anchors=(problem.anchoredAccompaniments??[]).map(c=>byId.get(c.anchorTaskId)).filter(Boolean);
 const checks={
  validationReceipt:validReceipt(receipt),sourceSha:sourceSha256===EXPECTED_SOURCE_SHA,currentArtifactUnread:!outputPresentAtStart,
  complete:result.complete,hardValid:result.metrics.hardValid,taskCount:result.scheduledTasks.length===53,mainCount:result.scheduledTasks.filter(t=>t.kind==="main").length===19,vocalCount:result.scheduledTasks.filter(t=>t.kind==="vocal").length===19,
  standaloneCount:itinerantOperationProfiles.filter(p=>p.type==="STANDALONE").length===9,anchoredCount:anchored.length===3&&anchored.every(e=>e.complete),segmentCount:result.metrics.anchoredAccompanimentScheduledSegmentCount===6,
  operationCount:operations.length===12,productiveMinutes:operationDurations.reduce((a,b)=>a+b,0)===375,partialOperationCount:partialOperationCount===0,anchorDuration:anchors.length===3&&anchors.every(t=>t!.duration===15),
  resourceContinuity:anchored.every(e=>e.resourcesSatisfied&&e.continuousResourceIds.length>0),taskWindows:anchored.every(e=>e.taskWindowsSatisfied),mainContinuity:result.metrics.mainFlowGapMinutes===0,
  deterministic:result.metrics.planFingerprint===repeat.metrics.planFingerprint,orderInvariant:result.metrics.planFingerprint===reversed.metrics.planFingerprint,inputImmutable:JSON.stringify(problem)===before,budgetStable:result.metrics.branchesExplored<=problem.budget.maxBranchExpansions,
 };
 const accepted=Object.values(checks).every(Boolean),active={evidenceRevision:"FOCAL-A2-010R1",checks,complete:result.complete,hardValid:result.metrics.hardValid,plannedTaskCount:result.scheduledTasks.length,operationCount:operations.length,productiveMinutes:operationDurations.reduce((a,b)=>a+b,0),partialOperationCount,planFingerprint:result.metrics.planFingerprint,branchesExplored:result.metrics.branchesExplored,maxBranchExpansions:problem.budget.maxBranchExpansions,metrics:result.metrics,tasks:result.scheduledTasks.map(t=>({id:t.id,kind:t.kind,start:t.start,end:t.end,duration:t.duration,spaceId:t.spaceId,requiredResourceIds:t.requiredResourceIds??[]}))};
 const historicalScenarioDigests=Object.fromEntries(Object.entries(source.scenarios).map(([id,v])=>[id,digest(v)]));
 const artifact={version:"planner-next-focal-a2-itinerant-spec08-foundation-v4",evidenceRevision:"FOCAL-A2-010R1",status:accepted?"FOCAL_A2_SPEC08_MAIN_ANCHORED_ACCOMPANIMENT_ACCEPTED":"FOCAL_A2_SPEC08_VALIDATION_REQUIRED",sourceArtifactVersion:source.version,sourceArtifactSha256:sourceSha256,scenarioCount:Object.keys(source.scenarios).length+1,scenarios:{...source.scenarios,focalA2Spec08MainAnchoredAccompaniment:active},activeScenarioId:"focalA2Spec08MainAnchoredAccompaniment",historicalScenarioDigests,acceptance:{accepted,finalRepositoryTestsAccepted:checks.validationReceipt,mainAnchoredAccompanimentSupported:accepted,nonMainAnchorsSupported:false},artifactFingerprint:digest(active)};
 process.stdout.write(JSON.stringify(artifact,null,2)+"\n");return artifact;
}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href)runSpec08FoundationV4Benchmark();
