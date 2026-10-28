"""Compare independently produced UI/API authorities and the full existing U02d SQL proof."""
import sys,json,pathlib,subprocess,gzip
ui,api,out=map(pathlib.Path,sys.argv[1:])
def read(root,name):
 p=root/(name+'.json')
 return json.loads(p.read_text()) if p.exists() else json.loads(gzip.decompress((root/'receipts.json.gz').read_bytes()))[name+'.json']
subprocess.run([sys.executable,'docs/evidence/p0-u02d/determinism.py',str(ui),str(api),str(out)],check=True)
a,b=read(ui,'g01-sql-template-snapshots'),read(api,'g01-sql-template-snapshots')
assert a==b,'literal UI/API persisted template resource snapshots'
authored=read(ui,'g01-integrated-ui-templates')
for template in authored:
 rows=[r for r in a if r['source_template_id']==template['id']]
 assert rows and all(r['resource_requirements']==template['expected'] for r in rows),template
 assert template['expected']==template['reloaded']
r=json.loads(out.read_text());r.update({'comparison':'UI vs existing API','uiAuthoredTemplates':len(authored),'literalTemplateSQLSnapshots':len(a),'remoteWrites':0})
out.write_text(json.dumps(r,indent=2)+'\n');print('PASS UI → API → literal template snapshots → EngineInput → Draft/certificates → Stage SQL')
