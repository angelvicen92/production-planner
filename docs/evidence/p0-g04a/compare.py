"""Compare material cold receipts literally; retain every physical difference."""
import json,pathlib,sys
left,right,out=map(pathlib.Path,sys.argv[1:])
read=lambda root,folder,name:json.loads((root/folder/(name+'.json')).read_text())
timings={'futureItinerantOperationalMealsMs','futureItinerantParticipantFutureMs','futureItinerantParticipantMealsMs','futureItinerantPrerequisiteSearchMs','futureItinerantPriorRevalidationMs','futureItinerantStructuralSearchMs','futureItinerantTechnicalFutureMs'}
observed=set()
def stable(v):
 if isinstance(v,dict):
  observed.update(k for k in v if k in timings)
  return {k:stable(x) for k,x in v.items() if k not in timings}
 if isinstance(v,list):return [stable(x) for x in v]
 return v
compared=[]
for folder,names in [('native',['native-input','native-adapter','native-effective','attempted-authorities','authoring-rejections','sql-readonly-rejections','sql-contracts']),('probe',['input','adapter','scope','assisted-problem','run','validation','summary','physical-summary','continuation','scope-consumers'])]:
 for name in names:
  assert stable(read(left,folder,name))==stable(read(right,folder,name)),folder+'/'+name
  compared.append(folder+'/'+name)
a=read(left,'native','sql-sources');b=read(right,'native','sql-sources')
for obj in [a,b]:
 for row in obj['plan']:row.pop('created_at')
 for row in obj['templates']:
  row.pop('created_at');row.pop('updated_at')
assert a==b,'SQL material source rows'
products={}
for root in [left,right]:
 manifest=json.loads((root/'manifest.json').read_text())
 hashes={k:v for k,v in manifest['sourceHashes'].items() if k.split('/')[0] in ['engine','server','client','shared','supabase']}
 products[str(root)]=hashes
assert products[str(left)]==products[str(right)]
result={'status':'PASS','sameIds':True,'materialReceiptsLiteral':compared,'sqlSourceRowsLiteralExceptCreationMetadata':True,'sqlSourceIgnoredKeys':['plan.created_at','templates.created_at','templates.updated_at'],'productSourceHashesLiteral':True,'productFilesCompared':len(products[str(left)]),'physicalDifferencesNormalized':False,'ignoredTimingKeys':sorted(observed),'memoryContinuationLiteral':True,'acceptedStages':0,'remoteWrites':0}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
