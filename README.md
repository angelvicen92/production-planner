# Production Planner

Proyecto conectado a GitHub y gestionado con Codex.

## Cómo actualizar Replit desde GitHub

Después de hacer merge en GitHub, hay que ejecutar `git pull` en Replit para traer los cambios más recientes.

## i18n (preparación)

La app inicializa i18n en `client/src/i18n/index.ts` con español (`es`) por defecto y fallback a inglés (`en`).

Para probar un cambio de idioma manualmente desde consola del navegador (sin selector UI todavía):

```js
import('/src/i18n/language.ts').then(({ setLanguage }) => setLanguage('en'))
```

## Historial de cambios Codex

- ID 001 — 2026-05-26 18:33 — Auditoría base, tests y trazabilidad del proyecto
- ID 002 — 2026-05-26 18:46 — Auditoría y cierre integral de RLS en tablas públicas Supabase
- ID 003 — 2026-05-30 16:21 — Auditoría profunda del motor V3, rutas reales y falsos negativos
- ID 004 — 2026-05-30 18:05 — Benchmark operativo del motor V3 y escenarios críticos de planificación
- ID 005 — 2026-05-30 19:20 — Backtracking limitado para evitar falsos negativos greedy en Motor V3
- ID 006 — 2026-05-30 20:05 — Diagnóstico estructurado de blockers y activación real de backtracking en Motor V3
- ID 007 — 2026-05-30 20:45 — Evaluación comparativa de ramas y selección de mejor solución operativa en Motor V3
- ID 008 — 2026-05-30 21:25 — Dataset operativo sintético realista y stress benchmark del Motor V3
- ID 009 — 2026-05-30 22:10 — Priorización operativa de talents restrictivos y continuidad de coaches/feeders en Motor V3
- ID 010 — 2026-05-30 23:05 — Vecindarios operativos acotados para mejorar planes completos en Motor V3
- ID 011 — 2026-05-30 23:40 — Alineación de scoring y métricas para validar mejoras reales del Motor V3
- ID 012 — 2026-05-30 23:55 — Escenario realista anonimizado tipo La Voz para validar inteligencia operativa del Motor V3
- ID 013 — 2026-05-30 23:59 — Vecindarios feeder-aware para Main Stage, coaches y talents restrictivos en Motor V3
- ID 014 — 2026-05-30 23:59 — Búsqueda local de profundidad 2 para encadenar vecindarios feeder-aware en Motor V3
- ID 015 — 2026-05-30 23:59 — CP-SAT pilot para subproblema Main Stage + feeders en Motor V3
- ID 016 — 2026-05-30 23:59 — Segmentación CP-SAT por bloques críticos de Main Stage en Motor V3
- ID 017 — 2026-05-30 23:59 — Diagnóstico operativo de recursos compuestos en Motor V3 sin cambios DB
- ID 018 — 2026-05-30 23:59 — Modelo DB aditivo de resource bundles y componentes
- ID 019 — 2026-05-30 23:59 — Resource bundles como señal soft no vinculante en Motor V3
- ID 020 — 2026-05-31 00:20 — Validador de resource bundles y contrato de fiabilidad para scoring soft
- ID 021 — 2026-05-31 00:40 — Motor Run Diagnostics API y persistencia ligera de metadata
- ID 022 — 2026-05-31 01:05 — Panel Admin de diagnóstico del motor por plan
- ID 023 — 2026-05-31 01:25 — Export/copy de diagnóstico del motor para revisión externa
- ID 024 — 2026-05-31 01:45 — Guía de validación real del motor y checklist de prueba en app
- ID 025 — 2026-05-31 02:05 — Optimización de scripts rápidos/completos de tests y benchmarks del Motor V3



- ID 139 — 2026-06-27 14:52 — ORC Search Space Selection Engine v1
- ID 151 — 2026-06-27 18:54 — ORC Production Objective Evaluator v1
- ID 152 — 2026-06-27 19:05 — ORC Evaluation-Guided Search v1
- ID 153 — 2026-06-27 19:50 — ORC Online Search Learning v1
- ID 154 — 2026-06-27 20:03 — ORC State Equivalence & Transposition Table v1
- ID 155 — 2026-06-27 20:23 — ORC Dominance Pruning v1
- ID 156 — 2026-06-27 20:41 — ORC Operational Criticality Model v1
- ID 157 — 2026-06-27 20:54 — ORC Criticality-Driven Reasoning Budget v1

- ID 173 — 2026-06-28 11:14 CEST — ORC Improvement-Driven Search Calibration v1
- ID 174 — 2026-06-28 12:05 CEST — ORC Evidence-Driven Optimization Cycle v1
- ID 175 — 2026-06-28 12:20 CEST — ORC Evidence-Gated Development Workflow v1
- ID 176 — 2026-06-28 12:39 CEST — ORC Benchmark CLI Operational Evidence v1
- ID 177 — 2026-06-28 13:58 CEST — ORC Opportunity Cost Estimator v1
- ID 179 — 2026-06-28 15:18 CEST — ORC Recovery Potential Estimator v1
- ID 180 — 2026-06-28 15:27 CEST — ORC Operational Reasoning Score v1
- ID 183 — 2026-06-28 17:15 CEST — ORC Operational Trade-off Analyzer v1
- ID 181 — 2026-06-28 15:56 CEST — ORC Goal-Oriented Search v1
- ID 182 — 2026-06-28 16:19 CEST — ORC Progressive Commitment Strategy v1
- ID 186 — 2026-06-28 20:11 CEST — ORC Active V4 Bridge v1
- ID 188 — 2026-06-29 UTC — ORC Activation Report v1
- ID 189 — 2026-06-29 UTC — ORC Best Candidate Trace v1
- ID 190 — 2026-06-29 UTC — ORC Active Candidate Planning Output v1
- ID 197 — 2026-06-30 UTC — ORC Hard Validation for Assignment Simulations v1
- ID 198 — 2026-06-30 UTC — ORC Benchmark Memory Budget & Real Scenario Stabilization v1
- ID 199 — 2026-06-30 UTC — ORC Baseline Preservation Candidate v1
- ID 200 — 2026-06-30 UTC — ORC Candidate Hard Prefilter v1
- ID 201 — 2026-06-30 UTC — ORC Benchmark V4-Seeded Shadow Alignment v1
- ID 202 — 2026-06-30 UTC — ORC Benchmark Active-Equivalent Fallback Semantics v1
- ID 203 — 2026-06-30 UTC — ORC Benchmark Active-Equivalent Final Metrics Normalization v1
- ID 204 — 2026-06-30 UTC — ORC Baseline Safety Candidate for Active Search Spaces v1
- ID 205 — 2026-06-30 UTC — ORC Baseline Seed Hard-Feasibility Audit v1
- ID 206 — 2026-06-30 UTC — ORC Hard Violation Diagnostics & Constraint Alignment Report v1
- ID 207 — 2026-06-30 UTC — ORC Scoped Protected Break Validation & Stratified Diagnostics v1
- ID 208 — 2026-06-30 UTC — ORC Strict V4 Baseline Seed Isolation v1
- ID 209 — 2026-06-30 UTC — ORC Executable Main Flow Gap Closure Candidate v1
- ID 210 — 2026-06-30 UTC — ORC Main Flow Active Readiness & Non-Work Break Semantics v1
- ID 211 — 2026-07-01 UTC — ORC Active Configuration & Operational Role Contract v1
- ID 212 — 2026-07-01 UTC — ORC Baseline Viability Semantics: Meal Window, Non-Work Roles & Space Occupancy v1
- ID 213 — 2026-07-01 UTC — ORC MealMode Contract Alignment v1
- ID 214 — 2026-07-01 UTC — ORC Transport Template Occupancy Contract & Pre-existing Overlap Isolation v1
- ID 215 — 2026-07-01 UTC — ORC Active Transport Contract Wiring & Seed Role Reclassification v1
- ID 216 — 2026-07-01 UTC — ORC Validation Transport Role Propagation v1
- ID 217 — 2026-07-01 UTC — ORC Baseline Productive Space Overlap Repair Candidate v1
- ID 218 — 2026-07-01 UTC — ORC Baseline Repair Lineage & Active Gate Unblocking v1
- ID 219 — 2026-07-01 UTC — ORC Baseline Space Overlap Repair Safe Variants & Repair Acceptance Policy v1
- ID 220 — 2026-07-01 UTC — ORC Baseline Repair Audit Source-of-Truth & Transport-Aware Pair Selection v1
- ID 221 — 2026-07-02 UTC — ORC Baseline Repair Runtime Audit Wiring & Summary Contract v1
- ID 222 — 2026-07-02 UTC — ORC Baseline Repair Runtime Invariant & Late Audit Repair Pass v1
- ID 223 — 2026-07-02 UTC — ORC Active Valid Repair Selection & Late Pass Lineage v1
- ID 224 — 2026-07-02 UTC — ORC Active Hard-Feasibility Repair Preflight & Runtime Export Contract v1


### ORC Hard Validation for Assignment Simulations v1 (ID 197)

`ValidationEngine` now accepts `ASSIGNMENT_APPLICATION_SHADOW` simulations and validates them through deterministic hard constraints instead of rejecting them by mode. The first hard-validation scope covers structural integrity, time windows, hard meals/breaks, locks, protected `done`/`in_progress` tasks, resource overlaps, space capacity/exclusivity, contestant/team overlaps, and direct dependencies. Validation evidence is read-only, records `validationScope: "hard-constraints-v1"`, and does not introduce soft scoring.

`runORCActivePlanner` no longer uses `applyLocalScheduleMove` as a post-pipeline activation path. A result marked `usedEngine: "orc"` must now come from a selected ORC `SimulatedState` with materialized planning changes, a `VALID` validation result, and all activation gates passing. If ORC produces a valid equivalent baseline it is reported as `orc_baseline_preserved`; otherwise V4 remains the safe fallback. This change does not modify DB, RLS, UI, V3, or V4.

### ORC Benchmark Memory Budget & Real Scenario Stabilization v1 (ID 198)

