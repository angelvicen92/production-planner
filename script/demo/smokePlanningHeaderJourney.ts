/** UI-06: owned PostgreSQL/Auth/PostgREST, actual HTTP and Chromium. No remote writes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import type pg from "pg";

type Options = { appUrl:string; baselineUrl?:string; db:pg.Client; users:Record<string,{id:string;email:string;password:string;token:string}>; directory:string;planId:number;pass:(s:string)=>void;restUrl:string;anon:string };
export async function runPlanningHeaderJourney({appUrl,baselineUrl,db,users,directory,planId,pass,restUrl,anon}:Options) {
  assert.equal(new URL(appUrl).hostname,"127.0.0.1");assert.ok(baselineUrl,"UI06_BASELINE_ROOT required");
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  const report:any={status:"RUNNING",remoteWrites:0,checks:[],screenshots:[],operationalWrites:[]};
  const errors:string[]=[];
  const page=await browser.newPage({viewport:{width:1600,height:1100}});page.on("pageerror",e=>errors.push(e.message));
  const record=(s:string)=>{report.checks.push(s);pass(`UI-06 ${s}`);};
  const path=`/api/plans/${planId}/header-notes`;
  const api=(role:string,method="GET",suffix="",body?:unknown)=>fetch(`${appUrl}${path}${suffix}`,{method,headers:{Authorization:`Bearer ${users[role].token}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
  const tables=["plans","daily_tasks","plan_breaks","locks","assisted_planning_sessions","assisted_planning_stages","planning_stage_validations","planning_runs","plan_config_revisions","planning_accepted_exceptions","plan_resource_items","plan_zone_resource_assignments","plan_space_resource_assignments","plan_staff_assignments","plan_zone_staff_mode"];
  const material=async()=>{const rows:any={};for(const table of tables)rows[table]=(await db.query(`SELECT to_jsonb(t) row,xmin::text version FROM ${table} t WHERE ${table==="plans"?"id":"plan_id"}=$1 ORDER BY to_jsonb(t)::text`,[planId])).rows;return JSON.stringify(rows);};
  const digest=(text:string)=>createHash("sha256").update(text).digest("hex");
  const before=await material();report.operationalBeforeSha256=digest(before);
  const panel=(target=page)=>target.getByTestId("planning-panel-spaces");
  const header=(type:string,id:number,target=page)=>panel(target).locator(`[data-header-scope="${type}:${id}"]`);
  const capture=async(name:string,target=page)=>{await target.screenshot({path:`${directory}/${name}.png`});report.screenshots.push(`${name}.png`);};
  const login=async(target:Page,role:string,origin=appUrl)=>{
    target.setDefaultTimeout(30000);target.setDefaultNavigationTimeout(120000);
    await target.goto(`${origin}/login`);await target.getByLabel("Email",{exact:true}).fill(users[role].email);await target.getByLabel("Contraseña (opcional para enlace)",{exact:true}).fill(users[role].password);
    await target.getByRole("button",{name:"Entrar con contraseña",exact:true}).click();await target.waitForURL("**/dashboard");await target.goto(`${origin}/plans/${planId}?tab=planning`);
    await target.getByTestId("planning-multiview").waitFor();await target.getByRole("button",{name:"Mostrar Platós y espacios",exact:true}).click();await panel(target).waitFor();
  };
  const focus=async(text:string,target=page)=>{
    const p=panel(target);await p.getByRole("button",{name:/^Filtros/}).click();await p.getByRole("button",{name:"Mostrar todos",exact:true}).click();
    const hide=p.locator('label').filter({hasText:'Ocultar vacíos'}).getByRole('checkbox');if(!await hide.isChecked())await hide.click();
    await p.getByLabel("Buscar en Platós y espacios",{exact:true}).fill(text);
    for(const checkbox of await p.locator('label').filter({hasText:text}).getByRole("checkbox").all()) if(!await checkbox.isChecked())await checkbox.click();
    await p.getByRole("button",{name:/^Filtros/}).click();
  };
  const geometry=async()=>{
    const result=await panel().evaluate(root=>{
      const columns=Array.from(root.querySelectorAll<HTMLElement>('[data-planning-column]'));
      const origins=columns.flatMap(c=>{const canvas=c.querySelector<HTMLElement>(':scope > .relative.border');return canvas?[Math.round(canvas.getBoundingClientRect().top)]:[];});
      const clipped=Array.from(root.querySelectorAll<HTMLElement>('.planning-heading-content')).filter(c=>c.getBoundingClientRect().height>c.parentElement!.getBoundingClientRect().height+1).length;
      return {origins,clipped};
    });assert.equal(result.clipped,0);assert.ok(result.origins.length>0);assert.ok(Math.max(...result.origins)-Math.min(...result.origins)<=2,JSON.stringify(result));
  };
  const saveUI=async(type:string,id:number,lines:{label:string;text:string}[])=>{
    await header(type,id).getByRole('button',{name:/Editar cabecera/}).click();const dialog=page.getByTestId('header-notes-editor');await dialog.waitFor();
    for(const line of lines){await dialog.getByRole('button',{name:'Añadir línea',exact:true}).click();const group=dialog.locator('fieldset').last();await group.getByLabel('Etiqueta opcional').fill(line.label);await group.getByLabel('Texto',{exact:true}).fill(line.text);}
    const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith(`${path}/${type}/${id}`)&&r.request().method()==='PUT'),dialog.getByRole('button',{name:'Guardar indicaciones',exact:true}).click()]);assert.equal(response.status(),200,await response.text());await dialog.waitFor({state:'hidden'});
  };
  const audit=(request:any)=>{const p=new URL(request.url()).pathname;if(p.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method())&&p!=='/api/bootstrap-role'&&!p.startsWith(path))report.operationalWrites.push(`${request.method()} ${p}`);};
  try {
    const mapping=(await db.query('SELECT space_id,plan_resource_item_id FROM plan_space_resource_assignments WHERE plan_id=$1 ORDER BY space_id',[planId])).rows;
    report.explicitAssignments=mapping;
    report.sourceCharacteristics=(await db.query("SELECT (SELECT count(*) FROM plan_resource_items WHERE plan_id=$1)::int resources,(SELECT count(*) FROM plan_staff_assignments WHERE plan_id=$1)::int staff,(SELECT count(*) FROM daily_tasks WHERE plan_id=$1 AND assigned_resource_ids<>'[]'::jsonb)::int tasksWithDirectResources",[planId])).rows[0];
    assert.equal(mapping.length,6);
    const spaces=(await db.query('SELECT space_id id,name,zone_id FROM plan_space_settings WHERE plan_id=$1',[planId])).rows;
    const resourceNames=new Map((await db.query('SELECT id,name FROM plan_resource_items WHERE plan_id=$1',[planId])).rows.map(r=>[Number(r.id),r.name]));
    const p14=spaces.find(s=>Number(s.id)===3)!.zone_id;
    const totals=spaces.find(s=>Number(s.id)===33)!.zone_id;
    report.scopes={p14:Number(p14),totals:Number(totals)};
    // Read and write through actual authentication, with the same coarse plan roles.
    assert.equal((await fetch(`${appUrl}${path}`)).status,401);
    for(const role of ['aux','viewer','norole'])assert.equal((await api(role,'PUT','/space/3',{expectedVersion:0,lines:[{text:'No'}]})).status,403);
    for(const role of ['production','admin','aux','viewer'])assert.equal((await api(role)).status,200);
    assert.equal((await api('norole')).status,403);
    assert.equal((await fetch(`${appUrl}${path.replace('/plans/','/PLANS/')}`,{headers:{Authorization:`Bearer ${users.norole.token}`}})).status,403);
    await assert.rejects(() => db.query('SELECT save_planning_header_notes($1,$2,$3,$4,$5,$6)', [planId,users.production.id,'space',9999999,0,JSON.stringify([{text:'No'}])]), /HEADER_INVALID_SCOPE/);
    assert.equal((await api('production','PUT','/space/9999999',{expectedVersion:0,lines:[{text:'No'}]})).status,400);
    assert.equal((await api('production','PUT','/space/3',{expectedVersion:0,lines:[{text:'x'.repeat(4001)}]})).status,400);
    record('API 401/403, four authorized read roles, invalid daily scope and text length');
    const baseline=await browser.newPage({viewport:{width:1600,height:1100}});
    try {await login(baseline,'production',baselineUrl!);await focus('Plató 14',baseline);await panel(baseline).getByRole('button',{name:'Maximizar',exact:true}).click();await capture('headers-before-p14',baseline);await baseline.keyboard.press('Escape');await focus('Totales',baseline);await panel(baseline).getByRole('button',{name:'Maximizar',exact:true}).click();await capture('headers-before-totales',baseline);}finally{await baseline.close();}
    await login(page,'production');page.on('request',audit);
    await focus('Plató 14');
    for(const row of mapping){const h=header('space',Number(row.space_id));if(await h.count())assert.ok((await h.innerText()).includes(resourceNames.get(Number(row.plan_resource_item_id))));}
    const assignedId=(space:number)=>Number(mapping.find(row=>Number(row.space_id)===space)!.plan_resource_item_id);
    for(const id of [3,31])assert.equal(await header('space',id).locator(`[data-header-resource-id="${assignedId(id)}"]`).count(),1);
    assert.equal(await header('space',32).locator(`[data-header-resource-id="${assignedId(3)}"]`).count(),0);
    assert.match(await header('space',3).innerText(),/Prod \(zona\): —/);
    assert.match(await header('space',3).innerText(),/Red \(zona\): —/);
    await geometry();
    await panel().getByRole('button',{name:'Maximizar',exact:true}).click();await capture('headers-after-p14');await page.keyboard.press('Escape');
    await focus('Totales');for(const id of [33,34])assert.equal(await header('space',id).locator(`[data-header-resource-id="${assignedId(id)}"]`).count(),1);
    await panel().getByRole('button',{name:'Maximizar',exact:true}).click();await capture('headers-after-totales');await page.keyboard.press('Escape');
    await focus('Plató 15');for(const id of [43,103030])assert.equal(await header('space',id).locator(`[data-header-resource-id="${assignedId(id)}"]`).count(),1);
    record('six actual A2 space cameras, no spurious Giratuto camera, Prod/Red empty and baseline/candidate captures');
    await focus('Plató 14');
    const longText='Preparar cambio de micro.\n'+('Material de producción con detalle y nombres completos. ').repeat(12)+'\n<script>texto plano</script>';
    await saveUI('zone',Number(p14),[{label:'Sonido',text:'Sin sonido'},{label:'Indicaciones',text:longText}]);
    const longSpaceText='Tablet con vídeo preparada.\n'+('Material con nombres completos y detalle operativo. ').repeat(55);
    await saveUI('space',3,[{label:'Material',text:longSpaceText},{label:'Responsable',text:'Consultar con dirección.'}]);
    await page.waitForFunction(()=>document.querySelector('[data-testid="planning-panel-spaces"] [data-tall-headers="true"]')!==null);
    const reachable=await panel().evaluate(root=>{const viewport=root.querySelector<HTMLElement>('.planning-scroll-viewport')!;const tasks=root.querySelector<HTMLElement>('[data-planning-column] > .relative.border')!;viewport.scrollTop=tasks.offsetTop;return viewport.scrollHeight>viewport.clientHeight;});assert.ok(reachable);
    assert.equal(await header('zone',Number(p14)).locator('script').count(),0);
    assert.match(await header('zone',Number(p14)).innerText(),/texto plano/);await geometry();
    await capture('headers-notes-long');
    await header('space',3).getByRole('button',{name:/Editar cabecera/}).click();let dialog=page.getByTestId('header-notes-editor');
    await dialog.getByRole('button',{name:'Subir línea 2',exact:true}).click();await dialog.locator('fieldset').first().getByLabel('Texto',{exact:true}).fill('Consultar con dirección actualizada.');
    await dialog.getByRole('button',{name:'Eliminar línea 2',exact:true}).click();await dialog.getByRole('button',{name:'Guardar indicaciones',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await page.reload();await panel().waitFor();await header('space',3).getByText('Consultar con dirección actualizada.',{exact:false}).waitFor();
    assert.equal(await header('space',3).locator('[data-header-note]').count(),1);
    assert.equal(await header('zone',Number(p14)).locator('[data-header-note]').count(),2);
    await header('space',3).getByRole('button',{name:/Editar cabecera/}).click();dialog=page.getByTestId('header-notes-editor');assert.equal(await dialog.locator('fieldset').count(),1);await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
    await page.getByRole('button',{name:'Planning aceptado · ejecución',exact:true}).click();await header('space',3).getByText('Consultar con dirección actualizada.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Edición del borrador',exact:true}).click();
    record('zone/space notes: add, long multiline plain text, scroll past tall headers, reorder, edit, delete, save, reload, reopen and accepted/draft without scope leakage');
    const second=await browser.newPage({viewport:{width:1440,height:1000}});
    try {await login(second,'viewer');await focus('Plató 14',second);assert.equal(await second.getByRole('button',{name:/Editar cabecera/}).count(),0);
      const rows:any[]=await (await api('admin')).json();const note=rows.find(r=>r.scopeType==='space'&&r.scopeId===3);
      const writes=await Promise.all(['admin','production'].map(role=>api(role,'PUT','/space/3',{expectedVersion:note.version,lines:[{label:'Responsable',text:'Sincronizado en otra sesión'}]})));
      assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);
      await header('space',3,second).getByText('Sincronizado en otra sesión',{exact:false}).waitFor({timeout:25000});
    }finally{await second.close();}
    record('viewer has no editor; shared polling synchronizes another authenticated session; CAS admits one of two concurrent saves');
    // Direct REST access verifies RLS/grants independently of the Express service-role boundary.
    for(const role of ['admin','production','aux','viewer','norole']){
      const headers={apikey:anon,Authorization:`Bearer ${users[role].token}`,'Content-Type':'application/json'};
      const r=await fetch(`${restUrl}/rest/v1/plan_header_notes?plan_id=eq.${planId}`,{headers});assert.equal(r.status,200);const rows:any[]=await r.json();assert.equal(rows.length,role==='norole'?0:2);
      assert.ok([401,403].includes((await fetch(`${restUrl}/rest/v1/plan_header_notes?plan_id=eq.${planId}`,{method:'PATCH',headers,body:JSON.stringify({lines:[]})})).status));
      assert.ok([401,403].includes((await fetch(`${restUrl}/rest/v1/rpc/save_planning_header_notes`,{method:'POST',headers,body:JSON.stringify({p_plan:planId,p_actor:users.admin.id,p_scope:'zone',p_scope_id:p14,p_version:1,p_lines:[]})})).status));
    }
    assert.ok([401,403].includes((await fetch(`${restUrl}/rest/v1/plan_header_notes`,{headers:{apikey:anon}})).status));
    record('native RLS: four authorized roles read, no-role sees no rows, anon denied; all authenticated direct writes and forged RPC actors denied');
    await focus('Plató 14');await panel().getByRole('button',{name:'Lista',exact:true}).click();await geometry();
    await panel().getByRole('button',{name:'Timeline',exact:true}).click();await panel().getByRole('button',{name:'Ampliar zoom',exact:true}).click();await geometry();
    await panel().getByRole('button',{name:'Maximizar',exact:true}).click();await panel().getByRole('button',{name:'Ajustar',exact:true}).click();await geometry();await capture('headers-notes-maximized');await page.keyboard.press('Escape');
    await panel().getByLabel('Densidad',{exact:true}).selectOption('pdf');await geometry();await capture('headers-notes-pdf');
    for(const axis of ['x','y']){await panel().getByLabel('Eje del zoom',{exact:true}).selectOption(axis);await panel().getByRole('button',{name:'Ampliar zoom',exact:true}).click();await geometry();}
    await panel().getByLabel('Eje del zoom',{exact:true}).selectOption('linked');await panel().getByRole('button',{name:'Restaurar zoom al 100%',exact:true}).click();
    await panel().getByRole('button',{name:/^Filtros/}).click();await panel().getByText('Ocultar vacíos',{exact:true}).click();await panel().getByRole('button',{name:/^Filtros/}).click();await geometry();
    await page.getByRole('button',{name:'Mostrar Recursos',exact:true}).click();
    const teamHeaders=page.getByTestId('planning-panel-resources').locator('[data-header-scope^="itinerant_team:"]');
    const memberships=(await db.query('SELECT planner_next_configuration FROM plans WHERE id=$1',[planId])).rows[0].planner_next_configuration.itinerantTeamAvailability;
    for(const team of memberships){const h=page.getByTestId('planning-panel-resources').locator(`[data-header-scope="itinerant_team:${team.itinerantTeamId}"]`);assert.match(await h.innerText(),/Miembro del equipo/);for(const id of team.planResourceItemIds)assert.equal(await h.locator(`[data-header-resource-id="${id}"]`).count(),1);}
    const effectiveTeam=page.getByTestId('planning-panel-resources').locator(`[data-header-scope="itinerant_team:${memberships[0].itinerantTeamId}"]`);
    await page.getByRole('button',{name:'Maximizar conjunto',exact:true}).click();await geometry();await capture('headers-notes-joint-maximized');await page.keyboard.press('Escape');
    const teamScope=(await effectiveTeam.getAttribute('data-header-scope'))!.split(':');
    const teamSave=await api('production','PUT',`/itinerant_team/${teamScope[1]}`,{expectedVersion:0,lines:[{label:'Material',text:'Equipo itinerante preparado.'}]});assert.equal(teamSave.status,200,await teamSave.text());
    await effectiveTeam.getByText('Equipo itinerante preparado.',{exact:false}).waitFor({timeout:25000});
    record('Timeline/List, filters, PDF density, independent X/Y zoom, fit, individual/joint maximization, aligned task origins and persisted itinerant headers');
    const after=await material();report.operationalAfterSha256=digest(after);assert.equal(after,before);assert.deepEqual(report.operationalWrites,[]);
    assert.equal((await db.query('SELECT count(*) n FROM daily_tasks WHERE plan_id=$1 AND start_planned IS NOT NULL',[planId])).rows[0].n,'266');
    report.scheduledTasks=266;report.equalIncludingXmin=true;report.protectedTables=tables;assert.deepEqual(errors,[]);report.status='PASS';record('266/266 preserved; full rows and xmin unchanged in 15 operational tables, no operational API writes');
    return report;
  } finally {if(report.status!=='PASS'){report.status='FAIL';await capture('headers-failure').catch(()=>{});}report.pageErrors=errors;writeFileSync(`${directory}/header-notes.json`,JSON.stringify(report,null,2));await browser.close();}
}
