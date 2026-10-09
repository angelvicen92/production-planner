# ASST-010 — geometría reparable de Estilismo

**ASST-010: INCONCLUSIVE, S2 sin propuesta ni certificado global. A2-ASSIST-8: PASS, 266/266, S10, dos runs limpios con material completo y accounting idénticos al baseline.** No se alcanzan AcceptedException, rollback, redo ni divergencia canónicos. El PR sigue draft; gate de producción/merge incompleto.

Auditoría posterior, sólo diagnóstica sobre `4f473cbc`: [S1 y calidad frente al humano](A2-S1-CAUSAL-QUALITY-AUDIT.md). Siete full A2 preservan material y accounting; la subida histórica de tiempo no se reproduce estable. La comparación oficial queda bloqueada y el contraste con CAM1 de Fuente 06 revela una brecha heredada del fixture. Esta Evidence no cambia el veredicto ASST-010 ni implementa otra poda.

Mismo [PR #1104](https://github.com/angelvicen92/production-planner/pull/1104), rama `codex/asst-010-explicit-scope-continuation`. Esta unidad parte del HEAD remoto/local verificado `8d28c10dd9f541c1370e50a6d23588d12e43caea`; base remota `5e46168daa35d755bcb9a2573ed81647d8b466a2`. Los deltas anteriores de proyección efímera y matching por grafo se conservan. Su historia y el fallo completo de 8d permanecen en el JSON; `stylingGeometryAudit` identifica esta unidad y sus dos ciclos.

## X — fallo y recorrido de producto

El gate original acepta el single-Main `TASK_IDS:[10017]`, valida/consolida S1 y aplica el refresh de **ESTILISMO_ENTRADA de 10 a 20 minutos en 19 instancias**. Prueba vocal mantiene 15. Las assertions de stages y snapshot S1 inmutables pasan antes de entrar en S2. S2 solicita `TASK_IDS:[10015]`; su input vigente conserva `task:10017` literalmente en `[845,860]` y la pausa Main `[890,965]`. El canon contiene 247 tareas y 19 comidas.

En 8d, S2 termina en 300.000 ramas, `BRANCH_BUDGET_EXHAUSTED`: 299.636 core + 364 continuación, sin llegar a la continuación conjunta. Sus 60 geometrías nominales mantienen entradas contiguas que dejan dominio vacío para la salida C01. No hay prueba de inviabilidad global.

## Y — primera decisión causal incorrecta

`selector → scope projection/eligibility → collectiveCoreProjection → executePlannerNext → anonymousPipelineWitness/matching → onHardValidCoreLeaf → reservas → searchJoint → cierre/validatePlan → ScopeProposal`.

La construcción nominal prioriza entradas tempranas y contiguas. La frontera core → continuación trata sus IN/entradas provisionales como contexto inmutable. Así convierte una preferencia de construcción en una restricción de representación: puede rechazar sound la geometría nominal y aun perder otra geometría legal. La propuesta visible y las protecciones siguen derivando del scope original, nunca del witness futuro.

Antes de editar se demuestra que **el productor existente sí puede construir una solución completa cuando se liberan esas obligaciones**. Se reutiliza en una copia read-only el mismo explorador privado, exportándolo sólo en scratch, y la autoridad existente de llegada; ninguna instrucción de scheduling cambia. No se incorpora otra arquitectura.

## Z — contraprueba exacta y sus límites

Cuatro participantes, 28 tareas, Main continuo, recurso Estilismo exclusivo compartido por entrada/salida en espacios diferentes, IN/entrada/Vocal/Main/trabajo/salida/OUT. El participante a termina disponibilidad en 75. Main-a `[45,60]` y trabajo-a `[60,65]` permanecen protegidos.

Entradas nominales b `[5,25]`, a `[25,45]`, c `[45,65]`, d `[65,85]` bloquean salida-a `[65,70]`. El plan contiguo falla `RESOURCE_OVERLAP_VIOLATION` y su dominio exacto de salida está vacío. Desplazar **sólo entrada-d a `[70,90]`** permite salida-a y OUT-a `[70,75]`; las 28 tareas pasan HARD/REQUIRED y conservan decisiones protegidas.

| Prueba | Resultado | Ledger |
|---|---|---:|
| Motor público 8d, bundle nominal fijo | INFEASIBLE, refutado por el witness válido reducido | 410 |
| Explorador existente, contexto contiguo | DEAD_END | 1 |
| Explorador existente, IN/entradas provisionales liberados | FOUND, 28 tareas válidas | 27 |
| Mismas entradas aceptadas como contexto literal | DEAD_END | 1 |
| Certificado completo del witness intercalado | PASS | 1 |
| Motor público final, nominal primero y reparación | COMPLETE, certificado global reducido | 52 = 23 core + 29 continuación |

Los cuatro tests nuevos comprueban determinismo/input inmutable, neutralidad diagnóstica on/off, geometría real del witness V2, protección de Main/trabajo/entrada/IN aceptados, recomposición de IN provisional, ledger exacto, agotamiento sin certificado y un control negativo sin capacidad recuperable. **Esta contraprueba no certifica las 266 obligaciones actualizadas.**

## W — delta mínimo y dos ciclos causales

`exactItinerantPlan.ts` conserva el intento nominal primero. Sólo activa el fallback si la reserva da `FUTURE_PARTICIPANT_TASK_ZERO_DOMAIN`, la tarea comparte espacio/recurso con entradas no aceptadas, y quitar esas entradas devuelve un dominio positivo mediante `exactTaskStartDomain`.

El fallback retira únicamente IN/entradas provisionales identificados por relaciones existentes; preserva Main/Vocal, anchors y todos los placements protegidos. Recompone llegadas mediante `assessCoreArrivalTransportFeasibility`, cobra el ledger compartido y reutiliza la continuación conjunta existente: cadenas técnicas, prerequisites, agendas, standalone, comidas, transporte terminal y cierre. Sólo una solución completa validada permite aceptar; los witnesses y fingerprints describen la geometría realmente seleccionada. Un intento finito fallido retiene incertidumbre y no certifica un nogood de Main ni inviabilidad global.

No se añade scheduler, DFS, matching, poda, seed humano, IDs de A2, presupuesto ni timeout. Código productivo de esta unidad: `exactItinerantPlan.ts`, blob `c699e8c12ab1ef72b72b61d83afcd67cae01886c`; test `supportingGeometryRepair.spec.ts`.

**Ciclo 1 descartado:** el retry inicial se activaba tras cualquier rechazo nominal. En S1 sin refresh entró a reparar sin demostrar capacidad recuperable: a los 334.066,927 ms aún seguía con 32.051 ramas y cero llamadas standalone. Se interrumpió para diagnóstico; no se agotó budget ni se produjo resultado completo. El run S2 aislado también se interrumpió, a los 1.650.000 ms. Se comparó esta regresión antes de restringir el trigger; la versión amplia no se retiene.

**Ciclo 2 final:** S1 se acepta y el refresh pasa. S2 recupera el dominio C01 y entra en `searchJoint`. Se observan dos arquitecturas/matchings y dos reparaciones, sin éxito completo. Se detiene la expansión después de este ciclo.

| ASST S2 | Baseline 8d completo | Candidato al parar |
|---|---:|---:|
| Ledger | 300.000 = 299.636 + 364 | 37.599 = 2.998 + 34.601 |
| Reparación de supporting | 0 | 2, 0 aceptadas |
| Continuación conjunta alcanzada | No | Sí, cadenas/prerequisites/agendas |
| Llamadas al standalone ordinario | 0 | 0 |
| Checks de cierre / ramas cobradas por cierre | — | 16.348 / 16.348 |
| Residual matching alcanzado | Sí | No |
| Propuesta S2 / certificado global | No / No | No / No |
| Stop | Budget agotado | Interrupción diagnóstica manual |

El menor ledger del candidato es **parcial**, no una reducción del trabajo hasta solución/fallo. Se interrumpe tras observar **al menos 378.937 s dentro de S2**; el wrapper original acaba abortado tras 732.917,455 ms, exit 1. No hay resultado final del solver ni assertion completa del producto. El inspector registra y reanuda sin cambiar orden/config/expectativas; esta medición no permite atribuir rendimiento causal. No se eleva ningún timeout ni se cambia el benchmark.

## M — autoridad posterior y clasificación de la prueba

Read-only, el cierre necesario del primer core nominal da Hall para C01; tras retirar entradas y recomponer IN pasa, conservando dominio salida `[790,925]`. El segundo core reparado también pasa el cierre necesario, dominio `[805,925]`. Ambos PASS son **necessary-only**, sin certificación.

La última captura está en agenda 1 con 75 tareas de contexto. Para p209: IN `[660,665]`, entrada pendiente de 20, trabajo `10124` `[540,570]`; entrada exigiría inicio >=665 y <=520. Para p210: IN `[690,695]`, entrada pendiente de 20, trabajo `10139` `[560,590]`; inicio >=695 y <=540. Los dominios exactos de ambas entradas quedan vacíos. El cierre propaga estas dependencias y reproduce Hall de las salidas `10118/10133`, matching 17/19. **Rechazar esos contextos es correcto**; no prueba que todos los horarios de trabajos/IN fallen. El dominio directo de una salida, sin propagar sus predecesores pendientes, no sustituye esta autoridad.

La primera reparación termina REJECT después de 634 ramas. Su traza registra una reserva ABSTAIN con dependencia `10015` alcanzable; **esa abstención no causa rechazo** y la lista de dependencias inalcanzables es vacía. No se capturó el contexto exacto de su primer rechazo conjunto. El campo nuevo se llama `lastAuthorityObservation` para distinguir la observación de una prueba de rechazo; este ajuste de diagnóstico no cambia búsqueda ni cuenta como otro ciclo causal.

Por tanto: intercalación reducida válida, explorada y certificada; intercalación canónica completa aún no construida; contextos de agenda concretos rechazados correctamente; continuación global no certificada; inviabilidad global no demostrada; budget del candidato no agotado. No se alcanzó el productor ordinario de las entradas pendientes antes de parar. No se fuerza PROPOSAL ni se persigue otra poda/capa de matching.

## Regresión A2 y validaciones

Dos llamadas independientes a `runA2Assist8Evidence({reportIterationDurations:true})` desde snapshots vacíos. Comparación de material **completo** contra ambos runs y baseline 8d: scopes, placements, comidas, recursos, unidades, preparaciones, witnesses/certificados y todos los contadores `work` iguales. Sin seed de certificados anteriores.

Digest material `ae079844467d20d6adf59b55367d41fe0b5c4e5a2d07323d6a7d3d95d325afcc`; fingerprint final `7195f0eba23dcd42fc442a5e8ae9377d85fe53e74df7129244d4df19a5632415`. 266/266, S10; cero nuevas HARD/REQUIRED y cero placements aceptados movidos. Máximo ledger 80.835 por petición, igual a core + continuación y menor que 100.000.

| Stage | Ledger core + continuación | Baseline 8d, ms (dos runs) | Candidato, ms (dos runs) |
|---|---:|---:|---:|
| S1 | 11,394 + 69,441 | 174897 / 170776 | 214692 / 209865 |
| S2 | 0 + 293 | 193 / 117 | 209 / 124 |
| S3 | 0 + 293 | 110 / 103 | 129 / 117 |
| S4 | 0 + 293 | 202 / 97 | 432 / 110 |
| S5 | 0 + 13,241 | 17501 / 18020 | 23209 / 18065 |
| S6 | 0 + 293 | 111 / 106 | 133 / 132 |
| S7 | 0 + 1,884 | 6766 / 6749 | 7563 / 7023 |
| S8 | 0 + 293 | 225 / 128 | 258 / 121 |
| S9 | 0 + 293 | 209 / 194 | 239 / 118 |
| S10 | 0 + 293 | 136 / 197 | 137 / 124 |
| Cálculo total | — | 200350 / 196487 | 247001 / 235799 |

Tiempo total de los wrappers: 247.215,999 / 235.843,518 ms, frente a 200.535,874 / 196.563,581 ms de 8d.

Objetivo <=120 s: FAIL en S1. Techo <=300 s: PASS en todos los Stages A2; FAIL en S2 ASST observado. Los tiempos incluyen la llamada completa; no hay medidas independientes completas core/continuación. La igualdad de ramas/decisiones no demuestra una aceleración causal y no se declara optimización de S1.

| Gate | Resultado |
|---|---|
| Scope original autorizado; futuro invisible/no protegido | PASS focal y A2 |
| S1 aceptado y refresh preserva snapshot/stages | PASS antes de S2 |
| S2 con nueva configuración y S1 literal en input | PASS de reconstrucción; propuesta/aceptación pendientes |
| ASST-010 completo | INCONCLUSIVE, ejecución abortada para diagnóstico |
| AcceptedException/provenance, rollback, redo, divergencia canónicos | No alcanzados |
| A2 266/266, dos runs, material completo/protección/accounting | PASS |
| Tests focales | 173 PASS, incluidos 4 nuevos |
| Regresiones proporcionales | 247 PASS / 2 FAIL heredados, 0 nuevos |
| TypeScript, build, secuencia y test de migraciones | PASS |
| Producción/merge | Gate incompleto; draft |

Los dos fallos de transporte (`exact continuation constructs IN, work, ESTILISMO_SALIDA, then dependent OUT immutably and order-invariantly`; `terminal IN materialization finds the backward-propagated witness`) se reproducen también en checkout separado de 8d. Tests aislados de excepciones/lineage pasan y no sustituyen el recorrido ASST canónico.

Riesgos: S2 conserva incertidumbre y supera el techo temporal; recomponer una llegada produce una alternativa finita, no enumera todas; las agendas pueden recorrer muchos contextos antes de construir entradas pendientes. La fixture ASST sigue con sus 300.000 ramas heredadas, por encima del requisito interactivo 100.000; no se altera. Se detiene expansión tras dos ciclos. Una siguiente unidad deberá demostrar primero un candidato canónico completo compatible y reconstruir la frontera llegada/prerequisites/agenda.

Reproducción: test original `npx tsx --test server/benchmarks/runA2Assist7Evidence.spec.ts`; tests focales de `supportingGeometryRepair.spec.ts`; dos runs A2 y comparación mediante `collectiveClosureDeterministicMaterial`, además de `iterations[].work`. Estos resultados y autoridades están en `stylingGeometryAudit` del [JSON](ASST-010-explicit-scope-core.json). Archivos de esta unidad: motor, nuevo spec y estos dos archivos Evidence. Sin cambios UI/API/DB/migraciones/publicación/Autopilot, canon, budgets o expectativas. No hay merge.