- Fecha UTC: 2026-06-30.
- Causa encontrada: el OOM del benchmark ORC en `real-voice-audition-day` no nacía en DB, UI, RLS, V3 ni V4; el origen era combinatorio dentro del razonamiento ORC shadow. `PartialPlanComposer` generaba todas las combinaciones de candidatos (`2^n`) y después `GlobalSolutionAssembler` volvía a combinar todos los Partial Plans, multiplicando evidence y objetos intermedios hasta agotar heap en el escenario real.
- Límites aplicados: la composición de Partial Plans queda acotada por defecto a 20 planes y 50 descartes detallados; el ensamblado de Global Solutions queda acotado por defecto a 20 soluciones y 50 descartes detallados. Estos límites son deterministas, no cambian la planificación oficial y respetan el presupuesto operativo recomendado para candidatos/simulaciones en escenarios grandes.
- Evidence resumida/truncada: los descartes que superan presupuesto se agregan mediante evidence de presupuesto (`partial-plan-budget-applied` y `global-solution-budget-applied`) con conteos, límites, composiciones inspeccionadas y overflow de descartes, en lugar de emitir cada combinación completa.
- Trazabilidad conservada: se mantienen ids de candidatos, ids de Partial Plans aceptados, conteos oficiales, métricas ORC/V4, explicaciones de delta, summaries de presupuesto y evidencia detallada para las primeras entradas ordenadas de forma determinista.
- `real-voice-audition-day` sigue incluido en la suite oficial y ahora se valida con tests de presupuesto/determinismo y ejecución de benchmark del escenario completo.
- Sin cambios DB, RLS, UI, V3 ni V4. El benchmark ORC vuelve a ser el juez obligatorio antes de añadir nuevas capacidades de planificación ORC.

### ORC Baseline Preservation Candidate v1 (ID 199)

ORC now can preserve a complete V4-seeded baseline as its own explicit result when there are no improvement opportunities or search spaces. The internal `PRESERVE_BASELINE` candidate is read-only, carries `baselinePreservation: true`, does not include assignments, and does not alter schedules, resources, spaces, locks, or protected tasks.

The baseline preservation candidate traverses the official ORC pipeline: SEE / Candidate Generation, Transformation, Simulation, Validation, Evaluation, Commit, and Evidence. Its simulation remains `READ_ONLY_BASELINE`; its planning materialization source is `baseline_seed_preserved`; and its changed task count is `0`. `usedEngine: "orc_baseline_preserved"` therefore no longer depends on artificial opportunities being present.

`v4_fallback` is reserved for real extraction, execution, validation, or gate failures. This change does not modify DB, RLS, UI, V3, or V4.

### ORC Candidate Hard Prefilter v1 (ID 200)

SEE ahora descarta candidatos obviamente inviables antes de Simulation mediante `prefilterCandidatesByHardConstraints`. El prefiltro es determinista, read-only y cubre integridad básica de assignments, locks, tareas protegidas, tiempos, `workDay`, comidas/breaks hard, solapes simples de contestant/equipo itinerante/recurso/espacio y dependencias directas.

Validation Engine sigue siendo la autoridad final: el prefiltro sólo evita gastar presupuesto de simulación en candidatos imposibles y ataca la prioridad benchmark `conflicts`, sin puntuar candidatos, sin consolidar planificación y sin relajar hard constraints. Su `planningInfluence` es `candidate-filtering-only`; no cambia la planificación oficial ni introduce nuevas estrategias de planificación.

No hay cambios DB, RLS, UI, V3 ni V4. El candidato `PRESERVE_BASELINE` y los candidatos abstractos/read-only siguen pasando por el pipeline oficial sin ser descartados.

### ORC Benchmark V4-Seeded Shadow Alignment v1 (ID 201)

El Operational Delta Benchmark oficial de ORC ahora alinea su medición con ORC Active: primero ejecuta V4 para producir un baseline seguro, después construye un V4 baseline seed serializable para ORC, y finalmente mide ORC Shadow sobre ese input seeded. Por tanto, `metrics.orc` y los deltas oficiales comparan V4 contra el comportamiento operativo real de ORC sobre el baseline V4, no contra una planificación cruda/manual distinta.

Raw ORC Shadow se conserva como `rawShadowDiagnostics` para diagnóstico técnico de escenarios crudos, pero no decide el delta principal ni la recomendación de siguiente acción. Así, `conflicts` ya no puede quedar contaminado por invalids del input crudo/manual; si sólo falla raw shadow, se reporta como alerta diagnóstica, y si falla el seeded shadow, se reporta como fallo operativo ORC comparable.

`real-voice-audition-day` sigue incluido en la suite oficial. El benchmark continúa siendo read-only y determinista, no relaja hard constraints y no modifica DB, RLS, UI, V3, V4, endpoints, Validation Engine, CandidateHardPrefilter, heurísticas SEE ni el pipeline ORC.


### ORC Benchmark Active-Equivalent Fallback Semantics v1 (ID 202)

El Operational Delta Benchmark oficial de ORC ya no usa `simulatedStates[0]` cuando el seeded shadow no produce un commit válido. `OperationalDeltaReport.officialOrcOutcome` clasifica el resultado active-equivalent como `orc`, `orc_baseline_preserved` o `v4_fallback`, y sólo un simulated state validado (`ValidationResult: VALID`) y consolidado por una decisión `COMMIT` puede alimentar `metrics.orc`.

Si ORC seeded shadow no produce commit válido —por ausencia de simulaciones, commits o por candidatos inválidos/rechazados— el benchmark replica ORC Active y mide `v4_fallback`: las métricas oficiales de resultado final ORC quedan equivalentes a V4 para makespan, permanencia, continuidad, conflictos y calidad de planificación. Los deltas oficiales dejan de penalizar a ORC por simulaciones inválidas no consolidadas.

Raw shadow y seeded shadow se conservan como evidencia separada mediante `rawShadowDiagnostics` y `seededShadowDiagnostics`. Esos diagnostics exponen candidatos, candidate states, simulaciones, valid/invalid counts, commit count, violation summary y overhead exploratorio con `planningInfluence: "none"`, pero no sustituyen el resultado operativo oficial.

Evidence Gate y las recomendaciones ya no deben autorizar optimizaciones por `candidatesConsolidated`, `conflicts`, makespan, permanencia, continuidad o planning quality cuando esos deltas sólo procedían de simulaciones inválidas no consolidadas. Si un fallo seeded shadow requiere análisis futuro, queda documentado como diagnóstico separado, no como señal automática de prioridad.

No hay cambios DB, RLS, UI, V3, V4, endpoints, Validation Engine, CandidateHardPrefilter ni nuevas heurísticas SEE. No se relajan hard constraints, no hay movimientos post-pipeline y `real-voice-audition-day` sigue incluido en la suite oficial.

### ORC Benchmark Active-Equivalent Final Metrics Normalization v1 (ID 203)

El Operational Delta Benchmark separa explícitamente métricas de resultado final (`makespan`, permanencia, continuidad, utilización, conflictos, dependencias y `operationalPlanningQuality`) de métricas de exploración/coste (`simulations`, candidatos, commits y tiempos). Esta separación evita que el coste interno de razonamiento ORC parezca una degradación de planificación.

Si `officialOrcOutcome.kind` es `orc_baseline_preserved` o `v4_fallback`, producción recibe el mismo plan active-equivalent que V4; por tanto, las métricas finales ORC se normalizan a V4 y sus deltas finales quedan a cero. El bloque `activeEquivalentMetricNormalization` documenta si la normalización se aplicó, el motivo, las métricas finales normalizadas y las métricas exploratorias preservadas.

Raw shadow y seeded shadow siguen conservados como diagnostics separados: muestran candidates, simulated states, valid/invalid counts, overhead y violation summaries del trabajo interno ORC, pero esos diagnostics no contaminan las métricas oficiales de resultado final ni maquillan fallos seeded shadow.

`operationalPlanningQuality` ya no puede generar una prioridad alta por diferencias de contexto entre input original y seed cuando ORC preserva baseline o cae a fallback; Evidence Gate sólo puede autorizar mejoras de planificación final si existe un commit ORC real con cambios validados. El overhead computacional puede seguir apareciendo como señal diagnóstica o prioridad baja sin desplazar mejoras de planificación reales.

No hay cambios DB, RLS, UI, V3, V4, endpoints, Validation Engine ni CandidateHardPrefilter. No se relajan hard constraints, no se modifica el pipeline ORC, no se añaden heurísticas SEE ni movimientos post-pipeline, y `real-voice-audition-day` sigue incluido en la suite oficial.

### ORC Baseline Safety Candidate for Active Search Spaces v1 (ID 204)

ORC ahora genera un `PRESERVE_BASELINE_SAFETY` lógico junto a los candidatos de mejora cuando existen search spaces seleccionados y el seed V4 contiene planificación baseline. Este candidato es read-only, usa `baselinePreservation: true` y `baselineSafetyCandidate: true`, no contiene assignments y no modifica horarios, espacios, recursos, locks ni tareas protegidas.

El baseline safety candidate no consume presupuesto global de candidatos de mejora ni límite de preselection: se añade después del hard prefilter y de la preselección de candidatos estratégicos para no desplazar mejoras reales. En composición se evalúa como Partial Plan standalone con `baselineSafetyPartialPlan: true`, `compatibilityScore: 1` e impacto operativo esperado `0`, y queda excluido de combinaciones con candidatos de mejora.

Si todos los candidatos de mejora fallan o no consolidan pero el baseline seed valida, ORC puede preservar el baseline dentro del pipeline oficial y reportar `orc_baseline_preserved` en vez de caer innecesariamente a `v4_fallback`. Si el baseline safety falla validación, no se fuerza el resultado y se mantiene el fallback seguro con diagnostics.

Los invalids de mejora siguen visibles en diagnostics y evidence; la nueva evidence `baseline-safety-candidate-generated` y `baseline-safety-partial-plan-composed` explica que la preservación de baseline es una decisión de seguridad, no una mejora. No hay cambios DB, RLS, UI, V3, V4, endpoints ni Validation Engine; no se relajan hard constraints, no se cambia el pipeline ORC, no se añaden heurísticas de planificación y `real-voice-audition-day` sigue incluido en la suite oficial.


### ORC Baseline Seed Hard-Feasibility Audit v1 (ID 205)

