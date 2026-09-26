import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildCanonicalFullA2EngineInput } from "./canonicalFullA2EngineInput";
import { buildAssistedProblem, createPlanningScope } from "../assistedPlanning";
import { adaptEngineInputToPlannerNextProblem } from "../integration/engineInputAdapter";
import { generateMainFlowPatterns, proveMainFeederArchitectureImpossible,
  type MainFeederStructuralRejection, type SharedPrerequisiteCapacityCertificate } from "../mainFlowPatterns";
import { buildAnonymousPipelineWitness, type AnonymousPipelineWitnessDiagnostic } from "../anonymousPipelineWitness";
import { buildTimeline, candidateCuts, hasMainFlowMeal, mainFlowMealPolicy, orderTimelines } from "../mainFlowMeal";

/** A2 S1 structural probe. It deliberately stops before nominal core or standalone search. */
export function runA2AnonymousPipelineWitnessProbe() {
  const canonical=buildCanonicalFullA2EngineInput({planId:711,branchBudget:10_000});
  const adapted=adaptEngineInputToPlannerNextProblem(canonical.input); assert.equal(adapted.status,"SUPPORTED");
  if(adapted.status!=="SUPPORTED")throw new Error("canonical A2 adapter unsupported");
  const spaceId=canonical.input.plannerNext?.mainFlow?.spaceId; assert.ok(spaceId);
  const sourceTaskIds=new Set(canonical.input.tasks.filter(task=>(task.status==="pending"||task.status==="interrupted")&&task.spaceId===spaceId).map(task=>String(task.id)));
  const scopeTaskIds=adapted.identityMap.filter(item=>item.namespace==="task"&&sourceTaskIds.has(item.sourceId)).map(item=>item.canonicalId);
  const scope=createPlanningScope({kind:"SPACE",value:String(spaceId)},{spaceId},scopeTaskIds);
  const assisted=buildAssistedProblem(adapted.problem,scope,[]);
  const problem=assisted.problem;
  const before=JSON.stringify(problem); const mains=problem.tasks.filter(t=>t.kind==="main");
  const mealAuthority=mainFlowMealPolicy(problem);
  const feeders=new Map(mains.flatMap(main=>{
    const feeder=problem.tasks.find(t=>t.kind==="vocal"&&t.participantId===main.participantId);
    return feeder?[[main.id,feeder] as const]:[];
  }));
  const generated=generateMainFlowPatterns(mains,problem.mainFlow.minTasksPerBlock,
    problem.mainFlow.maxBlocksByKey,problem.budget.maxPatterns,problem.resources);
  // A2 has no hard two-block ceiling. The configured pattern budget therefore
  // bounds deterministic exploration rather than proving enumeration complete.
  const runCount=(pattern:readonly string[])=>pattern.reduce((n,k,i)=>n+(i===0||pattern[i-1]!==k?1:0),0);
  const runLengths=(pattern:readonly string[])=>pattern.reduce<number[]>((lengths,key,index)=>{
    if(index===0||pattern[index-1]!==key)lengths.push(1);else lengths[lengths.length-1]!+=1;return lengths;
  },[]);
  const increment=(histogram:Record<string,number>,key:string)=>{histogram[key]=(histogram[key]??0)+1;};
  const structuralSubauthority=(reason:MainFeederStructuralRejection,certificate?:SharedPrerequisiteCapacityCertificate):string=>{
    if(reason==="FEEDER_PREREQUISITE_PREFIX_CAPACITY")
      return certificate?.checks.find(check=>check.requiredCount>check.maximumFeedableCount)?.authority??"FEEDER_PREFIX";
    const authorities:Record<MainFeederStructuralRejection,string>={LOAD_CAPACITY:"LOAD_CAPACITY",FEEDER_CAPACITY:"FEEDER_CAPACITY",
      RESOURCE_WINDOW:"RESOURCE_WINDOW",TRANSITION_CAPACITY:"TRANSITION_CAPACITY",FEEDER_CONTIGUOUS_CAPACITY:"FEEDER_CAPACITY",
      FEEDER_MULTI_RUN_CONTIGUOUS_CAPACITY:"FEEDER_CAPACITY",PREREQUISITE_WINDOW:"PREREQUISITE_WINDOW",
      FEEDER_PREREQUISITE_PREFIX_CAPACITY:"FEEDER_PREFIX"};
    return authorities[reason];
  };
  const phase=(witness:ReturnType<typeof buildAnonymousPipelineWitness>,diagnostic:AnonymousPipelineWitnessDiagnostic):number=>
    witness.status==="FEASIBLE"?6:diagnostic.stylingGeometryCompleted?4:diagnostic.feederGeometryCompleted?3:
      diagnostic.anchorsCompleted?2:diagnostic.mainMatchingCompleted?1:0;
  const phaseNames=["structural preproof","Main matching","anchors","feeder runs","Styling matching","IN","FEASIBLE"];
  const families=[]; let firstFeasible: ReturnType<typeof buildAnonymousPipelineWitness>|null=null;
  let firstFeasibleDiagnostic:AnonymousPipelineWitnessDiagnostic|null=null;
  let firstRunCount4Inconclusive:({pattern:string[];slots:number[];reason:string|null}&AnonymousPipelineWitnessDiagnostic)|null=null;
  let firstRunCount4FeederFailure:({pattern:string[];slots:number[];status:string;reason:string|null}&AnonymousPipelineWitnessDiagnostic)|null=null;
  let firstRunCount4PastFeeder:({pattern:string[];slots:number[];status:string;nextReason:string|null}&AnonymousPipelineWitnessDiagnostic)|null=null;
  let bestRunCount4:{pattern:string[];slots:number[];lastCompletedPhase:string;nextReason:string|null;phase:number}|null=null;
  const started=performance.now();
  for(const count of [...new Set(generated.patterns.map(runCount))].sort((a,b)=>a-b)){
    let tried=0, firstReason:string|undefined, feasibleArchitecture:{pattern:string[];slots:number[]}|undefined;
    const structuralRejectionsByReason:Record<string,number>={};
    const structuralRejectionsBySubauthority:Record<string,number>={};
    const witnessOutcomesByStatusAndReason:Record<string,number>={};
    let familyStatus:"FEASIBLE"|"INFEASIBLE"|"INCONCLUSIVE"="INFEASIBLE";
    const familyPatterns=generated.patterns.filter(p=>runCount(p)===count).sort((left,right)=>{
      const a=runLengths(left),b=runLengths(right);
      return Math.max(...b)-Math.max(...a)||(a[0]??0)-(b[0]??0)||left.join("|").localeCompare(right.join("|"),"en");
    });
    for(const pattern of familyPatterns){
      const duration=mains[0]!.duration;
      const architectures=hasMainFlowMeal(problem)
        ? orderTimelines(candidateCuts(pattern).map(cut=>buildTimeline(problem,pattern,duration,cut))).map(x=>x.slots)
        // These are contract boundaries, not a minute/grid scan.
        : [...new Set([problem.mainFlow.preferredEnd,problem.day.end,
            ...problem.participants.flatMap(x=>x.availability.map(w=>w.end)),
            ...problem.spaces.flatMap(x=>x.availability.map(w=>w.end)),
            ...problem.resources.flatMap(x=>x.availability.map(w=>w.end)),
            ...(problem.itinerantUnits??[]).flatMap(x=>x.availability.map(w=>w.end)),
            ...(problem.anchoredAccompaniments??[]).flatMap(contract=>[contract.anchorTaskId,...contract.beforeTaskIds,...contract.afterTaskIds]
              .flatMap(id=>problem.tasks.find(task=>task.id===id)?.availability?.map(w=>w.end)??[]))])]
          .filter(end=>problem.day.start<end&&end<=problem.day.end).sort((a,b)=>a-b)
          .map(end=>pattern.map((_,i)=>end-pattern.length*duration+i*duration));
      for(const slots of architectures){
        tried++;
        let sharedCapacity:SharedPrerequisiteCapacityCertificate|undefined;
        const structural=proveMainFeederArchitectureImpossible(problem,mains,feeders,{pattern,slots},certificate=>{sharedCapacity=certificate;});
        if(structural){firstReason??=structural;increment(structuralRejectionsByReason,structural);
          increment(structuralRejectionsBySubauthority,structuralSubauthority(structural,sharedCapacity));continue;}
        let diagnostic:AnonymousPipelineWitnessDiagnostic|undefined;
        const witness=buildAnonymousPipelineWitness(problem,{pattern,slots},value=>{diagnostic=value;},assisted.analyticalParticipantMeals); firstReason??=witness.reason;
        assert.ok(diagnostic);increment(witnessOutcomesByStatusAndReason,`${witness.status}:${witness.reason??"NONE"}`);
        if(count===4){
          const completed=phase(witness,diagnostic);
          if(!bestRunCount4||completed>bestRunCount4.phase)bestRunCount4={pattern:[...pattern],slots:[...slots],
            lastCompletedPhase:phaseNames[completed]!,nextReason:witness.reason??null,phase:completed};
          if(witness.status==="INCONCLUSIVE"&&!firstRunCount4Inconclusive)firstRunCount4Inconclusive={pattern:[...pattern],
            slots:[...slots],reason:witness.reason??null,...diagnostic};
          if(witness.reason==="FEEDER_RUN_GEOMETRY"&&!firstRunCount4FeederFailure)firstRunCount4FeederFailure={pattern:[...pattern],
            slots:[...slots],status:witness.status,reason:witness.reason??null,...diagnostic};
          if(diagnostic.feederGeometryCompleted&&!firstRunCount4PastFeeder)firstRunCount4PastFeeder={pattern:[...pattern],
            slots:[...slots],status:witness.status,nextReason:witness.reason??null,...diagnostic};
        }
        if(witness.status==="INCONCLUSIVE")familyStatus="INCONCLUSIVE";
        if(witness.status==="FEASIBLE"){
          familyStatus="FEASIBLE"; feasibleArchitecture={pattern:[...pattern],slots};
          if(!firstFeasible){firstFeasible=witness;firstFeasibleDiagnostic=diagnostic;} break;
        }
      }
      if(feasibleArchitecture)break;
    }
    families.push({runCount:count,architecturesTried:tried,witness:familyStatus,structuralRejectionsByReason,
      structuralRejectionsBySubauthority,witnessOutcomesByStatusAndReason,
      firstRejectionReason:firstReason??null,firstFeasibleArchitecture:feasibleArchitecture??null});
  }
  const pipelineWitnessBuildMs=Number((performance.now()-started).toFixed(3));
  assert.equal(JSON.stringify(problem),before); assert.ok(pipelineWitnessBuildMs<20_000);
  const representativePattern=generated.patterns[0]??[];
  const representativeTimeline=mealAuthority&&representativePattern.length
    ? buildTimeline(problem,representativePattern,mains[0]!.duration,candidateCuts(representativePattern)[0]!) : null;
  const representativeRunCount=runCount(representativePattern);
  return {mainFlowMealAuthorityPresent:mealAuthority!==undefined,
    mainFlowMealWindow:mealAuthority?.window??null,mainFlowMealDuration:mealAuthority?.duration??null,
    mainFlowMealSource:mealAuthority?.source??null,
    mainFlowMealTimelineCandidate:representativeTimeline?{splitIndex:representativeTimeline.splitIndex,slots:representativeTimeline.slots}:null,
    mainFlowMealStart:representativeTimeline?.meal.start??null,mainFlowMealEnd:representativeTimeline?.meal.end??null,
    runCountBeforeMeal:representativeRunCount,runCountAfterMeal:representativeRunCount,
    families,firstFeasibleRunCount:firstFeasible?.runCount??null,firstRunCount4Inconclusive,
    firstRunCount4FeederFailure,firstRunCount4PastFeeder,
    bestRunCount4:bestRunCount4&&(({phase:_,...candidate})=>candidate)(bestRunCount4),
    firstFeasible:firstFeasible?{mainSpotCount:firstFeasible.mainSpots.length,
      feederSpotCount:firstFeasible.feederSpots.length,stylingSpotCount:firstFeasible.stylingSpots.length,
      mainRunCount:new Set(firstFeasible.mainSpots.map(spot=>spot.mainRunId)).size,
      feederRunCount:new Set(firstFeasible.feederSpots.map(spot=>spot.feederRunId)).size,
      inGroupCount:firstFeasible.inGroups.length,inPacketSizes:firstFeasible.inGroups.map(g=>g.size),
      inStarts:firstFeasible.inGroups.map(g=>g.start),tokenCount:firstFeasible.tokenCount,
      anchoredOperationCount:firstFeasible.anchoredOperationSpots.length,
      anchoredOperationSpots:firstFeasible.anchoredOperationSpots,
      profileCount:firstFeasible.profileCount,fingerprint:firstFeasible.fingerprint}:null,
    opening:firstFeasible&&firstFeasibleDiagnostic?{
      entryCandidateStartsConsidered:firstFeasibleDiagnostic.entryCandidateStartsConsidered,
      entryCandidatesRejectedByArrival:firstFeasibleDiagnostic.entryCandidatesRejectedByArrival,
      selectedEntryBlockStart:firstFeasibleDiagnostic.selectedEntryBlockStart,
      selectedEntryBlockEnd:firstFeasibleDiagnostic.selectedEntryBlockEnd,
      entryAssignments:firstFeasible.assignments.map(assignment=>({tokenId:assignment.tokenId,
        stylingSpot:firstFeasible.stylingSpots.find(spot=>spot.id===assignment.stylingSpotId)})),
      arrivalGroups:firstFeasible.inGroups.map(group=>({...group,members:firstFeasible.assignments
        .filter(assignment=>assignment.inGroupId===group.id).map(assignment=>assignment.tokenId).sort()})),
      pressureOrder:firstFeasibleDiagnostic.pressureOrder,
      matchingResult:firstFeasible.status,hardGate:firstFeasible.status==="FEASIBLE",
    }:null,
    operationalMealPoliciesChecked:firstFeasibleDiagnostic?.operationalMealPoliciesChecked??0,
    operationalMealFutureFeasible:firstFeasibleDiagnostic?.operationalMealFutureFeasible??null,
    operationalMealBlockingPolicyIds:firstFeasibleDiagnostic?.operationalMealBlockingPolicyIds??[],
    operationalMealBranchesExplored:firstFeasibleDiagnostic?.operationalMealBranchesExplored??0,
    participantMealsChecked:firstFeasibleDiagnostic?.participantMealsChecked??0,
    participantMealFutureFeasible:firstFeasibleDiagnostic?.participantMealFutureFeasible??null,
    participantMealBlockingTaskIds:firstFeasibleDiagnostic?.participantMealBlockingTaskIds??[],
    participantMealAnalyticDomainBuilds:firstFeasibleDiagnostic?.participantMealAnalyticDomainBuilds??0,
    arrivalSolverExecuted:firstFeasibleDiagnostic?.arrivalSolverExecuted??false,
    arrivalClassification:firstFeasibleDiagnostic?.arrivalClassification??null,
    arrivalContiguousStatesExplored:firstFeasibleDiagnostic?.arrivalContiguousStatesExplored??0,
    arrivalMembershipFallbackEntered:firstFeasibleDiagnostic?.arrivalMembershipFallbackEntered??false,
    pipelineWitnessBuildMs,inputImmutable:JSON.stringify(problem)===before};
}

if(import.meta.url===`file://${process.argv[1]}`)
  process.stdout.write(`${JSON.stringify(runA2AnonymousPipelineWitnessProbe(),null,2)}\n`);
