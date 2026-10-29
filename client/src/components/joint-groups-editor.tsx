import React from 'react';
import {Button} from './ui/button';
import type {EffectiveConfigurationView} from '@shared/effectiveConfigurationContracts';
import type {JointGroupStructure} from '@shared/jointGroupStructure';
export function JointGroupsEditor({value,canEdit,pending,onSave}:{value:NonNullable<EffectiveConfigurationView['jointGroups']>;canEdit:boolean;pending:boolean;onSave:(v:JointGroupStructure)=>void}){
 const [editing,setEditing]=React.useState<string|null>(null),[selected,setSelected]=React.useState<number[]>([]),[open,setOpen]=React.useState(false);
 const groups=value.authority?.groups??[],members=value.tasks.filter(t=>selected.includes(t.id));
 const unavailable=new Set(groups.filter(g=>g.id!==editing).flatMap(g=>g.taskIds));
 const editable=canEdit&&!pending&&value.supported&&!value.blockedReason;
 const incompatible=members.length<2?'Selecciona al menos dos tareas de participantes diferentes.':
  new Set(members.map(t=>t.participantId)).size!==members.length?'Cada participante debe ser diferente.':
  new Set(members.map(t=>t.duration)).size!==1?'Las duraciones deben coincidir.':
  new Set(members.map(t=>t.spaceId)).size!==1?'El espacio físico debe ser común.':
  members.some(t=>JSON.stringify(t.resourceIds)!==JSON.stringify(members[0].resourceIds))?'Los requisitos físicos deben coincidir.':
  members.some(t=>t.dependencies.some(id=>selected.includes(id)))?'Una dependencia interna contradice la simultaneidad.':null;
 const save=async()=>{
  const taskIds=[...selected].sort((a,b)=>a-b);
  const base=editing??'joint-'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(taskIds)))),v=>v.toString(16).padStart(2,'0')).join('');
  let id=base;
  for(let suffix=2;!editing&&groups.some(g=>g.id===id);suffix++)id=base+':'+suffix;
  onSave({contractVersion:1,groups:[...groups.filter(g=>g.id!==editing),{id,taskIds}]});
 };
 return <div className="space-y-3" data-testid="daily-joint-groups">
  <p role="status">Revisión {value.revisionId??'inicial'} · {value.authority?'Declaración diaria de Producción':'Sin operaciones conjuntas declaradas'}</p>
  <p>Una operación física, con inicio y fin comunes. Cada participante conserva su tarea, disponibilidad y dependencias. Espacio y recursos compartidos se ocupan una sola vez.</p>
  {!value.supported?<p role="alert">Esta combinación aún no admite operaciones conjuntas. Con comidas individuales flexibles, guarda primero las fases REQUIRED compatibles. Se admiten recursos concretos y unidades fijas sin transición; otras estructuras pueden impedir la composición.</p>:null}
  {value.blockedReason?<p role="alert">{value.blockedReason}</p>:null}
  {groups.map((g,i)=>{const tasks=g.taskIds.map(id=>value.tasks.find(t=>t.id===id));const enabled=editable&&tasks.every(t=>t?.eligible);return <div key={g.id} className="rounded border p-3" data-testid="joint-operation">
   <p>Operación conjunta {i+1}: {tasks.map(t=>t?.label??'Miembro no disponible').join(' + ')}</p>
   <p>{tasks[0]?.space} · {tasks[0]?.duration} min · {tasks[0]?.resourceIds.map(id=>value.resources.find(r=>r.id===id)?.name??'Recurso').join(', ')||'Sin recursos adicionales'}</p>
   {tasks.map(t=>t?<p key={t.id} className="text-sm">Dependencias de {t.label}: {t.dependencyLabels.join(', ')||'ninguna'}.</p>:null)}
   <Button variant="outline" disabled={!enabled} onClick={()=>{setEditing(g.id);setSelected([...g.taskIds]);setOpen(true);}}>Editar operación conjunta {i+1}</Button>
   <Button variant="outline" disabled={!enabled} onClick={()=>onSave({contractVersion:1,groups:groups.filter(p=>p.id!==g.id)})}>Retirar operación conjunta {i+1}</Button>
   {!tasks.every(t=>t?.eligible)?<p>Decisiones protegidas, ejecución o locks impiden cambiar esta operación.</p>:null}
  </div>;})}
  <Button disabled={!editable} onClick={()=>{setEditing(null);setSelected([]);setOpen(true);}}>Crear operación conjunta</Button>
  {open?<fieldset className="space-y-2"><legend>Miembros reales de la operación</legend>
   {value.tasks.map(t=><label key={t.id} className="block"><input type="checkbox" aria-label={`Miembro conjunto ${t.label}`} checked={selected.includes(t.id)} disabled={!editable||!t.eligible||unavailable.has(t.id)} onChange={e=>setSelected(e.target.checked?[...selected,t.id]:selected.filter(id=>id!==t.id))}/> {t.label} · {t.space} · {t.duration} min
    <span className="block text-sm">Recursos: {t.resourceIds.map(id=>value.resources.find(r=>r.id===id)?.name??'Recurso').join(', ')||'ninguno'}. Dependencias: {t.dependencyLabels.join(', ')||'ninguna'}.</span>
   </label>)}
   {incompatible?<p role="alert">{incompatible}</p>:<p>Miembros compatibles. Al guardar se comprobarán sus disponibilidades y autoridades del día.</p>}
   <Button disabled={!editable||!!incompatible||members.some(t=>!t.eligible)} onClick={save}>Guardar operación conjunta</Button>
   <Button variant="outline" onClick={()=>setOpen(false)}>Cancelar edición conjunta</Button>
  </fieldset>:null}
  {value.at?<p>Origen: declaración diaria · {value.at} · {value.by}</p>:null}
 </div>;
}
