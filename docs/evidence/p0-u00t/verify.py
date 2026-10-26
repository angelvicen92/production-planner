"""Verify the compact release rehearsal receipts, literal ledger and source binding."""
import copy,gzip,hashlib,json,pathlib,re,subprocess
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[2]
def read(path):
    path=pathlib.Path(path)
    return json.loads(gzip.decompress(path.read_bytes())) if path.suffix=='.gz' else json.loads(path.read_text())
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def bundle(name):return read(HERE/name/'receipts.json.gz')
ledger=[{'file':p.name,'sha256':digest(p)} for p in sorted((ROOT/'supabase/migrations').glob('*.sql')) if int(p.name[:3])<=115]
assert len(ledger)==118 and ledger[-1]['file']=='115_daily_required_technical_chains.sql'
subprocess.run(['git','diff','--exit-code','3ade5d2774584f92f86b2b8670bbb3f19fc5f83c','--','supabase/migrations'],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
expected=read(ROOT/'script/demo/fixtures/data-api-privileges.json')
def contract(catalog):
    tables=[]
    for t in catalog['tables']:
        columns={k:[v for v in values if v not in t['privileges']] for k,values in t['columns'].items()}
        tables.append({**{k:t[k] for k in ['name','role','kind','rls','options','privileges']},'columns':{k:v for k,v in columns.items() if v}})
    return {'tables':tables,'sequences':catalog['sequences'],'functions':[{k:f[k] for k in ['signature','role','execute']} for f in catalog['functions']]}
for profile in ['raw','prepared']:
    data=read(HERE/f'sql/{profile}.json.gz');summary=data['summary.json'];catalogs=data['catalogs.json.gz'];inventory=data['inventory-103.json']
    assert summary['status']=='PASS' and summary['ledger']==ledger and summary['remoteWrites']==0
    assert 170000<=int(summary['version'])<180000
    assert inventory==data['inventory-115.json']
    assert inventory['plans']['count']==2 and inventory['daily_tasks']['count']==599 and inventory['assisted_planning_stages']['count']==12
    assert len(data['steps.json'])==12 and len(catalogs)==13
    previous=catalogs['103']
    for index,step in enumerate(data['steps.json'],104):
        assert step['file']==ledger[-12:][index-104]['file'] and step['status']=='PASS' and step['original103ColumnsAndRowsIdentical']
        current=catalogs[str(index)]
        assert step['existingPoliciesUnchanged'] and all(p in current['policies'] for p in previous['policies'])
        previous=current
    security=summary['securityBaseline'];assert security['raw103NoRoleRows']==599
    assert security['baseline103NoRoleRows']==security['after115NoRoleRows']==(0 if profile=='prepared' else 599)
    assert security['sha256']==digest(ROOT/security['source'])
    wanted=copy.deepcopy(expected)
    if profile=='prepared':
        for table in wanted['tables']:
            if table['role']=='authenticated' and table['name'] in security['selectGrantTables'] and 'SELECT' not in table['privileges']:table['privileges'].insert(0,'SELECT')
    assert contract(catalogs['115'])==wanted
    assert summary['historical088LiteralReplayAccepted'] and summary['exactCurrentPrivilegeContract']
    assert all(o['snapshot_equal'] and o['fingerprint_equal'] and o['obligation_transition_id'] is None for o in summary['origins'])
    assert any(o['dirty_draft'] for o in summary['origins'])
    for plan in summary['noAdoption']:
        assert all(plan[k] is None for k in ['planner_next_profile','itinerant_composition_version','daily_round_synchronization','daily_technical_chains'])
        assert plan['operation_continuity_overrides']==[]
for name in ['legacy-read','required','additions','rounds','prefix','newday','a2-http']:
    data=bundle('after/'+name);report=data['integration.json']
    assert report['status']=='PASS' and report['remoteWrites']==0 and report['migrations']==ledger,name
    if name!='a2-http':
        history=data['historical-after-native.json'];assert history['status']=='PASS' and history['beforeSha256']==history['afterSha256']
        assert data['historical-delta.json.gz']['changedTables']==[]
    else:assert report['journey']['completed']==266 and len(report['journey']['stages'])==11 and report['liveExecution']
    manifest=read(HERE/'after'/name/'manifest.json.gz');harness=read(HERE/'after'/name/'harness.json.gz')
    for path,wanted in manifest.get('sourceHashes',{}).items():
        value=harness[path.rsplit('/',1)[1]].encode() if path.startswith('docs/evidence/p0-u00t/') else (ROOT/path).read_bytes()
        assert hashlib.sha256(value).hexdigest()==wanted,path
before=bundle('before/legacy-read');after=bundle('after/legacy-read')
assert before['integration.json']['status']=='FAIL'
assert before['historical-delta.json.gz']['changedTables']==['plan_breaks']
old=before['legacy-read-causal.json'];fixed=after['legacy-read-causal.json']
assert old['after']['prior']==old['after']['current'] and len(old['after']['prior'])==46
assert len(fixed['after']['prior'])==46 and fixed['after']['current']==[] and fixed['strictHistoricalPreservation']
assert bundle('before/required')['integration.json']['status']=='FAIL'
assert bundle('before/a2-http')['integration.json']['status']=='FAIL'
assert bundle('attempts/required-lock')['integration.json']['status']=='FAIL'
assert bundle('attempts/newday-profile')['integration.json']['status']=='FAIL'
compat=read(HERE/'sql/u00s-compatibility.json.gz')['revision-results.json']
assert compat['historicalSparseReplayAccepted'] and compat['historicalSnapshotsPreserved'] and len(compat['originalStages'])==11
assert all(not r['accepted'] and r['atomicRollback'] for r in compat['results'])
a2=read(HERE/'a2/comparison.json');assert a2['status']=='PASS' and a2['certificatesRevalidated']==22
baseline=ROOT/'docs/evidence/p0-u00s/integration/a2/candidate'
def strip(report):return {**report,'iterations':[{k:v for k,v in row.items() if k!='durationMs'} for row in report['iterations']]}
for label in ['candidate','repeat']:
    comparison=read(HERE/'a2'/label/'comparison.json')
    assert (comparison['completed'],comparison['stages'],comparison['branches'])==(266,11,27049)
    assert comparison['fingerprint']=='2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d'
    assert strip(read(HERE/'a2'/label/'run.json.gz'))==strip(read(baseline/'run.json.gz'))
    for name in ['snapshots.json.gz','certificates.json']:assert read(HERE/'a2'/label/name)==read(baseline/name)
for path,wanted in read(HERE/'authorities.json')['sha256'].items():assert digest(ROOT/path)==wanted,path
for path,wanted in read(HERE/'source-binding.json.gz')['sha256'].items():assert digest(ROOT/path)==wanted,path
for line in (HERE/'SHA256SUMS').read_text().splitlines():
    wanted,path=line.split('  ',1);assert digest(HERE/path)==wanted,path
print('PASS 12 literal upgrades, 103 inventory, declared permissions/RLS, history repair, native journeys and exact A2')
