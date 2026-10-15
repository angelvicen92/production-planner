/** Static discovery plus conservative, reviewed contracts. Does not execute UI/API code. */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const output='docs/audit/configuration-p1/generated';
const files=[];
function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory()){if(e.name!=='ui')walk(f);}else if(/\.tsx$/.test(f)&&!/(test|spec)\./.test(f))files.push(f);}}
walk('client/src');
const P=(id,api,persistence,projection,consumer,tests,details)=>({id,api,persistence,projection,consumer,tests,details});
const profiles=[
 P('VIEW','Estado React / preferencias de vista','React/localStorage según componente','No proyección a EngineInput','Filtrado, orden y representación de UI',[], 'INFORMATIVO describe presentación; no significa que el control de vista no funcione.'),
 P('GENERAL','api.programSettings GET/PATCH; apiRequest','program_settings','server/storage.ts createPlan → plans + baseline; engine/buildInput.ts','Adapter Next → placement/validate; clock vía ejecución', ['server/programSettingsUpdate.spec.ts','server/dayConfiguration.spec.ts','client/src/components/general-program-settings.test.ts'],'Distinguir horario/comida/transición con baseline de parámetros auxiliares y reloj global.'),
 P('OPTIMIZER','api.optimizerSettings GET/PATCH','optimizer_settings → plan_optimizer_snapshots + heuristics + grouping_zones','engine/planOptimizerSnapshotLegacyAdapter.ts → buildEngineInput; applyPlanPlannerNextConfiguration neutraliza grouping','V3 phaseAHeuristic; Next no proyecta pesos legacy; ver 02-heuristics.md',['server/planOptimizerSnapshot.spec.ts','engine/planOptimizerSnapshotLegacyAdapter.spec.ts'],'No certificar efecto Next por persistir un peso.'),
 P('DAY','GET effective-configuration; PUT day-configuration; POST restore/refresh','plans baseline/effective/source + plan_config_revisions; optimizer snapshot','dayConfigurationService → buildEngineInput → applyEffectiveMainFlowPreference','Next adapter, placement, validate y mainFlowPatterns',['server/dayConfiguration.spec.ts','server/effectiveConfigurationView.spec.ts','client/src/components/effective-configuration.test.tsx'],'Edición versionada; RESTORE baseline local; REFRESH conserva override. Optimización conserva limitaciones de proyección.'),
 P('BLOCKS','General program-settings; día day-configuration','program_settings + plans main_*; revisión atómica','server/mainFlowPreference.ts → plannerNext.mainFlow.preference','mainFlowPatterns/mainFlowMealPreference; validatePlan',['engine/planner-next/mainFlowSoftPreference.spec.ts','engine/planner-next/mainFlowMealPreference.spec.ts'],'AUTO minimiza; SOFT N preferente; reparto suma N; no equivale a REQUIRED/FIXED_COUNT.'),
 P('TEMPLATE','useTaskTemplates/useCreateTaskTemplate/useUpdateTaskTemplate → api.taskTemplates','task_templates; plan_task_template_snapshots contract v2','taskTemplateSnapshot → engine/buildInput.ts tasks; después taskOperations sobrescribe atributos declarados','Next adapter/placement/validate según campo',['server/taskTemplateSnapshot.spec.ts','server/taskTemplateSnapshotIntegration.spec.ts','engine/buildInput.taskTemplateSnapshot.spec.ts'],'Cambiar global no cambia snapshot existente. No existe refresh genérico lossless demostrado.'),
 P('SPACE','useZones/useSpaces/update; resource-defaults y type-requirements','zones/spaces + defaults; plan_zone_settings/plan_space_settings + asignaciones','buildEngineInput → spatial availability + effectiveTaskResourceAssignments','Next spatial/placement/validate; grouping legacy rechazado sin mapping',['engine/buildInput.spatialAvailability.spec.ts','engine/planner-next/integration/effectiveTaskResourceAssignments.spec.ts'],'Disponibilidad tiene API, no se localizó editor de ventanas en pantallas actuales. No hay capacidad espacial persistida.'),
 P('RESOURCE','resource-types/items API; resources-list; vocal-coach-rules','resource_types/resource_items/vocal_coach_rules; snapshot plan_resource_items/plan_vocal_coach_rules','buildEngineInput + effectiveTaskResourceAssignments; autocreación en storage','Next recursos físicos/coach o creación de tareas',['engine/buildInput.resourceAvailability.spec.ts','engine/planner-next/integration/effectiveTaskResourceAssignments.spec.ts'],'Identidad global resource_items.id distinta de plan_resource_items.id. Nombre no autoriza sustitución.'),
 P('COMPOSITION','resource item components GET/PUT','resource_item_components; no equivale a itinerantTeamAvailability','buildEngineInput.resourceItemComponents; Next preflight comprueba representación','Capacidad V3 de composición; no equivale a editor de unidad Next',['engine/v3/resourceBundleValidation.spec.ts'],'No se encontró enlace global equipo → miembros. No promover componente/bundle a unidad operativa.'),
 P('DAY_RESOURCE','PlanResourcesTab apiRequest de plan-resource-items y asignaciones','plan_resource_items + plan_zone/space_resource_assignments/type_requirements','buildEngineInput → effectiveTaskResourceAssignments + effectivePlanResourceAvailability','Next recursos exactos/alternativas si representables; placement/validate',['engine/buildInput.resourceAvailability.spec.ts','engine/planner-next/integration/effectivePlanResourceAvailability.spec.ts'],'Availability boolean sí; ventanas temporales sin editor localizado. Verificar namespace diario.'),
 P('STAFF','use-staff/use-plan-staff; staffDefaults/planStaff API','staff_people/staff_assignment_defaults/plan_staff_assignments; zone_staff_mode/plan_zone_staff_mode','Snapshot de asignaciones al crear plan; ejecución/visibilidad, no miembros de cámaras/sonidos','shared/execution.ts; server/liveExecution.ts; enlaces de usuario/ámbito', ['server/apiAuthorization.spec.ts'],'Personal de producción/editorial no equivale a recurso hard del solver.'),
 P('TEAM','useItinerantTeams; POST/DELETE api.itinerantTeams','itinerant_teams(id,code,name,is_active,order_index)','No mapping demostrado a unidades diarias de plans.planner_next_configuration','Catálogo/assignments/plantilla global; día Next usa otra autoridad',[],'UI sólo crea código/nombre y elimina. No miembros, ventanas, equivalencias ni reconciliación con IDs Next.'),
 P('TRANSPORT','TransportSettingsCard → api.optimizerSettings','optimizer_settings → plan_optimizer_snapshot transport y referencias de snapshot','buildEngineInput.transportSettings + task roles; config Next fija máximos diarios','transportGrouping/transportPolicy/validate; groupingWeight sólo validado/proyectado',['engine/planner-next/transportGrouping.spec.ts','engine/planner-next/integration/engineInputAdapter.spec.ts'],'targetGroupSize se conserva distinto de mínimo=1 en adapter vigente. vanCapacity se usa como máximo compatible, no vehículo independiente.'),
 P('TASK','use-tasks; api.dailyTasks; Assisted manual delta según ruta','daily_tasks; Assisted Draft/Stage cuando aplica','override instancia duración/ubicación/márgenes; roles/deps/itinerancia finales taskOperations','Next adapter/placement/validate; edición de Draft requiere aceptación',['server/assistedManualSnapshotFidelity.spec.ts','engine/planner-next/participantTransition.spec.ts'],'Campos visuales no son restricciones. Estado done/in_progress/locks protegidos; no editar autoridades Next mediante catálogo inferior.'),
 P('PARTICIPANT','plan-details; use-plans/use-tasks; contestant API','contestants + daily_tasks autocreadas desde snapshot','contestantAvailabilityById/vocalCoachPlanResourceItemIdByContestantId','Next participant/coach availability; ejecución; instrumento informativo',['engine/buildInput.sourceCriticality.spec.ts','engine/planner-next/participantTransition.spec.ts'],'requiresBand operativo ≠ instrumento informativo. No control requiresBand localizado en alta actual.'),
 P('CONTROL','use-control-room-settings; GET/PATCH control-room-settings','control_room_settings; sin snapshot del día','control-room.tsx settingsQ → ProductionControlPanel','projectControlRoom recibe delayThresholdMinutes/enableDelayAlert/nextSoonMinutes',['client/src/lib/control-room-metrics.test.ts'],'idleUnexpectedThresholdMin, enableIdleAlert y enableNextSoonAlert no se pasan al consumidor actual. nextSoon controla aviso de ubicación por confirmar.'),
 P('USERS','UsersAdminSettings API users/admin','role y enlaces staff/resource según API de administración','Modelo de autorización/ExecutionContext; no EngineInput','server apiAuthorization/execution context',['server/apiAuthorization.spec.ts'],'Roles autorizados y enlaces a entidades; cerrar pruebas por cambio de perfil. No recopilar datos personales en esta auditoría.'),
 P('SCOPE','AssistedPlanningWorkspace/AssistedLocationScope → assisted API','petición scope/proposal; revisión/payload en servicios Assisted','assistedScopeResolver → adaptEngineInputToPlannerNextProblem → executePlannerNext','Assisted closure/scope/proposal/Stage',['server/assistedScopeResolver.spec.ts','server/assistedNextScope.spec.ts'],'Selección de obligaciones/scopes, no regla persistente global. includePrerequisites afecta cierre solicitado.'),
 P('LEGACY_RUN','plan-details → api.plans.generate','planning_runs + resultado legacy; timeLimitMs petición','Generación V3/V4, no RUN_OVERRIDE de ScopeProposal','server generación legacy/V3/V4',[],'El selector de segundos no cumple por sí mismo el contrato Assisted de Fuente 04 §20.12.'),
 P('INCIDENT','use-war-room/api incidents','operational_incidents/events','Operación War Room y proyección Control Room','servicio de incidentes/telemetría', ['server/incidents.spec.ts'],'Descripción/causa/contexto/estado/severidad/responsable son operativos; no inventan restricciones del planner.'),
 P('AUTH','useAuth/Supabase Auth','Sesión de autenticación; fuera del inventario de reglas','No EngineInput','Autenticación',[],'FUERA_CONFIGURACION: campos de login incluidos para cerrar descubrimiento, sin capturar valores.'),
];
const byId=Object.fromEntries(profiles.map(p=>[p.id,p]));
function profile(r){
 if(['Tabs','CommandItem'].includes(r.widget))return 'VIEW';
 const f=r.file,b=(r.binding+' '+r.handlers).toLowerCase();
 if(f.endsWith('/settings.tsx')){
  if(r.owner==='TaskTemplatesSettings')return /sortby/.test(b)?'VIEW':'TEMPLATE';
  if(r.owner==='ItinerantTeamsSettings')return 'TEAM';
  if(['StaffPeopleSettings','StaffDefaultsSettings','AssignmentPicker'].includes(r.owner))return 'STAFF';
  return 'SPACE';
 }
 const map=[['general-program-settings','GENERAL'],['general-optimizer-settings','OPTIMIZER'],['main-flow-preference-editor','BLOCKS'],['day-capability-editor','DAY'],['effective-configuration','DAY'],['day-resources-workspace','DAY_RESOURCE'],['day-staff-workspace','STAFF'],['transport-settings-card','TRANSPORT'],['resource-item-components-dialog','COMPOSITION'],['resources-list','RESOURCE'],['create-resource-pool','RESOURCE'],['contestant-daily-task-editor','TASK'],['add-task-dialog','TASK'],['control-room-settings','CONTROL'],['users-admin','USERS'],['assisted-location-scope','SCOPE'],['assisted-planning-workspace','SCOPE'],['login.tsx','AUTH']];
 for(const [needle,p]of map)if(f.includes(needle))return /\b(search|rolefilter|sortby)\b/.test(b)?'VIEW':p;
 if(f.endsWith('/plan-details.tsx')){
  if(/planningtimelimitsec/.test(b))return 'LEGACY_RUN';
  if(/manualblock|timelock|task\.status/.test(b)||r.line>=2600&&r.line<3000)return 'TASK';
  if(r.line>=3800&&r.line<4100)return 'DAY';
  return 'PARTICIPANT';
 }
 if(f.includes('create-plan-dialog'))return 'DAY';
 if(f.endsWith('/war-room.tsx'))return r.owner==='Choice'||/draft|decision/.test(b)?'INCIDENT':'VIEW';
 if(f.includes('planning-timeline'))return 'TASK';
 if(f.endsWith('/call-sheet.tsx')&&/notes/.test(b))return 'TASK';
 return 'VIEW';
}
function classify(r,p){
 const b=r.binding+' '+r.handlers;
 if(['VIEW','AUTH'].includes(p))return ['INFORMATIVO',byId[p].details];
 if(/comment|uiColor|abbrev|ColorPicker|instrument|song|notes|OrderDraft|GroupOrder|newName|editName/.test(b)&&!['INCIDENT','TEAM','USERS'].includes(p))return ['INFORMATIVO','Metadata/visualización; conservar con explicación de efecto y verificar guardado en su API.'];
 if(p==='OPTIMIZER'||p==='DAY'&&/heuristics/.test(b)){
  if(/nearHard|TOTAL_SPAN|TotalSpan/.test(b))return ['SIN EFECTO DEMOSTRADO','Retirar de edición operativa hasta consumidor efectivo; véase 02-heuristics.md y characterization.json.'];
  return ['LEGACY','No presentar como peso de Assisted; ver comparación 0/1/5/10 y excepción de grouping neutralizado.'];
 }
 if(p==='CONTROL'&&/idleUnexpectedThresholdMin|enableIdleAlert|enableNextSoonAlert/.test(b))return ['SIN EFECTO DEMOSTRADO','Persistencia localizada; el consumidor actual no recibe el parámetro. Retirar/inhabilitar hasta wiring probado.'];
 if(p==='TEMPLATE'&&/formData/.test(b))return ['INCOMPATIBLE','El payload completo de alta incluye márgenes que el schema estricto rechaza incluso null; ver characterization.json.'];
 if(p==='TEMPLATE'&&/editData.*participantMargin/.test(b))return ['PARCIAL','Fallo demostrado: saveEdit omite márgenes; schema global y storage tampoco los aceptan/mapean.'];
 if(p==='GENERAL'&&/defaultWork(Start|End)|defaultParticipantTransition/.test(b))return ['PRODUCTIVO','Conservar recorrido versionado del día; evidencia local por snapshots/dayConfiguration y validación. No equivale a prueba browser live.'];
 if(p==='BLOCKS')return ['PRODUCTIVO','Conservar AUTO/SOFT y reparto preferente; validar geometría, revisión y protección.'];
 return ['PARCIAL',byId[p].details+' Falta certificar journey browser guardar→recargar y/o niveles indicados en el informe.'];
}
const controls=[],actions=[],hashes={};
const widgets=new Set(['Input','input','Select','select','Checkbox','Switch','Slider','Textarea','textarea','RadioGroup','ColorSwatchPicker','MainFlowPreferenceEditor','DayCapabilityEditor','AssistedLocationScope','Choice','Tabs','CommandItem']);
for(const file of files.sort()){
 const src=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const visit=n=>{
  if(ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n)){
   const widget=n.tagName.getText(sf);
   if((widgets.has(widget)||['Button','button'].includes(widget))&&!(file==='client/src/App.tsx'&&widget==='Switch')){
    const props=Object.fromEntries(n.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(sf),a.initializer?.getText(sf)??'true']));
    const spreads=n.attributes.properties.filter(ts.isJsxSpreadAttribute).map(a=>a.expression.getText(sf));
    let p=n,owner='module',formName=null,label=null;
    while(p.parent){p=p.parent;
     if((ts.isJsxElement(p)||ts.isJsxSelfClosingElement(p))){const opening=ts.isJsxElement(p)?p.openingElement:p;if(opening.tagName.getText(sf)==='FormField')formName=opening.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(sf)==='name')?.initializer?.getText(sf)??null;}
     if((ts.isFunctionDeclaration(p)||ts.isVariableDeclaration(p))&&p.name){owner=p.name.getText(sf);break;}
    }
    p=n;for(let i=0;i<6&&p.parent;i++,p=p.parent){if(ts.isJsxElement(p.parent)){const labels=p.parent.children.filter(c=>ts.isJsxElement(c)&&['Label','label','FormLabel'].includes(c.openingElement.tagName.getText(sf)));if(labels.length){label=labels[0].getText(sf).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,180);break;}}}
    const line=sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
    const handlers=Object.entries(props).filter(([k])=>/^on/.test(k)).map(([k,v])=>`${k}: ${v}`).join('\n');
    const r={id:`${file}:${line}:${widget}:${controls.length+actions.length+1}`,file,line,owner,widget,label:props.label??label,formName,spreads,props:Object.fromEntries(Object.entries(props).filter(([k])=>!/^on/.test(k))),binding:formName??props.value??props.checked??props.defaultValue??props['aria-label']??'No binding explícito; inspeccionar spreads/handler',handlers};
    r.profile=profile(r);const [classification,decision]=classify(r,r.profile);Object.assign(r,{classification,decision});
    (['Button','button'].includes(widget)?actions:controls).push(r);hashes[file]=createHash('sha256').update(src).digest('hex');
   }
  }ts.forEachChild(n,visit);
 };visit(sf);
}
const chain=(r)=>{
 const p=byId[r.profile];return {
  nameAndMeaning:r.label??r.binding,ui:`${r.file}:${r.line} (${r.owner}/${r.widget})`,hookOrApi:p.api,
  inputValidation:{props:Object.fromEntries(Object.entries(r.props).filter(([k])=>['type','min','max','step','required','disabled','pattern','maxLength'].includes(k))),handler:'Véase handlers del mismo control (captura íntegra, sin duplicación)',server:'shared/routes.ts y contrato específico de perfil; huecos en 01-field-audit.md'},
  persistence:p.persistence,general:p.id==='VIEW'||p.id==='AUTH'?'No aplica':p.api,
  snapshot:p.details,override:p.id==='DAY'?'EDIT/RESTORE/REFRESH versionados':p.details,
  precedence:'Estado protegido > instancia > día > snapshot > general sólo cuando el contrato lo declara; taskOperations prevalece en sus atributos.',
  engineInput:p.projection,adapterOrPreflight:'engine/planner-next/integration/engineInputPreflight.ts + engineInputAdapter.ts si aplica; operaciones usan su servicio',
  consumer:p.consumer,effect:r.decision,evidence:['01-field-audit.md',...(r.profile==='OPTIMIZER'||/TOTAL_SPAN/.test(r.binding)?['02-heuristics.md','generated/characterization.json']:[])],
  tests:{existing:p.tests,missing:'Journey browser diferenciado por campo; no se da por pasado por tener persistencia.'},
  roundTrip:'No escrituras live en P1. Casos guardar/recargar/general/restore por contrato y pruebas locales; límites en informe.',
 };
};
const dynamicVariants=[];
for(const r of controls){
 if(r.file.endsWith('/day-capability-editor.tsx')&&r.binding.includes('draft.heuristics[key]')){
  for(const key of ['MAIN_ZONE_FINISH_EARLY','CONTESTANT_COMPACT','CONTESTANT_TOTAL_SPAN'])dynamicVariants.push({siteId:r.id,logicalField:`OPTIMIZATION.heuristics.${key}`,classification:key==='CONTESTANT_TOTAL_SPAN'?'SIN EFECTO DEMOSTRADO':'LEGACY',decision:key==='CONTESTANT_TOTAL_SPAN'?'El adapter productivo fuerza totalSpan a cero.':'No proyectado como peso al problema Next.',trace:{...chain(r),nameAndMeaning:key}});
 }
 if(r.file.endsWith('/day-capability-editor.tsx')&&r.binding.includes('draft.window?.[field]')){
  for(const capability of ['WORKDAY_WINDOW','GLOBAL_MEAL_BREAK'])for(const field of ['start','end'])dynamicVariants.push({siteId:r.id,logicalField:`${capability}.${field}`,classification:'PARCIAL',decision:'Contrato de día versionado; ver matriz y pruebas por modo.',trace:{...chain(r),nameAndMeaning:`${capability}.${field}`}});
 }
 if(r.file.endsWith('/war-room.tsx')&&r.widget==='Choice'&&r.handlers.includes('key')){
  for(const key of ['taskId','zoneId','spaceId','contestantId','resourceId','responsibleId'])dynamicVariants.push({siteId:r.id,logicalField:`INCIDENT.${key}`,classification:'PARCIAL',decision:'Relación de incidente; no crea una regla del planner.',trace:{...chain(r),nameAndMeaning:key}});
 }
}
const document={contract:'CONFIGURATION-P1-UI-SURFACE-V1',base:'621303a3b3e1e3a2d745e35de9db0a0cbd28c7c9',method:'AST TSX; cardinalidad de sitios fuente, no de instancias renderizadas; arrays dinámicos descritos en field audit. Botones en actions.json. wouter.Switch excluido.',sourceHashes:hashes,counts:{controls:controls.length,actions:actions.length,files:Object.keys(hashes).length,classification:Object.fromEntries([...new Set(controls.map(r=>r.classification))].map(k=>[k,controls.filter(r=>r.classification===k).length]))},profiles,dynamicVariants,controls:controls.map(r=>({...r,trace:chain(r)}))};
const esc=s=>String(s??'').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ').replace(/`/g,"'");
const lines=['# Trazabilidad de todos los sitios UI descubiertos','',document.method,'','La clasificación es conservadora y está contextualizada por el perfil. INFORMATIVO incluye filtros y autenticación fuera de reglas. Los wrappers y sus campos internos se listan para no perder superficie; no sumar como capacidades distintas.','',`Controles: ${controls.length}; acciones: ${actions.length}; archivos: ${Object.keys(hashes).length}.`,'','| Control / componente | Binding / significado | Perfil | Clase | Decisión y evidencia |','|---|---|---|---|---|',...controls.map(r=>`| ${esc(r.file)}:${r.line} · ${r.owner}/${r.widget} | ${esc(r.binding)} | ${r.profile} | ${r.classification} | ${esc(r.decision)} · 01-field-audit.md; ${r.profile==='OPTIMIZER'?'02-heuristics.md; ':''}ui-controls.json |`)];
lines.push('','## Variantes lógicas de controles dinámicos','','| Sitio | Campo | Clase | Decisión |','|---|---|---|---|',...dynamicVariants.map(v=>`| ${esc(v.siteId)} | ${v.logicalField} | ${v.classification} | ${esc(v.decision)} |`));
const recordJson=obj=>'{\n'+Object.entries(obj).map(([key,value])=>'  '+JSON.stringify(key)+': '+(Array.isArray(value)?'[\n'+value.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]':JSON.stringify(value))).join(',\n')+'\n}\n';
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/ui-controls.json`,recordJson(document));fs.writeFileSync(`${output}/actions.json`,recordJson({contract:document.contract,actions:actions.map(r=>({...r,trace:chain(r)}))}));fs.writeFileSync(`${output}/ui-traceability.md`,lines.join('\n')+'\n');
console.log(JSON.stringify(document.counts));
