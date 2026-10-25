import assert from 'node:assert/strict';
import test from 'node:test';
import {latestAssistedSQLContracts} from './assistedSQLContracts';
import {requiredFunctionBodies} from './a2Preflight';

test('115 retains the literal 114 delegate and limits existing reader deltas to the daily chain authority',()=>{
 const old=latestAssistedSQLContracts(114),current=latestAssistedSQLContracts();
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
 for(const name of changed)assert.equal(requiredFunctionBodies().get(name),current.get(name)!.body,'RPC_BODY_DRIFT still binds '+name);
});
