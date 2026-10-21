import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { DayCollapsibleSection } from "@/components/day-workspace/day-collapsible-section";
import { useDaySection } from "@/hooks/use-day-section";
import { PlanningStageToolbar } from "./planning-stage-toolbar";
import { PlanningWorkspaceLayout } from "./planning-workspace-layout";
import { mainFlowPreferenceResultMessage } from "@/lib/main-flow-preference-result";
import { projectAnchoredOperations } from '@shared/anchoredOperationProjection';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { planQueryKey } from "@/lib/plan-query-keys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AssistedLocationScope } from "./assisted-location-scope";
import { locationScopeTaskIds, pendingScopeTasks, taskIdsScopeSelector, type ScopeSpace, type ScopeZone } from "@/lib/assisted-scope-selection";
import { FullscreenPlanningPanel } from "./fullscreen-planning-panel";
import { PlanningTimeline } from "../planning-timeline";
import { assistedDraftTouchedTaskIds, buildAssistedPlanningView, classifyAssistedTasks, isAssistedDraftModified } from "@/lib/assisted-planning-view";
import { resolvePlanningOperationalMeals } from "@/lib/planning-operational-meals";
import { cascadeTasks, reorderTasks, resetTasksToBase, shiftTasks, swapTasks, type AssistedDraftPatch } from "@/lib/assisted-draft-editing";
import { collectAssistedDraftWarnings } from "@/lib/assisted-draft-warnings";
import { summarizeConfigRefreshChange } from "@/lib/config-refresh-summary";
import { useUserRole } from "@/hooks/use-user-role";
import { AssistedAutopilot, autopilotErrorMessage, isAutopilotClean, type AutopilotProgress, type AutopilotState } from "@shared/assistedAutopilot";
import { assistedAutopilotApi, hasAutopilotDraftAlerts, observeAutopilotCheckpoints } from "@/lib/assisted-autopilot";
import { projectAutopilotProgress } from "@/lib/assisted-autopilot-progress";
import { AssistedAutopilotProgress } from "./assisted-autopilot-progress";
import type { AssistedStageTiming } from "@shared/assistedStageTiming";
import { AssistedStageHistory } from "./assisted-stage-history";
import { buildAssistedHistory, stageObligations } from "@shared/assistedHistory";
import { assistedValidationErrorMessage, transportViolationExplanation, transportPartitionExplanation } from '@/lib/assisted-validation-messages';
import { newStageDeviationCounts } from '@shared/assistedStageValidation';

type ScopeKind="TASK_IDS"|"SPACE";
const key=(planId:number)=>["assisted-planning",planId];
const operatorError=(error:any)=>{
  const validationMessage=assistedValidationErrorMessage(error);if(validationMessage)return validationMessage;
  const code=String(error?.code??error?.message??error??"");
  if(code.includes("RESTART_PROTECTED_DAY"))return "No se puede reiniciar un día con tareas ejecutadas, en curso o bloqueos explícitos. Revisa su estado operativo.";
  if(code.includes("RESTART_RUNNING_PROPOSAL"))return "Espera a que termine la propuesta antes de reiniciar.";
  if(code.includes("STALE_"))return "El borrador cambió en otra operación. Se ha actualizado la vista; revisa los cambios e inténtalo de nuevo.";
  if(code.includes("CONFIRMATION_REQUIRED"))return "Esta decisión necesita confirmación explícita antes de aceptarse.";
  if(code.includes("VALIDATION"))return "El borrador debe validarse de nuevo antes de continuar.";
  if(code.includes("SESSION_NOT_FOUND"))return "No hay una sesión activa de planificación asistida.";
  return "No se pudo completar la operación. Revisa el borrador e inténtalo de nuevo.";
};
export const isMissingAssistedSession=(error:any)=>error?.status===404||error?.code==="SESSION_NOT_FOUND";
export const isAssistedConflict=(error:any)=>error?.status===409;

