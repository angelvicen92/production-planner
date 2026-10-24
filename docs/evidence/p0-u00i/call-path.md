# Recorrido material de U00i sobre e79f8ee

`NATIVO` significa ejecución instrumentada de la jornada API; `OFFLINE` significa
replay de sus autoridades capturadas; `CONTRATO` significa lectura del código,
sin atribuir ejecución de una capacidad aún no soportada.

| Tramo | Autoridad real | Observación / frontera |
| --- | --- | --- |
| Catálogo y plantillas | APIs `/resource-items`, `/task-templates`; `ResourceRequirementsInput` en `engine/types.ts` | NATIVO: IDs A/B explícitos y `quantity=1`; no selección por tipo. |
| Jornada y snapshots | `server/storage.ts`, `plan_task_template_snapshots`, `plan_resource_items` | NATIVO: las identidades globales 2/3 pasan a diarias 5/6. La plantilla conserva su dominio. |
| EngineInput | `engine/buildInput.ts::buildEngineInput`, `cloneResourceRequirementsForEngineInput`; `server/newDayPlannerConfiguration.ts` | NATIVO: `A-input.json` conserva el requisito flexible y el fijo. |
| Preflight | `engine/planner-next/integration/engineInputPreflight.ts::preflightEngineInputForPlannerNext` | NATIVO: primer rechazo, línea de `anyOf` incondicional. Falta un contrato de elección, no disponibilidad física. |
| Recursos fijos | `engine/concreteTaskResourceRequirements.ts::resolveConcreteTaskResourceRequirements`, `effectiveTaskResourceAssignments.ts`, `projectedTaskResources.ts` | OFFLINE: los dos counterparts concretos resuelven por FK global→diaria, no por igualdad de números. |
| Adapter | `engineInputAdapter.ts::adaptEngineInputToPlannerNextProblem` | OFFLINE guard-only: sin el rechazo, el dominio desaparece; ni siquiera incorpora B a `problem.resources`. `Task.requiredResourceIds` sólo conserva consumo fijo. |
| Scope | `server/assistedScopeResolver.ts`; `assistedPlanning.ts::buildAssistedProblem` | NATIVO: petición rechazada antes de search. OFFLINE: se resuelven scope y futuro por IDs capturados; la crítica de otro participante figura como analítica. |
| Arquitectura y geometry | `exactMainAndFeederCore.ts::runExactMainAndFeederSearch`; `anonymousPipelineWitness.ts::preparePipelineBundleGraph` | CONTRATO: la jornada standalone no necesita Main. Para el alcance general, Main construye operaciones/bundles desde tareas concretas; no recibe una decisión nominal genérica. |
| Matching | `PreparedPipelineBundleGraph.candidates`, `materializePreparedPipelineBundleMatching`; repairs en `exactMainAndFeederCore.ts` | CONTRATO: un bundle por tarea/posición; matching, deduplicación y nogood `id@position`. No se ha demostrado un rechazo nominal ejecutado en Main; falta la dimensión de contrato. |
| Materialización | `itinerantUnitAssignment.ts::materializeItinerantUnitAssignment`; `exactItinerantPlan.ts::searchStandaloneForCoreCandidate` y búsqueda ordinary | CONTRATO: reutilizable como patrón de unión de miembros y recursos independientes, pero sólo para unidades itinerantes reales. Los ordinary variants actuales eligen `itinerantUnitId`; no hay alternativa física ordinaria. |
| Dominios y colocación | `placement.ts::exactTaskStaticStartDomain`, `exactTaskDynamicStartDomain`, `canPlaceTask`; wrappers en `exactItinerantPlan.ts` | OFFLINE: consumen correctamente A/B cuando son concretos. A/A no completa, B/A completa. No se cambian restricciones, transiciones, severidades ni ventanas. |
| Future Feasibility | `participantFutureFeasibility.ts::affectedBy`, `probeParticipantFutureReservations`; llamadas desde `exactItinerantPlan.ts` | OFFLINE: misma disponibilidad, sin dependencia ni participante compartido. Scope A deja crítica sin solución; scope B conserva ambas. El futuro analítico existe, pero la reducción causal no cubre esa competencia física. El filtro puro `tasksCanAffectEachOther` ya reconoce recursos concretos y es reutilizable; no representa alternativas sin seleccionar. |
| Ledger y backtracking | `exactMainAndFeederCore.ts::createExactSearchLedger`; `exactItinerantPlan.ts` | OFFLINE: se reutiliza la búsqueda vigente. Son contrafactuales independientes para diagnóstico; no existe un selector productivo que lance una segunda búsqueda. El ledger no puede retroceder sobre una decisión nominal que no representa. |
| Validación | `validate.ts::validatePlan`; `fingerprint.ts::fingerprint` | OFFLINE: al omitir B del resultado ordinario, la validación sigue hard-valid y el fingerprint no cambia. La validación física no sustituye pertenencia al dominio/conservación de recursos obligatorios. |
| Propuesta Assisted | `server/assistedProposalService.ts` | CONTRATO: U00h proyecta byItem resuelto; U00d proyecta miembros de unidad seleccionada. No proyecta una selección anyOf genérica. `materializeSnapshotTask` sólo materializa explícitamente unidad itinerante. |
| Snapshot, Draft y SQL | `server/assistedPlanningSnapshot.ts`, `assistedPlanningPersistenceMapping.ts`; migraciones 077/078, RPC efectiva en 108 | NATIVO: bootstrap S0, 422 y Draft/S0 iguales. CONTRATO: snapshot ya admite `assignedResourceIds`; RPC conserva run/session/revision/CAS/scope y rechaza mutaciones protegidas. No se prueba una aceptación anyOf ni se concluye necesidad de nueva migración. |
| Stage y continuación | `assistedPlanningService.ts`, RPCs de Stage, `daily_tasks.assigned_resource_ids` | CONTRATO: Stage protege elecciones ya materializadas sin crear locks. OFFLINE: un placement se suministra como contexto protegido para aislar la pérdida de futuro; no se ha persistido ni aceptado un Stage en ese probe. |

Las restricciones byType, cantidad mayor que uno, auxiliares sin contrato de
concurrencia y requiresAuxiliar/Presenter permanecen exactamente como en main.
No se adapta el caso a equipos itinerantes ficticios ni se debilitan validadores.
