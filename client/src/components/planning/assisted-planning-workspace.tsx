import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { planQueryKey } from "@/lib/plan-query-keys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FullscreenPlanningPanel } from "./fullscreen-planning-panel";
import { PlanningTimeline } from "../planning-timeline";
import { assistedDraftTouchedTaskIds, buildAssistedPlanningView, classifyAssistedTasks, isAssistedDraftModified } from "@/lib/assisted-planning-view";
import { cascadeTasks, reorderTasks, resetTasksToBase, shiftTasks, swapTasks, type AssistedDraftPatch } from "@/lib/assisted-draft-editing";
import { collectAssistedDraftWarnings } from "@/lib/assisted-draft-warnings";

type ScopeKind="TASK_IDS"|"SPACE";
const key=(planId:number)=>["assisted-planning",planId];
const operatorError=(error:any)=>{
  const code=String(error?.code??error?.message??error??"");
  if(code.includes("STALE_"))return "El borrador cambió en otra operación. Se ha actualizado la vista; revisa los cambios e inténtalo de nuevo.";
  if(code.includes("CONFIRMATION_REQUIRED"))return "Esta decisión necesita confirmación explícita antes de aceptarse.";
  if(code.includes("VALIDATION"))return "El borrador debe validarse de nuevo antes de continuar.";
  if(code.includes("SESSION_NOT_FOUND"))return "No hay una sesión activa de planificación asistida.";
  return "No se pudo completar la operación. Revisa el borrador e inténtalo de nuevo.";
};
export const isMissingAssistedSession=(error:any)=>error?.status===404||error?.code==="SESSION_NOT_FOUND";
export const isAssistedConflict=(error:any)=>error?.status===409;

