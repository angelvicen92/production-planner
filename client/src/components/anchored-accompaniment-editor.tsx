import React from 'react';
import {Button} from './ui/button';
import type {EffectiveConfigurationView} from '@shared/effectiveConfigurationContracts';
import type {AnchoredAccompanimentStructure} from '@shared/anchoredAccompanimentStructure';
export function AnchoredAccompanimentEditor({value,canEdit,pending,onSave}:{value:NonNullable<EffectiveConfigurationView['anchoredAccompaniments']>;canEdit:boolean;pending:boolean;onSave:(v:AnchoredAccompanimentStructure)=>void}){
 const stored=value.authority?.policies[0];
 const [editing,setEditing]=React.useState(false),[identity]=React.useState(()=>stored?.id??crypto.randomUUID());
 const [anchor,setAnchor]=React.useState(stored?.anchorTaskId??0),[before,setBefore]=React.useState(stored?.beforeTaskIds[0]??0),[after,setAfter]=React.useState(stored?.afterTaskIds[0]??0),[unit,setUnit]=React.useState(stored?.itinerantUnitId??0);
 const selected=value.tasks.find(t=>t.id===anchor),disabled=!canEdit||pending||!value.supported;
 const supports=value.tasks.filter(t=>t.kind==='auxiliary'&&t.participantId===selected?.participantId);
 const valid=selected?.eligible&&before!==after&&supports.some(t=>t.id===before&&t.eligible)&&supports.some(t=>t.id===after&&t.eligible)&&value.units.some(u=>u.id===unit);
 const label=(id:number)=>value.tasks.find(t=>t.id===id)?.label??'Referencia desconocida';
 return <div className="space-y-3" data-testid="daily-anchored-accompaniment">
  <p role="status">{!value.supported?'Combinación no soportada':stored?'Operación anclada efectiva y versionada':'Operación anclada no configurada'} · Revisión {value.revisionId??'inicial'}</p>
  <p>Reality antes → Ensayo → Reality después. Elige las actividades reales; sus nombres no activan reglas. Participante y unidad quedan ocupados de forma continua. Sólo la actividad principal ocupa físicamente su espacio. Los segmentos usan la agenda y los recursos propios de la unidad, sin heredar recursos de su ubicación.</p>
  <p>Una operación por día, con Main/Vocal y una unidad nominal. Selecciona el Main o uno de sus segmentos en el primer alcance. Las combinaciones con montajes, rondas, cadenas, grupos conjuntos o transporte estructural requieren otro contrato.</p>
  {!editing?<><p>{stored?[...stored.beforeTaskIds,stored.anchorTaskId,...stored.afterTaskIds].map(label).join(' → '):'Selecciona una actividad Main y ambos segmentos.'}</p><Button disabled={disabled} onClick={()=>setEditing(true)}>{stored?'Modificar operación anclada':'Crear operación anclada'}</Button></>:<>
   <label className="block">Actividad principal<select aria-label="Actividad principal anclada" value={anchor} disabled={disabled} onChange={e=>{setAnchor(Number(e.target.value));setBefore(0);setAfter(0);}}><option value={0}>Seleccionar actividad Main</option>{value.tasks.filter(t=>t.kind==='main').map(t=><option key={t.id} value={t.id} disabled={!t.eligible}>{t.label} · {t.space} · {t.duration} min</option>)}</select></label>
   {(['before','after'] as const).map(side=><label className="block" key={side}>{side==='before'?'Segmento anterior':'Segmento posterior'}<select aria-label={side==='before'?'Segmento anterior al Main':'Segmento posterior al Main'} value={side==='before'?before:after} disabled={disabled||!anchor} onChange={e=>(side==='before'?setBefore:setAfter)(Number(e.target.value))}><option value={0}>Seleccionar segmento</option>{supports.map(t=><option key={t.id} value={t.id} disabled={!t.eligible}>{t.label} · {t.space} · {t.duration} min</option>)}</select></label>)}
   <label className="block">Unidad nominal continua<select aria-label="Unidad de la operación anclada" value={unit} disabled={disabled} onChange={e=>setUnit(Number(e.target.value))}><option value={0}>Seleccionar unidad real del día</option>{value.units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
   <p>Orden explícito · continuidad REQUIRED · transición interna incluida. La duración procede de cada actividad.</p>
   <Button disabled={disabled||!valid} onClick={()=>onSave({contractVersion:1,policies:[{id:identity,anchorTaskId:anchor,beforeTaskIds:[before],afterTaskIds:[after],itinerantUnitId:unit,adjacency:'REQUIRED',internalTransition:'INCLUDED',resourceContinuity:'REQUIRED'}]})}>Guardar operación anclada</Button>
   <Button variant="outline" disabled={pending} onClick={()=>setEditing(false)}>Cancelar edición</Button>
  </>}
  {stored?<Button variant="outline" disabled={disabled} onClick={()=>onSave({contractVersion:1,policies:[]})}>Retirar operación anclada</Button>:null}
  {value.at?<p>Autoridad diaria guardada: {value.at}</p>:null}
 </div>;
}
