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
const errorCode=(error:any)=>String(error?.message??error??"");
export const isMissingAssistedSession=(error:any)=>error?.status===404||error?.code==="SESSION_NOT_FOUND";
export const isAssistedConflict=(error:any)=>error?.status===409;

export function AssistedPlanningWorkspace({planId,plan,timelineProps,spaces=[]}:{planId:number;plan:any;timelineProps:Record<string,unknown>;spaces?:any[]}) {
  const client=useQueryClient(); const bootstrapped=useRef(false);
  const [scopeKind,setScopeKind]=useState<ScopeKind>("TASK_IDS"); const [selected,setSelected]=useState<number[]>([]);
  const [spaceId,setSpaceId]=useState(""); const [includePrerequisites,setIncludePrerequisites]=useState(false);
  const [runId,setRunId]=useState<number|null>(null); const [preview,setPreview]=useState<any>(null); const [busy,setBusy]=useState<string|null>(null); const [message,setMessage]=useState<string|null>(null);
  const stateQ=useQuery({queryKey:key(planId),queryFn:()=>apiRequest<any>("GET",`/api/plans/${planId}/assisted`),retry:false});
  const bootstrap=()=>{if(bootstrapped.current)return;bootstrapped.current=true;setBusy("bootstrap");setMessage(null);apiRequest("POST",`/api/plans/${planId}/assisted/session`,{}).then(()=>stateQ.refetch()).catch(e=>{bootstrapped.current=false;setMessage(errorCode(e));}).finally(()=>setBusy(null));};
  useEffect(()=>{if(stateQ.isError&&isMissingAssistedSession(stateQ.error))bootstrap();},[planId,stateQ.isError]);
  const pollQ=useQuery({queryKey:["assisted-proposal",planId,runId],queryFn:()=>apiRequest<any>("GET",`/api/plans/${planId}/assisted/proposals/${runId}`),enabled:runId!=null,refetchInterval:q=>{const s=(q.state.data as any)?.status;return s==="running"||s==="queued"?1000:false;}});
  useEffect(()=>{const run=pollQ.data;if(!run)return;const status=run.status;if(status==="success"){setPreview(run.assisted_result_json??run.assistedResultJson);setBusy(null);}else if(status==="error"){setMessage(run.message??"La propuesta terminó con error.");setBusy(null);}},[pollQ.data]);
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
  const mutate=async(label:string,work:()=>Promise<any>,planToo=false)=>{setBusy(label);setMessage(null);try{await work();clearProposal();await refresh(planToo);}catch(e:any){setMessage(errorCode(e));if(isAssistedConflict(e)){clearProposal();await refresh();}}finally{setBusy(null);}};
  const validationCurrent=Boolean(state?.validation&&state.validation.draftFingerprint===state.draftFingerprint&&Number(state.validation.baseStageId)===Number(state.draftBaseStageId)&&Number(state.validation.configRevisionId)===Number(state.currentConfigRevisionId));
  const validationReport:any=validationCurrent?state.validation.reportJson:null;
  const acceptStage=()=>{const hard=Number(state.validation?.hardCount??0),required=Number(state.validation?.requiredCount??0);let confirmation="NONE";
    if(hard>0){if(!window.confirm(`Este Draft contiene ${hard} conflicto(s) HARD. Se crearán excepciones aceptadas auditables. ¿Continuar?`))return;confirmation="HARD_EXCEPTIONS";}
    else if(required>0){if(!window.confirm(`Este Draft contiene ${required} desviación(es) REQUIRED. ¿Aceptar conscientemente?`))return;confirmation="REQUIRED_DEVIATIONS";}
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
  const generate=async()=>{setBusy("proposal");setMessage(null);setPreview(null);try{const selector=scopeKind==="TASK_IDS"?{kind:"TASK_IDS",taskIds:selected}:{kind:"SPACE",spaceId:Number(spaceId)};const result=await apiRequest<any>("POST",`/api/plans/${planId}/assisted/proposals`,{selector,includePrerequisites,...guard()});setRunId(Number(result.runId));}catch(e:any){setMessage(errorCode(e));setBusy(null);if(isAssistedConflict(e)){clearProposal();await refresh();}}};
  if(stateQ.isLoading||busy==="bootstrap")return <Card className="p-4">Inicializando planificación asistida…</Card>;
  if(!state)return <Card className="p-4 text-destructive">No se pudo iniciar la sesión assisted. {message} <Button size="sm" variant="outline" disabled={!!busy} onClick={bootstrap}>Reintentar</Button></Card>;
  const operationDisabled=!!busy||!draft||selected.length===0;
  const toolbar=<div className="flex flex-wrap items-center gap-1 text-xs"><Badge>S{active?.ordinal??0}</Badge><Badge variant={modified?"destructive":"secondary"}>{modified?"MODIFIED":"CLEAN"}</Badge>{modified?<Badge variant="outline">{touchedTaskCount} tocadas</Badge>:null}<Badge variant={validationCurrent?"default":"outline"}>{validationCurrent?"VALID":state.session?.draftValidationId?"STALE":"NOT VALIDATED"}</Badge><Badge variant="outline">config {state.currentConfigRevisionId}</Badge>{runId?<Badge variant="outline">run {runId}</Badge>:null}
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
    {scopeKind==="TASK_IDS"?<div className="max-h-40 overflow-auto grid gap-1 md:grid-cols-2">{(assistedPlan.dailyTasks??[]).filter((task:any)=>task.status==="pending"||task.status==="interrupted").map((task:any)=>{const block=blocks.find(item=>item.memberTaskIds.includes(Number(task.id)));const memberOrder=block?.memberTaskIds.indexOf(Number(task.id));return <label key={task.id} className="flex gap-2 items-start rounded border p-2 text-sm"><Checkbox checked={selected.includes(Number(task.id))} onCheckedChange={v=>setSelected(old=>v?[...old,Number(task.id)].sort((a,b)=>a-b):old.filter(x=>x!==Number(task.id)))}/><span><b>{task.template?.name??task.name??`Tarea ${task.id}`}</b>{block?<Badge variant="outline" className="ml-1">Bloque {block.order+1}.{memberOrder+1}</Badge>:null}<small className="block text-muted-foreground">{task.contestant?.name??"Sin concursante"} · {spaces.find(s=>Number(s.id)===Number(task.spaceId))?.name??"Sin espacio"} · {task.startPlanned?"planned":"unplanned"}</small></span></label>})}</div>:null}
    <label className="flex gap-2 items-start text-sm"><Checkbox checked={includePrerequisites} onCheckedChange={v=>setIncludePrerequisites(Boolean(v))}/><span><b>Include prerequisites</b><small className="block text-muted-foreground">OFF excluye supporting internos del scope editable. ON incorpora prerequisites necesarios al scope visible; el servidor resuelve el closure.</small></span></label>
    <div className="flex gap-2"><Button disabled={!!busy||(scopeKind==="TASK_IDS"?selected.length===0:!spaceId)} onClick={generate}>{busy==="proposal"?"Generando…":"Generar propuesta"}</Button>{preview?.outcome==="PROPOSAL"?<><Button onClick={()=>mutate("apply",()=>apiRequest("POST",`/api/plans/${planId}/assisted/proposals/${runId}/apply`,guard()))}>Aplicar al borrador</Button><Button variant="outline" onClick={()=>{setPreview(null);setRunId(null)}}>Descartar propuesta</Button></>:null}</div>
    {(state.acceptedExceptions??[]).length?<Card className="p-3 text-sm border-red-600 text-red-700" data-testid="accepted-exception-marker"><b>EXCEPCIÓN ACEPTADA</b> · {(state.acceptedExceptions??[]).length} conflicto(s) HARD vigente(s).</Card>:null}
    {validationReport?<Card className={`p-3 text-sm ${Number(state.validation.hardCount)>0?"border-red-600":Number(state.validation.requiredCount)>0?"border-amber-500":""}`} data-testid="stage-validation-report"><b>{state.validation.hardCount} HARD · {state.validation.requiredCount} REQUIRED · {state.validation.preferredCount} PREFERRED · hardValid {String(validationReport.hardValid)}</b><div className="space-y-1 mt-2">{(validationReport.violations??[]).map((violation:any)=><div key={violation.violationKey} className={violation.severity==="HARD"?"text-red-700":violation.severity==="REQUIRED"?"text-amber-700":"text-muted-foreground"}><b>{violation.severity}</b> · {violation.details?.engineReasonCode??violation.ruleCode} · tareas {(violation.affectedTaskIds??[]).join(", ")}{violation.inheritedAcceptedExceptionId?<Badge variant="destructive" className="ml-2">EXCEPCIÓN ACEPTADA</Badge>:null}<details><summary>Detalle técnico</summary>{violation.ruleCode}</details></div>)}</div></Card>:null}
    {localWarnings.length?<Card className="p-3 text-sm border-amber-500"><b>Warnings locales (sin auto-repair)</b><p>{localWarnings.map(w=>`${w.kind} [${w.taskIds.join(",")}]`).join(" · ")}</p></Card>:null}
    {preview?<Card className="p-3 text-sm"><b>{preview.outcome==="PROPOSAL"?"Vista previa de propuesta":preview.outcome==="NO_PROPOSAL"?"Sin propuesta":"Input no soportado"}</b><p>{preview.proposal?.length??0} tareas propuestas · scope {preview.scopeTaskIds?.length??0} · supporting {Number(preview.evidence?.supportingTaskCount??0)}</p><p>completeForScope: {String(preview.evidence?.completeForScope??false)} · protected preserved: {String(preview.evidence?.protectedPlacementsPreserved??false)} · hardValid: {String(preview.evidence?.hardValid??false)} · requiredValid: {String(preview.evidence?.requiredValid??false)}</p><p>{(preview.reasonCodes??[]).join(", ")||"Sin reason codes"}</p><details><summary>Detalles técnicos</summary><pre className="overflow-auto text-xs">{JSON.stringify(preview.evidence,null,2)}</pre></details></Card>:null}{message?<p className="text-sm text-destructive">{message}</p>:null}
    <details><summary>History</summary><div className="flex flex-wrap gap-2 pt-2">{(state.history??[]).map((stage:any)=><span key={stage.id} className="rounded border p-2 text-xs">S{stage.ordinal} · {stage.acceptedAt?new Date(stage.acceptedAt).toLocaleString():""} · scope {stage.scopeTaskIdsJson?.length??0}{stage.proposalRunId?` · run ${stage.proposalRunId}`:""}{stage.archivedAt?" · archived":""}<Button className="ml-2" size="sm" variant="ghost" disabled={!!busy||stage.archivedAt||stage.id===active?.id} onClick={()=>mutate("rollback",()=>apiRequest("POST",`/api/plans/${planId}/assisted/rollback`,{targetStageId:Number(stage.id)}),true)}>Rollback</Button></span>)}<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>mutate("redo",()=>apiRequest("POST",`/api/plans/${planId}/assisted/redo`,{}),true)}>Redo</Button></div></details></Card>
    <FullscreenPlanningPanel title="Planning asistido" viewKey={`assisted-${planId}`} supportsZoom toolbarRight={toolbar}><PlanningTimeline {...timelineProps as any} plan={assistedPlan} mode="assisted-draft" taskVisualStates={visual} onApplyManualEdits={applyTimelineEdits}/></FullscreenPlanningPanel>
  </div>;
}
