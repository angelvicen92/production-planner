import type { EngineInput } from "../engine/types";
import type { TaskTemplateOperationalSnapshotV1 } from "./taskTemplateSnapshot";
import { newDayPlannerSnapshotSchema } from "../shared/newDayPlannerConfiguration";
import { PlanPlannerNextConfigurationError } from "./planPlannerNextConfiguration";

/** Materialize against the effective task set on every build, never the catalog. */
export function applyNewDayPlannerConfiguration(input:EngineInput,raw:unknown,
  snapshots:readonly TaskTemplateOperationalSnapshotV1[]):EngineInput {
  if(raw==null)return input;
  const parsed=newDayPlannerSnapshotSchema.safeParse(raw);
  if(!parsed.success)throw new PlanPlannerNextConfigurationError("INVALID_CONTRACT");
  const config=parsed.data.configuration;
  if(!config)return input;
  const templates=new Map(snapshots.map(snapshot=>[snapshot.sourceTemplateId,snapshot]));
  const tasks=input.tasks.map(task=>{
    const template=templates.get(task.templateId);
    const kind=template?.plannerNextOperation?.kind;
    // Resolve prerequisites from snapshot references and current instances. A
    // missing instance stays an actionable defect; it must never vanish silently.
    const dependencies=(template?.dependencyTemplateIds??[]).flatMap(templateId=>
      input.tasks.filter(candidate=>candidate.templateId===templateId &&
        candidate.contestantId===task.contestantId && candidate.status!=="cancelled").map(candidate=>candidate.id));
    const coach=task.contestantId==null?undefined:input.vocalCoachPlanResourceItemIdByContestantId?.[task.contestantId];
    return {...task,...(kind?{plannerNextKind:kind}:{}),operationalRole:"productive_task" as const,
      ...(template?.requiresCoach && coach!=null?{declaredResourceIds:[...new Set([...(task.declaredResourceIds??[]),coach])].sort((a,b)=>a-b)}:{}),
      dependsOnTaskIds:dependencies,dependsOnTaskId:dependencies[0]??null};
  });
  const {arrivalDepartureGrouping:_,...weights}=input.optimizerWeights??{};
  return {...input,tasks,plannerNextMaterializationIssues:newDayConfigurationDefects(input,snapshots,config.scenario),plannerNext:{searchPolicy:config.searchPolicy,searchBudget:{...config.searchBudget},
      timeGridMinutes:config.timeGridMinutes,participantTransitionMinutes:input.defaultParticipantTransitionMinutes!,
      resourceTransitionMinutes:config.resourceTransitionMinutes,
      ...(config.scenario==="STANDALONE_ONLY"?{profile:"STANDALONE_ONLY" as const}:{mainFlow:{...config.mainFlow}})},
    // These capabilities are explicitly inapplicable in this versioned profile.
    transportSettings:undefined,transportSpaceId:undefined,transportVanCapacity:undefined,vanCapacity:undefined,
    arrivalTaskTemplateName:undefined,departureTaskTemplateName:undefined,
    arrivalGroupingTarget:undefined,departureGroupingTarget:undefined,
    arrivalMinimumGroupSize:undefined,departureMinimumGroupSize:undefined,
    arrivalMaximumGroupSize:undefined,departureMaximumGroupSize:undefined,
    arrivalMinGapMinutes:undefined,departureMinGapMinutes:undefined,
    mealTaskTemplateId:null,mealTaskTemplateName:undefined,
    ...(input.mealMode==="global_hard_break"?{mealWindow:undefined,mealWindowStart:undefined,mealWindowEnd:undefined,
      contestantMealDurationMinutes:undefined,contestantMealMaxSimultaneous:undefined}:{}),
    groupingBySpaceId:{},minimizeChangesBySpace:{},groupingZoneIds:[],maxTemplateChangesByZoneId:{},
    optimizerGroupBySpaceAndTemplate:false,optimizerGroupingLevel:0,
    // This marker describes only the unused legacy optimizer adapter. Preserve
    // every other compatibility warning; the explicit Next profile owns search.
    optimizerCompatibilityWarnings:input.optimizerCompatibilityWarnings?.filter(code=>code!=="OPTIMIZER_LEGACY_ENGINE_ADAPTER_V1"),
    optimizerWeights:{...weights,groupBySpaceTemplateMatch:0,groupBySpaceActive:0},
  };
}

