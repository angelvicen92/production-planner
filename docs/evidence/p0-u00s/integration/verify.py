"""Verify the corrected candidate's public evidence against its source binding."""
import gzip,hashlib,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
read=lambda path:json.loads(gzip.decompress(path.read_bytes())) if path.suffix=='.gz' else json.loads(path.read_text())
for line in (HERE/'initial-SHA256SUMS').read_text().splitlines():
 digest,name=line.split('  ',1)
 if name not in ['README.md','tsconfig.json']:
  assert hashlib.sha256((HERE.parent/name).read_bytes()).hexdigest()==digest,'original artifact changed: '+name
sql=read(HERE/'sql-audit.json.gz')
result=sql['revision-results.json']
for key in ['historicalSparseReplayAccepted','historicalSnapshotsPreserved','nullColumnSourceCaptureIdentical','historicalReadersIdentical','nativeAbsentPolicyAccepted']:
 assert result[key],key
assert result['originalReplay']==[{'replay_snapshot_json':{'contractVersion':1}}]
assert len(result['originalStages'])==11
for attack in result['results']:
 assert not attack['accepted'] and attack['atomicRollback']
 assert attack['code']=='P0001'
observed=sql['privileges-observed.json']
assert observed==read(ROOT/'script/demo/fixtures/data-api-privileges.json')
before=sql['catalog-114.json'];after=sql['catalog-115.json']
assert before['sequences']==after['sequences'] and before['policies']==after['policies']
for fn in after['functions']:
 if fn['signature'] not in [f['signature'] for f in before['functions']]:
  assert not fn['definer'] and fn['settings']==['search_path=""']
  if fn['role']!='service_role' or fn['signature'].startswith('guard_'):assert not fn['execute']
actors=read(HERE/'data-api-certified.json.gz')['data-api-actors.json']['technicalAuthority']
assert len(actors)==7 and all(row['atomicNoChange'] for row in actors)
for row in actors:
 for operation in ['directAuthorityWrite','internalDelegate']:
  assert row[operation]['status']==(401 if row['role']=='anon' else 400 if row['role']=='service_role' else 403)
binding=read(HERE/'source-binding.json')
for name,digest in binding['sourceHashes'].items():
 assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,name
for label in ['native','repeat']:
 receipts=read(HERE/label/'receipts.json.gz')
 assert receipts['integration.json']['status']=='PASS'
 assert receipts['integration.json']['migrations']==result['ledger']
 assert [day['label'] for day in receipts['days.json']]==['A','B','C','D']
 assert receipts['B-no-proposal.json']['assisted_result_json']['outcome']=='NO_PROPOSAL'
 for day in ['A','C','D']:
  stage=receipts[day+'-S2-accepted.json']['activeStage']
  assert len([t for t in stage['snapshotJson']['tasks'] if t['startPlanned']])==4
  assert receipts[day+'-SQL-U00q-replay-without-material-authority.json']['message']=='TECHNICAL_CHAIN_AUTHORITY_NOT_MATERIALIZED'
assert read(HERE/'determinism.json')['status']=='PASS'
for label in ['candidate','repeat']:
 a2=read(HERE/'a2'/label/'comparison.json')
 assert a2['completed']==266 and a2['stages']==11 and a2['branches']==27049
 assert a2['fingerprint']=='2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d'
 assert a2['certificatesRevalidated']==11 and a2['snapshotsEqual'] and a2['fullReportEqualExceptDurationMs']
print('PASS integrated authority/history, privileges, current sources, native determinism and A2 certificates')
