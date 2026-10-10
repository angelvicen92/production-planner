import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { generateGlobalCandidate } from './globalCandidate';
import { fourParticipants,sixParticipants } from '../diagnostics/asst010JointComponentFixtures';
const mode=process.argv[2]??'fixtures',directory=process.argv[3]??'work/global-candidate';mkdirSync(directory,{recursive:true});
const python=process.env.OPTIPLAN_EXPERIMENT_PYTHON??'work/cpsat-venv/bin/python';
if(mode==='fixtures'){
 const reports=[];
 for(const count of [4,6] as const){const {refreshed:source,fixed}=count===4?fourParticipants():sixParticipants();const r=await generateGlobalCandidate(source,fixed,[],{python,timeoutMs:10_000,directory:`${directory}/${count}`});
  reports.push({count,...r});console.log(JSON.stringify({count,outcome:r.outcome,stopReason:r.stopReason,wallMs:r.wallMs,solver:r.solver?.status,violations:r.validation?.reasonCodes}));
  if(r.outcome!=='CERTIFIED_EXPERIMENTAL_COMPLETION')break;
 }writeFileSync(`${directory}/fixtures.json`,JSON.stringify(reports,null,2));
 if(reports.length!==2||reports.some(r=>r.outcome!=='CERTIFIED_EXPERIMENTAL_COMPLETION'))process.exitCode=1;
}else{
 const {source,protectedTasks,protectedOperationalMeals}=JSON.parse(readFileSync(mode,'utf8'));
 // Deliberately select only current source and literal protections. No priorJoint/witness fields cross the compiler boundary.
 const r=await generateGlobalCandidate(source,protectedTasks,protectedOperationalMeals,{python,timeoutMs:30_000,directory});
 writeFileSync(`${directory}/report.json`,JSON.stringify(r,null,2));
 console.log(JSON.stringify({outcome:r.outcome,stopReason:r.stopReason,wallMs:r.wallMs,solver:r.solver?.status,branches:r.solver?.branches,violations:r.validation?.reasonCodes?.slice(0,12)}));
}
