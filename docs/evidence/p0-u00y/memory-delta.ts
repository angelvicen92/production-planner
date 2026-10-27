import assert from 'node:assert/strict';
const replace=(s:string,a:string,b:string)=>{assert.equal(s.split(a).length,2,a);return s.replace(a,b);};
export function transform(path:string,s:string){
 if(path.endsWith('/integration/engineInputAdapter.ts'))s=replace(s,'...(input.dailyAnchoredAccompanimentsVersion===2?', '...(input.dailyJointGroupsVersion===1?{nativeJointGroupsVersion:1}:{}),\n    ...(input.dailyAnchoredAccompanimentsVersion===2?');
 if(path.endsWith('/assistedScopeResolver.ts'))s=replace(s,'const canonicalByProduct = new Map(adapter.identityMap',`if(input.dailyJointGroupsVersion===1){
   const ids=new Set(productIds),groups=new Set(input.tasks.filter(t=>ids.has(t.id)).map(t=>t.jointGroupId).filter(Boolean));
   for(const task of input.tasks)if(task.jointGroupId&&groups.has(task.jointGroupId)&&eligible.has(task.id))ids.add(task.id);
   productIds=[...ids].sort((a,b)=>a-b);
  }
  const canonicalByProduct = new Map(adapter.identityMap`);
 if(path.endsWith('/assistedPlanning.ts')){
  s=replace(s,'const scopeIds = canonicalIds(scope.resolvedTaskIds);',`if(source.nativeJointGroupsVersion===1){
   const ids=new Set(scope.resolvedTaskIds),groups=new Set(source.tasks.filter(t=>ids.has(t.id)).map(t=>t.jointGroupId).filter(Boolean));
   for(const task of source.tasks)if(task.jointGroupId&&groups.has(task.jointGroupId))ids.add(task.id);
   scope=createPlanningScope(scope.selector,scope.metadata,[...ids]);
   for(const group of new Set(source.tasks.map(t=>t.jointGroupId).filter(Boolean))){
    const members=source.tasks.filter(t=>t.jointGroupId===group),fixed=protectedPlacements.filter(t=>members.some(m=>m.id===t.id));
    if(fixed.length&&(fixed.length!==members.length||fixed.some(t=>t.start!==fixed[0].start||t.end!==fixed[0].end||t.spaceId!==fixed[0].spaceId)))throw new Error('JOINT_GROUP_PARTIALLY_PROTECTED');
   }
  }
  const scopeIds = canonicalIds(scope.resolvedTaskIds);`);
  s=replace(s,'(source.nativeAnchoredAccompanimentsVersion===2||source.tasks.some(task=>task.nominalResourceChoice))','(source.nativeJointGroupsVersion===1||source.nativeAnchoredAccompanimentsVersion===2||source.tasks.some(task=>task.nominalResourceChoice))');
  s=replace(s,'(searchProblem.nativeAnchoredAccompanimentsVersion===2||searchProblem.tasks.some(task=>task.nominalResourceChoice))','(searchProblem.nativeJointGroupsVersion===1||searchProblem.nativeAnchoredAccompanimentsVersion===2||searchProblem.tasks.some(task=>task.nominalResourceChoice))');
 }
 return s;
}
