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
- ID 225 — 2026-07-02 UTC — ORC Planning Materialization Space Preservation Contract v1
- ID 226 — 2026-07-02 UTC — ORC Main Zone Gap Resource-Block Swap Candidate v1
- ID 227 — 2026-07-02 UTC — ORC Post-Repair Main Zone Continuity Pass v1
- ID 228 — 2026-07-02 UTC — ORC Main Zone Space/Zone Resolution Contract v1
- ID 229 — 2026-07-02 UTC — ORC Composite Summary & Final Main-Zone Continuity Contract v1
- ID 230 — 2026-07-03 UTC — ORC Critical Resource Idle Compression Candidate v1
- ID 231 — 2026-07-04 UTC — ORC Post-Continuity Critical Resource Idle Compression Pass v1
- ID 232 — 2026-07-05 UTC — ORC Post-Continuity Resource Idle Final Summary Wiring v1
- ID 233 — 2026-07-05 UTC — ORC Composite Descendant Selection Summary Contract v1
- ID 234 — 2026-07-05 UTC — ORC Resource Idle Net Value & OPQM Delta Contract v1
- ID 235 — 2026-07-05 UTC — ORC Production Concept Alignment Audit & Macro Objective Contract v1
- ID 236 — 2026-07-05 UTC — ORC Rejected Optional Improvement Materialization & Explainability Gate Fix v1
- ID 237 — 2026-07-05 UTC — ORC Production Wave Planner Blueprint & Macro Day Shape Contract v1
- ID 238 — 2026-07-05 UTC — ORC Macro Main-Zone Block Relayout Candidate v1
- ID 239 — 2026-07-05 UTC — ORC Macro Main-Zone Block Relayout Runtime Wiring & Summary Exposure Fix v1
- ID 240 — 2026-07-05 UTC — ORC Dependency-Aware Macro Main-Zone Block Relayout Candidate v1
- ID 241 — 2026-07-05 UTC — ORC Macro Main-Zone Relayout Global Net Value & Materialization Source Contract v1
- ID 242 — 2026-07-05 UTC — ORC Dependency-Safe Macro Main-Zone Suffix Compaction Candidate v1


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

### ORC Planning Materialization Space Preservation Contract v1 (ID 225)

ORC Active now enforces `ORC-PLANNING-MATERIALIZATION-ID225` for final planning materialization. This fixes the regression where `candidate_transformations` exported `plannedTasks` with `taskId`, `startPlanned`, `endPlanned` and `assignedResources` but without the operational `assignedSpace`, making the plan non-executable for production.

Every final ORC planned task must expose at least `taskId`, `startPlanned`, `endPlanned`, `assignedSpace` and `assignedResources`. Materialization preserves `assignedSpace` from the original baseline seed for unchanged tasks and from the selected candidate transformation for modified tasks; tasks that truly have no operational space keep `assignedSpace: null`, but the field is never omitted. Existing export/UI fields are preserved.

Diagnostics now include `planningMaterialization.materializationContractVersion: "ORC-PLANNING-MATERIALIZATION-ID225"`, `preservedAssignedSpaceCount`, `missingAssignedSpaceFieldCount`, `nullAssignedSpaceCount`, `assignedSpaceContractValid` and `readOnly: true`. `diagnostics.orcSummary.runtimeContract` also publishes `planningMaterializationContractVersion: "ORC-PLANNING-MATERIALIZATION-ID225"`. If the assigned-space materialization contract fails, Active cannot return `orc_changed_plan`; it must use safe fallback with a clear diagnostic instead of exporting an incomplete ORC changed plan.

This ID does not relax Validation, `SPACE_OVERLAP` or `RESOURCE_OVERLAP`, does not change DB/RLS, does not touch V3/V4 behavior, and does not implement the pending main-flow continuity or coach compaction work.

### ORC Main Zone Gap Resource-Block Swap Candidate v1 (ID 226)

After ID224/ID225, ORC can work from a hard-feasible, exportable baseline and preserve `assignedSpace`/`assignedResources` through materialization. ID226 adds an executable `MAIN_ZONE_GAP_RESOURCE_BLOCK_SWAP` candidate for main-zone continuity: when a configured `mainZoneId` has a productive gap and the next main-zone block is blocked by a shared resource occupied by a small non-main-zone block, ORC can propose swapping those blocks locally.

The main zone is resolved from configuration (`constraints.optimizer.mainZoneId` or equivalent operational settings), never from space names and without hardcoded production IDs. V1 is deliberately bounded: it moves blocks of one to four tasks, emits at most three candidates per gap and six per run, stays within the workday, avoids real hard breaks, refuses protected `done`/`in_progress` or locked tasks, and does not perform global search or coach compaction.

The candidate contains real assignments for every moved task and preserves task identity, duration, `assignedSpace`, `assignedResources`, dependencies and locks. Simulation and Validation remain the authority: no `SPACE_OVERLAP`, `RESOURCE_OVERLAP`, dependency, lock, availability or hard-break constraint is relaxed, and no post-pipeline move is applied. If the swap validates and reduces the largest main-zone gap without making the plan worse, Active may commit it through the official Candidate → Transformation → Simulation → Validation → Evaluation → Commit pipeline; otherwise diagnostics explain the blocking reason. No DB, RLS, UI, V3 or V4 changes are included.


### ORC Post-Repair Main Zone Continuity Pass v1 (ID 227)

ID226 generated isolated `MAIN_ZONE_GAP_RESOURCE_BLOCK_SWAP` candidates, but the first candidate pass may deliberately defer them when baseline-overlap repair has priority. ID227 adds a bounded second pass after a valid hard-feasibility repair has been selected and committed, so main-zone continuity is evaluated against the repaired `OperationalState` rather than the original hard-infeasible baseline.

The post-repair pass executes only `MAIN_ZONE_GAP_RESOURCE_BLOCK_SWAP`; it does not re-run baseline-overlap repair, simple main-flow closure, global strategy search, global OR optimization, or coach compaction. Candidates still go through the official Candidate, Transformation, Simulation, Validation, Evaluation, Ranking, and Commit pipeline. If a swap validates, preserves ID224/ID225 contracts, keeps hard feasibility, and reduces the largest main-zone gap, it can beat the repair-only result. If no swap validates, ORC keeps the repair-only hard-feasible plan and reports concrete prefilter or validation reasons.

This iteration does not relax `SPACE_OVERLAP`, `RESOURCE_OVERLAP`, dependencies, locks, protected task rules, or hard breaks; it does not apply post-pipeline moves; and it does not change DB, RLS, UI, V3, or V4. It preserves ID224 runtime export diagnostics and ID225 `assignedSpace` materialization.


### ORC Main Zone Space/Zone Resolution Contract v1 (ID 228)

ID228 adds `ORC-MAIN-ZONE-RESOLUTION-ID228` to the ORC runtime contract and main-zone continuity diagnostics. The ORC now distinguishes a logical main `zone` target from a physical main `space` target instead of treating `optimizerMainZoneId` as a space id in every case.

When the main target resolves to a zone, ORC expands that zone to associated spaces using the exported zone/space mapping and task zone metadata. Continuity candidates detect main entries by `task.zoneId`, planning-entry `zoneId`, task `spaceId`, and `assignedSpace`/planning `spaceId`, so a v4-34-style gap `11:20–12:05` in physical space 48 is detected even when `optimizerMainZoneId` is logical zone 1.

The resolver is read-only, emits warnings for ambiguous ids, and never infers the main target by name; it does not hardcode Plató 7, space 48, resource ids, or task ids. Simulation, Validation, Evaluation, and Commit remain official, `SPACE_OVERLAP`/`RESOURCE_OVERLAP` and locks/dependencies are not relaxed, no DB/RLS/UI changes are included, and ID224 plus ID225 diagnostics and assigned-space preservation remain intact.


### ORC Composite Summary & Final Main-Zone Continuity Contract v1 (ID 229)

ID228 allowed ORC to select a real post-repair `MAIN_ZONE_GAP_RESOURCE_BLOCK_SWAP` for main-zone continuity. ID229 fixes the diagnostics contract around that selected composite result: the final `mainZoneContinuity` summary is rebuilt from the selected final simulation instead of staying stale from an earlier pass that could still report `main_zone_not_configured`.

The final summary now distinguishes the targeted gap closed by the candidate from full final main-zone continuity. `mainZoneGapResourceBlockSwap` and `postRepairMainZoneContinuityPass` publish targeted-gap fields such as `targetedGapBeforeMinutes`, `targetedGapAfterMinutes`, `targetedGapReductionMinutes`, targeted previous/next task ids, targeted windows, and `continuityMetricScope: "targeted-gap"`. The final `mainZoneContinuity` summary publishes final gap diagnostics (`finalMainZoneGapCount`, `finalLargestMainZoneGapMinutes`, `finalGaps`) with `gapComputationScope: "final-selected-planning"`, a hard-break exclusion policy, and a break coverage policy that does not treat flexible meal windows as hard breaks without concrete placeholder/state evidence.

Composite materialization diagnostics now explain both comparison baselines: original V4 seed and repaired baseline. `planningMaterialization` adds `changedTaskCountFromOriginalBaseline`, `changedTaskIdsFromOriginalBaseline`, `changedTaskCountFromRepairedBaseline`, `changedTaskIdsFromRepairedBaseline`, `changeSources`, `compositeTransformationsApplied`, `compositeMaterializationContractVersion: "ORC-COMPOSITE-MATERIALIZATION-ID229"`, and `summaryContractValid`. The documented change sources are baseline-overlap repair followed by post-repair main-zone continuity.

The runtime contract now publishes `ORC-COMPOSITE-SUMMARY-ID229`, `ORC-COMPOSITE-MATERIALIZATION-ID229`, and `ORC-FINAL-MAIN-ZONE-CONTINUITY-ID229`. `orcSummary` also reports `summaryContractValid`, actionable `summaryContractWarnings`, and `finalSummaryBuiltFromSelectedSimulation`. No optimization capability is added: there is no DB/RLS/UI change, no V3/V4 rewrite, no global search, no coach compaction, no new candidate builder, and ID224, ID225, and ID228 remain preserved.



### ORC Critical Resource Idle Compression Candidate v1 (ID 230)

After ID229, ORC can repair hard feasibility, close the selected main-zone gap, and explain composite materialization from the selected final simulation. ID230 adds a bounded executable candidate family, `CRITICAL_RESOURCE_IDLE_COMPRESSION`, to start reducing operational waiting time for critical coaches/resources once the base plan is already hard-feasible and main-zone continuity is protected.

V1 is deliberately conservative: it detects idle gaps from real `assignedResources`, optionally prioritizes resources surfaced by OPQM/root-cause diagnostics, and only generates direct pull-forward candidates for the immediately following small block of one to four tasks. It preserves task identity, duration, `assignedSpace`, `assignedResources`, dependencies, locks, and protected statuses; it never hardcodes resource ids, space ids, studio names, or task ids.

The candidate does not displace tasks from other resources, does not run global search, does not compact all coaches, and does not apply post-pipeline moves. Every accepted movement still goes through Candidate, Prefilter, Transformation, Simulation, Validation, Evaluation, Ranking, and Commit. `SPACE_OVERLAP`, `RESOURCE_OVERLAP`, dependency, lock, availability, hard-break, assigned-space, summary, and main-zone continuity constraints remain strict.

Diagnostics now expose `runtimeContract.criticalResourceIdleCompressionContractVersion: "ORC-CRITICAL-RESOURCE-IDLE-COMPRESSION-ID230"` and `orcSummary.criticalResourceIdleCompression` with target resources, candidate counts, lineage/simulation counts, selected commit status, moved task ids, target idle before/after, gap before/after, prefilter discard reasons, actionable generation blockers, warnings, and `readOnly: true`. If no direct pull-forward window is viable, ORC keeps the previous valid plan and reports concrete blockers such as protected block, space occupied, resource conflict, hard break, dependency block, main-zone regression, makespan increase, or no direct window.

This iteration preserves ID224, ID225, ID228, and ID229; it has no DB, RLS, UI, V3, or V4 changes.

### ID 231 — ORC Post-Continuity Critical Resource Idle Compression Pass v1

ID230 creó el candidate `CRITICAL_RESOURCE_IDLE_COMPRESSION`, pero el runtime real necesita ejecutarlo después de que exista un planning compuesto hard-feasible. ID231 añade un tercer pass acotado tras la reparación baseline-overlap y la continuidad post-repair de main-zone. El pass reutiliza el builder ID230, parte del selected simulation válido, no usa el baseline inicial hard-infeasible, y sigue el pipeline oficial Candidate → Prefilter → Transformation → Simulation → Validation → Evaluation → Ranking → Commit.

Si la compresión valida, ORC puede seleccionar un resultado compuesto con tres fuentes: `baselineOverlapRepair`, `postRepairMainZoneContinuity` y `criticalResourceIdleCompression`. Si no valida, conserva el resultado ID229 y publica blockers accionables sin fallback innecesario. No relaja hard constraints, locks, dependencias, SPACE_OVERLAP ni RESOURCE_OVERLAP; no hay cambios DB/RLS/UI/V3. Se preservan ID224, ID225, ID228, ID229 e ID230. El runtime contract expone `postContinuityResourceIdleCompressionPassVersion: "ORC-POST-CONTINUITY-RESOURCE-IDLE-PASS-ID231"` y `resourceIdleCompositeSelectionPolicy: "valid-committed-continuity-and-resource-compactness-first-v2"`.

### ID 232 — ORC Post-Continuity Resource Idle Final Summary Wiring v1

ID231 añadió el pass de compactación post-continuity, pero se detectó un wiring de integración: el pass podía recibir `candidateResult.summary.mainZoneContinuity`, un diagnóstico del primer candidate-generation pass que puede estar stale cuando baseline-overlap repair retrasa main-zone por `baseline_overlap_repair_priority_initial_pass`.

ID232 corrige el pass para usar el selected composite summary construido desde la simulation final ID229: primero plan hard-feasible, después main-zone post-repair, y solo entonces compactación de recurso crítico. ID231 ya no debe bloquearse por un falso `main_zone_not_configured` si la main-zone final seleccionada está configurada; acepta `configured === true` o `mainZoneConfigured === true` en el summary compuesto seleccionado.

La materialización base de compactación conserva el contrato `ORC-COMPOSITE-MATERIALIZATION-ID229` y las fuentes previas `baselineOverlapRepair` y `postRepairMainZoneContinuity`; si la compactación valida, añade `criticalResourceIdleCompression` como tercera fuente. Si no hay ventana viable, se conserva el resultado ID229 con blockers concretos.

No se añaden nuevas capacidades de optimización: no hay búsqueda global, compactación global de coaches ni movimientos post-pipeline. No hay cambios DB/RLS/UI/V3/V4, y se preservan ID224, ID225, ID228, ID229, ID230 e ID231.

### ID 233 — ORC Composite Descendant Selection Summary Contract v1

ID232 permitió ejecutar resource-idle compression después de la continuidad post-repair sobre el planning compuesto seleccionado. El JSON `engine-result-plan-27-v4-39.json` mostró que la mejora validaba y estaba committeada, pero ORC hacía fallback por un falso negativo del summary contract: la selected simulation final era la compresión de recurso crítico y el contrato antiguo esperaba que la simulation de continuidad post-repair fuese también la selección directa final.

ID233 documenta explícitamente que una selected simulation final puede ser una mejora descendiente de otras mejoras committeadas. El summary contract ahora construye `compositeSimulationLineage` y reconoce ancestors de la cadena `baseline-overlap repair → post-repair main-zone continuity → critical-resource idle compression`, usando `sourceSimulationId`, `baseCompositeSimulationId` y `planningMaterialization.changeSources` como evidencia serializable.

Con este contrato se evita el falso warning `post_repair_commit_not_reflected_in_simulation_selection` cuando postRepair está reflejado como ancestro compuesto. Además, `orcSummary`, `mainZoneContinuity`, `criticalResourceIdleCompression` y `simulationSelection` publican campos explícitos para la final selected simulation y la final candidate family, de modo que los campos legacy de continuidad no se confundan con la selección final.

No se añaden nuevas capacidades de optimización: no hay nuevos candidate builders, búsqueda global ni movimientos post-pipeline. No hay cambios DB/RLS/UI/V3/V4. Se preservan ID224, ID225, ID228, ID229, ID230, ID231 e ID232, manteniendo hard feasibility, assignedSpace contract, baseline-overlap repair, post-repair main-zone continuity y critical-resource idle compression.


### ID 234 — ORC Resource Idle Net Value & OPQM Delta Contract v1

ID233 permitió aceptar una simulation final descendiente del plan compuesto, pero el JSON `engine-result-plan-27-v4-40.json` demostró un riesgo operativo: `critical-resource idle compression` podía declararse como reducción de idle aunque la métrica OPQM global `resourceIdleTime` del recurso objetivo no bajase.

ID234 separa explícitamente la reducción de gap local del recurso, la reducción real de idle OPQM, la reducción de fragmentación y el delta de `operationalCompactness`. El contrato `runtimeContract.resourceIdleNetValueContractVersion` expone `ORC-RESOURCE-IDLE-NET-VALUE-ID234`, y el summary de `criticalResourceIdleCompression` añade evidencia `netValue` read-only contra el plan base compuesto inmediato, no sólo contra V4.

La compresión opcional de recurso sólo puede seleccionarse si mantiene hard feasibility, assignedSpace contract, summary contract, makespan y continuidad de main-zone, y si demuestra valor neto: baja `resourceIdleTime`, o baja fragmentación sin empeorar compactness, o aporta una ganancia explícita de compactación sin empeorar talent idle ni main-flow continuity. El bypass de baseline repair sigue disponible para reparar un baseline hard-infeasible, pero no puede justificar optimizaciones opcionales posteriores con valor neto negativo.

Si resource compression no aporta valor neto, ORC conserva el plan compuesto ID229/continuity seleccionado y publica el rechazo `resource_idle_net_value_not_positive` sin caer a fallback. Si aporta valor neto, se acepta como tercera fuente de materialización junto a baseline-overlap repair y post-repair main-zone continuity. No hay cambios DB/RLS/UI/V3/V4, y se preservan ID224, ID225, ID228, ID229, ID230, ID231, ID232 e ID233.


### ID 235 — ORC Production Concept Alignment Audit & Macro Objective Contract v1

Tras ID233/ID234, ORC ya puede reparar un baseline hard-infeasible, cerrar un gap local de main-zone y evaluar si la compresión de recursos aporta valor neto OPQM. El siguiente problema detectado por producción no era otro solape concreto, sino que un planning hard-feasible y localmente optimizado podía seguir siendo conceptualmente malo como planificación real.

ID235 añade una auditoría read-only `orcSummary.productionConceptAlignment` con contrato `ORC-PRODUCTION-CONCEPT-ALIGNMENT-ID235` y exporta `runtimeContract.productionConceptAlignmentContractVersion`. La auditoría no mueve tareas, no crea candidate builders, no aplica búsqueda global ni modifica V3/V4, DB, RLS o UI. Sólo mide y explica si el plan final seleccionado se parece a un planning operativo real.

La auditoría mide continuidad visible de la main-zone resuelta por ID228, balance de coaches/recursos críticos detectados dinámicamente, espera desde IN hasta la primera tarea productiva, espera desde última tarea productiva hasta OUT, semántica de comida flexible frente a parón global, day shape/start-later y bloques/cambios de coach en main-zone. Una ventana flexible de comida no se considera parón global salvo que exista hard break real o una ocupación concreta aplicable.

El summary normaliza root causes accionables como `main_zone_visible_idle`, `critical_resource_span_imbalance`, `call_time_not_linked_to_first_productive_task`, `departure_not_linked_to_last_required_task`, `meal_window_over_blocking_suspected`, `macro_day_shape_missing` y `local_optimization_cannot_fix_macro_shape`. Esta evidencia prepara la siguiente iteración: diseñar un macro planner / production wave planner en lugar de seguir acumulando micro-correcciones sobre una forma de día débil.


### ID 236 — ORC Rejected Optional Improvement Materialization & Explainability Gate Fix v1

ID235 añadió una auditoría conceptual read-only y el JSON v4-42 demostró que esa auditoría funciona, pero también expuso un falso fallback: ORC podía rechazar correctamente una compresión opcional de recurso por valor neto negativo y aun así contaminar la materialización aplicada, generando `composite_materialization_change_sources_do_not_explain_final_diff`.

ID236 corrige el contrato de explainability y materialización compuesta: si `criticalResourceIdleCompression` se ejecuta pero `selectedAsCommit === false`, permanece como diagnóstico read-only en `orcSummary.criticalResourceIdleCompression` y `orcSummary.rejectedOptionalImprovements`, pero no aparece en `planningMaterialization.changeSources`, no se registra en `compositeTransformationsApplied` y no cuenta como diff aplicado. La validación final compara el baseline original contra la selected final simulation real y exige que sólo las fuentes aplicadas expliquen el diff.

Production Concept Alignment puede declarar un plan `conceptually_misaligned` y `macroPlannerRequired === true`, pero esa auditoría no invalida por sí sola un plan hard-feasible, con assignedSpace válido y materialización explicable. Si el plan compuesto ID229 sigue siendo válido, Active devuelve `usedEngine: "orc"` con `fallbackReason: null` en lugar de caer a V4 fallback.

No hay cambios DB/RLS/UI/V3/V4, no se añaden capacidades nuevas de optimización, no se implementa macro planner todavía y no se relajan constraints hard. Esta corrección prepara la siguiente iteración real: macro planner / production wave planner.


### ID 237 — ORC Production Wave Planner Blueprint & Macro Day Shape Contract v1

ID236 estabilizó la salida ORC con auditoría conceptual: el motor puede aceptar el plan compuesto hard-feasible, mantener `fallbackReason: null` y preservar los contratos de summary/materialización aunque `productionConceptAlignment` declare que el plan sigue conceptualmente desalineado.

La auditoría ID235/ID236 demuestra que el problema actual es macro, no micro: la main-zone puede quedar con huecos visibles, la ventana flexible de comida puede confundirse operativamente con un parón global, los coaches/recursos críticos pueden tener spans desequilibrados, y las políticas de release y cambios de coach aún no están configuradas.

ID237 añade un blueprint read-only del Production Wave Planner en `orcSummary.productionWavePlanner` y exporta `runtimeContract.productionWavePlannerBlueprintContractVersion === "ORC-PRODUCTION-WAVE-PLANNER-BLUEPRINT-ID237"`. El blueprint no mueve tareas, no cambia selected simulation, no afecta gates, no provoca fallback y no modifica `plannedTasks`.

El blueprint define objetivos macro ordenados, una forma propuesta de jornada, ventanas recomendadas de main-zone y support work, bloques de coach/main-zone configurables, balance dinámico de coaches/recursos críticos, flujo de talentos desde IN hasta primera tarea y desde última tarea hasta OUT, semántica de comida flexible con rotación en vez de blank global, release/start-later y readiness para candidates macro.

No hay cambios DB/RLS/UI/V3/V4, no se crean candidates que muevan tareas, no se implementa commit macro y no se relajan constraints hard. La siguiente iteración queda preparada para convertir `macro_main_zone_block_relayout` en candidate oficial del ORC.


### ID 238 — ORC Macro Main-Zone Block Relayout Candidate v1

ID237 creó el blueprint read-only de Production Wave Planner y el JSON v4-44 confirmó que el siguiente candidate necesario es `macro_main_zone_block_relayout`: el ORC tenía un plan hard-feasible, sin fallback y con contratos válidos, pero conceptualmente desalineado por un gap visible de main-zone durante una ventana flexible de comida.

ID238 implementa el primer candidate macro real del ORC: `MACRO_MAIN_ZONE_BLOCK_RELAYOUT`. Genera candidates oficiales de familia `macro-production-wave` para mover bloques completos posteriores de main-zone hacia el gap visible, preservando `assignedSpace`, `assignedResources`, locks, estados protegidos, dependencias, disponibilidad y hard breaks. La comida flexible no se trata como hard stop cuando `productiveWorkAllowedInsideMealWindow` permite trabajo productivo.

El relayout pasa por el pipeline oficial completo: candidate generation, hard prefilter, transformation, simulation, validation, evaluation, ranking y commit. Si el candidate valida, mantiene hard feasibility, no aumenta makespan y aporta valor macro positivo, puede seleccionarse como commit y publicar `finalSelectedCandidateFamily: "macro-main-zone-block-relayout"` junto con `planningMaterialization.changeSources.macroMainZoneBlockRelayout`. Si no valida o no aporta valor, queda como diagnóstico read-only y se conserva el plan anterior ID236/ID237 sin fallback.

No hay cambios DB/RLS/UI/V3/V4, no se relajan `SPACE_OVERLAP`, `RESOURCE_OVERLAP`, dependencias hard ni locks, y no se introducen movimientos post-pipeline. Se preservan las garantías ID224 a ID237. Esta iteración empieza a corregir la forma de producción del día —mantener viva la zona principal— en lugar de limitarse a parches micro.


