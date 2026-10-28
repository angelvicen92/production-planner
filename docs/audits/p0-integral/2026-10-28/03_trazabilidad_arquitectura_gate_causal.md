# INFORME 03 — Arquitectura, composición y auditoría causal integral

> **Corte:** 2026-10-28. `main = 39e26f1c2e84cc8160c2066e197d61bc8b972384` (merge #1213). La rama U02c se excluye. **Tipo de comprobación de esta entrega:** inspección remota de fuentes/código y reconciliación de Evidence existente; no se ejecutó una jornada UI+Postgres/SQL propia en esta auditoría. No afirmar que se visitó Replit/Supabase real.

**Fuentes de autoridad:** [00](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [01](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [03](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.8.md), [04](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.9.md), [05](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/05_VALIDACION_CALIDAD_BENCHMARK_v2.8.md), [06](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.10.md), [07](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official) y [AGENTS.md](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/AGENTS.md). La Fuente 06 prevalece sobre errores de los PDF humanos. **Nota:** etiquetas `UI_PRESENT_UNVERIFIED` significan componente o Evidence previa localizado, NO prueba end-to-end universal.

## Mapa de consumidores y frontera exacta de autoridad

| Punto del call path | Archivo/función inspeccionada | Decisión con riesgo |
|---|---|---|
| A. Crear perfil general/día | `client/src/components/new-day-planner-editor.tsx`, `shared/newDayPlannerConfiguration.ts` | MAIN_WITH_VOCAL_FEEDER exige flow+Vocal; STANDALONE_ONLY no Main. Solo aceptar configuraciones compatibles |
| B. Crear tareas/overrides | `client/src/pages/settings.tsx`, `client/src/pages/plan-details.tsx`, day-capability editors | Una plantilla genérica puede conservar JSON no editable; ID y `0`/null de instance son autoridad |
| C. Resolver fuentes | `server/newDayPlannerConfiguration.ts::applyNewDayPlannerConfiguration`, dayConfigurationService | Dependency template→concrete participant; falta instance detectada; roles y `requiresAuxiliar/Presenter` pueden generar UNSUPPORTED |
| D. Builder | `engine/buildInput.ts::buildEngineInput` | Snapshot, recursos concretos, calendar/roles, requires, agenda y materializationIssues deben proyectarse sin pérdida |
| E. Adaptación/preflight | `engine/planner-next/integration/engineInputAdapter.ts`, `engine/planner-next/validate.ts::preflight` | Un guard no soportado **no** significa inviabilidad física. Contrato `joint` admite auxiliares; `shared/capacity>1` y otras formas limitadas se rechazan |
| F. Resolver Scope | `server/assistedScopeOrchestrator.ts::recommendNextAssistedScope`, `engine/planner-next/assistedPlanning.ts` | Debe elegir unidad crítica, no spaceId, cerrar supporting sin hacerlos Stage visibles salvo petición |
| G. Geometría Main y feeder | `engine/planner-next/exactMainAndFeederCore.ts` | Bloques mínimos, witness anónimo, matching coach/feeder y rematerialización de bundles; proteger disponibilidad de C y Totales |
| H. Unidades macro y matching | `engine/planner-next/exactItinerantPlan.ts`, `macroScheduling.ts`, `technicalChains.ts`, `itinerantUnitAssignment.ts` | Elección de unidad y miembros físicos, fases flexibles, transiciones e impactos en recursos y locaciones reales |
| I. Futuro y poda | `futureFeasibility.ts`, `participantFutureFeasibility.ts`, `futureStructuralWitnessSet.ts`, `participantMeals.ts` | Un witness aproximado no prueba inviabilidad; no matar última alternativa de un bloque REQUIRED/19 comidas |
| J. Validación previa | `engine/planner-next/validate.ts::validatePlan` | Validación hard de espacio, unidad, recurso, participantes, coach, preparación, joint; no aceptar si incompatibilidades nuevas |
| K. HTTP/Stage | `server/assistedProposalService.ts`, `server/assistedPlanningService.ts`, `supabase/migrations/077–125` | Identidad y materializaciones autenticadas; Propuesta→Draft→Stage guardado con CAS y SQL certificados |
| L. Histórico/UI | `assisted-planning-workspace.tsx`, stage history, `shared/assistedAutopilot.ts` | Protección automática no Lock; stages inmutables, rollback/redo, avance persisted; button no garantía de 266 |

## Gate 07 completo: caso U02a → U02b, causa demostrada

**Comportamiento X:** 24 obligaciones físicamente compatibles de Main/Vocal + macro REQUIRED itinerante fija con joint/pausa producían `422` por exclusión de perfil, aunque un contrafactual en memoria lograse 24/24 con 127/160 branches.

**Causa Y:** `requiredPhaseCompositionSupported` y `fixedItinerantCompositionSupported` exigían perfil STANDALONE_ONLY; las funciones SQL equivalentes rechazaban Main nativo. El primer rechazo estaba **antes de la búsqueda productiva**, no era un problema de agotar 100.000 ramas ni un error de matching.

**Pérdida operativa Z:** el responsable no podía construir Main/Vocal y el bloque EVA/Alfombra en una jornada por las mismas autoridades compartidas, pese a ser materialmente compatibles bajo resources specific fixed y transiciones explícitas 0.

**Delta W:** U02b extendió **solo dos admisiones TS + dos funciones guard SQL** a Main nativo exacto, conservó límites specific/trans0/identidad, no reescribió solver ni heurística ni aumentó budget.

**Evidence M:** 24/24 S1 parcial+S2 SQL, 12 Stages en dos bases, dos órdenes de guardado y topología AB→AC, ataques físicos, fingerprint, recursos, CAS/protección y cold replay. Comparación de branches U02a vs U02b **equivalente en igualdad de input**, no regresión. [`Causa y delta`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/cause-and-delta.md), [`call path`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/causal-path.md), [`límites`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/comparison-and-limits.md).

## Auditoría causal de los siguientes cruces — hipótesis, NO implementación decidida

**Reality anclado + macro (U02c):** en U00x ya se certificaron 3 anchors + standalone con agenda/herencia/ocupación ortogonales; en U02b macro Main/fases fixed. De esa evidencia no deriva que **ambos** construyan el mismo día. La rama U02c está en curso y sus documentos no son resultado de `main` ni objeto de revisión en esta entrega. Hipótesis a falsar: un predicado de admisión global elimina un camino físico válido, o Future/SQL detecta una incompatibilidad real de recursos/ocupación. **No asignar X/Y/W como certeza hasta Gate de U02c.**

**A/B alternative + transición 15 + macro:** U02b exige `specific` y transition 0 para esa macro; los contratos existentes de `allowedItinerantTeamIds` y `transitionMinutes` prueban capacidad aislada, no la intersección. Punto de causalidad aún sin demostrar: puede fallar en schema/admisión, matching de miembros, ocupación transitiva, resource availability, Future, o SQL. La siguiente acción cuando llegue su turno es una **matriz contrafactual de una unidad fixed→any y trans0→15** conservando el mismo día; registrar **primer** reason code y si existe plan físico.

**Transporte + macro/Main:** U00f demuestra agrupación y Stages, U02b describe como incompatible combinación de fases. No es lícito redactar hoy “el backtracking de transporte lo causa” sin comprobar el primer `UNSUPPORTED_*` en `engineInputPreflight`. Probar mínimo IN/OUT sobre el perfil U02b, quitar temporalmente solo el contrato para diagnóstico en memoria, nunca usar overlay productivo.

**Comidas y rounds:** no basta que `U00g` y `U00p` pasen separados. Antes del primer S1 el witness debe reservar la **unidad futura completa** (19 Sodexo y rondas con ambas lanes y descansos) sin imponer una hora concreta del PDF. Un `NO_PROPOSAL/TIMEOUT` sin certificado es **SEARCH_EXHAUSTED**, no sentencia de imposibilidad. La frontera debe separar falta de UI, `UNSUPPORTED`, `INVALID` físico, y búsqueda agotada.

## Matriz de intersecciones

Ver [`M03_matriz_compatibilidad_21_intersecciones.csv`](M03_matriz_compatibilidad_21_intersecciones.csv). Las intersecciones se clasifican por el contrato exacto y citan evidencia y gate de falsación. Resumen:

- PRODUCTIVE_COMPOSED **hasta SQL**: Main/Vocal × macro fixed/trans0 × joint × pausa; anchored×standalone sin macro; joint fases standalone.
- PRODUCTIVE_ISOLATED/parcial: Transporte, setup, sincronización de rondas, participante meal, A/B + transición positiva, ciertas rutas legacy.
- `UNSUPPORTED_EXPLICIT` o `NOT_TESTED` en combinación: Macro × transport/setup/round/any/trans15; comidas múltiples sincronizadas; Main+macro+anchored (U02c en curso, no cuenta).
- `NOT_TESTED` crítico: A2 nativo 266/266 desde UI/Assisted y éxito de Autopilot general.

## Lógica operacional y reglas anti-regresión

La prioridad correcta no es “primero todo Main por nombre”; se calcula por holgura real, compartición CAM/coach, bloques y carga de futuras unidades. Para el A2 son críticos Main/Caracolas, Reality C+EVA después 16, Totales y comidas con ventana. `P14` o Giratuto flexible llenan huecos sin matar opciones únicas. Proteger una asignación A/B nominal sin necesidad consume libertad futura; bloquear Estudio7 45 min por Reality es un error físico; heredar CAM1 a Reality Corner a partir de espacio es un recurso ficticio; fijar C06→C12→C11 dentro de fase A es una falsa precedencia.

**Do not copy the PDF timing:** el test humano prueba existencia abstracta, no que todo snapshot reciente sea factible bajo 5/0/30/15 y otros cambios Fuente 06. La prueba de inviabilidad debe ser un certificado sound o búsqueda exhaustiva, nunca cero dominios de una sola permutación.

## Simplificación arquitectónica prioritaria

1. Reutilizar `newDayPlannerConfigurationSchema`, effective config revision y editores de día ya existentes; no crear AST universal o tabla de “reglas A2”.
2. Reutilizar `TaskTemplatesSettings` y contrato `resourceRequirements` para UI; el motor ya consume `byItem` bajo casos concretos.
3. No duplicar `coachRouteTransitions`; proyectar el histórico a una autoridad nativa con provenance donde sea representable.
4. Ampliar predicados de compatibilidad sólo después de demostrar que toda ruta de SQL/solución física conserva semántica. U02b demostró costo neto pequeño.
5. No convertir `Autopilot` en segundo solver; su engine es Assisted. No aumentar branch budgets/timeouts por ASST-010.
6. Introducir una sola unidad lógica por PR, con dos topologías no A2 y comparativa baseline mismo input, más negativos.

## Incertidumbres residuales que impiden nuevas heurísticas

- No hay primer rechazo causal reproducido para cada una de las 21 intersecciones; muchas quedan `NOT_TESTED`, no diagnósticos.
- No hay inspección de estado Replit/Supabase real ni verificación de todas las rutas UI bajo todos los roles.
- Las rutas legacy a alguna propiedad pueden existir, pero no son configuración **nativa desde UI**.
- El outcome del PR U02c aún no se conoce en `main`; no se debe saltar esa frontera con otro prompt.