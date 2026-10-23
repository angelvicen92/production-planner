import {SetupFamiliesEditor} from "./setup-families-editor";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { newDayPlannerConfigurationSchema, type NewDayPlannerConfiguration } from "@shared/newDayPlannerConfiguration";
import { apiRequest } from "@/lib/api";
import { useSpaces } from "@/hooks/use-spaces";
import { useUserRole } from "@/hooks/use-user-role";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const path="/api/new-day-planner-configuration";
const initial:Extract<NewDayPlannerConfiguration,{scenario:"MAIN_WITH_VOCAL_FEEDER"}>={contractVersion:1,scenario:"MAIN_WITH_VOCAL_FEEDER",transport:"NONE",setup:"NONE",meals:"DAY_CONFIGURATION",
  searchPolicy:"EXACT_CONSTRUCTIVE",searchBudget:{bestK:3,maxBacktracks:50,maxPatterns:20,maxBranchExpansions:10_000},
  timeGridMinutes:5,resourceTransitionMinutes:0,mainFlow:{spaceId:0,preferredEnd:"",continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1}};

export function TemplatePlannerRole({rules,onChange,disabled=false}:{rules:any;onChange:(rules:any)=>void;disabled?:boolean}) {
  return <label className="block space-y-1">Rol operativo Planner Next
    <select aria-label="Rol operativo Planner Next" className="block w-full rounded border bg-background p-2" disabled={disabled}
      value={rules?.plannerNextOperation?.kind??""} onChange={event=>{
        const next={...(rules??{})};
        if(event.target.value)next.plannerNextOperation={contractVersion:1,kind:event.target.value};else delete next.plannerNextOperation;
        onChange(next);
      }}>
      <option value="">Sin configurar</option><option value="main">Actividad del flujo principal</option>
      <option value="vocal">Preparación vocal previa</option><option value="auxiliary">Actividad auxiliar del participante</option>
      <option value="technical">Operación técnica sin participante</option>
    </select>
  </label>;
}

