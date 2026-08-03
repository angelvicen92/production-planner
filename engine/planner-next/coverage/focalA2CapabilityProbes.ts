import type {EngineInput} from "../../types";
import {adaptEngineInputToPlannerNextProblem} from "../integration/engineInputAdapter";
import {createSupportedEngineInputAdapterFixture} from "../integration/engineInputAdapter.fixture";
import {preflightEngineInputForPlannerNext} from "../integration/engineInputPreflight";
import {planMainFlowAndFeeders} from "../planMainFlowAndFeeders";
import {jointAuxiliaryTasksScenario} from "../scenarios/jointAuxiliaryTasksScenario";
import {setupPreparationScenario} from "../scenarios/setupPreparationScenario";
import {setupGroupingScenario} from "../scenarios/setupGroupingScenario";
import {technicalChainScenario} from "../scenarios/technicalChainScenario";
import {technicalOperationScenario} from "../scenarios/technicalOperationScenario";
import {longSecondaryBlockScenario} from "../scenarios/longSecondaryBlockScenario";
import {itinerantUnitsScenario} from "../scenarios/itinerantUnitsScenario";
import {validatePlan} from "../validate";

export interface CapabilityProbeResult {probeId:string;capabilityIds:number[];fixtureId:string;functionsExecuted:string[];actualStatus:"SUPPORTED"|"UNSUPPORTED";actualReasonCodes:string[];adapterStatus:"SUPPORTED"|"UNSUPPORTED";adapterPreservesCapability:boolean;plannerProblemObservation:Record<string,unknown>|null;executionObservation:Record<string,unknown>|null;validationObservation:Record<string,unknown>|null;inputImmutable:boolean;deterministic:boolean;readOnly:true}
type Mutation=(input:any)=>void;
const clone=<T>(x:T):T=>structuredClone(x);
const freeze=<T>(x:T):T=>{if(x&&typeof x==="object"&&!Object.isFrozen(x)){Object.values(x as object).forEach(freeze);Object.freeze(x)}return x};
function engineProbe(probeId:string,capabilityIds:number[],mutate:Mutation,preserve:(problem:any)=>boolean=()=>false):CapabilityProbeResult{const raw=createSupportedEngineInputAdapterFixture();mutate(raw);const input=freeze(clone(raw)),before=JSON.stringify(input),preflight=preflightEngineInputForPlannerNext(input),adapter=adaptEngineInputToPlannerNextProblem(input),repeat=adaptEngineInputToPlannerNextProblem(input),problem=adapter.problem;let executionObservation:null|Record<string,unknown>=null,validationObservation:null|Record<string,unknown>=null;if(problem){const execution=planMainFlowAndFeeders(problem),validation=validatePlan(problem,execution.scheduledTasks,execution.scheduledSetupPreparations,execution.scheduledSpaceMeals);executionObservation={complete:execution.complete,plannedTaskCount:execution.scheduledTasks.length,searchStopReason:execution.metrics.searchStopReason};validationObservation={hardValid:validation.hardValid,reasonCodes:validation.reasonCodes}}return {probeId,capabilityIds,fixtureId:"createSupportedEngineInputAdapterFixture",functionsExecuted:["preflightEngineInputForPlannerNext","adaptEngineInputToPlannerNextProblem",...(problem?["planMainFlowAndFeeders","validatePlan"]:[])],actualStatus:preflight.status,actualReasonCodes:[...preflight.reasonCodes],adapterStatus:adapter.status,adapterPreservesCapability:Boolean(problem&&preserve(problem)),plannerProblemObservation:problem?{taskCount:problem.tasks.length,problemFingerprint:adapter.problemFingerprint}:null,executionObservation,validationObservation,inputImmutable:JSON.stringify(input)===before,deterministic:JSON.stringify(adapter)===JSON.stringify(repeat),readOnly:true};}
function plannerProbe(probeId:string,capabilityIds:number[],fixtureId:string,make:()=>any,preserve:(p:any)=>boolean):CapabilityProbeResult{const input=freeze(make()),before=JSON.stringify(input),first=planMainFlowAndFeeders(input),second=planMainFlowAndFeeders(input),validation=validatePlan(input,first.scheduledTasks,first.scheduledSetupPreparations,first.scheduledSpaceMeals);return {probeId,capabilityIds,fixtureId,functionsExecuted:["planMainFlowAndFeeders","validatePlan"],actualStatus:"SUPPORTED",actualReasonCodes:[...first.metrics.reasonCodes],adapterStatus:"UNSUPPORTED",adapterPreservesCapability:preserve(input),plannerProblemObservation:{taskCount:input.tasks.length},executionObservation:{complete:first.complete,plannedTaskCount:first.scheduledTasks.length,searchStopReason:first.metrics.searchStopReason},validationObservation:{hardValid:validation.hardValid,reasonCodes:validation.reasonCodes},inputImmutable:JSON.stringify(input)===before,deterministic:first.metrics.planFingerprint===second.metrics.planFingerprint,readOnly:true};}
const task=(input:any,id=105)=>input.tasks.find((x:any)=>x.id===id);
const exactTime=(input:any,id=105)=>input.locks.push({id:90,planId:701,taskId:id,lockType:"time",lockedStart:"10:00",lockedEnd:"10:30"});

