/** Read-only selection evidence on the real historical identities in a local DB. */
import assert from 'node:assert/strict';import type {Page} from 'playwright';
import type {runA2BrowserJourney} from './smokeA2Journey';
export async function runA2HistoricalScopeJourney(options:Parameters<typeof runA2BrowserJourney>[0],page:Page){
 const workspace=page.getByTestId('assisted-workspace'),writes:string[]=[];
 const material=async()=>(await options.db.query('SELECT to_jsonb(s) row FROM public.assisted_planning_sessions s WHERE plan_id=$1',[options.planId])).rows;
 const before=await material();const onRequest=(r:any)=>{if(r.url().includes('/api/')&&!['GET','OPTIONS'].includes(r.method()))writes.push(r.url());};page.on('request',onRequest);
 const count=async(n:number)=>page.waitForFunction(n=>document.querySelector('[data-testid="assisted-scope-count"]')?.textContent?.startsWith(`${n} obligaciones`),n);
 try{
  await workspace.getByRole('button',{name:'Espacios y zonas',exact:true}).click();await count(0);
  const clear=()=>workspace.getByRole('button',{name:'Retirar selección de ubicaciones',exact:true}).click();
  const zone=(id:number)=>workspace.getByTestId(`scope-zone-${id}`).getByRole('checkbox').first();
  await zone(2).click();await count(36);
  await workspace.getByTestId('scope-space-43').click();await count(17);
  await workspace.getByTestId('scope-space-43').click();await count(36);await clear();await count(0);
  await zone(3).click();await count(44);assert.equal(await workspace.getByTestId('scope-space-39').getAttribute('aria-checked'),'false');await clear();
  await workspace.getByTestId('scope-space-39').click();await count(18);await clear();
  await zone(13).click();await count(19);await clear();
  await workspace.getByRole('button',{name:'Tareas',exact:true}).click();
  assert.deepEqual(writes,[]);assert.deepEqual(await material(),before);
  options.pass('historical UI scope: P15 36/17, P14 44 including Hall but no Redes, Maqui/Pelu 18, Caracolas 19; zero writes');
 }finally{page.off('request',onRequest);}
}
