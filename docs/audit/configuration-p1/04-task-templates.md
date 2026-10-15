# E. Plantillas: campos, herencia e instancias

## Autoridad de cada capa

- **Plantilla global:** `task_templates`, editada por TaskTemplatesSettings, hooks use-tasks, `api.taskTemplates` y storage. Define defaults para snapshots futuros; no modifica una jornada ya creada.
- **Snapshot del día:** `plan_task_template_snapshots`, normalizado por `server/taskTemplateSnapshot.ts` (contrato 2), con identidad física de snapshot, sourceTemplateId, source y fingerprint. Copia semántica operacional, no todos los estilos visuales.
- **Instancia diaria:** `daily_tasks`, con duración/cámaras/ubicación/márgenes y estado/horas/recursos. `buildInput.ts:775–925` resuelve duración positiva, referencias y defaults usando el snapshot. El control editable de una instancia no autoriza a reescribir el snapshot.
- **Autoridad Next:** `plans.planner_next_configuration.taskOperations`, cobertura exacta de tasks, aplicada después de lo anterior. Sobrescribe propiedades tipadas que declara. Una dependencia editada en la plantilla global no modifica esos task IDs finales de 27001/27002.
- **Draft y estado aceptado:** una propuesta se aplica a Draft; sólo aceptar Stage consolida `daily_tasks`. Done/in_progress, locks explícitos y decisiones protegidas conservan sus invariantes. Rollback de planning no revierte configuración efectiva. No añadir locks automáticamente al cambiar un default.

## Hallazgo P0: alta global incompatible con su API

`TaskTemplatesSettings` inicializa `formData.participantMarginBeforeMinutes` y `participantMarginAfterMinutes` a null y envía **todo formData** al crear (`settings.tsx:3123`). `shared/routes.ts:1490` define un objeto **strict** que no declara esos campos. La reproducción offline con el objeto literal real de UI y `api.taskTemplates.create.input.safeParse` falla con `unrecognized_keys`, también sin introducir márgenes. Esto afecta el alta desde ese formulario completo, no sólo la edición de márgenes.

La edición muestra ambos inputs (`settings.tsx:3272/3277`) pero `saveEdit` (`settings.tsx:2915`) omite sus keys. Si se añadieran sólo a ese PATCH, el esquema global de update también los rechazaría. `server/storage.ts` no contiene mapping camel/snake de márgenes para create/update de plantillas y su GET normalizado tampoco los devuelve. En cambio, `dailyTasks.update` sí declara estos campos y `routes.ts:3735` los mapea. Tener columnas de plantilla, snapshot y motor no completa el recorrido UI global.

`generated/characterization.json` registra keys de payload/PATCH, errores Zod y búsqueda de mapping en storage. No se envía una petición mutante real. No se corrige el problema en esta auditoría.

## Matriz de todos los campos de plantilla

El resto de las filas describe el camino previsto/implementado por campo **una vez admitido el payload**, sin ocultar el bloqueo transversal del alta actual. Una fila de modelo sin control aparece FALTANTE de superficie, no «sin efecto» universal.

