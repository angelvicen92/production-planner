"""Verify the authorized runtime bytes; evidence scripts are outside this authority."""
import hashlib, json, pathlib, subprocess, sys
root = pathlib.Path.cwd(); target = root/'docs/evidence/p0-g04b/source-binding.json'
if '--create' in sys.argv:
    base='349dea648555a314367a4f1d668a6dad7a81321d'
    paths=['engine','server','client','shared','supabase','script','docs/source/official','package.json','package-lock.json','vite.config.ts','tsconfig.json']
    files=subprocess.check_output(['git','ls-files','--',*paths],text=True).splitlines()
    assert not subprocess.check_output(['git','diff',base,'--',*paths],text=True)
    hashes={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in files}
    target.write_text(json.dumps({'base':base,'baseTree':subprocess.check_output(['git','rev-parse',base+'^{tree}'],text=True).strip(),
        'runtimeChanges':0,'migrationChanges':0,'files':hashes},indent=2)+'\n')
binding=json.loads(target.read_text())
for name, digest in binding['files'].items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest, name
print(json.dumps({'status':'PASS','runtimeFilesExact':len(binding['files']),'runtimeChanges':0,'base':binding['base']}))
