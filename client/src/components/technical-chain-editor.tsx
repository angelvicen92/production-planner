import React from "react";
import { Button } from "./ui/button";
import type { EffectiveConfigurationView } from "@shared/effectiveConfigurationContracts";
import type { TechnicalChainStructure } from "@shared/technicalChainStructure";
export function TechnicalChainEditor({value,canEdit,pending,onSave}:{value:NonNullable<EffectiveConfigurationView['technicalChains']>;canEdit:boolean;pending:boolean;onSave:(v:TechnicalChainStructure)=>void}) {
  const stored=value.authority?.policies[0];
  const [editing,setEditing]=React.useState(false);
  const [id]=React.useState(()=>stored?.id??crypto.randomUUID());
  const [phased,setPhased]=React.useState(!!stored?.phases);
  const [phases,setPhases]=React.useState<number[][]>(stored?.phases??[stored?.orderedTaskIds??[]]);
  const [resources,setResources]=React.useState(stored?.requiredResourceIds??[]);
  const members=phases.flat(),selected=members.map(id=>value.tasks.find(t=>t.id===id)!);
  const common=value.resources.filter(r=>selected.length>0&&selected.every(t=>(phased?t?.phaseResourceIds??t?.resourceIds:t?.resourceIds)?.includes(r.id)));
  // Keep a selected identity reachable so editing members can release it
  // explicitly even when it is no longer common to the new selection.
  const resourceOptions=phased?value.resources.filter(r=>common.some(c=>c.id===r.id)||resources.includes(r.id)):common;
  const disabled=!canEdit||pending||!value.supported||!!value.blockedReason;
  const eligible=(t:typeof value.tasks[number])=>phased?t.phaseEligible:t.eligible;
  const valid=members.length>=2&&(!phased||phases.every(p=>p.length))&&selected.every(t=>t&&eligible(t))&&(phased||resources.length>0)&&resources.every(id=>common.some(r=>r.id===id));
  const label=(id:number)=>{const task=value.tasks.find(t=>t.id===id);return task?.jointMemberIds?.length?task.jointMemberIds.map(id=>value.tasks.find(t=>t.id===id)?.label).join(" + "):task?.label??"Referencia desconocida";};
  const operations=value.tasks.filter(t=>!t.jointMemberIds?.length||t.id===Math.min(...t.jointMemberIds)||members.includes(t.id));
  const move=(phase:number,index:number,delta:number)=>setPhases(all=>all.map((ids,p)=>{if(p!==phase)return ids;const next=[...ids];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;}));
  const storedPhases=stored?.phases??(stored?[stored.orderedTaskIds]:[]);
  return <div className="space-y-3" data-testid="daily-technical-chain">
    <p role="status">{!value.supported?"Combinación no soportada":stored?"Cadena efectiva y versionada":"Cadena no configurada"} · Revisión {value.revisionId??"inicial"}</p>
    <p>Adyacencia REQUIRED: operaciones consecutivas, sin huecos. {phased?"La continuidad es temporal; los recursos se validan individualmente por operación. Los recursos comunes declarados se exigen en todas las operaciones.":"Todas consumen el equipo nominal seleccionado."} Guardar una regla no garantiza una realización físicamente viable.</p>
    {value.blockedReason?<p role="alert">Edición bloqueada por borrador, propuesta o decisiones protegidas. Conserva la regla vigente.</p>:null}
    {!editing?<><ol>{storedPhases.map((phase,i)=><li key={i}>{stored?.phases?`Fase ${i+1} · orden interno libre: `:""}{phase.map(label).join(stored?.phases?"; ":" → ")}</li>)}</ol><p>{stored?.phases?"Orden REQUIRED entre fases. Cada conjunta es una operación con todas sus obligaciones individuales.":null}</p><p>{stored?.requiredResourceIds.map(id=>value.resources.find(r=>r.id===id)?.name??"Recurso desconocido").join(", ")}</p><Button disabled={disabled} onClick={()=>setEditing(true)}>{stored?"Modificar cadena técnica":"Crear cadena técnica"}</Button></>:<>
      <label className="block"><input type="checkbox" aria-label="Orden por fases" checked={phased} disabled={disabled||value.phasesSupported===false} onChange={e=>{setPhased(e.target.checked);setPhases([members]);}}/> Orden por fases REQUIRED · libertad dentro de cada fase</label>
      {phases.map((phase,p)=><fieldset disabled={disabled} key={p} className="border p-2"><legend>{phased?`Fase ${p+1} · orden interno libre`:"Tareas técnicas reales · selecciona en orden"}</legend>
        {operations.map(t=><label className="block" key={t.id}><input type="checkbox" aria-label={phased?`Fase ${p+1}: ${label(t.id)}`:`Miembro ${t.label}`} disabled={!eligible(t)||members.includes(t.id)&&!phase.includes(t.id)||!!t.jointMemberIds?.some(id=>members.includes(id)&&id!==t.id)} checked={phase.includes(t.id)} onChange={e=>setPhases(all=>all.map((ids,i)=>i!==p?ids:e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id)))}/> {label(t.id)} · {t.duration} min · {t.space}{!eligible(t)?" · no elegible":""}</label>)}
        {!phased?<ol>{phase.map((id,i)=><li key={id}>{label(id)} <Button variant="outline" disabled={disabled||i===0} aria-label={`Subir ${label(id)}`} onClick={()=>move(p,i,-1)}>↑</Button> <Button variant="outline" disabled={disabled||i===phase.length-1} aria-label={`Bajar ${label(id)}`} onClick={()=>move(p,i,1)}>↓</Button></li>)}</ol>:<Button variant="outline" disabled={disabled||phases.length===1} onClick={()=>setPhases(all=>all.filter((_,i)=>i!==p))}>Retirar fase {p+1}</Button>}
      </fieldset>)}
      {phased?<Button variant="outline" disabled={disabled} onClick={()=>setPhases(all=>[...all,[]])}>Añadir fase</Button>:null}
      <fieldset disabled={disabled}><legend>Equipo nominal requerido en todas las operaciones{phased?" (opcional)":""}</legend>{resourceOptions.map(r=><label className="block" key={r.id}><input type="checkbox" aria-label={`Equipo ${r.name}`} checked={resources.includes(r.id)} onChange={e=>setResources(ids=>e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id))}/> {r.name} · {r.start}–{r.end}{!common.some(c=>c.id===r.id)?" · ya no es común; retira la selección para guardar":""}</label>)}</fieldset>
      {phased&&resources.length===0?<p role="status">Sin recurso común declarado. Cada operación conserva todos sus recursos efectivos.</p>:null}
      {!valid?<p role="alert">{phased?"Selecciona al menos dos operaciones. Cada fase necesita miembros; los recursos comunes seleccionados deben pertenecer a todas las operaciones.":"Selecciona al menos dos operaciones y equipo común."} Las dependencias deben permitir el orden requerido.</p>:null}
      <Button disabled={disabled||!valid} onClick={()=>onSave({contractVersion:1,policies:[{id,orderedTaskIds:members,...(phased?{phases}:{}),adjacency:"REQUIRED",resourceContinuity:"REQUIRED",requiredResourceIds:resources}]})}>Guardar cadena técnica</Button>
      <Button variant="outline" disabled={pending} onClick={()=>setEditing(false)}>Cancelar edición</Button>
    </>}
    {stored?<Button variant="outline" disabled={disabled} onClick={()=>onSave({contractVersion:1,policies:[]})}>Retirar cadena técnica</Button>:null}
    {value.at?<p>Autoridad diaria guardada: {value.at}</p>:null}
  </div>;
}
