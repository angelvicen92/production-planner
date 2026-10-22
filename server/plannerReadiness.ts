import type { EngineInput } from "../engine/types";
import { adaptEngineInputToPlannerNextProblem } from "../engine/planner-next/integration/engineInputAdapter";
import type { EffectiveConfigurationView, ReadinessIssue } from "../shared/effectiveConfigurationContracts";

export function plannerReadiness(input:EngineInput,current:EffectiveConfigurationView["readiness"]):EffectiveConfigurationView["readiness"] {
  const adapted=adaptEngineInputToPlannerNextProblem(input);
  const issues:ReadinessIssue[]=[...current.issues];
  if(!input.tasks.some(task=>task.status!=="cancelled"))issues.push({capabilityId:"TASKS_DEPENDENCIES",category:"Tareas",status:"INCOMPLETE",message:"Añade participantes y tareas antes de solicitar una propuesta.",navigationTarget:`/plans/${input.planId}?tab=tasks`});
  if(input.plannerNext && input.tasks.length && !input.tasks.some(task=>task.plannerNextKind==="main" && task.status!=="cancelled"))
    issues.push({capabilityId:"MAIN_FLOW",category:"Reglas de planificación",status:"UNSUPPORTED",message:"Este perfil requiere un flujo principal real con preparación vocal y coach explícitos. Las jornadas sin flujo principal todavía no están soportadas.",navigationTarget:"Reglas de planificación"});
  const actions:Record<string,string>={
    MISSING_SEARCH_POLICY_CONFIGURATION:"Configura Planner Next para nuevas jornadas en Configuración general y crea una jornada con ese snapshot.",
    MISSING_SEARCH_BUDGET_CONFIGURATION:"Guarda los límites técnicos en la configuración para nuevas jornadas.",
    MISSING_MAIN_FLOW_CONFIGURATION:"Selecciona un espacio real del flujo principal y un fin preferido dentro del horario de la jornada.",
    MISSING_COACH_REFERENCE:"Asigna un Vocal Coach real del día al participante. Este contrato requiere coach para principal y vocal.",
    UNSUPPORTED_COACH_RESOURCE_MAPPING:"Comprueba que la plantilla requiere el coach asignado al participante y que el participante tiene un coach disponible del día.",
    UNSUPPORTED_TASK_ROLE:"Revisa el rol operativo de las plantillas: una tarea principal y una vocal previa por participante, enlazadas mediante una dependencia. Las operaciones sin flujo principal requieren otra capacidad.",
    MISSING_SPACE_REFERENCE:"Asigna un espacio a la plantilla o a la tarea.",
    MISSING_PARTICIPANT_AVAILABILITY:"Completa la disponibilidad del participante.",
  };
  for(const issue of adapted.issues){
    const missingRole=issue.code==="UNSUPPORTED_TASK_ROLE" && input.tasks.some(task=>String(task.id)===issue.entityId && task.plannerNextKind==null);
    const canonicalReasons=issue.details?.plannerNextReasonCodes as string[]|undefined;
    const invalidPreferredEnd=canonicalReasons?.includes("INVALID_PREFERRED_END");
    const status=issue.code.startsWith("MISSING_")||missingRole?"INCOMPLETE":issue.code.startsWith("INVALID_")||issue.code.startsWith("CONFLICTING_")||issue.code==="DEPENDENCY_CYCLE"||invalidPreferredEnd?"INCOMPATIBLE":"UNSUPPORTED";
    issues.push({capabilityId:issue.code,category:"Reglas de planificación",status,
      message:`${issue.code} · ${issue.path}: ${invalidPreferredEnd?"El fin preferido debe estar dentro de la jornada y no superar el inicio de la pausa global de comida. Revisa el perfil de origen.":issue.path.endsWith(".templateSnapshot")?issue.message:actions[issue.code]??issue.message}`,
      navigationTarget:issue.code.startsWith("MISSING_SEARCH_")?"/settings":issue.entityKind==="task"||issue.entityKind==="participant"||issue.entityKind==="contestant"?`/plans/${input.planId}?tab=tasks`:"#config-MAIN_FLOW"});
  }
  return {status:issues.some(issue=>issue.status==="INCOMPATIBLE")?"INCOMPATIBLE":issues.some(issue=>issue.status==="INCOMPLETE")?"INCOMPLETE":issues.length?"UNSUPPORTED":"READY",issues};
}
