import { itinerantOperationProfiles, itinerantUnitProfiles, projectCombinedFocalA2ItinerantProblem } from "./focalA2RealityReference";
import { taskFitsAvailability } from "../../taskAvailability";

export function focalA2ItinerantCompositionControls(){
  const problem=projectCombinedFocalA2ItinerantProblem(), unitIds=new Set(itinerantUnitProfiles.map(unit=>unit.id));
  const combined=itinerantUnitProfiles.find(unit=>unit.id==="reality-unit-afternoon-combined")!;
  const combinedTasks=problem.tasks.filter(task=>itinerantOperationProfiles.some(operation=>operation.id===task.id&&operation.unitId===combined.id));
  return {
    exactCompositions:itinerantUnitProfiles.every(unit=>new Set(unit.memberResourceIds).size===unit.memberResourceIds.length),
    compositionWindows:itinerantUnitProfiles.map(unit=>({unitId:unit.id,memberResourceIds:[...unit.memberResourceIds],availability:unit.availability.map(window=>({...window}))})),
    unitIdAbsentFromRequirements:problem.tasks.every(task=>(task.requiredResourceIds??[]).every(id=>!unitIds.has(id))),
    combinedBefore960Rejected:combinedTasks.every(task=>!taskFitsAvailability(task,945,960)),
    combinedFrom960Accepted:combinedTasks.every(task=>taskFitsAvailability(task,960,Math.min(960+task.duration,1080))),
  };
}
