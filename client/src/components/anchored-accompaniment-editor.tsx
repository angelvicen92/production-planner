import React from 'react';
import {Button} from './ui/button';
import type {EffectiveConfigurationView} from '@shared/effectiveConfigurationContracts';
import {anchoredPolicyUnitIds,type AnchoredAccompanimentStructure,type AnchoredAccompanimentPolicy} from '@shared/anchoredAccompanimentStructure';
export function AnchoredAccompanimentEditor({value,canEdit,pending,onSave}:{value:NonNullable<EffectiveConfigurationView['anchoredAccompaniments']>;canEdit:boolean;pending:boolean;onSave:(v:AnchoredAccompanimentStructure)=>void}){
 const policies=value.authority?.policies??[];
 const [editing,setEditing]=React.useState<number|null>(null),[identity,setIdentity]=React.useState('');
 const [anchor,setAnchor]=React.useState(0),[before,setBefore]=React.useState(0),[after,setAfter]=React.useState(0);
 const [mode,setMode]=React.useState<'fixed'|'domain'>('fixed'),[units,setUnits]=React.useState<number[]>([]);
 const selected=value.tasks.find(t=>t.id===anchor),disabled=!canEdit||pending||!value.supported||!!value.blockedReason;
 const used=new Set(policies.flatMap((p,i)=>i===editing?[]:[...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds]));
 const supports=value.tasks.filter(t=>t.kind==='auxiliary'&&t.participantId===selected?.participantId&&!used.has(t.id));
 const valid=selected?.eligible&&!used.has(anchor)&&before!==after&&supports.some(t=>t.id===before&&t.eligible)&&supports.some(t=>t.id===after&&t.eligible)&&units.length>0&&units.every(id=>value.units.some(u=>u.id===id))&&(mode==='domain'||units.length===1);
 const label=(id:number)=>value.tasks.find(t=>t.id===id)?.label??'Referencia desconocida';
 const open=(index:number)=>{const p=policies[index];setEditing(index);setIdentity(p?.id??crypto.randomUUID());setAnchor(p?.anchorTaskId??0);setBefore(p?.beforeTaskIds[0]??0);setAfter(p?.afterTaskIds[0]??0);setMode(p&&'eligibleItinerantUnitIds' in p?'domain':'fixed');setUnits(p?anchoredPolicyUnitIds(p):[]);};
 const save=(next:AnchoredAccompanimentPolicy[])=>{
  const fixed=next.filter((p):p is Extract<AnchoredAccompanimentPolicy,{itinerantUnitId:number}>=>'itinerantUnitId' in p);
  // A fixed single operation retains its certified authority; adding an operation
  // or choosing a domain explicitly adopts the extended daily contract.
  if(value.authority?.contractVersion!==2&&next.length<=1&&fixed.length===next.length)onSave({contractVersion:1,policies:fixed});
  else onSave({contractVersion:2,policies:next});
 };
 return <div className="space-y-3" data-testid="daily-anchored-accompaniment">
  <p role="status">{!value.supported?'Combinación no soportada':policies.length?'Operación anclada efectiva y versionada':'Operación anclada no configurada'} · Revisión {value.revisionId??'inicial'}</p>
  <p>Selecciona las actividades reales en el orden anterior → Main → posterior. Participante y equipo permanecen ocupados durante toda la operación; el espacio principal sólo durante su actividad.</p>
  <p>La unidad fija es una exigencia de Producción. El dominio permite que Assisted elija una unidad común a los tres segmentos según disponibilidad y conflictos físicos.</p>
  {value.blockedReason?<p role="alert">{value.blockedReason}</p>:null}
  {policies.map((p,i)=>{const chosen=value.tasks.find(t=>t.id===p.anchorTaskId)?.selectedUnitId;return <div key={p.id} className="border rounded p-3 space-y-2" data-testid="anchored-operation">
   <p>{[...p.beforeTaskIds,p.anchorTaskId,...p.afterTaskIds].map(label).join(' → ')}</p>
   <p>{'itinerantUnitId' in p?'Equipo fijo':'Equipos elegibles'}: {anchoredPolicyUnitIds(p).map(id=>value.units.find(u=>u.id===id)?.name??'Unidad desconocida').join(', ')}</p>
   <p>Equipo seleccionado: {chosen?value.units.find(u=>u.id===chosen)?.name??'Unidad desconocida':'Pendiente de propuesta'}</p>
   <Button disabled={disabled||editing!==null} onClick={()=>open(i)}>Modificar operación anclada</Button>
   <Button variant="outline" disabled={disabled||editing!==null} onClick={()=>save(policies.filter((_,n)=>n!==i))}>Retirar operación anclada</Button>
  </div>;})}
  {editing===null?<Button disabled={disabled} onClick={()=>open(policies.length)}>Crear operación anclada</Button>:<>
   <label className="block">Actividad principal<select aria-label="Actividad principal anclada" value={anchor} disabled={disabled} onChange={e=>{setAnchor(Number(e.target.value));setBefore(0);setAfter(0);}}><option value={0}>Seleccionar actividad Main</option>{value.tasks.filter(t=>t.kind==='main'&&!used.has(t.id)).map(t=><option key={t.id} value={t.id} disabled={!t.eligible}>{t.label} · {t.space} · {t.duration} min</option>)}</select></label>
   {(['before','after'] as const).map(side=><label className="block" key={side}>{side==='before'?'Segmento anterior':'Segmento posterior'}<select aria-label={side==='before'?'Segmento anterior al Main':'Segmento posterior al Main'} value={side==='before'?before:after} disabled={disabled||!anchor} onChange={e=>(side==='before'?setBefore:setAfter)(Number(e.target.value))}><option value={0}>Seleccionar segmento</option>{supports.map(t=><option key={t.id} value={t.id} disabled={!t.eligible}>{t.label} · {t.space} · {t.duration} min</option>)}</select></label>)}
   <label className="block">Elección de equipo<select aria-label="Contrato de equipo anclado" value={mode} disabled={disabled} onChange={e=>{setMode(e.target.value as typeof mode);setUnits([]);}}><option value="fixed">Equipo fijo</option><option value="domain">Equipos elegibles</option></select></label>
   {mode==='fixed'?<label className="block">Unidad nominal continua<select aria-label="Unidad de la operación anclada" value={units[0]??0} disabled={disabled} onChange={e=>setUnits(Number(e.target.value)?[Number(e.target.value)]:[])}><option value={0}>Seleccionar unidad real del día</option>{value.units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>:<fieldset><legend>Unidades elegibles para toda la operación</legend>{value.units.map(u=><label className="block" key={u.id}><input type="checkbox" aria-label={`Equipo elegible ${u.name}`} disabled={disabled} checked={units.includes(u.id)} onChange={e=>setUnits(e.target.checked?[...units,u.id].sort((a,b)=>a-b):units.filter(id=>id!==u.id))}/>{u.name}</label>)}</fieldset>}
   {value.units.filter(u=>units.includes(u.id)).map(u=><p key={u.id}>{u.name}: {u.resources?.map(r=>r.name).join(', ')??'Composición diaria'} · {u.windows?.map(w=>`${w.start}–${w.end}`).join(', ')}</p>)}
   <p>Orden REQUIRED · adyacencia exacta · transición interna incluida. La duración procede de cada actividad.</p>
   <Button disabled={disabled||!valid} onClick={()=>{const p:AnchoredAccompanimentPolicy={id:identity,anchorTaskId:anchor,beforeTaskIds:[before],afterTaskIds:[after],...(mode==='fixed'?{itinerantUnitId:units[0]}:{eligibleItinerantUnitIds:units}),adjacency:'REQUIRED',internalTransition:'INCLUDED',resourceContinuity:'REQUIRED'};const next=[...policies];next[editing]=p;save(next);setEditing(null);}}>Guardar operación anclada</Button>
   <Button variant="outline" disabled={pending} onClick={()=>setEditing(null)}>Cancelar edición</Button>
  </>}
  <p>Origen: autoridad diaria explícita{value.authority?` · versión ${value.authority.contractVersion}`:''}{value.at?` · ${value.at}`:''}</p>
 </div>;
}
