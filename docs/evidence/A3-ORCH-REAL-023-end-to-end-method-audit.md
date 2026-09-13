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
| 0 EngineInput / preflight / adapter | SPEC-10: adaptar sin pérdida, fallar cerrado ante dimensiones no representables, preservar identidad/ventanas/recursos/dependencias; SPEC-08: disponibilidad e identidad itinerante explícitas; ninguna inferencia por nombre | `preflightEngineInputForPlannerNext`, `adaptEngineInputToPlannerNextProblem`, `effectiveTaskFixedInterval`; `integration/engineInputPreflight.ts`, `integration/engineInputAdapter.ts`, `contracts.ts` | 269 obligaciones; preflight y adapter `SUPPORTED`, cero issues; fingerprint del problema `d4f16fde…f0bfa`; tres unidades itinerantes, joints, round, technical chain, setup, meals y transport llegan tipados. El input fuente no usa horas del planning humano. La ausencia de semántica de fase en `PlannerNextProblem` no altera todavía el input hard, pero será una carencia al llegar al selector. | **PASS** |
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
| 13 tareas breves / flexibles | SPEC-07: atender tareas no estructurales después de las fases estructurales aplicables, con hard/Future Feasibility; no elevar `RESOURCE_TASK` a fase por tipo o duración | `ordinaryPending`, `search`, `resourceItems`, `scoreAuxiliaryTask` | las tareas sin macro quedan para `search`, pero 70 tareas individuales con recurso se elevan a la bolsa macro global. No existe contrato que permita distinguir cuáles pertenecen a fase 3, 4, 6 o 7. El comportamiento queda causalmente contaminado desde etapa 8. | **INCONCLUSIVE** |
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

## Clasificación contractual de fase

La clasificación usa exclusivamente contratos que llegan al selector. No usa nombre, ID, planning humano, hora, umbral inventado ni la equivalencia prohibida `RESOURCE_TASK ⇒ fase 3`.

| macro | clasificación | fundamento contractual o información ausente |
|---|---|---|
| 3 `ITINERANT_UNIT` | `PHASE_3_SCARCE_RESOURCE_TEAM_WINDOW` | composición explícita de recursos, disponibilidad de unidad y agenda coordinada; no se infiere contigüidad. |
| 1 `TECHNICAL_CHAIN` | `PHASE_4_LONG_OR_CONTINUOUS_SECONDARY` | adyacencia y continuidad de recurso explícitas forman una cadena secundaria continua. |
| 1 `SETUP_GROUP` | `PHASE_5_SETUP_OR_STRUCTURED_BLOCK` | política de familias, no reentrada, preparación y continuidad espacial explícitas. |
| 1 `ROUND_SYNCHRONIZATION` | `PHASE_6_OTHER_STRUCTURED` | policy/lane/synchronization explícitas; no es setup ni cadena continua. |
| 2 `JOINT` | `PHASE_6_OTHER_STRUCTURED` | identidad de operación conjunta y start común explícitos; no hay contrato que la eleve a fases 3–5. |
| 70 `RESOURCE_TASK` | `UNRESOLVED` | `requiredResourceIds` demuestra ocupación hard, no escasez/equipo/ventana crítica, longitud/continuidad, setup, estructura ni brevedad/flexibilidad. Falta una clasificación de rol operativo o pertenencia de fase proveniente de configuración/dominio. Duración y número de starts no autorizan resolverla. |

No hay macros clasificables como `PHASE_7_BRIEF_FLEXIBLE` con certeza: “breve/flexible” no está representado como semántica contractual. Tampoco existe en el código una autoridad previa alternativa: la única llamada al selector post-core recibe directamente `remainingUnits.map(macroConstrainedness)` con todas las clases.

### ¿Hay información suficiente para `phase → unit → geometry → internal assignment`?

**No para todo el corpus.** Planner Next conserva ya las identidades estructurales necesarias para itinerant, joint, round, technical chain y setup, y sus exploradores pueden construir la geometría correspondiente. Sin embargo, antes del selector pierde/no recibe una semántica genérica que distinga entre las fases operativas de las tareas individuales con recurso y que declare cuándo una tarea es realmente `BRIEF_FLEXIBLE`. Por ello puede implementar los dos niveles sólo para el subconjunto estructural inequívoco; no puede clasificar las 70 `RESOURCE_TASK` sin inventar scoring o asumir que recurso implica fase 3.

El contrato mínimo faltante debe originarse en la configuración efectiva/plantilla de tarea que construye `EngineInput`, no en `selectMostConstrainedUnit`: una propiedad tipada y versionada de **rol constructivo post-core** (por ejemplo, pertenencia a una categoría genérica de fase, con `OTHER_STRUCTURED`/`BRIEF_FLEXIBLE` sólo cuando la Fuente de dominio lo declare). Preflight debe validar presencia/coherencia cuando sea necesaria, el adapter debe preservarla en `Task`, el fingerprint debe incluirla y el selector debe consumirla. Las identidades estructurales existentes siguen siendo autoridad más específica; el campo no crea contigüidad ni convierte recursos en equipos.

## Auditoría de geometría por kind