### ID 239 — ORC Macro Main-Zone Block Relayout Runtime Wiring & Summary Exposure Fix v1

ID238 passed technical tests, but the real v4-45 runtime JSON showed that the macro pass was not entering the active ORC pipeline: the runtime contract, `orcSummary.macroMainZoneBlockRelayout`, selection diagnostics and macro materialization source were missing even though the Production Wave Planner recommended `macro_main_zone_block_relayout`.

ID239 wires `runMacroMainZoneBlockRelayoutPass` into runtime after baseline overlap repair, post-repair main-zone continuity, critical-resource idle compression, production concept alignment and the ID237 blueprint. The pass is now always exposed in summary: it either executes and selects a valid macro simulation, executes and rejects candidates with blockers, or reports explicit non-execution blockers without pretending the pass ran.

When a macro simulation is selected, final summaries are recomputed from that macro simulation, including main-zone continuity, production concept alignment, Production Wave Planner, planning materialization, composite lineage and operational delta consumers. Materialization includes `macroMainZoneBlockRelayout` only when the macro candidate is actually applied; rejected macro improvements remain diagnostics and preserve the previous ID236/ID237 plan without fallback.

No DB/RLS/UI changes are included, no new macro capability is added, and hard constraints are not relaxed. ID224 through ID238 guarantees are preserved while making ID238 visible in real ORC runtime JSON.

### ID 240 — ORC Dependency-Aware Macro Main-Zone Block Relayout Candidate v1

ID239 corrected the ID238 runtime wiring: the macro pass executes, appears in ORC summaries, and does not fallback when no macro candidate validates. The v4-46 JSON showed the next operational issue: the single macro candidate was discarded by `DIRECT_DEPENDENCY_BROKEN` because it tried to move a macro block without preserving prerequisite tasks.

ID240 adds a read-only macro dependency-chain analysis and dependency-aware macro variants. The `MACRO_MAIN_ZONE_BLOCK_RELAYOUT` builder now records `dependencyAnalysis`, computes `dependencySafeStart` / `latestPrerequisiteEnd`, prevents moving prerequisites behind dependents, and emits dependency-preservation metadata for each executable candidate. It can generate safe partial improvements such as `pull-dependency-ready-main-zone-block`, `pull-prerequisite-chain-then-main-zone-block`, and `dependency-preserving-split-main-zone-block`; if no safe variant exists, it reports explicit blockers and preserves the previous plan without fallback.

The macro value gate can accept a partial main-zone idle reduction when hard feasibility, assigned-space preservation, locks, dependencies, makespan and flexible-meal semantics remain safe. Runtime summaries expose `runtimeContract.macroMainZoneDependencyAwareRelayoutContractVersion === "ORC-MACRO-MAIN-ZONE-DEPENDENCY-AWARE-RELAYOUT-ID240"` plus dependency-safe/blocked candidate counts, prevented dependency pairs, selected preservation mode, and selected prerequisite movement diagnostics.

No DB, RLS, UI, V3, hard-constraint relaxation, post-pipeline moves, global OR optimizer, macro meal rotation or new candidate family changes are included. ID224 through ID239 contracts remain preserved while the macro relayout becomes dependency-aware.


### ID 241 — ORC Macro Main-Zone Relayout Global Net Value & Materialization Source Contract v1

ID240 hizo dependency-aware el macro relayout, pero el JSON v4-47 demostró que un candidate puede ser localmente válido y aun así ser globalmente neutro o peor para la forma del día: el gate anterior aceptaba reducción de gap local sin exigir reducción global de idle visible de la zona principal. También se detectó que la fuente macro declaraba sólo `movedTaskIds`, aunque el diff final podía incluir tareas adicionales desplazadas por la simulación.

ID241 añade el evaluator global `macroMainZoneGlobalNetValueEvaluator`: exige que el total visible main-zone idle baje, rechaza candidates que redistribuyen huecos sin mejorar la continuidad global, bloquea empeoramientos significativos de `mainFlowContinuityQuality` y `operationalCompactness`, y expone el contrato `ORC-MACRO-MAIN-ZONE-GLOBAL-NET-VALUE-ID241`. Un macro local positivo pero global neutro queda como diagnóstico read-only en `rejectedMacroImprovements`, no como commit ni como fuente aplicada.

Cuando un macro sí se acepta, la fuente `planningMaterialization.changeSources.macroMainZoneBlockRelayout` se completa mediante diff real base post-repair-continuity → selected macro simulation e incluye declared moved ids, inferred changed ids, additional changed ids, source/selected simulation ids y `diffScope`. Esto preserva explainability: no se permite que un macro seleccionado deje diffs inexplicados, y si el macro se rechaza se conserva el mejor plan válido anterior sin fallback.

No hay cambios DB/RLS/UI, no se relajan hard constraints, dependencias, locks, `SPACE_OVERLAP`, `RESOURCE_OVERLAP` ni `DIRECT_DEPENDENCY_BROKEN`, no se añaden candidate families ni movimientos post-pipeline. Se preservan ID224 a ID240.

### ID 242 — ORC Dependency-Safe Macro Main-Zone Suffix Compaction Candidate v1

ID241 corrigió el gate global de valor macro y rechazó correctamente el candidate local-only observado en el JSON v4-48 cuando sólo redistribuía el hueco visible sin reducir el idle global de main-zone. El problema restante era que `MACRO_MAIN_ZONE_BLOCK_RELAYOUT` podía mover subbloques dependency-safe, pero no compactaba el sufijo posterior completo de la zona principal, por lo que podía cerrar un hueco local y crear huecos compensatorios más tarde.

ID242 añade la variante oficial `dependency-safe-main-zone-suffix-compaction` dentro de la misma estrategia `MACRO_MAIN_ZONE_BLOCK_RELAYOUT`, familia `macro-production-wave` y tipo `main-zone-block-relayout`. La variante toma el sufijo productivo posterior completo de main-zone, preserva `assignedSpace`, `assignedResources`, duración, locks, estados protegidos y orden estable, y lo adelanta con un cursor tarea a tarea que espera sólo por dependencias, disponibilidad real de espacio/recurso o hard breaks reales. La comida flexible no se trata como hard stop.

La variante no mueve OUT, transportes ni release en esta iteración. Si reduce el idle visible global de main-zone y pasa el gate global ID241, puede commitear y materializar una fuente `planningMaterialization.changeSources.macroMainZoneBlockRelayout` completa por diff real. Si no reduce el idle global o falla feasibility, queda rechazada como diagnóstico con blockers específicos y se conserva el plan anterior sin fallback.

No hay cambios DB, RLS ni UI. Se preservan los contratos operativos ID224 a ID241 y se añade `runtimeContract.macroMainZoneSuffixCompactionContractVersion === "ORC-MACRO-MAIN-ZONE-SUFFIX-COMPACTION-ID242"`.

### ID 243 — ORC Macro Main-Zone Dominance Gate & Suffix Summary Consistency v1

ID243 añade el dominance gate `ORC-MACRO-MAIN-ZONE-DOMINANCE-GATE-ID243` y el contrato de summary `ORC-MACRO-MAIN-ZONE-SUFFIX-SUMMARY-CONSISTENCY-ID243`. ID242 generó por primera vez una suffix compaction real capaz de reducir el idle visible global de main-zone de 135 a 45 minutos; el JSON v4-49 demostró que el gate global aún podía rechazar esa mejora por métricas secundarias. ID243 separa primary main-zone gain, hard safety y secondary metric impact para que una mejora fuerte de plató principal pueda dominar una regresión moderada y configurable de compactness.

`mainFlowContinuityQuality` raw deja de ser veto absoluto cuando contradice métricas visibles primarias claras sin nuevos gaps visibles: se serializa como `ambiguous_not_gate_blocking` y queda como warning diagnóstico. La regresión moderada de `operationalCompactness` pasa a warning `macro_operational_compactness_regression_allowed_by_main_zone_dominance` mientras permanezca bajo el umbral configurable. También se corrigen los summaries de suffix compaction (`selectedSuffixCompaction`, valid/rejected suffix simulation ids, selected suffix simulation y reasons). Si el macro se acepta, la materialización explica todos los diffs desde la macro simulation y los summaries finales se recomputan desde esa simulation. No hay cambios DB/RLS/UI y se preservan ID224 a ID242; el siguiente paso probable será `macro_release_wave` para reducir esperas de salida tras compactar el plató principal.


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

## ID245 — Production Wave Planner v1: Dependency Bundle Candidate

ID245 convierte el Production Wave Planner de blueprint diagnóstico en una primera capacidad ejecutiva ORC para huecos reales del flujo principal. El caso observado en `engine-result-plan-27-v4-51.json` ya llegaba al motor final ORC (`usedEngine === "orc"`, `orcResultKind === "orc_changed_plan"`) y mantenía los gates de explicabilidad/materialización de ID244, pero conservaba un hueco visible de 45 minutos del plató principal y el macro relayout existente sólo compactaba sufijos sin mover prerequisitos.

La nueva familia `macro-production-wave-dependency-bundle` se genera desde oportunidades `PRODUCTION_WAVE_GAP` cuando el siguiente bloque del flujo principal depende de tareas pendientes movibles. El candidato agrupa la tarea principal dependiente, prerequisitos directos/transitivos hasta el límite de política y la trazabilidad de movimientos, y entra por el pipeline oficial ORC: SEE/candidate generation, transformación por assignments, simulación, validación hard, evaluación, commit y evidence. Si el bundle no mejora o no valida, el ORC conserva la mejor solución previa, incluido `macro-main-zone-block-relayout` de ID244.

La política explícita `PRODUCTION_WAVE_POLICY_V1` se resuelve con `resolveProductionWavePolicy` y se serializa en diagnostics como `productionWavePolicy`. Los defaults iniciales proceden de `defaultProfile`: máximo de idle visible conservador de 10 minutos, 2 bloques de main flow, dos bloques alrededor de comida flexible, 2 bloques preferidos de coach, límites de switches 4/2/2, comida flexible no hard-stop, release desactivado, budget de 6 candidatos, 12 simulaciones, bundle máximo 12 tareas, profundidad 2 y soft runtime 60000 ms. Los campos defaultados se publican en `defaultedFields`; ya no son warnings críticos de configuración ausente.

El JSON final publica también `orcRuntimeMetrics` bajo `diagnostics.orcRuntimeMetrics` y dentro de `diagnostics.orcSummary.orcRuntimeMetrics`. Incluye versión `ORC_RUNTIME_METRICS_V1`, tiempo de ejecución, motor seleccionado, fallback, familia/candidato/simulación seleccionados, conteos de candidatos/simulaciones, oportunidades detectadas, pruned candidates, métricas de idle visible antes/después, largest visible gap antes/después, makespan/talent idle y versión/fuente de política.

La evidence específica `productionWaveDependencyBundle` indica si se ejecutó la búsqueda, número de candidatos, si fue commit, IDs seleccionados, gap objetivo antes/después, tareas main/prerequisite/support/resource-blocker movidas, candidatos rechazados, razones de rechazo, política usada y una explicación humana operativa.

Archivos principales modificados:

- `engine/orc/macro/productionWavePolicy.ts`: resolver puro y defaults de `PRODUCTION_WAVE_POLICY_V1`.
- `engine/orc/macro/productionWavePlannerBlueprint.ts`: integración de policy y eliminación de falsos missing config para defaults.
- `engine/orc/macro/productionWaveDependencyBundleCandidate.ts`: detección SEE-like de gaps, generación del candidato dependency-bundle y transformación trazable.
- `engine/orc/active/runMacroMainZoneBlockRelayoutPass.ts`: competencia del bundle con el macro relayout existente usando el pipeline ORC.
- `engine/orc/active/orcActivePlanner.ts`: diagnostics `productionWavePolicy`, `productionWaveDependencyBundle` y `orcRuntimeMetrics`.
- `engine/orc/analysis/productionConceptAlignmentAudit.ts`: defaults serializables para política de bloques coach en auditoría conceptual.
- Specs nuevas en `engine/orc/macro/productionWavePolicy.spec.ts` y `engine/orc/macro/productionWaveDependencyBundleCandidate.spec.ts`.

Tests añadidos/cubiertos: resolución de policy, defaults no críticos, detección de dependency bundle, trazabilidad de candidate state y rechazo por lock/done. Benchmarks ORC deben interpretarse con los nuevos campos runtime: `selectedCandidateFamily`, idle visible before/after, largest gap before/after, candidate count y simulated state count. El escenario recomendado siguiente es `ID245_PRODUCTION_WAVE_DEPENDENCY_BUNDLE_MAIN_FLOW_GAP`: debe demostrar cierre/reducción del gap que el suffix relayout no podía cerrar o explicar blockers hard reales.

Criterios de aceptación: `diagnostics.usedEngine` sigue siendo ORC cuando los gates pasan; `diagnostics.gates.explainableDecision === true`; `planningMaterialization.unexplainedChangedTaskIds` permanece vacío; `productionWavePolicy.version === "PRODUCTION_WAVE_POLICY_V1"`; `orcRuntimeMetrics.version === "ORC_RUNTIME_METRICS_V1"`; y si el hueco visible se mantiene, `productionWaveDependencyBundle` debe explicar con razones concretas por qué no se puede cerrar sin romper locks, estados protegidos, dependencias, disponibilidad o solapes.

Siguiente paso recomendado: ampliar el bundle para incluir soporte dependiente posterior y resource blockers reordenables con ventanas de disponibilidad más ricas, manteniendo la misma política versionada y el pipeline ORC completo.

## ID246 — Production Wave Dependency Closure & Explainable Rejection

ID246 consolida el candidate `macro-production-wave-dependency-bundle` introducido en ID245 para que no proponga movimientos con dependencias transitivas incompletas. La evidencia observada en `engine-result-plan-27-v4-52.json` mostraba que ORC ya ejecutaba (`usedEngine === "orc"`, `orcResultKind === "orc_changed_plan"`), detectaba un `PRODUCTION_WAVE_GAP` de 45 minutos y generaba `candidate:production-wave-dependency-bundle:1`, pero el candidato era descartado por `DIRECT_DEPENDENCY_BROKEN` con el patrón `358 -> 357`. El bundle había movido prerequisitos directos, pero no cerraba de forma operativa todo el grafo transitivo ni explicaba por qué quedaba rechazado (`rejectionReasons: []`).

La nueva utilidad pura `buildProductionWaveDependencyClosure` calcula el cierre recursivo desde los task IDs iniciales del bundle hasta `productionWavePolicy.runtime.maxBundleSearchDepth`, respetando `maxDependencyBundleSize`, locks y estados protegidos (`done` / `in_progress`). Devuelve `includedTaskIds`, roles (`main`, `prerequisite`, `support`, `resource_blocker`), profundidad por tarea, dependencias bloqueadas, tareas faltantes/protegidas, `depthReached`, `truncatedByBudget`, `hardBlockers`, warnings y `dependencyClosureComplete`.

La decisión de viabilidad queda separada de la validación hard posterior: si una dependencia necesaria queda fuera por protección, budget, profundidad o ausencia de planificación, el bundle no se presenta como candidato normal para que luego falle con `direct-dependency-broken`. En su lugar se registra como rechazo explicable `dependency_closure_incomplete`, con motivos técnicos como `missing_transitive_prerequisite`, `protected_prerequisite`, `dependency_depth_limit_reached` o `dependency_bundle_budget_exceeded`. `DIRECT_DEPENDENCY_BROKEN` sigue existiendo como validación hard general, pero el Production Wave Bundle aporta un diagnóstico más accionable antes de simular un candidato incompleto.

Cuando el cierre es completo y movible, el candidato incluye la tarea main, prerequisitos directos y transitivos, soporte/resource blockers declarados por el cierre, y un `movementTrace` por tarea con `previousStart`, `previousEnd`, `proposedStart`, `proposedEnd`, `dependencyRole`, `dependencyDepth`, `reason` y `sourceGapId`. Esto permite interpretar el JSON final como un paquete hard-feasible antes de entrar al pipeline de simulación/validación ORC.

Si el bundle se rechaza, `productionWaveDependencyBundle` ya no queda con razones vacías: publica `rejectionReasons`, `rejectedCandidateIds`, `rejectedCandidateDetails`, `blockedDependencyPairs`, `missingDependencyTaskIds`, `dependencyClosureComplete: false` y una explicación humana que identifica las dependencias bloqueantes y confirma que se conserva la mejor solución anterior. Si el bundle fue descartado o no fue commit, no debe interpretarse como candidato seleccionado de macro commit; queda registrado como mejora opcional de production wave rechazada con evidence propia.

Tests añadidos/cubiertos para ID246:

- Closure recursivo completo: `B -> P1 -> P0` pending/movible incluye todos los prerequisitos y marca `dependencyClosureComplete === true`.
- Closure bloqueado: `P0` protegido por estado/lock rechaza antes de construir candidato viable, no modifica la tarea protegida y explica `protected_prerequisite`.
- Caso tipo plan 27: el patrón `358 -> 357` se reproduce en fixture y verifica que la dependencia transitiva no se omite silenciosamente.
- Regresión de evidence: un rechazo del bundle deja `rejectionReasons` y candidate details poblados, nunca `selectedAsCommit: false` con razones vacías.

Benchmarks y checks recomendados siguen siendo `npm run check`, `npm run test:engine:full` y `npm run benchmark:orc`. Para iteraciones rápidas puede usarse `npm run test -- --test-name-pattern "ProductionWave|DependencyBundle|DependencyClosure|ORC|macro|runtime|policy"` junto con el benchmark ORC. Los criterios de aceptación del JSON permiten dos salidas: mejora real con `selectedAsCommit === true` y cierre completo, o imposibilidad explicada con idle visible conservado, `selectedAsCommit === false`, razones no vacías y dependencias faltantes/bloqueadas publicadas. En ambos casos se mantienen los contratos ID244/ID245: ORC activo, decisión explicable, materialización válida, política `PRODUCTION_WAVE_POLICY_V1` sin warnings críticos y `unexplainedChangedTaskIds === []`.

## ID247 — Production Wave Dependency Bundle Closure Source of Truth

ID247 corrige la incoherencia observada en `engine-result-plan-27-v4-53.json`: el plan seguía usando ORC (`usedEngine === "orc"`, `orcResultKind === "orc_changed_plan"`), con decisión explicable y materialización válida, pero la oportunidad `PRODUCTION_WAVE_GAP` declaraba `dependencyClosureComplete === true` mientras el candidato final `macro-production-wave-dependency-bundle` terminaba rechazado por `dependency-closure-incomplete`. El caso mostraba además `affectedTaskIds: [358, 357]` desde el prefilter, sin dirección de dependencia resuelta, y sin `blockedDependencyPairs` ni `missingDependencyTaskIds` accionables.

La fuente de verdad del cierre se amplía ahora con dos fases explícitas: `initialDependencyClosure`, calculada por `buildProductionWaveDependencyClosure`, y `transformedDependencyClosure`, calculada por `validateProductionWaveBundleDependencyClosureAfterTransform`. La primera decide qué main/prerequisites/transitivos entran en el bundle respetando profundidad inclusiva (`main` depth 0, prerequisito directo depth 1, prerequisito de prerequisito depth 2), locks, estados protegidos y budget. La segunda valida la propuesta ya transformada: cada prerequisito debe terminar antes que su dependiente, las dependencias que quedan en sitio deben seguir siendo compatibles, y cualquier rotura se publica con dirección resuelta.

`affectedTaskIds: [358, 357]` ya no es suficiente como explicación porque no indica cuál tarea depende de cuál ni qué horario propuesto viola la restricción. La nueva evidence de cierre transformado publica pares con `dependentTaskId`, `prerequisiteTaskId`, `dependentProposedStart`, `prerequisiteProposedEnd`, `minDelayMinutes`, `violatedConstraint: "DIRECT_DEPENDENCY_BROKEN"`, `dependencyDirectionResolved: true` y `affectedTaskIds` sólo como dato auxiliar. Si el cierre inicial o transformado falla, el summary agrega `blockedDependencyPairs`, `missingDependencyTaskIds`, `blockedByProtectedTaskIds`, `blockedByDepthTaskIds` y `blockedByBudgetTaskIds` para que nunca quede un `dependencyClosureComplete === false` sin causa operativa verificable.

El candidate builder usa la misma source of truth para oportunidad, candidato y rechazo. Las oportunidades `PRODUCTION_WAVE_GAP` incluyen `closureStage`, `closureVersion: "ID247"`, `initialDependencyClosure`, `transformedDependencyClosure`, `brokenDependencyPairs` y `missingDependencyTaskIds`. Si la transformación demuestra que una dependencia transitiva como `358 -> 357` queda rota o no movible, la oportunidad deja de reportar cierre completo de forma contradictoria y el candidato se rechaza antes de depender únicamente del prefilter hard.

Tests añadidos/cubiertos para ID247:

- Profundidad inclusiva: `B -> P1 -> P0` con `maxBundleSearchDepth === 2` incluye `P0` con `dependencyDepth === 2` y mantiene cierre completo.
- Dependencia transitiva protegida/no movible: el bundle se rechaza con `dependency-closure-incomplete`, blockers concretos y explicación humana.
- Caso tipo plan 27: `365` depende de `358/363/366` y `358` depende de `357`; si `357` es pending/movible se incluye en el bundle, y si está protegido se publica la dirección `358 -> 357` antes de simular.
- Prefilter no es la única fuente de verdad: el summary del candidate builder ya contiene el cierre incompleto y los detalles direccionales.
- No regression ID244-ID246: si el dependency bundle no mejora o no cierra, ORC conserva la mejor solución previa, incluyendo `macro-main-zone-block-relayout`, sin fallback V4 por este rechazo opcional.

Validación ejecutada durante ID247: `npx tsx --test engine/orc/macro/productionWaveDependencyBundleCandidate.spec.ts`. También se ejecutó el patrón amplio `npm run test -- --test-name-pattern "ProductionWave|DependencyBundle|DependencyClosure|ORC|macro|runtime|policy"`; recorrió la batería completa por el script actual y dejó las pruebas nuevas del bundle en verde, aunque la ejecución amplia terminó con fallos históricos/no relacionados en `engine/orc/simulation/simulationEngine.spec.ts` sobre snapshots/locks.

Cómo interpretar el próximo JSON de plan 27: es aceptable una mejora real con `productionWaveDependencyBundle.selectedAsCommit === true`, cierre completo y menor idle visible, o una imposibilidad explicada con `selectedAsCommit === false`, `dependencyClosureComplete === false`, arrays de blockers no vacíos y dirección de dependencia resuelta. No es aceptable que vuelva a aparecer una oportunidad con cierre completo y un bundle rechazado por cierre incompleto sin `initialDependencyClosure`/`transformedDependencyClosure`, sin pares bloqueados y sin causa específica.

### ID248 — Production Wave Bundle Actual Blockers & Downstream Dependency Safety

ID248 addresses the operational evidence observed in `engine-result-plan-27-v4-54.json`: ORC was active (`usedEngine === "orc"`, `orcResultKind === "orc_changed_plan"`), explainability and materialization gates passed, but the production-wave dependency bundle was rejected while reporting no actionable blocked or missing dependency arrays. The hard prefilter evidence showed `affectedTaskIds: [358, 357]` for `direct-dependency-broken`.

For this prefilter violation, `affectedTaskIds` is directional: `[predecessorId, dependentTaskId]`. Therefore `[358, 357]` means task 357 depends on task 358, and the candidate made 357 start before the proposed end of 358. That is a downstream dependent safety failure, not a missing upstream prerequisite closure.

The production-wave bundle now separates upstream prerequisites from downstream dependents. Upstream closure answers whether the next main task has its prerequisites available. Downstream safety answers whether any task moved by the bundle has dependents that would become invalid after the move. The new pure resolver `resolveDirectDependencyBrokenPair` turns prefilter-only evidence into explicit `prerequisiteTaskId`, `dependentTaskId`, proposed times, resolved direction and reason.

The bundle also stops moving prerequisites that already finish before the target gap start. Those tasks are reported as `alreadySatisfiedPrerequisiteTaskIds` and `leftInPlaceCompatibleTaskIds`, not as `movedPrerequisiteTaskIds`, because moving a satisfied prerequisite later can create a new downstream violation without helping close the main-flow gap.

Actual blocker detection now classifies candidate evidence into `blockingPrerequisiteTaskIds`, `resourceBlockerTaskIds` and `spaceBlockerTaskIds`. The candidate attempts to move blockers that really occupy dependency, resource or space capacity for the gap, and it validates downstream dependents through `validateProductionWaveDownstreamDependentsAfterTransform` before the candidate is allowed to proceed.

