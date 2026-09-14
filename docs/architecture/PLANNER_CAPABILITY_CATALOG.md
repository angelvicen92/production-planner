# Planner capability catalog

> Referencia descriptiva, no normativa. Este catálogo registra lo comprobable en el árbol auditado; no crea requisitos ni sustituye las SPEC. `ACTIVE` significa que existe un camino productivo en este commit, no que todos los problemas posibles sean resolubles.

## Audit snapshot

| Campo | Valor |
|---|---|
| Fecha | 2026-09-14 |
| `main` auditado | `88b7ead8c720daff49ee58da001dc15a8f4ac54a` (ASST-004) |
| Assisted pendiente | ASST-005: PR #899 y su corrección apilada PR #902, ambas `PENDING_PR`; su contenido no forma parte de este inventario de `main` |
| Experimental auditado | `codex/implementar-cambios-para-full-a2` @ `5077675d76f24c088b3e9961dc71cb75635d07bd`; se audita sólo como ref experimental, nunca como autoridad productiva ni como contenido de `main` |

### Cómo leer el catálogo

La traza empleada es **fuente/requisito → autoridad productiva → `EngineInput` → preflight/adapter → Planner Next/ORC → validación → test/benchmark/Evidence → assisted → limitación**. Las dimensiones son independientes: una implementación puede estar activa y a la vez tener integración assisted parcial. `OFFICIAL` se reserva para contratos vinculados explícitamente por documentación de cobertura o por las Fuentes oficiales del proyecto; `DERIVED` identifica conducta deducida del código. `UNVERIFIED` no equivale a roto.

## Summary matrix