| kind | A) unidad estructural real | B) geometría de conjunto | C) sólo starts individuales | veredicto |
|---|---|---|---|---|
| `SETUP_GROUP` | sí: familias/política/espacio | sí: geometrías compactas completas y matching, con preparación | no | estructura y geometría reales |
| `ROUND_SYNCHRONIZATION` | sí: policy y lanes | sí: starts de ronda, sincronización, preparación y matching | no | estructura y geometría reales |
| `TECHNICAL_CHAIN` | sí: cadena ordenada | sí: adyacencia, continuidad y transición contractual | no | estructura y geometría reales |
| `JOINT` | sí: `jointGroupId` | sí, limitada a su contrato: start común y placement conjunto | no | unidad conjunta real; no exige bloque adicional |
| `ITINERANT_UNIT` | sí: identidad/composición y agenda | **no como bloque contiguo**, correctamente: cada operación `STANDALONE` conserva su propia geometría | sí, pero dentro de una agenda/unidad seleccionada | no inventar contigüidad |
| `RESOURCE_TASK` | no más allá de la tarea | no | sí | unidad atómica individual |

## A3-024 mínimo (sin hardcode A2)

La primera desviación es el selector global, pero el delta productivo mínimo necesita primero cerrar el contrato `UNRESOLVED`; de otro modo un phase gate sólo movería arbitrariedad. Pseudocódigo:

```text
// Origen: configuración efectiva / plantilla, no nombres, IDs, duración ni score.
preflight(input):
  validar postCoreConstructiveRole cuando una tarea no tenga una identidad
  estructural que determine inequívocamente su categoría; fallar cerrado si falta.

adapter(input):
  Task.postCoreConstructiveRole = canonical(input.role)
  incluir role en problem fingerprint y Evidence.

buildUnits(pending):
  preservar precedencias de identidad existentes:
    joint > technical-chain > round > setup > itinerant > atomic task
  unit.phase = phaseFromExplicitStructuralContractOrTaskRole(unit)
  // nunca: nombre, ID, duración threshold, resource=>phase3, score threshold

searchPostCore(remaining, state):
  eligiblePhases = phasesInOfficialOrder
    .filter(phase => hasPendingUnit(phase))
    .filter(phase => phaseNecessaryConditionsRemainFeasible(state))
  phase = firstEligibleOfficialPhase(eligiblePhases)
  units = remaining.filter(unit => unit.phase == phase)
  unit = selectMostConstrainedUnit(units)       // MRV sólo dentro de fase
  geometries = constructContractualGeometry(unit, state)
  for geometry in geometries:
    for assignment in exactInternalMatchingOrMRV(unit, geometry, state):
      if hardAndFutureFeasible(assignment, remaining): recurse(...)
```

Para `ITINERANT_UNIT`, `constructContractualGeometry` devuelve una agenda de operaciones independientes y el MRV interno actual; no fabrica un bloque contiguo. Para `RESOURCE_TASK`, devuelve su geometría atómica. A3-024 debe incluir una prueba donde dos fases tengan candidatos contemporáneos y demuestre que cambiar domain sizes entre fases no cambia la fase, mientras MRV sí cambia la unidad **dentro** de la fase; también debe probar abstención/fallo cerrado cuando falta el rol requerido.

## Resultado causal obligatorio

`FIRST_CLEAR_DEVIATION_STAGE`: `8 — selección post-core de fase`.

`FIRST_CLEAR_DEVIATION_SYMBOL`: `searchMacroUnits` → `selectMostConstrainedUnit(constrained)` en `engine/planner-next/exactItinerantPlan.ts`, con comparador en `engine/planner-next/macroScheduling.ts`.

`FIRST_CLEAR_DEVIATION_BEHAVIOR`: tras cerrar main+feeder, construye una sola bolsa contemporánea de 78 unidades de seis kinds y aplica constrainedness/MRV semántico global; elige `ITINERANT_UNIT 5003` antes de que exista elección de fase.

`OFFICIAL_EXPECTED_BEHAVIOR`: `fase elegible → unidad crítica dentro de esa fase → geometría contractual de la unidad → MRV/matching interno`, siempre bajo hard constraints y Future Feasibility.

`WHY_EARLIER_STAGES_PASS`: preflight/adapter son lossless para las autoridades hard utilizadas; dispatcher elige explícitamente el exact constructor; protegidas/locks se fijan; el constructor observa el corpus global; arquitectura de dos runs, asignación main, feeders/transiciones y frontier Future Feasibility ocurren en ese orden y alcanzan una hoja core hard-valid. No se identificó antes de la llamada post-core una conducta observable contraria a Fuente.

`DOWNSTREAM_EFFECTS`: fase y unidad quedan colapsadas en una sola decisión; señales exactas e inexactas de clases distintas compiten; una unidad de fase posterior puede consumir capacidad de otra anterior; geometría y matching local pueden ser correctos pero aplicarse al scope equivocado; tareas individuales con recurso no pueden ordenarse metodológicamente; el agotamiento a profundidad 129 no demuestra cuál sería el primer blocker bajo el método oficial.

`PHASE_CONTRACT_COVERAGE`: inequívoca para itinerant→3, technical-chain→4, setup→5, round/joint→6; 70 `RESOURCE_TASK` y toda afirmación de fase 7 quedan `UNRESOLVED`. No se usaron nombres, IDs, horas humanas, umbrales ni scoring inventado.

`MISSING_DOMAIN_AUTHORITY`: rol constructivo post-core explícito, tipado, versionado y con procedencia para tareas atómicas no clasificables por una identidad estructural existente; debe nacer en configuración efectiva/plantilla, viajar por EngineInput/preflight/adapter/Task/fingerprint y llegar intacto al selector.

`MINIMUM_PRODUCTIVE_DELTA`: primero añadir/proyectar ese contrato genérico con fail-closed; después separar el selector en `selectEligiblePhase` y `selectMostConstrainedUnit(unitsOfPhase)`, reutilizando exploradores y Future Feasibility actuales, sin hardcode A2, sin scoring nuevo y sin imponer contigüidad a operaciones itinerantes standalone.
