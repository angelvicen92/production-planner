import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium,type Page} from 'playwright';
import type pg from 'pg';

type Options={appUrl:string;baselineUrl?:string;db:pg.Client;users:Record<string,{email:string;password:string;token:string}>;directory:string;planId:number;pass:(name:string)=>void};
/** Freshly generated, local-only A2. Visual actions must leave all operational rows unchanged. */
export async function runRealityScopeJourney({appUrl,baselineUrl,db,users,directory,planId,pass}:Options){
 assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const report:any={remoteWrites:0,checks:[],screenshots:[],visualWrites:[]};
 const material=async()=>JSON.stringify((await db.query(`SELECT to_jsonb(t) row,xmin::text version FROM assisted_planning_stages t WHERE plan_id=$1 ORDER BY id`,[planId])).rows);
 const before=await material();
 const api=await fetch(`${appUrl}/api/plans/${planId}/assisted`,{headers:{Authorization:`Bearer ${users.production.token}`}});assert.equal(api.status,200);
 const state:any=await api.json();const snapshot=state.activeStage.snapshotJson;
 const config=(await db.query('SELECT planner_next_configuration c FROM plans WHERE id=$1',[planId])).rows[0].c;
 const rows=new Map<number,any>(snapshot.tasks.map((task:any)=>[task.taskId,task]));
 const mobile=config.taskOperations.filter((operation:any)=>operation.agendaScope==='ITINERANT_UNIT');
 const anchors=config.anchoredAccompaniments.map((operation:any)=>operation.anchorTaskId);
 const login=async(page:Page,url:string)=>{
  page.setDefaultTimeout(30_000);page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${url}/login`);await page.getByLabel('Email',{exact:true}).fill(users.production.email);
  await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.production.password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  await page.goto(`${url}/plans/${planId}?tab=planning`);await page.getByTestId('planning-multiview').waitFor();
  await page.getByRole('button',{name:'Mostrar Platós y espacios',exact:true}).click();
 };
 const capture=async(page:Page,name:string)=>{await page.getByTestId('planning-panel-spaces').screenshot({path:`${directory}/${name}.png`});report.screenshots.push(`${name}.png`);};
 try{
  if(baselineUrl){const base=await browser.newPage({viewport:{width:1600,height:1100}});await login(base,baselineUrl);await capture(base,'reality-before');await base.close();}
  const page=await browser.newPage({viewport:{width:1600,height:1100}});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await login(page,appUrl);page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method()))report.visualWrites.push(`${request.method()} ${path}`);});
  const panel=()=>page.getByTestId('planning-panel-spaces');
  // Keep the panel's persisted all-location defaults, and compare every technical obligation.
  const verify=async()=>{
   const cards=panel().locator('[data-planning-task-id]');
   for(const op of mobile){const card=cards.locator(`xpath=self::*[@data-planning-task-id="${op.taskId}"]`);assert.equal(await card.count(),1,`one principal card ${op.taskId}`);
    assert.equal(await card.getAttribute('data-planning-team-id'),String(rows.get(op.taskId).itinerantTeamId??op.itinerantTeamId));
    assert.equal(await card.getAttribute('data-planning-agenda'),'ITINERANT_UNIT');
    assert.equal(await card.getAttribute('data-planning-space-id'),String(rows.get(op.taskId).spaceId));}
   for(const id of anchors)assert.equal(await panel().locator(`[data-planning-task-id="${id}"]`).getAttribute('data-planning-agenda'),'PHYSICAL_SPACE');
   assert.equal(await panel().locator('[data-physical-occupation-task-id]').count(),mobile.length);
  };
  await verify();await capture(page,'reality-after-timeline');
  await panel().getByLabel('Densidad',{exact:true}).selectOption('pdf');await verify();await capture(page,'reality-after-pdf');
  await panel().getByLabel('Densidad',{exact:true}).selectOption('normal');
  await panel().getByRole('button',{name:'Lista',exact:true}).click();await verify();await capture(page,'reality-after-list');
  await page.getByRole('button',{name:'Planning aceptado · ejecución',exact:true}).click();await verify();
  await panel().getByRole('button',{name:'Timeline',exact:true}).click();await verify();
  await panel().getByRole('button',{name:'Maximizar',exact:true}).click();await verify();await capture(page,'reality-after-maximized');await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);assert.deepEqual(report.visualWrites,[]);assert.equal(await material(),before);
  report.status='PASS';report.mobileObligations=mobile.length;report.totalObligations=snapshot.tasks.length;
  report.selectedTeams=mobile.map((op:any)=>({taskId:op.taskId,itinerantTeamId:rows.get(op.taskId).itinerantTeamId??op.itinerantTeamId}));
  pass('Reality agendas: single principal cards, physical anchors, real location, selected teams, Timeline/List/accepted/maximized, immutable Stages');
 }finally{await browser.close();writeFileSync(`${directory}/reality-scope.json`,JSON.stringify(report,null,2));}
 return report;
}
