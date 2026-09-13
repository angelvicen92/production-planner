# A3-ORCH-REAL-023 — auditoría secuencial del método constructivo

## Alcance, base y método

Auditoría **read-only** sobre `9209e782a934070befc336763be7b67e722cadab`, con árbol inicialmente limpio. No se usaron las PR #871–#875 como base ni se hizo cherry-pick. Se ejecutó una sola vez el comando canónico Full A2 a 5.000 ramas; el replay ON/OFF que ejecuta el propio runner forma parte de esa única ejecución. El JSON canónico generado se restauró y no quedó instrumentación temporal.

```text
PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000 PLANNER_NEXT_FULL_A2_CAUSAL_DIAGNOSTIC=true npx tsx engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts
```

Resultado observado: `BRANCH_BUDGET_EXHAUSTED`, 5.000 ramas exactas (`CORE=1.599`, `STANDALONE=3.401`), una hoja core hard-valid, profundidad core 19, frontier standalone 129 e invariancia diagnóstica `exactMatch=true`. No hubo 10k/20k/50k/300k, phase gate, scoring nuevo, patch de presence/boundary ni publicación parcial.

Las Fuentes oficiales contrastadas son SPEC-06 (construcción y Future Feasibility), SPEC-07 v2.0 (método constructivo por fases y bloques), SPEC-08 v1.1 (operaciones/unidades itinerantes), SPEC-09 (política explícita) y SPEC-10 (EngineInput, preflight, locks, ejecución y publicación). Cuando el repositorio no contiene el texto completo de una SPEC, la formulación exacta utilizada es la claim oficial versionada en `focalA2SourceManifest.ts`, el contrato de cobertura aprobado o el requisito explícito de esta auditoría; no se completa con intuición.

## Matriz secuencial extremo a extremo

`PASS` significa comportamiento ejecutado u observado, no mera existencia de código. `NOT_ACTIVE` significa que Full A2 no alcanzó esa puerta. `INCONCLUSIVE` evita certificar una semántica que la representación no aporta.

