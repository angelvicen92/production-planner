import { RoundSynchronizationEditor } from "./round-synchronization-editor";
import { DailyItinerantCompositions } from './daily-itinerant-compositions';
import { DailyContinuityGroup } from "./operation-continuity-editor";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PersistedDaySection } from "./day-workspace/day-collapsible-section";
import type { DaySection } from "@/lib/day-section-preferences";
import { MainFlowPreferenceEditor } from "./main-flow-preference-editor";
import { RoundPreparationEditor } from "./round-preparation-editor";
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
const configurationErrorMessage=(error:Error)=>error.message.includes("STALE_CONFIG_SOURCES")?"Edición bloqueada por concurrencia. Espera al otro cambio, recarga y revisa la configuración antes de reintentar.":error.message.includes("ROUND_STRUCTURE_PROTECTED")?"Edición bloqueada: la estructura contradice decisiones aceptadas, ejecutadas o con locks.":/ROUND_STRUCTURE_(DIRTY_DRAFT|PENDING_PROPOSAL)/.test(error.message)?"Edición bloqueada: descarta o resuelve la propuesta y el borrador antes de modificar rondas.":error.message.includes("UNSUPPORTED_ROUND_STRUCTURE")?"NO SOPORTADO: revisa duración uniforme, rol auxiliar con participante, espacios, miembros y preparación en múltiplos de cinco.":error.message.includes("STALE_")?"La configuración ha cambiado durante la operación. Recarga la vista y revisa el valor vigente antes de reintentar.":error.message;
const restoreCapability = (id: string): DayConfigRestore["capability"] => id === "TRANSITIONS" ? "PARTICIPANT_TRANSITION" : id as DayConfigRestore["capability"];
const editableIds = new Set(["WORKDAY_WINDOW", "GLOBAL_MEAL_BREAK", "TRANSITIONS", "OPTIMIZATION", "BLOCK_COUNT_POLICY"]);
export function DayConfiguration({planId,onNavigate}:{planId:number;onNavigate?:(tab:DayTab)=>void}) {
  const queryClient=useQueryClient(); const {role}=useUserRole(); const canEdit=role==="admin"||role==="production";
  const confirm=useConfirm();
  const decision=React.useRef(false);
  const decisionGeneration=React.useRef(0);
  React.useEffect(()=>()=>{decisionGeneration.current++;},[planId]);
  const latest=React.useRef({canEdit,pending:false,planId});
  const [notice,setNotice]=React.useState<string|null>(null);
  const query=useQuery<EffectiveConfigurationView>({queryKey:["effective-configuration",planId],queryFn:()=>apiRequest<EffectiveConfigurationView>("GET",`/api/plans/${planId}/effective-configuration`)});
  const operation=useMutation({
    mutationFn:({method,path,payload}:{method:string;path:string;payload:unknown})=>apiRequest(method,`/api/plans/${planId}/day-configuration${path}`,payload),
    onSuccess:async()=>{setNotice("Configuración guardada. Este cambio requiere volver a validar el borrador.");await Promise.all([queryClient.invalidateQueries({queryKey:["effective-configuration",planId]}),queryClient.invalidateQueries({queryKey:["assisted-planning",planId]}),queryClient.invalidateQueries({queryKey:planQueryKey(planId)})]);},
    onError:()=>{void queryClient.invalidateQueries({queryKey:["effective-configuration",planId]});},
  });
  const edit=(payload:DayConfigEdit)=>{if(canEdit&&!operation.isPending)operation.mutate({method:"PUT",path:"",payload});};
  latest.current={canEdit,pending:operation.isPending,planId};
  const consent=async(options:Parameters<typeof confirm>[0])=>{
    if(!canEdit||operation.isPending||decision.current)return false;
    decision.current=true;
    const generation=decisionGeneration.current;
    try {return await confirm(options)&&generation===decisionGeneration.current&&latest.current.canEdit&&!latest.current.pending&&latest.current.planId===planId;}
    finally {decision.current=false;}
  };
  const restore=async(id:string)=>{if(await consent({title:"Restaurar configuración heredada",description:"Se retirará la modificación de esta jornada y se restaurará su valor heredado. Será necesario volver a validar el borrador.",confirmText:"Restaurar"}))operation.mutate({method:"POST",path:"/restore",payload:{capability:restoreCapability(id)}});};
  const refresh=async(value:EffectiveConfigurationValue)=>{
    if(await consent({title:"Actualizar herencia",description:`Se actualizará «${value.label}» desde la configuración habitual. Será necesario volver a validar el borrador.`,secondaryText:"Se conservarán las modificaciones diarias; los valores migrados adoptarán la configuración general.",confirmText:"Actualizar herencia"}))operation.mutate({method:"POST",path:"/refresh",payload:{capabilities:[restoreCapability(value.capabilityId)],legacyTreatment:"ADOPT_GENERAL_AS_INHERITED"}});
  };
  if(query.isLoading)return <div role="status" className="animate-pulse rounded-xl border bg-muted/30 p-8">Cargando configuración efectiva…</div>;
  if(query.error||!query.data){const error=query.error as Error&{status?:number;code?:string};return <section className="space-y-3 rounded-xl border border-destructive/30 bg-card p-6" role="alert"><h2 className="text-lg font-semibold">No se pudo consultar la configuración del día</h2><p className="text-sm text-muted-foreground">{error?.status===403?"Tu perfil no tiene acceso a esta configuración.":error?.status===401?"La sesión ha caducado. Vuelve a iniciar sesión.":"La consulta no ha devuelto una configuración verificable. Reintenta para comprobar la conexión y el estado de esta jornada."}</p><Button variant="outline" disabled={query.isFetching} onClick={()=>void query.refetch()}>Reintentar configuración</Button>{role==="admin"?<details className="text-xs"><summary>Detalles de la petición fallida</summary><p className="mt-2 break-all">GET /api/plans/{planId}/effective-configuration · HTTP {error?.status??"sin respuesta"}</p><p>{error?.message??"Respuesta sin datos"}</p></details>:null}</section>;}
  const data=query.data;
  const values=data.values;
  const revision=values.find(value=>value.effectiveRevision)?.effectiveRevision;
  const section=(id:DaySection,title:string,ids:string[])=><PersistedDaySection planId={planId} section={id} title={title} anchorIds={ids.map(id=>`config-${id}`)}><div className="grid gap-4 lg:grid-cols-2">{values.filter(value=>ids.includes(value.capabilityId)).map(value=><div key={value.capabilityId} id={`config-${value.capabilityId}`} className="space-y-3"><EffectiveValueField value={value}/>{value.capabilityId==="BLOCK_COUNT_POLICY"?data.mainFlowPreference?.available?<MainFlowPreferenceEditor value={data.mainFlowPreference.value} counts={data.mainFlowPreference.counts} zeroBeforeRepresentable={data.mainFlowPreference.zeroBeforeRepresentable} mealApplicable={data.mainFlowPreference.mealApplicable} disabled={!canEdit||operation.isPending} saving={operation.isPending} onSave={mainFlowPreference=>edit({mainFlowPreference})}/>:<p className="text-sm text-muted-foreground">Este día no tiene un flujo principal Next configurado al que aplicar la estructura.</p>:editableIds.has(value.capabilityId)&&value.availability==="AVAILABLE"?<DayCapabilityEditor value={value} disabled={!canEdit||operation.isPending} onSave={edit}/>:null}{editableIds.has(value.capabilityId)&&canEdit?<div className="flex flex-wrap gap-2">{value.canRestoreInherited?<Button size="sm" variant="outline" disabled={operation.isPending} onClick={()=>restore(value.capabilityId)}>Restaurar heredado</Button>:null}{value.baseline!=null&&value.defaultGeneral!=null?<Button size="sm" variant="ghost" disabled={operation.isPending} onClick={()=>refresh(value)}>Actualizar herencia desde configuración general</Button>:null}</div>:null}</div>)}</div></PersistedDaySection>;
  return <section aria-labelledby="day-config-title" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="day-config-title" className="text-xl font-semibold">Configuración del día</h2><p className="mt-1 text-sm text-muted-foreground">Revisa las excepciones de hoy sobre los valores heredados. Los cambios se guardan exclusivamente en esta jornada.</p></div><div className="flex gap-2"><Badge variant="outline">Revisión {revision??"no disponible"}</Badge><Badge variant="secondary">{values.filter(value=>value.source==="DAY_OVERRIDE").length+(data.roundPreparations?.lanes.filter(lane=>lane.source==="DAY_OVERRIDE").length??0)} modificaciones del día</Badge></div></div>
    <ReadinessSummary readiness={data.readiness}/>
    {data.plannerProfile?<p className="rounded border p-3 text-sm">Perfil Planner Next del día · Revisión general de origen {data.plannerProfile.sourceRevision} · {data.plannerProfile.configured?"Perfil estructural congelado al crear la jornada. Este snapshot se conserva aunque cambie la configuración general.":"Sin configuración estructural. Configura el perfil general antes de crear una jornada planificable."}</p>:null}
    {data.plannerProfile?.setupFamilies?<div className="rounded border p-3 text-sm"><h3 className="font-semibold">Montajes del día</h3>
      {data.plannerProfile.setupFamilies.policies.map(policy=><p key={policy.spaceId}>{data.plannerProfile!.setupSpaceLabels?.find(space=>space.id===policy.spaceId)?.name??`Espacio ${policy.spaceId}`} · {policy.orderConstraint==="EXPLICIT"?"Orden explícito":"Orden flexible"}: {(policy.familyOrder??policy.familyIds).map(id=>data.plannerProfile!.setupFamilies!.families.find(f=>f.id===id)?.name??String(id)).join(" → ")} · Preparación {policy.preparationMinutesBetweenFamilies} min · Continuidad {policy.continuityPolicy??"REQUIRED"} · Agrupación {policy.groupingPolicy??"REQUIRED"}.</p>)}
      <p className="text-muted-foreground">Una espera dentro de la misma familia no crea otro bloque. La configuración general sólo afecta a jornadas nuevas.</p>
    </div>:null}
    {!canEdit?<p className="text-sm text-muted-foreground">Tu perfil permite consultar. La edición corresponde a Producción y Administración.</p>:<p className="rounded-lg border border-amber-400/40 bg-amber-500/5 p-3 text-sm">Cada cambio crea una revisión y requiere volver a validar el borrador. Las etapas conservan su configuración de origen.</p>}
    {notice?<p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>:null}{operation.error?<p role="alert" className="text-sm text-destructive">No se pudo guardar. {configurationErrorMessage(operation.error)}</p>:null}
    {section("configuration-workday","Jornada y descansos",["WORKDAY_WINDOW","GLOBAL_MEAL_BREAK"])}
    {section("configuration-flow","Flujo principal y bloques",["MAIN_FLOW","BLOCK_COUNT_POLICY"])}
    {section("configuration-rules","Reglas y márgenes",["TRANSITIONS"])}
    <PersistedDaySection planId={planId} section="configuration-continuity" title="Agrupación y continuidad">
      {data.operationContinuity?.groups.length ? data.operationContinuity.groups.map(group=><DailyContinuityGroup key={`${group.id}:${data.operationContinuity!.revisionId}`} group={group} canEdit={canEdit} pending={operation.isPending}
        onSave={operationContinuity=>edit({operationContinuity,expectedRevisionId:data.operationContinuity!.revisionId})}
        onRestore={()=>operation.mutate({method:"POST",path:"/restore",payload:{capability:"OPERATION_CONTINUITY",operationContinuity:{groupId:group.id},expectedRevisionId:data.operationContinuity!.revisionId}})}/>) : <p className="text-sm text-muted-foreground">Esta jornada no tiene grupos de continuidad configurados.</p>}
    </PersistedDaySection>
    <PersistedDaySection planId={planId} section="configuration-rounds" title={data.roundSynchronization?"Rondas sincronizadas":"Preparación entre rondas"} anchorIds={["config-SYNCHRONIZED_ROUNDS"]}><div id="config-SYNCHRONIZED_ROUNDS">{data.roundSynchronization ? <RoundSynchronizationEditor key={`${planId}:${data.roundSynchronization.revisionId}`} value={data.roundSynchronization} canEdit={canEdit} pending={operation.isPending} onSave={roundSynchronization=>edit({roundSynchronization,expectedRevisionId:data.roundSynchronization!.revisionId})}/> : data.roundPreparations ? <RoundPreparationEditor key={`${planId}:${data.roundPreparations.revisionId}`} configuration={data.roundPreparations} canEdit={canEdit} pending={operation.isPending}
      onSave={(lane,minutes)=>edit({roundPreparation:{policyId:lane.policyId,spaceId:lane.spaceId,preparationMinutesBetweenRounds:minutes},expectedRevisionId:data.roundPreparations!.revisionId})}
      onRestore={async lane=>{if(await consent({title:"Restaurar preparación original",description:`Se recuperarán los ${lane.baselineMinutes} minutos del snapshot original de esta jornada para ${lane.spaceName}. Será necesario volver a validar el borrador.`,confirmText:"Restaurar"}))operation.mutate({method:"POST",path:"/restore",payload:{capability:"SYNCHRONIZED_ROUNDS",roundPreparation:{policyId:lane.policyId,spaceId:lane.spaceId},expectedRevisionId:data.roundPreparations!.revisionId}});}} /> : <p className="text-sm text-muted-foreground">No se pudo verificar la configuración de rondas de esta jornada.</p>}</div></PersistedDaySection>
    {data.itinerantComposition?<DailyItinerantCompositions {...data.itinerantComposition}/>:null}
    {section("configuration-optimization","Optimización y transporte",["OPTIMIZATION"])}
    <PersistedDaySection planId={planId} section="configuration-complementary" title="Configuración efectiva complementaria"><p className="my-2 text-sm text-muted-foreground">Los datos y asignaciones se editan en sus secciones operativas.</p><div className="flex flex-wrap gap-2">{([["tasks","Concursantes y tareas"],["resources","Recursos del día"],["staff","Responsables"],["planning","Volver a Planning"]] as const).map(([tab,label])=><Button key={tab} variant="outline" size="sm" onClick={()=>onNavigate?.(tab)}>{label}</Button>)}</div></PersistedDaySection>
    <PersistedDaySection planId={planId} section="configuration-capabilities" title="Capacidades y diagnóstico avanzado" anchorIds={values.filter(value=>!editableIds.has(value.capabilityId)&&value.capabilityId!=="MAIN_FLOW"&&value.capabilityId!=="SYNCHRONIZED_ROUNDS").map(value=>`config-${value.capabilityId}`)}><p className="my-3 text-sm text-muted-foreground">Inventario de cobertura del producto. Una capacidad parcial o pendiente no se presenta como un ajuste disponible.</p><div className="grid gap-3 md:grid-cols-2">{values.filter(value=>!editableIds.has(value.capabilityId)&&value.capabilityId!=="MAIN_FLOW"&&value.capabilityId!=="SYNCHRONIZED_ROUNDS").map(value=><div key={value.capabilityId} id={`config-${value.capabilityId}`}><EffectiveValueField value={value}/></div>)}</div></PersistedDaySection>
  </section>;
}
