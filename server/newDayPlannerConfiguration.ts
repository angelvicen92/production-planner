import type { EngineInput } from "../engine/types";
import type { TaskTemplateOperationalSnapshotV1 } from "./taskTemplateSnapshot";
import { newDayPlannerSnapshotSchema, type SetupFamiliesConfiguration } from "../shared/newDayPlannerConfiguration";
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
  const setup=config.setup==="FAMILIES"?config.setupFamilies:undefined;
  const transport=config.transport!=="NONE"?config.transport:undefined;
  const tasks=input.tasks.map(task=>{
    const template=templates.get(task.templateId);
    const kind=template?.plannerNextOperation?.kind;
    // Resolve prerequisites from snapshot references and current instances. A
    // missing instance stays an actionable defect; it must never vanish silently.
    const dependencies=(template?.dependencyTemplateIds??[]).flatMap(templateId=>
      input.tasks.filter(candidate=>candidate.templateId===templateId &&
        candidate.contestantId===task.contestantId && candidate.status!=="cancelled").map(candidate=>candidate.id));
    const coach=task.contestantId==null?undefined:input.vocalCoachPlanResourceItemIdByContestantId?.[task.contestantId];
    const operationalRole=transport&&task.templateId===transport.arrivalTemplateId?"transport_arrival" as const
      :transport&&task.templateId===transport.departureTemplateId?"transport_departure" as const:"productive_task" as const;
    return {...task,...(kind?{plannerNextKind:kind}:{}),operationalRole,
      ...(template?.setupId!=null&&validSetupMapping(input,task,template,setup)?{setupFamilyId:String(template.setupId)}:{}),
      ...(template?.requiresCoach && coach!=null?{declaredResourceIds:[...new Set([...(task.declaredResourceIds??[]),coach])].sort((a,b)=>a-b)}:{}),
      dependsOnTaskIds:dependencies,dependsOnTaskId:dependencies[0]??null};
  });
  // The catalogue is a permission set; the solver policy describes the families
  // actually present in this day. Inactive families require no entry/preparation.
  const setupPolicies=setup?.policies.flatMap(({familyIds,familyOrder,...policy})=>{
    const present=new Set(tasks.filter(task=>task.status!=="cancelled"&&task.spaceId===policy.spaceId).map(task=>task.setupFamilyId));
    const families=familyIds.map(String).filter(id=>present.has(id));
    const active=tasks.some(task=>task.status!=="cancelled"&&task.spaceId===policy.spaceId);
    return families.length||setup.contractVersion===2&&active?[{...policy,...(setup.contractVersion===2?{contractVersion:2 as const}:{}),families,...(familyOrder?{familyOrder:familyOrder.map(String).filter(id=>present.has(id))}:{})}]:[];
  });
  const {arrivalDepartureGrouping:_,...weights}=input.optimizerWeights??{};
  return {...input,tasks,
    ...(setupPolicies?{setupPolicies}:{}),
    plannerNextMaterializationIssues:[...newDayConfigurationDefects(input,snapshots,config.scenario,setup),
      ...(transport?newDayTransportDefects(input,snapshots,transport):[])],plannerNext:{searchPolicy:config.searchPolicy,searchBudget:{...config.searchBudget},
      timeGridMinutes:config.timeGridMinutes,participantTransitionMinutes:input.defaultParticipantTransitionMinutes!,
      resourceTransitionMinutes:config.resourceTransitionMinutes,
      ...(config.scenario==="STANDALONE_ONLY"?{profile:"STANDALONE_ONLY" as const}:{mainFlow:{...config.mainFlow}})},
    // NONE preserves the historical profile. Enabled transport retains the
    // existing builder's daily identities, resources and direction parameters.
    ...(!transport?{transportSettings:undefined,transportSpaceId:undefined,transportVanCapacity:undefined,vanCapacity:undefined,
    arrivalTaskTemplateName:undefined,departureTaskTemplateName:undefined,
    arrivalGroupingTarget:undefined,departureGroupingTarget:undefined,
    arrivalMinimumGroupSize:undefined,departureMinimumGroupSize:undefined,
    arrivalMaximumGroupSize:undefined,departureMaximumGroupSize:undefined,
    arrivalMinGapMinutes:undefined,departureMinGapMinutes:undefined}:{}),
    mealTaskTemplateId:null,mealTaskTemplateName:undefined,
    ...(input.mealMode==="global_hard_break"?{mealWindow:undefined,mealWindowStart:undefined,mealWindowEnd:undefined,
      contestantMealDurationMinutes:undefined,contestantMealMaxSimultaneous:undefined}:{}),
    groupingBySpaceId:{},minimizeChangesBySpace:{},groupingZoneIds:[],maxTemplateChangesByZoneId:{},
    optimizerGroupBySpaceAndTemplate:false,optimizerGroupingLevel:0,
    // This marker describes only the unused legacy optimizer adapter. Preserve
    // every other compatibility warning; the explicit Next profile owns search.
    optimizerCompatibilityWarnings:input.optimizerCompatibilityWarnings?.filter(code=>code!=="OPTIMIZER_LEGACY_ENGINE_ADAPTER_V1"),
    optimizerWeights:{...weights,...(transport?{arrivalDepartureGrouping:input.optimizerWeights?.arrivalDepartureGrouping}:{}),groupBySpaceTemplateMatch:0,groupBySpaceActive:0},
  };
}