| ID | Capacidad | Source authority | Implementation | Assisted integration | Evidence | Recommendation | Autoridades y pruebas principales |
|---|---|---|---|---|---|---|---|
| REP-01 | Contrato DB-agnostic y normalización temporal | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `engine/types.ts::EngineInput`; `engine/planner-next/integration/engineTime.ts`; `engine/planner-next/integration/engineInputAdapter.spec.ts` |
| REP-02 | Configuración efectiva explícita y budgets | OFFICIAL | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `engine/types.ts::PlannerNextIntegrationConfigurationInput`; `engine/buildInput.ts::buildEngineInput`; `docs/coverage/SPEC11-010-CHECKPOINT3-BUILDINPUT-AUTHORITY-EVIDENCE.md` |
| REP-03 | Snapshots/revisiones reproducibles | OFFICIAL | ACTIVE | ACTIVE | TESTED | REUSE | `server/assistedPlanningSnapshot.ts`; `server/assistedPlanningConfigRevision.ts`; migrations `077_assisted_planning_state.sql`, `078_assisted_planning_workflow.sql` |
| REP-04 | Estados inmutables y placements protegidos | OFFICIAL | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `engine/types.ts::TaskStatus`; `effectiveTaskFixedInterval.ts`; `assistedPlanning.ts::buildAssistedProblem`; protected-resource benchmark |
| REP-05 | Locks time/space/resource/full | DERIVED | PARTIAL | PARTIAL | TESTED | REUSE_AND_EXTEND | `engine/types.ts::LockInput`; `engine/buildInput.ts::buildEngineInput`; `engineInputAdapter.ts::adaptEngineInputToPlannerNextProblem` |
| DEP-01 | Múltiples prerequisites por tarea | OFFICIAL | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `TaskInput.dependsOnTaskIds`; `feederClosure.ts`; `docs/evidence/A2-FULL-023-collective-prerequisite-capacity.json` |
| DEP-02 | Closure de prerequisites para scope | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `assistedPlanning.ts::buildAssistedProblem`; `assistedPlanning.spec.ts` |
| DEP-03 | Acompañamiento anchored/adyacente | OFFICIAL | ACTIVE | ACTIVE | TESTED | REUSE | `EngineInputAnchoredAccompanimentInput`; `anchoredAccompaniment.ts`; `anchoredAccompaniment.spec.ts` |
| DEP-04 | Joint groups sincronizados | OFFICIAL | ACTIVE | PARTIAL | TESTED_AND_BENCHMARKED | REUSE_AND_EXTEND | `jointGroupId`; `jointTasks.ts`; SPEC10-017 Evidence |
| DEP-05 | Operaciones/cadenas técnicas | DERIVED | ACTIVE | PARTIAL | TESTED_AND_BENCHMARKED | REUSE_AND_EXTEND | `technicalOperations.ts`; `technicalChains.ts`; technical benchmarks |
| SPA-01 | Disponibilidad día/zona/espacio | OFFICIAL | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `PlanZoneAvailabilityInput`; `PlanSpaceAvailabilityInput`; `effectivePlanSpatialAvailability.ts` |
| SPA-02 | Main flow, bloques y preferred end | DERIVED | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `PlannerNextMainFlowInput`; `mainFlowPatterns.ts`; main-flow benchmarks |
| SPA-03 | Grouping de setup por familia | OFFICIAL | ACTIVE | PARTIAL | TESTED_AND_BENCHMARKED | REUSE | `EngineInputSetupPolicyInput`; `setupGrouping.ts`; SPEC10-018 Evidence |
| SPA-04 | Orden flexible y preparación de setup | OFFICIAL | ACTIVE | PARTIAL | TESTED_AND_BENCHMARKED | REUSE | `exactSetupBlocks.ts`; `setupPreparation.ts`; SPEC10-020 Evidence |
| SPA-05 | Continuidad secundaria | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `SecondaryContinuity`; `secondaryContinuity.ts`; `secondaryContinuity.spec.ts` |
| SPA-06 | Sincronización de rondas multi-lane | DERIVED | ACTIVE | PARTIAL | TESTED | REUSE_AND_EXTEND | `RoundSynchronizationPolicy`; `exactRoundSynchronization.ts`; `roundSynchronization.spec.ts` |
| TRN-01 | Transición global de participante | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `participantTransitionMinutes`; `placement.ts`; `validate.ts::validatePlan` |
| TRN-02 | Transición global de recurso | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `resourceTransitionMinutes`; `resourcePresence.ts`; validation summary |
| TRN-03 | Rutas asimétricas de coaches | OFFICIAL | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `CoachRouteTransition`; adapter; SPEC10-019 Evidence |
| RES-01 | Requisitos por tipo/item y assignments | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `ResourceRequirementsInput`; `projectedTaskResources.ts`; `effectiveTaskResourceAssignments.ts` |
| RES-02 | Alternativas `anyOf` | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `ResourceRequirementsInput.anyOf`; preflight/adapter specs |
| RES-03 | Componentes de items | DERIVED | PARTIAL | NOT_WIRED | UNVERIFIED | INVESTIGATE | `ResourceItemComponentInput`; `EngineInput.resourceItemComponents`; sin contrato equivalente en `PlannerNextProblem` |
| RES-04 | Bundles/componentes/space affinities | DERIVED | IMPLEMENTED_NOT_WIRED | NOT_WIRED | UNVERIFIED | INVESTIGATE | tipos `ResourceBundle*Input`; carga en `buildInput.ts`; ausencia en `contracts.ts::PlannerNextProblem` |
| RES-05 | Disponibilidad/presencia/afinidad espacial de recurso | DERIVED | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `Resource`; `resourcePresence.ts`; resource-presence benchmarks |
| ITI-01 | Unidad itinerante y disponibilidad propia | OFFICIAL | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `ItinerantUnit`; `exactItinerantPlan.ts`; A2-FULL-005 Evidence |
| ITI-02 | Asignación any/specific de unidad | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `allowedItinerantTeamIds`; adapter; `itinerantUnits.spec.ts` |
| MEAL-01 | Break global protegido | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `ProtectedBreakInput`; `PlannerNextProblem.protectedMeal`; `validate.ts` |
| MEAL-02 | Comida flexible por participante/capacidad | DERIVED | ACTIVE | PARTIAL | TESTED_AND_BENCHMARKED | REUSE_AND_EXTEND | `ParticipantMealObligation`; `participantMeals.ts`; participant-meal Evidence/benchmark |
| MEAL-03 | Comida de espacio | DERIVED | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `SpaceMealPolicy`; `spaceMeals.ts`; required-space-meal benchmark |
| MEAL-04 | Comida de recursos | DERIVED | ACTIVE | PARTIAL | TESTED_AND_BENCHMARKED | REUSE_AND_EXTEND | `ResourceMealBreak`; `executePlannerNext.ts` / `exactItinerantPlan.ts`; `resourceMeals.spec.ts`; SPEC10-014 fixture |
| MEAL-05 | Comida de unidad itinerante | OFFICIAL | ACTIVE | PARTIAL | TESTED_AND_BENCHMARKED | REUSE_AND_EXTEND | `ItinerantUnitMealBreak`; `itinerantUnitMeals.ts`; SPEC10-015 fixture |
| MEAL-06 | Política de pausa operacional flexible | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `OperationalMealPolicy`; `operationalMeals.ts`; `flexibleOperationalMealPolicy.spec.ts` |
| TPT-01 | Agrupación de llegada/salida | DERIVED | ACTIVE | PARTIAL | TESTED | REUSE_AND_EXTEND | `TransportGroupingPolicy`; `transportGrouping.ts`; `transportGrouping.spec.ts` / adapter specs |
| SRCH-01 | Policy gate explícito/migration default | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `searchPolicy.ts::resolvePlannerSearchPolicy`; `executePlannerNext.ts` |
| SRCH-02 | Budget determinista y contadores | DERIVED | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `SearchBudget`; exact evidence ledgers; core benchmarks |
| SRCH-03 | Exact main+feeder constructive core | DERIVED | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `constructExactMainAndFeederCore`; exact-core specs/benchmarks |
| SRCH-04 | Exact itinerant completion | DERIVED | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `constructExactItinerantPlan`; exact-itinerant specs/benchmarks |
| SRCH-05 | Backtracking y backjump certificado | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `ExactSearchLedger`; `CertifiedBackjump`; causal diagnostic specs |
| SRCH-06 | Matching residual/incremental | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `incrementallyRepairMatchingWitness`; `residualMatchingCertificate.spec.ts` |
| SRCH-07 | Forward feasibility macro/standalone | DERIVED | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `futureFeasibility.ts`; `macroPendingPrerequisiteForwardCheck.ts`; bounded-future benchmark |
| SRCH-08 | Pruning/ranking/constrainedness | DERIVED | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `exactItinerantPlan.ts::macroConstrainedness`; branch-local ranking benchmark |
| VAL-01 | Preflight de EngineInput y problema | DERIVED | ACTIVE | ACTIVE | TESTED_AND_BENCHMARKED | REUSE | `engineInputPreflight.ts`; `validate.ts::preflight`; preflight benchmark |
| VAL-02 | Validador hard/required y reason codes | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE_AND_EXTEND | `validate.ts::validatePlan`; `ValidationSummary`; assisted reason codes |
| VAL-03 | Fingerprint, orden canónico e invariancia | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `fingerprint.ts`; `branchHistoryInvariance.spec.ts`; `assistedPlanning.ts::canonicalIds` |
| VAL-04 | Diagnóstico causal exact core | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE_AND_EXTEND | `ExactCoreCausalDiagnostic`; `executeAssistedPlanning` evidence |
| VAL-05 | Registro de cobertura/Evidence Focal A2 | OFFICIAL | ACTIVE | NOT_APPLICABLE | TESTED_AND_BENCHMARKED | REUSE | `coverage/focalA2CapabilityCatalog.ts`; `focalA2CapabilityEvidenceBindings.ts`; SPEC10-012R Evidence |
| AST-01 | Scope canónico inmutable | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE | `PlanningScope`; `createPlanningScope`; assisted specs |
| AST-02 | Proyección y propuesta sin consolidación | DERIVED | ACTIVE | ACTIVE | TESTED | REUSE_AND_EXTEND | `buildAssistedProblem`; `executeAssistedPlanning`; `assistedPlanning.spec.ts` |
| AST-03 | Persistencia de sesión/stage/draft | OFFICIAL | ACTIVE | ACTIVE | TESTED | REUSE | migration 077; `assistedPlanningPersistenceMapping.ts`; storage specs |
| AST-04 | Bootstrap/patch/validate/accept/undo-redo atómicos | OFFICIAL | ACTIVE | ACTIVE | TESTED | REUSE | migration 078; `assistedPlanningService.ts`; workflow specs |
| AST-05 | Excepciones aceptadas | OFFICIAL | PARTIAL | PARTIAL | TESTED | REUSE_AND_EXTEND | migration 077 tables; persistence mapping; acceptance still requires zero HARD/REQUIRED in migration 078 |
| AST-06 | Integración de ASST-005 | OFFICIAL | ABSENT | PENDING_PR | UNVERIFIED | INVESTIGATE | Fuente oficial de reenfoque ASST-005; PR #899 + corrección apilada #902 pendientes y excluidos de `main` |
| EXP-01 | One-click Full A2 histórico | EXPERIMENTAL_ONLY | EXPERIMENTAL_NOT_MAIN | NOT_APPLICABLE | KNOWN_BROKEN | RETIRE | `exp@5077675:docs/evidence/A3-ORCH-REAL-025-final-one-click-core-feeding.md`: `ONE_CLICK_SURVIVAL_GATE=FAIL`, `CORE_COMPLETE_LEAF=NO`, `POST_CORE_REACHED=NO`; nunca productivo |
| EXP-02 | Experimentos de presence/residual ordering | EXPERIMENTAL_ONLY | LEGACY | NOT_APPLICABLE | TESTED | RETIRE | archivos `*Experiment*`, manifests históricos; no son selection policy productiva |
| EXP-03 | Reserva diferida de prerequisites | EXPERIMENTAL_ONLY | EXPERIMENTAL_NOT_MAIN | NOT_APPLICABLE | KNOWN_LIMITATION | INVESTIGATE | `exp@5077675:engine/planner-next/deferredPrerequisiteReservation.ts`; A3-ORCH-REAL-016 prueba actividad pero no alcanza terminal |
| EXP-04 | Autoridad de deadline de completion pendiente | EXPERIMENTAL_ONLY | EXPERIMENTAL_NOT_MAIN | NOT_APPLICABLE | TESTED | INVESTIGATE | `exp@5077675:engine/planner-next/pendingCompletionDeadlineAuthority.ts`; spec experimental de propagación/ciclos |