export function NewDayPlannerEditor() {
  const query=useQuery<{revision:number;configuration:NewDayPlannerConfiguration|null}>({queryKey:[path]});
  const templates=useQuery<Array<{id:number;name:string}>>({queryKey:["/api/task-templates"]});
  const {data:spaceRows=[]}=useSpaces();const spaces=spaceRows as Array<{id:number;name:string}>;const {role}=useUserRole();const qc=useQueryClient();
  const [value,setValue]=useState<NewDayPlannerConfiguration>(initial),[revision,setRevision]=useState(0),[saved,setSaved]=useState(false);
  useEffect(()=>{if(query.data){setValue(query.data.configuration??initial);setRevision(query.data.revision);}},[query.data]);
  const save=useMutation({mutationFn:()=>apiRequest("PUT",path,{expectedRevision:revision,configuration:newDayPlannerConfigurationSchema.parse(value)}),
    onSuccess:async()=>{setSaved(true);await qc.invalidateQueries({queryKey:[path]});}});
  const main=(key:string,field:unknown)=>{setSaved(false);setValue(previous=>previous.scenario==="MAIN_WITH_VOCAL_FEEDER"?({...previous,mainFlow:{...previous.mainFlow,[key]:field}}):previous);};
  return <Card><CardHeader><CardTitle>Planner Next para nuevas jornadas</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm">Cada día conserva su configuración original. El perfil con flujo principal admite un flujo principal real, una preparación vocal previa y un coach asignado por participante, más actividades auxiliares y técnicas. Declara los roles, espacios y dependencias en las plantillas.</p>
    <p className="text-sm text-muted-foreground">STANDALONE_ONLY permite actividades auxiliares y técnicas sin flujo principal ni coach obligatorio. Las familias de montaje se admiten en auxiliares con participante y espacio físico exclusivo. Transporte utiliza las plantillas IN/OUT seleccionadas aquí y los parámetros de Transporte, congelados al crear cada jornada. La comida utiliza la configuración del día.</p>
    {value.scenario==="MAIN_WITH_VOCAL_FEEDER"?<p className="text-sm text-muted-foreground">Si hay una pausa global de comida, el fin preferido del flujo principal debe ser anterior o igual a su inicio.</p>:null}
    {query.isError?<p role="alert">No se pudo cargar la configuración. <Button variant="outline" onClick={()=>void query.refetch()}>Reintentar</Button></p>:null}
    <fieldset disabled={role!=="admin"||query.isLoading||query.isError||save.isPending} className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2">Perfil de la jornada<select aria-label="Perfil de la jornada" className="block w-full rounded border bg-background p-2" value={value.scenario} onChange={event=>{
        setSaved(false);
        setValue(previous=>{
          if(event.target.value==="STANDALONE_ONLY"){
            const {mainFlow:_,...common}=previous.scenario==="MAIN_WITH_VOCAL_FEEDER"?previous:{...previous,mainFlow:undefined};
            return {...common,scenario:"STANDALONE_ONLY",searchPolicy:"EXACT_CONSTRUCTIVE"};
          }
          return {...previous,scenario:"MAIN_WITH_VOCAL_FEEDER",mainFlow:initial.mainFlow!};
        });
      }}><option value="MAIN_WITH_VOCAL_FEEDER">Flujo principal con preparación vocal</option><option value="STANDALONE_ONLY">Sólo actividades auxiliares y técnicas</option></select></label>
      {value.scenario==="MAIN_WITH_VOCAL_FEEDER"?<>
      <label>Espacio del flujo principal<select aria-label="Espacio del flujo principal" className="block w-full rounded border bg-background p-2" value={value.mainFlow.spaceId||""} onChange={event=>main("spaceId",Number(event.target.value))}>
        <option value="">Seleccionar espacio real</option>{spaces.map(space=><option key={space.id} value={space.id}>{space.name}</option>)}
      </select></label>
      <label>Fin preferido del flujo principal<Input aria-label="Fin preferido del flujo principal" type="time" step={300} value={value.mainFlow.preferredEnd} onChange={event=>main("preferredEnd",event.target.value)}/></label>
      <label>Máximo de bloques por coach<Input aria-label="Máximo de bloques por coach" type="number" min={1} value={value.mainFlow.maxBlocksByKey} onChange={event=>main("maxBlocksByKey",Number(event.target.value))}/></label>
      <label>Mínimo de tareas por bloque<Input aria-label="Mínimo de tareas por bloque" type="number" min={1} value={value.mainFlow.minTasksPerBlock} onChange={event=>main("minTasksPerBlock",Number(event.target.value))}/></label>
      </>:null}
      <label className="sm:col-span-2">Transporte de la jornada<select aria-label="Transporte de la jornada" className="block w-full rounded border bg-background p-2" value={value.transport==="NONE"?"NONE":"IN_OUT"} onChange={event=>{
        setSaved(false);setValue({...value,transport:event.target.value==="NONE"?"NONE":{arrivalTemplateId:0,departureTemplateId:0}});
      }}><option value="NONE">Sin transporte</option><option value="IN_OUT">Llegada IN y salida OUT</option></select></label>
      {value.transport!=="NONE"?([['arrival','Llegada IN'],['departure','Salida OUT']] as const).map(([direction,label])=><label key={direction}>Plantilla de jornada {label}
        <select aria-label={`Plantilla de jornada ${label}`} className="block w-full rounded border bg-background p-2" value={value.transport!=="NONE"?value.transport[`${direction}TemplateId`]||"":""} onChange={event=>{
          if(value.transport!=="NONE"){setSaved(false);setValue({...value,transport:{...value.transport,[`${direction}TemplateId`]:Number(event.target.value)}});}
        }}><option value="">Seleccionar plantilla auxiliar</option>{(templates.data??[]).map(template=><option key={template.id} value={template.id}>{template.name} · #{template.id}</option>)}</select>
      </label>):null}
      <label className="sm:col-span-2">Montajes<select aria-label="Montajes" className="block w-full rounded border bg-background p-2" value={value.setup} onChange={event=>{
        setSaved(false);const {setupFamilies:_,...rest}=value;
        setValue(event.target.value==="FAMILIES"?{...rest,setup:"FAMILIES",searchPolicy:"EXACT_CONSTRUCTIVE",setupFamilies:{contractVersion:2,families:[],policies:[]}}:{...rest,setup:"NONE"});
      }}><option value="NONE">Sin montajes</option><option value="FAMILIES">Familias y políticas por espacio</option></select></label>
      {value.setup==="FAMILIES"?<div className="sm:col-span-2"><SetupFamiliesEditor value={value.setupFamilies!} spaces={spaces} onChange={setupFamilies=>{setSaved(false);setValue({...value,setupFamilies});}}/></div>:null}
      <details className="sm:col-span-2"><summary>Parámetros técnicos de Planner Next</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>Política de búsqueda<select aria-label="Política de búsqueda" value={value.searchPolicy} onChange={event=>setValue(previous=>previous.scenario==="MAIN_WITH_VOCAL_FEEDER"?{...previous,searchPolicy:event.target.value as NewDayPlannerConfiguration["searchPolicy"]}:previous)}><option value="EXACT_CONSTRUCTIVE">Construcción exacta</option><option disabled={value.scenario==="STANDALONE_ONLY"||value.setup==="FAMILIES"} value="COMPATIBILITY_PRESERVING">Compatibilidad</option></select></label>
        <label>Transición entre recursos (min)<Input aria-label="Transición entre recursos" type="number" min={0} step={5} value={value.resourceTransitionMinutes} onChange={event=>setValue({...value,resourceTransitionMinutes:Number(event.target.value)})}/></label>
        {([ ["bestK","Mejores candidatos"],["maxBacktracks","Retrocesos máximos"],["maxPatterns","Patrones máximos"],["maxBranchExpansions","Ramas máximas"] ] as const).map(([key,label])=><label key={key}>{label}<Input aria-label={label} type="number" min={1} max={key==="maxBranchExpansions"?100000:undefined} value={value.searchBudget[key]} onChange={event=>setValue({...value,searchBudget:{...value.searchBudget,[key]:Number(event.target.value)}})}/></label>)}
      </div></details>
      <Button disabled={!newDayPlannerConfigurationSchema.safeParse(value).success} onClick={()=>save.mutate()}>Guardar Planner para futuras jornadas</Button>
    </fieldset>
    {saved?<p role="status">Configuración guardada. Las jornadas existentes conservan su snapshot.</p>:null}
    {save.error?<p role="alert">{save.error.message}</p>:null}
    <p className="text-xs text-muted-foreground">Revisión general: {query.data?.revision??"sin verificar"} · Comprueba el readiness del día después de añadir sus tareas.</p>
  </CardContent></Card>;
}