Tests added or expanded in `engine/orc/macro/productionWaveDependencyBundleCandidate.spec.ts` cover prefilter pair direction, already-satisfied prerequisites left in place, downstream dependent rejection, downstream dependent moved with the bundle, real resource blocker detection, and plan-27-style 358/357 evidence. Validation executed for this change included `npm run check` and `npx tsx --test engine/orc/macro/productionWaveDependencyBundleCandidate.spec.ts`.

For the next plan-27 JSON, interpret the result as either a real improvement (`productionWaveDependencyBundle.selectedAsCommit === true` with dependency and downstream safety complete) or an explained impossibility. If impossible, `productionWaveDependencyBundle` should include at least one concrete blocker array such as `brokenDownstreamDependencyPairs`, `blockedDependencyPairs`, `resourceBlockerTaskIds`, `spaceBlockerTaskIds`, protected/depth/budget blockers, and rejected candidate details with resolved dependency direction instead of leaving `affectedTaskIds: [358,357]` as the only explanation.

### ID249 — Partial Resource Unblock for Main Flow Gap Reduction

ID249 addresses the plan-27 evidence observed in `engine-result-plan-27-v4-56.json`. ID248 already diagnosed the right blockers: ORC was active, the result kind was `orc_changed_plan`, explainability and materialization gates passed, the dependency bundle used closure `ID248`, the main-task prerequisites `358`, `363` and `366` were correctly left in place, and the remaining blockers were resource blockers on resource `336`: `376` from `12:05` to `12:20`, `386` from `12:20` to `12:35`, and `396` from `12:35` to `12:50`.

The missing behavior was incremental improvement. The full dependency bundle tried to close the entire `12:05` to `12:50` visible main-flow gap at once, pulling too much downstream work into the candidate. When downstream safety exceeded the bundle budget, the whole bundle was rejected and no partial candidate was simulated, leaving the visible gap at 45 minutes.

The dependency-bundle builder now also emits `variantType: "partial-resource-unblock"` candidates. For each main-flow gap it orders real resource blockers by time and builds deterministic prefix candidates: unblock only the first blocker, then the first two, then the full prefix. Each partial candidate declares the original and expected gap minutes, expected visible idle reduction, all detected resource blockers, moved blockers, blockers left in place, main tasks pulled forward, the unblocked window and unblocked minutes.

Partial unblock keeps satisfied prerequisites in place for both the next main task and resource blockers. If a blocker prerequisite already ends before the blocker's proposed new start, it is reported in `leftInPlaceCompatibleTaskIds` and is not included in `movedPrerequisiteTaskIds` or `movedResourceBlockerPrerequisiteTaskIds`. This prevents plan-27-style satisfied prerequisites such as `368`, `378` or `388` from being moved unnecessarily and breaking downstream dependents.

Resource blockers are searched against real same-resource/same-space windows outside the target gap, preferring compatible windows before the gap so the main flow can be pulled forward. If the first blocker can move out of `12:05` to `12:20`, the next main task can be proposed at `12:05`, reducing the visible gap from 45 to 30 minutes without requiring blockers `386` and `396` to move. If no compatible window exists, the partial evidence records `no-compatible-window-for-resource-blocker` rather than silently ending with `candidateCount === 0`.

`PRODUCTION_WAVE_POLICY_V1` now includes configurable partial scoring gates: `partialMainFlowGapReductionAllowed` defaults to `true`, and `partialMainFlowGapReductionMinMinutes` defaults to `15`. This keeps the 15-minute plan-27 threshold configurable instead of hardcoded as production logic.

The `productionWaveDependencyBundle` summary now exposes partial-resource-unblock evidence: execution flag, candidate count, candidate IDs, selected commit fields, rejected partial details, `netValueAvailable`, and a skipped reason when no candidate was built. Net value for an absent candidate is no longer represented as if a hard-infeasible zero-idle candidate had been materialized.

Tests added in `engine/orc/macro/productionWaveDependencyBundleCandidate.spec.ts` cover prefix generation for `376/386/396`, satisfied blocker prerequisites left in place, and explainable rejection when the first blocker has no compatible relocation window. The existing ID248 regression tests continue to cover ORC dependency direction, satisfied main prerequisites left in place, downstream safety, and actual resource blocker detection.

Acceptance for the next plan-27 JSON is either a real partial improvement (`partialResourceUnblockSelectedAsCommit === true`, non-null selected candidate, and visible main-zone idle/largest gap below 45) or an explained impossibility (`partialResourceUnblockExecuted === true` with partial candidates or rejected details explaining each blocker). It is no longer acceptable to attempt only the full bundle, produce `candidateCount === 0` without partial analysis, move already-satisfied prerequisites, or compute final net value for a candidate that was never built or simulated.

Validation executed during ID249 included `npm run check` and `npx tsx --test engine/orc/macro/productionWaveDependencyBundleCandidate.spec.ts`. Full engine and ORC benchmark commands remain the recommended release validation path: `npm run test:engine:full` and `npm run benchmark:orc`.

## ID250 — ORC Strategic Pivot: Macro Production Wave Day Shape

ID250 descarta explícitamente el prompt anterior centrado en `latestWindowBefore` y en mover mejor un blocker local. La evidencia acumulada entre `engine-result-plan-27-v4-52.json` y `engine-result-plan-27-v4-57.json` indicaba que el ORC estaba mejorando diagnóstico y trazabilidad, pero no la forma operativa de la jornada: el hueco visible del plató principal seguía en 45 minutos, el recurso crítico 335 mantenía 120 minutos de idle, `production-wave-dependency-bundle` y `partial-resource-unblock` no consolidaban mejoras, y el resultado final seguía dependiendo de `macro-main-zone-block-relayout`.

El fallo estratégico identificado es que el ORC continuaba actuando como refinador posterior de V4: recibía una planificación base, detectaba huecos o blockers y aplicaba reparaciones locales. ID250 introduce el primer candidato macro de forma de jornada, `macro-production-wave-day-shape-v1`, para empezar a construir alternativas desde el Estado Operativo completo.

El nuevo enfoque añade análisis puro de bloques de producción y prioridad de talentos. El candidato `macro-production-wave-day-shape` agrupa tareas por recurso crítico/coach inferido desde evidencia, coloca prerequisitos cerca de las tareas del flujo principal, protege la continuidad del main flow, prioriza talentos con ventanas más restrictivas y trata la comida flexible como una ventana productiva salvo configuración contraria. El candidato entra en el pipeline normal ORC: Candidate → CandidateState → SimulatedState → Validation → OperationalValue → Commit/Reject → Evidence; no se materializa directamente y no relaja restricciones hard.

Tests añadidos o actualizados:

- `engine/orc/macro/macroProductionWaveDayShapeCandidate.spec.ts` cubre agrupación de prerequisitos y main flow por recurso crítico, prioridad por salida temprana, ausencia de hardcodes de recursos/espacios, comida flexible, rechazo por no mejora OperationalValue y un caso representativo tipo plan 27.
- `engine/orc/macro/productionWaveDependencyBundleCandidate.spec.ts` se mantiene como protección de regresión para el candidato dependency-bundle existente.

Benchmark actualizado conceptualmente:

- `realVoiceAuditionDay` sigue siendo el escenario representativo para comparar V4 baseline, ORC previo y ORC con el nuevo resumen `macroProductionWaveDayShape` dentro del Evidence Report ORC.
- Las métricas relevantes para interpretar el reporte son idle visible del main zone, mayor hueco del main zone, idle de recursos críticos, permanencia de talento, makespan, compactness operativa, candidate count, simulated count y runtime.

Cómo interpretar el próximo JSON:

- Una mejora real debe mostrar `macroProductionWaveDayShape.executed === true`, `candidateCount > 0`, `selectedAsCommit === true`, reducción de idle del main zone o de idle de recurso crítico, `planningMaterialization.unexplainedChangedTaskIds === []`, `gates.explainableDecision === true` y `usedEngine === "orc"`.
- Un rechazo útil también es aceptable si `macroProductionWaveDayShape` incluye candidato o detalles de rechazo, `coachBlockPlan`, `talentPriorityOrder`, `mainFlowBlockPlan`, `prerequisitePlacementPlan`, `mealUsagePlan` y una razón concreta como hard constraint, dependencia, disponibilidad, recurso, espacio, comida, falta de mejora OperationalValue, coste de estabilidad o runtime.
- No debe aceptarse un JSON que solo añada diagnósticos, que vuelva a centrarse en el blocker 376 o en el hueco 12:05–12:50, o que no incluya candidato/rechazo estratégico de day shape.

### ID251 — Macro Day Shape Hard-Feasible Strategic Candidate

ID251 consolida `macro-production-wave-day-shape` como constructor estratégico acotado, no como parche local del blocker 376 ni de la tarea 296. La evidencia de `engine-result-plan-27-v4-58.json` mostraba que ID250 emitía `candidate:macro-production-wave-day-shape:1`, pero el candidato moría en el prefilter global por `outside-work-day`, no llegaba a simulación, dejaba `talentPriorityOrder === []`, seguía midiendo un universo distinto al main zone visible y no reducía el hueco real del plató principal. Esa salida no era aceptable porque declaraba una forma macro inválida en vez de construir una jornada viable o explicar estratégicamente por qué no podía construirla.

La corrección evita convertir ID251 en un microparche para la tarea 296: el candidato ya no se basa en mover un blocker individual ni en una búsqueda local de ventanas. Primero clasifica el flujo principal con `resolveORCMainZoneTarget`: solo incluye tareas productivas situadas físicamente en `mainSpaceIds` o `mainZoneIds`, ignora `countsForMainFlow` cuando arrastra prerequisitos o soporte fuera del plató, y publica `taskClassification` con incluidos, excluidos y `countsForMainFlowIgnoredTaskIds`. Los prerequisitos directos de tareas main se mantienen como prerequisitos salvo que también ocurran en el target principal.

La prioridad de sujetos/talentos se amplía para detectar identidades con `contestantId`, `contestant_id`, `talentId`, `talent_id`, `participantId`, `participant_id`, `itinerantTeamId` e `itinerant_team_id`. Si hay sujetos, `talentPriorityOrder` deja de quedar vacío silenciosamente y `subjectPriorityDiagnostics` publica fuentes, sujetos detectados, tareas sin sujeto y warnings; si no hay datos de sujeto, la indisponibilidad queda explícita.

El constructor sustituye el cursor global por lanes paralelos: `mainFlowLane`, `resourceLanesByResourceId`, `spaceLanesBySpaceId` y `subjectLanesBySubjectId`. Las tareas del plató principal se ordenan en la lane main, los prerequisitos se colocan antes de sus dependientes y recursos distintos pueden avanzar en paralelo si no comparten sujeto, espacio ni dependencia. El scope se limita por política (`macroDayShapeMaxMovedTasks`, `macroDayShapeMaxMainTasks`, `macroDayShapeMaxPrerequisiteTasks`, `macroDayShapeMaxResources`) y se centra en la primera ventana estratégica alrededor del hueco visible o del inicio del flujo principal, no en toda la jornada.

Antes de emitir un Candidate se ejecuta `preflightMacroProductionWaveDayShapeCandidate`. El preflight rechaza localmente salidas fuera del workDay, protected statuses, locks, disponibilidad de sujeto, dependencias directas rotas, solapes de recurso/espacio/sujeto, duraciones inválidas, espacios inválidos y excesos de scope. Si falla, `candidateCount` queda en 0 y `rejectedCandidateDetails` explica constraint, task IDs, horario propuesto, ventana permitida y lane cuando aplica; así el prefilter global deja de ser la primera línea de defensa para `outside-work-day`.

La evidence de `macroProductionWaveDayShape` ahora distingue `candidateBuiltCount`, rechazos de preflight, aceptación/rechazo de prefilter, candidate states, simulaciones, validaciones, `lanePlan`, `scopeSelection`, `preflight`, métricas esperadas/preflight/simuladas/finales y el scope métrico alineado con `productionConceptAlignment`. Si el candidato no llega a simulación, no se reportan `largestGapAfter` ni `criticalResourceIdleAfter` como resultado consolidado. El benchmark ORC añade `macroProductionWaveDayShapeSummary` para detectar explícitamente si el candidato se generó, pasó preflight, pasó prefilter, fue simulado, fue válido, fue seleccionado y si sus métricas están alineadas con el scope de production concept alignment.

Tests añadidos/ampliados en `engine/orc/macro/macroProductionWaveDayShapeCandidate.spec.ts`: clasificación strict del main flow, detección mixta de sujetos/talentos, lanes paralelos, rechazo preflight de `outside-work-day`, límite de scope, candidato hard-feasible listo para simulación y caso tipo plan 27. En el próximo JSON son aceptables dos salidas: A) candidato macro con preflight aceptado, prefilter aceptado, candidate states y simulaciones/validaciones; o B) rechazo estratégico con `candidateCount === 0`, `candidatePreflightRejectedCount > 0`, `taskClassification`, `subjectPriorityDiagnostics`, `lanePlan`/scope y detalles accionables. No debe aceptarse otro JSON con `talentPriorityOrder === []` sin explicación, descarte global `outside-work-day` del candidato day-shape, métricas macro desalineadas o decenas de `movedTaskIds` sin preflight ni simulación.

### ID252 — Macro Day Shape Progressive Scope Candidate

ID252 keeps the ID251 deviation control: it does not raise `macroDayShapeMaxMovedTasks`, does not patch around `macro-day-shape-scope-too-large`, does not reintroduce blocker-specific logic, and does not convert day-shape planning into a local window search. The v59 evidence from `engine-result-plan-27-v4-59.json` showed the right strategic direction but still stopped at a 36-task requested scope (12 main tasks plus 24 prerequisites) against the 30-task policy limit, leaving `candidateCount === 0`, `lanePlan === null`, `preflight === null`, and only `macro-day-shape-scope-too-large` as the rejection reason.

The ORC now builds progressive macro day-shape scopes before giving up. `buildMacroProductionWaveScopeOptions` emits deterministic mini-scopes (`gap-next-main-only`, `gap-next-main-pair`, `single-resource-main-mini-block`, `main-flow-gap-window-small`, `coach-aligned-mini-wave`) plus the diagnostic `full-requested-scope`, ordered from lowest risk to highest ambition. Oversized scopes are recorded as rejected diagnostics, while smaller scopes continue into lane building and preflight until the policy candidate budget is reached.

Prerequisites are now split between indispensable prerequisites that must move with the mini-wave, compatible prerequisites that can be left in place because they already finish before the proposed dependent start, and excluded non-blocking/placeholder support. This prevents a small main-flow candidate from dragging unrelated support, meals, transport, or prerequisites of main tasks outside the selected scope.

When subject identity is absent, talent priority no longer blocks macro candidate generation. The diagnostics mark `talentPriorityUnavailable`, enable `subjectPriorityFallbackUsed`, explain the fallback reason, and provide a fallback order based on dependency pressure, main-flow position, critical resources, availability/sequence signals, and stability without inventing subjects.

Metric target metadata is aligned with the same resolved ORC main-zone target used by main-zone continuity: `metricMainSpaceIds` and `metricMainZoneIds` are populated from `resolveORCMainZoneTarget`, and production-concept metric alignment is not reported as true when the configured target arrays are empty.

Evidence for `macroProductionWaveDayShape` now includes generated/tried/rejected scope counts, selected scope id, per-candidate lane plans, per-candidate preflight, per-candidate scope selections, candidate ids, and rejected candidate details for every scope that was too large or failed hard preflight. The next JSON should therefore show either a simulated/accepted macro day-shape candidate (`candidate:macro-production-wave-day-shape:*`) or a complete strategic rejection across multiple scopes rather than a single oversized-scope stop.

Tests were added/expanded for progressive scope planning, oversized full-scope diagnostics with smaller scopes still available, `gap-next-main-only`, compatible prerequisites left in place, fallback priority when subject identity is unavailable, target metadata alignment behavior, and plan-27-style evidence that no longer stops only at `macro-day-shape-scope-too-large`. The ORC benchmark now guarantees a real macro day-shape scenario in `macroProductionWaveDayShapeSummary` and reports candidate generation, preflight, prefilter, simulation, validity, selection, and metrics-scope alignment counts with `scenarioCount > 0`.

### ID253 — Macro Day Shape Context-Aware Lanes

ID253 closes the gap left by ID252 without raising limits, relaxing hard constraints, forcing day-shape selection, or returning to a blocker-specific patch. The `engine-result-plan-27-v4-60.json` evidence showed that ID252 was a real advance because it generated six progressive macro day-shape candidates and all passed local preflight, but none reached simulation: every candidate was rejected by the global prefilter with resource or space overlaps against tasks outside the candidate scope.

The root cause was that `buildMacroProductionWaveLanes` treated only moved tasks as constraints. ID253 adds a fixed-calendar layer: every task outside the scope is fixed, and every `done`, `in_progress`, or locked task remains fixed even if it appears in the scope. The fixed calendar indexes resource, space, subject, protected task, movable task and main-flow intervals so macro day-shape placement can reason against the complete plan before emitting a candidate.

Context-aware placement now places movable scope tasks into the first compatible work-day window that avoids fixed resource, space and subject intervals as well as already-placed candidate assignments. If a fixed blocker prevents the proposed mini-wave, the rejection is produced before the global prefilter with context-aware reasons such as `context-fixed-resource-blocker` or `context-fixed-space-blocker`, including moved task, fixed blocker, resource/space and both proposed and blocking windows.

Preflight now validates candidate assignments against the fixed calendar in addition to internal assignment overlaps, protected status, work-day, availability and dependencies. Its output exposes `fixedCalendarChecked`, `contextOverlapDetails`, `candidateInternalOverlapCount` and `candidateVsFixedOverlapCount`, and candidate metadata/evidence includes fixed-calendar summaries, context blockers considered/left fixed, lane plan, preflight diagnostics, expected metrics and preflight/prefilter consistency diagnostics.

Controlled blocker expansion policy fields were added (`macroDayShapeAllowContextBlockerExpansion`, default `true`, and `macroDayShapeMaxContextBlockers`, default `3`) so future scope expansion can remain bounded and explainable instead of becoming an unlimited search or a hardcoded plan-27 workaround. Current ID253 behavior already treats protected or out-of-scope blockers as fixed and rejects prefilter-unsafe lanes before they leave day-shape preflight.

The expected next JSON should now be interpreted as either: A) at least one macro day-shape candidate passes context-aware preflight and the prefilter, then reaches CandidateState/SimulatedState/ValidSimulation; or B) all macro day-shape scopes are rejected before prefilter with complete context-aware blocker/no-gain details and `unexpectedPrefilterRejections.length === 0`. It is no longer acceptable for six candidates to pass local preflight and then die only in the global prefilter due to obvious resource/space overlaps, nor for day-shape simulated IDs to appear in global summaries while `macroProductionWaveDayShape.simulatedStateCount === 0`.

Tests added in `engine/orc/macro/macroProductionWaveContextAwarePlacement.spec.ts` cover fixed resource blockers outside scope, fixed space blockers outside scope, protected blockers remaining fixed, and preflight/prefilter consistency diagnostics for a hard-feasible candidate. Existing day-shape tests continue to exercise progressive scopes, local preflight and hard-feasible candidate generation. The ORC benchmark summary is expected to report context-aware placement execution, preflight/prefilter consistency, generated/preflight/prefilter/simulated/valid/selected counts and context rejections for macro day-shape scenarios.

### ID254 — ORC Day Shape Source-of-Truth & Explainable Materialization

ID254 is a source-of-truth repair, not another macro optimization pass. It preserves the ID253 fixed calendar, context-aware placement, progressive scopes, preflight/prefilter consistency, fallback priority and metric-target alignment. The deviation control is explicit: no new scopes, no scoring changes, no UI/DB/RLS changes, no hardcoded plan 27 workaround, no relaxed gates and no forced ORC selection.

The v61 evidence from `engine-result-plan-27-v4-61.json` showed a local/global contradiction: day-shape generated and prefiltered candidates, while global selection and advisory evidence contained `macro-production-wave-day-shape` simulation IDs, but the local `macroProductionWaveDayShape` summary reported zero candidate states, zero simulated states and zero valid simulations. The same JSON also showed materialization diffs with changed task IDs that were not connected to the selected candidate source, so `explainableDecision` failed and ORC fell back.

ID254 adds a shared ORC candidate lineage resolver that understands pure and composite candidate IDs separated by `+`. A candidate such as `candidate:macro-main-zone-block-relayout:1+candidate:macro-production-wave-day-shape:gap-next-main-only` is now resolved as both macro-main-zone-block-relayout and macro-production-wave-day-shape, with composite lineage recorded instead of relying on exact candidate-id equality.

The macro day-shape evidence now separates pure and composite IDs: `pureDayShapeCandidateIds`, `compositeDayShapeCandidateIds`, `pureDayShapeSimulatedStateIds`, `compositeDayShapeSimulatedStateIds`, `selectedIncludesDayShape`, selected primary/composite families, lineage consistency and materialization source coverage. The global simulation selection similarly distinguishes `macroMainZoneRelayoutSimulationIds`, `macroProductionWaveDayShapeSimulationIds`, pure/composite day-shape simulation IDs and `compositeMacroSimulationIds`, so day-shape simulations no longer disappear from the local summary or get mislabeled as only macro-main-zone relayout.

Materialization source coverage is centralized through `buildORCMaterializationSourceSummary`. It compares original, repaired and post-repair-continuity baselines with the selected simulated state, then explains selected diffs only when the selected lineage and candidate metadata support them through moved task IDs, lane plans, assignments, inherited source summaries or inferred candidate changes. It does not blindly accept all diffs; truly unexplained changes remain visible in `unexplainedChangedTaskIds` and keep `materializationDiffContractValid === false`.

Fallback consistency is now diagnostic evidence too. When a final gate fails, the returned output remains the V4 fallback, and runtime diagnostics include `fallbackPlanningSource`, `fallbackReturnedBaselineHash`, `orcRejectedPlanningHash` and `returnedPlanningMatchesFallbackBaseline`. This prevents a JSON that claims `selectedEngine === "v4_fallback"` while returning partially materialized ORC planning.

Tests added for ID254 cover pure day-shape lineage, composite macro-main plus day-shape lineage, materialization that is fully explained by moved tasks/lane plans, and materialization that correctly fails for a truly unexplained changed task. The ORC benchmark now tracks lineage resolver coverage, pure/composite day-shape counts, simulation summary consistency, materialization source coverage and fallback returned-planning consistency; it fails if global day-shape simulation IDs exist while local day-shape simulated count is zero, or if fallback planning consistency is contradicted.

The next JSON should be interpreted in two acceptable modes. Option A is an explainable ORC commit: `gates.explainableDecision === true`, no fallback, valid materialization diff contract and aligned day-shape local/global simulation IDs. Option B is a legitimate fallback: concrete fallback reason, `returnedPlanningMatchesFallbackBaseline === true`, no partial ORC planning returned, and no contradiction between local day-shape evidence and global simulation selection. Any JSON with day-shape simulation IDs globally but zero local day-shape simulations, or with unexplained IDs that are actually present in lane plans/assignments/moved-task metadata, remains a failing source-of-truth regression.

## ID255 — ORC Lineage Resolver v2 & Global Selection Source-of-Truth

ID255 is a controlled continuation of ID254. It does not add macro heuristics, scopes, blockers, scoring changes, UI changes, DB/RLS changes, plan-27 hardcodes, or relaxed gates. The only goal is to restore pipeline integrity from Candidate → CandidateState → SimulatedState → Validation → Evaluation → Ranking → Selection → Materialization → Evidence → Gates.

The regression evidence came from `engine-result-plan-27-v4-62.json`: fallback was coherent (`returnedPlanningMatchesFallbackBaseline === true`), but `explainableDecision` still failed and day-shape simulations were counted locally while disappearing from global `simulationSelection`. ID254 correctly made fallback output match the fallback baseline and preserved non-zero local `macroProductionWaveDayShape` simulation counts, but v62 still showed empty global day-shape IDs, macro-main buckets polluted by day-shape IDs, and a final `planningMaterialization` without selected lineage or materialization source coverage.

ID255 distinguishes technical wrappers from real strategic composition. Wrappers such as `candidate:partial-plan:`, `orc-transformation:candidate-state:`, `orc-simulation:simulated-state:`, `orc-ranking-engine:operational-value:`, and `evidence:orc-ranking-engine:operational-value:` are normalized away before family detection. A candidate is composite only when multiple real base candidates or multiple real families are present, typically via `+` between base candidate IDs.

`selectBestORCSimulation` now derives macro-main and macro-production-wave-day-shape buckets from resolved lineage instead of broad macro pass lineage. Pure day-shape simulations cannot enter macro-main accepted arrays; real macro-main + day-shape composites are tracked in both relevant family buckets and in `compositeMacroSimulationIds`. Diagnostic macro pass IDs remain separate as fallback/debug data.