**Total:** 56 capacidades diferenciadas. La granularidad separa autoridad, wiring, evidencia e integración assisted para evitar declarar “soportado” sólo porque existe un tipo o un test aislado.

## Per-capability traceability

> Cada fila es una ficha compacta. Las columnas hacen explícitos **categoría y propósito**, **Fuente/autoridad y autoridad productiva de datos**, **EngineInput, adapter/proyección e implementación/símbolo**, **tests y benchmark/Evidence**, y finalmente **estado main, estado Assisted, limitación, experimental relacionado y recomendación**. Una ruta con prefijo `exp@5077675:` existe sólo en el ref experimental auditado y jamás designa wiring productivo.

| ID | Categoría / propósito | Fuente / autoridad; autoridad productiva de datos | EngineInput → adapter/proyección → implementación/símbolo | Tests; benchmark / Evidence | Estado main / Assisted | Limitación; experimental relacionado; recomendación |
|---|---|---|---|---|---|---|
| REP-01 | Representación; contrato DB-agnostic y tiempo canónico | DERIVED; `engine/types.ts::EngineInput` | `EngineInput` → `integration/engineTime.ts` / `adaptEngineInputToPlannerNextProblem` → `PlannerNextProblem` | `integration/engineInputAdapter.spec.ts`; SPEC10-010 fixture | ACTIVE / ACTIVE | Sólo formatos representables; misma versión en exp; REUSE |
| REP-02 | Configuración; settings y budgets explícitos | OFFICIAL; `buildInput.ts::buildEngineInput` + settings efectivos | `PlannerNextIntegrationConfigurationInput` → adapter → `SearchBudget` | adapter/preflight specs; SPEC11-010 Evidence | ACTIVE / ACTIVE | Configuración ausente se rechaza o usa default documentado; misma versión exp; REUSE |
| REP-03 | Replay; snapshots/revisiones reproducibles | OFFICIAL; snapshot y config revision persistidos | snapshot de `EngineInput` → assisted mapping → `assistedPlanningSnapshot.ts` | snapshot/storage specs; migrations 077/078 | ACTIVE / ACTIVE | RLS/persistencia son autoridad, no el solver; sin exclusivo exp; REUSE |
| REP-04 | Protección; inmutabilidad done/in_progress | OFFICIAL; status + planning real/efectivo | `TaskInput.status` → `effectiveTaskFixedInterval` → protected singleton | `effectivePlanResourceAvailability.spec.ts`; protected-resource benchmark | ACTIVE / ACTIVE | Requiere placement fijo representable; exp añade reservas, no sustituye protección; REUSE |
| REP-05 | Protección; locks time/space/resource/full | DERIVED; `EngineInput.locks` cargados por `buildEngineInput` | `LockInput` → preflight/adapter → availability/assignments efectivos | adapter/preflight specs; sin Evidence universal | PARTIAL / PARTIAL | Clases ricas no equivalen a una sola availability; misma versión exp; REUSE_AND_EXTEND |
| DEP-01 | Dependencias; múltiples prerequisites | OFFICIAL; `TaskInput.dependsOnTaskIds` | tasks → adapter `Task.dependencies` → `feederClosure` | `feederClosure.spec.ts`; `A2-FULL-023-collective-prerequisite-capacity.json` | ACTIVE / ACTIVE | Cierre no reserva toda presión futura; exp: deferred reservation; REUSE |
| DEP-02 | Dependencias; closure de scope | DERIVED; grafo de tasks del problema fuente | `dependsOnTaskIds` → `buildAssistedProblem` → supporting tasks | `assistedPlanning.spec.ts`; Evidence de código | ACTIVE / ACTIVE | No cierra joint/chain/round; exp: deferred reservation; REUSE |
| DEP-03 | Acoplamiento; acompañamiento anchored | OFFICIAL; `anchoredAccompaniments` | `EngineInputAnchoredAccompanimentInput` → adapter/scope closure → `anchoredAccompaniment` | `anchoredAccompaniment.spec.ts`; SPEC10-012R | ACTIVE / ACTIVE | Sólo grupos explícitos; misma versión exp; REUSE |
| DEP-04 | Acoplamiento; joint groups sincronizados | OFFICIAL; `TaskInput.jointGroupId` | tasks → adapter → `jointTasks` | `jointTasks.spec.ts`; SPEC10-017 Evidence/benchmark | ACTIVE / PARTIAL | Scope no añade siblings; misma versión exp; REUSE_AND_EXTEND |
| DEP-05 | Acoplamiento; operaciones/cadenas técnicas | DERIVED; roles/policies técnicas del input | tasks/policies → adapter → `technicalOperations` / `technicalChains` | specs homónimas; technical-chain Evidence/benchmarks | ACTIVE / PARTIAL | Scope puede descartar cadena incompleta; misma versión exp; REUSE_AND_EXTEND |
| SPA-01 | Espacio; disponibilidad día/zona/space | OFFICIAL; `PlanZoneAvailabilityInput` / `PlanSpaceAvailabilityInput` | EngineInput spatial data → adapter → `effectivePlanSpatialAvailability` | adapter + spatial specs; SPEC10-012R | ACTIVE / ACTIVE | No representa demanda futura filtrada; misma versión exp; REUSE |
| SPA-02 | Flujo; main blocks/preferred end | DERIVED; `PlannerNextMainFlowInput` | main-flow settings → adapter → `mainFlowPatterns` | `mainFlowPatterns.spec.ts`; main-flow benchmarks | ACTIVE / ACTIVE | Scope elimina keys/tareas futuras; misma versión exp; REUSE |
| SPA-03 | Setup; grouping por familia | OFFICIAL; `EngineInputSetupPolicyInput` | setup policy → adapter → `setupGrouping` | setup specs; SPEC10-018 Evidence/benchmark | ACTIVE / PARTIAL | Scope altera familias presentes; misma versión exp; REUSE |
| SPA-04 | Setup; orden flexible/preparación | OFFICIAL; setup policy/order | EngineInput setup → adapter → `exactSetupBlocks` / `setupPreparation` | `flexibleSetupOrder.spec.ts`; SPEC10-020 Evidence | ACTIVE / PARTIAL | Presión futura ausente; misma versión exp; REUSE |
| SPA-05 | Flujo; continuidad secundaria | DERIVED; `SecondaryContinuity` | task/main settings → adapter → `secondaryContinuity` | `secondaryContinuity.spec.ts`; sin benchmark requerido | ACTIVE / ACTIVE | Sólo problema proyectado; misma versión exp; REUSE |
| SPA-06 | Rondas; sync multi-lane | DERIVED; `RoundSynchronizationPolicy` | round policies → adapter/scope filter → `exactRoundSynchronization` | `roundSynchronization.spec.ts`; SPEC10-021 probe | ACTIVE / PARTIAL | Lanes/peers futuros se recortan; misma versión exp; REUSE_AND_EXTEND |
| TRN-01 | Transición; participante global | DERIVED; `participantTransitionMinutes` | EngineInput config → adapter → `placement` / `validatePlan` | placement/validation specs; SPEC10-012R | ACTIVE / ACTIVE | Vecinos futuros fuera del scope invisibles; misma versión exp; REUSE |
| TRN-02 | Transición; recurso global | DERIVED; `resourceTransitionMinutes` | EngineInput config/resources → adapter → `resourcePresence` / validation | resource-presence specs; benchmark | ACTIVE / ACTIVE | Demanda futura ausente; misma versión exp; REUSE |
| TRN-03 | Transición; rutas asimétricas coach | OFFICIAL; `coachRouteTransitions` | `CoachRouteTransition` → adapter → `coachRouteTransitions` | `coachRouteTransitions.spec.ts`; SPEC10-019 Evidence/benchmark | ACTIVE / ACTIVE | Sólo matriz explícita; misma versión exp; REUSE |
| RES-01 | Recursos; requirements y assignments | DERIVED; requirements + assignments efectivos | `ResourceRequirementsInput` → adapter → `projectedTaskResources` / `effectiveTaskResourceAssignments` | adapter/resource specs; SPEC10-012R | ACTIVE / ACTIVE | Catálogo incompleto se rechaza; misma versión exp; REUSE |
| RES-02 | Recursos; alternativas anyOf | DERIVED; `ResourceRequirementsInput.anyOf` | task requirements → preflight/adapter → resource domains | adapter/preflight specs; SPEC10-012R | ACTIVE / ACTIVE | Sin bundles implícitos; misma versión exp; REUSE |
| RES-03 | Recursos; componentes de item | DERIVED; `EngineInput.resourceItemComponents` | cargado en EngineInput → **sin campo/proyección** → sin solver | buildInput/type tests; sin Evidence de solver | PARTIAL / NOT_WIRED | No declarar activo; ninguna versión exp probada; INVESTIGATE |
| RES-04 | Recursos; bundles/components/affinities | DERIVED; `ResourceBundle*Input` cargado por builder | EngineInput → **sin contrato en `PlannerNextProblem`** | builder/types; sin Evidence de solver | IMPLEMENTED_NOT_WIRED / NOT_WIRED | Dato no equivale a capacidad; ninguna versión exp probada; INVESTIGATE |
| RES-05 | Recursos; availability/presence/space affinity | DERIVED; catálogo `Resource` adaptado | resources/assignments → adapter → `resourcePresence` | `resourcePresence.spec.ts`; resource-presence benchmark | ACTIVE / ACTIVE | Scope omite presión futura; exp experimenta ordering, no nueva autoridad; REUSE |
| ITI-01 | Itinerancia; unidad y disponibilidad | OFFICIAL; itinerant teams del EngineInput | team/member availability → adapter → `exactItinerantPlan` | itinerant specs; A2-FULL-005 Evidence/benchmarks | ACTIVE / ACTIVE | Completion depende de core viable; exp modifica search; REUSE |
| ITI-02 | Itinerancia; any/specific assignment | DERIVED; task itinerant requirement/IDs | task fields → adapter → itinerant domains | `itinerantUnits.spec.ts`; adapter Evidence | ACTIVE / ACTIVE | IDs incompatibles se rechazan; misma versión exp; REUSE |
| MEAL-01 | Comidas; break global protegido | DERIVED; `protectedBreaks` | `ProtectedBreakInput` → adapter `protectedMeal` → `validatePlan` | adapter/validation specs; SPEC10-012R | ACTIVE / ACTIVE | Un único break global no cubre otras modalidades; misma versión exp; REUSE |
| MEAL-02 | Comidas; obligación participante/capacidad | DERIVED; meal config + source task | EngineInput meals → adapter → `participantMeals` | participant meal specs; SPEC10-013R fixture/benchmark | ACTIVE / PARTIAL | Scope filtra por sourceTaskId; misma versión exp; REUSE_AND_EXTEND |
| MEAL-03 | Comidas; política de espacio | DERIVED; space meal policy | EngineInput policy → adapter → `spaceMeals` | space-meal specs; required-space-meal benchmark | ACTIVE / ACTIVE | Sólo spaces/tareas proyectados; misma versión exp; REUSE |
| MEAL-04 | Comidas; recursos físicos | DERIVED; `ResourceMealBreak` | protected breaks → adapter → `executePlannerNext` / `exactItinerantPlan` | `resourceMeals.spec.ts`; SPEC10-014 fixture/benchmark | ACTIVE / PARTIAL | Assisted conserva breaks pero recompone contexto; misma versión exp; REUSE_AND_EXTEND |
| MEAL-05 | Comidas; unidad itinerante | OFFICIAL; protected break con team | EngineInput break → adapter → `itinerantUnitMeals` | `itinerantUnitMeals.spec.ts`; SPEC10-015 fixture/benchmark | ACTIVE / PARTIAL | Scope no conserva toda presión de tasks; misma versión exp; REUSE_AND_EXTEND |
| MEAL-06 | Comidas; pausa operacional flexible | DERIVED; `OperationalMealPolicy` | EngineInput policy → adapter → `operationalMeals` | `flexibleOperationalMealPolicy.spec.ts`; test focal | ACTIVE / ACTIVE | No sustituye meals required; misma versión exp; REUSE |
| TPT-01 | Transporte; grouping arrival/departure | DERIVED; `TransportGroupingPolicy` | EngineInput transport → adapter/scope filter → `transportGrouping` | `transportGrouping.spec.ts` + adapter specs; SPEC10-012R | ACTIVE / PARTIAL | Scope recorta miembros/target efectivo; misma versión exp; REUSE_AND_EXTEND |
| SRCH-01 | Search; policy gate | DERIVED; configuración efectiva/capability detection | EngineInput config → adapter → `resolvePlannerSearchPolicy` / `executePlannerNext` | `searchPolicy.spec.ts`; core Evidence | ACTIVE / ACTIVE | Rechaza combinaciones no soportadas; exp añade variantes no productivas; REUSE |
| SRCH-02 | Search; budget/ledger determinista | DERIVED; `SearchBudget` | integration config → adapter → exact ledger | exact search specs; benchmark ledgers | ACTIVE / ACTIVE | Agotamiento no prueba inviabilidad; exp A3-016/A3-025; REUSE |
| SRCH-03 | Search; exact main+feeder core | DERIVED; `PlannerNextProblem` adaptado | tasks/policies → `executePlannerNext` → `constructExactMainAndFeederCore` | exact-core specs; core benchmarks | ACTIVE / ACTIVE | No garantiza hoja completa; exp añade deferred reservation; REUSE |
| SRCH-04 | Search; exact itinerant completion | DERIVED; problema y core parcial | adapted problem → exact completion → `constructExactItinerantPlan` | exact-itinerant specs; focal benchmarks | ACTIVE / ACTIVE | Depende de core/remaining budget; exp añade deadline authority; REUSE |
| SRCH-05 | Search; backtracking/backjump | DERIVED; ledger/rejections de search | adapted problem → exact search → `ExactSearchLedger` / `CertifiedBackjump` | causal/backjump specs; execution Evidence | ACTIVE / ACTIVE | Certificado es local al problema; variantes exp; REUSE |
| SRCH-06 | Search; matching residual/incremental | DERIVED; domains residuales | problem domains → repair → `incrementallyRepairMatchingWitness` | `residualMatchingCertificate.spec.ts`; test focal | ACTIVE / ACTIVE | Witness no incluye demanda filtrada; ordering exp no productivo; REUSE |
| SRCH-07 | Search; forward feasibility | DERIVED; pending tasks/domains | problem → exact checks → `futureFeasibility` / `macroPendingPrerequisiteForwardCheck` | forward-check specs; bounded-future benchmark | ACTIVE / ACTIVE | Main sólo ve problema actual; `exp@5077675:engine/planner-next/deferredPrerequisiteReservation.ts`; REUSE |
| SRCH-08 | Search; pruning/ranking | DERIVED; branch-local domains | problem/ledger → `exactItinerantPlan::macroConstrainedness` | ranking specs; branch-local benchmark | ACTIVE / ACTIVE | Heurística no autoridad hard; presence/residual experiments; REUSE |
| VAL-01 | Validación; preflight input/problema | DERIVED; contratos EngineInput/PlannerNextProblem | `EngineInput` → `preflightEngineInputForPlannerNext` / `adaptEngineInputToPlannerNextProblem` → `preflight` | integration preflight/adapter specs; preflight benchmark | ACTIVE / ACTIVE | Sólo contratos representados; misma versión exp; REUSE |
| VAL-02 | Validación; hard/required reason codes | DERIVED; problema adaptado + plan | projected problem/plan → `validatePlan` → `ValidationSummary` | `placement.spec.ts` y specs de capacidades; coverage Evidence | ACTIVE / ACTIVE | Valida problema proyectado, no full source assisted; misma versión exp; REUSE_AND_EXTEND |
| VAL-03 | Validación; fingerprint/canonical order | DERIVED; IDs y payload canónicos | EngineInput/problem → fingerprints/canonicalIds → replay | `branchHistoryInvariance.spec.ts`; adapter determinism Evidence | ACTIVE / ACTIVE | No prueba equivalencia entre scopes; misma versión exp; REUSE |
| VAL-04 | Diagnóstico; causal exact core | DERIVED; ledger exact | search rejections → `ExactCoreCausalDiagnostic` → assisted Evidence | causal diagnostic specs; execution Evidence | ACTIVE / ACTIVE | Diagnóstico informa, no decide; A3-016 experimental; REUSE_AND_EXTEND |
| VAL-05 | Cobertura; registro Focal A2 | OFFICIAL; coverage catalog/bindings/registry | capability probes usan EngineInput→adapter→planner→validator | coverage specs; SPEC10-012R Evidence | ACTIVE / NOT_APPLICABLE | Evidence focal no garantía universal; manifests exp separados; REUSE |
| AST-01 | Assisted; scope canónico inmutable | DERIVED; `PlanningScope` solicitado | scope IDs → `createPlanningScope` → frozen canonical scope | assisted specs; test Evidence | ACTIVE / ACTIVE | No crea future envelope; PRs #899/#902 pendientes; REUSE |
| AST-02 | Assisted; propuesta sin consolidación | DERIVED; source problem + scope | source → `buildAssistedProblem` → `executeAssistedPlanning` | `assistedPlanning.spec.ts`; fingerprints/Evidence | ACTIVE / ACTIVE | Hard-valid sólo respecto a proyección; PRs pendientes; REUSE_AND_EXTEND |
| AST-03 | Assisted; persistencia session/stage/draft | OFFICIAL; DB 077 + snapshot mapping | assisted payload → persistence mapping/storage | persistence/storage specs; migration 077 | ACTIVE / ACTIVE | Sujeto a RLS; no usar experimental; REUSE |
| AST-04 | Assisted; workflow atómico | OFFICIAL; DB 078/service | bootstrap/patch/validate/accept → service/RPC | workflow/service specs; migration 078 | ACTIVE / ACTIVE | Aceptación exige validación fresca; no usar experimental; REUSE |
| AST-05 | Assisted; excepciones aceptadas | OFFICIAL; tablas 077 y accept RPC 078 | exception records → mapping; no bypass de validator | persistence/workflow specs; migrations 077/078 | PARTIAL / PARTIAL | RPC exige cero HARD/REQUIRED; KNOWN_LIMITATION con Evidence 077/078; REUSE_AND_EXTEND |
| AST-06 | Assisted; ASST-005 pendiente | OFFICIAL; Fuente oficial de reenfoque ASST-005 + PR #899/#902 pendientes | contenido fuera de main; no se atribuye EngineInput/proyección/wiring productivo | checks de los PR, no Evidence de este SHA | ABSENT / PENDING_PR | Dos PR `PENDING_PR`; ninguna relación experimental; INVESTIGATE al integrar |
| EXP-01 | Experimental; one-click Full A2 | EXPERIMENTAL_ONLY; ref `5077675` | sólo rama exp → one-click orchestration → no main wiring | `exp@5077675:docs/evidence/A3-ORCH-REAL-025-final-one-click-core-feeding.md` | EXPERIMENTAL_NOT_MAIN / NOT_APPLICABLE | **KNOWN_BROKEN:** survival FAIL, core leaf NO, post-core NO; RETIRE |
| EXP-02 | Experimental; presence/residual ordering | EXPERIMENTAL_ONLY; runners/manifests históricos | no EngineInput authority nueva → experiment runners → no selection policy main | `*Experiment*` specs + historical manifests | LEGACY / NOT_APPLICABLE | Experimento no productivo; RETIRE |
| EXP-03 | Experimental; deferred prerequisite reservation | EXPERIMENTAL_ONLY; ref `5077675` | sólo rama exp → `deferredPrerequisiteReservation.ts` → no main wiring | specs experimentales + `exp@5077675:docs/evidence/A3-ORCH-REAL-016*` | EXPERIMENTAL_NOT_MAIN / NOT_APPLICABLE | KNOWN_LIMITATION: opera y poda/repara, pero no alcanza terminal; INVESTIGATE |
| EXP-04 | Experimental; pending completion deadline authority | EXPERIMENTAL_ONLY; ref `5077675` | sólo rama exp → `pendingCompletionDeadlineAuthority.ts` → no main wiring | spec experimental de propagación/ciclos; A3-ORCH-REAL Evidence relacionada | EXPERIMENTAL_NOT_MAIN / NOT_APPLICABLE | No promovida ni integrada en main; INVESTIGATE |

