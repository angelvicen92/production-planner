import type { IStorage } from "./storage";
import { buildEffectiveConfigurationView } from "./effectiveConfigurationView";

export async function getEffectiveConfigurationResponse(storage:IStorage,rawPlanId:string){
  const planId=Number(rawPlanId);
  if(!Number.isInteger(planId)||planId<=0)return {status:400 as const,body:{message:"Plan inválido"}};
  try{return {status:200 as const,body:await buildEffectiveConfigurationView(storage,planId)};}
  catch(error:any){
    if(error?.status===404)return {status:404 as const,body:{message:"Plan no encontrado"}};
    // Keep a JSON error boundary for authority/schema failures. Never substitute
    // an empty configuration, inherited defaults or the SPA's HTML response.
    return {status:500 as const,body:{message:"No se pudo leer la configuración efectiva de esta jornada. Revisa la disponibilidad de sus fuentes y la versión del esquema.",code:"EFFECTIVE_CONFIGURATION_UNAVAILABLE"}};
  }
}
