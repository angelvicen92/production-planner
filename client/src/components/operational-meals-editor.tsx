import React from 'react';
import {Button} from './ui/button';
import {dailyOperationalMealsSchema,type DailyOperationalMeals} from '@shared/operationalMealPolicy';
import type {EffectiveConfigurationView} from '@shared/effectiveConfigurationContracts';
export function OperationalMealsEditor({value,canEdit,pending,onSave}:{value:NonNullable<EffectiveConfigurationView['operationalMeals']>;canEdit:boolean;pending:boolean;onSave:(v:DailyOperationalMeals)=>void}){
 const [editing,setEditing]=React.useState<string|null>(null),[open,setOpen]=React.useState(false);
 const [resources,setResources]=React.useState<number[]>([]),[spaces,setSpaces]=React.useState<number[]>([]);
 const [start,setStart]=React.useState(''),[end,setEnd]=React.useState(''),[duration,setDuration]=React.useState('');
 const policies=value.authority?.policies??[],editable=canEdit&&!pending&&value.supported&&!value.blockedReason;
 const draft={id:editing??'new-policy',window:{start,end},durationMinutes:Number(duration),planResourceItemIds:resources,spaceIds:spaces};
 const candidate=dailyOperationalMealsSchema.safeParse({contractVersion:1,policies:[...policies.filter(p=>p.id!==editing),draft]});
 const toggle=(ids:number[],id:number,checked:boolean)=>checked?[...ids,id]:ids.filter(i=>i!==id);
 const labels=(ids:number[],items:{id:number;name:string}[])=>ids.map(id=>items.find(i=>i.id===id)?.name??'Miembro no disponible').join(', ')||'ninguno';
 return <div className="space-y-3" data-testid="daily-operational-meals">
  <p role="status">Revisión {value.revisionId??'inicial'} · {value.authority?'Declaración diaria de Producción':'Sin descansos operativos declarados'}</p>
  <p>Un descanso común bloquea todos sus espacios y recursos a la vez. El planificador elige el intervalo dentro de la ventana. Las demás áreas conservan su disponibilidad.</p>
  {!value.supported?<p role="alert">Esta combinación estructural aún no está certificada para descansos operativos.</p>:null}
  {value.blockedReason?<p role="alert">{value.blockedReason}</p>:null}
  {policies.map((p,i)=>{const placed=value.materialized.find(m=>m.policyId===`break:${p.id}`);return <div key={p.id} className="rounded border p-3" data-testid="operational-meal">
   <p>Descanso operativo {i+1} · HARD · {p.durationMinutes} min · ventana {p.window.start}–{p.window.end}</p>
   <p>Espacios afectados: {labels(p.spaceIds??[],value.spaces)}. Recursos afectados: {labels(p.planResourceItemIds,value.resources)}.</p>
   <p>{placed?`Indisponibilidad efectiva: ${placed.startPlanned}–${placed.endPlanned}.`:'Pendiente de planificación; se debe conservar un intervalo común completo.'}</p>
   <Button variant="outline" disabled={!editable} onClick={()=>{setEditing(p.id);setResources([...p.planResourceItemIds]);setSpaces([...(p.spaceIds??[])]);setStart(p.window.start);setEnd(p.window.end);setDuration(String(p.durationMinutes));setOpen(true);}}>Editar descanso {i+1}</Button>
   <Button variant="outline" disabled={!editable} onClick={()=>onSave({contractVersion:1,policies:policies.filter(o=>o.id!==p.id)})}>Retirar descanso {i+1}</Button>
  </div>;})}
  <Button disabled={!editable} onClick={()=>{setEditing(null);setResources([]);setSpaces([]);setStart('');setEnd('');setDuration('');setOpen(true);}}>Crear descanso operativo</Button>
  {open?<fieldset className="space-y-2"><legend>Ámbito físico y ventana del descanso</legend>
   <label className="block">Unidad física como ayuda de selección <select aria-label="Unidad física del descanso" value="" disabled={!editable} onChange={e=>{const unit=value.units.find(u=>u.id===Number(e.target.value));if(unit?.resourceIds.length)setResources([...new Set([...resources,...unit.resourceIds])]);}}><option value="">Seleccionar miembros concretos</option>{value.units.map(u=><option key={u.id} value={u.id} disabled={!u.resourceIds.length}>{u.name} · {labels(u.resourceIds,value.resources)}</option>)}</select></label>
   <p>La selección añade los miembros reales. Una unidad recompuesta no crea otro descanso.</p>
   {value.spaces.map(s=><label key={s.id} className="block"><input type="checkbox" aria-label={`Espacio del descanso ${s.name}`} checked={spaces.includes(s.id)} disabled={!editable} onChange={e=>setSpaces(toggle(spaces,s.id,e.target.checked))}/>{s.name}</label>)}
   {value.resources.map(r=><label key={r.id} className="block"><input type="checkbox" aria-label={`Recurso del descanso ${r.name}`} checked={resources.includes(r.id)} disabled={!editable} onChange={e=>setResources(toggle(resources,r.id,e.target.checked))}/>{r.name}</label>)}
   <p>Miembros seleccionados: {labels(resources,value.resources)}. Espacios: {labels(spaces,value.spaces)}.</p>
   <label className="block">Ventana desde <input aria-label="Ventana del descanso desde" type="time" value={start} onChange={e=>setStart(e.target.value)}/></label>
   <label className="block">Ventana hasta <input aria-label="Ventana del descanso hasta" type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label>
   <label className="block">Duración en minutos <input aria-label="Duración del descanso" type="number" min="5" step="5" value={duration} onChange={e=>setDuration(e.target.value)}/></label>
   <label className="block">Severidad <select aria-label="Severidad del descanso" value="HARD" disabled><option value="HARD">HARD · obligatorio</option></select></label>
   <p>Para retirar la obligación, utiliza Retirar descanso. Las decisiones aceptadas deben conservarse.</p>
   {!candidate.success?<p role="alert">Selecciona miembros y una ventana suficiente, con duración múltiplo de cinco. Cada recurso físico tiene un solo descanso.</p>:null}
   <Button disabled={!editable||!candidate.success} onClick={()=>{if(candidate.success)onSave({contractVersion:1,policies:candidate.data.policies.map(p=>p.id==='new-policy'?{...p,id:crypto.randomUUID()}:p)});}}>Guardar descanso operativo</Button>
   <Button variant="outline" onClick={()=>setOpen(false)}>Cancelar edición del descanso</Button>
  </fieldset>:null}
  {value.at?<p>Origen: declaración diaria · {value.at} · {value.by}</p>:null}
 </div>;
}
