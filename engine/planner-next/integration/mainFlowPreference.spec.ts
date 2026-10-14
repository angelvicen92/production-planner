import assert from 'node:assert/strict';
import test from 'node:test';
import {buildEngineInput} from '../../../engine/buildInput';
import {buildA2ImportRows} from '../../../script/demo/a2ImportRows';
import {a2HistoricalCatalog} from '../../../script/demo/a2HistoricalCatalog';
import {a2ImportStorageFixture} from '../../../script/demo/a2ImportStorageFixture';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {mainFlowPreferenceSchema,mainFlowPreferenceFromRow,mainFlowPreferenceColumns,autoMainFlowPreference} from '../../../shared/mainFlowPreference';
import {dayConfigEditSchema,dayConfigRefreshSchema} from '../../../shared/dayConfig';
import {applyEffectiveMainFlowPreference,validateMainFlowPreference,mainFlowPreferenceGeometry,withMainFlowPreference} from '../../../server/mainFlowPreference';
import {buildEffectivePlanConfigRevisionV1,projectEffectiveAuthoritiesFromEngineInputV1} from '../../../server/effectivePlanConfigRevision';
import {buildEffectivePlanConfigReplaySnapshotV1} from '../../../server/assistedPlanningConfigRevision';
import {buildProgramSettingsAtomicPatch} from '../../../server/programSettingsUpdate';
import {mainFlowPreferenceResultMessage} from '../../../client/src/lib/main-flow-preference-result';
const preferred={blockCountPolicy:{mode:'SOFT_PREFER_N',count:4},mealSplitPreference:{mode:'PREFERRED',beforeMealBlocks:2,afterMealBlocks:2}} as const;
async function source(){return a2ImportStorageFixture(buildA2ImportRows('2026-10-30',100000,{historicalCatalog:a2HistoricalCatalog,planId:27002}));}

