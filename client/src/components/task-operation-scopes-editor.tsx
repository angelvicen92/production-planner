import React from 'react';
import {Button} from './ui/button';
import type {EffectiveConfigurationView} from '@shared/effectiveConfigurationContracts';
import type {DailyTaskOperationScopes} from '@shared/dailyTaskOperationScopes';

export function TaskOperationScopesEditor({value,canEdit,pending,onSave}:{value:NonNullable<EffectiveConfigurationView['taskOperationScopes']>;canEdit:boolean;pending:boolean;onSave:(v:DailyTaskOperationScopes)=>void}){
 const [taskId,setTaskId]=React.useState(0);
 const task=value.tasks.find(t=>t.id===taskId),stored=value.authority?.policies.find(p=>p.taskId===taskId);
 const [agenda,setAgenda]=React.useState<'PHYSICAL_SPACE'|'ITINERANT_UNIT'>('PHYSICAL_SPACE');
 const [inheritance,setInheritance]=React.useState<'LOCATION'|'OPERATION_ONLY'>('LOCATION');
 const [blocks,setBlocks]=React.useState(true),[unit,setUnit]=React.useState(0);
 const selectTask=(id:number)=>{const t=value.tasks.find(t=>t.id===id);setTaskId(id);setAgenda(t?.agendaScope??'PHYSICAL_SPACE');setInheritance(t?.resourceInheritance??'LOCATION');setBlocks(t?.blocksSpace??true);setUnit(value.authority?.policies.find(p=>p.taskId===id)?.itinerantUnitId??0);};
 const disabled=!canEdit||pending||!value.supported||!!value.blockedReason||!task?.eligible;
 const save=(remove=false)=>{
  if(!task)return;
  const policies=(value.authority?.policies??[]).filter(p=>p.taskId!==task.id);
  if(!remove)policies.push({taskId:task.id,agendaScope:agenda,resourceInheritance:inheritance,blocksSpace:blocks,itinerantUnitId:unit||null,declaredResourceIds:[...task.directResourceIds]});
  onSave({contractVersion:1,policies:policies.sort((a,b)=>a.taskId-b.taskId)});
 };
 return <div className="space-y-3" data-testid="daily-task-operation-scopes">
  <p role="status">Ámbito operativo por actividad · Revisión {value.revisionId??'inicial'} · {value.authority?'Declaración diaria de Producción':'Valores del día y de la plantilla'}</p>
  <p>La agenda, la ocupación del espacio y la herencia de recursos se eligen por separado. La ubicación real y sus disponibilidades se conservan. Los recursos directos, locks y miembros del equipo siguen siendo obligatorios.</p>
  {!value.supported?<p>Combinación no soportada: esta declaración requiere actividades independientes, sin operaciones conjuntas, rondas, cadenas, montajes ni transporte estructural.</p>:null}
  {value.blockedReason?<p role="alert">{value.blockedReason}</p>:null}
  <label className="block">Actividad real del día<select aria-label="Actividad de ámbito operativo" value={taskId} onChange={e=>selectTask(Number(e.target.value))}><option value={0}>Seleccionar actividad</option>{value.tasks.map(t=><option key={t.id} value={t.id}>{t.label} · {t.space}{t.eligible?'':' · Protegida'}</option>)}</select></label>
  {task?<>
   <p>Ubicación física: {task.space}. Origen efectivo: {stored?'declaración diaria':'plantilla y configuración del día'}.</p>
   {!task.eligible?<p>Edición bloqueada por horario aceptado, Stage histórico, ejecución o lock.</p>:null}
   <label className="block">Propietario de agenda<select aria-label="Propietario de agenda" value={agenda} disabled={disabled} onChange={e=>setAgenda(e.target.value as typeof agenda)}><option value="PHYSICAL_SPACE">Espacio físico</option><option value="ITINERANT_UNIT">Unidad itinerante</option></select></label>
   <label className="block">Herencia de recursos<select aria-label="Herencia de recursos" value={inheritance} disabled={disabled} onChange={e=>setInheritance(e.target.value as typeof inheritance)}><option value="LOCATION">Heredar recursos de ubicación</option><option value="OPERATION_ONLY">Solo recursos declarados de la operación y equipo</option></select></label>
   <label className="block"><input type="checkbox" aria-label="Ocupa físicamente el espacio" checked={blocks} disabled={disabled} onChange={e=>setBlocks(e.target.checked)}/> Ocupa físicamente el espacio</label>
   <label className="block">Unidad nominal diaria<select aria-label="Unidad nominal de la actividad" value={unit} disabled={disabled} onChange={e=>setUnit(Number(e.target.value))}><option value={0}>Conservar requisito de plantilla; selección pendiente si es elegible</option>{value.units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
   <p>Recursos directos conservados: {task.directResourceIds.map(id=>value.resources.find(r=>r.id===id)?.name??'Recurso no disponible').join(', ')||'Ninguno'}. Los miembros seleccionados del equipo se añaden al planificar.</p>
   <p>Valor efectivo guardado: agenda {task.agendaScope==='ITINERANT_UNIT'?'itinerante':'física'} · {task.resourceInheritance==='OPERATION_ONLY'?'recursos propios':'herencia de ubicación'} · {task.blocksSpace?'ocupa el espacio':'sin reserva física'} · {task.itinerantUnitId==null?'equipo pendiente o no requerido':value.units.find(u=>u.id===task.itinerantUnitId)?.name??'Unidad no disponible'}.</p>
   <Button disabled={disabled} onClick={()=>save()}>Guardar ámbito operativo</Button>
   {stored?<Button variant="outline" disabled={disabled} onClick={()=>save(true)}>Retirar declaración de la actividad</Button>:null}
  </>:null}
  {value.at?<p>Última declaración diaria: {value.at}</p>:null}
 </div>;
}
