/** Disposable source transformations, evaluated by esbuild with write:false.
 * They neither edit product files nor supply schedules to the constructor. */
import assert from 'node:assert/strict';
const replace=(source:string,before:string,after:string)=>{assert.equal(source.split(before).length,2,before.slice(0,100));return source.replace(before,after);};
export function transform(path:string,source:string):string{
 if(path.endsWith('/anchoredAccompaniment.ts')){
  source=`import {materializeItinerantUnitAssignment} from './itinerantUnitAssignment';\nimport {nominalResourceVariants} from './nominalResourceChoice';\n`+source;
  source+=`\nexport function mainOperationVariants(problem:PlannerNextProblem,task:Task):Task[]{
 const contract=anchoredAccompanimentIndex(problem).get(task.id);
 if(!contract||!task.allowedItinerantUnitIds?.length)return nominalResourceVariants(task);
 return [...new Set(task.itinerantUnitId?[task.itinerantUnitId]:task.allowedItinerantUnitIds)].sort()
  .flatMap(id=>{const chosen=materializeItinerantUnitAssignment(problem,task,id);return chosen?[chosen]:[];});
}\n`;
  source=replace(source,'const before=contract.beforeTaskIds.map(id=>byId.get(id)); const after=contract.afterTaskIds.map(id=>byId.get(id));',`const selected=(id:string)=>{const task=byId.get(id);return task&&anchor.itinerantUnitId&&anchor.allowedItinerantUnitIds?.length
   ?materializeItinerantUnitAssignment(problem,task,anchor.itinerantUnitId)??undefined:task;};
  const before=contract.beforeTaskIds.map(selected); const after=contract.afterTaskIds.map(selected);`);
 }
 if(path.endsWith('/exactMainAndFeederCore.ts')){
  source=`import {mainOperationVariants} from './anchoredAccompaniment';\n`+source;
  source=replace(source,'for(const task of nominalResourceVariants(source))','for(const task of mainOperationVariants(problem,source))');
  source=replace(source,'for(const variant of nominalResourceVariants(task))','for(const variant of mainOperationVariants(problem,task))');
  source=replace(source,"task.kind==='main'&&task.nominalResourceChoice","task.kind==='main'&&(task.nominalResourceChoice||(task.allowedItinerantUnitIds?.length??0)>1)");
  source=replace(source,'if(edge.operation.some(task=>task.nominalResourceChoice))','if(edge.operation.some(task=>task.nominalResourceChoice||(task.allowedItinerantUnitIds?.length??0)>1))');
 }
 if(path.endsWith('/nominalResourceChoice.ts')){
  source=replace(source,'operation.filter(task=>task.nominalResourceChoice?.selectedResourceId)',"operation.filter(task=>task.nominalResourceChoice?.selectedResourceId||task.itinerantUnitId&&(task.allowedItinerantUnitIds?.length??0)>1)");
  source=replace(source,'[task.id,task.nominalResourceChoice!.selectedResourceId!]', '[task.id,task.nominalResourceChoice?.selectedResourceId??task.itinerantUnitId!]');
 }
 if(path.endsWith('/assistedPlanning.ts')){
  source=replace(source,'const physicalFutureIds=source.tasks.some(task=>task.nominalResourceChoice)',`const physicalFutureIds=(source.tasks.some(task=>task.nominalResourceChoice)
   ||(source.anchoredAccompaniments?.length??0)>1
   ||source.anchoredAccompaniments?.some(c=>source.tasks.some(t=>t.id===c.anchorTaskId&&(t.allowedItinerantUnitIds?.length??0)>1)))`);
  source=replace(source,'...(searchProblem.tasks.some(task=>task.nominalResourceChoice)&&execution.result?.complete?{',`...((searchProblem.tasks.some(task=>task.nominalResourceChoice)
   ||(searchProblem.anchoredAccompaniments?.length??0)>1
   ||searchProblem.anchoredAccompaniments?.some(c=>searchProblem.tasks.some(t=>t.id===c.anchorTaskId&&(t.allowedItinerantUnitIds?.length??0)>1)))&&execution.result?.complete?{`);
 }
 if(path.endsWith('/validate.ts')){
  source=replace(source,'if(expectedUnit?.itinerantUnitId!==task.itinerantUnitId',`if(expectedUnit?.allowedItinerantUnitIds?.length&&task.itinerantUnitId===undefined
      &&problem.anchoredAccompaniments?.some(c=>[...c.beforeTaskIds,c.anchorTaskId,...c.afterTaskIds].includes(task.id)))itinerantUnitMeal+=1;
    if(expectedUnit?.itinerantUnitId!==task.itinerantUnitId`);
  const line=source.split('\n').find(s=>s.startsWith('  for(const contract of problem.anchoredAccompaniments??[])'))!;
  assert.ok(line);
  source=replace(source,line,`  for(const contract of problem.anchoredAccompaniments??[]){
    const sequence=anchoredSequence(contract),actual=sequence.map(id=>scheduled.filter(t=>t.id===id));
    const flat=actual.map(xs=>xs[0]).filter((x):x is ScheduledTask=>Boolean(x));
    const domainOperation=sequence.some(id=>(problem.tasks.find(t=>t.id===id)?.allowedItinerantUnitIds?.length??0)>1);
    let invalid=actual.some(xs=>xs.length!==1);
    if(flat.length===sequence.length){
      invalid ||= flat.slice(1).some((t,i)=>flat[i]!.end!==t.start);
      if(domainOperation)invalid ||= !flat[0]!.itinerantUnitId||flat.some(t=>t.itinerantUnitId!==flat[0]!.itinerantUnitId);
      invalid ||= flat.some((t,i)=>{
       const source=problem.tasks.find(x=>x.id===sequence[i])!;
       const expected=domainOperation&&t.itinerantUnitId?materializeItinerantUnitAssignment(problem,source,t.itinerantUnitId):source;
       return !expected||t.end-t.start!==expected.duration||t.participantId!==flat[0]!.participantId||t.spaceId!==expected.spaceId
        ||JSON.stringify([...(t.requiredResourceIds??[])].sort())!==JSON.stringify([...(expected.requiredResourceIds??[])].sort());
      });
      const unitId=domainOperation?flat[0]!.itinerantUnitId:contract.itinerantUnitId;
      if(unitId)invalid||=(problem.itinerantUnitMeals??[]).some(meal=>meal.itinerantUnitId===unitId&&flat[0]!.start<meal.interval.end&&meal.interval.start<flat.at(-1)!.end);
    }
    if(invalid)anchoredAccompaniment+=1;
  }`);
 }
 return source;
}