| etapa | requisito exacto de Fuente | símbolos / archivos | Full A2 observado y Evidence | estado |
|---:|---|---|---|---|
| 0 EngineInput / preflight / adapter | SPEC-10: adaptar sin pérdida, fallar cerrado ante dimensiones no representables, preservar identidad/ventanas/recursos/dependencias; SPEC-08: disponibilidad e identidad itinerante explícitas; ninguna inferencia por nombre | `preflightEngineInputForPlannerNext`, `adaptEngineInputToPlannerNextProblem`, `effectiveTaskFixedInterval`; `integration/engineInputPreflight.ts`, `integration/engineInputAdapter.ts`, `contracts.ts` | 269 obligaciones; preflight y adapter `SUPPORTED`, cero issues; fingerprint del problema `d4f16fde…f0bfa`; tres unidades itinerantes, joints, round, technical chain, setup, meals y transport llegan tipados. El input fuente no usa horas del planning humano. La ausencia de una etiqueta permanente de fase en `PlannerNextProblem` no altera el input hard y no demuestra una carencia: la fase puede ser una decisión dinámica derivada de las autoridades conservadas; esa capacidad se audita en la etapa 8. | **PASS** |
| 1 política / dispatcher | SPEC-09/10: seleccionar política explícita y ejecutar exactamente un motor; un resultado incompleto no es publicable | `executePlannerNext`, `PlannerSearchPolicy`, runner Full A2 | el dispatcher ejecutó una vez `EXACT_CONSTRUCTIVE`; devolvió `BRANCH_BUDGET_EXHAUSTED`, `complete=false`, 0 tareas publicadas y 269 pendientes. No hubo fallback. | **PASS** |
| 2 protegidas / locks | SPEC-07 §11 y SPEC-10 §§8–9: `done`/`in_progress` son inmutables; tiempo, espacio, recursos, relaciones y locks aplicables se conservan; `cancelled` no crea obligación | preflight/adapter, `effectiveTaskFixedInterval`, `effectiveTaskResourceAssignments`, `canPlaceTask`, `validatePlan` | el template Full A2 pasa preflight/adapter sin pérdida ni conflicto protegido. Las autoridades quedan incorporadas antes de buscar; no se reescribió ningún lock como preferencia. El corpus canónico de esta ejecución no presenta una divergencia protegida. | **PASS** |
| 3 comprensión global y criticidad | SPEC-06/07: construir desde todas las obligaciones y restricciones; criticidad sólo desde contratos hard/Future Feasibility, nunca nombres/IDs | `mainFlowPatterns.ts`, dominios exactos, `checkStandaloneCoreFrontier`, `resourceAvailabilityMinutes` | antes de consolidar core se consideran 269 obligaciones y se realizan 187 checks individuales, 22 de capacidad colectiva y el frontier global resulta factible. Las decisiones usan ventanas, dependencias, capacidad y recursos tipados; no hay señal derivada de nombres. No se observa una omisión anterior al core. | **PASS** |
| 4 arquitectura de bloques main | SPEC-07: minimizar bloques factibles, construir arquitectura main por bloques/runs antes de asignar personas; continuidad main hard | `generatePatternLayers`, `candidateTimelineDomain`, `proveMainFeederArchitectureImpossible`, loop de `runExactMainAndFeederSearch` | capa ejecutada de 2 runs: 2 patterns y 503 arquitecturas comprobadas; `firstFeedableRunSizes=[8,11]`. La arquitectura precede a la asignación. | **PASS** |
| 5 asignación de cohortes main | SPEC-07: dentro de la arquitectura elegida, asignación crítica/MRV y matching completo; no first-fit incompleto | `assignMains`, `residualMatching`, `findCanonicalPerfectMatching` | se alcanza profundidad main 19 y una hoja core; el ledger registra matching/residual y no publica asignación parcial. | **PASS** |
| 6 pipeline feeder + transiciones | SPEC-07 §13: feeders derivados de dependencias explícitas, cohortes contiguas por run y transiciones hard; no derivación nominal | `deriveFeederCohortRelaxedCertificate`, `checkFeederTask`, `feederRunOptimisticallyImpossible`, `effectiveCoachTransitionMinutes` | la hoja core cierra los runs 8+11 con sus feeders; las dependencias explícitas, ventanas de cohorte, capacidad y transiciones se comprueban antes de entregar la hoja a standalone. | **PASS** |
| 7 Future Feasibility al cerrar core | SPEC-06/07: no consolidar core que deje obligaciones futuras necesarias sin dominio/capacidad; prueba conservadora no puede convertir incertidumbre en rechazo | `checkPartialCoreStandaloneCollectiveCapacity`, `checkStandaloneCoreFrontier`, callback `onHardValidCoreLeaf` | una hoja core se valida y su frontier post-core pasa (`coreStandaloneFrontierPrunes=0`); 187 dominios individuales y 22 capacidades colectivas fueron comprobados. El fingerprint de esa hoja no se publica en Evidence porque el resultado global agotó presupuesto: `coreFingerprint=null` y `selectedCoreFingerprint=null`. Esto es una limitación de observabilidad, no una divergencia de búsqueda. | **PASS** |
| 8 selección post-core de fase | SPEC-07: **fase elegible → unidad crítica dentro de esa fase**; hard/Future Feasibility gobierna elegibilidad; MRV global no sustituye el avance por fases | `searchStandaloneForCoreCandidate`, construcción de `macroUnits`, `searchMacroUnits`, `selectMostConstrainedUnit` | al primer estado post-core se mezclan simultáneamente 78 macros: 3 `ITINERANT_UNIT`, 70 `RESOURCE_TASK`, 2 `JOINT`, 1 `ROUND_SYNCHRONIZATION`, 1 `SETUP_GROUP`, 1 `TECHNICAL_CHAIN`. No existe filtro/autoridad previa de fase. `selectMostConstrainedUnit(constrained)` elige globalmente `itinerant:itinerant-team:5003` por `mixed-domain-semantic-policy`, por delante de todas las demás clases. Es la primera desviación cronológica inequívoca. | **DEVIATION** |
| 9 selección de unidad dentro de fase | SPEC-07: una vez fijada la fase, elegir su unidad más crítica; sólo entonces MRV/matching interno | `selectMostConstrainedUnit`, `recordMacroDecision` | sí se elige una unidad explícita, pero sobre la bolsa global de seis kinds, no dentro de una fase elegible. La selección local no puede certificarse conforme al método porque falta su precondición. | **DEVIATION** |
| 10 geometría de unidad | SPEC-07/08: construir geometría conjunta sólo si el contrato define una estructura; no inventar contigüidad para operación itinerante `STANDALONE` | `createExactSetupBlockExplorer`, `exploreExactRoundSynchronizationPolicy`, `createTechnicalChainExplorer`, `scheduleJointGroup`, agenda `ITINERANT_UNIT`, rama `RESOURCE_TASK` | setup/round/chain/joint construyen geometría contractual; itinerant agrupa agenda y coloca operaciones standalone individualmente sin exigir contigüidad ficticia; resource coloca un start individual. La mecánica por kind es coherente, pero se activa después del selector desviado. | **PASS** (local) |
| 11 asignación interna / matching | SPEC-07: MRV/matching después de fijar fase, unidad y geometría | `findCanonicalPerfectMatching`, matching de setup/round, `itinerantUnitInternalSelections`, ranking de starts | dentro de la primera unidad itinerante se elige `task:10169`, dominio dinámico 54, por `minimum-dynamic-domain`; después se recorren starts. Setup y round disponen de matching completo. Orden interno correcto localmente, pero bajo unidad elegida por una autoridad global incorrecta. | **PASS** (local) |
| 12 propagación de obligaciones futuras | SPEC-06/07: después de cada candidato preservar prerrequisitos, capacidad, llegada/salida, comidas y demás obligaciones necesarias | `checkMacroPendingPrerequisites`, `probeOperationalMealFutureFeasibility`, `maintainDeferredPrerequisiteReservation`, participant-meal probe | en el recorrido observado se ejecutan 537 checks macro de prerrequisitos, 1.144 de capacidad colectiva y 284 joint; 205 ramas son podadas. La primera unidad seleccionada llega a descendencia sólo después de estas puertas. | **PASS** |
| 13 tareas breves / flexibles | SPEC-07: atender tareas no estructurales después de las fases estructurales aplicables, con hard/Future Feasibility; no elevar `RESOURCE_TASK` a fase por tipo o duración | `ordinaryPending`, `search`, `resourceItems`, `scoreAuxiliaryTask` | las tareas sin macro quedan para `search`, pero 70 tareas individuales con recurso se elevan a la bolsa macro global. El kind no determina si en el estado actual son operaciones de menor libertad (fase 3), trabajo estructural posterior o tareas breves/flexibles (fase 6). El comportamiento queda causalmente contaminado desde etapa 8. | **INCONCLUSIVE** |
| 14 comidas / transport / boundary terminal | SPEC-07/08/10 y Addendum: comidas scoped son obligaciones; transporte explícito se materializa con contratos de grupo; boundary sólo al cierre sustantivo | `assessParticipantMealFutureFeasibility`, `assessOperationalMealFutureFeasibility`, `materializeTerminalTransport`, `materializeScheduledItinerantUnitMeals` | los probes futuros están activos durante construcción, pero Full A2 no alcanza hoja sustantiva: 0 materializaciones terminales y 0 publicación. No puede certificarse el comportamiento terminal de esta ejecución. | **NOT_ACTIVE** |
| 15 coverage / `validatePlan` / publicación | SPEC-10: validar el plan completo contra el problema completo y publicar atómicamente sólo si está completo y hard-valid; Evidence no equivale a publicación | `validatePlan`, final de `runExactItinerantPlanSearch`, runner y dispatcher | preflight/coverage inicial es válido, pero el plan final no existe: `complete=false`, 0 scheduled y 269 remaining. La puerta final correctamente no publica, aunque la validación positiva de un plan completo no fue alcanzada. | **NOT_ACTIVE** |