## Detailed capability cards

### Representation, configuration, snapshots and protection (REP-01…REP-05)

**Problema operativo y contrato.** El motor debe recibir un estado diario DB-agnostic, configuración efectiva y restricciones que no dependan de nombres. `EngineInput`, `TaskInput`, `LockInput`, disponibilidades y `PlannerNextIntegrationConfigurationInput` son el límite de entrada (`engine/types.ts`). `buildEngineInput` carga fuentes hard con errores tipados y proyecta settings/assignments (`engine/buildInput.ts::EngineInputSourceLoadError`, `buildEngineInput`). El adapter convierte horas a minutos y el preflight rechaza relaciones o configuración inválidas antes de search (`engine/planner-next/integration/engineInputPreflight.ts::preflightEngineInputForPlannerNext`, `engineInputAdapter.ts::adaptEngineInputToPlannerNextProblem`).

**Fuente de verdad y flujo.** La relación diaria space→zone prevalece explícitamente en `PlanSpaceAvailabilityInput.zoneId`; las autoridades efectivas están inventariadas en `docs/coverage/SPEC11-009-ENGINE-INPUT-SOURCE-CRITICALITY.md` y verificadas para `buildInput` por `SPEC11-010-CHECKPOINT3-BUILDINPUT-AUTHORITY-EVIDENCE.md`. Snapshots assisted serializan identidad/configuración y tareas, mientras revisiones y fingerprints conservan replay (`server/assistedPlanningSnapshot.ts`, `server/assistedPlanningConfigRevision.ts`, migration 077).

