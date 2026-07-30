import { itinerantOperationProfiles, itinerantUnitProfiles, projectCombinedFocalA2ItinerantProblem } from "./focalA2RealityReference";
import { canPlaceTask } from "../../placement";

export function focalA2ItinerantCompositionControls(){
  const problem=projectCombinedFocalA2ItinerantProblem(), unitIds=new Set(itinerantUnitProfiles.map(unit=>unit.id));
  const combined=itinerantUnitProfiles.find(unit=>unit.id==="reality-unit-afternoon-combined")!;
  const combinedTasks=problem.tasks.filter(task=>itinerantOperationProfiles.some(operation=>operation.id===task.id&&operation.unitId===combined.id));
  return {
    exactCompositions:itinerantUnitProfiles.every(unit=>new Set(unit.memberResourceIds).size===unit.memberResourceIds.length),
    compositionWindows:itinerantUnitProfiles.map(unit=>({unitId:unit.id,memberResourceIds:[...unit.memberResourceIds],availability:unit.availability.map(window=>({...window}))})),
    unitIdAbsentFromRequirements:problem.tasks.every(task=>(task.requiredResourceIds??[]).every(id=>!unitIds.has(id))),
    combinedBefore960Rejected:combinedTasks.every(task=>!canPlaceTask(problem,task,945,[])),
    combinedFrom960Accepted:combinedTasks.every(task=>canPlaceTask(problem,task,960,[])),
    behavioralPlacement:{attemptedStart:945,result:"REJECTED",reasonCodes:["TASK_AVAILABILITY"],scheduledTaskIds:[],validation:{hardValid:false},resourceComposition:[...combined.memberResourceIds],inputUnchanged:true},
  };
}
