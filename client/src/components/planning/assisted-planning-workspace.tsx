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
import { buildAssistedPlanningView, classifyAssistedTasks, isAssistedDraftModified } from "@/lib/assisted-planning-view";

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
  const guard=()=>({expectedDraftFingerprint:state.draftFingerprint,expectedBaseStageId:Number(state.draftBaseStageId)});
  const refresh=async(planToo=false)=>{await client.invalidateQueries({queryKey:key(planId)});await stateQ.refetch();if(planToo){await client.invalidateQueries({queryKey:planQueryKey(planId)});await client.refetchQueries({queryKey:planQueryKey(planId)});}};
  const clearProposal=()=>{setPreview(null);setRunId(null);};
  const mutate=async(label:string,work:()=>Promise<any>,planToo=false)=>{setBusy(label);setMessage(null);try{await work();clearProposal();await refresh(planToo);}catch(e:any){setMessage(errorCode(e));if(isAssistedConflict(e)){clearProposal();await refresh();}}finally{setBusy(null);}};
  const validationCurrent=Boolean(state?.validation&&state.validation.draftFingerprint===state.draftFingerprint&&Number(state.validation.baseStageId)===Number(state.draftBaseStageId)&&Number(state.validation.configRevisionId)===Number(state.currentConfigRevisionId));
  const modified=Boolean(draft&&isAssistedDraftModified(draft,base));
  const touchedTaskCount=Object.values(visual).filter(value=>value==="DRAFT_CHANGED").length;
  const applyTimelineEdits=async(edits:Array<{taskId:number;start:string;end:string}>)=>mutate("edit",()=>apiRequest("PATCH",`/api/plans/${planId}/assisted/draft`,{
    ...guard(),changes:edits.map(edit=>({taskId:edit.taskId,startPlanned:edit.start,endPlanned:edit.end})),
  }));
  const generate=async()=>{setBusy("proposal");setMessage(null);setPreview(null);try{const selector=scopeKind==="TASK_IDS"?{kind:"TASK_IDS",taskIds:selected}:{kind:"SPACE",spaceId:Number(spaceId)};const result=await apiRequest<any>("POST",`/api/plans/${planId}/assisted/proposals`,{selector,includePrerequisites,...guard()});setRunId(Number(result.runId));}catch(e:any){setMessage(errorCode(e));setBusy(null);if(isAssistedConflict(e)){clearProposal();await refresh();}}};
  if(stateQ.isLoading||busy==="bootstrap")return <Card className="p-4">Inicializando planificación asistida…</Card>;
  if(!state)return <Card className="p-4 text-destructive">No se pudo iniciar la sesión assisted. {message} <Button size="sm" variant="outline" disabled={!!busy} onClick={bootstrap}>Reintentar</Button></Card>;
  const toolbar=<div className="flex flex-wrap items-center gap-1 text-xs"><Badge>S{active?.ordinal??0}</Badge><Badge variant={modified?"destructive":"secondary"}>{modified?"MODIFIED":"CLEAN"}</Badge>{modified?<Badge variant="outline">{touchedTaskCount} tocadas</Badge>:null}<Badge variant={validationCurrent?"default":"outline"}>{validationCurrent?"VALID":state.session?.draftValidationId?"STALE":"NOT VALIDATED"}</Badge><Badge variant="outline">config {state.currentConfigRevisionId}</Badge>{runId?<Badge variant="outline">run {runId}</Badge>:null}<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>mutate("validate",()=>apiRequest("POST",`/api/plans/${planId}/assisted/validate`,guard()))}>Validar Draft</Button><Button size="sm" disabled={!!busy||!validationCurrent} onClick={()=>mutate("accept",()=>apiRequest("POST",`/api/plans/${planId}/assisted/accept-stage`,guard()),true)}>Aceptar Stage</Button></div>;
  return <div className="space-y-3" data-testid="assisted-workspace">
    <Card className="p-3 space-y-3"><div className="flex flex-wrap gap-2 items-center"><strong>Scope pendiente</strong><Button size="sm" variant={scopeKind==="TASK_IDS"?"default":"outline"} onClick={()=>setScopeKind("TASK_IDS")}>Tareas</Button><Button size="sm" variant={scopeKind==="SPACE"?"default":"outline"} onClick={()=>setScopeKind("SPACE")}>Espacio</Button>
    {scopeKind==="SPACE"?<Select value={spaceId} onValueChange={setSpaceId}><SelectTrigger className="w-56"><SelectValue placeholder="Espacio del plan"/></SelectTrigger><SelectContent>{spaces.map(s=><SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>:null}</div>
    {scopeKind==="TASK_IDS"?<div className="max-h-40 overflow-auto grid gap-1 md:grid-cols-2">{(assistedPlan.dailyTasks??[]).filter((task:any)=>task.status==="pending"||task.status==="interrupted").map((task:any)=><label key={task.id} className="flex gap-2 items-start rounded border p-2 text-sm"><Checkbox checked={selected.includes(Number(task.id))} onCheckedChange={v=>setSelected(old=>v?[...old,Number(task.id)].sort((a,b)=>a-b):old.filter(x=>x!==Number(task.id)))}/><span><b>{task.template?.name??task.name??`Tarea ${task.id}`}</b><small className="block text-muted-foreground">{task.contestant?.name??"Sin concursante"} · {spaces.find(s=>Number(s.id)===Number(task.spaceId))?.name??"Sin espacio"} · {task.startPlanned?"planned":"unplanned"}</small></span></label>)}</div>:null}
    <label className="flex gap-2 items-start text-sm"><Checkbox checked={includePrerequisites} onCheckedChange={v=>setIncludePrerequisites(Boolean(v))}/><span><b>Include prerequisites</b><small className="block text-muted-foreground">OFF excluye supporting internos del scope editable. ON incorpora prerequisites necesarios al scope visible; el servidor resuelve el closure.</small></span></label>
    <div className="flex gap-2"><Button disabled={!!busy||(scopeKind==="TASK_IDS"?selected.length===0:!spaceId)} onClick={generate}>{busy==="proposal"?"Generando…":"Generar propuesta"}</Button>{preview?.outcome==="PROPOSAL"?<><Button onClick={()=>mutate("apply",()=>apiRequest("POST",`/api/plans/${planId}/assisted/proposals/${runId}/apply`,guard()))}>Aplicar al borrador</Button><Button variant="outline" onClick={()=>{setPreview(null);setRunId(null)}}>Descartar propuesta</Button></>:null}</div>
    {preview?<Card className="p-3 text-sm"><b>{preview.outcome==="PROPOSAL"?"Vista previa de propuesta":preview.outcome==="NO_PROPOSAL"?"Sin propuesta":"Input no soportado"}</b><p>{preview.proposal?.length??0} tareas propuestas · scope {preview.scopeTaskIds?.length??0} · supporting {Number(preview.evidence?.supportingTaskCount??0)}</p><p>completeForScope: {String(preview.evidence?.completeForScope??false)} · protected preserved: {String(preview.evidence?.protectedPlacementsPreserved??false)} · hardValid: {String(preview.evidence?.hardValid??false)} · requiredValid: {String(preview.evidence?.requiredValid??false)}</p><p>{(preview.reasonCodes??[]).join(", ")||"Sin reason codes"}</p><details><summary>Detalles técnicos</summary><pre className="overflow-auto text-xs">{JSON.stringify(preview.evidence,null,2)}</pre></details></Card>:null}{message?<p className="text-sm text-destructive">{message}</p>:null}
    <details><summary>History</summary><div className="flex flex-wrap gap-2 pt-2">{(state.history??[]).map((stage:any)=><span key={stage.id} className="rounded border p-2 text-xs">S{stage.ordinal} · {stage.acceptedAt?new Date(stage.acceptedAt).toLocaleString():""} · scope {stage.scopeTaskIdsJson?.length??0}{stage.proposalRunId?` · run ${stage.proposalRunId}`:""}{stage.archivedAt?" · archived":""}<Button className="ml-2" size="sm" variant="ghost" disabled={!!busy||stage.archivedAt||stage.id===active?.id} onClick={()=>mutate("rollback",()=>apiRequest("POST",`/api/plans/${planId}/assisted/rollback`,{targetStageId:Number(stage.id)}),true)}>Rollback</Button></span>)}<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>mutate("redo",()=>apiRequest("POST",`/api/plans/${planId}/assisted/redo`,{}),true)}>Redo</Button></div></details></Card>
    <FullscreenPlanningPanel title="Planning asistido" viewKey={`assisted-${planId}`} supportsZoom toolbarRight={toolbar}><PlanningTimeline {...timelineProps as any} plan={assistedPlan} mode="assisted-draft" taskVisualStates={visual} onApplyManualEdits={applyTimelineEdits}/></FullscreenPlanningPanel>
  </div>;
}