The final ORC composite summary preserves enriched materialization data: `selectedLineage`, `selectedCandidateFamilies`, `materializationSourceCoverage`, explained/unexplained changed IDs, and change sources. Fallback reports keep the returned V4 fallback planning coherent while exposing `rejectedORCMaterialization`, `fallbackMaterialization`, and `selectedMaterializationForGate` so `explainableDecision` is evaluated against the ORC candidate, not hidden by fallback output.

Tests were added/expanded for wrapper normalization, pure day-shape simulated-state wrappers, real macro-main + day-shape composition, and global selection separation. The ORC benchmark now tracks lineage wrapper normalization, global day-shape selection, macro-main pollution, final materialization source coverage, explainability gate source, and fallback coherence, and fails on the v62 contradictions.

Interpret the next JSON as valid only if it is internally consistent: either ORC passes explainability with source-covered diffs and no fallback, or fallback is used with coherent returned baseline planning and a rejected ORC materialization that explains the actual gate failure. A JSON where local day-shape simulations exist but global day-shape IDs are empty, macro-main contains pure day-shape IDs, composite macro IDs are missing, or failed materialization lacks source coverage is still invalid.

### ID256 — ORC Post-Macro Unified Selection Source-of-Truth

ID256 is a bounded follow-up to ID255: it does not add macro heuristics, scopes, blockers, scoring, UI, DB/RLS, V4 behavior, gate relaxation, or forced ORC selection. ID255 fixed lineage resolution enough to distinguish technical partial-plan wrappers from real macro compositions, but `engine-result-plan-27-v4-63.json` still showed two separate realities: local macro pass day-shape simulations existed while global `simulationSelection` day-shape IDs were empty, `macroPassLineageFallbackUsed` was true, macro-main was reported as accepted even though the final macro summary rejected it, and final materialization had no selected lineage.

The ORC now builds a post-macro unified selection input after the macro pass. That read-only input merges and de-duplicates shadow candidates, candidate states, simulated states, validations, operational values, and commit decisions with the macro pass pipeline outputs while preserving source attribution (`shadow`, `macro-pass`, or `both`). Selection is re-run against that unified pool so shadow selection and macro pass diagnostics no longer live as independent universes.

The post-macro selection evidence records unified pool counts, sources, resolved/missing macro pass simulation IDs, selection source, and whether a stale pre-macro macro-main selection was discarded. If the final macro pass summary says `selectedAsCommit === false`, the global selection can no longer report `valid-committed-macro-main-zone-block-relayout` or macro-main global acceptance from older shadow data. Macro pass day-shape simulated states are included in the global lineage buckets, including pure day-shape and composite day-shape counts.

Final materialization now preserves enriched `planningMaterialization` from the selected simulated state when present. If enrichment is missing, ORC reconstructs source coverage with `buildORCMaterializationSourceSummary` instead of replacing it with a basic materialization object that loses `selectedLineage`, `selectedCandidateFamilies`, source coverage, declared/inferred changed tasks, additional diff IDs, or change sources.

Tests were added for the unified post-macro selection input and the existing selection tests cover the global macro lineage buckets. The ORC benchmark summary now tracks post-macro unified selection, stale pre-macro detection, macro pass simulation pool resolution, selected macro gate consistency, and final materialization lineage. The next JSON should be interpreted as valid only if local day-shape simulations appear globally, macro-main acceptance matches the final macro summary, lineage fallback only cites truly missing IDs, and selected/rejected ORC materialization carries lineage/source coverage.

### ID257 — Meal Break Blocks & Production Concept Non-Regression Gate

ID257 is a controlled follow-up to ID256. ID256 fixed the post-macro source of truth: the unified post-macro pool is built, post-macro selection executes, lineage is consistent without fallback, stale pre-macro selection is discarded, and the planning materialization diff contract remains valid without unexplained task changes. The new `engine-result-plan-27-v4-64.json` evidence showed a different operational regression: ORC could still select a technically explainable and OPQM-safe candidate while `productionConceptAlignment` reported `conceptually_misaligned`, visible main-zone idle worsened from 45 to 135 minutes, the largest visible gap worsened from 45 to 135 minutes, and `mainZoneContinuity` silently reported zero final gaps.

This iteration fixes that semantic gap without adding macro heuristics, scopes, blockers unrelated to the issue, UI rewrites, RLS changes, plan-specific hardcodes, Plató 7 hardcodes, forced V4 selection, forced ORC selection, or hidden gaps. The scope is limited to explicit meal-break blocks, shared visible-gap semantics, a read-only production-concept non-regression gate, and per-space task-change-limit validation.

A meal window is only a placement range, for example `13:00–16:30`; it is not a real production stop by itself. When `mealBreakDurationMinutes` is absent, invalid, or negative, the centralized safe default is 75 minutes. When it is exactly `0`, mandatory meal-break block generation is disabled. When it is positive, `buildMealBreakBlocksForSpaces` proposes deterministic visible meal-break placeholders per operational space, fully inside the configured meal window, blocking that space and marking the resources attached to that space as resting during the block. The block is non-productive, visible in space planning, stable-id based, and distinct from transport or generic placeholders.

The production concept audit continues to count flexible meal-window gaps as visible unless the gap is covered by an actual meal break or hard break. A real meal-break block can cover the meal portion of a stop; an empty flexible window cannot. `mainZoneContinuity` now carries explicit production-concept comparison evidence (`productionConceptAlignmentMismatch`, production-concept visible gap count, largest production-concept visible gap, and mismatch reason) so a future result cannot silently report zero continuity gaps while the concept audit exposes visible gaps.

The new `evaluateProductionConceptNonRegressionGate` publishes `productionConceptNotWorseThanV4`. By default it fails if selected ORC output worsens total visible main-zone idle, largest visible main-zone gap, visible-gap count, flexible-meal gap semantics, or meal-break coverage relative to the baseline. If it fails in active ORC execution, the engine returns V4 fallback with `fallbackReason: "gate_failed:productionConceptNotWorseThanV4"`, preserves rejected ORC materialization evidence, and marks returned planning as the fallback baseline.

The new `evaluateSpaceTaskChangeLimit` audits per-space grouping changes and ignores meal-break blocks, transport, and non-productive placeholders. `Ensayo José María → Descanso comida → Ensayo José María` counts as zero changes, while `Ensayo José María → Descanso comida → Ensayo Lucía` counts as one real grouping change. ORC active diagnostics now publish `spaceTaskChangeLimitChecked`, per-space counts, limits, violations, and reject selected candidates that exceed a configured limit with `space_task_change_limit_exceeded`. The logic is generic for any configured space, including Plató 7-like fixtures, without hardcoding space names or task names.

Runtime metrics now include the production-concept gate verdict and blockers, before/after concept scores and verdicts, visible idle/gap deltas, meal-break duration and generated/missing block counts, meal-break coverage validity, flexible-meal regression detection, and space-task-change-limit status. The ORC benchmark now tracks production-concept non-regression, continuity/concept alignment, meal-break generation and coverage, flexible-meal gap regressions, space-task-change-limit checks and violation counts, and production-concept gate blocks.

Tests added for ID257 cover default meal duration, disabling meal blocks with duration `0`, fitting blocks inside meal windows, flexible meal windows not covering gaps without real blocks, real meal blocks not counting as task changes, production-concept gate rejection of the v64-style 45→135 regression, and per-space task-change limits that ignore meal but count real grouping changes.

Interpret the next JSON as follows: Option A is valid when ORC is selected and `gates.productionConceptNotWorseThanV4 === true` with no continuity/concept contradiction, valid meal-break block coverage or explained blocker, and no space-change violations. Option B is valid when ORC is rejected because the production-concept gate fails and V4 fallback is returned coherently. Option C is valid when a positive meal duration cannot fit in the meal window and `meal_break_block_cannot_fit_in_window` blocks silent ORC acceptance.

### ID258 — Meal Break Source of Truth & Zone Change Limit Wiring

ID257 added ORC diagnostics for meal blocks, a conceptual production non-regression gate, and a read-only audit for task changes, but left two operational contracts incomplete. The representative `engine-result-plan-27-v4-65.json` showed ORC falling back to V4 because `productionConceptNotWorseThanV4` failed, while `mealBreakBlocks` existed only as diagnostics with `meal_break_duration_invalid_defaulted`, and `spaceTaskChangeLimitViolationsCount` was greater than zero even though `gates.spaceTaskChangeLimitRespected` stayed true with accidental `limit: 0` evidence.

ID258 closes the wiring without adding macro heuristics. Meal duration now resolves through one source-of-truth chain: concrete `plan_breaks.duration_minutes`, nullable zone/plato override `zones.space_meal_break_minutes`, `plans.space_meal_break_minutes`, `program_settings.space_meal_break_minutes`, and finally the product default of 75 minutes. A configured value of `0` disables the mandatory space meal break; positive values create a real break. Existing 45-minute data is not silently migrated, but new defaults and fallbacks are 75 minutes.

The key distinction is that ORC diagnostics are evidence, not persistence. Real space meal breaks are `plan_breaks` rows with planned or locked times, and materializable engine tasks must use the real negative ID contract: `taskId = -planBreakId`. Synthetic diagnostic IDs such as `-900000048` are marked diagnostic-only/non-materializable and must not be persisted. Planning UI space lanes consume the real `plan_breaks` collection and render visible `space_meal` blocks labelled as `Descanso comida`, so fallback V4 still shows lunch when the break was persisted.

ID258 also wires the plato task-change limit to the same contract used by V3: `maxTemplateChangesByZoneId`, derived from `zones.max_template_changes`. Zone task changes are counted per plato/zone, ignore real meal breaks and non-productive placeholders, and group by task group, group, template, then normalized name before falling back to task ID with a warning. Missing configuration defaults to 4; `0` only means no changes when explicitly configured. If a selected ORC plan exceeds the configured zone limit, `gates.spaceTaskChangeLimitRespected` must become false and fallback must be coherent.

The ORC benchmark and tests now track meal source-of-truth evidence, plan-break persistence/visibility evidence, synthetic meal-break leaks, zone limit evidence, zone gate coherence, and grouping-key evidence. The next engine JSON should be interpreted as valid only when meal blocks are backed by `plan_breaks` or an explicit blocker, no materializable planned task uses `taskId <= -900000000`, `mealBreakConfigSource`/`mealBreakSourceOfTruth` are present, zone limits come from `maxTemplateChangesByZoneId`, and any zone task-change violation is reflected by the gate.

### ID259 — Reproducible Engine Scenario Snapshot & Offline Replay v1

ID259 adds a reproducible engine input export that is separate from the existing compact result export. The existing `engine-result-v1` / diagnostics JSON describes a persisted engine result and its diagnostics; the new `optiplan-engine-scenario-v1` snapshot contains the complete `EngineInput` that was handed to the planner, plus integrity counters and a SHA-256 hash of the canonical engine input.

The snapshot format is generated by `engine/scenarioSnapshot.ts` and includes `exportVersion`, `generatedAt`, `planId`, `inputHash`, `counts`, and `engineInput`. Canonicalization only removes non-serializable `undefined` values, preserves `null`, preserves all array ordering, and sorts object keys only for deterministic hashing. The snapshot parser rejects unknown versions and any manual edit that changes the canonical input hash.

Operational users can download the snapshot from the engine diagnostics panel with **Descargar escenario reproducible**. This calls `GET /api/plans/:id/engine-scenario-snapshot`, verifies authenticated plan access, builds the input with `buildEngineInput(planId, storage)`, returns `Cache-Control: no-store`, and does not run V3, V4, ORC, persist results, or alter planning state. The existing result/diagnostics download remains a different contract and is unchanged.

Real production snapshots are intentionally not versioned yet. Store downloaded files under ignored `local_engine_scenarios/`, then replay them offline with:

```bash
npm run replay:engine-scenario -- local_engine_scenarios/<archivo>.json --engine all --repeat 2
```

The replay CLI validates version and hash, clones the `EngineInput`, runs V3, V4 and/or ORC Active without importing server storage or requiring Supabase variables, and emits a compact report with per-engine runtime, status, planned/unplanned counts, feasibility/completeness, output hash, ORC fallback reason when present, false gates, and selected high-level quality metrics. Repeated executions compare output hashes and mark `deterministic: false` with a non-zero exit code if the same input produces different outputs.

This capability is diagnostic-only. It creates a portable source of truth for future fixture promotion and engine investigation, but does not change V3, V4, ORC heuristics, gates, weights, locks, RLS, database schema, persistence, or existing planning behavior.

### ID260 — Real Scenario Replay Hardening & Input Preflight v1

ID260 hardens the offline scenario replay loop without changing V3, V4, ORC, gates, heuristics, optimizer weights, persisted planning, DB schema, RLS, or production behavior. The new `Engine Input Preflight` is a pure diagnostic audit over the `EngineInput` contained in an `optiplan-engine-scenario-v1` snapshot. It reports structural errors, informational warnings, operational facts, meal-placeholder classification, main-zone facts, and the exact optimizer configuration received by the engine.

Preflight **errors** are structural issues that can make a replay invalid or misleading, such as missing dependency targets, self-dependencies, dependency cycles, missing spaces/resources, invalid windows, invalid durations, or locks pointing at missing tasks. By default, any preflight error blocks engine execution and creates `preflight_blocked` execution summaries. Use `--allow-preflight-errors` only when intentionally investigating a malformed fixture.

Preflight **warnings** are diagnostic signals that do not block replay and do not modify configuration. Configuration contradictions such as `MAIN_ZONE_IDENTIFIED_BUT_NOT_PRIORITIZED`, `MAIN_ZONE_KEEP_BUSY_ENABLED_WITH_PRIORITY_LEVEL_ZERO`, `MAIN_ZONE_FINISH_EARLY_DISABLED`, `CONTESTANT_COMPACTNESS_DISABLED`, `CONTESTANT_ZONE_STABILITY_DISABLED`, or `GROUPING_LEVEL_ZERO_WITH_GROUPING_FLAG_ENABLED` mean “this is what the engine was given”, not “the replay changed it”. ID260 only reports these values; it does not enable main-zone priority, finish-early, contestant compactness, stay-in-zone, or grouping levels.

Run a fast audit without importing or executing engines:

```bash
npm run replay:engine-scenario -- local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json --preflight-only --output local_engine_scenarios/plan-27-preflight-v1.json
```

The preflight report separates real contestant tasks from synthetic meal/placeholders. Tasks with `contestantId == null` are not counted as contestants, so plan-27 style snapshots with 19 real contestants plus synthetic meal placeholders report 19 contestants rather than inferring an extra placeholder contestant.

Replay execution now runs each requested engine/repetition in an isolated child process. The coordinator does not import V3, V4, or ORC at top level; each child imports only the selected engine. `--time-limit-ms` is enforced per engine execution. If a worker exceeds its budget, the coordinator terminates it, records `executionStatus: "timeout"`, keeps any completed prior executions, and continues to the next engine/repetition unless `--fail-fast` is set.

Example bounded replay:

```bash
npm run replay:engine-scenario -- local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json --engine all --repeat 1 --time-limit-ms 120000 --output local_engine_scenarios/plan-27-replay-v1.json
```

Use `--fail-fast` when the first timeout or worker error should stop the remaining replay queue. Without it, the report is partial but still usable: each execution is clearly marked as `completed`, `timeout`, `error`, or `preflight_blocked`, and the top-level report counts timed-out and failed executions.

`deterministic` now has three meanings: `true` only when at least two completed executions of the same engine have matching output fingerprints; `false` when completed executions of the same engine differ; and `null` when there are not enough completed repetitions to decide. Timeouts are not treated as nondeterminism. Output fingerprints intentionally ignore runtime, timestamps, generated-at fields, and bulky diagnostics while preserving planning, unplanned tasks, feasibility, completeness, selected engine, fallback, and semantic gate evidence.

### ID 261 — Meal Semantics & Preflight Classification Fix v1

The engine-input preflight now uses a single operational task classifier for four mutually exclusive categories: `productive_task`, `contestant_meal`, `synthetic_space_meal`, and `synthetic_itinerant_meal`. A contestant meal is a flexible contestant-owned meal task, identified first from the configured meal template id/name and only then by the legacy meal-name fallback such as `Sodexo`, `Comida`, or `meal`.

Contestant meals are not productive work: they do not count as synthetic placeholders, do not require a physical space, may carry `spaceId: 0`, and may have `zoneId: null`. `PRODUCTIVE_TASK_WITHOUT_SPACE` is emitted only for tasks classified as `productive_task`, so a real productive task with `spaceId: 0`, `null`, `undefined`, or `"<none>"` remains a structural preflight error.

Synthetic meal placeholders remain separate from contestant meals. Space-scoped placeholders count as `synthetic_space_meal`; itinerant-team placeholders count as `synthetic_itinerant_meal`; both continue to contribute to `syntheticTasks` while contestant meals contribute only to `meal.contestantMealTasks`.

Preflight space and zone facts now distinguish known and used identifiers. `facts.spaces`/`facts.knownSpaces` represent real known physical spaces in the EngineInput, and `facts.usedSpaces` represents real task space ids. Placeholder ids (`0`, `null`, `undefined`, and `"<none>"`) are excluded from both real-space and real-zone counts. Likewise, `facts.zones`/`facts.knownZones` count only real zones, while `facts.usedZones` counts only real zone ids referenced by tasks.

### ID 262 — Replay Operational Metrics & Cross-Engine Comparison v1

ID262 converts offline replay into an operational comparator. The replay report now computes comparable metrics from the materialized planning plus the original `EngineInput`, rather than trusting engine-specific diagnostic paths. Diagnostics remain useful context for status, fallback reason, and gate evidence, but they are not the source of truth for replay makespan, contestant idle, main-zone continuity, task changes, overlaps, dependency violations, availability violations, or protected-task mutation audits.

Optional numeric conversion is null-safe: missing values (`null`, `undefined`, empty strings, non-numeric values, `NaN`, `Infinity`, objects, or arrays) remain `null`. A reported zero now means the replay evaluator actually calculated zero; absence is never coerced through `Number(null)`.

The common evaluator normalizes V3, V4, and ORC planned tasks into compact planning rows containing task id, planned start/end, space, zone, contestant, template, assigned resources, and operational kind. Missing fields are completed only from `EngineInput.tasks` by `taskId`; values are not invented, and replay warnings mark missing tasks or times.

Temporal parsing accepts only strict `HH:mm` values in a same-day window. Invalid or absent times return `null`; midnight rollover is not interpreted. Makespan is calculated as the difference between the earliest valid planned start and latest valid planned end across planned tasks, or `null` when no valid interval exists.

Contestant jornada metrics include productive tasks and contestant meal tasks, exclude synthetic placeholders, and treat the contestant meal as part of the contestant span. Meal duration itself is not idle; positive gaps before or after the meal are idle. The report includes total and maximum contestant idle, total and maximum contestant span, contestants with idle, and compact per-contestant summaries using ids only.

Main-zone continuity uses `optimizerMainZoneId`, `spaceIdsByZoneId`, and the shared operational classification. It includes only productive main-zone work, merges overlapping or contiguous productive intervals, and reports visible idle minutes, largest gap, gap count, and compact gap intervals with bounded neighboring task ids.

Activity changes are counted per zone from productive tasks ordered by start and grouped by `templateId` or the available template grouping identity, not by `taskId`. Consecutive tasks from the same template do not add a change; contestant meals and synthetic placeholders are ignored. The evaluator compares changes to `maxTemplateChangesByZoneId` and reports zones exceeding their limits.

Replay comparisons now include `comparisonVersion: REPLAY_OPERATIONAL_COMPARISON_V1` and compare completed runs for V4 vs V3, ORC vs V4, and ORC vs V3. Each metric delta states the baseline value, candidate value, delta, whether lower or higher is better, and an assessment of `improved`, `worsened`, `equal`, or `unavailable`; positive deltas are never labelled improvements without direction.

When ORC reports `usedEngine: v4_fallback`, replay compares normalized ORC planning against V4 planning and reports planning equivalence, changed task ids, timing changes, assignment changes, and metadata-only equivalence. If fallback output is not operationally equivalent to V4, the replay adds `ORC_FALLBACK_OUTPUT_NOT_EQUIVALENT_TO_V4` as a replay warning. This verification does not modify ORC selection, gates, candidate evaluation, or commit behavior.

Compact planning remains omitted from execution summaries by default. Use:

```bash
npm run replay:engine-scenario -- local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json --engine all --repeat 1 --time-limit-ms 150000 --output plan-27-replay-v3.json --include-compact-planning
```

Use `--compact-planning-output <ruta>` to save a separate compact planning file without bulky internal diagnostics, for example:

```bash
npm run replay:engine-scenario -- local_engine_scenarios/optiplan-plan-27-engine-scenario-v1.json --engine all --repeat 1 --time-limit-ms 150000 --output plan-27-replay-v3.json --compact-planning-output local_engine_scenarios/plan-27-compact-v1.json
```

This iteration is diagnostic-only. It does not change V3, V4, ORC, SEE, candidate builders, simulation, validation, operational evaluator, commit logic, gates, weights, configuration, meal planning, DB, RLS, persisted planning, or the generation endpoint.

### ID 263 — ORC Incumbent Preservation & Baseline-Relative Acceptance v1

ID263 introduces an internal ORC incumbent contract for active execution. The incumbent keeps the selected planning, simulation, validation, value, candidate state, candidate, extracted planning, pending ids, materialization, composite summary, production-concept audit, operational-quality metrics, and zone task-change audit together as one atomic record. This prevents the active planner from returning the planning of one candidate with diagnostics, validation, or materialization from another candidate.

Stage selection and final acceptance are now separate decisions. The post-macro selector may still propose a candidate from the existing unified pool, but that proposal is materialized and audited independently before it can replace the incumbent. A post-macro candidate can replace the incumbent only after hard validity, completeness, locks/protected-task preservation, assigned-space consistency, production-concept non-regression against the incumbent, baseline-relative task-change non-regression against the incumbent, and existing operational-value ordering all pass. If the post-macro proposal worsens production continuity, the planner records `retain_incumbent` with the rejected candidate id and continues final acceptance with the previous incumbent instead of falling through to V4 solely because a later proposal regressed.

Final acceptance is explicitly baseline-relative to the real V4 fallback output. `productionConceptNotWorseThanV4` now compares the final ORC incumbent against a production-concept audit built from `v4.output.plannedTasks`, not against the pre-macro ORC summary. The diagnostics include `finalAcceptanceBaselineSource: "v4_baseline"`, compact V4 production metrics, and a compact V4 planning fingerprint.

Zone activity-change auditing now enriches planning entries from `EngineInput`/`OperationalState` metadata before grouping. Where metadata exists, grouping uses task group, group, template id, or template name before the final task-id fallback, preserving meal and transport non-work semantics so non-productive placeholders do not create false activity changes.

The task-change gate now distinguishes absolute violations from regressions. Absolute over-limit evidence remains visible as `spaceTaskChangeLimitAbsoluteExceeded`, while `spaceTaskChangeLimitRespected` represents baseline-relative non-regression. Inherited violations with the same count do not force fallback; inherited improvements pass; new violations or worsened counts/excess fail.

The fallback chain remains unchanged in spirit: V4 is still the final safe fallback when no acceptable ORC incumbent exists. ID263 does not add candidate families, macro strategies, heuristics, weights, configuration, EngineInput fields, database changes, RLS changes, UI changes, or persistence changes. New compact diagnostics are published under `incumbentSelection` with `version: "ORC-INCUMBENT-SELECTION-V1"`.

### ID 264 — Final Materialized Hard Validation & Contestant Occupancy Safety v1

ID264 adds a final, canonical hard-validation step for the exact materialized ORC planning that would be returned to callers. Candidate validation and output validation are now intentionally different checks: candidate validation belongs to a simulated state in the ORC pipeline, while final materialized validation rebuilds an `OperationalState` from `EngineInput`, replaces only its planning with the exact output planning, and runs the official Validation Engine again before ORC can be selected.

The final validation publishes a deterministic planning fingerprint containing only operational scheduling identity: `taskId`, planned start/end, `spaceId`, and sorted assigned resources. It excludes timestamps, names, diagnostics, and non-operational metadata. ORC acceptance now checks both simulation-validation lineage and planning fingerprint identity, so a validation from another `SimulatedState` or a validation for a different planning snapshot cannot accept the returned planning.

Contestant occupancy semantics are centralized in `occupiesContestantTime`. Real contestant work, real contestant meals, and configured contestant arrival/departure transport occupy the contestant timeline. Synthetic space meals, synthetic itinerant/team placeholders, visual placeholders, non-operational placeholders, and records without a real positive `contestantId` do not occupy contestant time. This is why a real meal can create a hard `CONTESTANT_OVERLAP` with productive work, while a synthetic meal block cannot.

The Validation Engine and Candidate Hard Prefilter now share that contestant-occupancy predicate for contestant overlaps. `CONTESTANT_OVERLAP` is raised when two overlapping real tasks occupy the same real contestant, including productive/productive, productive/meal, productive/transport, and meal/transport conflicts. Resource, space, dependency, lock, availability, and protected-task semantics are otherwise unchanged.

