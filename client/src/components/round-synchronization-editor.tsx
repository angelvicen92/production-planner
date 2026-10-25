import React from "react";
import { Button } from "./ui/button";
import type { EffectiveConfigurationView } from "@shared/effectiveConfigurationContracts";
import type { RoundSynchronizationStructure } from "@shared/roundSynchronizationStructure";

export function RoundSynchronizationEditor({value,canEdit,pending,onSave}:{
  value:NonNullable<EffectiveConfigurationView['roundSynchronization']>;canEdit:boolean;pending:boolean;
  onSave:(structure:RoundSynchronizationStructure)=>void;
}) {
  const stored=value.authority?.policies[0];
  const [editing,setEditing]=React.useState(false);
  const [policyId]=React.useState(()=>stored?.id??crypto.randomUUID());
  const [spaces,setSpaces]=React.useState([stored?.lanes[0].spaceId??0,stored?.lanes[1].spaceId??0]);
  const [members,setMembers]=React.useState<number[][]>(stored?.lanes.map(l=>l.taskIds)??[[],[]]);
  const [minutes,setMinutes]=React.useState<number[]>(stored?.lanes.map(l=>l.preparationMinutesBetweenRounds)??[5,5]);
  const selected=value.tasks.filter(t=>members.flat().includes(t.id));
  const valid=spaces.every(Boolean)&&spaces[0]!==spaces[1]&&members.every(l=>l.length>=2)
    &&new Set(members.flat()).size===members.flat().length&&new Set(selected.map(t=>t.duration)).size===1
    &&members.every((lane,i)=>lane.every(id=>value.tasks.some(t=>t.id===id&&t.spaceId===spaces[i]&&t.eligible)))
    &&minutes.every(n=>Number.isSafeInteger(n)&&n>=0&&n%5===0);
  const disabled=!canEdit||pending||!value.supported||!!value.blockedReason;
  return <div className="space-y-3" data-testid="daily-round-synchronization">
    <p role="status">{!value.supported?"NO SOPORTADO: esta combinación de estructuras.":stored?"Regla configurada y efectiva · REQUIRED":"Regla no configurada"} · Revisión {value.revisionId??"inicial"}</p>
    {value.blockedReason?<p role="alert">Edición bloqueada: {value.blockedReason==="ROUND_STRUCTURE_PROTECTED_DECISIONS"?"la regla afecta a decisiones aceptadas, en ejecución o con locks. Conserva su autoridad efectiva.":"descarta o resuelve el borrador antes de editar."}</p>:null}
    <p className="text-sm text-muted-foreground">Dos espacios físicos, auxiliares con participante y duración uniforme. Inicio simultáneo mientras ambos carriles estén activos. Los miembros se ordenan mediante el planning; la selección no fija horas ni orden temporal. Las tareas sin seleccionar permanecen independientes.</p>
    <p className="text-sm text-muted-foreground">NO SOPORTADO: duraciones heterogéneas, tareas desconocidas o en otro espacio, roles distintos de auxiliar y mezclas con transporte, equipos itinerantes, cadenas, montajes o grupos de continuidad.</p>
    {stored&&!editing?<div>{stored.lanes.map(l=><p key={l.spaceId}>{value.spaces.find(s=>s.id===l.spaceId)?.name}: {l.taskIds.map(id=>value.tasks.find(t=>t.id===id)?.label??"Referencia desconocida").join("; ")} · Preparación {l.preparationMinutesBetweenRounds} min</p>)}</div>:null}
    {!editing?<Button type="button" disabled={disabled} onClick={()=>setEditing(true)}>{stored?"Modificar rondas":"Crear rondas sincronizadas"}</Button>:<div className="space-y-3">
      {[0,1].map(i=><fieldset key={i} disabled={disabled} className="space-y-2 rounded border p-3"><legend>Carril {i+1}</legend>
        <label>Espacio del carril {i+1}<select aria-label={`Espacio del carril ${i+1}`} className="ml-2 border bg-background p-1" value={spaces[i]} onChange={e=>{const next=[...spaces];next[i]=Number(e.target.value);setSpaces(next);setMembers(m=>m.map((l,n)=>n===i?[]:l));}}><option value={0}>Seleccionar espacio</option>{value.spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {value.tasks.filter(t=>t.spaceId===spaces[i]).map(t=><label key={t.id} className="block"><input type="checkbox" checked={members[i].includes(t.id)} disabled={!t.eligible} onChange={e=>setMembers(m=>m.map((l,n)=>n!==i?l:e.target.checked?[...l,t.id]:l.filter(id=>id!==t.id)))}/> {t.label} · {t.duration} min{!t.eligible?" · No soportada/protegida":""}</label>)}
        <label>Preparación del carril {i+1} (min)<input aria-label={`Preparación del carril ${i+1}`} className="ml-2 w-20 border bg-background p-1" type="number" min={0} step={5} value={minutes[i]} onChange={e=>setMinutes(m=>m.map((v,n)=>n===i?Number(e.target.value):v))}/></label>
      </fieldset>)}
      <p>Revisión de la regla: {members[0].length} + {members[1].length} tareas · duración {new Set(selected.map(t=>t.duration)).size===1?selected[0]?.duration:"no uniforme"} min · preparación {minutes.join(" / ")} min · REQUIRED.</p>
      {!valid?<p role="alert">NO SOPORTADO o incompleto: revisa espacios, al menos dos miembros por carril, duración uniforme y preparación múltiplo de cinco.</p>:null}
      <Button type="button" disabled={disabled||!valid} onClick={()=>onSave({contractVersion:1,policies:[{id:policyId,synchronization:"START_TOGETHER_WHILE_ALL_LANES_ACTIVE",lanes:spaces.map((spaceId,i)=>({spaceId,taskIds:members[i],preparationMinutesBetweenRounds:minutes[i]}))}]})}>Guardar rondas</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={()=>setEditing(false)}>Cancelar edición</Button>
    </div>}
    {stored?<Button type="button" variant="outline" disabled={disabled} onClick={()=>onSave({contractVersion:1,policies:[]})}>Retirar estructura sincronizada</Button>:null}
    {value.at?<p className="text-xs text-muted-foreground">Autoridad diaria guardada: {value.at}</p>:null}
  </div>;
}