ORC Active y el Operational Delta Benchmark ahora auditan explícitamente si el V4 baseline seed que recibe ORC es hard-feasible según ORC Validation antes de interpretar fallos como problemas de candidatos, commits o exploración. La auditoría `auditORCBaselineSeedHardFeasibility` construye `OperationalState` desde el seed, evalúa un baseline preservation candidate standalone a través del pipeline oficial, y expone un resumen serializable sin snapshots completos.

Si el seed no valida, el fallback reason active-equivalent pasa a ser explícito: `baseline_seed_hard_infeasible`. El benchmark conserva invalids, violation summaries y overhead como diagnostics, pero no autoriza optimización de candidatos como siguiente paso principal si el bloqueo real es la hard-feasibility del seed base.

No hay cambios DB, RLS, UI, V3 ni V4. No se relajan hard constraints, no se cambia el pipeline ORC, no se fuerza baseline preservation si el seed no valida y `real-voice-audition-day` sigue incluido en la suite oficial.

### ORC Hard Violation Diagnostics & Constraint Alignment Report v1 (ID 206)

`ValidationResult` ahora incluye `violationDetails`: detalles hard acotados, deterministas y serializables que exponen códigos, grupos de constraint, tareas, ventanas de tiempo, espacios, recursos, locks, dependencias y breaks afectados sin incluir snapshots completos ni objetos pesados. `violatedConstraints` se mantiene como resumen compatible, mientras la evidence `simulated-state-validated` publica sólo una muestra bounded de detalles con `validationScope: "hard-constraints-v2-diagnostics"`.

La auditoría `auditORCBaselineSeedHardFeasibility` consume esos detalles para derivar `affectedTaskIds` desde violaciones reales, mostrar `violationDetailsSample`, contar truncamiento y ordenar `dominantViolationCodes` de forma determinista. El Operational Delta Benchmark añade `baselineSeedConstraintAlignment`, un informe read-only y de influencia diagnóstica que conserva categorías conservadoras de posible causa raíz —V4 output, adapter V4→ORC, fixture o semántica ORC Validation— sin afirmar una causa única ni autorizar optimización automática.

No se relajan hard constraints, no se cambia V4, DB, RLS, UI, endpoints ni el pipeline ORC, y no se modifica la planificación oficial. El objetivo de ID 206 es diagnóstico y alineación de constraints, no optimización; `real-voice-audition-day` sigue incluido en la suite oficial para conservar evidencia sobre dependencias, protected breaks y solapes de espacio cuando aparezcan.

### ORC Scoped Protected Break Validation & Stratified Diagnostics v1 (ID 207)

ORC Validation y `CandidateHardPrefilter` ahora aplican `protectedBreaks` según su scope operativo real: `spaceId` sólo bloquea tareas planificadas en ese espacio, `contestantId` sólo bloquea tareas de ese concursante, `itinerantTeamId` sólo bloquea tareas de ese equipo itinerante y `resourceId`/`resourceItemId`/`resourceIds` sólo bloquean tareas que usan esos recursos asignados. Los `protectedBreaks` sin scope explícito sólo actúan como global hard breaks cuando están marcados como `hard`, `isHard`, `hardConstraint`, `kind: "protected"` o `kind: "global"`; los breaks globales, `meal`, `actualMeal`, `mealWindow` y `globalHardBreaks` siguen siendo hard globales.

Los detalles de `PLANNING_CROSSES_PROTECTED_HARD_BREAK` incluyen scope accionable, IDs relevantes y `diagnosticHint` para distinguir breaks scoped de globales sin incluir objetos completos. Además, la auditoría de baseline seed y el benchmark usan muestras estratificadas por código de `violationDetails` (`sampleStrategy: "stratified_by_violation_code"`) para que familias numerosas como `DIRECT_DEPENDENCY_BROKEN` no oculten `SPACE_OVERLAP`, protected breaks u otros blockers minoritarios; `dominantViolationCodes` se calcula por conteo real de detalles y excluye sentinels de truncamiento.

No se relajan hard constraints, no se cambia V4, DB, RLS, UI, endpoints ni el pipeline ORC, no se modifica la planificación oficial y no se añaden estrategias SEE. `real-voice-audition-day` sigue incluido en la suite oficial; si permanece hard-infeasible, la evidencia ya no debe deberse a interpretar cierres de Croma u otros protected breaks scoped como globales.

### ORC Strict V4 Baseline Seed Isolation v1 (ID 208)

El ORC baseline seed ya no hereda planificación cruda de tareas `pending` que V4 no haya incluido en `v4Output.plannedTasks`. Sólo entran en el seed las tareas planificadas por V4 y las tareas `done`, `in_progress` o bloqueadas con planificación existente; las `pending` no seedadas pierden `startPlanned`, `endPlanned` y `assignedResourceIds`, conservando constraints y metadata mínima como fixed windows, dependencias, template, contestant, espacio y zona.

Los diagnostics del seed distinguen planificación V4 (`v4_planned_task`) de planificación protegida heredada (`protected_existing_planning`) y reportan conteos serializables de tareas V4, protegidas, raw planning limpiado y pendientes no seedadas. El benchmark diferencia `baseline_seed_has_no_planning` de `baseline_seed_hard_infeasible`: si V4 no produce baseline suficiente, ORC Active y Operational Delta Benchmark caen a fallback V4 sin auditar horarios crudos como baseline V4 ni autorizar optimización de candidatos.

Raw shadow diagnostics siguen existiendo para inspeccionar planificación cruda/manual y sus violaciones, pero ya no alimentan `baselineSeedHardFeasibility`, `officialOrcOutcome` ni métricas oficiales ORC. No hay cambios DB, RLS, UI, V3, V4 ni endpoints; no se relajan hard constraints, no se cambia el pipeline ORC, no se añaden estrategias SEE y `real-voice-audition-day` sigue incluido.


### ORC Executable Main Flow Gap Closure Candidate v1 (ID 209)

ORC SEE ahora genera candidatos ejecutables para cerrar huecos visibles del flujo principal configurado. El nuevo builder detecta primero `constraints.optimizer.mainZoneId`, identifica una tarea o bloque temprano del flujo principal y, si existe un gap inicial significativo antes de la siguiente cadena, emite assignments reales que retrasan ese bloque para terminar justo antes del anchor posterior. Los assignments conservan duración, espacio y recursos baseline, no mutan `OperationalState`, respetan tareas `done`/`in_progress` y locks obvios, y pasan por CandidateHardPrefilter antes de Simulation, Validation, Evaluation y Commit.

Estos candidatos usan metadata `MAIN_FLOW_GAP_CLOSURE`, `planningInfluence: "candidate-assignments"` y `executesTransformations: true`, por lo que pueden competir contra `PRESERVE_BASELINE_SAFETY` dentro del pipeline oficial sin usar movimientos post-pipeline ni reactivar `applyLocalScheduleMove`. Si el candidato reduce el gap inicial y valida hard constraints, ORC puede consolidarlo como cambio real; si falla, el baseline safety/fallback siguen preservando V4.

El evaluator de continuidad ahora usa `optimizer.mainZoneId` antes que nombres de espacios para detectar el flujo principal; ID 211 elimina la inferencia operativa por nombres y exige contrato estructurado. Esta iteración no implementa compactación de coaches ni de recursos críticos; queda para ID 210. No hay cambios DB, RLS, UI, V3, V4 ni endpoints, no se relajan hard constraints y `real-voice-audition-day` sigue en la suite oficial.
### ORC Main Flow Active Readiness & Non-Work Break Semantics v1 (ID 210)

ORC ahora resuelve explícitamente la configuración del flujo principal con un resolver read-only que prioriza `constraints.optimizer.mainZoneId`, `optimizer.mainZoneId`, aliases compatibles de V4 (`optimizerMainZoneId`, `mainFlowSpaceId`, `continuousSpaceId`) y configuración estructural de continuidad/prioridad máxima por espacio. Si no hay flujo principal configurado, ORC lo diagnostica como `main_flow_not_configured` y no infiere el flujo por nombres de espacios.

Validation distingue tareas productivas de placeholders de comida, break global, break de espacio y placeholders no operativos. Los placeholders de comida/break/no-operativos no cuentan como trabajo productivo, no rompen la comida hard que representan, no alimentan continuidad del flujo principal ni trabajo activo de recursos/talentos, y sólo bloquean espacio cuando están marcados explícitamente como blockers. Las tareas productivas siguen sujetas a comida global, protected breaks, solapes reales, locks y demás hard constraints.

`mainFlowGapClosure` queda trazado en diagnostics reales con ejecución, motivo de skip, main flow resuelto, candidatos generados, assignments, descartes por prefiltro, simulaciones válidas/ inválidas y selección. Los candidatos abstractos/read-only sin assignments pueden seguir existiendo como advisory, pero no compiten como mejor candidato operativo de cambio cuando no hay un candidato ejecutable.

Esta iteración no implementa compactación de coaches ni resource handoff compaction, no reactiva `applyLocalScheduleMove`, no cambia DB, RLS, UI, V3, V4 ni endpoints, no relaja hard constraints productivas y no altera el pipeline ORC. `real-voice-audition-day` sigue incluido en la suite oficial.


### ORC Active Configuration & Operational Role Contract v1 (ID 211)

ORC exige ahora configuración estructurada de flujo principal: `constraints.optimizer.mainZoneId`, aliases de `mainFlowSpaceId`/`continuousSpaceId`, `optimizer`, `settings`, `productionSettings`, `planSettings` o flags estructurados de espacios (`continuous`, `strictContinuity`, `mainFlow`, `principal`, `primary`). No se infiere “Plató 7” ni ningún espacio principal por nombre. Si falta configuración, diagnostics exponen `main_flow_not_configured`; no se añaden cambios DB, RLS, V3 ni V4 salvo lectura/adaptación de campos ya existentes.

El baseline seed transporta contrato operativo por tarea (`seedSource`, `operationalRole`, `blocksSpace`, `countsAsWork`, `countsForMainFlow`, `countsForResourceLoad`, `countsForTalentLoad`) para distinguir trabajo productivo, comida, llegada/citación, bloqueos visuales, break de espacio y placeholders no operativos. Validation aplica hard constraints según rol: las tareas productivas siguen siendo estrictas, mientras que placeholders no productivos no contaminan hard-feasibility por comida ni por solapes de espacio salvo que bloqueen espacio explícitamente. No se relajan hard constraints productivas.

