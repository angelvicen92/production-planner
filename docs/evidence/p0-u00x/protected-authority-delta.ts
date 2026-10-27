import assert from 'node:assert/strict';
export function protectedAuthorityDelta(source:string){
 const from='hardGateCoreLeaf(placed,meals,coreIds,applicableContracts,false,selectedMainMealStart)';
 assert.equal(source.split(from).length,2);
 return source.replace(from,'hardGateCoreLeaf(placed,meals,coreIds,[...fixedMainContracts,...applicableContracts],false,selectedMainMealStart)');
}