| Campo / significado | UI, API y validación | Persistencia → snapshot → input | Consumidor/efecto y clasificación |
|---|---|---|---|
| `id` | Generado; referencias en pickers; no editable | `task_templates.id` → `source_template_id` + identidad propia snapshot → `templateId` | Identidad/replay; INFORMATIVO/invariante, nunca renumerar por limpieza |
| `name` | Alta/edición texto no vacío; trim cliente | name → template_name → templateName | Presentación; también resolución nominal de transporte/comida en compatibilidad, por lo que renombrar tiene riesgo. PARCIAL de gobierno, no mero estilo inocuo |
| `defaultDuration` | Input número; API entero positivo | default_duration → snapshot.defaultDuration → durationOverrideMin si instancia no aporta duración positiva | Construcción/ocupación/validación Next; efecto técnico probado. PARCIAL por alta rota/journey global no cerrado |
| `autoCreateOnContestantCreate` | Checkbox global; booleano | auto_create_on_contestant_create → snapshot → filtro de storage al crear participante | Autocreación de tareas antes del solver; no regla de orden. PARCIAL de producto por alta/journey |
| `participantMarginBeforeMinutes` | Inputs alta/edición ≥0/null; API global **no los admite** | Columna y snapshot sí; instancia override null hereda, 0 se conserva → task field | Frontera max de explícitos; PARCIAL global, INCOMPATIBLE alta actual. El motor no es la causa |
| `participantMarginAfterMinutes` | Mismo problema independiente | Campo after equivalente | Misma semántica; `Estilismo salida.after=0` A2 no debe perderse |
| `defaultCameras` | Estado/payload de edición, sin input de cámaras en formulario actual | default_cameras → snapshot → camerasOverride | V3 cantidad; preflight Next rechaza >0 sin identidad fija explícita. LEGACY/INCOMPATIBLE Next. FALTANTE editor de requisito exacto/genérico moderno |
| `requiresAuxiliar` | Cargado/reenviado en edición, sin control propio localizado | requires_auxiliar → snapshot; no proyección de flag directa a tarea Next localizada en buildInput | El requisito debe existir como recursos efectivos. PARCIAL/LEGACY; no asumir que booleano exige auxiliar en Next |
| `exclusiveAuxiliar` | Cargado/reenviado; sin checkbox propio localizado | exclusive_auxiliar → snapshot; no flag Next localizado | Semántica Fuente 01: exclusividad frente a simultaneidad; FALTANTE de superficie/recorrido actual. No crear requisito universal de auxiliar |
| `requiresCoach` | Checkbox, modo any/specific y selector de item; UI detecta tipo por código/nombre | Booleano + resource_requirements.byType/byItem → snapshot → requisitos normalizados/coach asignado | Efecto de requisitos concretos/coach en adapter, no del flag aislado. PARCIAL; eliminar inferencia nominal futura requiere unidad propia |
| `coachMode` | Estado UI, no columna | Se codifica como byType o byItem | No es otra autoridad paralela; PARCIAL de UX |
| `coachResourceItemId` | Item global validado contra lista coach | Se codifica en resource_requirements.byItem; convertir a ID diario al proyectar | Coach concreto no puede sustituirse silenciosamente. PARCIAL |
| `requiresPresenter` | Modelo/API/storage, sin control propio localizado | requires_presenter → snapshot; no flag proyectado a task Next localizado | FALTANTE UI/recorrido efectivo; presenter concreto debe entrar como recurso exacto/contrato permitido |
| `resourceRequirements.byType` | No editor genérico completo de plantilla; sólo transformación coach | resource_requirements → snapshot → clone/normalización en buildInput | Adapter resuelve representabilidad; no todas las cantidades genéricas se admiten. PARCIAL |
| `resourceRequirements.byItem` | Coach específico sí; cámara/sonido/presentador/aux no editor completo | Global resource_items → snapshot → recursos diarios efectivos | Exactitud/exclusividad; PARCIAL de superficie |
| `resourceRequirements.anyOf` | API `z.any` y datos preservados, sin editor completo | Snapshot conserva alternativas normalizadas | Preflight/adapter debe admitir dominio representable o rechazar; PARCIAL, no certificar por JSON persistido |
| `resourceRequirements` resto/aliases | Edición coach copia previousRR, elimina/reescribe claves coach y normaliza cantidades positivas | API flexible no es validador semántico completo; snapshot restringe | Necesario preflight específico; INCOMPATIBLE si forma no soportada. No crear lenguaje universal rulesJson |
| `zoneId` | Selector de plató en edición, al cambiar borra spaceId | zone_id → default_zone_id → task.zoneId si instancia no especifica | Relación espacial/recursos; no suficiente por sí sola para asignar espacio Next. PARCIAL |
| `spaceId` | Selector por zona | space_id → default_space_id → task.spaceId con override instancia | Disponibilidad/ocupación; PARCIAL. Cambiar global no mueve tarea de día existente |
| Espacios alternativos | Ningún campo productivo completo de plantilla/selector multiespacio localizado | No atribuir a zoneId ni al picker de scope | FALTANTE de superficie y contrato lossless representable; no implementarlo sólo en UI |
| `hasDependency` | Checkbox admin en edición; exige lista no vacía en cliente | has_dependency → snapshot | Control semántico de dependencias. PARCIAL por autoridades diarias superiores |
| `dependsOnTemplateId` | Compatibilidad primer elemento, no editor separado | FK singular + normalización | No otra dependencia independiente; mantener compatibilidad sin duplicar autoridad |
| `dependsOnTemplateIds` | Multiselect directo; positivos, sin self; API array | JSON global → dependency_template_ids → tasks del mismo participante por templateId | Construcción/validador, pero Next explícito sobrescribe dependsOnTaskIds. PARCIAL |
| `inverseDepsDraft/inverseDepsOriginal` | Multiselección «dependen de ésta», sólo admin | No columnas propias: se hace PATCH a otras plantillas tras guardar principal | Varias requests, sin transacción global: fallo intermedio puede dejar cambios parciales. PARCIAL; no prometer guardado atómico |
| `itinerantTeamRequirement` | Checkbox y selección de alternativas | 0 opciones→none; 1→specific; >1→any en saveEdit | PARCIAL; checkbox marcado sin opciones se degrada a none. Debe validarse en futura UI |
| `itinerantTeamId` | Derivado de selección singleton | ID **global** → snapshot → task, luego autoridad local taskOperations | Specific real sólo si identidad reconciliada y existe unidad diaria. PARCIAL |
| `rulesJson.itinerantTeamAllowedIds` | Multiselección de equipos globales | Se conserva en rules_json y snapshot.allowedItinerantTeamIds | Adapter Next sí representa subconjuntos en IDs locales. Aviso «motor no restringe subconjunto» es antiguo. PARCIAL por mapping global→día |
| `rulesJson` resto | No editor general de reglas localizado; UI preserva previousRules | Snapshot operacional extrae semántica conocida; no todo JSON llega a EngineInput | SIN EFECTO DEMOSTRADO para claves desconocidas; no declarar todas operativas |
| `setupId` | Modelo/API/storage; sin editor setup/familia propio localizado | setup_id → snapshot; no proyección automática demostrada a setupFamilyId/policy Next | LEGACY/PARCIAL. Next usa taskOperations.setupFamilyId + setupPolicies explícitas |
| Setup/familia/reentrada/preparación | Sin editor productivo de plantilla de operación | Autoridades Next separadas, no setup_id aislado | FALTANTE UI; motor existente para contratos soportados |
| Operaciones conjuntas/ancladas/rondas/cadenas | Sin editor de plantilla que recorra general→día completo | `jointGroupId`, anchoredAccompaniments, roundSynchronizations, technicalChains finales | PARCIAL motor/FALTANTE UI; no deducir por nombre parecido o dependencia inversa |
| Orden de ejecución | `sortOrder` de reglas coach sólo ordena autocreación; dependencias sí son precedencia | No columna genérica de orden de plantilla que gobierne Next | FALTANTE si se requiere precedencia adicional; usar dependencia/policy explícita, no orden visual |
| Disponibilidad propia de tarea | No editor completo de ventana de plantilla localizado | Next Task.availability existe en contratos de motor; no cadena global/día completa | FALTANTE de producto; disponibilidad de participante/espacio no equivale a ventana propia |
| `blocksSpace` | Sin campo propio de plantilla/global | En taskOperations del día explícito; ausencia bloquea espacio | PARCIAL/FALTANTE editor, conservar separación de identidad espacial y ocupación física |
| `abbrev` | Alta/edición, máximo 32, trim/null | task_templates.abbrev; no parte del snapshot operacional | INFORMATIVO visual; no regla de planificación |
| `uiColor` | Picker + texto RGB/HEX; normaliza #RGB/#RRGGBB | ui_color mutable global, snapshot operacional no copia estilo | INFORMATIVO; posible cambio visual histórico sin cambio de reglas |
| `uiColorSecondary` | Picker + texto, nullable | ui_color_secondary | INFORMATIVO |
| `defaultComment1Color` | API/modelo/storage; sin editor plantilla propio localizado | Columna global; no snapshot operacional de estilo | INFORMATIVO; no declarar soporte UI que no está |
| `defaultComment2Color` | Igual, independiente | Columna global | INFORMATIVO |
| `location_label` conectado | Compatibilidad de ubicación eliminada; no contrato de elección productiva | Label histórico; no espacio físico recuperado por texto | INFORMATIVO; no resolver identidad por etiqueta |

