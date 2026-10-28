import assert from 'node:assert/strict';
import { chromium, type Page, type Locator } from 'playwright';
import { writeFileSync } from 'node:fs';
import { journey as composedJourney } from '../p0-u02d/journey';

/** Real Chromium producer; the existing U02d journey retains every assertion and SQL attack. */
export async function journey(context: any) {
 const {appUrl, users, db, directory, pass} = context;
 const save = (name: string, value: unknown) => writeFileSync(`${directory}/${name}.json`, JSON.stringify(value, null, 2));
 if (process.argv.includes('--api-baseline')) {
  const result = await composedJourney(context);
  save('g01-sql-template-snapshots', (await db.query("SELECT plan_id,source_template_id,resource_requirements,to_jsonb(t)-'created_at'-'updated_at' AS operational_snapshot FROM plan_task_template_snapshots t ORDER BY plan_id,source_template_id")).rows);
  return result;
 }
 const browser = await chromium.launch({headless: true, args: ['--no-sandbox'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium'});
 const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
 const receipts: any[] = [], errors: string[] = [];
 page.on('pageerror', error => errors.push(error.message));
 const request = async(path: string, method = 'GET', body?: any, role = 'admin') => {
  const response = await fetch(appUrl + path, {method, headers: {'Content-Type': 'application/json', Authorization: `Bearer ${users[role].token}`}, body: body === undefined ? undefined : JSON.stringify(body)});
  const result = {status: response.status, body: await response.json()}; receipts.push({path, method, request: body, role, response: result}); return result;
 };
 const api = async(path: string, method = 'GET', body?: any) => {const r = await request(path, method, body); assert.ok(r.status < 300, JSON.stringify(r)); return r.body;};
 const login = async(p: Page, role: string) => {
  await p.goto(appUrl + '/login'); await p.getByLabel('Email', {exact: true}).fill(users[role].email);
  await p.getByLabel('Contraseña (opcional para enlace)', {exact: true}).fill(users[role].password);
  await p.getByRole('button', {name: 'Entrar con contraseña', exact: true}).click(); await p.waitForURL('**/dashboard');
 };
 const settings = async(p = page) => {await p.goto(appUrl + '/settings'); await p.getByRole('tab', {name: /plantillas|templates/i}).click();};
 const edit = async(id: number, p = page) => {
  await settings(p); const card = p.getByTestId(`task-template-${id}`); await card.getByRole('button', {name: 'Editar', exact: true}).click();
  await card.getByTestId('template-specific-resources').getByLabel('Recurso físico específico').waitFor(); return card;
 };
 const add = async(card: Locator, id: number) => {
  const editor = card.getByTestId('template-specific-resources');
  await editor.getByLabel('Recurso físico específico').selectOption(String(id)); await editor.getByRole('button', {name: 'Añadir recurso', exact: true}).click();
 };
 const store = async(card: Locator, id: number, expectedStatus = 200) => {
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === `/api/task-templates/${id}/save-with-inverse` && r.request().method() === 'POST');
  await card.getByRole('button', {name: 'Guardar', exact: true}).click(); const response = await pending;
  const body = await response.json(); receipts.push({path: new URL(response.url()).pathname, request: response.request().postDataJSON(), response: {status: response.status(), body}, producer: 'CHROMIUM'});
  assert.equal(response.status(), expectedStatus, JSON.stringify(body));
  if (expectedStatus === 200) await card.getByRole('button', {name: 'Editar', exact: true}).waitFor();
  return body;
 };
 try {
  await login(page, 'admin');
  // The API defines all other pre-existing U02d authorities. Only its nonempty byItem
  // declarations move to the UI producer. Resource/catalog/day IDs remain identical.
  const authored: any[] = [];
  const integrated = await composedJourney({...context, authorTemplateResources: async(payload: any, create: (body: any) => Promise<any>) => {
   const {resourceRequirements, ...other} = payload;
   const template = await create(other);
   const card = await edit(template.id);
   for (const [id, quantity] of Object.entries(resourceRequirements.byItem)) {assert.equal(quantity, 1); await add(card, Number(id));}
   const saved = await store(card, template.id);
   assert.deepEqual(saved.resourceRequirements, resourceRequirements);
   const loaded = (await api('/api/task-templates')).find((t: any) => t.id === template.id);
   assert.deepEqual(loaded.resourceRequirements, resourceRequirements);
   authored.push({id: template.id, name: template.name, expected: resourceRequirements, reloaded: loaded.resourceRequirements}); save('g01-integrated-ui-templates', authored);
   return saved;
  }});
  assert.ok(authored.length > 0);
  save('g01-sql-template-snapshots', (await db.query("SELECT plan_id,source_template_id,resource_requirements,to_jsonb(t)-'created_at'-'updated_at' AS operational_snapshot FROM plan_task_template_snapshots t ORDER BY plan_id,source_template_id")).rows);
  pass('G01: UI byItem producer through unchanged U02d integrated SQL Stages');

  const type = await api('/api/resource-types', 'POST', {code: 'g01_tools', name: 'G01 Material'});
  const tools = [];
  for (const name of ['Kit idéntico', 'Kit idéntico', 'Kit adicional', 'Kit inactivo']) tools.push(await api('/api/resource-items', 'POST', {typeId: type.id, name}));
  await api(`/api/resource-items/${tools[3].id}`, 'PATCH', {isActive: false});
  const catalog = await api('/api/resource-types-with-items'); const coachType = catalog.find((t: any) => t.code === 'vocal_coach');
  const coaches = coachType.items;
  await settings(); await page.getByRole('button', {name: 'Create', exact: true}).click(); const modal = page.getByRole('dialog');
  await modal.getByPlaceholder('Name', {exact: true}).fill('G01 creación UI');
  await modal.getByText('Requiere el coach asignado al participante', {exact: true}).getByRole('checkbox').check();
  await add(modal, tools[0].id); await add(modal, tools[1].id);
  assert.equal(await modal.getByTestId('template-specific-resources').locator('input[type="number"]').count(), 0);
  assert.equal(await modal.getByLabel('Recurso físico específico').locator(`option[value="${tools[0].id}"]`).count(), 0);
  assert.equal(await modal.getByLabel('Recurso físico específico').locator(`option[value="${tools[3].id}"]`).count(), 0);
  assert.equal(await modal.getByLabel('Recurso físico específico').locator('option[value="999999999"]').count(), 0);
  const createdResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/task-templates' && r.request().method() === 'POST');
  await modal.getByRole('button', {name: 'Guardar', exact: true}).click(); const response = await createdResponse;
  assert.equal(response.status(), 201); const created = await response.json(); await modal.waitFor({state: 'hidden'});
  receipts.push({producer: 'CHROMIUM_CREATE', request: response.request().postDataJSON(), response: created});
  assert.deepEqual(created.resourceRequirements.byItem, {[tools[0].id]: 1, [tools[1].id]: 1});
  let card = await edit(created.id); await card.getByTestId('template-specific-resources').screenshot({path: `${directory}/g01-created-reloaded.png`});
  await add(card, tools[2].id); await card.getByLabel(`Retirar recurso #${tools[0].id}`, {exact: true}).click();
  const changed = await store(card, created.id);
  assert.equal(changed.requiresCoach, true); assert.deepEqual(changed.resourceRequirements.byItem, {[tools[1].id]: 1, [tools[2].id]: 1});

  // Seed hidden dimensions with the existing API, then prove UI resource and coach
  // edits retain those exact declarations. They are not converted to byItem.
  const hidden = {byType: {[type.id]: 1}, anyOf: [{quantity: 1, resourceItemIds: [tools[0].id, tools[1].id]}]};
  await api(`/api/ta/${created.id}`, 'PATCH', {resourceRequirements: {...hidden, byItem: {[tools[1].id]: 1, [coaches[0].id]: 1}}});
  card = await edit(created.id); await add(card, tools[2].id); const physicalEdit = await store(card, created.id);
  assert.deepEqual(physicalEdit.resourceRequirements, {...hidden, byItem: {[tools[1].id]: 1, [tools[2].id]: 1, [coaches[0].id]: 1}});
  card = await edit(created.id); await card.getByRole('combobox', {name: 'Coach específico', exact: true}).click();
  await page.getByRole('option', {name: coaches[1].name, exact: true}).click(); const coachEdit = await store(card, created.id);
  assert.deepEqual(coachEdit.resourceRequirements, {...hidden, byItem: {[tools[1].id]: 1, [tools[2].id]: 1, [coaches[1].id]: 1}});
  card = await edit(created.id); await card.getByLabel(`Retirar recurso #${tools[1].id}`, {exact: true}).click();
  const withoutCoachChange = await store(card, created.id);
  assert.deepEqual(withoutCoachChange.resourceRequirements, {...hidden, byItem: {[tools[2].id]: 1, [coaches[1].id]: 1}});
  save('g01-crud', {created, changed, hidden, physicalEdit, coachEdit, withoutCoachChange});
  pass('G01: create, reload, edit without coach change, change coach; hidden dimensions exact');

  card = await edit(created.id); await add(card, tools[0].id);
  await api(`/api/ta/${created.id}`, 'PATCH', {name: 'G01 cambio concurrente'});
  await store(card, created.id, 409);
  assert.equal(await card.getByRole('button', {name: 'Guardar', exact: true}).isDisabled(), true);
  assert.equal((await api('/api/task-templates')).find((t: any) => t.id === created.id).resourceRequirements.byItem[tools[0].id], undefined);
  await card.screenshot({path: `${directory}/g01-stale-revision.png`});
  await card.getByRole('button', {name: 'Recargar', exact: true}).click();
  await card.getByLabel(`Retirar recurso #${tools[0].id}`).waitFor({state: 'detached'});
  assert.equal(await card.getByLabel(`Retirar recurso #${tools[0].id}`).count(), 0);
  await card.getByRole('button', {name: 'Recargar', exact: true}).waitFor({state: 'detached'});
  await card.getByTestId('template-specific-resources').screenshot({path: `${directory}/g01-compact-editor.png`});
  const current = (await api('/api/task-templates')).find((t: any) => t.id === created.id);
  for (const role of ['production', 'aux', 'viewer']) {
   const rejected = await request(`/api/task-templates/${created.id}/save-with-inverse`, 'POST', {patch: {resourceRequirements: {byItem: {[tools[0].id]: 1}}}, expectedTemplates: [{id: created.id, revision: current.revision}], addedInverseIds: [], removedInverseIds: []}, role);
   assert.equal(rejected.status, 403);
  }
  const viewer = await browser.newPage(); await login(viewer, 'viewer'); await viewer.goto(appUrl + '/settings');
  await viewer.waitForURL('**/dashboard');
  assert.equal(await viewer.getByTestId('template-specific-resources').count(), 0);
  receipts.push({producer: 'CHROMIUM_VIEWER', requestedPath: '/settings', actualPath: new URL(viewer.url()).pathname, accessDenied: true});
  await viewer.close();
  assert.deepEqual((await api('/api/task-templates')).find((t: any) => t.id === created.id).resourceRequirements, current.resourceRequirements);
  assert.deepEqual(errors, []); save('g01-browser-errors', errors);
  pass('G01: stale UI save atomic, reload and catalog write permissions');
  return {...integrated, g01AuthoredTemplates: authored.length, remoteWrites: 0};
 } finally {save('g01-ui-api-receipts', receipts); await browser.close();}
}