## Transición exacta core → post-core

### Core y arquitectura

- La hoja core contiene las 19 tareas main y sus 19 feeders/dependencias directas, más las operaciones ancladas que el constructor agrega atómicamente. La arquitectura observada tiene **dos runs, de 8 y 11 posiciones**; se llegó a profundidad 19 y una hoja pasó la validación reducida y el frontier post-core.
- El resultado global no conserva el fingerprint de la hoja provisional: ambos campos oficiales quedan `null` al agotar el presupuesto antes de seleccionar una solución completa. Por tanto, el **core fingerprint capturado es `UNAVAILABLE_AFTER_GLOBAL_BUDGET_EXHAUSTION`**. Inventar un hash a partir del frontier profundo sería mezclar core y standalone. El hecho contractual capturado es la hoja única y su arquitectura, no un fingerprint reconstruido con conocimiento visual.
- Este hueco no cambia cuál es la primera desviación: el callback entrega esa misma hoja a `searchStandaloneForCoreCandidate`, que construye la bolsa y registra la primera decisión antes de probar su primer placement.

### Inventario contemporáneo y primera selección

| kind | unidades | tareas afectadas | identidad / contratos presentes | dominio inicial |
|---|---:|---:|---|---|
| `ITINERANT_UNIT` | 3 | 9 | `itinerantUnitId`, miembros, recursos explícitos, espacios/ventanas/dependencias por operación; sin contrato de contigüidad entre operaciones standalone | 54/66/79, cotas conservadoras |
| `RESOURCE_TASK` | 70 | 70 | identidad de tarea, participante, espacio, recursos, dependencias y ventanas; sin identidad/semántica de fase | 63–107, exactos según tarea |
| `JOINT` | 2 | 4 | `jointGroupId`, miembros, participantes, mismo start, espacio y recursos | 99 y 104, exactos |
| `ROUND_SYNCHRONIZATION` | 1 | 19 | policy id, lanes, starts sincronizados mientras todas activas y preparación entre rondas | 684, cota conservadora |
| `SETUP_GROUP` | 1 | 17 | espacio `secondaryContinuity=REQUIRED`, familias, orden flexible/permitido, reentrada prohibida y preparación | 144 geometrías / 191 matchings, cota conservadora |
| `TECHNICAL_CHAIN` | 1 | 3 | policy id, orden, adyacencia, transición incluida, continuidad de recurso y recursos explícitos | 98, exacto |

