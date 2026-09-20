import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import type { EffectiveConfigurationView, EffectiveConfigurationValue } from "../../../shared/effectiveConfigurationContracts";

export const sourceLabels = {INHERITED:"Heredado",DAY_OVERRIDE:"Modificado para este día",LEGACY_BACKFILL:"Migrado de configuración anterior",DAY_SNAPSHOT:"Valor materializado del día",MIXED:"Configuración diaria combinada",PROTECTED:"Protegido",UNKNOWN:"Origen desconocido"} as const;
export function SourceBadge({source}:{source:EffectiveConfigurationValue["source"]}){return <Badge variant="outline">{sourceLabels[source]}</Badge>}
export function SeverityBadge({severity}:{severity?:string}){return severity?<Badge variant={severity==="REQUIRED"?"destructive":"secondary"}>{severity==="REQUIRED"?"Obligatorio":severity==="PREFERRED"?"Preferente":"Desactivado"}</Badge>:null}
export function CapabilityStatus({value}:{value:EffectiveConfigurationValue}){
  const label=value.implementationStatus==="MISSING"?"Aún no disponible":value.implementationStatus==="BLOCKED"?"Pendiente de integración segura":value.implementationStatus==="NOT_APPLICABLE"?"Regla del sistema":value.implementationStatus==="PARTIAL"?"Soporte parcial":value.availability==="UNKNOWN"?"Origen no disponible":value.validationStatus==="INCOMPATIBLE"?"Incompatible":value.validationStatus==="INCOMPLETE"?"Falta configurar hoy":"Disponible";
  return <Badge variant={value.validationStatus==="INCOMPATIBLE"?"destructive":"secondary"}>{label}</Badge>;
}
function valueSummary(value:EffectiveConfigurationValue){
  if(value.availability==="UNAVAILABLE")return "Esta capacidad aún no tiene un valor productivo.";
  if(value.availability==="UNKNOWN")return "La autoridad actual no permite determinar el valor sin inventarlo.";
  const v=value.value as any;
  if(value.capabilityId==="WORKDAY_WINDOW")return `${v.start}–${v.end}`;
  if(value.capabilityId==="GLOBAL_MEAL_BREAK")return `${v.window?.start ?? "—"}–${v.window?.end ?? "—"} · ${v.mode==="flexible_meal_window"?"ventana flexible":"pausa global"}`;
  if(value.capabilityId==="PARTICIPANTS")return `${v.count} participantes · ${v.availabilityRules} excepciones de disponibilidad`;
  if(value.capabilityId==="TASKS_DEPENDENCIES")return `${v.tasks} tareas · ${v.dependencies} dependencias`;
  if(value.capabilityId==="SPATIAL_AVAILABILITY")return `${v.zones} platós · ${v.spaces} espacios`;
  if(value.capabilityId==="PLAN_RESOURCE_ASSIGNMENTS")return `${v.items} recursos · ${v.taskRequirements} tareas con necesidades`;
  if(value.capabilityId==="PROTECTED_STATE_LOCKS")return `${v.locks} locks · ${v.protectedTasks} tareas protegidas`;
  if(value.capabilityId==="OPTIMIZATION")return `${v.editingMode==="ADVANCED"?"Modo avanzado":"Modo básico"}`;
  return "Valor disponible en la autoridad productiva";
}
function formatDayValue(capabilityId:string,value:unknown){const item=value as {start?:string;end?:string;mode?:string;editingMode?:string;window?:{start?:string;end?:string}};if(capabilityId==="WORKDAY_WINDOW")return `${item.start ?? "—"}–${item.end ?? "—"}`;if(capabilityId==="GLOBAL_MEAL_BREAK"){const window=item.window??item;return `${window.start ?? "—"}–${window.end ?? "—"} · ${item.mode==="flexible_meal_window"?"Ventana flexible":"Parada global"}`;}if(capabilityId==="OPTIMIZATION")return item.editingMode==="ADVANCED"?"Modo avanzado":"Modo básico";return null;}
export function EffectiveValueField({value,onRestore,restoring}:{value:EffectiveConfigurationValue,onRestore?:()=>void,restoring?:boolean}){const needsAttention=value.blockers.length>0||value.implementationStatus!=="PRODUCTIVE";const baseline=formatDayValue(value.capabilityId,value.baseline);const general=formatDayValue(value.capabilityId,value.defaultGeneral);return <div className="rounded-lg border p-3 space-y-2" data-testid={`effective-${value.capabilityId}`}><div className="flex flex-wrap items-center gap-2"><h4 className="font-medium">{value.label}</h4><CapabilityStatus value={value}/><SourceBadge source={value.source}/><SeverityBadge severity={value.severity}/></div><p className="text-sm">{valueSummary(value)}</p>{baseline?<p className="text-xs text-muted-foreground">Heredado del día: {baseline}</p>:null}{general&&general!==baseline?<p className="text-xs text-muted-foreground">Configuración habitual actual: {general}</p>:null}{value.canRestoreInherited?<Button size="sm" variant="outline" disabled={restoring} onClick={onRestore}>Restaurar heredado</Button>:null}{needsAttention?<p className="text-xs text-amber-700">Esta opción requiere revisión antes de poder aplicarse con seguridad.</p>:null}{value.fingerprint?<p className="text-xs text-muted-foreground">Revisión {value.effectiveRevision ?? "—"} · huella {value.fingerprint.slice(0,8)}</p>:null}</div>}
export function ReadinessSummary({readiness}:{readiness:EffectiveConfigurationView["readiness"]}){
  const ready=readiness.status==="READY"; return <Card className={ready?"border-emerald-300":"border-amber-400"}><CardContent className="pt-5 flex gap-3">{ready?<CheckCircle2 className="text-emerald-600" aria-hidden/>:<AlertTriangle className="text-amber-600" aria-hidden/>}<div><strong>{ready?"Configuración disponible para revisión":"La configuración necesita atención"}</strong><p className="text-sm text-muted-foreground">{ready?"Las comprobaciones causales actuales no detectan datos incompletos ni incompatibles. Revisa sólo las excepciones del día.":`${readiness.issues.length} categoría(s) requieren revisión.`}</p>{readiness.issues.map(i=><a key={i.capabilityId} className="block text-sm underline" href={`#config-${categorySlugs[i.navigationTarget]}`}>{i.category}: {i.message}</a>)}</div></CardContent></Card>;
}
export const categorySlugs:Record<string,string>={"Jornada y comidas":"jornada-comidas","Participantes":"participantes","Tareas":"tareas","Platós y espacios":"platos-espacios","Recursos":"recursos","Transporte":"transporte","Operaciones y coordinación":"operaciones-coordinacion","Reglas de planificación":"reglas-planificacion","Avanzado":"avanzado"};
const categoryOrder=["Jornada y comidas","Participantes","Tareas","Platós y espacios","Recursos","Transporte","Operaciones y coordinación","Reglas de planificación","Avanzado"] as const;
export function DayConfiguration({planId}:{planId:number}){
  const queryClient=useQueryClient();
  const query=useQuery<EffectiveConfigurationView>({queryKey:["effective-configuration",planId],queryFn:async()=>{const response=await fetch(`/api/plans/${planId}/effective-configuration`,{credentials:"include"});if(!response.ok)throw new Error("No se pudo consultar la configuración efectiva");return response.json();}});
  const restore=useMutation({mutationFn:(capability:string)=>apiRequest("POST",`/api/plans/${planId}/day-configuration/restore`,{capability}),onSuccess:()=>queryClient.invalidateQueries({queryKey:["effective-configuration",planId]})});
  if(query.isLoading)return <p role="status">Cargando configuración efectiva…</p>;
  if(query.error||!query.data)return <Card><CardContent className="pt-5 flex gap-2"><CircleHelp aria-hidden/><span>No se pudo consultar la configuración del día.</span></CardContent></Card>;
  return <section aria-labelledby="day-config-title" className="space-y-4"><div><h2 id="day-config-title" className="text-xl font-semibold flex items-center gap-2"><Settings2 aria-hidden/>Configuración del día</h2><p className="text-sm text-muted-foreground">Al crear un día se materializa automáticamente la configuración aplicable. Esta vista sirve para revisar excepciones; no necesitas volver a configurar la jornada.</p></div><ReadinessSummary readiness={query.data.readiness}/>{categoryOrder.map(category=>{const values=query.data.values.filter(v=>v.category===category);return <Card id={`config-${categorySlugs[category]}`} key={category}><CardHeader><CardTitle className="text-base">{category}</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{values.map(value=><EffectiveValueField key={value.capabilityId} value={value} restoring={restore.isPending} onRestore={()=>restore.mutate(value.capabilityId)}/>)}</CardContent></Card>})}</section>;
}