`mainFlowGapClosure` aparece siempre en diagnostics reales con ejecución/skip, main flow resuelto, candidates, assignments, descartes de prefiltro, candidate/simulation counts, validaciones y selección. Los candidatos abstractos sin assignments pueden seguir como diagnóstico, pero no se presentan como cambios ejecutables cuando falta un candidate operativo; en ese caso se reporta `no_executable_candidate_available`. No se implementa compactación de coaches todavía, no hay resource handoff compaction, no se reactivan movimientos post-pipeline y `real-voice-audition-day` se mantiene en la suite.

### ORC Baseline Viability Semantics: Meal Window, Non-Work Roles & Space Occupancy v1 (ID 212)

ORC distingue ahora una `mealWindow` amplia usada para colocar comidas de un cierre global hard. Una ventana amplia de comida ya no apaga automáticamente toda la producción; solo `actualMeal`, `globalHardBreak`, `hardMealBreak`, `isGlobalHardBreak`, `blocksAllWork`, `dayClosed`, `productionStop` o señales equivalentes mantienen semántica hard global. Los hard breaks explícitos siguen invalidando tareas productivas que los cruzan.

El baseline seed transporta roles operativos y semántica de ocupación de espacio para diferenciar tareas productivas exclusivas de placeholders de comida, llegada/citación y elementos no operativos. Validation y el hard prefilter usan esos roles para decidir `SPACE_OVERLAP`: placeholders no bloqueantes no contaminan hard-feasibility, mientras que dos tareas productivas exclusivas siguen sujetas a hard constraints reales. `mainFlowGapClosure` conserva sus diagnostics y añade detalles accionables de prefiltro cuando un candidate se descarta por solape.

No se implementa compactación de coaches todavía, no hay cambios DB/RLS/UI, no se cambia V3, no se reescribe V4, no se cambia el pipeline ORC y `real-voice-audition-day` sigue incluido.

### ORC MealMode Contract Alignment v1 (ID 213)

ORC respeta ahora `constraints.mealMode` como contrato principal para resolver la semántica de comida. `flexible_meal_window` se interpreta como ventana de colocación de comida aunque `meal` y `mealWindow` lleguen duplicados desde `buildInput`, evitando el falso `PLANNING_CROSSES_HARD_MEAL_BREAK` sobre tareas productivas dentro de una ventana flexible amplia.

`global_hard_break`, `actualMeal`, `globalHardBreaks` y flags hard explícitos (`globalHardBreak`, `hardMealBreak`, `isGlobalHardBreak`, `blocksAllWork`, `dayClosed`, `productionStop`) siguen bloqueando producción como hard constraints reales. Si falta `mealMode`, ORC conserva el fallback legacy conservador para `meal` con warning diagnosticado, y no inventa cierres globales desde `mealWindow`.

Validation, CandidateHardPrefilter y BaselineSeedFeasibilityAudit comparten esta semántica y exponen `mealSemantics.mealMode` en diagnostics. No se relajan hard constraints explícitas, no hay cambios DB, RLS, UI, V3 ni V4, no se implementa compactación de coaches, no se cambia el pipeline ORC y `real-voice-audition-day` sigue incluido.

### ORC Transport Template Occupancy Contract & Pre-existing Overlap Isolation v1 (ID 214)

ORC resuelve ahora un contrato de transporte read-only desde configuración estructurada (`settings.transport`, `productionSettings.transport`, `constraints.transport`, `transportSettings` o `transport`) sin hardcodear nombres de plantillas, espacios ni duraciones. Las plantillas configuradas de llegada/salida se clasifican como `transport_arrival` / `transport_departure` y admiten simultaneidad hasta `vehicleCapacity`; `arrivalTargetGroupSize`, `departureTargetGroupSize` y `groupingWeight` quedan expuestos como preferencias blandas, no hard constraints.

El espacio usado por transporte no se convierte globalmente en compartido: las tareas productivas exclusivas mantienen `SPACE_OVERLAP` estricto, mientras que los eventos de transporte no bloqueantes no invalidan contra productivas salvo bloqueo explícito. Validation distingue capacidad de grupo de transporte (`TRANSPORT_GROUP_CAPACITY_EXCEEDED`) de solape productivo real y añade diagnostics accionables de contrato/capacidad.

CandidateHardPrefilter compara overlaps del baseline frente al preview del candidate para separar solapes preexistentes de solapes introducidos o empeorados por candidatos; `mainFlowGapClosure` ya no culpa a un candidate por conflictos que no introduce. No se implementa compactación de coaches, no hay cambios DB/RLS/UI, no se cambia V3, no se reescribe V4 y no se relajan hard constraints productivas exclusivas.

### ORC Active Transport Contract Wiring & Seed Role Reclassification v1 (ID 215)

ORC Active ya lee la configuración real de transporte emitida por `buildInput`: `arrivalTaskTemplateName`, `departureTaskTemplateName`, objetivos/min gaps, `vehicleCapacity` / `vanCapacity` / `transportVanCapacity`, `transportSpaceId` y `optimizerWeights.arrivalDepartureGrouping` se publican también como `transportSettings` estructurado. El contrato soporta plantilla por ID o por nombre configurado sin hardcodear `IN`, `OUT`, nombres de espacios, duraciones ni ids de espacios.

Las plantillas configuradas como llegada/salida se clasifican como `transport_arrival` / `transport_departure` y son transporte agrupable: la capacidad hard de simultaneidad viene de `vehicleCapacity` / `vanCapacity`, mientras que objetivos de agrupación y peso son preferencias blandas. El baseline seed pasa el contrato de transporte al clasificador y ya no congela por defecto estas tareas como `productive_task` exclusiva; el adapter permite que el contrato de transporte reemplace un rol productivo seedado por defecto, respetando sólo un `blocksSpace: true` explícito.

Las productivas normales del mismo espacio siguen siendo exclusivas si no tienen otra configuración: `SPACE_OVERLAP` productivo real continúa siendo hard, el espacio de transporte no se vuelve compartido globalmente y no se ocultan hard violations reales. No se implementa compactación de coaches ni resource handoff compaction, no hay cambios DB/RLS/UI, no se cambia V3, no se reescribe V4 y no se relajan hard constraints productivas exclusivas.

### ORC Validation Transport Role Propagation v1 (ID 216)

ValidationEngine resuelve ahora el `transportContract` antes de clasificar `roleByTask`, por lo que Validation usa los roles finales de transporte (`transport_arrival` / `transport_departure`) en lugar de volver a caer a `productive_task` por defecto. Los roles de transporte ya materializados en entry/task se conservan cuando el contrato está configurado, y un contrato por template puede corregir un rol productivo seedado sin inventar transporte por texto cuando no hay contrato.

CandidateHardPrefilter usa la misma semántica de transporte que Validation en hard breaks, previews y cálculo de overlaps baseline/candidate. Las tareas IN/OUT configuradas ya no se revalidan como productivas exclusivas: transporte no bloqueante dentro de `vehicleCapacity` no genera `SPACE_OVERLAP`, mientras que un grupo que excede capacidad emite `TRANSPORT_GROUP_CAPACITY_EXCEEDED` con taskIds, capacidad y conteo.

Las productivas exclusivas reales siguen siendo hard y continúan generando `SPACE_OVERLAP` en espacios de capacidad efectiva 1. Baseline audit distingue transporte válido tras alineación de contrato, exceso de capacidad (`transport_group_capacity_exceeded`) y solape productivo real. No hay cambios DB/RLS/UI, no se implementa compactación de coaches todavía, no se cambia V3 y no se reescribe V4.

### ORC Baseline Productive Space Overlap Repair Candidate v1 (ID 217)

ORC SEE can now generate executable baseline-repair candidates for pre-existing productive `SPACE_OVERLAP` hard violations before optimizing flow/coaches. V1 is deliberately scoped to simple pairs: exactly two productive, exclusive, replanificable tasks in the same space with valid positive windows, no `done`/`in_progress` status and no incompatible locks. The repair keeps duration, assigned space and assigned resources, and deterministically tries moving the shorter/more flexible task after the other task, plus an earlier variant when there is work-day room.

The repair is a normal ORC candidate with real assignments and clear `BASELINE_SPACE_OVERLAP_REPAIR` metadata/evidence. It does not mutate `OperationalState` during generation, does not use post-pipeline moves, and must pass the official Candidate → Transformation → Simulation → Validation → Evaluation → Commit path. `SPACE_OVERLAP` remains hard; no constraints are relaxed and final hard-infeasible states are not consolidated. A hard-feasible repaired plan can win over a hard-infeasible baseline even when OPQM is otherwise unchanged.

CandidateHardPrefilter distinguishes the overlap being repaired from newly introduced or worsened overlaps: it allows a repair candidate to proceed when it resolves the initial conflict, but still discards candidates that create another hard overlap. This iteration does not implement coach compaction or resource handoff compaction. There are no DB/RLS/UI changes, V3 is unchanged, V4 is not rewritten, and transport grouping plus flexible meal semantics remain covered by prior iterations.

### ORC Baseline Repair Lineage & Active Gate Unblocking v1 (ID 218)

ORC now resolves deterministic lineage from raw baseline-overlap repair candidates through Partial Plans, synthetic candidates, CandidateStates, SimulatedStates, OperationalValues and CommitDecisions. `baselineOverlapRepair` summary counts CandidateStates, simulations, valid/invalid validations and commit selection even when the Decision Engine evaluates `candidate:partial-plan:<rawCandidateId>` instead of the raw SEE candidate directly. The bounded `lineage` diagnostic is serializable/read-only and reports raw candidate ids, synthetic candidate ids, partial plan ids, candidate state ids, simulated state ids and committed simulated state ids.

ORC Active can accept a selected baseline-overlap repair when the final simulation is `VALID`, materialized from `candidate_transformations`, changes at least one task, preserves `done`/`in_progress`, respects locks and has no hard violations. A hard-feasible repaired plan may therefore beat a hard-infeasible baseline seed, but no hard-infeasible final state is consolidated. `SPACE_OVERLAP` remains hard, Validation/Evaluation/Commit are not bypassed, and no post-pipeline moves are used.

