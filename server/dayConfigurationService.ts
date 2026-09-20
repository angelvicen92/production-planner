import { supabaseAdmin } from "./supabase";

const mapPlan = (p:any) => ({
  planId:Number(p.id),
  revisionId:p.current_config_revision_id == null ? null : Number(p.current_config_revision_id),
  workday:{effective:{start:p.work_start,end:p.work_end},baseline:{start:p.work_baseline_start,end:p.work_baseline_end},source:p.work_config_source,override:{by:p.work_override_by,at:p.work_override_at}},
  meal:{effective:{start:p.meal_start,end:p.meal_end,mode:p.meal_mode},baseline:{start:p.meal_baseline_start,end:p.meal_baseline_end,mode:p.meal_baseline_mode},source:p.meal_config_source,override:{by:p.meal_override_by,at:p.meal_override_at}},
});

export async function previewDayConfigurationRefresh(planId:number){
  const [{data:p,error:pe},{data:g,error:ge}]=await Promise.all([
    supabaseAdmin.from("plans").select("*").eq("id",planId).single(),
    supabaseAdmin.from("program_settings").select("default_work_start,default_work_end,meal_start,meal_end,meal_mode").eq("id",1).single(),
  ]);
  if(pe||!p) throw Object.assign(new Error("PLAN_NOT_FOUND"),{status:404,cause:pe});
  if(ge||!g) throw ge;
  const current=mapPlan(p);
  return {...current,generalCandidate:{workday:{start:g.default_work_start,end:g.default_work_end},meal:{start:g.meal_start,end:g.meal_end,mode:g.meal_mode}},effects:{
    WORKDAY_WINDOW:p.work_config_source==="LEGACY_BACKFILL"?"REQUIRES_EXPLICIT_ADOPTION":p.work_config_source==="DAY_OVERRIDE"?"UPDATE_BASELINE_KEEP_EFFECTIVE":"UPDATE_BASELINE_AND_EFFECTIVE",
    GLOBAL_MEAL_BREAK:p.meal_config_source==="LEGACY_BACKFILL"?"REQUIRES_EXPLICIT_ADOPTION":p.meal_config_source==="DAY_OVERRIDE"?"UPDATE_BASELINE_KEEP_EFFECTIVE":"UPDATE_BASELINE_AND_EFFECTIVE",
  }};
}

export async function applyDayConfigurationOperation(planId:number,actorId:string,operation:"EDIT"|"RESTORE"|"REFRESH",payload:unknown){
  const {data,error}=await supabaseAdmin.rpc("apply_day_config_operation",{p_plan_id:planId,p_actor:actorId,p_operation:operation,p_payload:payload});
  if(error) throw error;
  const {data:plan,error:planError}=await supabaseAdmin.from("plans").select("*").eq("id",planId).single();
  if(planError) throw planError;
  return {...mapPlan(plan),revisionId:Number(data)};
}