export function runFocalA2CapabilityProbes():CapabilityProbeResult[]{return [
 engineProbe("space-lock",[17],i=>i.locks.push({id:90,planId:701,taskId:105,lockType:"space",lockedSpaceId:303})),
 engineProbe("full-lock",[19],i=>i.locks.push({id:90,planId:701,taskId:105,lockType:"full",lockedStart:"10:00",lockedEnd:"10:30",lockedSpaceId:303,lockedResourceId:503})),
 engineProbe("setup",[57],i=>i.groupingBySpaceId={303:true}),
 engineProbe("transport",[123],i=>i.transportSettings={minimumGapMinutes:10}),
 engineProbe("participant-meal",[134],i=>i.protectedBreaks=[{id:90,kind:"meal",start:"12:00",end:"12:30",contestantId:201}]),
 engineProbe("resource-meal",[135],i=>i.protectedBreaks=[{id:90,kind:"meal",start:"12:00",end:"12:30",resourceId:503}]),
 engineProbe("unit-meal",[136],i=>i.protectedBreaks=[{id:90,kind:"meal",start:"12:00",end:"12:30",itinerantTeamId:1}]),
 engineProbe("space-capacity",[52],i=>(i as any).spaceCapacityById={303:2}),
 engineProbe("non-exclusive-space",[54],i=>Object.assign(task(i),{blocksSpace:false})),
 engineProbe("resource-by-type",[81],i=>task(i).resourceRequirements={byType:{13:1}}),
 engineProbe("resource-quantity",[82],i=>task(i).resourceRequirements={byItem:{603:2}}),
 engineProbe("resource-alternatives",[83],i=>task(i).resourceRequirements={anyOf:[{quantity:1,resourceItemIds:[603,604]}]}),
 plannerProbe("joint-task",[115,116,117,118,119],"jointAuxiliaryTasksScenario",jointAuxiliaryTasksScenario,p=>p.tasks.some((x:any)=>x.jointGroupId)),
 engineProbe("technical-task",[120],()=>{},p=>{const t=p.tasks.find((x:any)=>x.id==="task:105");return t?.kind==="technical"&&t.participantId===undefined&&t.spaceId==="space:303"&&t.duration===30&&(t.requiredResourceIds??[]).includes("plan-resource:503")}),
 plannerProbe("technical-chain",[121],"technicalChainScenario",technicalChainScenario,p=>p.tasks.filter((x:any)=>x.id.startsWith("technical-chain-")).length===2),
 plannerProbe("secondary-continuity",[44],"longSecondaryBlockScenario",longSecondaryBlockScenario,p=>p.spaces.some((x:any)=>x.secondaryContinuity==="REQUIRED")),
 plannerProbe("setup-preparation",[63,64,65,66],"setupPreparationScenario",setupPreparationScenario,p=>p.spaces.some((x:any)=>x.setupPolicy?.preparationMinutesByFamily)),
 engineProbe("eligibility",[141,142,145],i=>(i as any).taskEligibilityByParticipantId={201:[101]}),
 engineProbe("optional-task",[143],i=>Object.assign(task(i),{optional:true})),
 plannerProbe("itinerant-composition-window",[94,95,97,98],"itinerantUnitsScenario",itinerantUnitsScenario,p=>p.resources.some((x:any)=>x.id.includes("unit")&&x.availability.length)),
 engineProbe("done-protected",[12],i=>Object.assign(task(i,101),{status:"done",startReal:"10:00",endReal:"10:30",durationOverrideMin:null}),p=>{const t=p.tasks.find((x:any)=>x.id==="task:101");return t?.duration===30&&JSON.stringify(t.availability)==='[{"start":600,"end":630}]'}),
 engineProbe("in-progress-protected",[13],i=>Object.assign(task(i,101),{status:"in_progress",startReal:"10:00",endReal:"10:30",durationOverrideMin:null}),p=>{const t=p.tasks.find((x:any)=>x.id==="task:101");return t?.duration===30&&JSON.stringify(t.availability)==='[{"start":600,"end":630}]'}),
 engineProbe("time-lock-valid",[16,20],i=>exactTime(i),p=>JSON.stringify(p.tasks.find((x:any)=>x.id==="task:105")?.availability)==='[{"start":600,"end":630}]'),
 engineProbe("time-lock-contradictory",[16,20],i=>{exactTime(i);i.locks.push({id:91,planId:701,taskId:105,lockType:"time",lockedStart:"11:00",lockedEnd:"11:30"})}),
 engineProbe("coach-availability",[41],i=>Object.assign(i.planResourceItems.find((x:any)=>x.id===501),{availabilityStart:"09:00",availabilityEnd:"17:00"}),p=>p.coaches.length===1&&p.coaches[0].availability.length===1),
 engineProbe("technical-dependency",[122],i=>{i.tasks.push({...clone(task(i)),id:106,templateId:906,dependsOnTaskIds:[105]})},p=>p.tasks.find((x:any)=>x.id==="task:106")?.dependencies.includes("task:105")),
 engineProbe("resource-lock",[18,20],i=>i.locks.push({id:92,planId:701,taskId:105,lockType:"resource",lockedResourceId:504}),p=>p.tasks.find((x:any)=>x.id==="task:105")?.requiredResourceIds.includes("plan-resource:504")),
 plannerProbe("setup-grouping",[58,59,60,61,62],"setupGroupingScenario",setupGroupingScenario,p=>p.spaces.some((x:any)=>x.setupPolicy)),
 plannerProbe("technical-operation-engine",[120,123],"technicalOperationScenario",technicalOperationScenario,p=>p.tasks.some((x:any)=>x.kind==="technical")),
 ];}
