"""Reproduce neutral observation and falsifications solely in owned scratch copies."""
import hashlib, json, pathlib, shutil, subprocess, sys
repo = pathlib.Path.cwd()
native, out = (pathlib.Path(x).resolve() for x in sys.argv[1:])
assert not out.exists(), 'Use a fresh scratch directory'
out.mkdir(parents=True)
def run(script, *args):
    subprocess.run(['node', '--import', 'tsx', str(script), *map(str, args)], check=True, cwd=repo)
def read(p): return json.loads(p.read_text())
def save(p, v): p.write_text(json.dumps(v, indent=2)+'\n')
base = out/'baseline'
run(repo/'docs/evidence/p0-g04b/probe.ts', native, base)
source = out/'source'; source.mkdir()
for directory in ['engine', 'server', 'shared']:
    shutil.copytree(repo/directory, source/directory)
for filename in ['package.json', 'tsconfig.json']:
    shutil.copyfile(repo/filename, source/filename)
(source/'node_modules').symlink_to(repo/'node_modules', target_is_directory=True)
probe = source/'docs/evidence/p0-g04b/probe.ts'; probe.parent.mkdir(parents=True)
s = (repo/'docs/evidence/p0-g04b/probe.ts').read_text()
s = s.replace('const mainChoices:any[]=[],families:any[]=[];', '''const observations:any={};
(globalThis as any).__g04bObserve=(key:string,value:any)=>{const row=observations[key]??={count:0,first:structuredClone(value),last:null};row.count++;row.last=structuredClone(value);};
const mainChoices:any[]=[],families:any[]=[];''')
s = s.replace("save('exact',{result,mainChoices,families});", "save('exact',{result,mainChoices,families});save('observations',observations);")
probe.write_text(s)
deltas = []
def patch(file, before, after):
    p = source/file; value = p.read_text(); assert value.count(before) == 1
    changed = value.replace(before, after); p.write_text(changed)
    deltas.append({'file': file, 'from': before, 'to': after, 'before': hashlib.sha256(value.encode()).hexdigest(), 'after': hashlib.sha256(changed.encode()).hexdigest()})
needle = '      const nativeProtectedMains=!timeline&&problem.nativeAnchoredAccompanimentsVersion===2'
patch('engine/planner-next/exactMainAndFeederCore.ts', needle, '      (globalThis as any).__g04bObserve?.("geometries",{pattern,candidateEnds,latestDepartureStart:[...latestDepartureStart]});\n'+needle)
needle = '      evidence.standaloneForwardPrunes += 1;'
patch('engine/planner-next/exactItinerantPlan.ts', needle, '      (globalThis as any).__g04bObserve?.("forwardPrune",{task,candidate,domain:dynamicDomain.intervals,staticDomain:staticDomain.intervals,certifiedBackjumpTargetDepth:certifiedBackjumpTargetDepth});\n'+needle)
save(out/'instrumentation.json', deltas)
trace = out/'trace'; run(probe, native, trace)
assert read(base/'exact.json') == read(trace/'exact.json'), 'Observer must preserve the entire exact result literally'
save(out/'neutrality.json', {'status': 'PASS', 'literalResultMainChoicesAndFamiliesEqual': True, 'excludedFields': [], 'productChanges': 0})
needle = 'task.dependencies.some(id => !tasks.has(id))'
patch('engine/planner-next/mainFlowPatterns.ts', needle, 'task.dependencies.some(id => !tasks.has(id) && !(problem.participantMeals ?? []).some(meal => meal.sourceTaskId === id))')
save(out/'known-meal-delta.json', deltas[-1])
meal = out/'known-meal'; run(probe, native, meal)
geometry = out/'geometries'
run(repo/'docs/evidence/p0-g04b/geometryProbe.ts', base/'projection.json', trace/'observations.json', geometry)
for name in ['minimal-terminal-shift', 'feedable-boundary']:
    for mode in ['bundle', 'alternate-bundle']:
        run(repo/'docs/evidence/p0-g04b/verifyWitness.ts', base/'projection.json', geometry/(name+'-'+mode+'.json'), out/(name+'-'+mode+'-verification.json'))
save(out/'summary.json', {'status': 'DIAGNOSTIC_ONLY', 'configurationChanged': False, 'nativeStagesAdded': 0,
    'baseline': read(base/'exact.json')['result']['status'], 'knownMeal': read(meal/'exact.json')['result']['status'],
    'geometryExperiments': read(geometry/'summary.json'), 'productChanges': 0, 'remoteWrites': 0})