The active ORC planner adds mandatory final gates: `finalMaterializedPlanningHardValid`, `finalMaterializedPlanningFingerprintMatches`, and `finalValidationBelongsToSelectedSimulation`. `usedEngine = "orc"` now requires all three gates, a canonical final `VALID` result, and zero canonical contestant overlaps. If the exact materialized planning is invalid, ORC falls back through the existing fallback path and leaves the rejected planning and violation codes as diagnostics instead of marking it hard-feasible.

This iteration does not add optimization heuristics, does not change candidate generation, does not change V3/V4/baseline generation, does not change `EngineInput`, and does not touch DB, RLS, UI, configuration, or persistence. Continuity improvements are evaluated only after hard validation; a better main-zone gap can never override a hard contestant overlap.

### ID 265 — Hard-Feasible Baseline Overlap Conflict Closure v1

ID265 hardens baseline-overlap repair so the four immediate variants are no longer the only executable search space and are no longer emitted when their local feasibility check reports any blocker. Simple variants that introduce contestant, itinerant-team, resource, exclusive-space, dependency, availability, hard-break, protected-task, or lock problems are retained only as diagnostics and are not converted into runnable candidates.

Baseline repair can now run a small deterministic conflict closure from operational boundaries instead of scanning minute by minute. Candidate starts come from real planning frontiers: task starts/ends for the same contestant, shared resources, and exclusive space, plus work-day and hard-break boundaries. The closure preserves materialized durations, spaces, resources, contestant/template metadata, and task status while moving only the root task and directly displaced pending tasks within typed limits (`maxClosureTasks`, `maxClosureDepth`, `maxBoundaryCandidatesPerRoot`, and `maxGeneratedClosureCandidates`).

Repair ranking is hard-feasibility first: candidates with remaining local conflicts are discarded before quality is considered; then deterministic ordering prefers fewer moved tasks, lower total displacement, lower maximum displacement, and stable ids. Main-zone continuity remains only a later tie-breaker and cannot accept an invalid baseline repair.

The active ORC incumbent path now builds a provisional pre-macro candidate and assigns it as incumbent only if the incumbent contract and canonical materialized hard validation are usable. If no hard-valid baseline repair exists, later quality phases are not allowed to replace that missing incumbent, and diagnostics use explicit blockers such as `pre_macro_candidate_canonical_hard_invalid` or `no_hard_valid_baseline_repair` before V4 remains the safe fallback.

Diagnostics now include a compact `baselineOverlapRepairConflictClosure` section with the closure version, original conflict ids/codes, boundary counts, generated/rejected counts, selected candidate metadata, displacement totals, blocker counts, search-limit status, and deterministic/read-only flags. Replay output also exposes minimal `orcSafetyEvidence` with the selected baseline repair candidate, closure summary, incumbent decision, final materialized validation result, violation codes, overlap pairs, changed task count, final engine, and fallback reason. No full planning or personal names are copied into this evidence.

This iteration does not add new quality heuristics, does not change V3, V4, baseline generation, EngineInput, database schema, RLS, UI, persisted configuration, meal semantics, or production-wave behavior. It only restores a hard-feasible baseline before any optimization is allowed to proceed.

### ID 266 — Conflict Closure Global Validation & Valid Repair Selection v1

ID266 extends baseline-overlap repair from resolving the first encountered conflict to closing the complete affected conflict set. After each root or displaced-task assignment, the closure rebuilds a full immutable planning preview from the operational state, reapplies all accumulated assignments, and audits the root, original conflict tasks, and directly displaced tasks again. A branch is therefore not considered repaired simply because the latest moved task has no immediate conflict; the root and all previously moved tasks are rechecked until a fixed point is reached or a typed blocker/limit stops the branch.

Residual conflicts are now real preview-audit results rather than an empty placeholder. Closure candidates carry residual counts, codes, and task pairs, and only preview-clean branches with no blocking reason are converted into executable ORC candidates. Rejected branches retain bounded conflict reason counts for diagnostics without copying full planning or personal names.

Boundary exploration and executable candidate limits are separated. `maxBoundaryCandidatesPerRoot` limits how many operational frontiers are evaluated, while `maxGeneratedClosureCandidates` limits only preview-closed executable candidates. Invalid early boundaries no longer consume the executable budget, allowing later valid frontiers within the same boundary budget to be reached without increasing limits.

Simple local variants no longer suppress conflict closure. The builder evaluates simple variants and closure variants in the same deterministic repair budget, combines only preview-clean executable candidates, and ranks executable repairs after preview validation by zero residual conflicts, fewer modified tasks, smaller total displacement, smaller maximum displacement, closure depth, and stable ids. This adds no quality heuristic; it only prevents invalid candidates from entering quality ranking.

When no hard-valid repair is available, ORC records an explicit safe fallback path with `no_hard_valid_baseline_repair` and skips final acceptance as an ORC incumbent rather than reusing stale simulation, validation, candidate, or materialization references. When a repair is selected, the active pipeline keeps candidate, candidate state, simulated state, validation, materialization, planning fingerprint, composite summary, and final planning aligned to the same lineage before ORC can be returned.

Replay summaries now carry the compact ORC-only `orcSafetyEvidence` produced by the worker, including the selected baseline repair candidate, conflict-closure summary, incumbent decision, final materialized validation result, violation codes, overlap task pairs, changed-task count, final engine, and fallback reason. V3/V4 replay summaries do not receive this ORC evidence and diagnostics are not bulk-copied.

This iteration does not modify V3, V4, baseline V4, EngineInput, DB, RLS, UI, persistence, weights, production wave behavior, critical resource compression, or meal semantics, and it does not introduce new optimization heuristics.

### ID 267 — Baseline Repair Candidate Admission & Canonical Selection v1

ID267 introduces a shared baseline-repair admission step for both simple variants and conflict-closure candidates. Every repair assignment set is applied to a full planning preview, audited with the existing closure preview rules, and admitted only when the preview is clean with zero residual conflicts. Simple variants no longer have a privileged local-only path, and closure candidates are defensively rechecked through the same admission contract.

Candidate limits are now applied only after global preview admission, residual-conflict rejection, assignment fingerprint deduplication, and deterministic ranking. Invalid simple variants no longer consume the executable candidate budget, and candidate family/source is not used as an acceptance priority. Ranking among preview-clean candidates uses repair shape only: fewer assignments, lower total displacement, lower maximum displacement, lower closure depth, fewer indirect affected tasks, and stable id. Duplicate simple/closure repairs with identical assignment fingerprints collapse to one executable candidate while preserving compact Evidence.

Active baseline-repair preflight now performs canonical hard validation for each repair-lineage simulation that is pipeline-valid. The selected repair is an atomic package containing candidate, candidate state, simulated state, validation, operational value, commit decision, materialized planning, canonical hard validation, planning fingerprint, source, displacement metadata, and lineage flags. A Decision Engine `COMMIT` is evidence only; it cannot make a canonical-invalid repair selectable.

Selection is restricted to canonically hard-valid repairs with matching materialized fingerprints, validation lineage, zero hard violations, preserved locks, and preserved protected tasks. If no such repair exists, the active planner short-circuits immediately to the exact V4 fallback with `fallbackReason: "no_hard_valid_baseline_repair"`, `finalAcceptanceExecuted: false`, and `finalAcceptanceSkippedReason: "no_hard_valid_baseline_repair"`, without carrying stale selected candidates, selected simulations, ORC final materialization, or false final-acceptance gates.

Replay ORC safety evidence now includes the repair admission summary, selected candidate source, canonical validation execution/valid/invalid counts, selected canonical result, selected assignment count, selected moved task ids, and final acceptance execution/skip fields. Evidence remains compact and does not copy full planning.

This iteration does not add repair heuristics, does not increase closure or candidate limits, and does not modify V3, V4, baseline V4, EngineInput, DB, RLS, UI, persistence, weights, macro relayout, critical resource compression, production wave behavior, meal planning, or transport semantics.

### ID 268 — Canonical Baseline Repair Data Integrity & Hard-Filter-First Selection v1

ID268 separates the compact V4 `seedPlanning` payload from the operationally complete repair input. The serialized seed remains planning-only and bounded, while the new canonical repair input overlays only the V4 planning fields onto cloned `TaskInput` records so contestant identity, itinerant-team metadata, template metadata, dependencies, resource requirements, fixed windows, break/meal flags, locks/protected planning, and other typed static constraints remain available to repair logic.

The baseline seed now emits a read-only `baselineSeedOperationalIdentityAudit` comparing original and operational repair tasks. It reports preserved contestant/team/template/resource/dependency identity, lock/protected-task preservation, planning overlay correctness, bounded missing-id samples, and an `operationalIdentityComplete` gate for repair diagnostics without copying contestant names.

Active baseline repair preflight is now authoritative whenever the baseline seed is hard-infeasible and a repairable productive exclusive-space overlap group exists. It no longer trusts a shadow VALID result, valid simulation count, generated candidate count, legacy summary, or shadow commit as a replacement for canonical validation. The repair operational state is built from the operationally complete seeded input, while canonical validation uses the original `EngineInput` as the source of identity and hard constraints.

The active repair path now runs hard prefiltering before applying the four-candidate simulation limit. The builder keeps its default caller behavior, but active preflight asks for all preview-clean candidates within the existing closure budgets, sends them all to the hard prefilter, discards hard-invalid candidates, deterministically ranks accepted candidates, and only then applies the unchanged post-prefilter candidate limit. Invalid dependency/resource/space/contestant alternatives therefore do not consume the simulation budget.

PartialPlan lineage is resolved explicitly through `resolveBaselineRepairCandidateForSimulation`. Direct candidate states resolve by raw candidate id; synthetic PartialPlan candidates resolve through PartialPlan metadata and candidate ids; ambiguous multi-repair PartialPlans are rejected with `ambiguous_baseline_repair_partial_plan` instead of choosing an arbitrary raw candidate.

Canonical selection remains hard-filter-first: a repair can become the pre-macro incumbent only after pipeline VALID simulation, resolved raw lineage, materialized planning, original-input canonical hard validation, matching fingerprint/lineage checks, and the existing deterministic repair ranking. No new repair heuristics, boundaries, weights, V4 behavior, DB changes, UI changes, or larger budgets were introduced.

Replay evidence now exposes compact active-repair fields for the plan-27 scenario, including authoritative preflight execution, operational identity audit, candidates generated/sent before prefilter, accepted/rejected hard-prefilter counts, post-prefilter limit, candidates sent to simulation, lineage-resolution counts, canonical validation counts, selected source/assignment/moved-task fields, final acceptance state, final engine, and fallback reason, without including full fingerprints or full planning payloads.

### ID 269 — Canonical Hard-Feasibility Restoration Commit & Selection Lineage Coherence v1

ID269 makes the active baseline-repair preflight selection an atomic ORC selection package. When preflight selects a canonical baseline-overlap repair, candidate, candidate state, simulated state, validation, value, commit decision, and diagnostics are rebuilt together by `buildActiveRepairORCSelection` from the selected repair package instead of extending stale shadow or macro diagnostics.

Active-repair diagnostics now represent only the baseline-overlap repair lineage: the final family is `baseline-overlap-repair`, selected simulated/candidate ids point at the same package, macro/production-wave/post-repair/critical-resource arrays are empty unless actually selected, and lineage warnings are recalculated from the final identities.

The new selection Evidence coherence audit records compact identity and fingerprint fields for the final package without copying planning. ORC explainability now requires coherent Candidate/Simulation/Validation diagnostics, matching planning fingerprints, a valid summary contract, no summary warnings, a valid materialization diff contract, and no unexplained or declared-but-unchanged task changes.

Final materialization keeps change-source attribution on `changeSources.baselineOverlapRepair.changedTaskIds` for baseline-overlap repair modifications and does not declare macro, post-repair continuity, critical-resource compression, or production-wave sources when those families are not part of the selected planning.

ID269 adds strict hard-feasibility restoration acceptance with lexicographic precedence: a canonically hard-valid active-repair baseline-overlap candidate may beat a hard-invalid V4 baseline only after structural gates, locks, protected tasks, assigned-space contract, lineage, fingerprint, Evidence coherence, and explainability all pass. Production concept, task-change, and OPQM comparisons are still calculated as raw gates and published separately from effective acceptance gates, so soft regressions remain visible with the reason `soft_regression_accepted_to_restore_hard_feasibility`.

The legacy `opqmGateBypassedForBaselineRepair` diagnostic is retained only as compatibility evidence derived from the new strict restoration policy. No new repair candidates, heuristics, limits, weights, V4 changes, EngineInput changes, DB/RLS changes, UI changes, or persistence changes were introduced.

### ID 270 — Lineage-Aware Hard Restoration Activation & Non-Blocking Raw Diagnostics v1

ID270 makes active repair acceptance lineage-aware end-to-end. A selected CandidateState may now match the raw repair candidate directly or through the explicit CandidateState → PartialPlan → raw Candidate resolution captured by `resolveBaselineRepairCandidateForSimulation`; valid single-candidate PartialPlans are coherent, while missing, ambiguous, mismatched, or unresolved PartialPlans remain rejected.

Canonical baseline-repair preflight preserves the resolved candidate lineage on each canonical evaluation and carries it into the active ORC selection diagnostics. Selection Evidence now reports direct match, PartialPlan match, resolution kind, raw candidate id, PartialPlan id/candidate ids, ambiguity reason, and consistency without relying on text-prefix heuristics.

Hard-feasibility restoration now reads baseline violation codes from the official audit fields in deterministic order: explicit override, `violatedConstraints`, `dominantViolationCodes`, positive `violatedConstraintSummary` entries, `violationDetailsSample`, then legacy compatibility fields. A hard-infeasible baseline with no resolvable violation Evidence is rejected with `baseline_hard_infeasible_without_violation_evidence` rather than accepted from a boolean alone.

Raw production-concept, task-change, and OPQM comparisons remain visible as diagnostics under raw acceptance comparisons and inside the restoration policy, but they are no longer inserted into the blocking `gates` map. Effective soft gates pass only when the raw comparison passes or the strict hard-restoration policy accepts, so `falseGates` contains only operational blocking gates and not accepted diagnostic regressions.

This iteration does not modify candidate generation, search, simulation, V4, DB/RLS, UI, persistence, operational metrics, heuristics, budgets, or limits; it only corrects resolved lineage interpretation, baseline violation Evidence extraction, hard-restoration policy evidence, and separation of raw diagnostics from blocking gates.

### ID 271 — Restore Real PartialPlan Lineage & Consolidate Known Hard-Valid Repair v1

ID271 restores the real active-repair lineage topology used by the Decision Pipeline: `DecisionInput.candidates` contains the original raw repair Candidates, while `preparePartialPlanDecisionUnits` creates internal synthetic Candidates with ids of the form `candidate:${partialPlan.partialPlanId}` for simulation. The absence of that synthetic Candidate object from `DecisionInput.candidates` is therefore not itself a lineage failure.

`resolveBaselineRepairCandidateForSimulation` now resolves synthetic CandidateStates through exact PartialPlan identity. When an explicit synthetic decision Candidate is available, its `metadata.partialPlanId`, expected synthetic id, and CandidateState id must all agree. When it is absent, the resolver may derive a possible PartialPlan id only by removing the exact `candidate:` prefix, and it still accepts only if that id matches a real PartialPlan supplied to the resolver and the CandidateState id exactly equals `candidate:${partialPlan.partialPlanId}`.

After resolving the real PartialPlan, the resolver still requires exactly one contained raw repair Candidate. Missing PartialPlans, mismatched CandidateState ids, contradictory explicit synthetic metadata, zero raw Candidates, multiple raw Candidates, and non-contained raw Candidates remain rejected; no candidates are reconstructed by textual similarity.

Active preflight now publishes a bounded `candidateLineageResolutionFailuresSample` for failed lineage resolutions only, capped at four entries and limited to ids/reasons. The real-topology regression test builds raw Candidates, composes real PartialPlans, builds `DecisionInput`, creates the synthetic Candidate through `preparePartialPlanDecisionUnits`, and verifies that a CandidateState pointing at the synthetic id resolves back to the raw Candidate even though `DecisionInput.candidates` does not contain the synthetic Candidate.

No new ORC components, policies, gates, candidate builders, repair heuristics, budgets, V4 behavior, DB/RLS changes, UI changes, or persistence changes were introduced.

### ID 272 — Initial Construction Origin State & Bottleneck-First Anchor Search v1

ID272 adds the first read-only SPEC-06 initial-construction stage before the ORC active planner asks V4 for a benchmark or fallback. The active flow now resolves an explicit ORC planning mode (`INITIAL_CONSTRUCTION`, `REPLANNING`, or `IMPROVEMENT`), builds an origin input directly from the original `EngineInput`, creates an origin `OperationalState`, and runs Initial Construction Stage 1 before `generatePlanV4` is executed.

The origin input does not accept V4, V3, `EngineOutput`, or external planning as a seed. Pending unprotected tasks have inherited planning timestamps, assigned planning resources, V4 seed metadata, and repair/improvement metadata removed, while protected `done`, `in_progress`, and locked task planning is preserved exactly. Operational identity, dependencies, resource requirements, locks, contestant/team/template/space/zone data, availability, meals, transport, setup, grouping, and rule configuration remain preserved for reasoning.

Stage 1 builds a deterministic pre-placement construction map that works with `state.planning = []`. The map derives dependency edges, template-dependency edges using the same contestant/team matching semantics as canonical validation, unresolved dependency blockers, cycle blockers, contestant pressure, resource pressure from requirements and `ANY_OF` alternatives, space/zone pressure, structural change pressure, main-flow membership from official configuration, and cognitive bottleneck regions without materializing planning.

Anchor selection is reversible and cognitive only. Productive pending tasks are ordered with an explainable lexicographic priority: hard/future infeasibility risk first, then real slack and alternatives, workload and chain duration, configured main-flow continuity, resource/space/team pressure, setup/change pressure, unlock impact, future freedom, and finally stable task id as the last tie-breaker. Meals, breaks, transport placeholders, and synthetic blocks are not promoted as productive anchors unless their existing operational role metadata says they count as work.

Initial Search Spaces now represent bounded construction intent for the top anchors: anchor id, prerequisite closure, provisional windows from workday, availability, meals, fixed windows, protected planning/locks, propagated critical entities, preliminary future-feasibility metadata, blockers, and consumed budget. They explicitly set `initialConstructionStage = 1`, execute no transformations, run no simulations, commit no planning, and are never sent to the Decision or Commit pipeline.

ORC diagnostics and replay safety evidence now include compact `initialConstructionStage1` evidence and an `initialConstructionSeedIndependence` audit. These prove Stage 1 uses `original_engine_input`, executes before V4, does not accept external planning, does not read V4 planning or candidate order, uses no V4 seed, and remains read-only. The public planning output and ID271 active-repair/fallback behavior are preserved; this iteration adds no local gap optimization, no complete constructor, no minute-by-minute scheduler, no Production Wave feeder, no DB/RLS/UI changes, and no V3/V4 behavior changes.

### ID 273 — Canonical Initial-Construction Understanding & Anchor Precedence v1

ID273 consolidates Stage 1 initial-construction understanding around a shared ORC dependency resolver. Explicit task dependencies now produce canonical prerequisite edges and missing explicit task ids remain blocking issues, while template dependencies are applied only when a matching task exists for the same valid contestant or itinerant team. Template references that are not applicable to that subject are counted separately as non-blocking evidence rather than false blockers, and duplicate task/template declarations collapse to one structural edge with separate reference and edge counters.

The initial-construction map now publishes typed, read-only contracts for dependency graph, contestant/resource/space/zone/team pressure, main-flow pressure, bottleneck regions, anchors, search spaces, and anchor priority keys. Contestant pressure ignores invalid or null contestant ids instead of creating phantom contestant `0`, records productive tasks without contestants, and exposes a validity audit. Space pressure and zone pressure are separate maps: spaces are keyed only by `spaceId`, zones are keyed only by `zoneId`, and zone setup/change limits are not treated as space limits.

Main-flow understanding now separates all related tasks, productive tasks, protected downtime, non-productive tasks, and anchor-eligible tasks. Synthetic meals, breaks, transport, and protected downtime can constrain capacity and provisional windows but are not productive main-flow anchors or main-flow feeder tasks. Resource pressure is task-specific: fixed requirements generate fixed consumer demand, `ANY_OF` alternatives remain diagnostic/unassigned groups, and anchor selection only reads scarcity from resources actually required by that task.

Dependency-chain metrics now distinguish total closure work from real critical path duration, using the longest sequential prerequisite/downstream path instead of summing parallel branches. Anchor precedence uses a named lexicographic `InitialAnchorPriorityKey` with explicit direction for hard risk, future infeasibility, known slack, slack minutes, alternatives, workload, critical path, main-flow preference, feeder preference, task-specific resource scarcity, structural pressure, unlock count, future freedom, and deterministic task id as final tie-breaker. Main-flow tasks are preferred as cognitive anchors when risk is otherwise equivalent; feeder tasks publish the main-flow chains they unlock, and any feeder/non-main precedence carries exception evidence.

Stage 1 evidence is upgraded to `INITIAL-CONSTRUCTION-STAGE1-EVIDENCE-V2` with dependency counters, non-applicable template references, blocking dependency issues, contestant identity checks, phantom contestant count, space/zone counts, resource-demand counts, productive/protected main-flow counts, critical-path status, first-anchor role and decision reasons, protected-window crossing count, and a semantic integrity audit. The audit checks canonical dependency semantics, absence of false dependency blockers, valid contestant identity, separated space/zone identity, productive main-flow classification, task-specific resource pressure, critical-path semantics, comparator direction, protected interval exclusion, and coherent read-only status.

This iteration remains read-only and does not materialize PartialPlans, run constructive transformations, run Stage 1 simulations, commit planning, add backtracking, change V3/V4 behavior, change DB/RLS/UI/API surfaces, or alter persisted configuration. It preserves the public ID271/ID272 compact planning behavior while making the pre-V4 initial-construction map semantically reliable enough to identify real chains, constrained contestants, pressured resources/spaces/zones, preferred main-flow anchors, feeder closures, and justified exceptions.

### ID 274 — Real EngineInput Grounding & Falsifiable Stage-1 Semantic Audit v1

ID274 grounds Initial Construction Stage 1 in the real `EngineInput` contract instead of legacy diagnostic arrays. The new canonical input catalog resolves contestant identity from `contestantAvailabilityById` and task contestant references, spaces from real space maps and task usage, zones from `zoneIdBySpaceId`, `spaceIdsByZoneId`, grouping/change/resource maps and task usage, and resources from `planResourceItems`. Invalid ids (`0`, negative, null, undefined, non-finite) are excluded from entity catalogs and retained only as warnings/invalid-id evidence.

Resource inventory now distinguishes `planResourceItemId` from `resourceItemId`. Task requirements are interpreted by `resourceItemId` for fixed `byItem` and `ANY_OF` groups, while available inventory is resolved back to the available plan-resource-item ids that can satisfy each resource item. Pending-task `assignedResourceIds` are not treated as construction demand, preserving Stage 1 as read-only evidence rather than an assignment step.

Main-flow grounding now uses the ORC main-zone target resolver so a configured optimizer main zone resolves through zone-to-physical-space maps before classifying tasks. Main-flow evidence publishes configured kind, configured id, resolved main zone, physical main spaces, all related tasks, productive main-flow tasks, protected downtime, non-productive tasks, and anchor-eligible tasks without comparing a zone id directly to `task.spaceId` unless the resolver identified a space target.

Anchor selection now publishes explicit selection evidence for the selected anchor, best main-flow anchor, best feeder anchor, best critical non-main anchor, decisive dimension, compared priority keys, and whether a non-main selection is a demonstrated exception to main-flow preference. Exceptions require an earlier lexicographic dimension to beat the main-flow anchor; feeder status alone is not enough.

The Stage 1 semantic audit is now falsifiable. It derives every boolean from source evidence: dependency counters and blockers, contestant pressure subsets, separated space/zone namespaces, main-flow target classification, resource inventory mapping, task-specific resource pressure, critical-path values, anchor comparator fields, and protected-window exclusion. The audit returns `coherent`, `failureCodes`, `warnings`, checked invariants, failed invariants, and `readOnly`; contradictory evidence no longer self-certifies as coherent.

Compact ORC safety evidence no longer spreads the full dependency graph into `initialConstructionStage1`. It keeps counters, bounded blocker/cycle/region/anchor samples, corrected identity/resource/main-flow/anchor fields, and a stable Stage 1 structural fingerprint built only from the canonical catalog, dependency counters, pressure summaries, main-flow target, regions, anchor ordering, and Search Spaces. Stage 1 still performs no PartialPlan materialization, no constructive transformations, no constructive simulations, and no commits, preserving the public ID271 planning output.