export function AssistedPlanningWorkspace({planId,plan,timelineProps,spaces=[]}:{planId:number;plan:any;timelineProps:Record<string,unknown>;spaces?:any[]}) {
  const client=useQueryClient(); const bootstrapped=useRef(false);
  const [scopeKind,setScopeKind]=useState<ScopeKind>("TASK_IDS"); const [selected,setSelected]=useState<number[]>([]);
  const [spaceId,setSpaceId]=useState(""); const [includePrerequisites,setIncludePrerequisites]=useState(false);
  const [runId,setRunId]=useState<number|null>(null); const [preview,setPreview]=useState<any>(null); const [busy,setBusy]=useState<string|null>(null); const [message,setMessage]=useState<string|null>(null);
  const stateQ=useQuery({queryKey:key(planId),queryFn:()=>apiRequest<any>("GET",`/api/plans/${planId}/assisted`),retry:false});
  const bootstrap=()=>{if(bootstrapped.current)return;bootstrapped.current=true;setBusy("bootstrap");setMessage(null);apiRequest("POST",`/api/plans/${planId}/assisted/session`,{}).then(()=>stateQ.refetch()).catch(e=>{bootstrapped.current=false;setMessage(operatorError(e));}).finally(()=>setBusy(null));};
  useEffect(()=>{if(stateQ.isError&&isMissingAssistedSession(stateQ.error))bootstrap();},[planId,stateQ.isError]);
  const pollQ=useQuery({queryKey:["assisted-proposal",planId,runId],queryFn:()=>apiRequest<any>("GET",`/api/plans/${planId}/assisted/proposals/${runId}`),enabled:runId!=null,refetchInterval:q=>{const s=(q.state.data as any)?.status;return s==="running"||s==="queued"?1000:false;}});
  useEffect(()=>{const run=pollQ.data;if(!run)return;const status=run.status;if(status==="success"){setPreview(run.assisted_result_json??run.assistedResultJson);setBusy(null);}else if(status==="error"){setMessage("No se pudo generar una propuesta con la selección actual. Revisa disponibilidad y conflictos.");setBusy(null);}},[pollQ.data]);
  const state=stateQ.data; const draft=state?.draft; const active=state?.activeStage;
  const base=useMemo(()=>state?.history?.find((stage:any)=>Number(stage.id)===Number(state?.draftBaseStageId))?.snapshotJson??active?.snapshotJson??null,[state,active]);
  const previewIds=(preview?.proposal??[]).map((x:any)=>Number(x.taskId));
  const visual=useMemo(()=>draft?classifyAssistedTasks(draft,base,selected,previewIds):{},[draft,base,selected,preview]);
  const displayDraft=useMemo(()=>{if(!draft||preview?.outcome!=="PROPOSAL")return draft;const proposed=new Map((preview.proposal??[]).map((row:any)=>[Number(row.taskId),row]));return {...draft,tasks:draft.tasks.map((row:any)=>({...row,...(proposed.get(Number(row.taskId))??{})}))};},[draft,preview]);
  const assistedPlan=useMemo(()=>displayDraft?{...plan,dailyTasks:buildAssistedPlanningView(plan.dailyTasks??[],displayDraft)}:plan,[plan,displayDraft]);
  const localWarnings=useMemo(()=>collectAssistedDraftWarnings(assistedPlan.dailyTasks??[],{start:plan.startTime??plan.workdayStart,end:plan.endTime??plan.workdayEnd}),[assistedPlan,plan]);
  const guard=()=>({expectedDraftFingerprint:state.draftFingerprint,expectedBaseStageId:Number(state.draftBaseStageId)});
  const refresh=async(planToo=false)=>{await client.invalidateQueries({queryKey:key(planId)});await stateQ.refetch();if(planToo){await client.invalidateQueries({queryKey:planQueryKey(planId)});await client.refetchQueries({queryKey:planQueryKey(planId)});}};
  const clearProposal=()=>{setPreview(null);setRunId(null);};
  const mutate=async(label:string,work:()=>Promise<any>,planToo=false)=>{setBusy(label);setMessage(null);try{await work();clearProposal();await refresh(planToo);}catch(e:any){setMessage(operatorError(e));if(isAssistedConflict(e)){clearProposal();await refresh();}}finally{setBusy(null);}};
  const validationCurrent=Boolean(state?.validation&&state.validation.draftFingerprint===state.draftFingerprint&&Number(state.validation.baseStageId)===Number(state.draftBaseStageId)&&Number(state.validation.configRevisionId)===Number(state.currentConfigRevisionId));
  const validationReport:any=validationCurrent?state.validation.reportJson:null;
  const acceptStage=()=>{const hard=Number(state.validation?.hardCount??0),required=Number(state.validation?.requiredCount??0);let confirmation="NONE";
    if(hard>0){if(!window.confirm(`Este borrador contiene ${hard} conflicto(s) críticos y ${required} desviación(es) operativas. Se registrarán las excepciones aceptadas. ¿Continuar?`))return;confirmation="HARD_EXCEPTIONS";}
    else if(required>0){if(!window.confirm(`Este borrador contiene ${required} desviación(es) operativas. Quedarán registradas en el historial. ¿Aceptar conscientemente?`))return;confirmation="REQUIRED_DEVIATIONS";}
    return mutate("accept",()=>apiRequest("POST",`/api/plans/${planId}/assisted/accept-stage`,{...guard(),confirmation}),true);};
  const modified=Boolean(draft&&isAssistedDraftModified(draft,base));
  const touchedTaskCount=draft?assistedDraftTouchedTaskIds(draft,base).length:0;
  const blocks:any[]=draft?.planningBlocks??[];
  const selectedBlocks=blocks.filter(block=>block.memberTaskIds.some((id:number)=>selected.includes(Number(id))));
  const applyTimelineEdits=async(edits:Array<{taskId:number;start:string|null;end:string|null}>)=>mutate("edit",()=>apiRequest("PATCH",`/api/plans/${planId}/assisted/draft`,{
    ...guard(),changes:edits.map(edit=>({taskId:edit.taskId,startPlanned:edit.start,endPlanned:edit.end})),
  }));
  const applyOperation=(operation:AssistedDraftPatch)=>applyTimelineEdits(operation.changes.map(task=>({taskId:task.taskId,start:task.startPlanned,end:task.endPlanned})));
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
  const generate=async()=>{setBusy("proposal");setMessage(null);setPreview(null);try{const selector=scopeKind==="TASK_IDS"?{kind:"TASK_IDS",taskIds:selected}:{kind:"SPACE",spaceId:Number(spaceId)};const result=await apiRequest<any>("POST",`/api/plans/${planId}/assisted/proposals`,{selector,includePrerequisites,...guard()});setRunId(Number(result.runId));}catch(e:any){setMessage(operatorError(e));setBusy(null);if(isAssistedConflict(e)){clearProposal();await refresh();}}};
  if(stateQ.isLoading||busy==="bootstrap")return <Card className="p-4">Inicializando planificación asistida…</Card>;
  if(!state)return <Card className="p-4 text-destructive">No se pudo iniciar la sesión assisted. {message} <Button size="sm" variant="outline" disabled={!!busy} onClick={bootstrap}>Reintentar</Button></Card>;
  const taskRows:any[]=assistedPlan.dailyTasks??[];
  const taskById=new Map(taskRows.map((task:any)=>[Number(task.id),task]));
  const taskName=(id:number)=>{const task=taskById.get(Number(id));return task?.template?.name??task?.name??"Tarea sin nombre";};
  const taskContext=(ids:number[])=>ids.map(id=>{const task=taskById.get(Number(id));const participant=task?.contestant?.name??task?.participant?.name??"sin participante";const space=spaces.find(s=>Number(s.id)===Number(task?.spaceId))?.name??"sin espacio";return `${taskName(id)} (${participant}, ${space})`;}).join("; ");
  const violationExplanation=(violation:any)=>({
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
  const warningExplanation=(warning:any)=>({AVAILABILITY:"La tarea queda fuera del horario disponible.",PARTICIPANT_OVERLAP:"Estas tareas no pueden coincidir porque participa la misma persona.",SPACE_OVERLAP:"Estas tareas no pueden coincidir porque utilizan el mismo espacio.",RESOURCE_OVERLAP:"Estas tareas no pueden coincidir porque necesitan el mismo recurso.",DIRECT_DEPENDENCY:"No se respeta el orden necesario entre estas tareas."} as Record<string,string>)[String(warning.kind)]??"Revisa la compatibilidad operativa de estas tareas.";
  const acceptedHard:any[]=state.acceptedExceptions??[];
  const hardAffectedTaskIds=new Set<number>(acceptedHard.flatMap(item=>item.affectedTaskIdsJson??[]).map(Number));
  const operationDisabled=!!busy||!draft||selected.length===0;
  const toolbar=<div className="flex flex-wrap items-center gap-1 text-xs"><Badge>Etapa {active?.ordinal??0}</Badge><Badge variant={modified?"destructive":"secondary"}>{modified?"Con cambios":"Sin cambios"}</Badge>{modified?<Badge variant="outline">{touchedTaskCount} tocadas</Badge>:null}<Badge variant={validationCurrent?"default":"outline"}>{validationCurrent?"Validado":state.session?.draftValidationId?"Validación pendiente de renovar":"Pendiente de validar"}</Badge>
  <Button size="sm" variant="outline" disabled={operationDisabled} onClick={()=>applyOperation(shiftTasks(draft,selected,-15,"MULTI_SHIFT"))}>Multi −15</Button><Button size="sm" variant="outline" disabled={operationDisabled} onClick={()=>applyOperation(shiftTasks(draft,selected,15,"MULTI_SHIFT"))}>Multi +15</Button>
  <Button size="sm" variant="outline" disabled={!!busy||selectedBlocks.length!==1} onClick={()=>editBlock({kind:"MOVE_BLOCK",blockId:selectedBlocks[0].blockId,deltaMinutes:15})}>Mover bloque +15</Button>
  <Button size="sm" variant="outline" disabled={operationDisabled} onClick={()=>applyOperation(cascadeTasks(draft,selected,15))}>Cascade +15</Button><Button size="sm" variant="outline" disabled={!!busy||selected.length!==2} onClick={swapSelected}>Swap</Button><Button size="sm" variant="outline" disabled={!!busy||selected.length<2} onClick={reorderSelected}>Reorder</Button>
  <Button size="sm" variant="outline" disabled={operationDisabled} onClick={()=>applyOperation(resetTasksToBase(draft,base,selected))}>Reset selection</Button><Button size="sm" variant="outline" disabled={!!busy||!modified} onClick={()=>mutate("reset",()=>apiRequest("POST",`/api/plans/${planId}/assisted/draft/reset`,guard()))}>Reset Draft</Button>
  <Button size="sm" variant="outline" disabled={!!busy||selected.length<2||selectedBlocks.length>0} onClick={()=>editBlock({kind:"CREATE_BLOCK",memberTaskIds:selected})}>Crear bloque</Button>
  <Button size="sm" variant="outline" disabled={!!busy||selectedBlocks.length!==1} onClick={()=>editBlock({kind:"SPLIT_BLOCK",blockId:selectedBlocks[0].blockId,splitAfter:Math.floor(selectedBlocks[0].memberTaskIds.length/2)})}>Dividir bloque</Button>
  <Button size="sm" variant="outline" disabled={!!busy||selectedBlocks.length!==2} onClick={()=>editBlock({kind:"MERGE_BLOCKS",blockIds:selectedBlocks.map(block=>block.blockId)})}>Fusionar bloques</Button>
  <Button size="sm" variant="outline" disabled={!!busy||selectedBlocks.length!==1} onClick={()=>editBlock({kind:"REMOVE_BLOCK_GROUPING",blockId:selectedBlocks[0].blockId})}>Retirar agrupación</Button>
  <Button size="sm" variant="outline" disabled={!!busy||!state.session?.draftScopeJson?.editLedger?.length} onClick={()=>mutate("undo",()=>apiRequest("POST",`/api/plans/${planId}/assisted/draft/undo`,guard()))}>Draft Undo</Button><Button size="sm" variant="outline" disabled={!!busy||!state.session?.draftScopeJson?.redoLedger?.length} onClick={()=>mutate("redo-edit",()=>apiRequest("POST",`/api/plans/${planId}/assisted/draft/redo`,guard()))}>Draft Redo</Button>
  <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>mutate("validate",()=>apiRequest("POST",`/api/plans/${planId}/assisted/validate`,guard()))}>Validar Draft</Button><Button size="sm" disabled={!!busy||!validationCurrent} onClick={acceptStage}>Aceptar Stage</Button></div>;
  return <div className="space-y-3" data-testid="assisted-workspace">
    <Card className="p-3 space-y-3"><div className="flex flex-wrap gap-2 items-center"><strong>Scope pendiente</strong><Button size="sm" variant={scopeKind==="TASK_IDS"?"default":"outline"} onClick={()=>setScopeKind("TASK_IDS")}>Tareas</Button><Button size="sm" variant={scopeKind==="SPACE"?"default":"outline"} onClick={()=>setScopeKind("SPACE")}>Espacio</Button>
    {scopeKind==="SPACE"?<Select value={spaceId} onValueChange={setSpaceId}><SelectTrigger className="w-56"><SelectValue placeholder="Espacio del plan"/></SelectTrigger><SelectContent>{spaces.map(s=><SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>:null}</div>
    {scopeKind==="TASK_IDS"?<div className="max-h-40 overflow-auto grid gap-1 md:grid-cols-2">{taskRows.filter((task:any)=>task.status==="pending"||task.status==="interrupted").map((task:any)=>{const block=blocks.find(item=>item.memberTaskIds.includes(Number(task.id)));const memberOrder=block?.memberTaskIds.indexOf(Number(task.id));const hasAcceptedHard=hardAffectedTaskIds.has(Number(task.id));return <label key={task.id} className={`flex gap-2 items-start rounded border p-2 text-sm ${hasAcceptedHard?"border-red-600 bg-red-50":""}`}><Checkbox checked={selected.includes(Number(task.id))} onCheckedChange={v=>setSelected(old=>v?[...old,Number(task.id)].sort((a,b)=>a-b):old.filter(x=>x!==Number(task.id)))}/><span><b>{task.template?.name??task.name??"Tarea sin nombre"}</b>{hasAcceptedHard?<Badge variant="destructive" className="ml-1">Conflicto aceptado</Badge>:null}{block?<Badge variant="outline" className="ml-1">Bloque {block.order+1}.{memberOrder+1}</Badge>:null}<small className="block text-muted-foreground">{task.contestant?.name??"Sin concursante"} · {spaces.find(s=>Number(s.id)===Number(task.spaceId))?.name??"Sin espacio"} · {task.startPlanned?"planned":"unplanned"}</small></span></label>})}</div>:null}
    <label className="flex gap-2 items-start text-sm"><Checkbox checked={includePrerequisites} onCheckedChange={v=>setIncludePrerequisites(Boolean(v))}/><span><b>Include prerequisites</b><small className="block text-muted-foreground">OFF excluye supporting internos del scope editable. ON incorpora prerequisites necesarios al scope visible; el servidor resuelve el closure.</small></span></label>
    <div className="flex gap-2"><Button disabled={!!busy||(scopeKind==="TASK_IDS"?selected.length===0:!spaceId)} onClick={generate}>{busy==="proposal"?"Generando…":"Generar propuesta"}</Button>{preview?.outcome==="PROPOSAL"?<><Button onClick={()=>mutate("apply",()=>apiRequest("POST",`/api/plans/${planId}/assisted/proposals/${runId}/apply`,guard()))}>Aplicar al borrador</Button><Button variant="outline" onClick={()=>{setPreview(null);setRunId(null)}}>Descartar propuesta</Button></>:null}</div>
    {acceptedHard.length?<Card className="p-3 text-sm border-red-600 text-red-700" data-testid="accepted-exception-marker"><b>CONFLICTO CRÍTICO ACEPTADO</b><p>Requiere seguimiento mientras siga vigente: {taskContext([...hardAffectedTaskIds])}.</p></Card>:null}
    {validationReport?<Card className={`p-3 text-sm ${Number(state.validation.hardCount)>0?"border-red-600":Number(state.validation.requiredCount)>0?"border-amber-500":""}`} data-testid="stage-validation-report"><b>{state.validation.hardCount} conflicto(s) crítico(s) · {state.validation.requiredCount} desviación(es) operativa(s) · {state.validation.preferredCount} recomendación(es)</b><div className="space-y-1 mt-2">{(validationReport.violations??[]).map((violation:any)=><div key={violation.violationKey} className={violation.severity==="HARD"?"text-red-700":violation.severity==="REQUIRED"?"text-amber-700":"text-muted-foreground"}><b>{violation.severity==="HARD"?"Conflicto crítico":violation.severity==="REQUIRED"?"Desviación que requiere confirmación":"Recomendación"}</b> · {violationExplanation(violation)} <span>{taskContext(violation.affectedTaskIds??[])}</span>{violation.inheritedAcceptedExceptionId?<Badge variant={violation.severity==="HARD"?"destructive":"secondary"} className="ml-2">Aceptada previamente</Badge>:null}</div>)}</div></Card>:null}
    {localWarnings.length?<Card className="p-3 text-sm border-amber-500"><b>Avisos locales (sin corrección automática)</b><div>{localWarnings.map((warning,index)=><p key={index}>{warningExplanation(warning)} {taskContext([...warning.taskIds])}</p>)}</div></Card>:null}
    {preview?<Card className="p-3 text-sm"><b>{preview.outcome==="PROPOSAL"?"Vista previa de propuesta":preview.outcome==="NO_PROPOSAL"?"No se encontró una propuesta válida":"No se puede generar la propuesta con la información actual"}</b><p>{preview.proposal?.length??0} tarea(s) propuestas · {preview.scopeTaskIds?.length??0} tarea(s) en el alcance.</p>{preview.outcome!=="PROPOSAL"?<p>Revisa la selección, la disponibilidad y los conflictos indicados antes de intentarlo de nuevo.</p>:null}</Card>:null}{message?<p className="text-sm text-destructive">{message}</p>:null}
    <details><summary>Historial</summary><div className="flex flex-wrap gap-2 pt-2">{(state.history??[]).map((stage:any)=><span key={stage.id} className="rounded border p-2 text-xs">Etapa {stage.ordinal} · {stage.acceptedAt?new Date(stage.acceptedAt).toLocaleString():""} · {stage.scopeTaskIdsJson?.length??0} tarea(s){Number(stage.validationSummaryJson?.requiredCount)>0?` · ${stage.validationSummaryJson.requiredCount} desviación(es) aceptada(s)`:""}{Number(stage.validationSummaryJson?.hardCount)>0?` · ${stage.validationSummaryJson.hardCount} conflicto(s) crítico(s) aceptado(s)`:""}{stage.archivedAt?" · archivada":""}<Button className="ml-2" size="sm" variant="ghost" disabled={!!busy||stage.archivedAt||stage.id===active?.id} onClick={()=>mutate("rollback",()=>apiRequest("POST",`/api/plans/${planId}/assisted/rollback`,{targetStageId:Number(stage.id)}),true)}>Restaurar</Button></span>)}<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>mutate("redo",()=>apiRequest("POST",`/api/plans/${planId}/assisted/redo`,{}),true)}>Rehacer</Button></div></details></Card>
    <FullscreenPlanningPanel title="Planning asistido" viewKey={`assisted-${planId}`} supportsZoom toolbarRight={toolbar}><PlanningTimeline {...timelineProps as any} plan={assistedPlan} mode="assisted-draft" taskVisualStates={visual} onApplyManualEdits={applyTimelineEdits}/></FullscreenPlanningPanel>
  </div>;
}
