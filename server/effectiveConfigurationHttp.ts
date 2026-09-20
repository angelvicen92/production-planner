import type { IStorage } from "./storage";
import { buildEffectiveConfigurationView } from "./effectiveConfigurationView";

export async function getEffectiveConfigurationResponse(storage:IStorage,rawPlanId:string){
  const planId=Number(rawPlanId);
  if(!Number.isInteger(planId)||planId<=0)return {status:400 as const,body:{message:"Plan inválido"}};
  try{return {status:200 as const,body:await buildEffectiveConfigurationView(storage,planId)};}
  catch(error:any){if(error?.status===404)return {status:404 as const,body:{message:"Plan no encontrado"}};throw error;}
}