## Dependencias y autocreación: detalles causales

`storage.createContestant` utiliza **snapshots del plan** y `autoCreateOnContestantCreate`; no el último catálogo global. `ensurePlanTaskTemplateSnapshot` permite snapshot ad hoc cuando se añade una plantilla no materializada, con source explícito; no refresca todas las plantillas existentes. `buildInput` resuelve dependencias por `(contestantId, templateId)`, tomando un task ID existente; una plantilla con más de una instancia para el mismo participante exige una prueba de ambigüedad antes de asumir que todas quedan bien enlazadas. No convertir ese índice en autoridad de operaciones complejas.

En días con configuración explícita, `taskOperations` exige cubrir exactamente todas las tasks. Añadir una instancia desde un editor inferior puede requerir evolucionar esa autoridad, o provocar rechazo de preflight/aplicación por cobertura incompleta. El formulario de alta de tarea no demuestra por sí solo que ampliar un A2 protegido sea una operación soportada.

## Pruebas de cierre necesarias

1. Alta real del formulario completo contra schema, storage y respuesta; márgenes null/0/5, guardar/recargar y snapshot al crear día. El test debe fallar con el checkout auditado por la incompatibilidad ya reproducida.
2. Editar ambos márgenes en global, comprobar PATCH, persistencia, GET y snapshot futuro; día existente intacto. `null` hereda y `0` conserva autoridad.
3. Instancia diaria override, RESTORE permitido y frontera `max(A.after,B.before)` sin sumar lados; mismo resultado búsqueda/validador/publicación.
4. Dependencias directas/inversas, ciclo/self/ID inexistente, varias instancias, fallo de segundo PATCH y atomicidad explícita de la futura solución.
5. Selección de una/múltiples/cero alternativas itinerantes con IDs globales y diarios distintos; no prometer subconjunto si mapping falta; equipo específico no sustituible.
6. Snapshot ausente/ad hoc, general editado después, propuesta antigua stale y Stage intacto; 266 obligaciones A2 sin cambios.

Evidencia existente de capas: `taskTemplateSnapshot.spec.ts`, `taskTemplateSnapshotIntegration.spec.ts`, `taskTemplateSnapshotMigration.spec.ts`, `engine/buildInput.taskTemplateSnapshot.spec.ts`, `participantTransition.spec.ts`, `assistedManualSnapshotFidelity.spec.ts`. Esos tests no cubren el formulario global completo y por eso no habían probado los cortes detectados aquí.
