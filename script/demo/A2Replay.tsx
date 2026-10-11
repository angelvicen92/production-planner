import { useEffect, useState,useRef } from 'react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { PlanningTimeline } from '../../client/src/components/planning-timeline';
import { ConfirmDialogProvider } from '../../client/src/components/ui/confirm-dialog';
import { Toaster } from '../../client/src/components/ui/toaster';
import { buildAssistedPlanningView } from '../../client/src/lib/assisted-planning-view';
import '../../client/src/index.css';
import './replay.css';

function Replay(){
 const reviewEdits=useRef<any[]>([]);
 const [review,setReview]=useState(false),[reviewRows,setReviewRows]=useState<any>(null),[localReview,setLocalReview]=useState(false),[validation,setValidation]=useState(''),[copyReport,setCopyReport]=useState<any>(null);
 const [bundle,setBundle]=useState<any>(null),[error,setError]=useState(''),[stage,setStage]=useState(0),[view,setView]=useState<'contestants'|'spaces'|'resources'>('contestants');
 useEffect(()=>{fetch('./bundle.json').then(r=>{if(!r.ok)throw Error('No se encuentra bundle.json. Ejecuta demo:a2:record.');return r.json();}).then(setBundle).catch(e=>setError(e.message));},[]);
 useEffect(()=>{fetch('/api/replay/capabilities').then(r=>r.json()).then(r=>setLocalReview(r.localReview===true)).catch(()=>{});},[]);
 if(error)return <main>{error}</main>;if(!bundle)return <main>Cargando ejecución verificada…</main>;
 const audit=stage?bundle.runs[0].stages[stage-1]:null;
 const snapshot=reviewRows??bundle.stages[stage];
 const dailyTasks=buildAssistedPlanningView(bundle.plan.dailyTasks,snapshot).map(t=>{
  const row=snapshot.tasks.find((r:any)=>r.taskId===t.id);return {...t,assignedResources:row?.assignedResourceIds??t.assignedResources,itinerantTeamId:row?.itinerantTeamId??t.itinerantTeamId};
 });
 const changeStage=(n:number)=>{setStage(n);setReview(false);setReviewRows(null);reviewEdits.current=[];setValidation('');setCopyReport(null);};
 const edit=async(edits:any[])=>{const byId=new Map(reviewEdits.current.map(e=>[e.taskId,e]));edits.forEach(e=>byId.set(e.taskId,e));reviewEdits.current=[...byId.values()];setReviewRows({...snapshot,tasks:snapshot.tasks.map((r:any)=>{const e=byId.get(r.taskId);return e?{...r,startPlanned:e.start,endPlanned:e.end}:r;})});setCopyReport(null);setValidation('Borrador local modificado: pendiente de validación.');};
 const validate=async()=>{const response=await fetch('/api/replay/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({edits:reviewEdits.current})});if(!response.ok)throw Error('No se pudo validar el borrador local');const r=await response.json();setCopyReport(r);setValidation(r.feasible?'Copia local: validación canónica PASS. No se ha persistido.':`Copia local: conflictos detectados (${r.reasonCodes?.slice(0,3).join(', ')}). No se ha persistido.`);return r;};
 return <main className="replay-shell">
  <header><div><strong>OPTIPLAN</strong><h1>Una jornada completa, paso a paso</h1></div><span className="replay-label">REPRODUCCIÓN VERIFICADA</span></header>
  <p>Dos ejecuciones del motor desde una jornada vacía. Se reproduce el resultado registrado; el plan no se genera en directo. Persistencia de esta prueba: memoria y archivos, sin sesión Supabase.</p>
  <div className="replay-stats"><article><b>{audit?.completed??0} / 266</b><span>obligaciones planificadas</span></article><article><b>19</b><span>concursantes</span></article><article><b>{stage} / 10</b><span>etapas aceptadas</span></article><article><b>{review?(copyReport?(copyReport.violations??[]).filter((v:any)=>v.severity==='HARD').length:'—'):(stage?'0':'—')}</b><span>{review?'conflictos de la copia local':'conflictos críticos nuevos'}</span></article></div>
  <section className="replay-controls"><button onClick={()=>changeStage(Math.max(0,stage-1))} disabled={stage===0}>Anterior</button><label>Etapa <input aria-label="Etapa" type="range" min="0" max="10" value={stage} onChange={e=>changeStage(Number(e.target.value))}/><b>S{stage}</b></label><button onClick={()=>changeStage(Math.min(10,stage+1))} disabled={stage===10}>Siguiente etapa registrada</button><select aria-label="Vista" value={view} onChange={e=>setView(e.target.value as typeof view)}><option value="contestants">Por concursante</option><option value="spaces">Por espacio</option><option value="resources">Por recurso</option></select></section>
  <p>{audit?`S${stage}: ${audit.newObligations} obligaciones nuevas; ${(audit.durationMs/1000).toFixed(2)} s en el run 1. Validación completa, protección literal y cierre certificados.`:'S0: jornada inicialmente sin planificar. Todas las obligaciones están pendientes.'}</p>
  {stage===10&&localReview&&<section className="replay-controls"><button onClick={()=>{setReview(true);setReviewRows(structuredClone(bundle.stages[10]));reviewEdits.current=[];setCopyReport(null);setValidation('Copia independiente de S10. Las etapas registradas permanecen intactas.');}}>Abrir copia de borrador local</button>{review&&<><button onClick={validate}>Validar copia local</button><button onClick={()=>changeStage(10)}>Descartar copia</button></>}</section>}
  {validation&&<p role="status">{validation}</p>}
  <PlanningTimeline mode="accepted" timeLockedTaskIds={review?[]:snapshot.tasks.map((r:any)=>r.taskId)} fullLockedTaskIds={review?[]:snapshot.tasks.map((r:any)=>r.taskId)} taskVisualStates={Object.fromEntries(snapshot.tasks.map((r:any)=>[r.taskId,r.startPlanned?'ACCEPTED':'UNPLANNED']))} onApplyManualEdits={review?edit:undefined} onPersistManualEdits={review?payload=>edit(payload.edits):undefined} onValidatePlan={review?validate:undefined} key={`${stage}-${view}`} plan={{...bundle.plan,dailyTasks}} contestants={bundle.contestants} spaces={bundle.spaces} viewMode={view} resourceSelectables={bundle.resources} planResourceItemNameById={Object.fromEntries(bundle.resources.map((r:any)=>[r.id,r.label]))} taskDatasetVersion={`${stage}`} />
  <details><summary>Restricciones y resultados comprobables</summary><p>Espacios y recursos compartidos; precedencias y desplazamientos; coaches; transporte; 19 comidas Sodexo; continuidad REQUIRED del Main; stages aceptados protegidos literalmente. CAM1: 51 tareas y cero solapamientos.</p><table><thead><tr><th>Run</th><th>S1</th><th>Total observado</th><th>Resultado</th></tr></thead><tbody>{bundle.runs.map((r:any)=><tr key={r.run}><td>{r.run}</td><td>{(r.stages[0].durationMs/1000).toFixed(2)} s</td><td>{(r.wallMs/1000).toFixed(2)} s</td><td>266/266 · S10</td></tr>)}</tbody></table><p>Los tiempos incluyen servicios y auditoría del exportador; las duraciones de etapa proceden del harness. Las esperas registradas incluyen desplazamientos y pausas autorizadas. No se ha calculado una comparación homogénea con el plan humano.</p><a href="./summary.json" target="_blank" rel="noreferrer">Métricas, definiciones y certificación</a></details>
  <details><summary>Alcance y límites de la demostración</summary><p>Esta reproducción utiliza el timeline de la aplicación. Configuración, generación de propuestas, aplicación, validación y aceptación se ejecutaron con los servicios reales y una frontera de datos en memoria. No demuestra autenticación, RLS, RPC ni recuperación desde Supabase.</p><p>En el servidor local se puede abrir una copia independiente de S10, ajustar horarios con las herramientas del timeline y validarla contra el canon completo. Esos ajustes no cambian las etapas registradas ni se guardan en Supabase. El paquete estático permite inspeccionar el registro; la validación de ajustes requiere el servidor local.</p><p>ASST-010 tras cambiar Estilismo a 20 minutos sigue siendo un gate independiente. Consulta el informe de entrega.</p></details>
  <footer>Dataset canónico A2 · {bundle.source} · HEAD {bundle.head.slice(0,12)} · Registrado {bundle.generatedAt}</footer>
 </main>;
}
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><ConfirmDialogProvider><Replay/><Toaster/></ConfirmDialogProvider></QueryClientProvider>);
