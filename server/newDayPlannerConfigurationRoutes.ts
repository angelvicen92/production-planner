import type { Express } from "express";
import { z } from "zod";
import { newDayPlannerConfigurationSchema } from "../shared/newDayPlannerConfiguration";

export function registerNewDayPlannerConfiguration(app:Express,database:any) {
  const path="/api/new-day-planner-configuration";
  app.get(path,async(req,res)=>{
    if(!(req as any).user?.id)return void res.status(401).json({message:"Unauthorized"});
    if(!["admin","production","aux","viewer"].includes((req as any).userRole))return void res.status(403).json({message:"Forbidden"});
    try {
      const {data,error}=await database.from("new_day_planner_configuration").select("revision,configuration").eq("id",1).single();
      if(error)throw error;
      res.json(data);
    }catch {res.status(500).json({message:"No se pudo leer la configuración para nuevas jornadas."});}
  });
  app.put(path,async(req,res)=>{
    if((req as any).userRole!=="admin")return void res.status(403).json({message:"Solo ADMIN puede configurar nuevas jornadas."});
    try {
      const value=z.object({expectedRevision:z.number().int().nonnegative(),configuration:newDayPlannerConfigurationSchema.nullable()}).strict().parse(req.body);
      if(value.configuration?.scenario==="MAIN_WITH_VOCAL_FEEDER"){
        const {data,error}=await database.from("spaces").select("id").eq("id",value.configuration.mainFlow.spaceId).maybeSingle();
        if(error)throw error;
        if(!data)return void res.status(400).json({message:"Selecciona un espacio existente para el flujo principal."});
      }
      if(value.configuration?.setup==="FAMILIES"){
        const ids=value.configuration.setupFamilies!.policies.map(policy=>policy.spaceId);
        const {data,error}=await database.from("spaces").select("id").in("id",ids);
        if(error)throw error;
        if(data?.length!==ids.length)return void res.status(400).json({message:"Selecciona espacios existentes para las políticas de montaje."});
      }
      const {data,error}=await database.from("new_day_planner_configuration")
        .update({configuration:value.configuration,revision:value.expectedRevision+1}).eq("id",1).eq("revision",value.expectedRevision)
        .select("revision,configuration").maybeSingle();
      if(error)throw error;
      if(!data)return void res.status(409).json({message:"La configuración ha cambiado. Recarga antes de guardar."});
      res.json(data);
    }catch(error){res.status(error instanceof z.ZodError?400:500).json({message:"No se pudo guardar. Revisa la configuración y los límites técnicos."});}
  });
}
