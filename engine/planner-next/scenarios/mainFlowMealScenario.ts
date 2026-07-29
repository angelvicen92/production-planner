import { requiredSpaceMealScenario } from "./requiredSpaceMealScenario";
export function mainFlowMealScenario(){
  const p=requiredSpaceMealScenario();
  p.protectedMeal={start:840,end:900}; p.mainFlow.preferredEnd=840;
  const main=p.spaces.find(s=>s.id===p.mainFlow.spaceId)!; main.mealPolicy={window:{start:840,end:900},duration:60};
  p.resources.push({id:"afternoon-main-unit",availability:[{start:900,end:960}],presencePreference:"OFF",transitionMinutes:0});
  for(const task of p.tasks)if(task.kind==="main"&&task.coachId==="coach-b")task.requiredResourceIds=[...(task.requiredResourceIds??[]),"afternoon-main-unit"];
  return p;
}
