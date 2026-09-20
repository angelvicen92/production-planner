import { useQuery } from "@tanstack/react-query";
import React from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EffectiveConfigurationView, EffectiveConfigurationValue } from "../../../server/effectiveConfigurationView";

export const sourceLabels = {INHERITED:"Heredado",DAY_OVERRIDE:"Modificado para este día",INSTANCE_OVERRIDE:"Modificado en esta entidad",PROTECTED:"Protegido",UNKNOWN:"Origen no disponible"} as const;
export function SourceBadge({source}:{source:EffectiveConfigurationValue["source"]}){return <Badge variant="outline">{sourceLabels[source]}</Badge>}
export function SeverityBadge({severity}:{severity?:string}){return severity?<Badge variant={severity==="REQUIRED"?"destructive":"secondary"}>{severity==="REQUIRED"?"Obligatorio":severity==="PREFERRED"?"Preferente":"Desactivado"}</Badge>:null}
export function CapabilityStatus({value}:{value:EffectiveConfigurationValue}){
  const label=value.validationStatus==="UNSUPPORTED"?"Aún no soportado":value.availability==="UNKNOWN"?"No configurado":value.validationStatus==="INCOMPATIBLE"?"Incompatible":"Disponible";
  return <Badge variant={value.validationStatus==="INCOMPATIBLE"?"destructive":"secondary"}>{label}</Badge>;
}
function valueSummary(value:EffectiveConfigurationValue){
  if(value.availability==="UNAVAILABLE")return "Esta capacidad aún no tiene un valor productivo.";
  if(value.availability==="UNKNOWN")return "La autoridad actual no permite determinar el valor sin inventarlo.";
  const v=value.value as any;
  if(value.capabilityId==="WORKDAY_GRID")return `${v.start}–${v.end}`;
  if(value.capabilityId==="MEALS_BY_SCOPE")return `${v.window?.start ?? "—"}–${v.window?.end ?? "—"} · ${v.mode==="flexible_meal_window"?"ventana flexible":"pausa global"}`;
  if(value.capabilityId==="PARTICIPANTS")return `${v.count} participantes · ${v.availabilityOverrides} excepciones de disponibilidad`;
  if(value.capabilityId==="TASKS_DEPENDENCIES")return `${v.tasks} tareas · ${v.dependencies} dependencias`;
  if(value.capabilityId==="SPACES_CAPACITY")return `${v.zones} platós · ${v.spaces} espacios · ${v.explicitCapacities} capacidades explícitas`;
  if(value.capabilityId==="RESOURCES")return `${v.items} recursos · ${v.taskRequirements} tareas con necesidades`;
  if(value.capabilityId==="ITINERANT_UNITS")return `${v.availabilityRules} reglas de disponibilidad`;
  if(value.capabilityId==="PROTECTED_STATE_LOCKS")return `${v.locks} locks · ${v.protectedTasks} tareas protegidas`;
  if(value.capabilityId==="OPTIMIZATION")return `${v.editingMode==="ADVANCED"?"Modo avanzado":"Modo básico"}`;
  if(value.capabilityId==="TRANSPORT")return "Configuración de transporte materializada";
  return "Valor disponible en la autoridad productiva";
}
export function EffectiveValueField({value}:{value:EffectiveConfigurationValue}){return <div className="rounded-lg border p-3 space-y-2" data-testid={`effective-${value.capabilityId}`}><div className="flex flex-wrap items-center gap-2"><h4 className="font-medium">{value.label}</h4><CapabilityStatus value={value}/><SourceBadge source={value.source}/><SeverityBadge severity={value.severity}/></div><p className="text-sm">{valueSummary(value)}</p>{value.fingerprint?<p className="text-xs text-muted-foreground">Huella efectiva disponible</p>:null}</div>}
export function ReadinessSummary({readiness}:{readiness:EffectiveConfigurationView["readiness"]}){
  const ready=readiness.status==="READY"; return <Card className={ready?"border-emerald-300":"border-amber-400"}><CardContent className="pt-5 flex gap-3">{ready?<CheckCircle2 className="text-emerald-600" aria-hidden/>:<AlertTriangle className="text-amber-600" aria-hidden/>}<div><strong>{ready?"Configuración disponible para revisión":"La configuración necesita atención"}</strong><p className="text-sm text-muted-foreground">{ready?"Las comprobaciones causales actuales no detectan datos incompletos ni incompatibles. Revisa sólo las excepciones del día.":`${readiness.issues.length} categoría(s) requieren revisión.`}</p>{readiness.issues.map(i=><a key={i.capabilityId} className="block text-sm underline" href={`#config-${i.navigationTarget}`}>{i.category}: {i.message}</a>)}</div></CardContent></Card>;
}
const categoryOrder=["Jornada y comidas","Participantes","Tareas","Platós y espacios","Recursos","Transporte","Operaciones y coordinación","Reglas de planificación","Avanzado"] as const;
export function DayConfiguration({planId}:{planId:number}){
  const query=useQuery<EffectiveConfigurationView>({queryKey:["effective-configuration",planId],queryFn:async()=>{const response=await fetch(`/api/plans/${planId}/effective-configuration`,{credentials:"include"});if(!response.ok)throw new Error("No se pudo consultar la configuración efectiva");return response.json();}});
  if(query.isLoading)return <p role="status">Cargando configuración efectiva…</p>;
  if(query.error||!query.data)return <Card><CardContent className="pt-5 flex gap-2"><CircleHelp aria-hidden/><span>No se pudo consultar la configuración del día.</span></CardContent></Card>;
  return <section aria-labelledby="day-config-title" className="space-y-4"><div><h2 id="day-config-title" className="text-xl font-semibold flex items-center gap-2"><Settings2 aria-hidden/>Configuración del día</h2><p className="text-sm text-muted-foreground">Al crear un día se materializa automáticamente la configuración aplicable. Esta vista sirve para revisar excepciones; no necesitas volver a configurar la jornada.</p></div><ReadinessSummary readiness={query.data.readiness}/>{categoryOrder.map(category=>{const values=query.data.values.filter(v=>v.category===category);return <Card id={`config-${category}`} key={category}><CardHeader><CardTitle className="text-base">{category}</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{values.map(value=><EffectiveValueField key={value.capabilityId} value={value}/>)}</CardContent></Card>})}</section>;
}
