// Focal real-component tests with isolated identity and intercepted HTTP.
// No production server, database or planner is modified.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = process.cwd(), output = path.resolve('work/native-dialogs-browser');
mkdirSync(output, { recursive: true });
const harness = path.join(output, 'harness.tsx');
writeFileSync(harness, `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '@/lib/queryClient';
import {ConfirmDialogProvider, useConfirm, useDialogInput} from '@/components/ui/confirm-dialog';
import {TooltipProvider} from '@/components/ui/tooltip';
import {AssistedPlanningWorkspace} from '@/components/planning/assisted-planning-workspace';
import {ZonesSpacesSettings} from '@/pages/settings';
import {TaskStatusMenuTrigger} from '@/components/planning-timeline';
import '@/i18n'; import '@/index.css';
window.refreshAssisted=()=>queryClient.refetchQueries({queryKey:['assisted-planning',1]});
const params=new URLSearchParams(location.search), mode=params.get('mode');
window.results=[];window.writes=[];
function Probe(){const confirm=useConfirm(),input=useDialogInput();return <>
<button onClick={async()=>window.results.push(await confirm({title:'Primera confirmación'}))}>Confirmar prueba</button>
<button onClick={()=>{confirm({title:'Primera concurrente'}).then(v=>window.results.push(['primera',v]));confirm({title:'Segunda concurrente'}).then(v=>window.results.push(['segunda',v]));}}>Concurrentes</button>
<button onClick={()=>input({title:'Entrada de prueba',label:'Valor',validate:v=>v.trim()?null:'Escribe un valor.',onSubmit:async v=>{window.writes.push(v);await new Promise(r=>setTimeout(r,300));if(v==='fallo')throw Error('RAW_SECRET');}}).then(v=>window.results.push(v))}>Entrada</button>
<button onClick={()=>{confirm({title:'Pendiente al desmontar'}).then(v=>window.results.push(v));setTimeout(()=>window.unmount(),100);}}>Desmontar</button>
</>}
const plan={id:1,date:'2026-10-20',workStart:'09:00',workEnd:'19:00',dailyTasks:[]};
const task={id:1,status:'pending',isManualBlock:true,manualTitle:'Bloqueo manual',template:{name:'Bloqueo manual'},startPlanned:'10:00',endPlanned:'10:30'};
function App(){const [visible,setVisible]=useState(true);window.unmount=()=>setVisible(false);return <QueryClientProvider client={queryClient}><TooltipProvider>{visible&&<ConfirmDialogProvider>{mode==='assisted'?<AssistedPlanningWorkspace planId={1} plan={plan} timelineProps={{contestants:[]}}/>:mode==='spaces'?<ZonesSpacesSettings resourceTypesQ={{data:[]}}/>:mode==='duration'?<TaskStatusMenuTrigger task={task} contestantName="" locationLabel="" className="p-8" onTaskStatusChange={async()=>{}} onSetManualBlockDuration={async(t,d)=>{window.writes.push(d);await new Promise(r=>setTimeout(r,300));}}>Bloqueo manual</TaskStatusMenuTrigger>:<Probe/>}</ConfirmDialogProvider>}</TooltipProvider></QueryClientProvider>}
createRoot(document.getElementById('root')).render(<App/>);`);
const server = await createServer({ configFile:false, root:path.join(root,'client'), cacheDir:path.join(output,'vite'),
  plugins:[{name:'focal-dialog-fixtures',enforce:'pre',transform(code,id){
    if(id.endsWith('/hooks/use-auth.tsx'))return `export function useAuth(){return {user:{id:'dialog-actor'},isAuthenticated:true,isLoading:false}};`;
    if(id.endsWith('/pages/settings.tsx'))return code+'\nexport {ZonesSpacesSettings};';
    if(id.endsWith('/components/planning-timeline.tsx'))return code+'\nexport {TaskStatusMenuTrigger};';
  },configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/dialog-fixture'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url, `<html lang="es"><body><div id="root"></div><script type="module" src="/@vite/client"></script><script type="module" src="/@fs${harness}"></script></body></html>`));});}},react()],
  resolve:{alias:{'@':path.join(root,'client/src'),'@shared':path.join(root,'shared'),'@assets':path.join(root,'attached_assets')}},
  define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://127.0.0.1:54321'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('local-ui-fixture')},
  server:{host:'127.0.0.1',port:5191,strictPort:true,fs:{allow:[root]}} });
await server.listen();
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:900}}), errors=[], native=[], requests=[];
page.setDefaultTimeout(12000);
page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER',e.message);});page.on('dialog',async d=>{native.push(d.type());await d.dismiss();});
const snapshot={contractVersion:1,tasks:[],planningBlocks:[],operationalMeals:[],setupPreparations:[],roundPreparations:[]};
let role='admin', hard=false, required=false, revision=1;
const state=()=>({session:{id:1,status:'ACTIVE'},activeStage:{id:1,parentStageId:null,ordinal:0,snapshotFingerprint:'draft-'+revision,snapshotJson:snapshot},draft:snapshot,draftFingerprint:'draft-'+revision,draftBaseStageId:1,currentConfigRevisionId:1,history:[],acceptedExceptions:[],validation:{id:1,draftFingerprint:'draft-'+revision,baseStageId:1,configRevisionId:1,hardCount:hard?1:0,requiredCount:required?1:0,reportJson:{violations:(hard||required)?[{severity:hard?'HARD':'REQUIRED',ruleCode:'OVERLAP_VIOLATION',affectedTaskIds:[]}]:[]}}});
await page.route('**/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname;let body=[];
  if(req.method()!=='GET'){requests.push({path:p,body:req.postDataJSON()});await new Promise(r=>setTimeout(r,150));body={id:2,...req.postDataJSON()};}
  else if(p==='/api/me/role')body={role};
  else if(p==='/api/plans/1/assisted')body=state();
  else if(p==='/api/plans/1/assisted/next-scope')body={selector:null,taskIds:[],expectedDraftFingerprint:'draft-1',expectedBaseStageId:1};
  else if(p==='/api/plans/1')body={id:1,dailyTasks:[]};
  else if(p==='/api/zones')body=[{id:1,name:'Plató principal'}];
  else if(p==='/api/spaces')body=[{id:1,zoneId:1,name:'Sala principal',parentSpaceId:null}];
  else if(p.includes('program-settings'))body={};
  await route.fulfill({json:body});
});
const go=mode=>page.goto(`http://127.0.0.1:5191/dialog-fixture?mode=${mode}`);
const button=name=>page.getByRole('button',{name,exact:true});
const dialog=()=>page.getByRole('dialog');const alert=()=>page.getByRole('alertdialog');
const pass=s=>console.log('PASS '+s);
const capture=async name=>{await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:path.join(output,name)});};
try{
  await go('probe');
  await button('Confirmar prueba').click();await page.keyboard.press('Escape');await alert().waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.results),[false]);
  await button('Confirmar prueba').click();await button('Cancelar').click();
  await button('Confirmar prueba').click();await button('Confirmar').dblclick();assert.deepEqual(await page.evaluate(()=>window.results),[false,false,true]);pass('confirm accept once, cancel, Escape');
  await button('Concurrentes').click();await button('Confirmar').click();assert.deepEqual(await page.evaluate(()=>window.results.slice(-2)),[['segunda',false],['primera',true]]);pass('overlap resolves correct callers');
  await button('Entrada').click();await button('Guardar').click();await page.getByRole('alert').waitFor();assert.equal((await page.evaluate(()=>window.writes)).length,0);
  await page.getByLabel('Valor',{exact:true}).fill('fallo');await button('Guardar').dblclick();await page.getByRole('alert').waitFor();assert.equal((await page.evaluate(()=>window.writes)).length,1);assert.doesNotMatch(await dialog().innerText(),/RAW_SECRET/);
  await page.getByLabel('Valor',{exact:true}).fill('correcto');await button('Guardar').click();await page.keyboard.press('Escape');assert.equal(await dialog().count(),1);await dialog().waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.writes),['fallo','correcto']);pass('input validation, double submit, error recovery, saving');
  await button('Entrada').click();await dialog().waitFor();await page.locator('.fixed.inset-0[data-state="open"]').click({position:{x:1,y:1}});await dialog().waitFor({state:'hidden'});assert.equal(await button('Entrada').evaluate(e=>e===document.activeElement),true);pass('outside cancels input and restores focus');
  await button('Desmontar').click();await alert().waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.results.at(-1)),false);pass('unmount settles pending promise');
  await go('assisted');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent==='Aceptar etapa'&&!e.matches(':disabled')));await button('Completar automáticamente').click();await alert().waitFor();await page.keyboard.press('Escape');assert.equal(requests.length,0);
  await button('Completar automáticamente').click();await alert().getByText('Puedes detener el proceso entre etapas.',{exact:false}).waitFor();await capture('autopilot.png');await button('Completar automáticamente').last().click();await page.locator('[data-testid=assisted-autopilot-progress][data-phase=COMPLETE]').first().waitFor();pass('real Assisted autopilot cancel and accept');
  await go('assisted');await button('Configuración y mantenimiento de la sesión').click();await button('Reiniciar Asistida').click();await button('Cancelar').click();assert.equal(requests.length,0);await button('Reiniciar Asistida').click();await button('Reiniciar').dblclick();await alert().waitFor({state:'hidden'});await page.waitForFunction(()=>!document.body.innerText.includes('Inicializando'));assert.equal(requests.filter(r=>r.path.endsWith('/restart')).length,1);assert.equal(requests.at(-1).body.confirmation,'RESTART_BOOTSTRAP');pass('real Assisted restart once with original guard');
  hard=true;role='production';await go('assisted');await page.getByTestId('assisted-hard-admin-required').waitFor();assert.equal(await button('Aceptar etapa').isDisabled(),true);
  role='admin';await go('assisted');await button('Aceptar etapa').click();await alert().locator('summary').click();await alert().getByText('Estas tareas no pueden coincidir',{exact:false}).waitFor();await capture('critical.png');await page.keyboard.press('Escape');assert.equal(requests.filter(r=>r.path.endsWith('/accept-stage')).length,0);await button('Aceptar etapa').click();await button('Aceptar con conflictos críticos').click();await alert().waitFor({state:'hidden'});assert.equal(requests.at(-1).body.confirmation,'HARD_EXCEPTIONS');pass('critical acceptance admin authority, Escape, explicit token');
  await go('assisted');await button('Aceptar etapa').click();revision=2;await page.evaluate(()=>window.refreshAssisted());await button('Aceptar con conflictos críticos').click();await alert().waitFor({state:'hidden'});assert.equal(requests.filter(r=>r.path.endsWith('/accept-stage')).length,1);pass('changed draft invalidates open critical consent');
  hard=false;required=true;role='production';await go('assisted');await button('Aceptar etapa').click();await button('Aceptar con desviaciones').click();await alert().waitFor({state:'hidden'});assert.equal(requests.at(-1).body.confirmation,'REQUIRED_DEVIATIONS');pass('production explicitly accepts required deviations');
  await go('spaces');await button('+ Espacio raíz').click();await button('Crear espacio').click();await page.getByRole('alert').waitFor();await page.getByLabel('Nombre del espacio',{exact:true}).fill('  Sala nueva  ');await capture('space.png');await button('Crear espacio').dblclick();await dialog().waitFor({state:'hidden'});assert.equal(requests.filter(r=>r.path==='/api/spaces').length,1);assert.equal(requests.at(-1).body.name,'Sala nueva');pass('real space creation validates and saves trimmed name once');
  await button('+ Espacio raíz').click();await page.getByLabel('Nombre del espacio',{exact:true}).fill('Cancelado');await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});assert.equal(requests.filter(r=>r.path==='/api/spaces').length,1);
  await button('+ Subespacio').first().click();await page.getByLabel('Nombre del subespacio',{exact:true}).fill('Subespacio nuevo');await button('Crear subespacio').click();await dialog().waitFor({state:'hidden'});assert.equal(requests.at(-1).body.parentSpaceId,1);pass('space Escape cancels and subspace preserves parent');
  await page.setViewportSize({width:390,height:844});await go('duration');await button('Bloqueo manual').click();await button('Cambiar duración (min)').click();assert.equal(await page.getByLabel('Duración (minutos)',{exact:true}).inputValue(),'30');await page.getByLabel('Duración (minutos)',{exact:true}).fill('4');await button('Guardar').click();await page.getByRole('alert').waitFor();assert.deepEqual(await page.evaluate(()=>window.writes),[]);await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>window.writes),[]);
  await dialog().waitFor({state:'hidden'});await button('Bloqueo manual').click();await button('Cambiar duración (min)').click();await page.getByLabel('Duración (minutos)',{exact:true}).fill('45.4');await capture('duration-mobile.png');assert.equal(await dialog().evaluate(e=>e.getBoundingClientRect().width<=innerWidth),true);await button('Guardar').dblclick();await dialog().waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.writes),[45]);pass('real duration default, validation, Escape, rounding and single async save on mobile');
  assert.deepEqual(native,[]);assert.deepEqual(errors,[]);pass('zero native dialogs and browser errors');
}catch(error){await page.screenshot({path:path.join(output,'failure.png')});writeFileSync(path.join(output,'failure.txt'),await page.locator('body').innerText());throw error;}finally{await browser.close();await server.close();}
