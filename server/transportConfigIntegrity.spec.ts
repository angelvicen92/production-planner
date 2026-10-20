import assert from 'node:assert/strict';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {normalizePlanOptimizerSnapshotV1} from './planOptimizerSnapshot';
import {buildPlanOptimizerSnapshotPersistenceBundleV1,hydratePlanOptimizerSnapshotV1} from './planOptimizerSnapshotPersistence';
import {diffPlanOptimizerSnapshotsV1} from './planOptimizerSnapshotDiff';
import {applyPlanPlannerNextConfiguration} from './planPlannerNextConfiguration';
import {dayConfigEditSchema} from '../shared/dayConfig';
import {transportBoundsSchema} from '../shared/transportPolicy';
import {buildA2ImportRows} from '../script/demo/a2ImportRows';

const refs={arrivalPlanTemplateSnapshotId:101,departurePlanTemplateSnapshotId:102};
const settings={arrivalGroupingTarget:3,departureGroupingTarget:1,arrivalMinGapMinutes:30,departureMinGapMinutes:20,vanCapacity:3,weightArrivalDepartureGrouping:1};

test('historical frozen optimizer fingerprint and semantics survive absent/null new fields',()=>{
 const captured=JSON.parse(gunzipSync(readFileSync('server/fixtures/assistedP9A2.json.gz')).toString());
 const old=captured.configReplay.optimizerSnapshot;
 assert.deepEqual(normalizePlanOptimizerSnapshotV1(old),old);
 const withNulls={...old,transport:{...old.transport,arrivalMinimumGroupSize:null,departureMinimumGroupSize:null,arrivalMaximumGroupSize:null,departureMaximumGroupSize:null}};
 assert.deepEqual(normalizePlanOptimizerSnapshotV1(withNulls),old);
});
test('explicit directional HARD bounds roundtrip through persistence, normalization, diff and fingerprint',()=>{
 const baseline=normalizePlanOptimizerSnapshotV1(settings,refs,'INHERITED');
 const next=normalizePlanOptimizerSnapshotV1({...settings,arrivalMinimumGroupSize:2,arrivalMaximumGroupSize:3,departureMinimumGroupSize:2,departureMaximumGroupSize:6},refs,'DAY_OVERRIDE');
 const bundle=buildPlanOptimizerSnapshotPersistenceBundleV1(999,next);
 const hydrated=hydratePlanOptimizerSnapshotV1(bundle.snapshot,bundle.heuristics,bundle.groupingZones);
 assert.deepEqual(hydrated,next);assert.notEqual(next.configurationFingerprint,baseline.configurationFingerprint);
 assert.deepEqual(diffPlanOptimizerSnapshotsV1(baseline,next).changes.map(item=>item.path).sort(),['transport.arrivalMaximumGroupSize','transport.arrivalMinimumGroupSize','transport.departureMaximumGroupSize','transport.departureMinimumGroupSize']);
 assert.equal(hydrated.transport.departureGroupingTarget,1);assert.equal(hydrated.transport.departureMinimumGroupSize,2);
});
test('human invalid bounds, fractions, targets and gaps are rejected before search without clamping',()=>{
 for(const patch of [{arrivalMinimumGroupSize:3,arrivalMaximumGroupSize:2},{arrivalMinimumGroupSize:0},{departureMinimumGroupSize:1.2},{arrivalGroupingTarget:-1},{arrivalMinGapMinutes:1.5},{departureMinGapMinutes:-1}])
  assert.equal(dayConfigEditSchema.safeParse({optimizer:{transport:{...settings,...patch}}}).success,false,JSON.stringify(patch));
 assert.equal(dayConfigEditSchema.safeParse({optimizer:{transport:{...settings,departureMinimumGroupSize:2,departureMaximumGroupSize:6}}}).success,true);
 assert.equal(transportBoundsSchema.safeParse({arrivalMinimumGroupSize:3,arrivalMaximumGroupSize:2}).success,false);
 assert.throws(()=>normalizePlanOptimizerSnapshotV1({...settings,arrivalMinimumGroupSize:3,arrivalMaximumGroupSize:2},refs));
});
test('legacy day overrides dominate inherited snapshots; explicit day edits supersede legacy bounds through a new revision',()=>{
 const dataset=buildA2ImportRows('2026-10-20');
 const inherited={...dataset.input,optimizerSnapshotSource:'INHERITED' as const,arrivalMinimumGroupSize:2,arrivalMaximumGroupSize:5,departureMaximumGroupSize:3};
 const input=applyPlanPlannerNextConfiguration(inherited,dataset.configuration);
 assert.equal(input.arrivalMinimumGroupSize,2);assert.equal(input.arrivalMaximumGroupSize,3);assert.equal(input.departureMaximumGroupSize,6);assert.equal(input.vanCapacity,3);
 const edited=applyPlanPlannerNextConfiguration({...inherited,optimizerSnapshotSource:'DAY_OVERRIDE',arrivalMaximumGroupSize:4,departureMaximumGroupSize:5},dataset.configuration);
 assert.equal(edited.arrivalMaximumGroupSize,4);assert.equal(edited.departureMaximumGroupSize,5);
 assert.equal(edited.transportSettings!.arrivalMaximumGroupSize,4);
 assert.equal(dataset.configuration.arrivalMaximumGroupSize,3);assert.equal(dataset.configuration.departureMaximumGroupSize,6);
});

test('the real General storage reader selects new bounds and supplies them to new-day snapshot capture',async(t)=>{
 process.env.SUPABASE_URL??='http://localhost';process.env.SUPABASE_ANON_KEY??='test';process.env.SUPABASE_SERVICE_ROLE_KEY??='test';
 const {supabaseAdmin}=await import('./supabase');const {SupabaseStorage}=await import('./storage');
 const original=supabaseAdmin.from;
 t.after(()=>{supabaseAdmin.from=original;});
 const row={arrival_minimum_group_size:2,departure_minimum_group_size:2,arrival_maximum_group_size:3,departure_maximum_group_size:6,
  arrival_grouping_target:3,departure_grouping_target:1,van_capacity:3,arrival_min_gap_minutes:30,departure_min_gap_minutes:20};
 supabaseAdmin.from=((table:string)=>{assert.equal(table,'optimizer_settings');return {select:(columns:string)=>({eq:()=>({single:async()=>({data:Object.fromEntries(columns.split(',').map(key=>key.trim()).filter(key=>key in row).map(key=>[key,row[key as keyof typeof row]])),error:null})})})};}) as any;
 const general=await new SupabaseStorage().getOptimizerSettings();
 assert.equal(general.arrivalMinimumGroupSize,2);assert.equal(general.departureMinimumGroupSize,2);assert.equal(general.arrivalMaximumGroupSize,3);assert.equal(general.departureMaximumGroupSize,6);
 const daily=normalizePlanOptimizerSnapshotV1(general,refs,'INHERITED');
 assert.equal(daily.transport.arrivalMinimumGroupSize,2);assert.equal(daily.transport.departureMaximumGroupSize,6);
});
