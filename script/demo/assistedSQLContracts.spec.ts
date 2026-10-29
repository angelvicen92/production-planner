import assert from 'node:assert/strict';
import test from 'node:test';
import {latestAssistedSQLContracts} from './assistedSQLContracts';
import {requiredFunctionBodies} from './a2Preflight';

test('128 extends only phase admission and the existing individual meal witness channel',()=>{
 const old=latestAssistedSQLContracts(127),current=latestAssistedSQLContracts(128);
 assert.deepEqual([...old].filter(([name,v])=>current.get(name)?.body!==v.body).map(([name])=>name).sort(),['assert_anchored_choice_witness','assert_daily_technical_chains']);
 for(const name of ['assert_anchored_choice_witness','assert_daily_technical_chains'])assert.equal(requiredFunctionBodies(false,128).get(name),current.get(name)!.body);
 assert.equal(current.get('assert_daily_joint_groups')!.body,old.get('assert_daily_joint_groups')!.body);
 const body=current.get('assert_anchored_choice_witness')!.body;
 for(const marker of ['OPERATIONAL_PARTICIPANT_GLOBAL_WITNESS_REQUIRED','OPERATIONAL_PARTICIPANT_WITNESS_MATERIAL','OPERATIONAL_PARTICIPANT_CAPACITY','OPERATIONAL_PARTICIPANT_DEPENDENCY'])assert.ok(body.includes(marker));
 assert.match(current.get('assert_daily_technical_chains')!.body,/flexible_meal_window.*daily_joint_groups/);
});

test('115 retains the literal 114 delegate and limits existing reader deltas to the daily chain authority',()=>{
 const old=latestAssistedSQLContracts(114),current=latestAssistedSQLContracts(115);
 assert.equal(current.get('apply_day_config_operation_before_technical_chains')!.body,old.get('apply_day_config_operation_v5')!.body);
 for(const name of ['assisted_expected_obligation_sources','assisted_preview_s0_additions']) {
  const prior=old.get(name)!.body;
  const expected=prior.replaceAll("r.diff_json#>>'{roundSynchronizationTransition,sessionId}'",
   "coalesce(r.diff_json#>>'{technicalChainTransition,sessionId}',r.diff_json#>>'{roundSynchronizationTransition,sessionId}')")
   .replaceAll("transition_record.diff_json#>'{roundSynchronizationTransition,sources}'",
    "coalesce(transition_record.diff_json#>'{technicalChainTransition,sources}',transition_record.diff_json#>'{roundSynchronizationTransition,sources}')");
  assert.equal(current.get(name)!.body,expected,name);
 }
 const projection="CASE WHEN t.daily_round_synchronization IS NULL THEN to_jsonb(t)-''daily_round_synchronization'' ELSE to_jsonb(t) END";
 const extended="(to_jsonb(t) - CASE WHEN t.daily_round_synchronization IS NULL THEN ''daily_round_synchronization'' ELSE ''__absent'' END) - CASE WHEN t.daily_technical_chains IS NULL THEN ''daily_technical_chains'' ELSE ''__absent'' END";
 assert.equal(current.get('assisted_read_bootstrap_sources')!.body,old.get('assisted_read_bootstrap_sources')!.body.replace(projection,extended));
 const changed=['apply_day_config_operation_v5','assisted_expected_obligation_sources','assisted_preview_s0_additions','assisted_read_bootstrap_sources'];
 assert.deepEqual([...old].filter(([name,value])=>current.get(name)?.body!==value.body).map(([name])=>name).sort(),changed.sort());
 for(const name of changed)assert.ok(requiredFunctionBodies().has(name),'RPC_BODY_DRIFT still binds '+name);
});