This iteration does not implement coach compaction or resource handoff compaction. There are no DB/RLS/UI changes, V3 is unchanged, V4 is not rewritten, and transport grouping plus flexible meal semantics remain covered by prior iterations.

### ORC Baseline Space Overlap Repair Safe Variants & Repair Acceptance Policy v1 (ID 219)

Baseline overlap repair now generates bounded deterministic variants that may move either task in a simple productive exclusive space-overlap pair: A before B, A after B, B before A and B after A. The preference still favors tasks without resources, shorter tasks, non-main-flow tasks, smaller minute displacement and stable ids, but that ordering no longer discards the longer task when it may be the viable operational repair.

Each repair candidate keeps duration, assigned space and assigned resources, carries real assignment metadata, records the moved/fixed/conflicting task ids, original/proposed windows and local feasibility diagnostics, and still goes through Candidate, Transformation, Simulation, Validation, Evaluation and Commit. Cheap local checks can flag obvious workday, lock, protected-task, space, resource or team/contestant blockers, but they do not replace Validation and do not relax `SPACE_OVERLAP` or `RESOURCE_OVERLAP`.

ORC Active has an explicit repair acceptance policy: a validated and committed baseline repair that restores hard feasibility from a hard-infeasible baseline seed can pass the baseline-seed gate and may bypass OPQM as a hard veto when the invalid baseline only looked better because of illegal overlap compactness. The OPQM delta remains diagnostic evidence; the policy only applies to selected baseline repair candidates with `candidate_transformations`, changed tasks, preserved `done`/`in_progress`, respected locks and no hard violations.

No coach compaction or resource handoff compaction is implemented yet. There are no DB/RLS/UI changes, V3 is unchanged, V4 is not rewritten, and transport grouping plus flexible meal semantics remain covered by prior iterations.


### ORC Baseline Repair Audit Source-of-Truth & Transport-Aware Pair Selection v1 (ID 220)

Baseline overlap repair now uses the official hard-feasibility audit as its primary source of truth. When `baselineSeedHardFeasibility.spaceOverlapGroups` is available, it guides selection of the repairable pair before falling back to sampled violation details, Validation recalculation with official semantics, and only then a conservative planning scan. The `baselineOverlapRepair` summary now reports `sourceOfTruth`, audit space-overlap counts, repairable audit counts, unsupported group samples, and read-only `repairableGroupSelection` diagnostics.

Transport-aware role and occupancy semantics are aligned with ValidationEngine: configured transport grouping, meal placeholders, and non-blocking placeholders do not contaminate productive exclusive overlap cardinality. The builder no longer returns `unsupported_overlap_cardinality` when at least one 2-task productive exclusive overlap group is repairable; unsupported groups are diagnosed without blocking supported groups. If multiple repairable groups exist, v1 deterministically selects one by time window, configured main zone, space id, and task ids, and records `multiple_repairable_groups_limited_to_first`.

Selected repairs continue to generate bounded variants moving either task while preserving duration, space, and resources, and every candidate still passes through Candidate, Transformation, Simulation, Validation, Evaluation, and Commit. `SPACE_OVERLAP` and `RESOURCE_OVERLAP` remain hard constraints; no coach compaction, resource handoff compaction, global repair, post-pipeline moves, DB/RLS/UI changes, V3 changes, or V4 rewrite are introduced.


### ORC Baseline Repair Runtime Audit Wiring & Summary Contract v1 (ID 221)

Shadow runtime now wires `BaselineSeedHardFeasibilityAudit` into candidate generation before baseline overlap repair candidates are built, and Active passes the same official audit when it invokes Shadow from a V4 baseline seed. This ensures `baselineSeedHardFeasibility.spaceOverlapGroups` reaches `candidateBuilder` and `baselineOverlapRepairCandidateBuilder` in the real pipeline, not only in isolated unit tests.

`baselineOverlapRepair` now always publishes the summary contract fields `sourceOfTruth`, audit group counts, `repairableGroupSelection`, unsupported group diagnostics, `auditAvailable`, `auditPassedToCandidateBuilder`, `auditPassedToRepairBuilder`, `fallbackSourceUsed`, and `runtimeWiringWarnings`. If the official audit contains a repairable 2-task productive exclusive space overlap such as `[315, 504]`, the runtime source of truth is `baseline-hard-feasibility-audit` and the repair path cannot report `unsupported_overlap_cardinality` for that group.

The repair remains inside Candidate, Transformation, Simulation, Validation, Evaluation, and Commit. `SPACE_OVERLAP` and `RESOURCE_OVERLAP` are not relaxed; no post-pipeline moves, coach compaction, DB/RLS/UI changes, V3 changes, or V4 rewrite are introduced.

### ORC Baseline Repair Runtime Invariant & Late Audit Repair Pass v1 (ID 222)

ORC now enforces a runtime invariant for baseline overlap repair: when the official hard-feasibility audit contains a repairable 2-task productive exclusive `spaceOverlapGroups` entry, baseline repair must process that audit, generate repair candidates, or publish an explicit invariant violation diagnostic. This prevents a simple audited productive overlap such as `[315, 504]` from ending as `unsupported_overlap_cardinality` without contract fields or wiring diagnostics.

Shadow mode adds a bounded late audit repair pass for cases where the official audit is available only after initial candidate generation or the initial summary is missing the required repair contract. The late pass uses the same `OperationalState`, calls baseline overlap repair with the official audit, and routes generated candidates through Candidate, Transformation, Simulation, Validation, Evaluation, and Commit; it does not apply post-pipeline moves, mutate the baseline seed, skip Simulation/Validation/Evaluation, or relax `SPACE_OVERLAP`/`RESOURCE_OVERLAP`.

`baselineOverlapRepair` always publishes the full summary contract, including audit availability/wiring, source of truth, audit group counts, repairable selection, unsupported samples, fallback source, runtime invariant, and `lateAuditRepairPass` counters. Active can accept a valid committed repair from the late pass under the existing hard-feasibility gates and records `repairAcceptancePolicy: "hard-feasibility-restored-from-invalid-baseline"` with `repairAcceptanceSource: "late-audit-repair-pass"` when it restores feasibility from an invalid baseline. No DB, RLS, UI, V3, V4 rewrite, coach compaction, resource handoff compaction, or global repair changes are introduced.


### ORC Active Valid Repair Selection & Late Pass Lineage v1 (ID 223)

ORC Active now selects with `valid-committed-repair-first-v1`: any `VALID` simulation wins over `INVALID` diagnostics, and a committed baseline-overlap repair with `candidate_transformations` plus real `changedTaskCount` is prioritized over a hard-infeasible baseline even if the invalid baseline has a higher operational score or earlier id. The selected simulation used for extraction, materialization, gates, OPQM evidence, output, best-candidate trace and activation report must be the repaired `SimulatedState`, not the invalid baseline preservation simulation.

The late audit repair pass now resolves lineage through `resolveCandidateLineage`, including Partial Plans and `candidate:partial-plan:<rawCandidateId>` synthetic candidates. Its summary/evidence carries candidate state ids, simulated state ids, valid/invalid counts and committed simulated state ids so `baselineOverlapRepair.selectedAsCommit` works for synthetic decision candidates as well as direct raw repair candidates.

OPQM remains evidence and can be bypassed only by `repairAcceptancePolicy: "hard-feasibility-restored-from-invalid-baseline"` when Validation declares the repaired final state `VALID`, no hard violations remain, protected `done`/`in_progress` tasks and locks are preserved, and pending tasks are planned. `SPACE_OVERLAP` and `RESOURCE_OVERLAP` remain hard, no post-pipeline moves are used, no coach/resource handoff compaction or global repair is introduced, and there are no DB/RLS/UI, V3 or V4 rewrite changes.

### ORC Active Hard-Feasibility Repair Preflight & Runtime Export Contract v1 (ID 224)

ORC Active now has a bounded hard-feasibility-first repair preflight before returning fallback for `baseline_seed_hard_infeasible`. If the official baseline hard-feasibility audit includes a repairable two-task productive exclusive `spaceOverlapGroups` conflict, Active attempts executable baseline-overlap repair even when Shadow returned a legacy repair summary. The preflight is limited to baseline overlap repair candidates, capped at four candidates, and routes work through Candidate, Transformation, Simulation, Validation, Evaluation, Ranking, and Commit.

The preflight does not apply post-pipeline moves, does not mutate `OperationalState` directly, does not skip Simulation/Validation/Evaluation, and does not relax `SPACE_OVERLAP` or `RESOURCE_OVERLAP`. A valid repaired plan wins over an impossible baseline; if no repair validates, Active keeps the safe fallback but exports generated candidates, prefilter discard reasons, simulation and validation counts, and concrete failure reasons.

Runtime export now always includes `diagnostics.orcSummary.runtimeContract.orcRuntimeContractVersion: "ORC-RUNTIME-CONTRACT-ID224"`. `baselineOverlapRepair` publishes `summaryContractVersion: "BASELINE-OVERLAP-REPAIR-SUMMARY-ID224"` plus `activeRepairPreflight`, audit wiring, source-of-truth, repairable selection, unsupported samples, runtime warnings, and invariants. A repairable audit like `[315, 504]` can no longer silently end as legacy `unsupported_overlap_cardinality` without `activeRepairPreflight`. This iteration does not implement coach compaction, resource handoff compaction, global repair, DB/RLS/UI changes, V3 changes, or a V4 rewrite.


### ORC Benchmark CLI Operational Evidence (ID 176)

`npm run benchmark:orc` is the official ORC operational evidence entry point. It runs the Production Scenario Benchmark Suite, Evidence Optimization Cycle, Evidence Gate, and prints a stable JSON report with scenario summary, operational delta summary, authorization counts, `planningInfluence: "none"`, and the next action recommendation only when Evidence Gate authorization exists.

Use `npm run benchmark:orc:legacy` to execute the previous shadow search benchmark entry point. The operational benchmark is read-only and does not write files or persist results.


### ORC Progressive Commitment Strategy (ID 182)