**Protección.** Los intervalos efectivos de tareas `done`/`in_progress`, locks y planning existente se convierten en contexto fijo; en assisted, `buildAssistedProblem` exige igualdad estructural del placement y reduce su disponibilidad a un singleton. `executeAssistedPlanning` restaura el placement original y comprueba preservación antes de emitir una propuesta. Esto está cubierto por `effectivePlanResourceAvailability.spec.ts`, `assistedPlanning.spec.ts` y `runPlannerNextProtectedResourceAvailabilityBenchmark.ts`.

**Limitación/recomendación.** Reutilizar el límite y snapshots. Los locks poseen contrato más rico que `Task.availability`; debe verificarse por clase al extender scopes, sin degradar space/resource/full a mera preferencia. Bundles y componentes cargados no prueban wiring al problema.

### Dependencies and coupled work (DEP-01…DEP-05)

**Contrato.** `dependsOnTaskIds` representa N prerequisites y conserva campos legacy sólo por compatibilidad. Planner Next usa `Task.dependencies`; `feederClosure.ts` y los forward checks mantienen cierre y factibilidad. Anchors exigen adyacencia/continuidad, joint groups comparten inicio y las technical chains imponen orden, adyacencia y recursos (`anchoredAccompaniment.ts`, `jointTasks.ts`, `technicalChains.ts`).