test('116 binds exact source transitions and only the existing task writer loops',()=>{
 const old=latestAssistedSQLContracts(115),current=latestAssistedSQLContracts(116);
 assert.equal(current.get('apply_day_config_operation_before_anchored_accompaniments')!.body,old.get('apply_day_config_operation_v5')!.body);
 const changed=['apply_day_config_operation_v5','assisted_expected_obligation_sources','assisted_preview_s0_additions','assisted_read_bootstrap_sources','assisted_accept_stage','assisted_apply_snapshot'];
 assert.deepEqual([...old].filter(([name,v])=>current.get(name)?.body!==v.body).map(([name])=>name).sort(),changed.sort());
 for(const name of changed)assert.equal(requiredFunctionBodies(false,116).get(name),current.get(name)!.body,name);
 assert.match(current.get('assisted_apply_snapshot')!.body,/ANCHORED_RESTORE_REQUIRES_CHECKPOINT/);
});


test('117 retains literal 116 writers and binds only the scope transition and authority reader',()=>{
 const old=latestAssistedSQLContracts(116),current=latestAssistedSQLContracts(117);
 assert.equal(current.get('apply_day_config_operation_before_task_operation_scopes')!.body,old.get('apply_day_config_operation_v5')!.body);
 const changed=['apply_day_config_operation_v5','assisted_expected_obligation_sources','assisted_preview_s0_additions','assisted_read_bootstrap_sources'];
 assert.deepEqual([...old].filter(([name,v])=>current.get(name)?.body!==v.body).map(([name])=>name).sort(),changed.sort());
 for(const name of changed)assert.equal(requiredFunctionBodies(false,117).get(name),current.get(name)!.body,name);
 for(const name of ['assisted_accept_stage','assisted_apply_snapshot'])assert.equal(current.get(name)!.body,old.get(name)!.body,name);
});


test('120 retains 119 delegation and limits existing body deltas to joint transitions and the physical witness',()=>{
 const old=latestAssistedSQLContracts(119),current=latestAssistedSQLContracts(120);
 assert.equal(current.get('apply_day_config_operation_before_joint_groups')!.body,old.get('apply_day_config_operation_v5')!.body);
 const changed=['apply_day_config_operation_v5','assisted_expected_obligation_sources','assisted_preview_s0_additions','assisted_read_bootstrap_sources','assert_anchored_choice_witness'];
 assert.deepEqual([...old].filter(([name,v])=>current.get(name)?.body!==v.body).map(([name])=>name).sort(),changed.sort());
 for(const name of changed)assert.equal(requiredFunctionBodies(false,120).get(name),current.get(name)!.body,name);
 for(const name of ['assisted_accept_stage','assisted_apply_snapshot','assert_task_scope_snapshot'])assert.equal(current.get(name)!.body,old.get(name)!.body,name);
});


test('130 changes only admission in the existing joint and phase validators',()=>{
 const old=latestAssistedSQLContracts(129),current=latestAssistedSQLContracts(130);
 assert.deepEqual([...old].filter(([name,v])=>current.get(name)?.body!==v.body).map(([name])=>name).sort(),['assert_daily_joint_groups','assert_daily_technical_chains']);
 assert.match(current.get('assert_daily_joint_groups')!.body,/p\.meal_mode='flexible_meal_window' AND \(p\.daily_technical_chains/);
 for(const name of ['assert_anchored_choice_witness','assert_daily_technical_chain_snapshot','apply_day_config_operation_v5','assisted_accept_stage'])assert.equal(current.get(name)!.body,old.get(name)!.body,name);
});

test('123 changes only the two existing phase validators and retains the historical linear branch',()=>{
 const old=latestAssistedSQLContracts(122),current=latestAssistedSQLContracts(123);
 assert.deepEqual([...old].filter(([name,v])=>current.get(name)?.body!==v.body).map(([name])=>name).sort(),['assert_daily_technical_chain_snapshot','assert_daily_technical_chains']);
 for(const name of ['assert_daily_technical_chains','assert_daily_technical_chain_snapshot']){
  const tail=(body:string)=>body.slice(body.indexOf(' END IF;\n IF jsonb_typeof(p_structure)')>=0?body.indexOf(' END IF;\n IF jsonb_typeof(p_structure)'):body.indexOf(' total:='));
  assert.equal(tail(current.get(name)!.body),tail(old.get(name)!.body));
 }
 assert.match(current.get('assert_daily_technical_chain_snapshot')!.body,/coalesce\(jsonb_agg/);
});
