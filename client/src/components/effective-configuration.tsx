import { MainFlowPreferenceEditor } from "./main-flow-preference-editor";
import { useUserRole } from "@/hooks/use-user-role";
import type { MainFlowPreference } from "@shared/mainFlowPreference";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { planQueryKey } from "@/lib/plan-query-keys";
import { DayCapabilityEditor } from "./day-workspace/day-capability-editor";
import type { DayTab } from "./day-workspace/day-workspace-shell";
import type { DayConfigEdit, DayConfigRestore } from "@shared/dayConfig";
import type { EffectiveConfigurationView, EffectiveConfigurationValue } from "../../../shared/effectiveConfigurationContracts";

export { SourceBadge, SeverityBadge, CapabilityStatus, EffectiveValueField, ReadinessSummary, sourceLabels } from "./day-workspace/effective-configuration-fields";
import { EffectiveValueField, ReadinessSummary } from "./day-workspace/effective-configuration-fields";
const configurationErrorMessage=(error:Error)=>error.message.includes("STALE_")?"La configuración ha cambiado durante la operación. Recarga la vista y revisa el valor vigente antes de reintentar.":error.message;
const restoreCapability = (id: string): DayConfigRestore["capability"] => id === "TRANSITIONS" ? "PARTICIPANT_TRANSITION" : id as DayConfigRestore["capability"];
const editableIds = new Set(["WORKDAY_WINDOW", "GLOBAL_MEAL_BREAK", "TRANSITIONS", "OPTIMIZATION", "BLOCK_COUNT_POLICY"]);
export function DayConfiguration({planId,onNavigate}:{planId:number;onNavigate?:(tab:DayTab)=>void}) {
  const queryClient=useQueryClient(); const {role}=useUserRole(); const canEdit=role==="admin"||role==="production";
  const [notice,setNotice]=React.useState<string|null>(null);
  const query=useQuery<EffectiveConfigurationView>({queryKey:["effective-configuration",planId],queryFn:()=>apiRequest<EffectiveConfigurationView>("GET",`/api/plans/${planId}/effective-configuration`)});
  const operation=useMutation({
    mutationFn:({method,path,payload}:{method:string;path:string;payload:unknown})=>apiRequest(method,`/api/plans/${planId}/day-configuration${path}`,payload),
    onSuccess:async()=>{setNotice("Configuración guardada. Este cambio requiere volver a validar el borrador.");await Promise.all([queryClient.invalidateQueries({queryKey:["effective-configuration",planId]}),queryClient.invalidateQueries({queryKey:["assisted-planning",planId]}),queryClient.invalidateQueries({queryKey:planQueryKey(planId)})]);},
  });
  const edit=(payload:DayConfigEdit)=>{if(canEdit&&!operation.isPending)operation.mutate({method:"PUT",path:"",payload});};
  const restore=(id:string)=>{if(canEdit&&!operation.isPending&&window.confirm("Se retirará la modificación de esta jornada y se restaurará su valor heredado. Será necesario volver a validar el borrador. ¿Continuar?"))operation.mutate({method:"POST",path:"/restore",payload:{capability:restoreCapability(id)}});};
  const refresh=(value:EffectiveConfigurationValue)=>{
    if(!canEdit||operation.isPending)return;
    if(window.confirm(`Se actualizará la herencia de «${value.label}» desde la configuración habitual. Los overrides diarios se conservarán; los valores migrados adoptarán explícitamente la configuración general. Será necesario volver a validar. ¿Continuar?`))operation.mutate({method:"POST",path:"/refresh",payload:{capabilities:[restoreCapability(value.capabilityId)],legacyTreatment:"ADOPT_GENERAL_AS_INHERITED"}});
  };
  if(query.isLoading)return <div role="status" className="animate-pulse rounded-xl border bg-muted/30 p-8">Cargando configuración efectiva…</div>;
  if(query.error||!query.data){const error=query.error as Error&{status?:number;code?:string};return <section className="space-y-3 rounded-xl border border-destructive/30 bg-card p-6" role="alert"><h2 className="text-lg font-semibold">No se pudo consultar la configuración del día</h2><p className="text-sm text-muted-foreground">{error?.status===403?"Tu perfil no tiene acceso a esta configuración.":error?.status===401?"La sesión ha caducado. Vuelve a iniciar sesión.":"La consulta no ha devuelto una configuración verificable. Reintenta para comprobar la conexión y el estado de esta jornada."}</p><Button variant="outline" disabled={query.isFetching} onClick={()=>void query.refetch()}>Reintentar configuración</Button>{role==="admin"?<details className="text-xs"><summary>Detalles de la petición fallida</summary><p className="mt-2 break-all">GET /api/plans/{planId}/effective-configuration · HTTP {error?.status??"sin respuesta"}</p><p>{error?.message??"Respuesta sin datos"}</p></details>:null}</section>;}
  const data=query.data;
  const values=data.values;
  const revision=values.find(value=>value.effectiveRevision)?.effectiveRevision;
  const section=(title:string,ids:string[])=><section className="space-y-4 rounded-xl border bg-card p-5" aria-label={title}><h3 className="font-semibold">{title}</h3><div className="grid gap-4 lg:grid-cols-2">{values.filter(value=>ids.includes(value.capabilityId)).map(value=><div key={value.capabilityId} id={`config-${value.capabilityId}`} className="space-y-3"><EffectiveValueField value={value}/>{value.capabilityId==="BLOCK_COUNT_POLICY"?data.mainFlowPreference?.available?<MainFlowPreferenceEditor value={data.mainFlowPreference.value} counts={data.mainFlowPreference.counts} zeroBeforeRepresentable={data.mainFlowPreference.zeroBeforeRepresentable} mealApplicable={data.mainFlowPreference.mealApplicable} disabled={!canEdit||operation.isPending} saving={operation.isPending} onSave={mainFlowPreference=>edit({mainFlowPreference})}/>:<p className="text-sm text-muted-foreground">Este día no tiene un flujo principal Next configurado al que aplicar la estructura.</p>:editableIds.has(value.capabilityId)&&value.availability==="AVAILABLE"?<DayCapabilityEditor value={value} disabled={!canEdit||operation.isPending} onSave={edit}/>:null}{editableIds.has(value.capabilityId)&&canEdit?<div className="flex flex-wrap gap-2">{value.canRestoreInherited?<Button size="sm" variant="outline" disabled={operation.isPending} onClick={()=>restore(value.capabilityId)}>Restaurar heredado</Button>:null}{value.baseline!=null&&value.defaultGeneral!=null?<Button size="sm" variant="ghost" disabled={operation.isPending} onClick={()=>refresh(value)}>Actualizar herencia desde configuración general</Button>:null}</div>:null}</div>)}</div></section>;
  return <section aria-labelledby="day-config-title" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="day-config-title" className="text-xl font-semibold">Configuración del día</h2><p className="mt-1 text-sm text-muted-foreground">Revisa las excepciones de hoy sobre los valores heredados. Los cambios se guardan exclusivamente en esta jornada.</p></div><div className="flex gap-2"><Badge variant="outline">Revisión {revision??"no disponible"}</Badge><Badge variant="secondary">{values.filter(value=>value.source==="DAY_OVERRIDE").length} modificaciones del día</Badge></div></div>
    <ReadinessSummary readiness={data.readiness}/>
    {!canEdit?<p className="text-sm text-muted-foreground">Tu perfil permite consultar. La edición corresponde a Producción y Administración.</p>:<p className="rounded-lg border border-amber-400/40 bg-amber-500/5 p-3 text-sm">Cada cambio crea una revisión y requiere volver a validar el borrador. Las etapas conservan su configuración de origen.</p>}
    {notice?<p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>:null}{operation.error?<p role="alert" className="text-sm text-destructive">No se pudo guardar. {configurationErrorMessage(operation.error)}</p>:null}
    {section("Jornada y descansos",["WORKDAY_WINDOW","GLOBAL_MEAL_BREAK"])}
    {section("Flujo principal y bloques",["MAIN_FLOW","BLOCK_COUNT_POLICY"])}
    {section("Reglas y márgenes",["TRANSITIONS"])}
    {section("Optimización",["OPTIMIZATION"])}
    <section className="rounded-xl border bg-card p-5"><h3 className="font-semibold">Configuración efectiva complementaria</h3><p className="my-2 text-sm text-muted-foreground">Los datos y asignaciones se editan en sus secciones operativas.</p><div className="flex flex-wrap gap-2">{([["tasks","Concursantes y tareas"],["resources","Recursos del día"],["staff","Responsables"],["planning","Volver a Planning"]] as const).map(([tab,label])=><Button key={tab} variant="outline" size="sm" onClick={()=>onNavigate?.(tab)}>{label}</Button>)}</div></section>
    <details className="rounded-xl border bg-muted/10 p-4"><summary className="cursor-pointer font-medium">Capacidades y diagnóstico avanzado</summary><p className="my-3 text-sm text-muted-foreground">Inventario de cobertura del producto. Una capacidad parcial o pendiente no se presenta como un ajuste disponible.</p><div className="grid gap-3 md:grid-cols-2">{values.filter(value=>!editableIds.has(value.capabilityId)&&value.capabilityId!=="MAIN_FLOW").map(value=><EffectiveValueField key={value.capabilityId} value={value}/>)}</div></details>
  </section>;
}