function newDayTransportDefects(input:EngineInput,snapshots:readonly TaskTemplateOperationalSnapshotV1[],
  transport:{arrivalTemplateId:number;departureTemplateId:number}):NonNullable<EngineInput["plannerNextMaterializationIssues"]>{
  const messages:string[]=[];
  for(const direction of ["arrival","departure"] as const){
    const id=transport[`${direction}TemplateId`],template=snapshots.find(row=>row.sourceTemplateId===id);
    if(!template||template.plannerNextOperation?.kind!=="auxiliary")messages.push(`La plantilla ${direction} (${id}) debe existir en el snapshot y declarar actividad auxiliar con participante.`);
    if(input.transportSettings?.[`${direction}TemplateId`]!==id)messages.push(`La referencia diaria ${direction} no coincide con la identidad de transporte del perfil. Revisa el snapshot de transporte.`);
  }
  return messages.map(message=>({code:"UNSUPPORTED_TASK_ROLE" as const,taskId:input.tasks[0]?.id??0,message}));
}

function validSetupMapping(input:EngineInput,task:EngineInput["tasks"][number],template:TaskTemplateOperationalSnapshotV1,setup?:SetupFamiliesConfiguration){
  const policy=setup?.policies.find(p=>p.spaceId===task.spaceId);
  return template.setupId!=null&&setup?.families.some(f=>f.id===template.setupId)&&policy?.familyIds.includes(template.setupId)
    &&template.plannerNextOperation?.kind==="auxiliary"&&task.contestantId!=null&&task.jointGroupId==null
    &&task.blocksSpace!==false&&task.agendaScope!=="ITINERANT_UNIT"&&task.allowsSpaceOverlap!==true
    &&input.planSpaceSettings?.some(s=>s.spaceId===task.spaceId);
}

export function newDayConfigurationDefects(input:EngineInput,snapshots:readonly TaskTemplateOperationalSnapshotV1[],scenario="MAIN_WITH_VOCAL_FEEDER",setup?:SetupFamiliesConfiguration):NonNullable<EngineInput["plannerNextMaterializationIssues"]> {
  const templates=new Map(snapshots.map(snapshot=>[snapshot.sourceTemplateId,snapshot]));
  const active=input.tasks.filter(task=>task.status!=="cancelled");
  const issues=active.flatMap(task=>{
    const template=templates.get(task.templateId);
    const missing=(template?.dependencyTemplateIds??[]).filter(id=>!input.tasks.some(candidate=>
      candidate.templateId===id && candidate.contestantId===task.contestantId && candidate.status!=="cancelled"));
    return [
      ...(missing.length?[{code:"MISSING_DEPENDENCY_REFERENCE" as const,taskId:task.id,message:`La tarea ${task.id} necesita las instancias de sus plantillas previas (${missing.join(", ")}). Añádelas al mismo participante.`}]:[]),
      ...((template?.setupId!=null&&!validSetupMapping(input,task,template,setup))||(setup?.policies.some(p=>p.spaceId===task.spaceId&&(setup.contractVersion!==2||p.groupingPolicy!=="OFF"))&&template?.setupId==null)
        ?[{code:"UNSUPPORTED_SETUP_MAPPING" as const,taskId:task.id,message:`La tarea ${task.id} necesita una familia de montaje conocida y permitida por la política de su espacio. Sólo se admiten auxiliares físicas con participante, sin grupo conjunto.`}]:[]),
      // Auxiliary/technical units are resolved by the daily composition authority
      // after this profile. Preflight still validates its effective identities,
      // members and domains; main/vocal unit consumption is not enabled here.
      ...(task.itinerantTeamRequirement!=="none" && task.itinerantTeamRequirement!=null &&
        template?.plannerNextOperation?.kind!=="auxiliary" && template?.plannerNextOperation?.kind!=="technical"
        ?[{code:"UNSUPPORTED_TASK_ROLE" as const,taskId:task.id,message:`La tarea ${task.id} requiere una unidad itinerante. Este perfil sólo admite ese consumo en operaciones auxiliares o técnicas.`}]:[]),
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