### ID 275 — Stage-1 Trust Gate: Real Audit, Protected Windows & Compact Fingerprint v1

ID275 turns the Initial Construction Stage 1 semantic gate into a falsifiable trust gate without starting construction. The audit no longer accepts unconditional invariants or comparator checks: resource inventory, anchor ordering, protected windows, critical paths, and main-flow membership are all recomputed from Stage 1 source evidence and fail with explicit codes when manipulated.

Anchor precedence now uses the exported `compareInitialConstructionAnchors` comparator for both selector ordering and semantic auditing. Adjacent anchors must be ordered by the same comparator that selected them, and the first anchor must be the comparator minimum; stable serialization is no longer used as a proxy for comparator behavior, and task id remains only the final deterministic tie-breaker.

Search Spaces now resolve protected intervals for each anchor, including hard meals, actual meal tasks, synthetic space breaks, protected tasks, locks/protected occupancy where represented as task windows, and blocking transport roles. Flexible meal windows are retained as frontiers only and do not become a global hard break by themselves. Provisional windows are split at protected interval boundaries, undersized fragments are discarded, post-break capacity is preserved, and each Search Space publishes applied protected intervals plus calculated crossing/exclusion counters.

The semantic audit independently recalculates protected-window crossings from `provisionalWindows` and `protectedIntervalsApplied`, rather than trusting a precomputed counter. It also verifies critical-path recurrence from the dependency graph and task durations, reconstructs the exact main-flow productive/protected/eligible sets from `originInput`, and validates resource inventory ids, uniqueness, mappings, availability, counts, and inverse indexes from `planResourceItems`.

Stage 1 evidence now keeps a compact public fingerprint: the canonical fingerprint payload is internal, while `stage1StructuralFingerprint` is a SHA-256 hexadecimal digest with a fixed 64-character shape. Evidence includes the fingerprint version and payload byte length, but not the full payload. Dependency counters are built explicitly from the dependency graph root fields, so dependency evidence remains compact and non-empty when dependencies exist.

This iteration preserves the read-only construction boundary: Stage 1 still materializes no PartialPlans, executes zero constructive transformations, runs zero constructive simulations, commits zero planning changes, and does not alter V3, V4, grounding, baseline repair, gates, budgets, OperationalValue, DB/RLS/UI, or final materialization. The public planning output is preserved while Stage 1 evidence becomes reliable enough to authorize a later construction stage.

### ID 276 — Canonical Role, Meal Semantics & Dependency Evidence Parity v1

ID276 closes the Initial Construction Stage 1 trust gate by making the map and semantic audit use the same canonical operational role classification. Main-flow productive tasks, protected downtime, and anchor-eligible tasks are now reconstructed through `resolveORCPlanningEntryOperationalRoleMetadata`, the ORC transport contract, and the same main-zone target resolution used by the construction map, so synthetic meal placeholders without legacy `type`, `countsAsWork`, or `isMeal` fields are not misclassified as productive.

Stage 1 Search Spaces now consume the official meal semantics resolver. A `flexible_meal_window` remains a placement boundary and never becomes a derived global production stop just because `meal` or `mealWindow` exists, while `global_hard_break`, explicit global hard breaks, and concrete `actualMeal` intervals still create protected intervals according to their contract.

Synthetic non-productive meal intervals are applied by scope rather than by contestant only. Contestant meals block only the matching contestant, and synthetic meals with a physical `spaceId` but no contestant block only that physical space. Other spaces remain available, and windows after the real protected interval are preserved as usable Stage 1 capacity.

Dependency evidence now reads the canonical dependency counter fields, including applicable and non-applicable template dependency reference counts. The semantic audit checks edge count parity with `totalUniqueDependencyEdgeCount`, duplicate-edge absence, counter coherence, and blocker coherence from missing explicit dependencies plus cycles.

Compact Stage 1 evidence is upgraded to `INITIAL-CONSTRUCTION-STAGE1-EVIDENCE-V4` and the structural fingerprint payload to `INITIAL-CONSTRUCTION-STAGE1-FINGERPRINT-V2`. The added evidence remains bounded to meal semantics counts, protected interval crossing count, and applicable/non-applicable dependency reference counters; it does not include full payloads.

This closes the read-only Stage 1 trust gate only. It does not start Stage 2, materialize PartialPlans, change public planning output, change V3/V4, change baseline repair, alter gates, or modify DB/RLS/UI/API behavior.

### ID 277 — First Reversible Constructive PartialPlan & Bounded Branch Backtracking v1

ID277 adds experimental Initial Construction Stage 2 before V4 generation. Stage 2 is gated by `INITIAL_CONSTRUCTION`, coherent Stage 1 evidence, a selected Stage 1 anchor, and an available Search Space for that anchor. It receives only the original `EngineInput`, the original `OperationalState`, Stage 1 evidence, budget, and timestamp; it does not accept V4 planning or `EngineOutput`.

Stage 2 builds the first constructive prerequisite closure for the selected anchor from the canonical dependency graph. The closure includes the anchor plus direct and transitive prerequisites, excludes cycle/protected/non-pending tasks, records blockers for missing or unavailable prerequisites, and preserves deterministic topological order before branch construction.

The new branch builder materializes bounded real branch assignments from Stage 1 provisional windows, compatible frontier placements, deterministic resource alternatives, and late-as-possible prerequisite placement before dependents. Branches carry concrete `taskId`, planned start/end, space, and resource ids, while preserving task duration, contestant, and space instead of manufacturing feasibility by changing task identity.

Resource resolution now distinguishes fixed `byItem` requirements from plan-resource inventory: Stage 2 selects an available `planResourceItem.id` that represents the requested `resourceItemId` and avoids provisional overlaps. Quantity-one `ANY_OF` groups generate deterministic alternatives. Unsupported contracts such as unresolved `byType`, quantity greater than one, or unresolved structural requirements are rejected explicitly with `UNSUPPORTED_STAGE2_CONSTRUCTIVE_REQUIREMENT` evidence rather than ignored.

Each materialized branch uses the official ORC pipeline: `Candidate`, `composePartialPlans`, `buildCandidateStates`, `simulateCandidateStates`, and `validateSimulatedStates`. A branch is only `partialHardValid` when the simulated partial assignment passes hard validation. Stage 2 does not run the Operational Evaluator or Commit Engine and never converts a PartialPlan directly into official state.

After hard validation, Stage 2 computes a conservative preliminary Future Feasibility audit over remaining work, including contestant remaining load versus availability and missing resource inventory. Results are `FEASIBLE`, `INFEASIBLE`, or `UNKNOWN`; this is intentionally preliminary and is not the full SPEC-06 Future Feasibility implementation.

Stage 2 records bounded backtracking evidence for every attempted branch. Closure-incomplete, hard-invalid, future-infeasible, and unsupported branches are exhausted and the next branch is tried. Valid branches are ranked deterministically by hard validity, preliminary Future Feasibility, anchor finish time, remaining slack/resource freedom proxies, provisional decision count, and stable branch id.

The selected Stage 2 result exposes the selected anchor, closure ids, topological order, branch counts, attempts, rejection counts, hard-valid and future-feasible counts, selected branch/PartialPlan ids, selected assignments, validation, preliminary Future Feasibility, unsupported codes, and a stable structural fingerprint. The stage remains read-only: it performs zero commits, does not modify incumbent selection, gates, fallback, public materialized planning, or the compact planning output preserved by ID276.

### ID 278 — Stage-2 Observable & Honest Capability Gate v1

Initial Construction Stage 2 is now published in replay `orcSafetyEvidence.initialConstructionStage2` from `diagnostics.orcSummary.initialConstructionStage2FirstPartialPlan`. The replay payload is compact: it exposes execution timing relative to V4, Stage 1 anchor agreement, closure order, branch counts, selected assignment samples, validation result, preliminary Future Feasibility status, branch retry count, transformation/simulation/validation/commit counts, fingerprints, warnings, and capability audit without copying complete simulated states.

Stage 2 remains the first experimental read-only PartialPlan builder. A branch with real assignments now creates a `Candidate` with `planningInfluence: "candidate-assignments"`, `executesTransformations: true`, `initialConstructionStage: 2`, `commitsPlanning: false`, and `readOnly: true`; read-only means the official state is not committed or mutated, not that the candidate is inert.

Branch execution now checks compact lineage fingerprints across branch assignments, Candidate assignments, simulated assignment materialization, PartialPlan membership, CandidateState lineage, SimulatedState lineage, and ValidationResult lineage. Incoherent lineage rejects the branch before selection.

Future Feasibility is explicitly preliminary and honest. Stage 2 currently checks only contestant remaining load and fixed resource inventory; relevant uncovered dimensions such as future spaces, teams, cameras, zone changes, setups, and pending chains keep normal successful branches at `UNKNOWN` rather than overstating `FEASIBLE`. A branch proven `INFEASIBLE` by checked dimensions is never selectable; selection order is hard-valid `FEASIBLE`, then hard-valid `UNKNOWN`, and never hard-valid `INFEASIBLE`.

The capability audit names the current search capacity as `bounded_branch_retry`. It declares concrete assignment generation, PartialPlan composition, transformations, simulations, hard validations, contestant/space/resource overlap checks, availability checks, fixed task windows, task-scoped protected intervals, quantity-one `byItem`, and quantity-one `ANY_OF` only when those checks run. It explicitly leaves by-type, multi-quantity, itinerant team, camera capacity, zone-change, setup, recursive assignment backtracking, anchor backtracking, full Future Feasibility, complete initial planning, and public planning use of Stage 2 as `false`.

Stage 2 now resolves protected intervals, contestant availability, fixed windows, workday bounds, contestant identity, and space identity per task placement instead of reusing the anchor intervals for every prerequisite. Cycle members and unsatisfied protected prerequisites produce explicit blockers and do not silently disappear. The public planning, V3/V4 behavior, gates, baseline repair, materialization, database, UI, and endpoints are unchanged; Stage 2 still performs zero commits and does not complete the initial planning day.


### ID 279 — Recursive Closure Assignment Backtracking on Operational Frontiers v1

Initial Construction Stage 2 now replaces greedy prerequisite placement with a bounded recursive closure-assignment search over operational frontiers. Candidate starts are derived from real boundaries (dependent latest end, placed assignment starts/ends, availability, workday, fixed windows, protected intervals, and branch-window edges) instead of minute-by-minute scanning.

The search places prerequisites in reverse topological order, keeps the anchor fixed, and backtracks over both temporal choices and compatible quantity-one `byItem` / `ANY_OF` resource alternatives. Each branch carries deterministic evidence for closure completeness, placement attempts, temporal candidates, resource alternatives, recursive backtracks, repeated-state pruning, depth reached, budget exhaustion, dead-end reason counts, and a structural assignment-search fingerprint.

The intra-branch memory fingerprints partial placements by placed tasks, times, spaces, resources, and next task, so structurally equivalent states are pruned only for the lifetime of Stage 2. A finite budget derived from `ReasoningBudgetProfile` (or deterministic closure-size defaults) caps depth, positions, resource alternatives, explored states, and backtracks; exhaustion reports `ASSIGNMENT_SEARCH_BUDGET_EXHAUSTED` rather than a false infeasibility.

This iteration can materialize the first complete closure branch as Candidate → PartialPlan → Transformation → Simulation → Validation while remaining read-only. It does not implement anchor backtracking, Future Feasibility expansion, commits, public planning materialization, or complete-day planning.

### ID 280 — Recursive Backtracking Proof Gate & Runtime Evidence v1

Initial Construction Stage 2 now distinguishes implemented capability from runtime observation. The Evidence keeps the legacy fields while adding supported/observed flags for recursive assignment backtracking and branch retry, plus compact per-branch search metrics. A plan can therefore report that bounded recursive assignment backtracking is supported while honestly showing that no backtrack happened in a specific replay.

Adversarial tests demonstrate two real regret paths inside a single anchor closure: temporal backtracking (a prerequisite is first placed too late, then undone and moved earlier so the sibling prerequisite can fit) and resource backtracking (a prerequisite first consumes `R1`, then is undone and reassigned to `R2` so a later prerequisite that only accepts `R1` can fit). A separate budget test proves the strict bounded search terminates with `ASSIGNMENT_SEARCH_BUDGET_EXHAUSTED` instead of a generic placement blocker.

Plan 27 is intentionally unchanged at the public planning level: Stage 2 may support backtracking, but that replay does not need to observe it because the first valid combination already closes `[308, 313, 316, 315]`. Stage 2 remains read-only, starts no Stage 3, adds no anchors, performs no commits, and does not publish a full public planning replacement.

The obsolete greedy placement route was removed so the branch builder has a single placement algorithm: the bounded recursive assignment search with deterministic fingerprints and compact branch evidence.

### ID 281 — Genuine Temporal Backtracking Proof & Decision Trace v1

ID280 is corrected: its resource fixture was causal, but the first temporal fixture was insufficient because it could be satisfied by rejecting a local placement before any previously accepted assignment was undone. ID281 replaces that temporal proof with a bounded decision trace that distinguishes recursive regret from ordinary local candidate rejection.

Stage 2 evidence now separates temporal and resource decision backtracks and publishes a compact sample of undone decisions. The trace records depth, task id, planned interval, resources, the deeper task that failed, whether the undone decision was temporal or resource-based, whether another alternative remained, and read-only status. The recursive total remains the sum of temporal and resource decision backtracks.

Replay compact Stage 2 evidence now includes temporal/resource decision counts per branch and total temporal/resource decision backtrack counts. The capability audit declares temporal and resource assignment backtracking support separately, while observed flags remain execution-local. Plan 27 remains unchanged at the public planning level and observes neither temporal nor resource assignment backtracking.

### ID 282 — Remove Fabricated Backtracking Evidence & Prove Causal Temporal Regret v1

ID281 is corrected again: the first implementation still fabricated a temporal undo event from a rejected position inside the local `canPlace === false` branch. That position had never been accepted into the provisional PartialPlan, had never been sent into recursive `dfs`, and therefore could not honestly be reported as a decision undone by backtracking.

ID282 removes that false instrumentation completely. Local placement rejection now only records the local dead-end reason and continues to the next alternative; it does not increment temporal/resource/recursive backtrack counters, create `TEMPORAL_DECISION_UNDONE` events, or consume backtracking budget.

The new temporal fixture demonstrates the real causal regret path: task `3` is accepted at `10:00–10:30`, the deeper fixed task `2` then fails because that exclusive space interval is occupied, the accepted task `3` assignment is removed, task `3` is retried at `09:30–10:00`, task `2` is placed at `10:00–10:30`, and the anchor remains at `10:30–11:00`. The recorded event now identifies the interval that was actually withdrawn, not a locally rejected candidate or the final interval.

### ID 283 — Canonical Constructive Placement Feasibility Parity v1

Initial Construction Stage 2 now delegates local placement checks to a typed, read-only `evaluateInitialConstructionPlacementFeasibility` precheck. The precheck runs for the anchor, prerequisites, temporal alternatives, and resource alternatives, and reports concrete operational reasons: `TASK_WINDOW_CONFLICT`, `PROTECTED_INTERVAL_CONFLICT`, `CONTESTANT_OVERLAP`, `SPACE_OVERLAP`, and `RESOURCE_OVERLAP`.

Protected intervals are checked for fixed and flexible tasks across the whole candidate assignment interval. Hard breaks, real protected meals, contestant/space breaks, applicable protected transport, and protected tasks/locks can reject a flexible task; a flexible meal placement window is not promoted to a hard interval.

Contestant occupancy uses the canonical ORC operational role metadata and `occupiesContestantTime`, so productive tasks for the same contestant cannot overlap while placeholders that do not occupy contestant time do not cause false constructive conflicts.

Space occupancy uses the canonical ORC role, transport contract, and `resolveORCSpaceOccupancy` semantics together with `originOperationalState.spaces` capacity/concurrency/exclusivity. Non-blocking tasks and tasks/spaces that allow simultaneity can coexist; exclusive capacity-one overlaps are rejected.

The parity scope is intentionally limited to task windows, protected intervals, contestant occupancy, canonical space occupancy/capacity, and already assigned concrete resource-item overlaps. It does not claim support for itinerant teams, cameras, `byType` resources, quantities greater than one, zone changes, or setups.

Stage 2 evidence includes `placementFeasibilityVersion` plus conflict counters for task windows, protected intervals, contestants, spaces, and resources. The capability audit marks task-scoped protected intervals, constructive space capacity, and non-blocking space occupancy as supported while leaving the unsupported dimensions false. This iteration adds no second anchor, makes zero commits, does not expand Future Feasibility, does not complete the day, and does not change public planning.

### ID 284 — Constructive Placement Feasibility Proof Gate & Space Capacity Cardinality v1

ID284 adds the dedicated proof gate that ID283 intentionally lacked. ID283 introduced the constructive placement precheck and wired it into Initial Construction Stage 2, but its evidence still depended on older green tests rather than a focused battery for the new implementation.

The Stage 2 precheck and Validation Engine now share one canonical space-capacity implementation. The previous pairwise interpretation has been replaced by real concurrent cardinality: a shared space with capacity `2` accepts exactly two compatible simultaneous blocking occupancies, rejects a third concurrent occupancy, and keeps non-blocking operational roles at zero capacity consumption. Exclusive tasks or exclusive/break occupancy still block conflicting productive occupancy, while existing transport grouping semantics remain separate.

The dedicated tests for ID284 prove task windows, protected intervals, contestant occupancy, canonical space capacity, non-blocking placeholders, concrete resource-item overlap, deterministic reason-code ordering, and parity with Validation for the supported dimensions. The unsupported declarations remain unchanged: no itinerant-team expansion, no camera capacity, no `byType`, no multi-quantity resources, no zone changes, no setups, no full Future Feasibility, and no complete initial planning.

### ID 285 — Residual Construction State & Dynamic Second Anchor Selection v1

ID285 adds a read-only third initial-construction cognition cycle between the hard-valid Stage 2 PartialPlan and `generatePlanV4`. Stage 3 builds an immutable residual cognitive context from the selected Stage 2 PartialPlan, treating its assignments as provisional reservations rather than official planning, locks, execution, or task status changes.

Provisionally assigned tasks remain present in the dependency graph and can satisfy prerequisites for downstream residual anchors, but they are excluded from pending residual work and cannot be selected again as anchors. The residual map is rebuilt from the original `EngineInput` and origin `OperationalState` with explicit provisional assignment options, so task nodes are not physically removed and the public planning remains unchanged.

Residual pressure is recomputed for contestants, resources, spaces, zones, and the main flow. Stage 3 publishes provisional occupancy/reservation pressure, reduced pending load, residual main-flow eligibility, and a residual map fingerprint that is independent of Stage 1 ranking. The second anchor is selected by rerunning bottleneck understanding and anchor selection against this residual operational map, including evidence that distinguishes prerequisites satisfied by the first PartialPlan from prerequisites still remaining.

This iteration deliberately does not materialize the second chain. Stage 3 executes zero transformations, zero simulations, zero validations, and zero commits; it does not combine closures, mutate the Stage 2 PartialPlan, seed V4, or alter the public planning output. Its compact replay evidence is exposed under `orcSafetyEvidence.initialConstructionStage3` with the residual selection source `recomputed_residual_operational_map`.

### ID 286 — Two-Cycle Constructive Session & Combined PartialPlan v1

ORC initial construction now includes a read-only two-cycle constructive session after Stage 3 and before V4. The session keeps using the original `EngineInput` and origin `OperationalState`, treats the first hard-valid PartialPlan as provisional occupancy, and materializes the residual second anchor without mutating public planning.

Resource reservation identity is audited explicitly: physical `planResourceItemId` occupancy is tracked separately from logical `resourceItemId` demand pressure, with compact evidence for missing mappings, ambiguous mappings, and namespace collisions. The first anchor materialization path is reusable through `materializeInitialConstructionAnchorAttempt`, so branch construction, placement, resources, backtracking, transformation, simulation, and validation remain shared rather than duplicated.

For the second anchor, prerequisites already satisfied by the first PartialPlan are recognized as satisfied and are not reassigned. The residual closure contains only the second anchor and its still-pending prerequisites. When a second branch is hard-valid, ORC builds a `CombinedInitialConstructionPartialPlan` with unique assignments, preserves the first chain byte-for-byte, adds only the second-chain delta, records lineage for both attempts, simulates the combined set, and validates the combined set authoritatively.

This iteration deliberately does not add a third anchor, does not commit planning, does not seed from V4, and does not switch the public planning output to the combined PartialPlan. Evidence remains compact under `orcSafetyEvidence.initialConstructionTwoCycleSession`, with deterministic fingerprints and zero commits.

### ID 287 — Bounded Iterative Construction & Anchor-Level Retry v1

ID 286 was delivered with missing dedicated helper/two-cycle regression tests, and its README overstated reusable materialization before Stage 2 actually delegated to the common helper. ID 287 corrects that: Stage 2 now projects the historical evidence contract from `materializeInitialConstructionAnchorAttempt`, and residual productive counts are derived from `residualContext.residualProductiveTaskIds.length` rather than pending-task counts.

The ORC initial construction path now includes a read-only bounded iterative session before V4. Each accepted cycle rebuilds the residual context, residual initial-construction map, bottleneck regions, anchor ranking, and search spaces from the currently accepted Combined PartialPlan; then it tries anchors in the official residual order. If an anchor has no branch that yields a canonically valid Combined PartialPlan, the session records anchor-level blockers, marks that anchor exhausted only for the current residual fingerprint, and retries the next anchor without changing accepted assignments.

The session keeps only intra-execution memory: attempted anchors by residual fingerprint, exhausted anchors, rejected branch/anchor reasons, accepted Combined PartialPlans, explored residual fingerprints, and recurrent blockers. Memory is discarded after the run, so an anchor exhausted under one residual fingerprint may become eligible after a later accepted cycle changes the fingerprint.

Every accepted cycle validates the full Combined PartialPlan rather than only the delta. The typed `InitialConstructionIterationBudget`, derived from the ORC reasoning budget profile, caps accepted cycles, anchors per cycle, branches per anchor, transformations, simulations, validations, residual states, and logical steps. The compact evidence is exposed as `orcSafetyEvidence.initialConstructionIterativeSession` and reports deterministic cycle samples, anchor retry counts, combined validation counts, final residual pending/productive/main-flow counts, session fingerprints, zero commits, and that public planning does not use the iterative session.

Plan 27 regression coverage documents at least thirteen unique combined assignments through iterative anchor retry, while preserving the public planning output. This is not accepted-PartialPlan backtracking: recursive assignment, temporal assignment, resource assignment, and anchor retry are supported, but the session does not backtrack over already accepted Combined PartialPlans, does not claim full Future Feasibility, does not guarantee complete initial planning while residual work remains, executes zero commits, and does not publish the ORC iterative planning.

### ID 288 — Adaptive Construction Depth & Progress Benchmark v1

- La sesión ORC de construcción inicial desacopla la profundidad constructiva de `maxOpportunities`: las oportunidades ya no limitan el total de ciclos aceptados.
- El presupuesto constructivo es explícito y observable (`maxAcceptedCycles`, `maxElapsedMs`, anclas, ramas, transformaciones, simulaciones, validaciones, estados residuales y pasos lógicos), con defaults centralizados para replay de desarrollo.
- La parada conserva el último Combined PartialPlan válido y expone `budgetLimitReached` para distinguir la causa exacta (`MAX_ACCEPTED_CYCLES`, `MAX_ELAPSED_MS`, `MAX_ANCHOR_ATTEMPTS`, `MAX_BRANCHES`, `MAX_TRANSFORMATIONS`, `MAX_SIMULATIONS`, `MAX_VALIDATIONS`, `MAX_RESIDUAL_STATES`, `MAX_LOGICAL_STEPS`).
- Se añade benchmark ORC constructivo aislado mediante `npm run benchmark:orc:initial-construction -- <snapshot.json> [budgetJson]`, que ejecuta Stage 1, Stage 2 y la Iterative Session sin ejecutar V4 ni sustituir el pipeline público.
- La evidencia de la sesión reporta avance, ciclos, assignments por segundo, intentos por ciclo, contadores ejecutados, tareas productivas residuales y fingerprint determinista sin incluir tiempos de ejecución en el fingerprint.
- Plan 27 queda preparado para medir cuánto avanza el constructor actual con el límite de cuatro ciclos retirado; si no alcanza 30 assignments hard-valid, el benchmark debe registrar la primera causa real (`budgetLimitReached`, ausencia de anclas viables o restricción no soportada) sin maquillar el resultado.
- Restricciones todavía no soportadas: no se añade backtracking sobre PartialPlans aceptados, Future Feasibility completa ni nuevas heurísticas de selección/ranking.
- La construcción sigue siendo read-only: no publica el PartialPlan ORC ni ejecuta commits de planning público.