export const AssistedPlanningWorkspace = memo(function AssistedPlanningWorkspace({planId,plan,timelineProps,spaces=[],viewControls,onOpenExecution}:{planId:number;plan:any;timelineProps:Record<string,unknown>;spaces?:any[];viewControls?:ReactNode;onOpenExecution?:()=>void}) {
  const [scopeOpen,setScopeOpen]=useDaySection(planId,"assisted-scope");
  const [editingOpen,setEditingOpen]=useDaySection(planId,"assisted-editing");
  const [historyOpen,setHistoryOpen]=useDaySection(planId,"assisted-history");
  const [maintenanceOpen,setMaintenanceOpen]=useDaySection(planId,"assisted-maintenance");
  const client=useQueryClient(); const bootstrapped=useRef(false);
  const {role,refetch:refetchRole}=useUserRole();const authorized=useRef(false);authorized.current=role==="admin"||role==="production";
  const autopilot=useRef<AssistedAutopilot|null>(null);
  const [autopilotProgress,setAutopilotProgress]=useState<AutopilotProgress|null>(null);
  const [autopilotCheckpoint,setAutopilotCheckpoint]=useState<AutopilotState|null>(null);
  const [maximizeRequest,setMaximizeRequest]=useState(0);
  useEffect(()=>()=>{autopilot.current?.dispose();autopilot.current=null;},[planId]);
  const [pendingTimelineEdits,setPendingTimelineEdits]=useState(0);
  const [viewAuthority,setViewAuthority]=useState<"draft"|"accepted">("draft");
  const [scopeKind,setScopeKind]=useState<ScopeKind>("TASK_IDS"); const [selected,setSelected]=useState<number[]>([]);
  const [selectedSpaces,setSelectedSpaces]=useState<number[]>([]); const [includePrerequisites,setIncludePrerequisites]=useState(false);
  const [runId,setRunId]=useState<number|null>(null); const [preview,setPreview]=useState<any>(null); const [busy,setBusy]=useState<string|null>(null); const [message,setMessage]=useState<string|null>(null);
  const [configPreview,setConfigPreview]=useState<any>(null);const [configSelection,setConfigSelection]=useState<string[]>([]);
  const stateQ=useQuery({queryKey:key(planId),queryFn:()=>apiRequest<any>("GET",`/api/plans/${planId}/assisted`),retry:false});
  // Load timings only while Historial is open; reuse cached timings on visual toggles.
  const historyTimingsQ=useQuery({queryKey:["assisted-history-timings",planId,(stateQ.data?.history??[]).map((stage:any)=>stage.id).join(",")],queryFn:()=>apiRequest<AssistedStageTiming[]>("GET",`/api/plans/${planId}/assisted/history/timings`),enabled:historyOpen&&!!stateQ.data,staleTime:Infinity,retry:false});
  const bootstrap=()=>{if(bootstrapped.current||!authorized.current)return;bootstrapped.current=true;setBusy("bootstrap");setMessage(null);apiRequest("POST",`/api/plans/${planId}/assisted/session`,{}).then(()=>stateQ.refetch()).catch(e=>{bootstrapped.current=false;setMessage(operatorError(e));}).finally(()=>setBusy(null));};
  useEffect(()=>{if(stateQ.isError&&isMissingAssistedSession(stateQ.error))bootstrap();},[planId,stateQ.isError,role]);
  const pollQ=useQuery({queryKey:["assisted-proposal",planId,runId],queryFn:()=>apiRequest<any>("GET",`/api/plans/${planId}/assisted/proposals/${runId}`),enabled:runId!=null,refetchInterval:q=>{const s=(q.state.data as any)?.status;return s==="running"||s==="queued"?1000:false;}});
  useEffect(()=>{const run=pollQ.data;if(!run||autopilot.current)return;const status=run.status;if(status==="success"){setPreview(run.assisted_result_json??run.assistedResultJson);setBusy(null);}else if(status==="error"){setMessage("No se pudo generar una propuesta con la selección actual. Revisa disponibilidad y conflictos.");setBusy(null);}},[pollQ.data]);
  const state=busy==="autopilot"&&autopilotCheckpoint?autopilotCheckpoint:stateQ.data; const draft=state?.draft??state?.session?.draftSnapshotJson; const active=state?.activeStage;
  const historyModel=useMemo(()=>buildAssistedHistory(state?.history??[],active,historyTimingsQ.isError?[]:historyTimingsQ.data??[]),[state,active,historyTimingsQ.data,historyTimingsQ.isError]);
  const operationalMeals=useMemo(()=>resolvePlanningOperationalMeals(plan.plannerNextConfiguration,viewAuthority==="accepted"?active?.snapshotJson:draft,viewAuthority),[plan.plannerNextConfiguration,active,draft,viewAuthority]);
  const base=useMemo(()=>state?.history?.find((stage:any)=>Number(stage.id)===Number(state?.draftBaseStageId))?.snapshotJson??active?.snapshotJson??null,[state,active]);
  const scopeSpaces:ScopeSpace[]=spaces.map(space=>({id:Number(space.id),name:space.name,zoneId:space.zoneId==null?null:Number(space.zoneId)}));
  const scopeZones:ScopeZone[]=Array.isArray(timelineProps.zones)?timelineProps.zones as ScopeZone[]:[];
  const eligibleTasks=useMemo(()=>pendingScopeTasks(plan.dailyTasks??[],base),[plan.dailyTasks,base]);
  const scopeTaskIds=scopeKind==="SPACE"?locationScopeTaskIds(eligibleTasks,scopeSpaces,selectedSpaces):[...new Set(eligibleTasks.filter((task:any)=>selected.includes(Number(task.id))).map((task:any)=>Number(task.id)))].sort((a,b)=>a-b);
  const scopeSelector=taskIdsScopeSelector(scopeTaskIds);
  const previewIds=(preview?.proposal??[]).map((x:any)=>Number(x.taskId));
  const visual=useMemo(()=>draft?classifyAssistedTasks(draft,base,scopeTaskIds,previewIds):{},[draft,base,scopeTaskIds,preview]);
  const displayDraft=useMemo(()=>{if(!draft||preview?.outcome!=="PROPOSAL")return draft;const proposed=new Map((preview.proposal??[]).map((row:any)=>[Number(row.taskId),row]));return {...draft,tasks:draft.tasks.map((row:any)=>({...row,...(proposed.get(Number(row.taskId))??{})}))};},[draft,preview]);
  const assistedPlan=useMemo(()=>displayDraft?{...plan,dailyTasks:buildAssistedPlanningView(plan.dailyTasks??[],displayDraft)}:plan,[plan,displayDraft]);
  const composedOperations=useMemo(()=>projectAnchoredOperations(plan.plannerNextConfiguration?.anchoredAccompaniments??[],assistedPlan.dailyTasks??[]),[plan.plannerNextConfiguration,assistedPlan]);
  const localWarnings=useMemo(()=>collectAssistedDraftWarnings(assistedPlan.dailyTasks??[],{start:plan.workStart??plan.startTime??plan.workdayStart,end:plan.workEnd??plan.endTime??plan.workdayEnd},plan.plannerNextConfiguration),[assistedPlan,plan]);
  const confirm=useConfirm();
  const deciding=useRef(false);
  const decisionGeneration=useRef(0);
  useEffect(()=>()=>{decisionGeneration.current++;},[planId]);
  const currentDecision=useRef({planId,state,busy,pendingTimelineEdits,role});
  currentDecision.current={planId,state,busy,pendingTimelineEdits,role};
  const requestConsent=async(options:ConfirmOptions)=>{
    if(deciding.current)return false;
    deciding.current=true;
    const before=currentDecision.current;
    const generation=decisionGeneration.current;
    try {
      const accepted=await confirm(options);
      const after=currentDecision.current;
      return accepted&&generation===decisionGeneration.current&&authorized.current&&!after.busy&&!autopilot.current&&before.planId===after.planId&&before.role===after.role&&before.pendingTimelineEdits===after.pendingTimelineEdits&&before.state?.draftFingerprint===after.state?.draftFingerprint&&before.state?.draftBaseStageId===after.state?.draftBaseStageId&&before.state?.currentConfigRevisionId===after.state?.currentConfigRevisionId&&before.state?.validation===after.state?.validation;
    } finally {deciding.current=false;}
  };
  const guard=()=>({expectedDraftFingerprint:state.draftFingerprint,expectedBaseStageId:Number(state.draftBaseStageId)});
  const refresh=async(planToo=false)=>{await client.invalidateQueries({queryKey:key(planId)});await stateQ.refetch();if(planToo){await client.invalidateQueries({queryKey:planQueryKey(planId)});await client.refetchQueries({queryKey:planQueryKey(planId)});}};
  const clearProposal=()=>{setPreview(null);setRunId(null);};
  const mutate=async(label:string,work:()=>Promise<any>,planToo=false)=>{if(autopilot.current||!authorized.current||busy)return false;setBusy(label);setMessage(null);setAutopilotProgress(null);setAutopilotCheckpoint(null);try{await work();clearProposal();await refresh(planToo);return true;}catch(e:any){setMessage(operatorError(e));if(e?.status===403)await refetchRole();if(isAssistedConflict(e)){clearProposal();await refresh();}return false;}finally{setBusy(null);}};
  const restart=async()=>{
    if(busy||!authorized.current||autopilot.current)return;
    if(!await requestConsent({title:"Reiniciar Asistida",description:"Se descartará el borrador y se restaurará el planning inicial de esta sesión.",secondaryText:"Las etapas posteriores seguirán en el historial y se conservará la configuración vigente.",confirmText:"Reiniciar",destructive:true}))return;
    void mutate("restart",async()=>{
      await apiRequest("POST",`/api/plans/${planId}/assisted/restart`,{...guard(),confirmation:"RESTART_BOOTSTRAP"});
      setSelected([]);setSelectedSpaces([]);setIncludePrerequisites(false);setAutopilotProgress(null);setConfigPreview(null);setConfigSelection([]);
    },true);
  };
  const startAutopilot=async()=>{
    if(autopilot.current||busy||pendingTimelineEdits>0||!authorized.current||!isAutopilotClean(state))return;
    if(!await requestConsent({title:"Completar planificación",description:"OptiPlan aceptará automáticamente las etapas válidas y se detendrá cuando necesite tu decisión.",secondaryText:"Puedes detener el proceso entre etapas. Mantén esta pestaña abierta.",details:"Solo se aceptarán propuestas completas y certificadas, sin conflictos críticos, desviaciones ni alertas pendientes de decisión. Las etapas aceptadas se conservarán.",confirmText:"Completar automáticamente"}))return;
    clearProposal();setAutopilotCheckpoint(null);setViewAuthority("accepted");setBusy("autopilot");setMessage(null);
    setMaximizeRequest(value=>value+1);
    const checkpoints=observeAutopilotCheckpoints(assistedAutopilotApi(planId,apiRequest),(accepted,acceptedPlan)=>{
      setAutopilotCheckpoint(accepted);
      client.setQueryData(key(planId),accepted);
      client.setQueryData(planQueryKey(planId),acceptedPlan);
    });
    const controller=new AssistedAutopilot(planId,checkpoints.api,{
      authorized:()=>authorized.current,hasPendingAlerts:hasAutopilotDraftAlerts,
      onProgress:value=>{if(autopilot.current===controller){checkpoints.onProgress(value);setAutopilotProgress(value);}},
    });autopilot.current=controller;
    void controller.start().catch(error=>{if(autopilot.current===controller)setMessage(autopilotErrorMessage(error));}).finally(async()=>{
      if(autopilot.current!==controller)return;
      try{await refresh(true);}catch(error){setMessage(autopilotErrorMessage(error));}
      if(autopilot.current===controller){autopilot.current=null;setBusy(null);}
    });
  };
  const validationCurrent=Boolean(state?.validation&&state.validation.draftFingerprint===state.draftFingerprint&&Number(state.validation.baseStageId)===Number(state.draftBaseStageId)&&Number(state.validation.configRevisionId)===Number(state.currentConfigRevisionId));
  const validationReport:any=validationCurrent?state.validation.reportJson:null;
  const {newHardCount,newRequiredCount}=newStageDeviationCounts(validationCurrent?state.validation:null);
  const requiresAdminAuthorization=validationCurrent&&newHardCount>0&&role!=="admin";
  const acceptStage=async()=>{let confirmation="NONE";
    if(!validationCurrent){setMessage(assistedValidationErrorMessage({code:'STALE_VALIDATION'}));return;}
    if(requiresAdminAuthorization){setMessage(assistedValidationErrorMessage({code:'HARD_ADMIN_AUTHORIZATION_REQUIRED'}));return;}
    const newViolations=(validationReport?.violations??[]).filter((v:any)=>v.inheritedAcceptedExceptionId==null);
    if(newHardCount>0){
      if(!await requestConsent({title:"Aceptar conflictos críticos",description:`Hay ${newHardCount} ${newHardCount===1?"conflicto crítico nuevo":"conflictos críticos nuevos"} y ${newRequiredCount} ${newRequiredCount===1?"desviación operativa nueva":"desviaciones operativas nuevas"}. Se registrarán como excepciones con tu usuario administrador.`,secondaryText:"El planning conservará el indicador crítico: aceptar no elimina las infracciones ni lo convierte en un planning libre de conflictos.",details:newViolations.map(violationDecisionText).join('\n\n'),confirmText:"Aceptar con conflictos críticos",destructive:true}))return;
      confirmation="HARD_EXCEPTIONS";
    } else if(newRequiredCount>0){
      if(!await requestConsent({title:"Aceptar desviaciones operativas",description:`Hay ${newRequiredCount} ${newRequiredCount===1?"desviación operativa nueva":"desviaciones operativas nuevas"}. La decisión quedará registrada con tu usuario en el historial.`,secondaryText:"Los conflictos críticos heredados mantienen su indicador.",details:newViolations.map(violationDecisionText).join('\n\n'),confirmText:"Aceptar con desviaciones"}))return;
      confirmation="REQUIRED_DEVIATIONS";
    }
    return mutate("accept",()=>apiRequest("POST",`/api/plans/${planId}/assisted/accept-stage`,{...guard(),confirmation}),true);};
  const modified=Boolean(draft&&isAssistedDraftModified(draft,base));
  const touchedTaskCount=draft?assistedDraftTouchedTaskIds(draft,base).length:0;
  const blocks:any[]=draft?.planningBlocks??[];
  const selectedBlocks=blocks.filter(block=>block.memberTaskIds.some((id:number)=>selected.includes(Number(id))));
  const applyTimelineEdits=async(edits:Array<{taskId:number;start:string|null;end:string|null}>)=>{const applied=await mutate("edit",()=>apiRequest("PATCH",`/api/plans/${planId}/assisted/draft`,{
    ...guard(),changes:edits.map(edit=>({taskId:edit.taskId,startPlanned:edit.start,endPlanned:edit.end})),
  }));if(!applied)throw new Error("No se pudo aplicar la edición al borrador");};
  const applyOperation=(operation:AssistedDraftPatch)=>applyTimelineEdits(operation.changes.map(task=>({taskId:task.taskId,start:task.startPlanned,end:task.endPlanned}))).catch(()=>{});
  const editBlock=(operation:any)=>mutate("block",()=>apiRequest("POST",`/api/plans/${planId}/assisted/draft/blocks`,{...guard(),operation}));
  const incompatibleBlockEdit=()=>setMessage("La selección cruza o cubre parcialmente un bloque. Divide o retira la agrupación antes de reordenar.");
  const swapSelected=()=>{const containing=blocks.filter(block=>selected.some(id=>block.memberTaskIds.includes(id)));
    if(containing.length===0)return applyOperation(swapTasks(draft,selected[0],selected[1]));
    if(containing.length===1&&selected.every(id=>containing[0].memberTaskIds.includes(id))){const order=[...containing[0].memberTaskIds];const left=order.indexOf(selected[0]),right=order.indexOf(selected[1]);[order[left],order[right]]=[order[right],order[left]];return editBlock({kind:"REORDER_BLOCK_MEMBERS",blockId:containing[0].blockId,memberTaskIds:order});}
    incompatibleBlockEdit();};
  const reorderSelected=()=>{const containing=blocks.filter(block=>selected.some(id=>block.memberTaskIds.includes(id)));
    if(containing.length===0)return applyOperation(reorderTasks(draft,[...selected].reverse()));
    if(containing.length===1&&selected.length===containing[0].memberTaskIds.length&&containing[0].memberTaskIds.every((id:number)=>selected.includes(id)))return editBlock({kind:"REORDER_BLOCK_MEMBERS",blockId:containing[0].blockId,memberTaskIds:[...containing[0].memberTaskIds].reverse()});
    incompatibleBlockEdit();};
  const generate=async()=>{if(!scopeSelector||busy||!authorized.current)return;setBusy("proposal");setMessage(null);setPreview(null);try{const selector=scopeSelector;const result=await apiRequest<any>("POST",`/api/plans/${planId}/assisted/proposals`,{selector,includePrerequisites,...guard()});setRunId(Number(result.runId));}catch(e:any){setMessage(operatorError(e));setBusy(null);if(isAssistedConflict(e)){clearProposal();await refresh();}}};
  const suggestScope=async()=>{if(!authorized.current||busy)return;setBusy('suggest');setMessage(null);try{const r=await apiRequest<any>('GET',`/api/plans/${planId}/assisted/next-scope`);
    if(r.expectedDraftFingerprint!==state.draftFingerprint||Number(r.expectedBaseStageId)!==Number(state.draftBaseStageId)){await refresh();setMessage('El borrador cambió. Vuelve a solicitar una sugerencia.');return;}
    if(r.selector)setScopeOpen(true);
    clearProposal();setIncludePrerequisites(false);setSelected(r.selector?.kind==='TASK_IDS'?r.selector.taskIds:[]);setSelectedSpaces(r.selector?.kind==='SPACE'?[Number(r.selector.spaceId)]:[]);setScopeKind(r.selector?.kind??'TASK_IDS');
    setMessage(r.selector?`Se han seleccionado ${r.taskIds.length} obligaciones. Revisa el alcance y genera la propuesta.`:'Todas las obligaciones elegibles están planificadas.');
  }catch(e:any){setMessage(operatorError(e));}finally{setBusy(null);}};
  const previewConfig=async()=>{setBusy("config-preview");setMessage(null);try{const result=await apiRequest<any>("GET",`/api/plans/${planId}/assisted/config-refresh`);setConfigPreview(result);setConfigSelection(result.changes.map((x:any)=>x.key));}catch(e:any){setMessage(operatorError(e));}finally{setBusy(null);}};
  const applyConfig=()=>mutate("config-apply",()=>apiRequest("POST",`/api/plans/${planId}/assisted/config-refresh`,{expectedConfigRevisionId:configPreview.expectedConfigRevisionId,selectedChangeKeys:configSelection})).then(()=>{setConfigPreview(null);setConfigSelection([]);});
  if(stateQ.isLoading||busy==="bootstrap")return <Card className="p-4">Inicializando planificación asistida…</Card>;
  if(!state)return <Card className="p-4 text-destructive">No se pudo iniciar la sesión assisted. {message} <Button size="sm" variant="outline" disabled={!!busy} onClick={bootstrap}>Reintentar</Button></Card>;
  const taskRows:any[]=assistedPlan.dailyTasks??[];
  const taskById=new Map(taskRows.map((task:any)=>[Number(task.id),task]));
  const participantName=(task:any)=>task?.contestant?.name??task?.participant?.name??(Array.isArray(timelineProps.contestants)?timelineProps.contestants:[]).find((contestant:any)=>Number(contestant.id)===Number(task?.contestantId))?.name??"Sin concursante";
  const taskName=(id:number)=>{const task=taskById.get(Number(id));return task?.template?.name??task?.name??"Tarea sin nombre";};
  const taskContext=(ids:number[])=>ids.map(id=>{const task=taskById.get(Number(id));const participant=participantName(task);const space=spaces.find(s=>Number(s.id)===Number(task?.spaceId))?.name??"sin espacio";return `${taskName(id)} (${participant}, ${space})`;}).join("; ");
  const violationDecisionText=(violation:any)=>{
    const current=(violation.affectedTaskIds??[]).map((id:number)=>{const task=draft?.tasks?.find((t:any)=>Number(t.taskId)===Number(id));return `${taskContext([id])}: ${task?.startPlanned??'sin inicio'}–${task?.endPlanned??'sin fin'}`;});
    const changes=(violation.details?.taskChanges??[]).map((change:any)=>`${taskContext([change.taskId])}: antes ${change.before.start??'sin inicio'}–${change.before.end??'sin fin'}; después ${change.after.start??'sin inicio'}–${change.after.end??'sin fin'}.`);
    return [violationExplanation(violation),...current,...changes].join('\n');
  };
  const violationExplanation=(violation:any)=>transportViolationExplanation(violation)??({
    OVERLAP_VIOLATION:"Estas tareas no pueden coincidir porque comparten participante, responsable o espacio.",
    RESOURCE_OVERLAP_VIOLATION:"Estas tareas no pueden coincidir porque necesitan el mismo recurso.",
    AVAILABILITY_VIOLATION:"La ubicación o alguna persona implicada no está disponible en ese horario.",
    RESOURCE_AVAILABILITY_VIOLATION:"Un recurso necesario no está disponible en ese horario.",
    DEPENDENCY_VIOLATION:"No se respeta el orden necesario entre estas tareas.",
    TRANSITION_VIOLATION:"No hay tiempo suficiente para el desplazamiento entre estas tareas.",
    RESOURCE_TRANSITION_VIOLATION:"No hay tiempo suficiente para trasladar el recurso entre estas tareas.",
    RESOURCE_REQUIRED_PRESENCE_VIOLATION:"La presencia requerida del recurso no queda agrupada de forma operativa.",
    UNPLANNED_TASKS:"Esta tarea todavía no tiene una ubicación completa en el plan.",
  } as Record<string,string>)[String(violation.ruleCode)]??"La configuración operativa vigente detecta un conflicto que requiere revisión humana.";
  const warningExplanation=(warning:any)=>warning.kind==="TRANSPORT_GROUP_SIZE"?`El grupo de transporte tiene ${warning.actualGroupSize} participantes; máximo permitido ${warning.maximumGroupSize}.`:({AVAILABILITY:"La tarea queda fuera del horario disponible.",PARTICIPANT_OVERLAP:"Estas tareas no pueden coincidir porque participa la misma persona.",SPACE_OVERLAP:"Estas tareas no pueden coincidir porque utilizan el mismo espacio.",RESOURCE_OVERLAP:"Estas tareas no pueden coincidir porque necesitan el mismo recurso.",DIRECT_DEPENDENCY:"No se respeta el orden necesario entre estas tareas."} as Record<string,string>)[String(warning.kind)]??"Revisa la compatibilidad operativa de estas tareas.";
  const acceptedHard:any[]=state.acceptedExceptions??[];
  const hardAffectedTaskIds=new Set<number>(acceptedHard.flatMap(item=>item.affectedTaskIdsJson??[]).map(Number));
  const operationDisabled=!!busy||!draft||selected.length===0;
  const plannedObligations=(draft?.tasks??[]).filter((task:any)=>task.startPlanned&&task.endPlanned).length;
  const toolbar=<PlanningStageToolbar stage={historyModel.localNumber} planned={plannedObligations} total={draft?.tasks?.length??0} modified={modified} touched={touchedTaskCount} validation={validationCurrent?"Validación vigente":state.session?.draftValidationId?"Volver a validar":"Pendiente de validar"}
    actions={<fieldset disabled={!authorized.current||!!busy||pendingTimelineEdits>0||viewAuthority==="accepted"} className="flex flex-wrap items-center gap-2"><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!!busy||modified} onClick={suggestScope}>{busy==='suggest'?'Seleccionando…':'Sugerir siguiente alcance'}</Button><Button disabled={!!busy||!scopeSelector} onClick={generate}>{busy==="proposal"?"Generando…":"Generar propuesta"}</Button>{preview?.outcome==="PROPOSAL"?<><Button disabled={!!busy} onClick={()=>mutate("apply",()=>apiRequest("POST",`/api/plans/${planId}/assisted/proposals/${runId}/apply`,guard()))}>Aplicar al borrador</Button><Button disabled={!!busy} variant="outline" onClick={()=>{setPreview(null);setRunId(null)}}>Descartar propuesta</Button></>:null}</div>  <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>mutate("validate",()=>apiRequest("POST",`/api/plans/${planId}/assisted/validate`,guard()))}>Validar borrador</Button><Button size="sm" disabled={!!busy||!validationCurrent||requiresAdminAuthorization} onClick={acceptStage}>Aceptar etapa</Button></fieldset>}
    editingTools={<DayCollapsibleSection title="Herramientas de edición" open={editingOpen} onOpenChange={setEditingOpen} testId="section-assisted-editing"><p className="my-2 text-xs text-muted-foreground">Selecciona tareas para habilitar las operaciones compatibles. Los cambios requieren validación.</p><fieldset disabled={!authorized.current||!!busy||pendingTimelineEdits>0||viewAuthority==="accepted"} className="flex flex-wrap gap-2">  <Button size="sm" variant="outline" disabled={operationDisabled} onClick={()=>applyOperation(shiftTasks(draft,selected,-15,"MULTI_SHIFT"))}>Desplazar −15 min</Button><Button size="sm" variant="outline" disabled={operationDisabled} onClick={()=>applyOperation(shiftTasks(draft,selected,15,"MULTI_SHIFT"))}>Desplazar +15 min</Button>
  <Button size="sm" variant="outline" disabled={!!busy||selectedBlocks.length!==1} onClick={()=>editBlock({kind:"MOVE_BLOCK",blockId:selectedBlocks[0].blockId,deltaMinutes:15})}>Mover bloque +15</Button>
  <Button size="sm" variant="outline" disabled={operationDisabled} onClick={()=>applyOperation(cascadeTasks(draft,selected,15))}>Cascada +15 min</Button><Button size="sm" variant="outline" disabled={!!busy||selected.length!==2} onClick={swapSelected}>Intercambiar</Button><Button size="sm" variant="outline" disabled={!!busy||selected.length<2} onClick={reorderSelected}>Invertir orden</Button>
  <Button size="sm" variant="outline" disabled={operationDisabled} onClick={()=>applyOperation(resetTasksToBase(draft,base,selected))}>Restaurar selección</Button><Button size="sm" variant="outline" disabled={!!busy||!modified} onClick={()=>mutate("reset",()=>apiRequest("POST",`/api/plans/${planId}/assisted/draft/reset`,guard()))}>Restaurar borrador</Button>
  <Button size="sm" variant="outline" disabled={!!busy||selected.length<2||selectedBlocks.length>0} onClick={()=>editBlock({kind:"CREATE_BLOCK",memberTaskIds:selected})}>Crear bloque</Button>
  <Button size="sm" variant="outline" disabled={!!busy||selectedBlocks.length!==1} onClick={()=>editBlock({kind:"SPLIT_BLOCK",blockId:selectedBlocks[0].blockId,splitAfter:Math.floor(selectedBlocks[0].memberTaskIds.length/2)})}>Dividir bloque</Button>
  <Button size="sm" variant="outline" disabled={!!busy||selectedBlocks.length!==2} onClick={()=>editBlock({kind:"MERGE_BLOCKS",blockIds:selectedBlocks.map(block=>block.blockId)})}>Fusionar bloques</Button>
  <Button size="sm" variant="outline" disabled={!!busy||selectedBlocks.length!==1} onClick={()=>editBlock({kind:"REMOVE_BLOCK_GROUPING",blockId:selectedBlocks[0].blockId})}>Retirar agrupación</Button>
  <Button size="sm" variant="outline" disabled={!!busy||!state.session?.draftScopeJson?.editLedger?.length} onClick={()=>mutate("undo",()=>apiRequest("POST",`/api/plans/${planId}/assisted/draft/undo`,guard()))}>Deshacer edición</Button><Button size="sm" variant="outline" disabled={!!busy||!state.session?.draftScopeJson?.redoLedger?.length} onClick={()=>mutate("redo-edit",()=>apiRequest("POST",`/api/plans/${planId}/assisted/draft/redo`,guard()))}>Rehacer edición</Button>
</fieldset></DayCollapsibleSection>}
  />;
  const autopilotView=autopilotProgress?projectAutopilotProgress(autopilotProgress,plan.dailyTasks??[],scopeSpaces,active?.ordinal===autopilotProgress.stage?historyModel:null):null;
  const autopilotHeader=(maximized:boolean)=>authorized.current&&(isAutopilotClean(state)||autopilotProgress)?<Card className={maximized&&autopilotProgress?"min-w-0 border-border p-2":"border-border p-3 space-y-2"} data-testid="assisted-autopilot">
      {maximized&&autopilotProgress&&autopilotView?<div className="flex min-w-0 items-center gap-3">
        <AssistedAutopilotProgress compact progress={autopilotProgress} view={autopilotView}/>
        {busy==="autopilot"?<Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={autopilotProgress.stopRequested} onClick={()=>autopilot.current?.requestStop()}>Detener al terminar la etapa</Button>:null}
        {busy!=="autopilot"&&autopilotProgress.phase!=="COMPLETE"&&isAutopilotClean(state)?<Button size="sm" className="h-8 shrink-0 text-xs" onClick={startAutopilot}>Completar automáticamente</Button>:null}
      </div>:<>
        <div className="flex flex-wrap items-center gap-2">{busy!=="autopilot"&&isAutopilotClean(state)?<Button disabled={!!busy||pendingTimelineEdits>0} onClick={startAutopilot}>Completar automáticamente</Button>:null}
        {busy==="autopilot"?<Button variant="outline" disabled={autopilotProgress?.stopRequested} onClick={()=>autopilot.current?.requestStop()}>Detener al terminar la etapa</Button>:null}</div>
        {autopilotProgress&&autopilotView?<AssistedAutopilotProgress progress={autopilotProgress} view={autopilotView}/>:null}
      </>}
    </Card>:null;
  const acceptedSnapshot=autopilotProgress&&autopilotCheckpoint?autopilotCheckpoint.activeStage.snapshotJson:active?.snapshotJson;
  return <div className="space-y-3" data-testid="assisted-workspace">
    <DayCollapsibleSection title="Configuración y mantenimiento de la sesión" open={maintenanceOpen} onOpenChange={setMaintenanceOpen} testId="section-assisted-maintenance"><div className="space-y-3">    {authorized.current?<Button variant="outline" disabled={!!busy||pendingTimelineEdits>0} onClick={restart}>Reiniciar Asistida</Button>:null}
    <Card className="border-border p-3 space-y-2" data-testid="assisted-config-refresh"><div className="flex items-center gap-2"><strong>Configuración del día</strong><Button size="sm" variant="outline" disabled={!!busy} onClick={previewConfig}>Actualizar desde configuración general</Button></div>
    {configPreview?<><p className="text-sm">La configuración se materializa automáticamente al crear el día. Esta actualización sólo sirve para poner al día jornadas existentes; no es una tarea diaria obligatoria. Revisa y elige qué cambios compatibles incorporar. Las etapas aceptadas y sus decisiones no se modificarán.</p>{configPreview.localOverrides?.length>0?<div className="rounded border p-2 text-sm"><b>Ajustes locales existentes en el día:</b><ul className="list-disc pl-5">{configPreview.localOverrides.map((item:any)=><li key={item.key}>{item.label} <Badge variant="outline">Ajuste local del día</Badge></li>)}</ul></div>:null}{configPreview.changes.length===0?<p className="text-sm text-muted-foreground">{configPreview.unsupportedAuthorities.length===0?"La configuración del día ya está actualizada.":"No hay cambios en las categorías compatibles."}</p>:<div className="space-y-1">{configPreview.changes.map((change:any)=><label key={change.key} className="flex items-start gap-2 rounded border p-2 text-sm"><Checkbox aria-label={`Incluir ${change.label}`} checked={configSelection.includes(change.key)} onCheckedChange={value=>setConfigSelection(old=>value?[...old,change.key]:old.filter(key=>key!==change.key))}/><span><b>{change.label}</b> · {change.kind==="NEW"?"Nuevo":change.kind==="REMOVED"?"Eliminado":"Modificado"}{change.localOverride?<Badge variant="outline" className="ml-2">Ajuste local del día</Badge>:null}<small className="block text-muted-foreground">{change.category} · Origen actual: {change.currentSource??"no disponible"} · Impacto: {change.impact==="REVALIDATE"?"requiere revalidar":"desconocido"}</small><ul className="list-disc pl-5 text-xs text-muted-foreground">{summarizeConfigRefreshChange(change).map(summary=><li key={summary}>{summary}</li>)}</ul>{change.incompatibilities?.length?<small className="block text-destructive">Incompatibilidades: {change.incompatibilities.join(", ")}</small>:null}</span></label>)}</div>}{configPreview.unsupportedAuthorities.length>0?<div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm"><b>Categorías aún no comparables:</b><ul className="list-disc pl-5">{configPreview.unsupportedAuthorities.map((item:any)=><li key={item.authority}>{item.label}</li>)}</ul></div>:null}<div className="flex gap-2"><Button size="sm" disabled={!!busy||configSelection.length===0} onClick={applyConfig}>Aplicar selección</Button><Button size="sm" variant="outline" disabled={configPreview.changes.length===0} onClick={()=>setConfigSelection(configPreview.changes.map((x:any)=>x.key))}>Seleccionar todos los cambios compatibles</Button><Button size="sm" variant="ghost" onClick={()=>setConfigPreview(null)}>Cerrar</Button></div></>:null}</Card>
</div></DayCollapsibleSection>
    {toolbar}
    {requiresAdminAuthorization?<p role="status" data-testid="assisted-hard-admin-required" className="rounded-lg border border-red-600 p-3 text-sm text-red-700">Este borrador necesita autorización administrativa para aceptar conflictos críticos nuevos. Producción puede seguir editando y validando.</p>:null}
    {pendingTimelineEdits>0?<p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Aplica o descarta los movimientos locales antes de generar, validar o cambiar a la planificación aceptada.</p>:null}
    {preview?.outcome==="PROPOSAL"?<p className="text-sm text-muted-foreground">Vista previa de propuesta. Aplica o descarta la propuesta antes de arrastrar tareas del borrador.</p>:null}
    <DayCollapsibleSection title="Alcance de la siguiente propuesta" open={scopeOpen} onOpenChange={setScopeOpen} testId="section-assisted-scope" actions={<><Button size="sm" disabled={!!busy} variant={scopeKind==="TASK_IDS"?"default":"outline"} onClick={()=>{clearProposal();setScopeKind("TASK_IDS");}}>Tareas</Button><Button size="sm" disabled={!!busy} variant={scopeKind==="SPACE"?"default":"outline"} onClick={()=>{clearProposal();setScopeKind("SPACE");}}>Espacios y zonas</Button></>}>
    <div className="space-y-3">
    {scopeKind==="SPACE"?<AssistedLocationScope zones={scopeZones} spaces={scopeSpaces} tasks={eligibleTasks} selected={selectedSpaces} disabled={!!busy} onChange={ids=>{clearProposal();setSelectedSpaces(ids);}}/>:null}
    {scopeKind==="TASK_IDS"?<div className="max-h-40 overflow-auto grid gap-1 md:grid-cols-2">{eligibleTasks.map((task:any)=>{const block=blocks.find(item=>item.memberTaskIds.includes(Number(task.id)));const memberOrder=block?.memberTaskIds.indexOf(Number(task.id));const hasAcceptedHard=hardAffectedTaskIds.has(Number(task.id));return <label key={task.id} className={`flex gap-2 items-start rounded border p-2 text-sm ${hasAcceptedHard?"border-red-600 bg-red-50":""}`}><Checkbox disabled={!!busy} checked={selected.includes(Number(task.id))} onCheckedChange={v=>{clearProposal();setSelected(old=>v===true?[...new Set([...old,Number(task.id)])].sort((a,b)=>a-b):old.filter(x=>x!==Number(task.id)));}}/><span><b>{task.template?.name??task.name??"Tarea sin nombre"}</b>{hasAcceptedHard?<Badge variant="destructive" className="ml-1">Conflicto aceptado</Badge>:null}{block?<Badge variant="outline" className="ml-1">Bloque {block.order+1}.{memberOrder+1}</Badge>:null}<small className="block text-muted-foreground">{participantName(task)} · {spaces.find(s=>Number(s.id)===Number(task.spaceId))?.name??"Sin espacio"} · {task.startPlanned?"Con horario":"Pendiente de planificar"}</small></span></label>})}</div>:null}
    <label className="flex gap-2 items-start text-sm"><Checkbox disabled={!!busy} checked={includePrerequisites} onCheckedChange={v=>{clearProposal();setIncludePrerequisites(v===true);}}/><span><b>Incluir prerrequisitos</b><small className="block text-muted-foreground">Activa esta opción para incorporar los prerrequisitos necesarios a la selección visible. El motor comprueba sus dependencias en ambos casos.</small></span></label>
    </div></DayCollapsibleSection>
    <p role="status" aria-live="polite" data-testid="assisted-scope-count" className="text-sm">{scopeTaskIds.length} obligaciones pendientes seleccionadas{includePrerequisites?" · Los prerrequisitos adicionales se resolverán al generar":""}</p>

    {acceptedHard.length?<Card className="p-3 text-sm border-red-600 text-red-700" data-testid="accepted-exception-marker"><b>CONFLICTO CRÍTICO ACEPTADO</b><p>Requiere seguimiento mientras siga vigente: {taskContext([...hardAffectedTaskIds])}.</p></Card>:null}
    {validationReport?<Card className={`p-3 text-sm ${Number(state.validation.hardCount)>0?"border-red-600":Number(state.validation.requiredCount)>0?"border-amber-500":""}`} data-testid="stage-validation-report"><b>{state.validation.hardCount} conflicto(s) crítico(s) · {state.validation.requiredCount} desviación(es) operativa(s) · {state.validation.preferredCount} recomendación(es)</b><div className="space-y-1 mt-2">{(validationReport.violations??[]).map((violation:any)=><div key={violation.violationKey} className={violation.severity==="HARD"?"text-red-700":violation.severity==="REQUIRED"?"text-amber-700":"text-muted-foreground"}><b>{violation.severity==="HARD"?"Conflicto crítico":violation.severity==="REQUIRED"?"Desviación que requiere confirmación":"Recomendación"}</b> · {violationExplanation(violation)} <span>{taskContext(violation.affectedTaskIds??[])}</span>{(violation.details?.taskChanges??[]).map((change:any)=><div key={change.taskId} className="text-xs">{taskContext([change.taskId])}: antes {change.before.start}–{change.before.end}; después {change.after.start}–{change.after.end}.</div>)}{violation.inheritedAcceptedExceptionId?<Badge variant={violation.severity==="HARD"?"destructive":"secondary"} className="ml-2">Aceptada previamente</Badge>:null}</div>)}</div></Card>:null}
    {localWarnings.length?<Card className="p-3 text-sm border-amber-500" data-testid="local-draft-warnings"><b>Avisos locales (sin corrección automática)</b><div>{localWarnings.map((warning,index)=><p key={index}>{warningExplanation(warning)} {taskContext([...warning.taskIds])}</p>)}</div></Card>:null}
    {preview?.evidence?.mainFlowSoftPreference?<Card className="p-3 text-sm" data-testid="main-flow-preference-result"><p>{mainFlowPreferenceResultMessage(preview.evidence.mainFlowSoftPreference)}</p></Card>:null}{preview?<Card className="p-3 text-sm"><b>{preview.outcome==="PROPOSAL"?"Vista previa de propuesta":preview.outcome==="NO_PROPOSAL"?"No se encontró una propuesta válida":"No se puede generar la propuesta con la información actual"}</b><p>{preview.proposal?.length??0} tarea(s) propuestas · {preview.scopeTaskIds?.length??0} tarea(s) en el alcance.</p>{preview.outcome!=="PROPOSAL"?<p>{transportPartitionExplanation(preview.evidence)??"Revisa la selección, la disponibilidad y los conflictos indicados antes de intentarlo de nuevo."}</p>:null}</Card>:null}{message?<p className="text-sm text-destructive">{message}</p>:null}
    <DayCollapsibleSection title="Historial" open={historyOpen} onOpenChange={open=>{setHistoryOpen(open);if(open&&historyTimingsQ.isError)void historyTimingsQ.refetch();}} testId="section-assisted-history">
      {historyTimingsQ.isFetching?<p className="text-xs" role="status">Cargando tiempos…</p>:null}
      {historyTimingsQ.isError?<p className="text-xs text-destructive" role="alert">No se pudieron consultar los tiempos. Vuelve a abrir Historial para reintentar.</p>:null}
      <AssistedStageHistory model={historyModel} active={active??null} timings={historyTimingsQ.isError?[]:historyTimingsQ.data??[]} disabled={!!busy||pendingTimelineEdits>0}
        onRestore={stage=>{void mutate("rollback",()=>apiRequest("POST",`/api/plans/${planId}/assisted/rollback`,{targetStageId:Number(stage.id)}),true);}}
        onRedo={()=>{void mutate("redo",()=>apiRequest("POST",`/api/plans/${planId}/assisted/redo`,{}),true);}} />
    </DayCollapsibleSection>
    {historyModel.lineageError?<p role="status" className="text-sm text-destructive">{historyModel.lineageError}</p>:null}
    <ol className="flex max-w-full gap-2 overflow-x-auto py-2" aria-label="Progreso de etapas">{historyModel.rows.map(({stage,localNumber})=><li key={stage.id} className={`shrink-0 rounded-md border px-3 py-2 text-xs ${stage.archivedAt?"opacity-50":stage.id===active?.id?"border-primary bg-primary/5":"bg-card"}`}><strong>S{localNumber}</strong> · {stageObligations(stage)?.scheduled??"?"}/{stageObligations(stage)?.total??"?"}{stage.archivedAt?" · rama archivada":stage.id===active?.id?" · aceptada actual":" · aceptada"}</li>)}<li className="shrink-0 rounded-md border border-dashed px-3 py-2 text-xs">{preview?"Propuesta pendiente":modified?"Borrador con cambios":"Borrador actual"}</li></ol>
    {viewControls}
    {composedOperations.length>0&&<details data-testid="anchored-operations"><summary>Operaciones acompañadas · {composedOperations.length}</summary><ul>{composedOperations.map(operation=><li key={operation.id} data-testid="anchored-operation">Acompañamiento · {operation.status==='CONTINUOUS'?`${operation.start}–${operation.end} · ${operation.durationMinutes} min · Ensayo incluido ${operation.anchorOccupation?.durationMinutes} min`:'Pendiente de completar'} · 1 operación</li>)}</ul></details>}
    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">Planificación consultada</span><Button size="sm" variant={viewAuthority==="draft"?"default":"outline"} onClick={()=>setViewAuthority("draft")}>Edición del borrador</Button><Button size="sm" variant={viewAuthority==="accepted"?"default":"outline"} disabled={pendingTimelineEdits>0} onClick={()=>setViewAuthority("accepted")}>Planning aceptado · ejecución</Button>{viewAuthority==="accepted"?<><Badge variant="outline">Sin arrastre · acciones según autoridad</Badge><Button size="sm" variant="outline" onClick={onOpenExecution}>Abrir ejecución</Button></>:null}</div>
    <PlanningWorkspaceLayout planId={planId} header={autopilotHeader} maximizeRequest={maximizeRequest} presentationMode={busy==="autopilot"||!!autopilotProgress} onPendingEditsChange={setPendingTimelineEdits} timelineProps={{...timelineProps as any,operationalMeals,onTaskStatusChange:busy!=="autopilot"&&viewAuthority==="accepted"?timelineProps.onTaskStatusChange:undefined,plan:viewAuthority==="accepted"?{...plan,dailyTasks:buildAssistedPlanningView(plan.dailyTasks??[],acceptedSnapshot)}:assistedPlan,mode:viewAuthority==="accepted"?"accepted":"assisted-draft",readOnly:busy==="autopilot"||viewAuthority==="accepted"||preview?.outcome==="PROPOSAL"||!authorized.current,taskVisualStates:viewAuthority==="draft"?visual:{},onApplyManualEdits:viewAuthority==="draft"&&authorized.current&&busy!=="autopilot"?applyTimelineEdits:undefined}} />
  </div>;
});