Total: **78 macros / 122 tareas**. El selector toma `itinerant:itinerant-team:5003` (5 operaciones, duración total 120, disponibilidad hard 720, señal 54 inexacta). La razón registrada es `mixed-domain-semantic-policy`: el comparador enfrenta el ganador exacto y el inexacto mediante presión semántica global. Dentro de la unidad, la primera operación es `task:10169`, elegida por MRV dinámico (54 starts). Esas identidades son Evidence dinámica, no reglas ni pseudoconfiguración A2.

## Identidad, geometría y elegibilidad dinámica por kind

La SPEC-07 no autoriza convertir el `kind` en una fase. Identidad de unidad, geometría contractual y elegibilidad/criticidad dinámica son tres decisiones distintas: `itinerantUnitId`, joint, round, setup y technical-chain identifican estructura y, cuando corresponde, su geometría; ninguna de esas identidades implica por sí sola una fase. En particular, equipo itinerante es sólo un factor de dificultad, no `ITINERANT_UNIT ⇒ fase 3`, y una cadena técnica no implica `TECHNICAL_CHAIN ⇒ fase 4`.

La fase 3 reúne las operaciones con **menor libertad según la situación del día**. Esa dificultad se recalcula en cada estado: carga y capacidad restante, posiciones válidas, ventanas/deadlines, duración, dependencias y dependientes, escasez y uso compartido de recursos, itinerancia/transiciones, sincronización y riesgo de Future Feasibility. No existe una categoría permanente de “recurso crítico”. La fase 6 corresponde a tareas breves/flexibles e incluye el “recurso breve”; `requiredResourceIds` tampoco basta para incluir una tarea en ella.