### ID 289 — Progressive Residual Anchor Widening & Honest No-Viable Detection v1

- La sesión ORC de construcción inicial separa el tamaño de lote (`anchorBatchSize`, default `12`) de la exploración total por estado residual (`maxAnchorRanksScannedPerCycle`, default `48`). La compatibilidad temporal mantiene `maxAnchorsPerCycle` como alias de lote, pero ya no representa el universo completo de anclas.
- Para cada fingerprint residual se obtiene un único ranking determinista acotado, se conserva su orden y se explora por lotes sucesivos. El primer lote puede fallar sin reiniciar la búsqueda ni reordenar el ranking: los lotes posteriores continúan con los siguientes ranks y no reintentan anclas ya examinadas bajo el mismo fingerprint residual.
- `NO_VIABLE_ANCHOR` tiene ahora semántica estricta: sólo se emite cuando no hay anclas elegibles o cuando todas las anclas elegibles visibles para ese estado residual han sido examinadas. Si queda trabajo sin examinar por límite de ranks, intentos, tiempo, ramas, transformaciones, simulaciones, validaciones, estados residuales o pasos lógicos, la parada es `BUDGET_EXHAUSTED` con el `budgetLimitReached` concreto, incluido `MAX_ANCHOR_RANKS_SCANNED`.
- La evidencia por ciclo registra conteos de elegibilidad, ranks disponibles y escaneados, tamaño de lote, número de rondas de widening, batches examinados, primer rank viable, último rank escaneado, anclas elegibles sin escanear, agotamiento real y razón de parada del escaneo. Cada batch conserva sólo muestras compactas de IDs y conteos de rechazo.
- `finalCombinedValidationResult` describe el último Combined PartialPlan conservado y permanece `VALID` mientras ese plan válido se mantenga. El resultado del ciclo terminal se informa por separado mediante `terminalCycleValidationResult`, `terminalCycleAccepted` y `terminalCycleReason` para no confundir un último intento fallido con la validez del plan provisional retenido.
- En la regresión de Plan 27, los defaults de ID 289 permiten observar widening más allá del primer lote y alcanzar al menos 29 assignments hard-valid y 10 ciclos aceptados sin usar V4 como seed, sin duplicar tareas, con fingerprint determinista y con runtime constructivo aislado bajo el presupuesto de desarrollo.
- No se añaden heurísticas, scoring, comparadores, restricciones nuevas ni backtracking sobre PartialPlans aceptados. La sesión sigue siendo read-only: cero commits, sin publicación ORC y sin cambios en el planning público.

## ID 290 — Production-Scale Constructive Frontier & Terminal Blocker Proof v1

- Initial Construction now uses the centralized production-scale constructive profile `48/12/128/60000` (`maxAcceptedCycles`, `anchorBatchSize`, `maxAnchorRanksScannedPerCycle`, `maxElapsedMs`) while preserving existing explicit overrides.
- The iterative ORC session enumerates the exact residual eligible-anchor universe once per residual fingerprint, preserves the official deterministic ranking, and only then applies the rank-scan limit.
- Plan 27 regression evidence is expected to demonstrate the current constructive frontier: at least 69 unique assignments and at least 30 accepted cycles, with the terminal fixture universe exhausted at 105 anchors.
- Terminal evidence is published separately from compact cycle evidence, including exact eligible counts, scanned ranks, unscanned counts, blocker-code counts, and deterministic blocked-anchor samples.
- Final combined validation is authoritative: it is carried from the last accepted `ValidationResult`/`SimulatedState` and matched to the combined PartialPlan fingerprint rather than inferred from assignment counts or terminal failure state.
- Structural evidence and runtime telemetry are separated. Runtime duration and throughput may be reported under `runtimeTelemetry`, but structural fingerprints and replay output hashes exclude temporal telemetry.
- This ID adds no new ranking heuristic, does not alter placements or Search Space semantics, does not backtrack across accepted PartialPlans, does not use V4 as a seed, and does not publish ORC output into public planning.

### ID 291 — Causal Terminal Blocker Evidence Contract v1

ID 290 correctly reached the production constructive frontier of 69 assignments, but its first terminal-blocker delivery classified anchors from fields that the materializer did not expose. That could turn missing Evidence into invented zero windows or zero branches, including false `NO_SEARCH_SPACE` classifications.

ID 291 adds a typed per-attempt diagnostics contract to `materializeInitialConstructionAnchorAttempt`. The diagnostics report the anchor id, whether the real Search Space was found, real provisional-window counts and samples, branch counts by status, hard-valid branch counts, branch rejection/dead-end/placement reason counts, placement conflict counters, assignment-search budget exhaustion, unsupported requirement codes, missing diagnostic fields, a deterministic diagnostics fingerprint, and read-only status.

Terminal blockers are now derived only from real Evidence produced by Search Space generation, Branch Builder search evidence, materialization attempts, and Validation. The pure `classifyInitialConstructionAnchorBlockers` function no longer classifies from task names or ids, no longer uses alphabetical ordering for the primary blocker, and never substitutes missing fields with causal zeros. If mandatory Evidence is absent, `BLOCKER_EVIDENCE_INCOMPLETE` is emitted and the absent fields remain visible.

`NO_SEARCH_SPACE` is restricted to a missing Search Space or a present Search Space with exactly zero provisional windows. Concrete blockers such as task-window conflicts, protected intervals, contestant overlap, space overlap, resource overlap, dependency conflicts, exhausted assignment-search budget, unsupported requirements, and invalid combined validation are derived from `deadEndReasonCounts`, placement feasibility counters, and Validation. The primary blocker is deterministic under typed causal precedence: incomplete Evidence, unsupported requirement, budget exhaustion, no search space, highest-frequency concrete conflict, combined invalid, no hard-valid branch, then other.

The iterative session and isolated benchmark now expose terminal blocker Evidence completeness, incomplete-anchor counts, deterministic terminal Evidence fingerprint, primary-blocker counts, terminal dead-end reason counts, and the blocked-anchor sample with real search-space, window, branch, hard-valid, dead-end, blocker, and diagnostics-fingerprint fields. These additions preserve the exact constructive planning path: no ranking, windows, branches, backtracking, public planning, DB, V3, V4, fallback, or commit semantics are changed.

### ID 292 — Bounded Anchor Temporal Candidate Search v1

ID 291 eliminated the false `NO_SEARCH_SPACE` terminal classification by requiring real Search Space evidence, but it still did not propagate anchor-placement rejections that happened before recursive prerequisite search. In the observed plan-27 frontier, 103 exhausted terminal anchors could therefore remain classified under generic `NO_HARD_VALID_BRANCH` even when concrete pre-recursive placement reason codes existed.

ID 292 replaces single end-of-window anchor placement with a bounded, deterministic temporal candidate generator. Anchor candidates are seeded only from operational frontiers: the historical end-aligned position, window bounds, fixed windows, contestant availability, protected intervals, relevant provisional/planned assignment edges, and workday limits. It does not perform minute-by-minute sweeps and does not use V4 positions as seeds.

The Branch Builder now explores anchor temporal candidates across windows in round-robin rank order: first the historical candidate for each window, then the second candidate for each window, and so on. Fixed-window tasks remain exact and generate only their fixed placement. Every branch carries read-only `anchorPlacementEvidence` with candidate rank/window, source kinds, planned bounds, feasibility result, causal reason codes, resource alternatives, and a deterministic fingerprint.

Attempt diagnostics now separate recursive `deadEndReasonCounts` from pre-recursive `anchorPlacementReasonCounts`, aggregate both into `placementReasonCounts` without double-counting branch rejections, and expose anchor temporal candidate totals, feasible/rejected/alternative counts, rejected end-aligned candidates, and alternatives that reached recursive search. The blocker classifier gives concrete placement conflicts precedence over generic `NO_HARD_VALID_BRANCH`.

Session evidence adds aggregate anchor-temporal counters (`anchorTemporalCandidatesGenerated`, attempted/accepted alternatives, rejected end-aligned candidates), terminal anchor-placement reason counts, and the first accepted alternative candidate cycle/task. These decisions are included in structural fingerprints while runtime telemetry remains excluded. ID 292 still does not backtrack between already accepted PartialPlans, does not commit or publish ORC output, and leaves public planning unchanged. Plan-27 assignment totals are reported by the benchmark evidence produced by `engine/tools/runInitialConstructionBenchmark.ts` for the active dataset.

### ID 293 — ID 292 Acceptance Repair & Temporal Candidate Contract v1

ID 292's first delivery implemented bounded anchor temporal search and merged with two pending tests, but it was not yet accepted as the production proof: Stage 2 still had an artificial two-branch cap, the reusable materializer and Stage 2 could run different anchor budgets, partial fixed windows were incomplete, temporal candidate identity was not separated from resource alternatives, and no plan-27 benchmark/replay result had been documented for that delivery.

ID 293 centralizes the Stage 2/helper branch budget through `resolveInitialConstructionAnchorBranchLimit`, preserving the historical `2..8` range with default `6`. Stage 2 no longer owns an independent two-branch formula; helper calls use the same resolver unless an iterative session passes its explicit limit.

Temporal candidate generation now preserves fixed-window tasks with start-only, end-only, and start+end declarations as exactly one candidate. Flexible candidates use canonical operational frontiers from contestant occupancy, space-capacity/occupancy semantics, physical plan-resource item identity resolved from logical requirements, protected intervals, availability, window edges, and workday edges. Duplicate temporal intervals are collapsed globally by start/end after the round-robin window traversal, merging source kinds and keeping the lowest window index.

Anchor placement evidence now exposes `temporalCandidateFingerprint`, which identifies only the canonical window/rank, planned interval, and source kinds. Branch-level fingerprints may still include resource alternatives and feasibility, but diagnostics count unique temporal candidates rather than multiplying the same interval by resource alternatives.

Historical Stage 2 tests were relaxed from accidental exact branch/placement counts to operational invariants: deterministic fingerprints, branch-attempt sums, no selected `INFEASIBLE` Future Feasibility branch, and retry counts equal to the actual rejected attempts before selection.

Benchmark status for the active repository state: no plan-27 snapshot artifact is present in the repo, so this README does not claim that ID 292 is production-accepted for plan 27. The implemented benchmark path remains `engine/tools/runInitialConstructionBenchmark.ts`; acceptance still requires running it against the real plan-27 snapshot and recording the actual assignments, accepted cycles, final validation, alternative acceptance, runtime, replay determinism, zero commits, V4-seed absence, and public-planning parity.

## ID 294 — Provisional Dependency Temporal Bounds & Combined Precheck v1

- The ORC initial construction baseline remains the Plan 27 frontier of at least 109 assignments with a final combined `VALID` PartialPlan target.
- Pending anchor and closure placement now propagates canonical dependency bounds from already assigned prerequisites and dependents: a new assignment starts after assigned prerequisite finishes and ends before assigned dependent starts.
- A combined dependency precheck evaluates canonical edges across the base PartialPlan and branch delta before Transformation, Simulation, or Validation, so branches with known dependency conflicts are rejected early.
- Late combined-validation dependency rejections are reduced by carrying causal edge evidence into constructive blockers instead of treating them as generic task-window conflicts.
- The benchmark evidence records the assignments reached after the run, including dependency-bound counts and combined precheck rejection counts.
- This change intentionally does not add backtracking between accepted PartialPlans.
- This change does not commit planning, publish ORC output, modify public planning APIs, or use V4 as a seed.

## ID 295 — Progressive Temporal Candidate Widening & Branch Budget Decoupling v1

- The documented Plan 27 starting frontier for this change is 161 assignments, 72 accepted cycles, a final combined `VALID` PartialPlan, no commits, no V4 seed, and unchanged public planning publication.
- Anchor exploration now separates temporal candidates from resource-branch evaluations: temporal candidates are produced from existing operational frontiers up to a centralized per-anchor cap, while resource alternatives are evaluated under a separate branch-evaluation budget.
- The first temporal batch keeps the historical eight-candidate behavior. Widening only executes if that batch produces no selectable branch, then scans subsequent temporal frontiers without regenerating or retrying earlier intervals.
- Resource alternatives are evaluated fairly by temporal/resource round: the first resource alternative for every temporal candidate in the batch is tried before the second alternative of any candidate can monopolize the budget.
- Benchmark/session evidence now records widening attempts, widened acceptances, maximum temporal candidates scanned, batch counts, post-initial-batch branch evaluations, dependency-bound candidate counts, combined dependency precheck counts, contradictory bounds, and first dependency-bound accepted anchors.
- No backtracking between already accepted PartialPlans is introduced by ID 295.
- ID 295 does not commit planning, publish the ORC PartialPlan, change public planning APIs, modify V3/V4/fallback/baseline repair, or add a DB migration.
- Benchmark result in this repository run: unit/type checks were executed locally; no Plan 27 snapshot artifact is included in the repo, so README does not claim a production Plan 27 benchmark number beyond the required starting frontier. Acceptance against the real Plan 27 snapshot must record the resulting assignments, remaining productive tasks, final validation, determinism, runtime under 60 seconds, honest terminal blockers, and zero commits.

## ID 296 — Conflict-Directed PartialPlan Repair & Accepted-Cycle Backtracking v1

- ID 295 real Plan 27 evidence is now documented as the repair baseline: 170 productive assignments, 67 accepted cycles, 14 anchors accepted through temporal widening, four remaining productive residual anchors, final Combined PartialPlan `VALID`, and a 55–57 second constructive runtime.
- Initial Construction placement feasibility now emits causal blocker evidence in addition to reason codes: task-window detail kinds, contestant/space/resource conflict task IDs, protected interval IDs, and dependency lower/upper-bound task IDs. This keeps repair inputs structural and avoids deriving blockers from names or hardcoded Plan 27 IDs.
- ID 296 adds a read-only conflict-directed repair problem model that builds deterministic, minimal ejection sets from causal evidence only. Ejection starts at one direct blocker and grows to bounded combinations; each ejected task is expanded through `repairDependencyClosureTaskIds` so already accepted dependents are repaired with their removed prerequisite instead of leaving broken dependency edges.
- Accepted-cycle backtracking is now represented as bounded PartialPlan repair: the runner copies the last valid Combined PartialPlan, removes only the repair dependency closure, rebuilds the residual neighborhood with the existing InitialConstructionMap, anchor selector, search spaces, materialization, transformation, simulation, and validation components, and accepts only full Combined PartialPlans that remain `VALID` and increase productive assignment count.
- Protected work remains immutable for repair: `done`, `in_progress`, explicit locks, origin OperationalState planning entries, protected tasks, and tasks outside the provisional PartialPlan are excluded from ejection. The repair path does not create implicit locks and reports `protectedAssignmentsModified: false` in its evidence.
- Iterative-session evidence now carries `initialConstructionConflictDirectedRepair`, including executed/accepted counts, attempted ejection samples, accepted ejection closures, assignment deltas, final residual productive count, validation result, deterministic repair fingerprint, `v4SeedUsed: false`, `commitsExecuted: 0`, and `readOnly: true`.
- Capability audit semantics for Initial Construction are advanced by this implementation: anchor retry, temporal assignment backtracking, resource assignment backtracking, and accepted PartialPlan backtracking are supported; accepted PartialPlan backtracking is observed only when a repair is accepted; complete productive construction is true only when residual productive work is zero; complete initial planning remains false while non-productive operational tasks are unconstructed; public planning still does not use ORC output.
- Expected Plan 27 repair target is 174 productive assignments, zero remaining productive tasks, at least one accepted repair/backtrack, stable repair and final-assignment fingerprints, final Combined Validation `VALID`, no duplicate tasks, no protected assignment changes, no V4 seed, zero commits, and no ORC publication to public planning. The final ORC times may differ from V4 because V4 positions, ordering, assignments, and seeds are not repair candidates or expectations.
- ID 296 still does not commit planning, publish the ORC PartialPlan, change public planning materialization, modify V3/V4/fallback/baseline repair, alter Stage 1/ranking/dependency semantics/search-space generation, add DB/RLS/UI/API changes, or add migrations.

## ID 297 — Executable Conflict-Directed Repair: Causal Evidence End-to-End v1

- ID 296 is corrected as the first repair delivery: it added the repair structure and preserved the verified 170 productive assignments, but did not propagate causal blocker IDs all the way to the repair runner, generated zero real ejection sets, and did not export complete repair evidence in the benchmark result.
- Anchor placement evidence now carries `causalConflictEvidence` from the executed Placement Feasibility result, including task-window details, contestant/space/resource/protected/dependency blockers, complete/incomplete markers, and deterministic fingerprints.
- Placement Feasibility and the repair dependency closure use the canonical ORC dependency graph, including explicit dependencies, template dependencies, canonical deduplication, and dependent closure over provisional assignments.
- Materialization diagnostics and terminal blocked-anchor evidence now preserve causal blocker IDs per anchor, expose complete terminal evidence through `terminalBlockedAnchorEvidenceByTaskId`, and pass that map to conflict-directed repair as `terminalEvidence.byAnchor`.
- The repair runner evaluates all current residual productive anchors per round, skips anchors without reversible causal blockers instead of inventing arbitrary ejections, resets the attempt budget per round, and accepts only repairs that validate the full Combined PartialPlan and reduce productive residual work.
- Benchmark output now always includes repair execution, rounds, attempts, accepted repair count, candidate ejection count, accepted anchors/ejections/closures, productive deltas, preservation flags, repair stop reason, repair fingerprint, `commitsExecuted`, and `v4SeedUsed` fields.
- This change remains read-only with respect to production planning publication: no V4 seed is used, no public planning output is published, and runtime/Plan 27 final counts must be recorded from the real benchmark artifact when available.

## ID 298 — Shared Canonical Construction Context & Executable Repair Acceptance v1

- ID 297's first delivery propagated causal blocker IDs correctly, but introduced repeated canonical dependency graph resolution inside Placement Feasibility and related constructive/repair helpers. On Plan 27 that regression reduced construction to the observed 69/72-assignment range inside the 90-second budget, stopped by elapsed time non-deterministically, and did not reach executable repair.
- ID 298 adds a shared read-only `InitialConstructionCanonicalContext` built once from `stage1.initialConstructionMap.dependencyGraph` when available, with a single fallback resolution only for isolated helper calls. Placement feasibility, dependency temporal bounds, combined dependency precheck, branch construction, materialization, repair problem construction, and repair closure can now reuse the same canonical task/dependency maps.
- Session and benchmark evidence now export canonical context source/fingerprint/build count, fallback and hot-path graph-resolution counters, pre-repair assignment frontier fields, and structural evaluation counters. Runtime telemetry remains separate from structural fingerprints.
- Terminal blocker fingerprints now include the full terminal blocked-anchor evidence map and all causal fingerprints, while retaining the bounded sample for readability.
- Repair ejection sets now include canonical repair neighborhoods, topological repair order, and a neighborhood dependency fingerprint; closure expansion uses the shared canonical graph and avoids Set iteration as construction order.
- The implementation remains read-only: no commits to planning, no public planning publication, no V4 seed, no DB/RLS/UI/API change, and no migration.
- Real Plan 27 acceptance values (pre-repair frontier/runtime, graph-resolution counts, repair rounds/attempts/acceptances, final productive count/residual, preservation audit, fingerprints, and total runtime) must be recorded from the benchmark artifact for the active production snapshot; this repository does not include that snapshot artifact.

## ID 299 — Candidate-Scoped Repair Profiles & Local Neighborhood Reconstruction v1

- ID 298's real Plan 27 repair baseline is now documented as 170 pre-repair assignments, 67 accepted cycles, pre-repair fingerprint `5bf24be25b5ff04dab95b3bec1b934818bcd2299242a4b4d5a13b99cf14d2703`, four residual productive tasks, final pre-repair Combined Validation `VALID`, about 44 seconds runtime, one shared canonical context build, zero hot-path graph resolutions, 6195 aggregate ejection sets, 32 attempts consumed by the first anchor, and zero accepted repairs.
- ID 299 introduces candidate-scoped repair profiles and builds ejection sets from each concrete temporal candidate's causal blockers instead of generating combinations from the aggregate blocker union. The repair problem reports profile counts, profile fingerprints, dependency-bound profile counts, `combinatorialExpansionUsed: false`, and profile-linked ejection metadata.
- Repair attempts now audit the prerequisite-closure contract: independent ejected blockers are not passed as `closureTaskIds`; materialized closure IDs, non-prerequisite closure IDs, and `closureContractValid` are exported.
- A read-only local repair-neighborhood session module now provides preservation auditing for protected assignments, outside-neighborhood modifications, lost/new productive assignments, removed/reinserted assignments, modified neighborhood assignments, and duplicate task IDs.
- Repair evidence adds fair-round fields, neighborhood-session counters, stop-reason counts, final productive assignment IDs, newly assigned productive task IDs, duplicate IDs, and the `combinatorialExpansionUsed: false` invariant.
- No V4 seed is used, no planning is committed or published, and no DB/RLS/UI/API/migration changes are introduced by this implementation. Plan 27 production acceptance values for final assignments, residual, fingerprints, and runtime must be recorded from the benchmark artifact available in the target environment.

## ID 300 — ID 299 Acceptance Repair: Executable Candidate Profiles & Neighborhood Reconstruction v1

- ID 299's first delivery preserved the required 170-assignment / 67-cycle Plan 27 pre-repair baseline and reduced candidate ejection sets from 6195 aggregate combinations to 3 profile-linked sets, but it did not propagate the concrete profiles into terminal evidence, left the neighborhood module as a non-executing stub, did not run local repair sessions, and accepted no repairs.
- ID 300 propagates temporal-candidate frontier sources and task IDs into anchor placement evidence, repair profiles, terminal evidence, repair problems, and ejection-set metadata. Dependency-bound frontier task IDs from assigned prerequisite/dependent boundaries are preserved without hardcoded Plan 27 task IDs.
- Candidate-scoped repair sessions now require terminal candidate profiles in the real runner; the aggregate fallback remains available only for isolated helper calls. Ejection sets are built only from complete profile blockers and are skipped when the known blocker set exceeds the configured ejection budget.
- The conflict-directed repair runner now evaluates ejection sets through the local repair-neighborhood session, records real session stop reasons and attempted anchor rounds, and keeps planning read-only with no V4 seed and no public PartialPlan publication.
- The local neighborhood session removes only the repair dependency closure, reconstructs the blocked anchor with canonical initial-construction machinery, reinserts remaining neighborhood tasks, validates the full Combined PartialPlan after reconstruction, and returns the original plan on failed acceptance criteria.
- This repository change was validated with the available TypeScript check and Node test suite in this environment; final Plan 27 completion metrics must still be recorded from the target benchmark artifact when the production snapshot is available.

## ID 301 — Bounded Conflict-Directed Neighborhood Expansion & Repair Acceptance v1

- ID 300 benchmark evidence is corrected to the observed result: 170 pre-repair assignments, 67 accepted cycles, 56 terminal profiles, 41 repairable profiles, 41 ejection sets, 32 local sessions, 18 anchor reconstruction failures, 14 neighborhood reinsertion failures, zero accepted repairs, and a 35–41 second runtime.
- ID 301 introduces stricter causal task-id normalization, dependency-bound blocker coverage, executable ejection-set metadata, deterministic round-robin repair queue evidence, bounded local repair search-node evidence, and real preservation/productive audit fields for accepted repair candidates.
- Benchmark documentation must continue to report only observed execution results: no ORC PartialPlan publication, no V4 seed or schedule source, no DB migration, and no public-planning change are part of this repair track.

## ID 302 — Executable Repair Search Nodes & Real Conflict-Directed Expansion v1

- ID 301 benchmark evidence is corrected to the observed result: 170 pre-repair assignments, 67 accepted cycles, 42 repairable candidate profiles, 42 ejection sets, deterministic round-robin root repair ordering, 32 root repair attempts, zero child search nodes, maximum expansion depth zero, zero accepted repairs, and an approximately 34 second runtime.
- ID 302 makes local repair expansion executable: failed neighborhood tasks now keep their own materialization profiles and diagnostics, child nodes are built from the failed task's repairable profiles, cumulative ejection closures are deduplicated, and every node restarts reconstruction from the original valid Combined PartialPlan rather than from another node's incomplete plan.
- The blocked anchor is now explored inside the same deterministic DFS as the rest of the neighborhood. Anchor alternatives are counted, visited, and backtracked with real counters; a repair is accepted only after full neighborhood reconstruction, hard Combined validation, no duplicate/protected/outside-neighborhood audit failures, and a productive residual decrease.
- Repair runner evidence now aggregates real session search-node, expansion, anchor-attempt, validation, failure-phase, child-node, depth, and anchor-branch-backtrack counters. Candidate profile counts, dependency-bound source IDs by anchor, ejection-set counts, and round-robin fairness are derived from executed repair problems rather than constants.
- This change remains read-only for public planning: no V4 seed, incumbent, ordering, or schedule source is used; no DB/RLS/UI/API migration is introduced; and commits reported by repair evidence remain zero.

