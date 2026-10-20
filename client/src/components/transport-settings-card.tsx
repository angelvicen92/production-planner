import { SettingsSection } from "@/components/settings/settings-section";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";
import { transportBoundsSchema } from "@shared/transportPolicy";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TransportPolicyFields } from "./transport-policy-fields";

export function TransportSettingsCard() {
  const qc=useQueryClient(),{toast}=useToast();
  const [draft,setDraft]=useState<Record<string,any>|null>(null);
  const [saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
  const settingsQ=useQuery<any>({queryKey:[api.optimizerSettings.get.path],queryFn:()=>apiRequest('GET',api.optimizerSettings.get.path)});
  const templatesQ=useQuery<any[]>({queryKey:[api.taskTemplates.list.path],queryFn:()=>apiRequest('GET',api.taskTemplates.list.path)});
  useEffect(()=>{
    if(!settingsQ.data)return;
    const fields=['arrivalTaskTemplateName','departureTaskTemplateName','arrivalMinimumGroupSize','departureMinimumGroupSize','arrivalGroupingTarget','departureGroupingTarget','arrivalMaximumGroupSize','departureMaximumGroupSize','arrivalMinGapMinutes','departureMinGapMinutes','vanCapacity','weightArrivalDepartureGrouping'];
    setDraft(Object.fromEntries(fields.map(field=>[field,settingsQ.data[field]??(field.endsWith('Name')?'':field.endsWith('GroupSize')?null:0)])));
  },[settingsQ.data]);
  if(settingsQ.error)return <p role="alert">Error cargando transporte</p>;
  if(!draft)return <Loader2 className="h-6 w-6 animate-spin"/>;
  const update=(patch:Record<string,unknown>)=>setDraft(previous=>({...previous,...patch}));
  const save=async()=>{
    const parsed=api.optimizerSettings.update.input.safeParse(draft);
    const bounds=transportBoundsSchema.safeParse(draft);
    if(!parsed.success||!bounds.success){setError(bounds.error?.issues[0]?.message??'Revisa los valores: usa enteros no negativos y mínimos/máximos positivos.');return;}
    setSaving(true);setError(null);
    try{await apiRequest('PATCH',api.optimizerSettings.update.path,parsed.data);await qc.invalidateQueries({queryKey:[api.optimizerSettings.get.path]});toast({title:'Transporte guardado'});}
    catch(err:any){setError(err.message??'No se pudo guardar el transporte');}
    finally{setSaving(false);}
  };
  return <SettingsSection section="transport" title="Transporte" busy={saving} error={!!error}>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Configuración general para días nuevos. Las jornadas existentes conservan su configuración efectiva hasta una actualización explícita.</p>
      <div className="grid gap-3 md:grid-cols-2">{([['arrival','Llegada IN'],['departure','Salida OUT']] as const).map(([direction,label])=><label key={direction} className="text-sm">Plantilla {label}
        <select aria-label={`Plantilla ${label}`} disabled={saving} className="mt-1 block w-full rounded-md border bg-background p-2" value={draft[`${direction}TaskTemplateName`]} onChange={event=>update({[`${direction}TaskTemplateName`]:event.target.value})}>
          <option value="">Sin plantilla</option>{(templatesQ.data??[]).map(template=><option key={template.id} value={template.name}>{template.name}</option>)}
        </select></label>)}</div>
      <TransportPolicyFields value={draft} disabled={saving} onChange={update}/>
      <div className="grid gap-3 md:grid-cols-2">{([['vanCapacity','Capacidad de vehículo'],['weightArrivalDepartureGrouping','Peso agrupación (0-10)']] as const).map(([field,title])=><label key={field} className="text-sm">{title}<Input aria-label={title} type="number" min={0} step={1} disabled={saving} value={draft[field]} onChange={event=>update({[field]:Number(event.target.value)})}/></label>)}</div>
      <p className="text-xs text-muted-foreground">Si no se declara un máximo por dirección, se utiliza la capacidad del vehículo. Un máximo explícito por dirección gobierna esa dirección y puede diferir de la capacidad heredada del vehículo.</p>
      {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
      <Button disabled={saving} onClick={()=>void save()}>Guardar transporte</Button>
    </CardContent>
  </SettingsSection>;
}