La exposición general de orden de la SPEC y sus encabezados de fase no numeran de forma uniforme todas las agrupaciones intermedias. Esta auditoría conserva los encabezados vigentes —incluidas fase 3 y fase 6— y no resuelve esa diferencia creando una fase adicional.

| kind | identidad y geometría demostradas | señales hard disponibles | señales de Future Feasibility disponibles | señales de calidad (no elegibilidad hard) | ¿puede decidirse soundly fase/elegibilidad hoy? |
|---|---|---|---|---|---|
| `ITINERANT_UNIT` | `itinerantUnitId`, miembros y agenda coordinada; cada operación `STANDALONE` mantiene starts individuales, sin contigüidad de bloque implícita | ventanas, disponibilidad y recursos explícitos por operación, dominios válidos, duración, dependencias y transiciones | ledger compartido, dominios restantes, reservas de prerrequisitos, capacidad colectiva y probes de comidas | orden canónico y preferencias de starts existentes | **Sí, dinámicamente**, combinando presión actual, escasez compartida, transiciones y riesgo futuro; **no** por identidad itinerante ni como fase fija. |
| `RESOURCE_TASK` | tarea atómica con un start; el recurso requerido es ocupación hard, no una categoría constructiva | participante, espacio, recursos, ventana/deadline, duración, dependencias y dominio exacto actual | capacidad colectiva, prerrequisitos pendientes, comidas, consumo del ledger y dominios residuales | ranking de starts y score auxiliar sólo después de preservar viabilidad | **Sí para comparar libertad/criticidad dinámica y para construir la tarea atómica** con autoridades actuales. La Evidence no demuestra que falte semántica de dominio; sí demuestra que el nivel de fase aún no está implementado. “Breve/flexible” sólo puede afirmarse si la regla vigente puede derivarlo de duración y flexibilidad actuales sin umbrales inventados; de lo contrario esa definición normativa concreta, no un campo de fase permanente, es la información ausente. |
| `JOINT` | `jointGroupId`, miembros y start común con placement conjunto | intersección de ventanas, participantes, espacio, recursos, duración y starts comunes exactos | matching conjunto, dominios residuales, capacidad y dependencias/dependientes | desempates canónicos entre geometrías factibles | **Sí, dinámicamente**; sincronización y reducción de starts son factores, pero joint no asigna fase automáticamente. |
| `ROUND_SYNCHRONIZATION` | policy, lanes, rondas sincronizadas mientras están activas y preparación entre rondas | ventanas, recursos, starts de ronda y restricciones de sincronización | matching de lanes, capacidad residual y efecto de las rondas sobre obligaciones pendientes | orden canónico de geometrías factibles | **Sí, dinámicamente**; la cota conservadora debe combinarse con validación exacta/Future Feasibility, no convertirse en fase por kind. |
| `SETUP_GROUP` | familias, orden permitido/flexible, no reentrada, preparación y continuidad espacial; geometrías completas con matching | ventana, espacio, recursos, preparación, orden y dominios de miembros | matching residual, capacidad y dominios que cada geometría deja al resto | preferencia entre geometrías igualmente viables | **Sí, dinámicamente**; su estructura decide cómo construir, no cuándo su fase es elegible. |
| `TECHNICAL_CHAIN` | policy, orden, adyacencia, transición incluida y continuidad de recurso | intersección de ventanas, recursos, duración total y 98 placements exactos observados | dependencias, capacidad/ledger residual y dominios que deja cada placement | orden canónico de placements | **Sí, dinámicamente**; continuidad puede reducir libertad, pero no demuestra `fase 4`. |