**Flujo y Evidence.** Builder resuelve prerequisites por tarea; adapter conserva IDs; preflight detecta desconocidos/ciclos; placement/search respetan dependencias y `validatePlan` contabiliza infracciones. Tests focales son `feederClosure.spec.ts`, `anchoredAccompaniment.spec.ts`, `jointTasks.spec.ts`, `technicalOperations.spec.ts` y `technicalChains.spec.ts`; benchmarks technical/joint y `A2-FULL-023-collective-prerequisite-capacity.json` aportan evidencia de escenarios.

**Assisted y límite.** Sólo dependencies transitivas y miembros de anchors entran automáticamente como supporting. Joint siblings, technical-chain siblings y round peers **no** entran por closure: las políticas se filtran o descartan después. Reutilizar la semántica productiva; extender la proyección, no reconstruir validadores.

### Spaces, main flow, setup and rounds (SPA-01…SPA-06)

Disponibilidades efectivas se derivan en `effectivePlanSpatialAvailability.ts`. `mainFlowPatterns.ts` construye bloques continuos sujetos a preferred end, cardinalidad y key; `secondaryContinuity.ts` gobierna continuidad fuera del main flow. Setup se modela por familia/espacio, reentry prohibido, orden explícito o flexible y preparación entre familias (`setupGrouping.ts`, `exactSetupBlocks.ts`, `setupPreparation.ts`). Rondas sincronizan lanes mientras todas están activas e insertan preparación (`exactRoundSynchronization.ts`).

El adapter es la frontera de wiring y `validatePlan` tiene contadores separados de bloques, continuidad, setup/preparación y round/preparación. Evidence: SPEC10-018 y SPEC10-020, sus benchmarks, `mainFlowPatterns.spec.ts`, `secondaryContinuity.spec.ts` y `roundSynchronization.spec.ts`. Assisted mantiene spaces y policies globales, pero al filtrar tasks puede convertir un contexto global en un problema local distinto; por eso setup y round son `PARTIAL` en esa dimensión.

### Transitions and resources (TRN-01…RES-05)

Participantes y recursos tienen buffers globales; coaches pueden usar matriz dirigida por origen/destino (`engineInputCoachRouteTransitions.ts`, `coachRouteTransitions.ts`). Placement elimina candidatos inviables y validation vuelve a comprobar overlap/transición. SPEC10-019 enlaza el contrato de coach con test, benchmark y Evidence.

Los requisitos por item/tipo/`anyOf` se resuelven en `projectedTaskResources.ts` y los assignments persistidos en `effectiveTaskResourceAssignments.ts`; `Resource` transporta disponibilidad, presencia, concentración, espacio asignado y transición. `resourcePresence.ts` aporta ranking/restricción y sus specs/benchmarks cubren conducta. En cambio, `ResourceItemComponentInput` y `ResourceBundle*Input` existen en `EngineInput`/builder pero no hay campo correspondiente en `PlannerNextProblem`: son datos disponibles antes de la frontera, no capacidad activa del solver. Investigar antes de prometer reutilización.

### Itinerant units, meals and transport (ITI-01…TPT-01)

Las unidades itinerantes tienen identidad y disponibilidad independientes de miembros; adapter asigna una unidad permitida y exact completion trata conflictos (`exactItinerantPlan.ts`, `itinerantUnits.spec.ts`). A2-FULL-005 y los exact-itinerant benchmarks prueban el camino.

Las comidas son capacidades diferentes: break global, política de espacio, obligaciones de participante, recursos físicos, unidad itinerante y pausa operacional flexible (`participantMeals.ts`, `spaceMeals.ts`, `executePlannerNext.ts` / `exactItinerantPlan.ts`, `itinerantUnitMeals.ts`, `operationalMeals.ts`). Cada una posee salida scheduled y contador de validation propio. Los fixtures SPEC10-013R/014/015 y benchmarks asociados evitan inferir una modalidad a partir de otra.

Transport arrival/departure usa IDs explícitos, target/max, gap y peso (`transportGrouping.ts`). Es agrupación integrada en exact standalone y validation, no un solver logístico completo. En assisted los IDs se filtran al scope, por lo que pierde grupos futuros: reutilizar policy/validator, extender contexto.

### Search, validation, diagnostics and determinism (SRCH-01…VAL-05)