The ORC SEE now computes deterministic Progressive Commitment Scores from existing ORS, Dependency Chain Flow, Operational Goal, Opportunity Cost, and Recovery Potential signals. Stable decisions are used only to organize exploration, rank search effort, and estimate avoided reconsiderations; every decision remains reversible until the Commit Engine. Commitment scores, contributing factors, stability reasons, and no-planning-influence metadata are recorded as Evidence. The operational benchmark report exposes tracking flags for decision stability, reconsiderations avoided, computational cost impact, and final-solution correlation while keeping `planningInfluence: "none"`.

### ORC Goal-Oriented Search (ID 181)

The ORC SEE now builds deterministic Operational Goals from existing ORS and Dependency Chain Flow signals, associates opportunities with coherent goal groups, and records generated goals, associated opportunities, aggregate ORS, and prioritization explanations as Evidence. Strategy candidate generation can order search spaces by goal coherence and annotates candidates with goal metadata without changing the Decision Engine, official planning, persistence, API, UI, or V4 behavior. The operational benchmark report exposes tracking flags for goal count, strategy coherence, useful diversity, Operational Value correlation, order stability, and computational cost while keeping `planningInfluence: "none"`.

### ORC Operational Trade-off Analyzer (ID 183)

The ORC SEE now detects deterministic operational trade-offs for candidates by comparing existing Operational Reasoning Score, Opportunity Cost, and Recovery Potential signals. Trade-off Evidence records favored dimensions, penalized dimensions, intensity, and a full explanation for reconstruction; this information is informational/read-only, supports explanations and near-tie context only, and does not change the Decision Engine, Commit Engine, official planning, persistence, API, UI, or V4 behavior. The operational benchmark report exposes tracking flags for detected trade-offs, final-solution correlation, explanation stability, and Operational Value correlation while keeping `planningInfluence: "none"`.

### ORC Operational Reasoning Score (ID 180)

The ORC SEE now consolidates Operational Criticality, Opportunity Propagation, Dynamic Bottleneck, Future Impact, Opportunity Cost, Dependency Chain Flow, and Recovery Potential into a single deterministic Operational Reasoning Score. Each score records normalized component values, individual contributions, and a full explanation as Evidence so exploration ordering, reasoning-budget allocation, and candidate preselection can be reconstructed without changing the Decision Engine, official planning, persistence, API, UI, or V4 behavior. The operational benchmark report exposes tracking flags for ORS correlation with final Operational Value, exploration-order stability, computational cost, avoided simulations, and reduction of contradictory decisions while keeping `planningInfluence: "none"`.

### ORC Recovery Potential Estimator (ID 179)

The ORC SEE now estimates deterministic, read-only Recovery Potential for each candidate before simulation. The estimate considers residual slack, remaining alternative diversity, future resource pressure, reordering capacity, and dependency-chain resilience. It is recorded as Evidence and can influence only exploration ordering, candidate preselection, and reasoning-budget allocation; it never invalidates candidates and does not change the Decision Engine, official planning, persistence, API, UI, or V4 behavior. The operational benchmark report exposes tracking flags for Recovery Potential correlation, avoided simulations, planning stability, and calculation-time evidence while keeping `planningInfluence: "none"`.

### ORC Opportunity Cost Estimator (ID 177)

The ORC SEE now computes a deterministic, read-only Opportunity Cost estimate before simulation. The estimate is recorded as Evidence and can influence only exploration ordering, candidate preselection, and budget reasoning; it does not change the Decision Engine, official planning, persistence, API, UI, or V4 behavior. The operational benchmark report exposes tracking flags for correlation, avoided simulations, correctly discarded candidates, and calculation-time evidence while keeping `planningInfluence: "none"`.

## Verificación básica

```bash
npm run check
npm run test:engine:quick
npm run benchmark:engine:quick
npm run test:engine:full
npm run benchmark:engine:full
```

Los aliases históricos `npm run test:engine` y `npm run benchmark:engine` conservan la validación completa. Para iteración local rápida se usan los comandos `:quick`; antes de mergear cambios del motor deben ejecutarse las suites `:full`.

- ID 026 — 2026-06-07 11:50 — Hard validation gate y detalle de hard violations en Motor V3
- ID 027 — 2026-06-07 12:08 — Corrección de semántica de comida flexible vs bloqueo hard global
- ID 028 — 2026-06-07 13:39 — Concurrencia/capacidad de espacios y diagnóstico humano de SPACE_OVERLAP
- ID 029 — 2026-06-07 14:45 — Uso de capacidad de furgoneta existente para concurrencia del espacio Transporte

- ID 030 — 2026-06-07 15:24 — Export de calidad operativa del planning para evaluación real del motor
- ID 031 — 2026-06-07 16:21 — Compactación de jornadas e idle time para calidad operativa real

- ID 032 — 2026-06-07 16:47 — Alineación de detección de coaches en scoring y compactación operativa
- ID 033 — 2026-06-07 19:19 — Cancelación/desbloqueo seguro de generación atascada desde el modal
- ID 034 — 2026-06-07 21:08 — Coach compaction real con trazabilidad de rechazos
- ID 035 — 2026-06-08 08:25 — Fix metadata null de coach compaction
- ID 036 — 2026-06-08 11:24 — Generador concreto para reducir gap de coach
- ID 037 — 2026-06-08 12:54 — Coach bundle compaction para reducir gaps grandes de coach
- ID 038 — 2026-06-08 14:32 — Coach wave ordering para reducir jornadas partidas de vocal coaches
- ID 039 — 2026-06-08 14:51 — Pipeline coach-wave candidate completo y diagnóstico obligatorio
- ID 040 — 2026-06-08 15:20 — Phase C Pipeline Builder por Main Stage y coach waves
- ID 041 — 2026-06-08 17:33 — Pipeline Builder observable y parcial para coach waves reales
- ID 042 — 2026-06-08 20:15 — Pipeline Builder repair pass para conflictos de recursos/espacios
- ID 043 — 2026-06-09 05:18 — Pipeline segment repair por cadena de talent y conflict details obligatorio
- ID 044 — 2026-06-09 07:25 — Trazabilidad end-to-end de Pipeline Segment Repair

- ID 045 — 2026-06-09 15:27 — Robustez de planificación y resource-lane intelligence para Pipeline Builder

- ID 046 — 2026-06-09 19:34 — Lane-only sequential repair y split de segmento para Pipeline Builder

- ID 047 — 2026-06-09 20:35 — Progreso vivo de planificación y slack-aware lane repair

- ID 048 — 2026-06-09 21:05 — Meal window scheduler flexible y progreso real por fases
- ID 049 — 2026-06-09 22:00 — Hotfix defensivo para progreso y meal scheduler tras Internal Server Error

- ID 050 — 2026-06-10 13:33 — Cancelación transaccional y meal diagnostics end-to-end
- ID 051 — 2026-06-10 14:25 — Meal-aware Pipeline Builder y diagnostics reales de lane repair

- ID 052 — 2026-06-10 14:54 — Segment solver real para cuello de botella y export JSON latest-run seguro

- ID 053 — 2026-06-10 19:42 — Microsegment solver quirúrgico para gaps de coach

- ID 054 — 2026-06-10 20:40 — Segment solver con blockers concretos y reparación incremental
- ID 055 — 2026-06-15 05:36 — Repair chain controlado para segment solver y diagnostics completos
- ID 056 — 2026-06-15 06:15 — Post-success UI robusto y full-validation diagnostics del segment solver
- ID 057 — 2026-06-15 14:41 — Planning ready gate y full-validation underlying failures
- ID 058 — 2026-06-15 15:00 — Ready gate OUT completo y guard de overlap fijo en Main Stage

- ID 059 — 2026-06-15 16:00 — Production Wave Builder candidate-first y Main Stage guard efectivo
- ID 060 — 2026-06-15 17:00 — Activación real Production Wave y guard Main Stage efectivo

- ID 061 — 2026-06-15 21:48 — Contrato runtime Production Wave y poda Main Stage pre-validation
- ID 062 — 2026-06-17 00:00 — Infraestructura paralela Motor V4 con resultados y diagnosis separados

- ID 063 — 2026-06-17 00:00 — V4 Strategic Analysis Layer
- ID 064 — 2026-06-17 00:00 — V4 Main Flow Sequence Builder
- ID 065 — 2026-06-17 00:00 — V4 Guided Input Ordering

- ID 066 — 2026-06-17 00:00 — V4 Post-Plan Quality Evaluator
- ID 067 — 2026-06-17 00:00 — V4 Main Flow Continuity Improvement Pass
- ID 068 — 2026-06-17 00:00 — V4 Multi-Strategy Candidate Runner
- ID 069 — 2026-06-17 00:00 — V4 Main Flow First Scheduler

- ID 070 — 2026-06-18 00:00 — V4 Production Wave Scheduler V1

- ID 071 — 2026-06-18 00:00 — V4 Hierarchical Post-Optimizer V1
- ID 072 — 2026-06-18 15:14 — V4 Production Wave V2 and V3/V4 Comparison Gate

- ID 073 — 2026-06-18 00:00 — V4 Native Remainder Scheduler V1

- ID 074 — 2026-06-18 15:50 — V4 Native Critical Core with V3 Fill

- ID 075 — 2026-06-18 16:03 — V4 Pro Orchestrator and Quality Gate

- ID 076 — 2026-06-18 18:07 — V4 Strategic Block Repacker V1

- ID 077 — 2026-06-18 19:23 — V4 Hierarchical Improvement Engine V1

- ID 078 — 2026-06-18 19:39 — V4 Main Flow Sequence Search V1

- ID 079 — 2026-06-18 00:00 — V4/V3 Benchmark Harness and Regression Gate

- ID 080 — 2026-06-19 00:00 — V4 Performance Budget and Benchmark Stabilization
- ID 081 — 2026-06-19 00:00 — V4 Strategy Portfolio Calibration

- ID 082 — 2026-06-19 12:04 — V4 Benchmark Evidence Report and Loss Diagnosis
- ID 083 — 2026-06-24 00:00 — V4 Representative Benchmark and Simple Scenario Early Exit
- ID 084 — 2026-06-24 00:00 — V4 Benchmark Trustworthiness and Latest Result Hygiene

- ID 085 — 2026-06-24 10:16 — V4 Native Core Failure Diagnosis and Runtime Short-Circuit
- ID 086 — 2026-06-24 13:36 — V4 Main Flow Gap Targeting for Native Critical Core
- ID 087 — 2026-06-24 00:00 — V4 Actual Main Flow Gap Closure V1

