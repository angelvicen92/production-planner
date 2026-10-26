import React from "react";
import { Button } from "./ui/button";
import type { EffectiveConfigurationView } from "@shared/effectiveConfigurationContracts";
import type { TechnicalChainStructure } from "@shared/technicalChainStructure";
export function TechnicalChainEditor({value,canEdit,pending,onSave}:{value:NonNullable<EffectiveConfigurationView['technicalChains']>;canEdit:boolean;pending:boolean;onSave:(v:TechnicalChainStructure)=>void}) {
  const stored=value.authority?.policies[0];
  const [editing,setEditing]=React.useState(false);
  const [id]=React.useState(()=>stored?.id??crypto.randomUUID());
  const [members,setMembers]=React.useState(stored?.orderedTaskIds??[]);
  const [resources,setResources]=React.useState(stored?.requiredResourceIds??[]);
  const selected=members.map(id=>value.tasks.find(t=>t.id===id)!);
  const common=value.resources.filter(r=>selected.length>0&&selected.every(t=>t?.resourceIds.includes(r.id)));
  const disabled=!canEdit||pending||!value.supported||!!value.blockedReason;
  const valid=members.length>=2&&selected.every(t=>t?.eligible)&&resources.length>0&&resources.every(id=>common.some(r=>r.id===id));
  const move=(index:number,delta:number)=>setMembers(ids=>{const next=[...ids];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;});
  return <div className="space-y-3" data-testid="daily-technical-chain">
    <p role="status">{!value.supported?"Combinación no soportada":stored?"Cadena efectiva y versionada":"Cadena no configurada"} · Revisión {value.revisionId??"inicial"}</p>
    <p>Adyacencia REQUIRED: cada operación comienza exactamente al finalizar la anterior. Continuidad REQUIRED: todas consumen el mismo equipo nominal seleccionado. Una regla válida puede tener un dominio físico vacío; guardar no garantiza una propuesta.</p>
    {value.blockedReason?<p role="alert">Edición bloqueada por borrador, propuesta o decisiones protegidas. Conserva la regla vigente.</p>:null}
    {!editing?<><p>{stored?.orderedTaskIds.map(id=>value.tasks.find(t=>t.id===id)?.label??"Referencia desconocida").join(" → ")}</p><p>{stored?.requiredResourceIds.map(id=>value.resources.find(r=>r.id===id)?.name??"Recurso desconocido").join(", ")}</p><Button disabled={disabled} onClick={()=>setEditing(true)}>{stored?"Modificar cadena técnica":"Crear cadena técnica"}</Button></>:<>
      <fieldset disabled={disabled}><legend>Tareas técnicas reales · selecciona en orden</legend>{value.tasks.map(t=><label className="block" key={t.id}><input type="checkbox" aria-label={`Miembro ${t.label}`} disabled={!t.eligible} checked={members.includes(t.id)} onChange={e=>setMembers(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id))}/> {t.label} · {t.duration} min · {t.space} · {t.availability?.availabilityStart??"inicio de jornada"}–{t.availability?.availabilityEnd??"fin de jornada"}{!t.eligible?" · no elegible":""}</label>)}</fieldset>
      <ol>{selected.map((t,i)=><li key={members[i]}>{i+1}. {t?.label??"Referencia desconocida"} <Button variant="outline" disabled={disabled||i===0} aria-label={`Subir ${t?.label}`} onClick={()=>move(i,-1)}>↑</Button> <Button variant="outline" disabled={disabled||i===selected.length-1} aria-label={`Bajar ${t?.label}`} onClick={()=>move(i,1)}>↓</Button></li>)}</ol>
      <fieldset disabled={disabled}><legend>Equipo nominal requerido en todos los miembros</legend>{common.map(r=><label className="block" key={r.id}><input type="checkbox" aria-label={`Equipo ${r.name}`} checked={resources.includes(r.id)} onChange={e=>setResources(ids=>e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id))}/> {r.name} · {r.start}–{r.end}</label>)}</fieldset>
      {!valid?<p role="alert">Selecciona al menos dos tareas técnicas y equipo común. El orden debe coincidir con las dependencias lineales.</p>:null}
      <Button disabled={disabled||!valid} onClick={()=>onSave({contractVersion:1,policies:[{id,orderedTaskIds:members,adjacency:"REQUIRED",resourceContinuity:"REQUIRED",requiredResourceIds:resources}]})}>Guardar cadena técnica</Button>
      <Button variant="outline" disabled={pending} onClick={()=>setEditing(false)}>Cancelar edición</Button>
    </>}
    {stored?<Button variant="outline" disabled={disabled} onClick={()=>onSave({contractVersion:1,policies:[]})}>Retirar cadena técnica</Button>:null}
    {value.at?<p>Autoridad diaria guardada: {value.at}</p>:null}
  </div>;
}