Las señales hard descartan placements inválidos; Future Feasibility evita consolidar una opción hard-válida que destruya obligaciones necesarias; las señales de calidad sólo ordenan alternativas que sobreviven a ambas capas. Mezclarlas en un score global o usar calidad para fabricar elegibilidad de fase violaría la precedencia normativa.

### ¿Puede construirse el nivel 1 sin una fase permanente por tarea?

**Sí.** Las autoridades ya presentes permiten calcular en cada estado el scope actualmente elegible: estructura explícita, número de posiciones válidas, carga pendiente, capacidad temporal compatible, ventanas/deadlines, duración, dependencias/dependientes, escasez y uso compartido de recursos, itinerancia/transiciones, sincronización y riesgo de Future Feasibility. El cálculo debe reevaluarse tras cada placement porque la fase 3 depende de la situación del día, no de una taxonomía estable.

La ausencia observada es de **implementación**: `searchMacroUnits` entrega todos los kinds contemporáneos a `selectMostConstrainedUnit(constrained)` sin una determinación previa de fase/scope. No se ha demostrado una ausencia semántica general del dominio ni la necesidad de `postCoreConstructiveRole`. Tampoco se justifica proyectar un `phase` permanente por EngineInput/preflight/adapter/fingerprint.

La única incertidumbre semántica concreta es el criterio normativo exacto que separa “breve/flexible” de otras tareas cuando las magnitudes actuales no basten por sí mismas. Eso no autoriza umbrales de duración inventados ni exige una etiqueta permanente: A3-024 debe reutilizar una autoridad configurada existente si la hay y, si al implementarlo se demuestra que no existe, documentar precisamente esa regla ausente antes de proponer el contrato mínimo que la represente.

## Auditoría de geometría por kind

| kind | unidad estructural demostrada | geometría contractual | límite normativo |
|---|---|---|---|
| `SETUP_GROUP` | familias/política/espacio | geometrías compactas completas y matching, con preparación | no deriva fase |
| `ROUND_SYNCHRONIZATION` | policy y lanes | starts de ronda, sincronización, preparación y matching | no deriva fase |
| `TECHNICAL_CHAIN` | cadena ordenada | adyacencia, continuidad y transición contractuales | no deriva fase 4 |
| `JOINT` | `jointGroupId` | start común y placement conjunto | no exige bloque adicional ni deriva fase |
| `ITINERANT_UNIT` | identidad/composición y agenda | operaciones `STANDALONE` individuales dentro de la agenda | no inventar contigüidad ni fase 3 |
| `RESOURCE_TASK` | tarea atómica | start individual | recurso requerido no deriva fase 3 ni fase 6 |

## A3-024 mínimo (sin hardcode A2)

No hace falta cerrar primero un contrato de clasificación permanente. El delta mínimo es separar la elegibilidad dinámica del scope de la selección crítica dentro de ese scope, conservando los exploradores actuales:

```text
searchPostCore(remainingUnits, state):
  phaseScope = determineCurrentlyEligiblePhaseScope(
    remainingUnits,
    explicitStructure,
    validPositions,
    pendingLoad,
    compatibleTemporalCapacity,
    windowsAndDeadlines,
    duration,
    dependenciesAndDependents,
    scarceAndSharedResources,
    itinerancyAndTransitions,
    synchronization,
    futureFeasibilityRisk,
  )

  scopedUnits = remainingUnits.filter(unit => phaseScope.includes(unit))
  unit = selectMostConstrainedUnit(scopedUnits)
  geometries = constructContractualGeometry(unit, state)
  for geometry in geometries:
    for assignment in exactInternalMatchingOrMRV(unit, geometry, state):
      if hardAndFutureFeasible(assignment, remainingUnits):
        recurseOrBacktrack(...)
```

