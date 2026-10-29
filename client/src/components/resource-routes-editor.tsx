import React from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { EffectiveConfigurationView } from "@shared/effectiveConfigurationContracts";
import { dailyResourceRouteTransitionsSchema, type DailyResourceRouteTransitions } from "@shared/resourceRouteTransitions";

export function ResourceRoutesEditor({value,canEdit,pending,onSave}:{
  value:NonNullable<EffectiveConfigurationView["resourceRoutes"]>;canEdit:boolean;pending:boolean;
  onSave:(value:DailyResourceRouteTransitions)=>void;
}) {
  const [index,setIndex] = React.useState<number|null>(null), [open,setOpen] = React.useState(false);
  const [route,setRoute] = React.useState({planResourceItemId:0,fromSpaceId:0,toSpaceId:0,minutes:5});
  const routes = value.authority?.routes ?? [];
  const candidate = {contractVersion:1 as const,routes:[...routes.filter((_,i)=>i!==index),route]};
  const enabled = canEdit && !pending && !value.blockedReason;
  const available = value.resources.some(r=>r.id===route.planResourceItemId&&r.available)
    && [route.fromSpaceId,route.toSpaceId].every(id=>value.spaces.some(s=>s.id===id&&s.available));
  const valid = available && dailyResourceRouteTransitionsSchema.safeParse(candidate).success;
  const resourceLabel = (id:number) => {const r=value.resources.find(r=>r.id===id);return r?`${r.name} · recurso ${r.id}${r.available?"":" (no disponible)"}`:`Recurso ${id} no disponible`;};
  const spaceLabel = (id:number) => {const s=value.spaces.find(s=>s.id===id);return s?`${s.name} · espacio ${s.id}`:`Espacio ${id} no disponible`;};
  return <div className="space-y-3" data-testid="daily-resource-routes">
    <p>Revisión {value.revisionId??"inicial"}. Cada ruta exige una separación mínima HARD entre actividades que consumen el mismo recurso. La dirección inversa se configura por separado.</p>
    <p>Sin ruta se mantiene el margen de respaldo. Dentro del mismo espacio no hay traslado. Los minutos deben ser positivos y múltiplos de {value.timeGridMinutes}.</p>
    {value.blockedReason?<p role="alert">{value.blockedReason}</p>:null}
    {routes.map((r,i)=><div key={`${r.planResourceItemId}:${r.fromSpaceId}:${r.toSpaceId}`} className="rounded border p-3" data-testid="resource-route">
      <p>{resourceLabel(r.planResourceItemId)}: {spaceLabel(r.fromSpaceId)} → {spaceLabel(r.toSpaceId)} · {r.minutes} min</p>
      <Button variant="outline" disabled={!enabled} onClick={()=>{setIndex(i);setRoute({...r});setOpen(true);}}>Editar ruta {i+1}</Button>
      <Button variant="outline" disabled={!enabled} onClick={()=>onSave({contractVersion:1,routes:routes.filter((_,n)=>n!==i)})}>Eliminar ruta {i+1}</Button>
    </div>)}
    <Button disabled={!enabled} onClick={()=>{setIndex(null);setRoute({planResourceItemId:0,fromSpaceId:0,toSpaceId:0,minutes:5});setOpen(true);}}>Añadir ruta de recurso</Button>
    {open?<fieldset className="space-y-2"><legend>Transición direccional</legend>
      <label>Recurso concreto<select aria-label="Recurso de la ruta" value={route.planResourceItemId} disabled={!enabled} onChange={e=>setRoute({...route,planResourceItemId:Number(e.target.value)})}>
        <option value={0}>Selecciona un recurso</option>{value.resources.map(r=><option key={r.id} value={r.id} disabled={!r.available}>{resourceLabel(r.id)}</option>)}
      </select></label>
      {(["fromSpaceId","toSpaceId"] as const).map((field,i)=><label key={field}>{i?"Destino":"Origen"}<select aria-label={i?"Destino de la ruta":"Origen de la ruta"} value={route[field]} disabled={!enabled} onChange={e=>setRoute({...route,[field]:Number(e.target.value)})}>
        <option value={0}>Selecciona un espacio</option>{value.spaces.map(s=><option key={s.id} value={s.id} disabled={!s.available}>{spaceLabel(s.id)}</option>)}
      </select></label>)}
      <label>Minutos<Input aria-label="Minutos de traslado" type="number" min={value.timeGridMinutes} step={value.timeGridMinutes} value={route.minutes} disabled={!enabled} onChange={e=>setRoute({...route,minutes:Number(e.target.value)})}/></label>
      {!valid?<p role="alert">Selecciona recurso y espacios disponibles, una dirección distinta y minutos válidos. No se admiten rutas duplicadas.</p>:null}
      <Button disabled={!enabled||!valid} onClick={()=>onSave(dailyResourceRouteTransitionsSchema.parse(candidate))}>Guardar ruta de recurso</Button>
      <Button variant="outline" onClick={()=>setOpen(false)}>Cancelar ruta</Button>
    </fieldset>:null}
    {value.at?<p>Declaración diaria · {value.at} · {value.by}</p>:null}
  </div>;
}