export function newDayConfigurationDefects(input:EngineInput,snapshots:readonly TaskTemplateOperationalSnapshotV1[],scenario="MAIN_WITH_VOCAL_FEEDER"):NonNullable<EngineInput["plannerNextMaterializationIssues"]> {
  const templates=new Map(snapshots.map(snapshot=>[snapshot.sourceTemplateId,snapshot]));
  const active=input.tasks.filter(task=>task.status!=="cancelled");
  const issues=active.flatMap(task=>{
    const template=templates.get(task.templateId);
    const missing=(template?.dependencyTemplateIds??[]).filter(id=>!input.tasks.some(candidate=>
      candidate.templateId===id && candidate.contestantId===task.contestantId && candidate.status!=="cancelled"));
    return [
      ...(missing.length?[{code:"MISSING_DEPENDENCY_REFERENCE" as const,taskId:task.id,message:`La tarea ${task.id} necesita las instancias de sus plantillas previas (${missing.join(", ")}). Añádelas al mismo participante.`}]:[]),
      ...(template?.setupId!=null?[{code:"UNSUPPORTED_SETUP_MAPPING" as const,taskId:task.id,message:`La tarea ${task.id} declara un montaje. Este perfil todavía no materializa familias de montaje.`}]:[]),
      ...(task.itinerantTeamRequirement!=="none" && task.itinerantTeamRequirement!=null?[{code:"UNSUPPORTED_TASK_ROLE" as const,taskId:task.id,message:`La tarea ${task.id} requiere una unidad itinerante. Este perfil admite operaciones físicas sin unidad itinerante.`}]:[]),
      ...(template?.requiresCoach && (task.contestantId==null || input.vocalCoachPlanResourceItemIdByContestantId?.[task.contestantId]==null)
        ?[{code:"MISSING_COACH_REFERENCE" as const,taskId:task.id,message:`La tarea ${task.id} requiere el coach asignado al participante. Completa esa asignación con un recurso real del día.`}]:[]),
      ...(scenario!=="STANDALONE_ONLY" && (template?.plannerNextOperation?.kind==="main"||template?.plannerNextOperation?.kind==="vocal") && !template.requiresCoach
        ?[{code:"MISSING_COACH_REFERENCE" as const,taskId:task.id,message:`La plantilla de la tarea ${task.id} debe declarar que requiere el coach del participante para usar este perfil.`}]:[]),
      ...(template?.requiresAuxiliar||template?.requiresPresenter?[{code:"UNSUPPORTED_RESOURCE_REQUIREMENT" as const,taskId:task.id,message:`La tarea ${task.id} requiere auxiliar o presentador por tipo. Este perfil todavía no materializa esa selección; no se ignorará el requisito.`}]:[]),
    ];
  });
  if(scenario!=="STANDALONE_ONLY" && active.length && !active.some(task=>templates.get(task.templateId)?.plannerNextOperation?.kind==="main"))
    issues.push({code:"UNSUPPORTED_TASK_ROLE",taskId:active[0].id,message:"Este perfil necesita un flujo principal real. Configura STANDALONE_ONLY para crear una jornada sin flujo principal; no se inventará una sala ni una tarea."});
  if(scenario==="STANDALONE_ONLY")for(const task of active){
    const kind=templates.get(task.templateId)?.plannerNextOperation?.kind;
    if(kind==="main"||kind==="vocal")issues.push({code:"UNSUPPORTED_TASK_ROLE",taskId:task.id,message:"STANDALONE_ONLY sólo admite tareas auxiliares o técnicas. Cambia el perfil para planificar tareas principales o vocales."});
  }
  return issues;
}