- ID 088 — 2026-06-24 14:14 — V4 Gap Closure Safety and Benchmark Proof

- ID 089 — 2026-06-24 18:33 — V4 Gap Closure Bugfix and Flow Order Targeting

- ID 090 — 2026-06-24 19:23 — V4 Resource Validation Audit and Safe Resource Move Support

- ID 091 — 2026-06-24 20:49 — V4 AnyOf Resource Resolution for Gap Moves

- ID 092 — 2026-06-25 00:00 — ORC State Contracts Baseline
- ID 093 — 2026-06-25 13:57 — ORC SEE Read-Only Opportunity Detection Baseline
- ID 094 — 2026-06-25 15:03 — ORC SEE Shadow Mode Evidence
- ID 095 — 2026-06-25 15:28 — ORC SEE Read-Only Search Space Baseline

- ID 096 — 2026-06-25 15:35 — ORC SEE Candidate Generation Baseline (Read-Only)

- ID 097 — 2026-06-25 15:44 — ORC Transformation Engine Baseline (Read-Only)
- ID 098 — 2026-06-25 15:53 — ORC Simulation Engine Baseline (Read-Only)

- ID 099 — 2026-06-25 16:06 — ORC Validation Engine Baseline (Read-Only)

- ID 100 — 2026-06-25 16:16 — ORC Operational Evaluator Baseline (Read-Only)
- ID 101 — 2026-06-25 16:24 — ORC Commit Engine Baseline (Shadow Mode)
- ID 102 — 2026-06-25 17:10 — ORC Cognitive State & Session Memory Baseline
- ID 103 — 2026-06-25 19:45 — ORC Reasoning Budget Baseline
- ID 104 — 2026-06-25 22:27 — ORC SEE Cognitive Feedback Loop Baseline
- ID 105 — 2026-06-25 06:38 — ORC Cognitive Pruning Baseline
- ID 106 — 2026-06-26 06:46 — ORC Decision Engine Ranking Baseline

- ID 107 — 2026-06-26 06:58 — ORC Operational Evaluator v1 (Real Multi-Criteria Evaluation)

- ID 108 — 2026-06-26 14:38 — ORC Session Learning Baseline

- ID 109 — 2026-06-26 14:48 — ORC Adaptive Opportunity Prioritization v1
- ID 110 — 2026-06-26 14:55 — ORC Adaptive Search Space Builder v1
- ID 111 — 2026-06-26 15:34 — ORC Strategy-Based Candidate Builder v1
- ID 112 — 2026-06-26 16:17 — ORC Opportunity Diagnosis Engine v1


- ID 113 — 2026-06-26 16:52 — ORC Benchmark Harness v1 (SPEC-05)
- ID 114 — 2026-06-26 17:09 — ORC Golden Benchmark Suite v1
- ID 115 — 2026-06-26 18:20 — ORC Baseline Report Generator v1
- ID 116 — 2026-06-26 18:29 — ORC Calibration Framework v1
- ID 117 — 2026-06-26 22:35 — ORC Real-Scenario Validation Framework v1
- ID 118 — 2026-06-26 22:59 — ORC Advisory Decision Interface v1
- ID 119 — 2026-06-26 23:11 — ORC Advisory Evaluation Framework v1
- ID 120 — 2026-06-26 23:19 — ORC Recommendation Calibration Suite v1
- ID 121 — 2026-06-26 23:40 — ORC Readiness Index Framework v1
- ID 121 — 2026-06-26 23:55 — ORC Advisory Integration Layer v1
- ID 121 — 2026-06-27 02:05 — ORC Feature Flag & Integration Modes
- ID 122 — 2026-06-27 02:20 — ORC Execution Evidence Recorder v1
- ID 122 — 2026-06-27 02:27 — ORC Production Replay Engine v1
- ID 122 — 2026-06-27 02:33 — ORC Real Production Scenario Suite v1
- ID 123 — 2026-06-27 02:44 — ORC Operational State Analyzer v1
- ID 124 — 2026-06-27 03:01 — ORC Opportunity Classification Engine v1
- ID 125 — 2026-06-27 03:40 — ORC Opportunity Prioritization Engine v2
- ID 126 — 2026-06-27 03:47 — ORC Search Space Builder Decoupling v2
- ID 127 — 2026-06-27 03:57 — ORC Candidate Builder Decoupling v2
- ID 128 — 2026-06-27 04:08 — ORC Decision Engine Input Contract v1

- ID 129 — 2026-06-27 10:11 — ORC Decision Pipeline Orchestrator v1
- ID 130 — 2026-06-27 10:25 — ORC Decision Trace Builder v1
- ID 131 — 2026-06-27 10:37 — ORC Critical Bottleneck Analyzer v1

- ID 132 — 2026-06-27 10:46 — ORC Bottleneck-Driven Opportunity Detection v1

- ID 133 — 2026-06-27 11:34 — ORC Resource Criticality Analyzer v1

- ID 134 — 2026-06-27 11:40 — ORC Constraint Pressure Analyzer v1
- ID 135 — 2026-06-27 12:34 — ORC Operational Priority Analyzer v1

- ID 136 — 2026-06-27 12:39 — ORC Priority-Guided Search Space Builder v1
- ID 137 — 2026-06-27 12:49 — ORC Priority-Aware Candidate Budget v1

- ID 138 — 2026-06-27 14:22 — ORC Exploration Value Estimator v1
- ID 139 — 2026-06-27 14:52 — ORC Search Space Selection Engine v1
- ID 140 — 2026-06-27 15:46 — ORC Future Constraint Propagation Engine v1
- ID 141 — 2026-06-27 16:46 — ORC Branch Ordering Engine v1
- ID 142 — 2026-06-27 16:58 — ORC Search Backtracking Framework v1
- ID 143 — 2026-06-27 17:06 — ORC Backtracking Search Executor v1
- ID 144 — 2026-06-27 17:28 — ORC Branch Pruning Engine v1
- ID 145 — 2026-06-27 17:36 — ORC Iterative Search Solver v1
- ID 146 — 2026-06-27 17:51 — ORC Solution Pool Framework v1
- ID 147 — 2026-06-27 18:04 — ORC Shadow Multi-Solution Search v1
- ID 148 — 2026-06-27 18:21 — ORC Shadow Search Benchmark Harness v1
- ID 149 — 2026-06-27 18:36 — ORC Incremental Replanning Engine v1
- ID 150 — 2026-06-27 18:46 — ORC Concrete Simulation v1 — Apply Candidate Assignments in Shadow Mode
- ID 151 — 2026-06-27 18:54 — ORC Production Objective Evaluator v1
- ID 152 — 2026-06-27 19:05 — ORC Evaluation-Guided Search v1
- ID 153 — 2026-06-27 19:50 — ORC Online Search Learning v1
- ID 154 — 2026-06-27 20:03 — ORC State Equivalence & Transposition Table v1
- ID 155 — 2026-06-27 20:23 — ORC Dominance Pruning v1
- ID 156 — 2026-06-27 20:41 — ORC Operational Criticality Model v1
- ID 157 — 2026-06-27 20:54 — ORC Criticality-Driven Reasoning Budget v1
- ID 158 — 2026-06-27 22:20 — ORC Opportunity Propagation Analyzer v1
- ID 159 — 2026-06-27 22:34 — ORC Adaptive Search Space Builder v1
- ID 160 — 2026-06-27 22:56 — ORC Strategy-Based Candidate Builder v1
- ID 161 — 2026-06-27 23:10 — ORC Strategy Candidate Assignment Synthesis v1
- ID 162 — 2026-06-27 23:51 — ORC Strategy Variant Generator v1
- ID 163 — 2026-06-28 00:08 — ORC Candidate Preselection Engine v1
- ID 164 — 2026-06-28 00:20 — ORC Partial Plan Composer v1

- ID 165 — 2026-06-28 07:55 — ORC Partial Plan Decision Engine v1
- ID 166 — 2026-06-28 08:18 — ORC Global Solution Assembler v1
- ID 167 — 2026-06-28 08:34 — ORC Iterative Global Optimizer v1
- ID 168 — 2026-06-28 09:01 — ORC Dynamic Bottleneck Reasoning v1
- ID 169 — 2026-06-28 09:35 CEST — ORC Future Impact Analyzer v1
- ID 170 — 2026-06-28 10:02 CEST — ORC Decision Feedback Loop v1

- ID 171 — 2026-06-28 10:14 CEST — ORC Operational Delta Benchmark v1

- ID 172 — 2026-06-28 10:43 CEST — ORC Improvement Opportunity Analyzer v1
- ID 173 — 2026-06-28 11:14 CEST — ORC Improvement-Driven Search Calibration v1
- ID 174 — 2026-06-28 12:05 CEST — ORC Evidence-Driven Optimization Cycle v1
- ID 175 — 2026-06-28 12:20 CEST — ORC Evidence-Gated Development Workflow v1
- ID 176 — 2026-06-28 12:39 CEST — ORC Benchmark CLI Operational Evidence v1
- ID 177 — 2026-06-28 13:58 CEST — ORC Opportunity Cost Estimator v1
- ID 178 — 2026-06-28 14:52 CEST — ORC Dependency Chain Flow Optimizer v1
- ID 179 — 2026-06-28 15:18 CEST — ORC Recovery Potential Estimator v1
- ID 180 — 2026-06-28 15:27 CEST — ORC Operational Reasoning Score v1
- ID 181 — 2026-06-28 15:56 CEST — ORC Goal-Oriented Search v1
- ID 182 — 2026-06-28 16:19 CEST — ORC Progressive Commitment Strategy v1
- ID 186 — 2026-06-28 20:11 CEST — ORC Active V4 Bridge v1
- ID 188 — 2026-06-29 UTC — ORC Activation Report v1
- ID 189 — 2026-06-29 UTC — ORC Best Candidate Trace v1
- ID 190 — 2026-06-29 UTC — ORC Active Candidate Planning Output v1

### Operational Planning Quality Metrics (ID 183)

- ID 183 — 2026-06-28 17:52 CEST — Operational Planning Quality Metrics v1

