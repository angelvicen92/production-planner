import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import type {NewDayPlannerConfiguration,SetupFamiliesConfiguration} from "@shared/newDayPlannerConfiguration";
import {Button} from "./ui/button";
import {Input} from "./ui/input";

export const newDayConfigurationPath="/api/new-day-planner-configuration";
export function TemplateSetupFamily({value,onChange,disabled=false}:{value:number|null;onChange:(value:number|null)=>void;disabled?:boolean}){
  const query=useQuery<{configuration:NewDayPlannerConfiguration|null}>({queryKey:[newDayConfigurationPath]});
  const families=query.data?.configuration?.setupFamilies?.families??[];
  return <label className="block space-y-1">Familia de montaje
    <select aria-label="Familia de montaje" className="block w-full rounded border bg-background p-2" disabled={disabled||query.isLoading||query.isError} value={value??""} onChange={event=>onChange(event.target.value?Number(event.target.value):null)}>
      <option value="">Sin montaje</option>
      {value!=null&&!families.some(f=>f.id===value)?<option value={value}>Familia sin configuración vigente ({value})</option>:null}
      {families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
    {query.isError?<span role="alert">No se pudieron cargar las familias.</span>:null}
    <span className="text-xs text-muted-foreground">Configura las familias y sus espacios en Ajustes generales. Sólo actividades auxiliares con participante.</span>
  </label>;
}

export function SetupFamiliesEditor({value,onChange,spaces}:{value:SetupFamiliesConfiguration;onChange:(value:SetupFamiliesConfiguration)=>void;spaces:Array<{id:number;name:string}>}){
  const [name,setName]=useState("");
  const updatePolicy=(index:number,patch:Partial<SetupFamiliesConfiguration["policies"][number]>)=>onChange({...value,policies:value.policies.map((p,i)=>i===index?{...p,...patch}:p)});
  return <div className="space-y-3" data-testid="setup-families-editor">
    <p className="text-sm">Cada familia conserva su identidad al cambiar de nombre. Cada espacio admite un bloque por familia, sin reentrada; una espera dentro de la misma familia no crea otro bloque. La preparación ocupa físicamente el espacio entre familias.</p>
    <div className="flex gap-2"><Input aria-label="Nombre de nueva familia" value={name} onChange={event=>setName(event.target.value)}/>
      <Button type="button" disabled={!name.trim()} onClick={()=>{
        let id:number;do{id=crypto.getRandomValues(new Uint32Array(1))[0]&0x7fffffff;}while(!id||value.families.some(f=>f.id===id));
        onChange({...value,families:[...value.families,{id,name:name.trim()}]});setName("");
      }}>Añadir familia</Button></div>
    {value.families.map((family,index)=><label key={family.id} className="block">Nombre de familia {index+1}<Input aria-label={`Nombre de familia ${index+1}`} value={family.name} onChange={event=>onChange({...value,families:value.families.map(f=>f.id===family.id?{...f,name:event.target.value}:f)})}/></label>)}
    {value.policies.map((policy,index)=><div key={index} className="space-y-2 rounded border p-3" data-testid={`setup-policy-${index}`}>
      <label>Espacio de montaje<select aria-label={`Espacio de montaje ${index+1}`} className="block w-full rounded border bg-background p-2" value={policy.spaceId||""} onChange={event=>updatePolicy(index,{spaceId:Number(event.target.value)})}>
        <option value="">Seleccionar espacio</option>{spaces.map(space=><option key={space.id} value={space.id}>{space.name}</option>)}
      </select></label>
      <p>Familias permitidas</p>
      {value.families.map(family=><label key={family.id} className="flex gap-2"><input type="checkbox" aria-label={`Permitir ${family.name} en espacio ${index+1}`} checked={policy.familyIds.includes(family.id)} onChange={event=>{
        const familyIds=event.target.checked?[...policy.familyIds,family.id]:policy.familyIds.filter(id=>id!==family.id);
        updatePolicy(index,{familyIds,...(policy.orderConstraint==="EXPLICIT"?{familyOrder:familyIds}:{})});
      }}/>{family.name}</label>)}
      <label>Orden de familias<select aria-label={`Orden de familias ${index+1}`} className="block w-full rounded border bg-background p-2" value={policy.orderConstraint} onChange={event=>{
        const {familyOrder:_,...rest}=policy;
        onChange({...value,policies:value.policies.map((p,i)=>i===index?(event.target.value==="EXPLICIT"?{...rest,orderConstraint:"EXPLICIT",familyOrder:[...policy.familyIds]}:{...rest,orderConstraint:"UNSPECIFIED"}):p)});
      }}><option value="UNSPECIFIED">Flexible: lo decide el planificador</option><option value="EXPLICIT">Explícito</option></select></label>
      {policy.orderConstraint==="EXPLICIT"?<ol>{(policy.familyOrder??[]).map((id,position)=><li key={id} className="flex items-center gap-2">{value.families.find(f=>f.id===id)?.name}
        <Button type="button" variant="outline" disabled={position===0} aria-label={`Subir familia ${position+1} en espacio ${index+1}`} onClick={()=>{const order=[...policy.familyOrder!];[order[position-1],order[position]]=[order[position],order[position-1]];updatePolicy(index,{familyOrder:order});}}>Subir</Button>
      </li>)}</ol>:null}
      <label>Preparación entre familias (min)<Input aria-label={`Preparación entre familias ${index+1}`} type="number" min={5} step={5} value={policy.preparationMinutesBetweenFamilies} onChange={event=>updatePolicy(index,{preparationMinutesBetweenFamilies:Number(event.target.value)})}/></label>
      <p className="text-xs">Espacio físico exclusivo de capacidad 1. Un bloque por familia · Reentrada prohibida.</p>
      <Button type="button" variant="outline" onClick={()=>onChange({...value,policies:value.policies.filter((_,i)=>i!==index)})}>Quitar política del espacio</Button>
    </div>)}
    <Button type="button" variant="outline" onClick={()=>onChange({...value,policies:[...value.policies,{spaceId:0,familyIds:[],orderConstraint:"UNSPECIFIED",oneBlockPerFamily:true,reentry:"FORBIDDEN",preparationMinutesBetweenFamilies:5}]})}>Añadir espacio de montaje</Button>
  </div>;
}
