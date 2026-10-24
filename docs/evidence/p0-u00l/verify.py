"""Offline verification of captured gates; never contacts services."""
import argparse,gzip,hashlib,json,pathlib
root=pathlib.Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--extract',type=pathlib.Path);args=parser.parse_args()
def read(path):
 p=root/path;return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
checks=read('checks.json');assert checks['suiteTests']==checks['suitePassed']==3225 and checks['suiteFailed']==0
ci=read('ci-historical-gates.json');assert ci['historicalVerifier']['status']=='PASS' and ci['before111']=={'accepted':True,'hashesRecomputed':True,'rolledBack':True} and not ci['productChanges']
native=read('native/receipts.json.gz');assert native['integration.json']['status']=='PASS'
for label,count,stages in [('A',11,1),('B',6,2)]:
 source=native[f'{label}-input.json'];assert len(source['tasks'])==count and not source['locks']
 assert all(not t.get('startPlanned') and not t.get('endPlanned') for t in source['tasks'])
 for stage in range(1,stages+1):
  run=native[f'{label}-S{stage}-run.json']['assisted_result_json'];accepted=native[f'{label}-S{stage}-stage.json']['activeStage']
  assert run['outcome']=='PROPOSAL' and run['evidence']['completeForScope'] and run['evidence']['hardValid'] and run['evidence']['requiredValid']
  assert accepted['snapshotJson']==run['proposedDraftSnapshot']
  assert len(run['evidence']['nominalPhysicalFutureWitness']['tasks'])==count
  assert all(row['status']=='pending' for row in native[f'{label}-S{stage}-daily.json'])
first=native['B-S1-stage.json']['activeStage']['snapshotJson'];second=native['B-S2-stage.json']['activeStage']['snapshotJson']
for row in first['tasks']:
 if row['startPlanned']:assert row==next(t for t in second['tasks'] if t['taskId']==row['taskId'])
future=next(t for t in first['tasks'] if t['taskId']==14);assert future['startPlanned'] is None and future['assignedResourceIds']==[]
assert next(t for t in second['tasks'] if t['taskId']==14)['assignedResourceIds']==[11]
cold=read('cold-replay.json');assert cold['status']=='PASS' and len(cold['cases'])==3
sql=read('sql-summary.json');assert sql['attacks']==89 and sql['foreignKeyRejections']==6
assert all(x['hashesRecomputed'] and x['rolledBack'] for x in sql['cases'])
red=read('sql-main-gap-red.json.gz')['main-gap-probe.json'];green=read('sql-main-gap-green.json.gz')['main-gap-probe.json']
assert red['accepted'] and not red['canonical']['hardValid'] and red['canonical']['blockViolationCount']==1
assert not green['accepted'] and 'MAIN_FLOW_CONTINUITY' in green['error']
assert not red['stageAccepted'] and not green['stageAccepted'] and red['rolledBack'] and green['rolledBack']
causal=read('causal.json.gz');assert hashlib.sha256(gzip.decompress((root/'pre-identity-delta.patch.gz').read_bytes())).hexdigest()==causal['manifest.json']['probes'][0]['patchSha256'];good=causal['current.json'];bad=causal['without-variant-keys.json']
for case in [good,bad]:
 assert all(len(row['variants'])==2 for row in case['generated'])
 assert case['physicalRejection']['firstRejectionReason']=='OVERLAP_REQUIRED_RESOURCE'
assert good['execution']['result']['complete'] and bad['execution']['result']['status']=='INFEASIBLE'
assert dict(good['first']['matching'])['task:4']==dict(good['repaired']['matching'])['task:4']
assert next(t for t in good['repaired']['scheduledTasks'] if t['id']=='task:4')['nominalResourceChoice']['selectedResourceId']=='plan-resource:102'
gates=read('gate1.json.gz')
for mode in ['B','A','anyOf','byType']:
 r=gates[mode]['result']['result'];assert r['complete']==(mode!='A')
 if mode!='A':assert len(r['scheduledTasks'])==11
 if mode in ['anyOf','byType']:
  assert next(t for t in r['scheduledTasks'] if t['id']=='task:4')['nominalResourceChoice']['selectedResourceId']=='plan-resource:102'
a2=read('a2/execution.json.gz');assert a2['status']=='PASS' and a2['branches']==27049 and a2['certificatesRevalidated']==22 and a2['finalHeadFullReportSnapshotsCertificatesIdentical']
previous=None
for label in ['base','candidate','repeat','final']:
 r=read(f'a2/{label}/run.json.gz');assert r['completedObligationCount']==266 and r['stageCount']==11
 assert r['deterministicFingerprint']=='2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d'
 assert sum(x['branchesExplored'] for x in r['iterations'])==27049
 stripped={**r,'iterations':[{k:v for k,v in x.items() if k!='durationMs'} for x in r['iterations']]}
 if previous is not None:assert previous==stripped
 previous=stripped
assert read('regressions/comparison.json.gz')['status']=='PASS'
repo=root.parents[2]
for file,digest in read('protected-authorities.json')['hashes'].items():assert hashlib.sha256((repo/file).read_bytes()).hexdigest()==digest,file
for file,digest in read('native-manifest.json')['sourceHashes'].items():
 if digest is not None:assert hashlib.sha256((repo/file).read_bytes()).hexdigest()==digest,file
for file,digest in a2['finalSourceHashes'].items():assert hashlib.sha256((repo/file).read_bytes()).hexdigest()==digest,file
if args.extract:
 assert not args.extract.exists(),'Use a fresh extract destination'
 args.extract.mkdir(parents=True)
 for p in root.rglob('*.gz'):
  target=args.extract/p.relative_to(root).with_suffix('');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(gzip.decompress(p.read_bytes()))
print('PASS U00l: same-spot recovery, three real Stages, 90 SQL negatives, protected sources and unchanged complete A2')