## ID 303 — Cumulative Repair Search State & Replay-Safe Evidence v1

- ID 302's observed Plan 27 result is recorded as 170 productive assignments, 67 accepted cycles, 56 profiles, 42 ejection sets, 7 root attempts, 198/200 search nodes depending on execution, 128 expansions, maximum depth 3, zero accepted repairs, 61.7–66.9 second runtime, structurally different searches between runs, replay failure from truncated JSON, and no end-to-end cumulative expansion acceptance test in that delivery.
- ID 303 fixes the repair search-node contract so child nodes carry `cumulativeEjectedTaskIds` explicitly, with TypeScript interfaces for repair nodes, failures, evaluations, and expansions. The former stray `cumulativeEjected` field is no longer accepted by the node constructor.
- Child expansion is now cumulative and audited: new children union parent ejections with the failed task's new blockers, compute `newlyEjectedTaskIds` as the parent/child difference, rebuild closure from all cumulative ejections, preserve parent closure and neighborhood, and reject invalid transitions before queue insertion.
- Cumulative limits now apply to cumulative ejection count, cumulative neighborhood size, and expansion depth. Evidence records logical stop reasons including `CUMULATIVE_EJECTION_LIMIT`, `CUMULATIVE_NEIGHBORHOOD_LIMIT`, and `INVALID_NODE_TRANSITION`.
- Failed task expansion builds its local repair problem around the failed task ID and its own closure/profile evidence, then integrates the resulting ejection sets into the original root-anchor repair search.
- Node evaluation always rebuilds from the original valid Combined PartialPlan for the root attempt, removes the full cumulative closure before DFS, and exports cumulative closure removal and base preservation audit evidence.
- Repair evidence now exports deterministic node sequence and transition fingerprints, bounded first/last node samples, pruned/stop-reason counts, transition invalid counts, cumulative limit rejection counts, closure removal failure counts, and compact benchmark fields without returning `undefined` for these counters.
- Replay compaction now summarizes Initial Construction iterative repair evidence through counts, fingerprints, stop reasons, and bounded samples instead of duplicating all search nodes and large diagnostic objects. Oversized worker output is reported as `WORKER_OUTPUT_TOO_LARGE` instead of silently trimming stdout and parsing a suffix.
- This repository change remains DB safe and read-only: no migrations, no public planning change, no V4 seed/incumbent/order/schedule source, no Stage 1/ranking/scoring/search-space/dependency/validation/fallback changes, and no planning commits are introduced.
- Real Plan 27 final production metrics for ID 303 must be taken from the target benchmark snapshot. If the cumulative repair still does not complete 174 assignments there, the evidence must preserve the valid 170-assignment plan and report the real logical blocker rather than declaring success.

- ID 304 — Causal Repair Root Portfolio: Hard-Blocker Coverage, Effective-State Dedupe & Terminal Ranking v1
  - Documenta probes posteriores a ID 303: cuatro versus seis expulsiones, 12 versus 24 nodos y diversidad de 10 perfiles raíz.
  - Todas las ejecuciones observadas mantuvieron 170 assignments; el root-diversity probe ejecutó 100 nodos y 555 hijos sin aceptación.
  - Se detectaron perfiles estáticamente imposibles considerados reparables, raíces efectivas duplicadas y pérdida del ranking terminal antes del repair runner.
  - Esta iteración clasifica blockers temporales por dimensión causal, deduplica raíces por estado efectivo y propaga el ranking terminal real sin modificar el planning público.

## ID 305 — ID 304 Acceptance Repair: Real Frontier Causality & Executable Root Portfolio v1

- ID 304 is corrected against its observed Plan 27 result: it preserved 170 assignments and 67 accepted cycles, accepted zero repairs, incorrectly classified the 314 and 324 dependency-bound candidates as having no repairable profile, consumed 55/58 nodes across the compared runs, exceeded 90 seconds, produced structurally different runs, and omitted the root-portfolio contract from benchmark output.
- Window conflicts are now associated with the concrete candidate interval and normalized frontier-source time. Only reversible provisional `assigned-prerequisite-end` and `assigned-dependent-start` sources that determine the effective candidate boundary can cover an availability or workday violation; unrelated and absent mobile sources remain static.
- Repair problems merge candidate profiles by effective base state before emitting exactly one ejection set per root. Supporting profile/candidate fingerprints and the best representative rank are retained, while productive closure evidence uses the canonical residual productive classification.
- The repair runner exports the complete compact root portfolio, terminal ranks, scheduled and actually attempted fingerprints, duplicate skips, causal classification counts, and root rejection evidence. Actual attempts are recorded only after a neighborhood session is started.
- The focused regression suite verifies real-shape availability/workday evidence without causal metadata in the window detail, static and unrelated frontiers, effective-root deduplication, and the benchmark portfolio contract. Plan 27 completion is not claimed without a new observed production replay artifact.
- The accepted ID 305 Plan 27 replay preserved 170 assignments and 67 cycles, passed the portfolio contract, produced 25 repairable profiles, 18 effective roots and seven effective-state deduplications, attempted anchor 314 first, visited 50 repair nodes, accepted zero repairs, and replayed deterministically in the observed 67–75 second construction range.

## ID 306 — Valid-Boundary Projection & Shift-Corridor Repair Roots v1

- Dependency-bound availability and workday candidates now project to the nearest valid boundary using the canonical task duration and the existing placement-feasibility evaluator.
- Projected roots eject the mobile dependency sources plus blockers at the projected interval, while retaining obsolete blockers from the invalid original interval as evidence rather than ejecting them.
- A second feasibility pass verifies that reversible ejection clears the projected target and distinguishes dependency sources pending local reconstruction from immutable, protected, or static target failures.
- Repair ejection sets carry the typed target projection, objective fingerprint, frontier sources, non-empty covered reasons, and per-task ejection reasons. Local branch materialization applies objective ranking only inside repair sessions.
- Focused regression observation confirms the availability case projects `15:30–15:35` to `15:25–15:30`, replaces the original posterior space blocker with the blocker occupying the projected interval, and leaves the projected interval valid after the causal ejection. A new Plan 27 completion result is not claimed without a production replay artifact.

### ID 307: cadenas críticas en INITIAL_CONSTRUCTION

La implementación anterior calculaba cierres de dependencias, pero ordenaba tareas de forma individual: no propagaba explícitamente la criticidad *downstream* hacia los prerrequisitos, la preferencia de tareas feeder estaba invertida y las alternativas hermanas se descartaban. ID 307 incorpora un mapa inmutable de cadenas críticas, slack de cadena, frontera ejecutable y evidencia de criticidad heredada; además, el benchmark selecciona de forma explícita la estrategia `critical_chain_retained_alternatives`, mientras el comportamiento público conserva `single_path` por defecto. La estrategia de cadenas no invoca la reparación terminal.

### ID 308 — ID 307 Acceptance Repair: Executable Retained Alternatives & Cross-Cycle Backtracking v1

ID 307 implementó el modelo de cadenas y corrigió la prioridad de feeders, pero dejó el
evaluador de viabilidad futura desconectado: no conservaba alternativas, no hacía
backtracking entre ciclos, faltaba el test dedicado y el benchmark no llegó a ejecutarse.

ID 308 conecta la evaluación trivaluada (`FEASIBLE`, `RISKY`, `INFEASIBLE`) con las
alternativas constructivas de Stage 2, conserva raíces hard-valid distintas y permite que
la sesión abandone un camino sin salida y reconstruya mapa y ranking desde la siguiente
alternativa suspendida. La estrategia permanece read-only: no usa V4, no hace commits y
no invoca reparación terminal. El modo por defecto continúa siendo `single_path`.

La ejecución observada de ID 308 demostró que ese contrato no se alcanzó: Stage 2
entregó una sola raíz, no se retuvieron ni suspendieron alternativas, no hubo backtracking
y sólo se hizo una evaluación de viabilidad futura. La implementación era un wrapper de
la sesión greedy completa, agotó `MAX_ELAPSED_MS` en 91–92 segundos y sus métricas
productivas se derivaban incorrectamente del total combinado de assignments.

### ID 309 — Incremental Critical-Chain Frontier Executor & Honest Productive Evidence v1

La estrategia retenida expande ahora exactamente un `PartialPlan` por transición. Para
cada goal conserva la intención de cadena crítica, elige una tarea de su frontera
ejecutable y materializa únicamente su cierre mínimo. Cada hijo atraviesa Search Space,
Transformation, Simulation y Validation; los hermanos hard-valid se conservan en una
frontera suspendida ordenada y se reanudan cuando el camino activo llega a un dead end.
Mapa, ranking y Future Feasibility se reconstruyen desde los assignments de cada hijo.

La evidencia distingue raíces, hijos generados, hermanos retenidos, expansiones,
suspensiones, podas, dead ends y backtracks; además prueba que la estrategia no delega a
la sesión single-path. El benchmark clasifica las tareas productivas desde la
clasificación canónica y publica IDs asignados, residuales y no productivos, en lugar de
equiparar assignments totales con producción. No se afirma aquí un resultado Plan 27
nuevo: debe documentarse únicamente desde una ejecución observada del snapshot.

### ID 310 — ID 309 Acceptance Repair: Executable Incremental Expansion & Real Frontier Validation v1

La revisión de ID 309 reprodujo que el helper existía sin su spec obligatorio y que el
benchmark fallaba antes del primer hijo: construía un anchor sintético incompatible con
Search Space y omitía `transitivePrerequisiteTaskIds`. También ignoraba los presupuestos
top-level y publicaba contadores y validación final no ejecutados. ID 310 resuelve cada
tarea de frontera contra los anchors canónicos del selector, mantiene separado goal,
ejecución y cierre mínimo, agrega los contadores reales y ejecuta la validación final.
El TypeError quedó corregido y los tests sintéticos quedaron superados, pero la ejecución
observada de Plan 27 produjo sólo una raíz y cero hijos: las fronteras 210 y 220 no
tenían anchor canónico, el target usado era 155 y el presupuesto 160 era
matemáticamente insuficiente. No existe un artefacto aceptado de ID 310.

### ID 311 — Canonical Initial-Construction Universe, Support Anchors & Feasible Frontier Budget v1

Initial Construction dispone ahora de un resolver canónico, determinista y read-only
que separa trabajo productivo estricto, arrivals, departures, placeholders sintéticos,
target, soporte transitivo y universo ejecutable. El alias histórico `productiveTasks`
representa exclusivamente el target constructivo de esta fase; el flujo principal
continúa calculándose sólo con trabajo productivo estricto.

El selector admite target y soporte como anchors por task ID, publica los goals que cada
frontera alimenta y hereda la prioridad de la cadena más crítica. La expansión conserva
separados goal y execution task, materializa únicamente la frontera y exporta el
diagnóstico de anchors ausentes y de fronteras arrival/support.

La búsqueda retenida separa los límites de PartialPlans expandidos (256) y generados
(768), conserva el alias legado de generación y calcula el lower bound del camino activo
sin ampliar silenciosamente presupuestos explícitos. Los tests observados del universo,
mapa, selector, expansión y sesión retenida son deterministas y quedan superados. No se
documenta un resultado nuevo de Plan 27 sin ejecutar su snapshot.

### ID 312 — Retained Frontier Acceptance: Real Root, Progressive Widening & Best PartialPlan Selection v1

La revisión de ID 311 dejó correcto el universo constructivo observado de Plan 27:
`target=174`, trabajo productivo estricto `155`, arrivals `19` y fingerprint
`509eb88e48a7403a09fe722edcd2b5dc6c0c1e42b79ce998663fbfc8ba738245`. También se
observó que la búsqueda retenida sí generaba alternativas y backtracks
(`constructivePartialPlanCount=6`, `expandedPartialPlanCount=6`,
`generatedAlternativeCount=5`, `retainedAlternativeCount=3`,
`suspendedFrontierPeak=3`, `crossCycleBacktrackCount=3`, `searchSpacesBuilt=20`,
`materializationAttempts=20`) con validación final `VALID`.

Ese artefacto no superó el contrato ni la no-regresión: seleccionaba erróneamente la
raíz vacía porque su Future Feasibility se evaluaba con cadenas artificialmente vacías y
residual cero. Por eso `productiveAssignmentsReached = 0` no representaba el mejor nodo
realmente generado. Además, el truncamiento fijo a dos cadenas, dos fronteras y tres
branches mezclaba cuota de retención con presupuesto de exploración y podía producir
falsos dead ends.

ID 312 corrige la estrategia `critical_chain_retained_alternatives` para construir la
raíz exclusivamente desde el estado operativo protegido, recalcular mapa, residual y
Future Feasibility reales, separar evaluaciones brutas de branches de alternativas
válidas retenidas, aplicar widening determinista de cadenas y fronteras, y seleccionar
siempre el mejor PartialPlan válido construido en lugar de volver automáticamente a la
raíz. La evidencia de sesión exporta la raíz real, el comparador de mejor progreso,
contadores de widening, agotamientos diferenciados y `falseDeadEndCount`.

#### Observación posterior de ID 312 en Plan 27

La medición posterior de ID 312 en Plan 27 dejó evidencia distinta del resultado esperado:
`target=174`, trabajo productivo estricto `155`, arrivals `19` y fingerprint canónico
correcto, pero sólo alcanzó 91 y 93 tareas asignadas en dos ejecuciones, con 81 y 83
residuales, alrededor de 91 segundos de runtime, validación final `VALID` y un prefijo
determinista de 91 decisiones. La diferencia final entre ejecuciones provino del corte
temporal, no de una divergencia temprana del ranking.

El hot path observado siguió siendo demasiado repetitivo: 174 cadenas críticas en raíz,
pero sólo 19 fronteras ejecutables únicas; 2.802–2.918 materializaciones; más de 10.000
branch evaluations; y miles de rechazos publicados como closure-incomplete. La
no-regresión y el contrato de aceptación quedaron fallidos porque el motor materializaba
repetidamente la misma tarea ejecutable para cada goal soportado.

### ID 313 — Shared Critical-Frontier Aggregation & Single-Evaluation Expansion v1

ID 313 cambia la unidad de expansión de Initial Construction retenido de apariciones de
cadena crítica a acciones ejecutables únicas por `executionTaskId` dentro de cada
PartialPlan padre. Las cadenas críticas siguen siendo la fuente cognitiva del portfolio,
pero sus fronteras se agrupan antes de materializar: el candidato conserva goal primario,
goals soportados, fingerprints/ranks de cadenas, criticidad heredada, fanout y presión
máxima observada.

La expansión construye un portfolio único, aplica widening sobre tareas ejecutables
únicas, materializa cada `executionTaskId` como máximo una vez por padre, deduplica el
fingerprint combinado antes de Transformation/Simulation/Validation/mapa hijo, y
reconstruye mapa y Future Feasibility después de cada hijo aceptado. La evidencia separa
rechazos de colocación del anchor, fallo real de cierre tras anchor válido, integridad de
cierre, precheck de dependencias, hard validation y requisitos no soportados. También
exporta conteos de ocurrencias de frontera, tareas únicas, duplicados evitados,
portfolio fingerprint, tareas únicas escaneadas, materializaciones únicas y goals
soportados por frontera materializada.

#### Resultado observado corregido de ID 313 en Plan 27

La observación determinista posterior de ID 313 confirmó la agregación compartida correcta
por `executionTaskId` y dejó `repeatedFrontierMaterializationCount = 0`, con 2.223
materializaciones duplicadas evitadas. Sin embargo, el resultado observado fue insuficiente:
60 tareas asignadas, 114 residuales, 200 PartialPlans expandidos, 569 hijos generados,
353 podas por anchura, seis backtracks, runtime de 83–86 segundos y Validation final
`VALID`. El contrato y la no-regresión quedaron fallidos, y el artefacto no exportó las
métricas raíz exigidas por el contrato.

### ID 314 — Bounded Best-K Suspended Frontier & Nearest Relevant Backtracking v1

ID 314 reemplaza el rechazo ciego por capacidad en la frontera suspendida de
`critical_chain_retained_alternatives` por una frontera Best-K determinista. Cada sibling
se ofrece contra las alternativas suspendidas, se deduplica por fingerprint de
asignaciones, se ordena con el comparador canónico existente y sólo se conserva si queda
entre las mejores `K`; cuando la frontera está llena, una alternativa superior expulsa a
la peor retenida y una peor se rechaza explícitamente como
`WORSE_THAN_RETAINED_FRONTIER`.

La reanudación tras dead end selecciona primero por calidad operativa canónica y sólo usa
localidad entre alternativas equivalentes: mayor prefijo común con el camino fallido,
menor distancia de backtracking, mayor profundidad y fingerprint determinista. La sesión
exporta Evidence de ofertas, admisiones, reemplazos, expulsiones, rechazos por peor
ranking, duplicados, fingerprints de frontera, auditoría de no expulsar la mejor
alternativa, métricas de selección de backtracking y métricas raíz capturadas desde la
primera expansión sin recalcular el portfolio.

Resultados observados en tests de unidad: reemplazo con frontera llena, rechazo correcto,
no rechazo ciego, invariancia ante orden de llegada, backtracking local, prioridad de la
mejor alternativa global y retención de alternativas posteriores mejores en trayectorias
largas quedan cubiertos de forma determinista. No se documenta aquí un nuevo resultado de
Plan 27 end-to-end sin ejecutar su snapshot.


### ID 315 — Conflict-Directed Backjumping for Initial Construction v1

ID 315 añade un selector puro y determinista de backjumping dirigido por conflicto para
`critical_chain_retained_alternatives`, sin cambiar la política de admisión Best-K de ID
314 ni ampliar presupuestos. Cuando una expansión termina en dead end, la sesión construye
un contrato serializable de conflicto causal con tarea de frontera, goals críticos, razones
normalizadas, asignaciones provisionales bloqueantes, decisiones del `decisionPath` que
las introdujeron, profundidad causal más reciente y fingerprint estable. Si el bloqueo no
puede atribuirse a una decisión reversible, se conserva el fallback seguro al selector
legacy y se publica la razón.

El nuevo evaluador compara cada alternativa suspendida contra el conflicto demostrado:
marca asignaciones causales eliminadas o conservadas, decisiones causales cambiadas,
conflictos idénticos, falta de historia causal suficiente y distancia de backjump. Sólo una
alternativa que cambie demostrablemente una decisión causal puede ganar el selector
conflict-directed; entre alternativas causales se prioriza la causa más reciente y después
el comparador operacional canónico de ID 314. La sesión mantiene además no-goods
in-memory, deterministas y acotados para conflictos equivalentes, limitados a evitar
reanudaciones que reproduzcan exactamente el mismo conflicto y a producir Evidence.

La Evidence de sesión exporta los contadores ID 315 de construcción de conflictos,
conflictos con/sin decisión reversible, asignaciones y decisiones causales, intentos y
aceptaciones de backjump, alternativas no causales o de mismo conflicto saltadas, media y
máximo de distancia, no-goods registrados/hits, dead ends equivalentes evitados, muestras
acotadas de conflictos/selecciones y fingerprint causal. No se documenta aquí completitud
de Plan 27: debe verificarse con el benchmark real y su artefacto específico.


### ID 316 — Structured Causal Blocker Propagation and Effective Backjumping v1

ID 316 corrige el núcleo causal de ID 315 para que los conflictos de construcción se
formen sólo con blockers respaldados por Evidence estructurada de materialización. La
ruta retained-frontier conserva `InitialConstructionFrontierFailureEvidence`, lineage
inmutable de decisiones y un índice assignment→decisión; `decisionPath` queda sólo como
telemetría compatible y deja de usarse como fuente causal. Si la Evidence está
incompleta, el selector conflict-directed no inventa blockers ni usa todas las
asignaciones activas como fallback: publica el déficit y retorna al selector legacy.

El selector causal distingue blockers eliminados, modificados y conservados, separa
cambios no bloqueantes (`CHANGES_ONLY_NON_BLOCKING_DECISIONS`), compara de forma
read-only contra la selección legacy y emite contadores/muestras estructuradas para
demostrar cuándo cambia o coincide con legacy. Los no-goods se registran sobre el
fingerprint causal mínimo y el presupuesto de cross-cycle backtracks se evalúa antes de
ejecutar la siguiente reanudación, de modo que `maxCrossCycleBacktracks = N` nunca puede
producir `N + 1` backtracks. No se documenta mejora de Plan 27 sin adjuntar el artefacto
real `plan-27-orc-structured-causal-backjump-v1.json`.

### ID 317 — Candidate-Level Window Conflict Causal Attribution v1

ID 317 conserva Evidence temporal rechazada a nivel de candidato para cerrar la pérdida
causal entre los candidatos generados por `initialConstructionBranchBuilder`, los perfiles
`InitialConstructionRepairCandidateProfile`, la Evidence de fallo de frontera y el
backjumping dirigido por conflicto. La materialización reutiliza
`profileFromAnchorPlacementEvidence()` como clasificador único y publica muestras
acotadas y deterministas de candidatos reparables, estáticos, inmutables e incompletos,
además del candidato representativo elegido con preferencia por oportunidades reales de
backjump.

La Evidence completa de `TASK_WINDOW_CONFLICT` ahora exige una explicación estructurada:
links shiftables respaldados por fuentes móviles y lineage, blockers inmutables, razones
estáticas normalizadas o un motivo explícito de Evidence incompleta. El conflicto causal
usa los `repairableConflictTaskIds` del candidato representativo y deja de fusionar
blockers de candidatos incompatibles o frontier sources no demostrados. Los contadores de
no-good separan coincidencias observadas de transiciones realmente omitidas, evitando
contabilizar como dead end evitado un fallback legacy que sí se ejecuta.

Validar Plan 27 con `bash validate-id317-plan27.sh`; el script genera
`plan-27-orc-window-causal-attribution-v1.json` con las dos runs, determinismo,
contratos técnicos, no regresión y clasificación de conflictos de ventana.

### ID 318 — Conflict-Directed Decision Checkpoint Reopening v1

ID 318 añade reapertura causal acotada para `INITIAL_CONSTRUCTION`: cuando la Evidence
demuestra que una decisión reversible introdujo el blocker real y la frontera Best-K no
contiene alternativas útiles, la sesión resuelve el checkpoint padre exacto mediante
`parentPartialPlanId`, `decisionLineage`, `decisionId`, `decisionDepth`,
`decisionBranchFingerprint` y fingerprints de assignments. El índice determinista del
grafo permite consultar nodos por ID, fingerprint, parent, profundidad, decisión y branch
sin parsear `decisionPath`.

La recuperación causal revisa siblings ya generados —incluidos los expulsados de Best-K
registrados en el archivo causal in-memory— y sólo acepta alternativas que cambian o
eliminan el assignment blocker. Si no existe alternativa generada, la sesión reabre el
checkpoint con el pipeline constructivo oficial a través de
`expandInitialConstructionPartialPlanOnce()`, excluyendo la branch y los assignments que
reproducen el conflicto y consumiendo presupuesto real con `totalExpansionWorkUnitCount`.

La Evidence publica resolución de checkpoint, recuperación de siblings, reaperturas,
exclusiones, no-goods realmente omitidos, supresión de fallback legacy equivalente y el
stop reason `CAUSAL_DECISION_ALTERNATIVES_EXHAUSTED` cuando el checkpoint queda agotado.
Validar Plan 27 con `bash validate-id318-plan27.sh`; el script genera
`plan-27-orc-causal-checkpoint-reopen-v1.json` y conserva intactos los baselines ID 314 a
ID 317.

### ID 319 — Conflict-Specific Causal Branch Outcome Memory v1

ID 319 añade una memoria causal in-memory, determinista y acotada para `INITIAL_CONSTRUCTION`. La sesión identifica la branch directa bajo el checkpoint causal mediante `parentPartialPlanId` y lineage del grafo de `PartialPlan`, abre un intento por conflicto/checkpoint/decisión/branch antes de activar una alternativa, conserva el resultado operativo de la branch y registra no-goods específicos cuando el mismo subtree reproduce el conflicto exacto.

El ledger distingue outcomes activos, conflicto repetido, progreso seguido de repetición, conflicto diferente, frontera bloqueada resuelta, hard-invalid, future-infeasible, complete y fin de presupuesto. Los descendants de una branch agotada se filtran para ese conflicto sin mutar el grafo ni la frontera original, sin aplicar la prohibición a otros conflictos y sin consumir backtracks por transiciones descartadas antes de activarse. La Evidence publica contadores de intentos, outcomes, no-goods de branch, skips de subtree y muestras/fingerprints deterministas.

Validar Plan 27 con `bash validate-id319-plan27.sh`; el script genera `plan-27-orc-causal-branch-outcome-memory-v1.json`, compara el presupuesto con `plan-27-orc-causal-checkpoint-reopen-v1.json`, ejecuta la batería ORC focal y comprueba determinismo y semántica mínima de outcomes/no-goods.
