import type {Task} from './contracts';

const canonical=(ids:readonly string[])=>[...new Set(ids)].sort();
export const canonicalNominalResourceChoice=(choice:NonNullable<Task['nominalResourceChoice']>)=>({
  resourceIds:canonical(choice.resourceIds),fixedResourceIds:canonical(choice.fixedResourceIds),
  ...(choice.selectedResourceId===undefined?{}:{selectedResourceId:choice.selectedResourceId}),
});
export function materializeNominalResourceChoice(task:Task,resourceId:string):Task|null{
  const choice=task.nominalResourceChoice;
  if(!choice||!Array.isArray(choice.resourceIds)||!Array.isArray(choice.fixedResourceIds)||!choice.resourceIds.includes(resourceId)||choice.selectedResourceId!==undefined&&choice.selectedResourceId!==resourceId)return null;
  const fixedInDomain=choice.fixedResourceIds.filter(id=>choice.resourceIds.includes(id));
  if(fixedInDomain.some(id=>id!==resourceId))return null;
  return {...task,requiredResourceIds:canonical([...choice.fixedResourceIds,resourceId]),
    nominalResourceChoice:{...canonicalNominalResourceChoice(choice),selectedResourceId:resourceId}};
}
export function nominalResourceVariants(task:Task):Task[]{
  const choice=task.nominalResourceChoice;
  return choice&&Array.isArray(choice.resourceIds)?choice.resourceIds.flatMap(id=>{const selected=materializeNominalResourceChoice(task,id);return selected?[selected]:[];}):[task];
}
export function nominalResourceAssignmentMatches(expected:Task,actual:Task):boolean{
  const choice=actual.nominalResourceChoice;
  if(!expected.nominalResourceChoice)return choice===undefined;
  if(!choice||!Array.isArray(choice.resourceIds)||!Array.isArray(choice.fixedResourceIds)||typeof choice.selectedResourceId!=='string')return false;
  const selected=materializeNominalResourceChoice(expected,choice.selectedResourceId);
  return selected!==null&&JSON.stringify(selected.nominalResourceChoice)===JSON.stringify(canonicalNominalResourceChoice(choice))
    &&JSON.stringify(canonical(selected.requiredResourceIds??[]))===JSON.stringify(canonical(actual.requiredResourceIds??[]));
}
/** Possible consumption, never an occupation until a variant is materialized. */
export const possibleTaskResourceIds=(task:Task)=>canonical([...(task.requiredResourceIds??[]),...(task.nominalResourceChoice?.resourceIds??[])]);