`resolvePlannerSearchPolicy` detecta capabilities y rechaza combinaciones incompatibles antes de ejecutar. `executePlannerNext` enruta a compatibility-preserving o exact constructive (`executePlannerNext.ts::executePlannerNext`). Exact separa main+feeder core y completion itinerante, usa ledger limitado, backtracking, backjump certificado, matching residual/incremental, domains analíticos, macro constrainedness y forward checks (`exactMainAndFeederCore.ts`, `exactItinerantPlan.ts`, `futureFeasibility.ts`, `macroPendingPrerequisiteForwardCheck.ts`).

`preflight` comprueba forma del problema y `validatePlan` recalcula hard constraints, producing counters/reason codes (`validate.ts`). Orden canónico y `fingerprint` sostienen reproducibilidad; `branchHistoryInvariance.spec.ts` verifica independencia de historia. El diagnóstico causal conserva waterfall, rejections, eliminaciones de dominio y colisiones de autoridad (`ExactCoreCausalDiagnostic`) y assisted lo expone sin convertirlo en decisión humana.

Los benchmarks son pruebas ejecutables de escenarios, no garantía universal. La autoridad de cobertura Focal A2 está en `coverage/focalA2CapabilityCatalog.ts`, bindings/registry y `docs/evidence/SPEC10-012R-focal-a2-capability-audit.json`. Reutilizar search/validation; no duplicarlos en una capa assisted.

### Assisted Planning (AST-01…AST-06)

`createPlanningScope` valida selector/IDs, ordena y congela el contrato. `buildAssistedProblem` clona el source (input inmutable), calcula closure limitada, fija placements y retiene el problema original para validación. `executeAssistedPlanning` simula, exige completitud del scope y validez required del search, devuelve a lo sumo una propuesta y Evidence/fingerprint; no consolida.

Migration 077 crea revisiones, sessions, stages inmutables, validations y exceptions con RLS/privilegios; mapping/snapshot/storage specs prueban los bordes. Migration 078 y `assistedPlanningService.ts` implementan bootstrap, patch, validation, accept y navegación con fingerprints, base-stage checks, locks transaccionales y aplicación atómica. ASST-005 permanece `PENDING_PR`: ninguna capacidad de ese PR se atribuye a este SHA.

## Assisted Scope Projection Audit

| Capacidad | Full problem | Scope projection | Protected context | Future analytic context | Riesgo |
|---|---|---|---|---|---|
| Tareas del scope | Todas las tasks | IDs resueltos permanecen variables | Si también protected, el singleton manda | No necesita tareas ajenas salvo interacciones | Bajo |
| Dependencies | Grafo completo | Closure transitiva se añade como supporting | Prerequisite protected permanece fijo | Dependientes futuros no se incluyen | **Alto:** una tarea posterior puede perder su ventana/recurso |
| Anchored accompaniment | Grupos completos | Cualquier miembro arrastra grupo completo | Miembros aceptados quedan fijos | Otros anchors no relacionados desaparecen | Bajo dentro del grupo; medio entre grupos por recursos |
| Joint groups | Todos los siblings | No hay closure; sólo quedan IDs ya incluidos | Sibling protected sólo si fue entregado | Siblings futuros ausentes | **Alto:** sincronización local puede desaparecer o reducirse |
| Technical chains | Cadena completa | Policy sólo sobrevive si están todos sus IDs | Miembros protected no completan closure por sí solos | Resto de cadena futura ausente | **Alto:** se pierde orden/continuidad técnica |
| Round synchronization | Todas las lanes/tasks | Se filtran task IDs y lanes vacías | Peers protected sólo si se pasaron | Rondas posteriores/lane capacity ausentes | **Alto:** cambia la geometría de sincronización |
| Main flow | Todas las tasks y policy | Policy global queda, tasks ajenas desaparecen | Main placements protected consumen capacidad | Bloques/keys futuros ausentes | **Alto:** el scope local elimina continuidad y límites futuros |
| Setup | Familias de todas las tasks por space | Space policy queda; familias sin tasks no generan bloque | Setup histórico sólo indirectamente por tasks fijas | Entradas/reentry/preparación futuras ausentes | **Alto:** orden local factible puede bloquear familia futura |
| Participant/coach transition | Itinerarios completos | Sólo personas/tasks retenidas | Placements retienen intervalos y personas | Siguiente/anterior tarea futura ausente | **Alto:** no reserva transición hacia trabajo futuro |
| Resource overlap/transition/presence | Demanda completa | Catálogo de recursos queda; demanda de tasks filtradas desaparece | Assignments de protected consumen recurso | Demanda futura y concentración futura ausentes | **Alto:** selección local puede ocupar el único intervalo útil futuro |
| Itinerant units | Unidades y tareas completas | Unidades globales quedan; tareas filtradas | Placements consumen composición | Obligaciones/availability pressure futuras ausentes | Alto |
| Participant meals | Todas las obligations | Sólo meals cuyo `sourceTaskId` quedó incluido | Fixed meal sólo si su source quedó | Meals de tareas futuras desaparecen | Alto |
| Resource meals | Todas permanecen sin filtro explícito | Se conservan globalmente | Intervalos siguen bloqueando recursos | Contexto preservado | Bajo/medio; confirmar IDs de resources recompuestos |
| Itinerant-unit meals | Todas permanecen sin filtro explícito | Se conservan globalmente | Intervalos siguen bloqueando unidad | Contexto preservado | Bajo |
| Operational meals | Todas permanecen sin filtro explícito | Se conservan globalmente | Recursos/espacios siguen bloqueados | Contexto preservado | Bajo |
| Transport | Grupos completos arrival/departure | `taskIds` filtrados a incluidos | Transport protected sólo consume como task | Miembros futuros del grupo desaparecen | **Alto:** target/grouping deja de representar producción |
| Spaces/availability | Autoridad completa | Se conserva completa | Ocupación sólo por included/protected | Demanda futura por espacio ausente | Alto |
| Search budget/policy | Configuración completa | Se conserva sin escalar por scope | N/A | Budget no anticipa scopes posteriores | Medio |
| Validation | Problema completo | `originalValidationProblem` es original **proyectado**, no full source | Valida los protected entregados | No ve tareas filtradas | **Alto:** `hardValid` no prueba extensibilidad al plan completo |

**Hallazgo central.** `buildAssistedProblem` protege exactamente lo aceptado que recibe y cierra prerequisites/anchors, pero no construye una envolvente analítica de obligaciones futuras. El riesgo “el scope local elimina una interacción futura que producción necesitaría considerar” está demostrado por los filtros de tasks, joint/chain/round/transport/meals y por validar contra el problema ya proyectado (`engine/planner-next/assistedPlanning.ts::buildAssistedProblem`). Este catálogo no corrige el gap.

## Capability reuse by assisted roadmap

> La secuencia ASST-005…011 procede de la Fuente oficial de reenfoque; el árbol auditado sólo demuestra qué piezas de `main` pueden reutilizarse y qué implementación sigue pendiente. La tabla es un mapa de reutilización técnica conservador, no una redefinición de sus acceptance criteria. ASST-005 sólo puede marcarse `PENDING_PR` hasta que #899/#902 entren en `main`.