test('typed product contract rejects HARD aliases, opaque JSON flags, invalid count and inconsistent sums',()=>{
 for(const raw of [{blockCountPolicy:{mode:'FIXED_COUNT',count:4},mealSplitPreference:{mode:'OFF'}}, {...preferred,blockCountPolicy:{mode:'SOFT_PREFER_N',count:0}}, {...preferred,mealSplitPreference:{mode:'PREFERRED',beforeMealBlocks:2,afterMealBlocks:3}}, {...preferred,enabled:true}, {...autoMainFlowPreference,mealSplitPreference:preferred.mealSplitPreference}])assert.equal(mainFlowPreferenceSchema.safeParse(raw).success,false);
 assert.deepEqual(dayConfigEditSchema.parse({mainFlowPreference:preferred}).mainFlowPreference,preferred);
 assert.ok(dayConfigRefreshSchema.parse({capabilities:['BLOCK_COUNT_POLICY']}).capabilities.includes('BLOCK_COUNT_POLICY'));
 assert.deepEqual(mainFlowPreferenceFromRow({}),autoMainFlowPreference);
 assert.deepEqual(mainFlowPreferenceFromRow(mainFlowPreferenceColumns(preferred)),preferred);
 assert.deepEqual(buildProgramSettingsAtomicPatch({mainFlowPreference:preferred},[],[],'today'),{main_preferred_block_count:4,main_before_meal_blocks:2});
});
test('effective product rows feed the internal SOFT count and structured meal preference without rewriting 088',async()=>{
 const f=await source(),raw=structuredClone(f.tables.plans[0]),before=await buildEngineInput(27002,f.storage);
 Object.assign(f.tables.plans[0],mainFlowPreferenceColumns(preferred));
 const input=await buildEngineInput(27002,f.storage),a=adaptEngineInputToPlannerNextProblem(input);assert.equal(a.status,'SUPPORTED');if(a.status!=='SUPPORTED')throw Error('unsupported');
 assert.equal(a.problem.mainFlow.preferredBlockCount,4);assert.deepEqual(a.problem.mainFlow.mealSplitPreference,preferred.mealSplitPreference);
 assert.deepEqual(f.tables.plans[0].planner_next_configuration,raw.planner_next_configuration);
 assert.deepEqual(withMainFlowPreference(input,autoMainFlowPreference),before);
 const old=projectEffectiveAuthoritiesFromEngineInputV1(before),current=projectEffectiveAuthoritiesFromEngineInputV1(input);
 assert.notDeepEqual(old,current);
 const base={planId:27002,taskTemplateSnapshots:await f.storage.getPlanTaskTemplateSnapshots(27002),optimizerSnapshot:await f.storage.getPlanOptimizerSnapshot(27002),taskTemplateProvenance:{authority:'plan_task_template_snapshots',authorityContractVersion:1},optimizerProvenance:{authority:'plan_optimizer_snapshots',authorityContractVersion:1}};
 const identity=buildEffectivePlanConfigRevisionV1({...base,authorities:current}),baseline=buildEffectivePlanConfigRevisionV1({...base,authorities:old});assert.notEqual(identity.configurationFingerprint,baseline.configurationFingerprint);
 assert.deepEqual((buildEffectivePlanConfigReplaySnapshotV1({...base,authorities:current}).authorities.plan_workday as any)[0].plannerNextAuthorities.plannerNext.mainFlow.preference,preferred);
});
test('count choices come from actual geometry, and absent meal cannot become an effective preference',async()=>{
 const f=await source(),input=await buildEngineInput(27002,f.storage),geometry=mainFlowPreferenceGeometry(input);
 assert.equal(geometry.available,true);assert.equal(geometry.mealApplicable,true);assert.ok(geometry.counts.includes(4));assert.ok(geometry.counts.some(n=>n>6));
 assert.doesNotThrow(()=>validateMainFlowPreference(input,preferred));
 assert.throws(()=>validateMainFlowPreference(input,{...preferred,blockCountPolicy:{mode:'SOFT_PREFER_N',count:100},mealSplitPreference:{mode:'OFF'}}),/geometría/);
 const noMeal={...input,operationalMealPolicies:input.operationalMealPolicies!.filter(m=>!m.spaceIds?.includes(input.plannerNext!.mainFlow.spaceId))};
 assert.throws(()=>validateMainFlowPreference(noMeal,preferred),/comida|contrato/);
});
test('production result wording distinguishes quantity, distribution, completion and bounded exhaustion',()=>{
 const e={requested:4,achieved:4,targetAchieved:true,mealSplitRequested:preferred.mealSplitPreference,mealSplitPreferenceAchieved:true,mealSplitAchieved:{blocksBeforeMeal:2,blocksAfterMeal:2,blockSpansMeal:false},hardCertificate:null} as any;
 assert.equal(mainFlowPreferenceResultMessage(e),'Solicitados 4 bloques, distribución 2+2. Conseguido: 4 bloques, distribución 2+2.');
 assert.match(mainFlowPreferenceResultMessage({...e,mealSplitPreferenceAchieved:false,mealSplitAchieved:{blocksBeforeMeal:3,blocksAfterMeal:1,blockSpansMeal:false}}),/4 bloques, distribución 3\+1.*límites de búsqueda.*inviabilidad no está demostrada/);
 assert.match(mainFlowPreferenceResultMessage({...e,achieved:3,targetAchieved:false,mealSplitRequested:null}),/alternativa completa.*No está demostrada/);
 assert.match(mainFlowPreferenceResultMessage({...e,achieved:null}),/No se obtuvo una propuesta completa.*inviabilidad no está demostrada/);
});

test('habitual preference does not manufacture a Next authority in legacy days',async()=>{
 const f=await source(),input=await buildEngineInput(27002,f.storage);const legacy={...input,plannerNext:undefined};
 assert.equal(applyEffectiveMainFlowPreference(legacy,mainFlowPreferenceColumns(preferred)),legacy);
 assert.equal(mainFlowPreferenceGeometry(legacy).available,false);
 assert.throws(()=>validateMainFlowPreference(legacy,preferred),/configurado/);
});
