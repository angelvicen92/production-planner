import pathlib,subprocess,os,hashlib,json,argparse,shutil
parser=argparse.ArgumentParser();parser.add_argument('destination');parser.add_argument('--ref',default='HEAD');parser.add_argument('--expect',choices=['accepted','rejected'],default='rejected');args=parser.parse_args()
repo=pathlib.Path.cwd();out=pathlib.Path(args.destination).resolve();source=out/'source';source.mkdir(parents=True,exist_ok=False)
ref=subprocess.check_output(['git','rev-parse',args.ref],text=True).strip()
subprocess.run(['tar','-x','-C',str(source)],input=subprocess.check_output(['git','archive',ref]),check=True)
(source/'node_modules').symlink_to(repo/'node_modules',target_is_directory=True)
p=source/'script/validation/u00lFunctionalJourney.ts';before=p.read_text();s=before
s="import {validatePlan} from '../../engine/planner-next/validate';\n"+s
s=s.replace("['A','B'].entries()","['A'].entries()")
s=s.replace("spaces/${mainRoom.id}/availability`,'PATCH',{availabilityStart:'09:40',availabilityEnd:'10:00'}", "spaces/${mainRoom.id}/availability`,'PATCH',{availabilityStart:'09:40',availabilityEnd:'10:20'}")
a=s.index('      const guards=[');b=s.index('      for(const guard of guards)',a);s=s[:a]+"      const guards=['main-continuity'];\n"+s[b:]
marker="          if(guard==='coach-overlap'){"
s=s.replace(marker,"""          if(guard==='main-continuity'){
            const last=proof.tasks.filter((t:any)=>t.kind==='main').sort((a:any,b:any)=>a.start-b.start).at(-1);
            last.start=610;last.end=620;alignScheduledProofRow(last);
            for(const t of proof.tasks.filter((t:any)=>t.participantId===last.participantId&&input.tasks.find(x=>`task:${x.id}`===t.id)?.operationalRole==='transport_departure')){
              t.start=620;t.end=630;alignScheduledProofRow(t);
            }
          }
"""+marker)
marker="          if(process.env.OPTIPLAN_U00L_BEFORE_INTEGRITY==='1'&&guard==='omit'){"
s=s.replace(marker,"""          if(guard==='main-continuity'){
            const canonical=adapter.status==='SUPPORTED'?validatePlan(adapter.problem,proof.tasks):null;
            save('main-gap-probe',{accepted:!failure,error:failure?.message,canonical,hashesRecomputed:true,rolledBack:true,stageAccepted:false});
            pass(`main gap probe: SQL ${failure?'REJECTED':'ACCEPTED'}; canonical hardValid=${canonical?.hardValid}`);
            return {status:failure?'SQL_REJECTED_MAIN_GAP':'SQL_ACCEPTED_MAIN_GAP',remoteWrites:0};
          }
"""+marker)
assert s!=before;p.write_text(s)
harness=source/'script/demo/smokeNewDayIntegration.ts';original=harness.read_text();marker='const {runNewDayJourney}=process.argv.includes("--transport")';assert original.count(marker)==1
harness.write_text(original.replace(marker,'const {runNewDayJourney}=process.argv.includes("--nominal-functional")?{runNewDayJourney:(await import("../validation/u00lFunctionalJourney")).runU00lFunctionalJourney}:process.argv.includes("--transport")'))
sha=lambda x:hashlib.sha256(x).hexdigest()
(out/'manifest.json').write_text(json.dumps({'ref':ref,'node':subprocess.check_output([shutil.which('node'),'--version'],text=True).strip(),'remoteWrites':0,'journeyBefore':sha(before.encode()),'journeyAfter':sha(s.encode()),'guard':sha((source/'supabase/migrations/112_main_nominal_resource_integrity.sql').read_bytes()),'interventions':['Main hard space window widened by ordinary API to 09:40–10:20','Only diagnostic day A','After a real proposal and Draft, forge Main/OUT times; recompute both JSON hashes and physical fingerprint','Invoke existing validation RPC under rollback; no Stage accepted']},indent=2))
node=shutil.which('node');env={**os.environ,'PATH':str(pathlib.Path(node).parent)+':'+os.environ['PATH'],'PLAYWRIGHT_BROWSERS_PATH':str(repo/'work/browsers'),'GIT_CEILING_DIRECTORIES':str(out)}
subprocess.run([node,'--import','tsx','script/demo/smokeNewDayIntegration.ts',str(out/'native'),'--nominal-functional'],cwd=source,env=env,check=True)

r=json.loads((out/'native/main-gap-probe.json').read_text())
assert r['canonical']['hardValid'] is False and r['canonical']['blockViolationCount']==1
assert r['accepted']==(args.expect=='accepted')
if args.expect=='rejected':assert 'MAIN_FLOW_CONTINUITY' in r['error']
print('PASS expected SQL Main gap boundary: '+args.expect,flush=True)
