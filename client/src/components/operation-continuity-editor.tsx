import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { ContinuityGroup, ContinuityEdit } from "@shared/operationContinuity";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const path="/api/operation-continuity-groups";
function Policy({value,onChange,disabled=false}:{value:ContinuityGroup["policy"];onChange:(policy:ContinuityGroup["policy"])=>void;disabled?:boolean}) {
  return <select aria-label="Política de continuidad" className="rounded border bg-background p-2" value={value} disabled={disabled} onChange={event=>onChange(event.target.value as ContinuityGroup["policy"])}>
    <option value="OFF">OFF · Sin continuidad ni penalización</option><option value="PREFERRED">PREFERRED · Minimizar huecos</option><option value="REQUIRED">REQUIRED · Continuidad obligatoria</option>
  </select>;
}
export function ContinuityGroupPicker({value,onChange,disabled=false}:{value:string|null;onChange:(id:string|null)=>void;disabled?:boolean}) {
  const query=useQuery<ContinuityGroup[]>({queryKey:[path]});
  const qc=useQueryClient();
  const selected=query.data?.find(group=>group.id===value);
  const [creating,setCreating]=React.useState(false),[name,setName]=React.useState(""),[policy,setPolicy]=React.useState<ContinuityGroup["policy"]>("OFF"),[weight,setWeight]=React.useState(1),[pending,setPending]=React.useState(false),[error,setError]=React.useState("");
  React.useEffect(()=>{setName(selected?.name??"");setPolicy(selected?.policy??"OFF");setWeight(selected?.gapWeight??1);},[selected]);
  const save=async()=>{
    setPending(true);setError("");
    try {
      const id=creating?crypto.randomUUID():selected!.id;
      await apiRequest("PUT",`${path}/${id}`,{name,policy,gapWeight:weight,expectedRevision:creating?null:selected!.revision});
      await qc.invalidateQueries({queryKey:[path]});onChange(id);setCreating(false);
    } catch(error:any) {setError(error.message);} finally {setPending(false);}
  };
  return <fieldset className="space-y-3 rounded border p-3" disabled={disabled||pending}>
    <legend className="font-medium">Agrupación y continuidad</legend>
    <p className="text-sm text-muted-foreground">Planner Next aplica esta política a auxiliares físicos de una misma sala, de una o varias plantillas. Requiere una jornada con Next configurado; cada día conserva su configuración original.</p>
    {query.isError?<p role="alert">No se pudieron cargar los grupos.</p>:<label className="block">Grupo operativo <select aria-label="Grupo operativo" className="ml-2 rounded border bg-background p-2" disabled={query.isLoading} value={value??""} onChange={event=>{onChange(event.target.value||null);setCreating(false);}}>
      <option value="">Sin grupo (OFF)</option>{query.data?.map(group=><option key={group.id} value={group.id}>{group.name} · {group.policy}</option>)}
    </select></label>}
    <Button type="button" variant="outline" onClick={()=>{setCreating(true);setName("");setPolicy("OFF");setWeight(1);}}>Crear grupo</Button>
    {creating||selected?<div className="space-y-2">
      <Label>Nombre del grupo<Input aria-label="Nombre del grupo" value={name} maxLength={120} onChange={event=>setName(event.target.value)}/></Label>
      <Policy value={policy} onChange={setPolicy}/>
      {policy==="PREFERRED"?<Label>Puntos por minuto de hueco<Input aria-label="Puntos por minuto de hueco" type="number" min={1} max={1000} value={weight} onChange={event=>setWeight(Number(event.target.value))}/></Label>:null}
      <Button type="button" disabled={!name.trim()||!Number.isInteger(weight)||weight<1||weight>1000} onClick={save}>{creating?"Guardar grupo nuevo":"Guardar grupo para futuras jornadas"}</Button>
      <p className="text-xs text-muted-foreground">Los cambios del grupo afectan a todas sus plantillas para jornadas nuevas. Guarda también la plantilla para confirmar su asignación.</p>
    </div>:null}
    {error?<p role="alert">{error}</p>:null}
    <p className="text-xs text-muted-foreground">Agrupación por montaje/setup: utiliza familias, bloques, preparación y reentrada del contrato de setup. Se consulta en la configuración efectiva del día; su edición general no está disponible aquí.</p>
  </fieldset>;
}

type DailyGroup=NonNullable<import("@shared/effectiveConfigurationContracts").EffectiveConfigurationView["operationContinuity"]>["groups"][number];
export function DailyContinuityGroup({group,canEdit,pending,onSave,onRestore}:{group:DailyGroup;canEdit:boolean;pending:boolean;onSave:(value:ContinuityEdit)=>void;onRestore:()=>void}) {
  const [policy,setPolicy]=React.useState(group.policy),[weight,setWeight]=React.useState(group.gapWeight);
  return <div className="space-y-2 rounded border p-3"><h4 className="font-medium">{group.name}</h4>
    <p className="text-sm">{group.taskIds.length} tareas · {group.source==="DAY_OVERRIDE"?"Modificado para este día":"Original del día"} · Original: {group.baseline.policy}</p>
    {canEdit?<><Policy value={policy} onChange={setPolicy} disabled={pending}/>{policy==="PREFERRED"?<Input aria-label="Puntos por minuto de hueco" type="number" min={1} max={1000} value={weight} disabled={pending} onChange={event=>setWeight(Number(event.target.value))}/>:null}
      <Button type="button" disabled={pending||!Number.isInteger(weight)||weight<1||weight>1000||policy===group.policy&&weight===group.gapWeight} onClick={()=>onSave({groupId:group.id,policy,gapWeight:weight})}>Guardar continuidad del día</Button>
      {group.source==="DAY_OVERRIDE"?<Button type="button" variant="outline" disabled={pending} onClick={onRestore}>Restaurar original</Button>:null}</>:<p>Continuidad efectiva: {group.policy}</p>}
  </div>;
}