`determineCurrentlyEligiblePhaseScope` aplica el orden y los encabezados vigentes de la SPEC, recalcula la libertad sobre el estado actual y se abstiene de inferir por kind, nombre, ID, horario humano o thresholds inventados. La geometría continúa viniendo del contrato: agenda no contigua para itinerant standalone, start atómico para `RESOURCE_TASK`, start común para joint y los exploradores actuales para setup/round/chain.

A3-024 debe probar al menos: (1) candidatos contemporáneos de scopes distintos no compiten en el MRV global; (2) cambiar la libertad dinámica puede cambiar el scope elegible cuando lo ordena la SPEC; (3) dentro del scope elegido, `selectMostConstrainedUnit` sí reacciona a los dominios; (4) hard y Future Feasibility preceden a calidad; y (5) ninguna identidad estructural ni `requiredResourceIds` asigna automáticamente fase. No debe cambiar presence/boundary ni añadir scoring, umbrales o datos A2.

## Resultado causal obligatorio

`FIRST_CLEAR_DEVIATION_STAGE`: `8 — selección post-core de fase`.

`FIRST_CLEAR_DEVIATION_SYMBOL`: `searchMacroUnits` → `selectMostConstrainedUnit(constrained)` en `engine/planner-next/exactItinerantPlan.ts`, con comparador en `engine/planner-next/macroScheduling.ts`.

`FIRST_CLEAR_DEVIATION_BEHAVIOR`: tras cerrar main+feeder, construye una sola bolsa contemporánea de 78 unidades de seis kinds y aplica constrainedness/MRV semántico global; elige `ITINERANT_UNIT 5003` antes de que exista elección de fase.

`OFFICIAL_EXPECTED_BEHAVIOR`: `fase elegible → unidad crítica dentro de esa fase → geometría contractual de la unidad → MRV/matching interno`, siempre bajo hard constraints y Future Feasibility.

`WHY_EARLIER_STAGES_PASS`: preflight/adapter son lossless para las autoridades hard utilizadas; dispatcher elige explícitamente el exact constructor; protegidas/locks se fijan; el constructor observa el corpus global; arquitectura de dos runs, asignación main, feeders/transiciones y frontier Future Feasibility ocurren en ese orden y alcanzan una hoja core hard-valid. No se identificó antes de la llamada post-core una conducta observable contraria a Fuente.

`DOWNSTREAM_EFFECTS`: fase y unidad quedan colapsadas en una sola decisión; señales exactas e inexactas de clases distintas compiten; una unidad de fase posterior puede consumir capacidad de otra anterior; geometría y matching local pueden ser correctos pero aplicarse al scope equivocado; tareas individuales con recurso no pueden ordenarse metodológicamente; el agotamiento a profundidad 129 no demuestra cuál sería el primer blocker bajo el método oficial.

`PHASE_CONTRACT_COVERAGE`: ningún kind demuestra por sí solo una fase. Las autoridades actuales permiten evaluar dinámicamente libertad, elegibilidad y criticidad, mientras cada kind conserva únicamente su identidad y geometría contractual. No existe fase 7.

`MISSING_DOMAIN_AUTHORITY`: ninguna ausencia semántica general demostrada. Sólo queda por verificar, al implementar fase 6, si la autoridad vigente define de forma computable “breve/flexible”; si no, la ausencia concreta sería esa regla normativa, no un rol o phase field permanente.

`MINIMUM_PRODUCTIVE_DELTA`: `remaining units` → determinar dinámicamente fase/scope actualmente elegible → elegir con `selectMostConstrainedUnit` la unidad más crítica dentro de ese scope → construir geometría contractual → MRV/matching interno → propagar Future Feasibility → recurse/backtrack; sin hardcode A2, scoring nuevo, thresholds, cambios presence/boundary ni contigüidad ficticia.
