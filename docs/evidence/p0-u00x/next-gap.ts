/** The next authoring boundary, never a placement or a configuration write. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {newDayPlannerConfigurationSchema} from '../../../shared/newDayPlannerConfiguration';
import {dayConfigEditSchema} from '../../../shared/dayConfig';
const receipts=JSON.parse(readFileSync(process.argv[2],'utf8'));
const request=receipts.find((r:any)=>r.path==='/api/new-day-planner-configuration'&&r.method==='PUT').request;
assert.equal(newDayPlannerConfigurationSchema.safeParse(request.configuration).success,true);
const input=JSON.parse(readFileSync(process.argv[3],'utf8')),before=JSON.stringify(input);
const independent=input.dailyTaskOperationScopes.map((p:any)=>p.taskId);assert.ok(independent.length>=2);
const jointGroups=[{id:'native-joint-probe',taskIds:independent,synchronization:'REQUIRED'}];
const general=newDayPlannerConfigurationSchema.safeParse({...request.configuration,jointGroups});
const daily=dayConfigEditSchema.safeParse({jointGroups,expectedRevisionId:null});
assert.equal(general.success,false);assert.equal(daily.success,false);assert.equal(JSON.stringify(input),before);
writeFileSync(process.argv[4],JSON.stringify({status:'BLOCKED',classification:'CONTRACT_NOT_REPRESENTABLE',nextSingleGap:'Native daily authoring of joint operations, preserving participant/resource identity',firstBoundary:'shared/newDayPlannerConfiguration.ts and shared/dayConfig.ts: no jointGroups authoring contract',generalIssues:general.success?[]:general.error.issues,dailyIssues:daily.success?[]:daily.error.issues,sourcePlanId:input.planId,probeTaskIds:independent,experimentIsStage:false,remoteWrites:0,consumerInfeasibilityClaimed:false,otherGaps:['Operational meals coordinated by unit and space','Coach route transitions','Coordination across structural authorities','requiresBand operational attribute']},null,2));
console.log('PASS next gap: both native authoring surfaces reject jointGroups before preflight');
