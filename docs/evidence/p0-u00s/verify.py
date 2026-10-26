"""Verify public native receipts, literal migration ledger and material Stages."""
import gzip,hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
if len(sys.argv)>1:
 source=Path(sys.argv[1]);data={p.name:json.loads(p.read_text()) for p in source.glob('*.json')}
else:data=json.loads(gzip.decompress((HERE/'native/receipts.json.gz').read_bytes()))
get=lambda name:data[name+'.json']
report=get('integration');assert report['status']=='PASS' and report['remoteWrites']==0
assert report['postgresVersion'].startswith('PostgreSQL 17.')
expected=[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((ROOT/'supabase/migrations').glob('*.sql'))]
assert report['migrations']==expected
assert [d['label'] for d in get('days')]==['A','B','C','D']
all_ids=[]
for label in ['A','B','C','D']:
 i=get(label+'-input');policy=i['technicalChains'][0];ids=policy['orderedTaskIds'];all_ids+=ids
 assert ids!=sorted(ids) and len(ids)==3 and len(set(ids))==3
 assert get(label+'-preflight')['preflight']['status']=='SUPPORTED'
 assert get(label+'-effective')['readiness']['status']=='READY'
 assert get(label+'-effective')['technicalChains']['authority']['policies']==[policy]
 assert get(label+'-before-input').get('technicalChains') is None
 assert get(label+'-SQL-U00q-replay-without-material-authority')['message']=='TECHNICAL_CHAIN_AUTHORITY_NOT_MATERIALIZED'
 race=get(label+'-SQL-editors-race');assert sorted(r['status'] for r in race)==[200,409]
 if label=='B':
  run=get('B-no-proposal')['assisted_result_json'];assert run['outcome']=='NO_PROPOSAL'
  cause=run['evidence']['standaloneDiagnostic']['firstStandaloneDeadEndCause'];assert cause['kind']=='MACRO_ZERO_DOMAIN' and cause['workItemKind']=='TECHNICAL_CHAIN'
  assert get('B-ordinary-gap-certificate-rejected')['message']=='TECHNICAL_CHAIN_CERTIFICATE_INVALID'
  assert get('B-no-validation-accept')['status']==409
  continue
 previous=[]
 for stage in [1,2]:
  s=get(f'{label}-S{stage}-accepted')['activeStage'];placed=[t for t in s['snapshotJson']['tasks'] if t['startPlanned']]
  assert len(placed)==(1 if label=='D' and stage==1 else 3 if stage==1 else 4)
  assert s['validationSummaryJson']['hardCount']==s['validationSummaryJson']['requiredCount']==0
  for t in previous:assert t==next(x for x in placed if x['taskId']==t['taskId'])
  for t in placed:assert set(policy['requiredResourceIds']).issubset(t['assignedResourceIds'])
  if not(label=='D' and stage==1):
   chain=[next(t for t in placed if t['taskId']==id) for id in ids]
   assert all(chain[n]['endPlanned']==chain[n+1]['startPlanned'] for n in range(2))
  persisted=get(f'{label}-S{stage}-persisted');assert len([t for t in persisted if t['start_planned']])==len(placed)
  for t in placed:
   row=next(r for r in persisted if int(r['id'])==t['taskId']);assert row['assigned_resource_ids']==t['assignedResourceIds']
   assert row['start_planned'][:5]==t['startPlanned'] and row['end_planned'][:5]==t['endPlanned']
  previous=placed
 row=get(label+'-configuration-receipt')[0];assert row['created_by']==row['daily_technical_chains']['by']
 assert row['replay_snapshot_json']['authorities']['plan_workday'][0]['plannerNextAuthorities']['technicalChains']==[policy]
 restore=get(label+'-restore');assert restore['redo']['activeStage']==get(label+'-S2-accepted')['activeStage']
 assert restore['rollback']['activeStage']['configRevisionId']==get(label+'-S0')['activeStage']['configRevisionId']
 assert restore['rollback']['activeStage']['snapshotJson']==get(label+'-S0')['activeStage']['snapshotJson']
assert len(all_ids)==len(set(all_ids))
d=get('D-S1-run')['assisted_result_json'];assert len(d['proposal'])==1 and len(d['evidence']['technicalChainCertificate']['tasks'])==3
assert len([t for t in d['proposedDraftSnapshot']['tasks'] if t['startPlanned']])==1
for name,row in data.items():
 if '-certificate-' in name or ('-SQL-' in name and not any(x in name for x in ['editors-race','concurrent-source-http'])):
  assert row['accepted'] is False,name
  assert row.get('code') not in ['42601','42702','42883','42P01'],name
print('PASS: literal ledger, four new days, six genuine Stages, nominal adjacency, context-only future, attacks and historical restoration')
