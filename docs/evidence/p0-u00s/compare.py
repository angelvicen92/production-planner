"""Compare independent productive days by operational identity, not database IDs."""
import gzip,json,sys
from pathlib import Path
first,second,out=map(Path,sys.argv[1:4])
a=json.loads(gzip.decompress((first/'receipts.json.gz').read_bytes()))
b=json.loads(gzip.decompress((second/'receipts.json.gz').read_bytes()))
ma=json.loads(gzip.decompress((first/'manifest.json.gz').read_bytes()))
mb=json.loads(gzip.decompress((second/'manifest.json.gz').read_bytes()))
assert ma['sourceHashes']==mb['sourceHashes']
result={}
for label in ['A','B','C','D']:
 def projection(data):
  i=data[label+'-input.json'];tasks={t['id']:t['templateName'] for t in i['tasks']};resources={r['id']:r['name'] for r in i['planResourceItems']};spaces={r['spaceId']:r['name'] for r in i['planSpaceSettings']}
  def placed(rows):return sorted([{'task':tasks[t['taskId']],'start':t['startPlanned'],'end':t['endPlanned'],'space':spaces[t['spaceId']],'resources':sorted(resources[r] for r in t['assignedResourceIds'])} for t in rows if t.get('startPlanned')],key=lambda t:t['task'])
  p=i['technicalChains'][0]
  values={'policy':{'order':[tasks[id] for id in p['orderedTaskIds']],'resources':[resources[id] for id in p['requiredResourceIds']],'adjacency':p['adjacency'],'continuity':p['resourceContinuity']}}
  if label=='B':values['result']={'outcome':data['B-no-proposal.json']['assisted_result_json']['outcome'],'work':data['B-no-proposal.json']['assisted_result_json']['evidence']['work']}
  else:
   for n in [1,2]:
    run=data[f'{label}-S{n}-run.json']['assisted_result_json'];stage=data[f'{label}-S{n}-accepted.json']['activeStage'];certificate=run['evidence']['technicalChainCertificate']
    values[str(n)]={'placed':placed(stage['snapshotJson']['tasks']),'work':run['evidence']['work'],'futureCertificate':{'status':certificate['status'],'consumed':certificate['consumed'],'tasks':placed(certificate['tasks'])}}
  return values
 assert projection(a)==projection(b),label
 assert a[label+'-input.json']['planId']!=b[label+'-input.json']['planId']
 result[label]={'differentDailyIdentities':True,'samePolicyOrderAndNominalNames':True,'samePlacementsAndWorkCounters':True,'sameFutureCertificate':True}
out.write_text(json.dumps({'status':'PASS','sourceHashesEqual':True,'days':result},indent=2)+'\n')
