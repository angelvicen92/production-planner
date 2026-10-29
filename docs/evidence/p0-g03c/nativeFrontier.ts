import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {jointCombinationSupported} from '../../../server/jointGroupStructure';
import {requiredPhaseCompositionSupported} from '../../../server/technicalChainStructure';

/** Native authoring only. SQL probes are read-only and introduce no authority. */
export async function frontier({appUrl,db,directory,pass,page,read,responseTo,save,planId,phaseTasks,phaseB,joint,last}:any){
 const {storage}=await import('../../../server/storage');
 const path=`/api/plans/${planId}/effective-configuration`,config=`/api/plans/${planId}/day-configuration`;
 const phases=[phaseTasks.map((t:any)=>t.id),phaseB.map((t:any)=>t.id),[joint[0].id,last.id]];
 const before=await buildEngineInput(planId,storage);save('native-before-input',before);
 assert.equal(before.tasks.length,65);assert.equal(adapt(before).status,'SUPPORTED');
 await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);let view=await read(path);
 const editor=page.getByTestId('daily-technical-chain');
 assert.equal(view.technicalChains.phasesSupported,true);
 await editor.getByRole('button',{name:'Crear cadena técnica',exact:true}).click();await editor.getByLabel('Orden por fases',{exact:true}).check();
 for(let p=0;p<phases.length;p++){
  if(p)await editor.getByRole('button',{name:'Añadir fase',exact:true}).click();
  for(const id of phases[p])await editor.getByLabel(`Fase ${p+1}: ${view.technicalChains.tasks.find((t:any)=>t.id===id).label}`,{exact:true}).check();
 }
 save('native-phase-save',await responseTo(config,'PUT',()=>editor.getByRole('button',{name:'Guardar cadena técnica',exact:true}).click()));
 await page.reload();view=await read(path);save('native-effective',view);
 const jointEditor=page.getByTestId('daily-joint-groups');
 assert.equal(view.jointGroups.supported,false);
 assert.equal(await jointEditor.getByRole('button',{name:'Crear operación conjunta',exact:true}).isEnabled(),false);
 await jointEditor.screenshot({path:directory+'/joint-frontier.png'});
 const input=await buildEngineInput(planId,storage);save('native-input',input);
 assert.equal(jointCombinationSupported(input),false);assert.equal(requiredPhaseCompositionSupported(input),true);
 const structure={contractVersion:1,groups:[{id:'probe-joint',taskIds:joint.map((t:any)=>t.id)}]};
 let error:any;await db.query('BEGIN READ ONLY');
 try{await db.query('SELECT public.assert_daily_joint_groups($1,$2)',[planId,structure]);}
 catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
 assert.equal(error?.code,'P0001');save('native-sql-readonly-rejection',{structure,error,readOnly:true,authorityInserted:false});
 const resources=input.planResourceItems.map(r=>({id:r.id,name:r.name,start:r.availabilityStart??null,end:r.availabilityEnd??null}));
 const eva=resources.find(r=>r.name==='EVA')!;assert.equal(eva.start,null);assert.equal(eva.end,null);
 await page.goto(`${appUrl}/plans/${planId}?tab=resources`);const daily=page.getByTestId('day-resources');await daily.waitFor();
 // Expand native resource type sections so absence is not inferred from a closed panel.
 for(const button of await daily.locator('button[data-day-section-trigger]').all())if(await button.getAttribute('aria-expanded')==='false')await button.click();
 const dailyControls=await daily.locator('input,select,button').evaluateAll((els:any[])=>els.map(e=>({tag:e.tagName,type:e.type,label:e.getAttribute('aria-label'),title:e.getAttribute('title'),text:e.tagName==='BUTTON'?e.textContent:null})));
 assert.equal(await daily.locator('input[type="time"]').count(),0);
 writeFileSync(directory+'/daily-resources-dom.txt',await daily.innerText());await daily.screenshot({path:directory+'/daily-resources.png'});
 await page.goto(appUrl+'/settings');await page.getByRole('tab',{name:/recursos|resources/i}).click();
 await page.locator('button[title="Expandir todos"]:visible').click();
 const catalogTimeControls=await page.locator('input[type="time"]').count();
 assert.equal(catalogTimeControls,0);writeFileSync(directory+'/catalog-resources-dom.txt',await page.locator('body').innerText());await page.screenshot({path:directory+'/catalog-resources.png',fullPage:true});
 save('native-resource-authoring',{resources,evaRequiredWindow:{start:'16:00',end:'21:00'},dailyTimeControls:0,catalogTimeControls,dailyControls,resourceWindowsAuthored:false});
 save('native-sql-state',{plans:(await db.query('SELECT id,daily_technical_chains,daily_joint_groups,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows,
  stages:(await db.query('SELECT ordinal,snapshot_fingerprint FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY id',[planId])).rows,
  runs:(await db.query("SELECT id,status,assisted_result_json->>'outcome' AS outcome FROM planning_runs WHERE plan_id=$1 ORDER BY id",[planId])).rows,
  resources:(await db.query('SELECT id,name,availability_start,availability_end FROM plan_resource_items WHERE plan_id=$1 ORDER BY id',[planId])).rows});
 pass('G03c: native 65 obligations and three phases; joint guard and SQL reject; EVA time-window editor absent');
 return {status:'DIAGNOSTIC_ONLY',planId,obligations:65,phases:phases.map(p=>p.length),jointAuthoritySaved:false,newAcceptedStages:0,resourceWindowAuthorable:false,remoteWrites:0};
}
