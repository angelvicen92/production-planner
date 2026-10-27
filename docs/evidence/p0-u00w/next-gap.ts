/** Read-only probe of the next native boundary, never a new implementation. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {withDailyTaskOperationScopes,taskScopeDirectResources} from '../../../server/dailyTaskOperationScopes';
const input=JSON.parse(readFileSync(process.argv[2],'utf8')),original=JSON.stringify(input);
const members=new Set(input.anchoredAccompaniments.flatMap((p:any)=>[...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds]));
const standalone=input.tasks.find((t:any)=>t.plannerNextKind==='auxiliary'&&!members.has(t.id));assert.ok(standalone);
const unit=input.tasks.find((t:any)=>t.id===input.anchoredAccompaniments[0].anchorTaskId).allowedItinerantTeamIds[0];
const policy={taskId:standalone.id,agendaScope:'ITINERANT_UNIT' as const,resourceInheritance:'OPERATION_ONLY' as const,blocksSpace:true,itinerantUnitId:unit,declaredResourceIds:taskScopeDirectResources(input,standalone)};
let error:any;try{withDailyTaskOperationScopes(input,{contractVersion:1,policies:[policy]});}catch(e:any){error={message:e.message,status:e.status};}
assert.deepEqual(error,{message:'UNSUPPORTED_TASK_SCOPE_COMBINATION',status:422});assert.equal(JSON.stringify(input),original);
writeFileSync(process.argv[3],JSON.stringify({status:'BLOCKED',classification:'CONTRACT_NOT_REPRESENTABLE',nextSingleGap:'Native composition of Main/Vocal anchored choices with independent Reality operational scopes',inputPlanId:input.planId,anchoredOperations:input.anchoredAccompaniments.length,standalonePolicy:policy,firstRejection:error,authority:'server/dailyTaskOperationScopes.ts::taskOperationScopesSupported',reciprocalBoundary:'server/anchoredAccompanimentStructure.ts::anchoredCombinationSupported',experimentIsStage:false,remoteWrites:0},null,2));
console.log('PASS next gap: explicit producer rejection before preflight, no physical infeasibility claimed');