The ORC benchmark now records Operational Planning Quality Metrics (OPQM) as read-only evidence for resource active span, effective work, idle time, fragmentation, talent active span, talent idle time, operational compactness, main-flow continuity quality, and dynamically detected critical-resource spread. These metrics are compared in Operational Delta Benchmark reports for ORC vs V4 and can be consumed by the Improvement Opportunity Analyzer without changing ORC, V4, the official planning, persistence, API, or UI behavior.
- ID 184 — 2026-06-28 18:28 CEST — Real Production Benchmark Scenario v1
- ID 185 — 2026-06-28 18:57 CEST — Operational Quality Root Cause Analyzer v1

### ORC Active V4 Bridge v1 (ID 186)

El botón Generar V4 ejecuta ahora un puente activo ORC controlado: primero calcula V4 como baseline seguro, después evalúa ORC, convierte sólo simulaciones válidas a `EngineOutput`, aplica gates de seguridad y cae automáticamente a V4 cuando ORC no es aplicable. Los diagnostics incluyen `orcActiveBridge`, `usedEngine`, `fallbackReason`, gates y comparación OPQM sin modificar schema ni aplicar tareas al plan oficial.


### ORC Active Candidate Planning Output v1 (ID 190)

El puente activo ORC ahora extrae de forma robusta la planificación real generada por `SimulatedState` desde `operationalStateSnapshot.planning` y rutas compatibles alternativas (`operationalState.planning`, `scheduledTasks`, `assignments`) antes de convertirla a `EngineOutput`. Los gates `complete` y `allPendingNeededPlanned` se calculan sobre las tareas extraídas; si no existe planificación convertible, el fallback seguro a V4 informa `orc_planning_extraction_empty`. `bestCandidateTrace` y diagnostics reportan fuente de extracción, conteos completos, primeras tareas planificadas/pendientes y warnings sin relajar gates, sin modificar V3 y sin cambios de UI.

### ORC Best Candidate Trace v1 (ID 189)

Cada ejecución ORC mediante el puente activo registra `bestCandidateTrace` en diagnostics con número de simulaciones, mejor candidato, score, tareas planificadas y pendientes, hard violations, soft metrics, OPQM, gates superados/fallidos y motivo exacto de descarte aunque finalmente se use V4. La traza incluye evidence read-only y no modifica ORC, V4, Decision Engine, Planning ni UI.

### ORC Activation Report v1 (ID 188)

Cada ejecución de Generar V4 mediante el puente activo ORC añade `orcActivationReport` dentro de diagnostics. El informe consolida el engine seleccionado, motivo legible, tiempo de ejecución, resultado final, listado determinista de gates PASS/FAIL, evidencia de la mejor simulación ORC, comparativa ORC vs V4 (Coach Idle Time, Talent Idle Time, Operational Compactness, Main Flow Continuity y Makespan), explicación del fallback si aplica y una recomendación automática `NEXT_IMPROVEMENT`. Es sólo diagnóstico: no modifica ORC, V4, planificación, persistencia ni la UI principal.

- ID 187 — 2026-06-29 UTC — P1.1 — Mi Día operativo

### P1.1 — Mi Día operativo (ID 187)

Se añade la ruta protegida `/my-day` como primera iteración UI/operativa de “Mi Día”: una pantalla mobile-first para responder qué debe hacer ahora cada usuario operativo, dónde debe estar, qué viene después, y qué avisos requieren atención inmediata.

- Nueva navegación “Mi Día” con acceso a `/my-day`.
- Reutiliza datos existentes de planes, detalle operativo del plan, tareas, locks, asignaciones de staff, scopes de zona/espacio, vínculo operativo del usuario y reloj de producción (`usePlans`, `useDefaultPlanId`, `usePlanOpsData`, `useMeLinks`, `useProductionClock`).
- Filtra el ámbito del usuario vinculado a staff por zona/espacio y el recurso de cámara por tareas que requieren cámaras; si no hay vínculo operativo, muestra una vista general marcada con aviso humano.
- Incluye tarjetas “Ahora” y “Siguiente”, agenda agrupada, avisos operativos y acciones rápidas Start/Finish/Interrupt/Cancel contra el endpoint existente `PATCH /api/tasks/:id/status`.
- No modifica base de datos, migraciones, RLS, modelos Drizzle, policies Supabase, motor V3, motor V4, ORC, locks, endpoints ni lógica backend de planificación.

Validación manual recomendada:

1. Abrir `/my-day` con sesión autenticada.
2. Comprobar selector de plan cuando hay varios planes y estados vacíos cuando no hay planes/tareas.
3. Validar usuario con staff vinculado y scopes por zona/espacio, recurso cámara vinculado y usuario sin vínculo operativo.
4. Confirmar que “Ahora” prioriza tareas `in_progress` y que “Siguiente” muestra la próxima pendiente.
5. Ejecutar Start/Finish/Interrupt/Cancel y verificar refresco de tareas/locks/detalle del plan.

Limitaciones conocidas:

- No implementa reset desde `interrupted` para evitar duplicar reglas de permisos en cliente.
- Los avisos son derivados en cliente y no crean incidencias persistidas.
- La detección de recurso cámara depende de la metadata existente de recurso/tipo devuelta por `/api/resource-types-with-items`.

## ID 187 — Complete V3/V4 Diagnostics Separation

Separates the selected V3/V4 result across diagnostics, JSON copy/download, visual result state, and reset actions. V3 diagnostics are read from `planning_runs`; V4 diagnostics and exports are read from `engine_plan_results`.

## ID 191 — ORC Active Baseline-Seeded Planning v1

- Fecha Europe/Madrid: 2026-06-29 20:28:19 CEST.
- ORC Active ejecuta ORC sobre una semilla de planificación V4 completa para poder refinar una baseline segura sin relajar gates ni modificar V3/UI/schema.
- Diagnostics incluye baselineSeed y traza si ORC reproduce baseline, cambia baseline o cae a V4 fallback.

## ID 192 — ORC Baseline Seed Crash Fix v1

- Fecha Europe/Madrid: 2026-06-29 21:05:47 CEST.
- El baseline seed de ORC Active queda limitado a entradas mínimas de planificación (`taskId`, `startPlanned`, `endPlanned`, `assignedSpace`, `assignedResources`) y el input sembrado sanitiza tareas para evitar que entidades completas de DB/UI entren en `OperationalState`.
- Antes de ejecutar ORC se valida que el seed sea serializable JSON, sin ciclos y por debajo del umbral documentado de 256 KiB; si falla, no se ejecuta ORC y se devuelve V4 fallback con `baseline_seed_not_serializable` o `baseline_seed_too_large`.
- Diagnostics mantiene `baselineSeed` con `applied`, `seededPlanningCount`, `source`, `warnings` y `error` cuando aplica, sin relajar gates, sin cambiar V3, sin tocar schema y sin aplicar ORC si la semilla no es segura.

## ID 193 — ORC Materialize Simulated Planning v1

- Fecha Europe/Madrid: 2026-06-29 22:26:00 CEST.
- ORC materializa explícitamente la planificación simulada con entradas mínimas derivadas de baseline seed o transformaciones de candidato, sin copiar objetos completos de tarea ni inventar tareas sin inicio/fin.
- `SimulatedState` incluye `operationalStateSnapshot.planning` materializado y diagnostics `planningMaterialization` con source, plannedTaskCount, changedTaskCount y warnings serializables.
- Si el candidato no aporta cambios aplicables, ORC preserva la planificación baseline (`baseline_seed_preserved`); si aplica cambios seguros, reporta `candidate_transformations` y el número de tareas modificadas.
- El Active Planner refleja la materialización en `orcSummary`, `bestCandidateTrace` y `orcActivationReport` sin relajar gates, sin modificar V3, UI, schema, Commit Engine ni reglas hard.

## ID 194 — ORC Active No-Op Classification & UI Crash Guard v1

- Fecha Europe/Madrid: 2026-06-29 23:08.
- ORC Active distingue ahora `orcResultKind` entre `orc_changed_plan`, `orc_baseline_preserved` y `v4_fallback` sin modificar V3, schema, gates ni reglas hard.
- Un ORC completo con `planningMaterialization.changedTaskCount === 0` se etiqueta como `usedEngine: "orc_baseline_preserved"`, conserva `fallbackReason: null` y explica que se muestra una planificación completa equivalente al baseline.
- Diagnostics y export JSON incluyen `planningRelationToBaseline` con `changedTaskCount`, `unchangedTaskCount` e `isEquivalentToBaseline`, manteniendo la evidencia completa (`gates`, `baselineSeed`, `planningMaterialization`, `bestCandidateTrace`, `operationalDelta`, `orcActivationReport`).
- El panel de diagnóstico V4/ORC evita renderizar JSON gigante inline: muestra resúmenes compactos defensivos y mantiene Copiar JSON / Descargar JSON como exportación completa.

## ID 195 — V4 Async Result Stabilization & ORC No-Op Classification Fix

- Fecha Europe/Madrid: 2026-06-30 06:21 CEST.
- Generar V4 entra en estados explícitos `loading` y `pending_diagnostics`, selecciona V4 inmediatamente y hace refetch/polling controlado de `engine_plan_results` para que el resultado aparezca sin recargar.
- La UI V4/ORC ya no presenta el diagnóstico pendiente como `Error V4`; sólo muestra error cuando la petición falla realmente.
- La clasificación ORC no-op se estabiliza alrededor de `orcResultKind`, priorizando `orc_baseline_preserved` cuando ORC preserva el baseline completo sin cambios reales y manteniendo `planningRelationToBaseline` en diagnostics/export JSON.

## ID 196 — ORC First Effective Move v1

- Fecha Europe/Madrid: 2026-06-30 14:54:39 CEST.
- ORC Active puede intentar un primer movimiento local mínimo sobre el baseline seed cuando la simulación ORC preserva baseline completo y ya ha superado gates.
- El movimiento compacta de forma determinista un hueco operativo de recurso sin tocar tareas `done`, `in_progress` ni bloqueadas, sin dependencias no verificables y con validación de solapes de recurso, talent y espacio.
- El movimiento sólo se acepta si mantiene la planificación completa, no empeora OPQM crítica y mejora al menos una métrica operacional; si no hay movimiento seguro, conserva baseline con diagnostics `effectiveMoves` serializables.