| Milestone | Reutilizar | Gaps demostrados en main | No reconstruir |
|---|---|---|---|
| ASST-005 (`PENDING_PR`) | `PlanningScope`, projection, assisted Evidence, snapshots/service | Implementación pendiente fuera de `main`; no atribuir wiring productivo hasta merge | Planner Next, validator, persistence ASST-004 |
| ASST-006 | protected placements, effective fixed intervals, fingerprints | Falta envolvente de interacciones futuras | Semántica de locks/status ni canonicalización |
| ASST-007 | dependency/anchor closure y causal diagnostics | joint/technical/round closure incompleta | Validadores de dependencies/coupled work |
| ASST-008 | exact core, budgets, matching, forward checks | Forward checks sólo ven problema proyectado | Search exact ni ledger de Evidence |
| ASST-009 | setup/main-flow/transition/resource authorities | Demanda y continuidad futura se filtran | Policies de setup/presence/transición |
| ASST-010 | meal/itinerant/transport schedulers y validators | participant meal y transport pierden miembros futuros | Modelos de comida ni transport grouping |
| ASST-011 | immutable stages, validation freshness, accept/undo/redo | Accepted exceptions están persistidas pero aceptación 078 exige cero HARD/REQUIRED | Transacciones, RLS, snapshot apply ni validation |

## Capability Debt Register

Sólo se registran deudas observables en código/tests/Evidence; ausencia de evidencia por sí sola se marca investigación, no fallo.

| capability | symptom | evidence | impact | nearest milestone | recommended action |
|---|---|---|---|---|---|
| Assisted future context | Full-source tasks se eliminan antes de search y validation | `assistedPlanning.ts::buildAssistedProblem`; `originalValidationProblem` se clona después del filtrado | Propuesta local hard-valid puede no ser extensible | ASST-006/007 | Diseñar contexto analítico explícito sin volver variables las tareas futuras |
| Joint/technical closure | Sólo dependency/anchor generan supporting; joint/chain policy puede reducirse/desaparecer | filtros en `buildAssistedProblem`; assisted specs no declaran closure de estos grupos | Se pierde acoplamiento requerido | ASST-007 | Extender closure conforme a autoridad productiva y añadir Evidence focal |
| Round projection | IDs y lanes se recortan | mapping/filter de `roundSynchronizations` en `buildAssistedProblem` | Sincronización distinta del full problem | ASST-007/009 | Definir peers supporting/protected vs analytic-only |
| Setup/main flow future pressure | Policies sobreviven pero las tareas futuras no | filtro global de `problem.tasks`; setup/main-flow implementations consumen sólo tasks presentes | Orden/bloques locales pueden cerrar una extensión | ASST-009 | Añadir certificado o reserva futura; no suavizar hard policies |
| Participant meals | Meals filtradas por source task incluida | filtro de `participantMeals` en `buildAssistedProblem` | Capacidad/ventana futura invisible | ASST-010 | Proyectar obligaciones futuras como contexto analítico |
| Transport grouping | Arrival/departure IDs se filtran | mutación explícita de ambos `taskIds` | Target de grupo local deja de representar el grupo diario | ASST-010 | Preservar miembros como supporting/analytic según contrato |
| Resource bundles/components | Datos existen antes del adapter pero no en `PlannerNextProblem` | `engine/types.ts::ResourceBundle*`, ausencia en `contracts.ts` | No pueden considerarse capacidad solver activa | ASST-009 | Investigar autoridad y wiring mínimo; no inferir bundles por nombre |
| Accepted exceptions | Tabla permite HARD/REQUIRED aceptadas; accept RPC exige contadores cero | migrations 077/078 | Semántica de excepción no participa aún en consolidación | ASST-011 | Alinear sólo con contrato aprobado y mantener trazabilidad |
| One-click experimental failure | El gate no sobrevive y no alcanza hoja core ni post-core | `exp@5077675:docs/evidence/A3-ORCH-REAL-025-final-one-click-core-feeding.md` (`FAIL` / `NO` / `NO`) | No existe capacidad one-click promovible | post-roadmap | Rediseñar o retirar; nunca presentar como productivo |
| Deferred prerequisite reservation | Reserva estructural exclusiva de la rama experimental | `exp@5077675:engine/planner-next/deferredPrerequisiteReservation.ts`; `exp@5077675:docs/evidence/A3-ORCH-REAL-016*` | No existe en `main` | post-roadmap | Auditar/portar sólo mediante contrato y PR propios |
| Pending completion deadline authority | Autoridad de deadline exclusiva de la rama experimental | `exp@5077675:engine/planner-next/pendingCompletionDeadlineAuthority.ts`; `exp@5077675:docs/evidence/A3-ORCH-REAL-016*` | No existe en `main` | post-roadmap | Mantener experimental hasta Evidence de integración productiva |

## Experimental / no-main boundary

La auditoría del ref `codex/implementar-cambios-para-full-a2` @ `5077675d76f24c088b3e9961dc71cb75635d07bd` separa dos clases:

- **Exclusivas del ref experimental:** EXP-03 `exp@5077675:engine/planner-next/deferredPrerequisiteReservation.ts` y EXP-04 `exp@5077675:engine/planner-next/pendingCompletionDeadlineAuthority.ts`, con Evidence `exp@5077675:docs/evidence/A3-ORCH-REAL-016*`. No existen en `main`; por tanto no son autoridad, wiring ni capacidad productiva.
- **Versiones experimentales de capacidades ya presentes en main:** cambios de exact core/completion, presence policy y residual-obligation ordering. Sus autoridades productivas siguen siendo `exactMainAndFeederCore.ts`, `exactItinerantPlan.ts`, `resourcePresence.ts` y el policy gate de `main`; el sufijo `Experiment` y los manifests históricos no elevan su estado.
- **Fallo conocido one-click:** `exp@5077675:docs/evidence/A3-ORCH-REAL-025-final-one-click-core-feeding.md` registra `ONE_CLICK_SURVIVAL_GATE = FAIL`, `CORE_COMPLETE_LEAF = NO` y `POST_CORE_REACHED = NO`. EXP-01 queda `KNOWN_BROKEN`, no `UNVERIFIED`, y no debe promoverse ni describirse como productivo.

PR #899 y su corrección apilada #902 permanecen `PENDING_PR`; tampoco elevan estados de `main`.

## Completeness and duplication review

La revisión cruzó: contrato/config/snapshots/locks/status; dependency y operaciones acopladas; spaces/main/setup/continuity/rounds; transiciones; recursos y alternativas/bundles; itinerancia; seis modalidades de breaks/meals; transporte; policy/budget/exact/backtracking/backjump/matching/forward/pruning; preflight/validation/reason codes/diagnóstico/Evidence/determinismo; assisted/persistencia; y experimental. Capacidades parecidas se mantuvieron separadas cuando sus contratos y validadores lo están (especialmente meals, transitions y coupled work); componentes/bundles no se fusionaron con assignments porque su wiring difiere.