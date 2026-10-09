# A2 — auditoría causal de S1 y calidad frente al humano

Estado posterior: [CAM1 corregida, completitud automática bloqueada](A2-CAM1-CORRECTION.md). Los 266/266 de esta auditoría son históricos bajo el fixture sin CAM1; no certifican el canon vigente.

Auditoría diagnóstica del PR #1104 sobre `4f473cbc9dcaad5a3af35dae8dcd1ecefc913aa6`, comparada con `8d28c10dd9f541c1370e50a6d23588d12e43caea`. Base intacta: `5e46168daa35d755bcb9a2573ed81647d8b466a2`. Fecha: 2026-10-09. Sólo Evidence; sin cambio productivo ni merge.

**Resultado:** siete ejecuciones completas mantienen **266/266, S10**, ledger S1 **80.835 = 11.394 core + 69.441 continuación**, protección, contadores y material idénticos. La subida histórica de tiempo **no queda atribuida causalmente al delta**: los controles frescos también invierten la comparación. El hotspot probado está en los predicados de placement usados por cierre colectivo/transporte. Existe un Hall necesario barato para una geometría futura concreta; no hay prueba de ahorro agregado que autorice todavía su implementación.

**Calidad:** el S10 aceptado tiene dos bloques Main frente a cuatro humanos, pero makespan +25 min y permanencia media +83,947 min. La comparación de calidad está `BLOCKED_BY_CONFIGURATION` en el comparador compartido. El contraste con CAM1 de Fuente 06 revela además un fallo no compensable heredado en ambos timings: con esa autoridad aplicada serían `INVALID`. No se afirma `PARETO_BETTER`, `PARITY`, `TRADEOFF` ni `WORSE` oficial.

Evidence machine-readable, histogramas, snapshots de prueba, identidades, KPIs y límites: [JSON](A2-S1-CAUSAL-QUALITY-AUDIT.json).

## Autoridades y estado recibido

Se recibieron las Fuentes 00 v2.10, 01 v5.2, 02 v2.2, 03 v3.6, 04 v2.5, 05 v2.6, 06 v2.7, 07 v2.2 y ambos PDFs oficiales. Sus hashes están en el JSON. Se aplican 07 §4.4/§10.1, 05 A2-ASSIST-9/Parte II, 06 §7.5 y correcciones vigentes. Los adjuntos son autoridad documental, no autorización para implementar fuera de esta unidad.

Todos los runs usan Node 24.19.0, dependencias compartidas, builder canónico con budget 100.000 y plan 711, S0 vacío y la misma frontera de persistencia en memoria de los servicios reales `request → run → apply → validate → accept`. El adapter separa 247 tareas productivas y 19 Sodexo. No se incorporan horas humanas al input. IN conserva target/max=3 y gap mínimo=30; C01 acaba disponibilidad 15:30, C02–C19 19:00; día 09:00–21:00; cierre Estilismo.after/OUT.before=0. Los Stages/protecciones y comidas mantienen su contrato.

## Call path material de S1

```text
selector SPACE Main → resolveAssistedScope → buildAssistedProblem
→ proyección core colectiva + canon analítico read-only
→ executeAssistedPlanning → executePlannerNext → runExactItinerantPlanSearch
→ arquitectura nominal / matching / runExactMainAndFeederSearch
→ onHardValidCoreLeaf (29 candidatos; 0 repairs de supporting en A2)
→ llegada + reservas futuras → searchJoint (29)
→ visitChain / PreparedFutureTechnicalChainAuthority
→ necessary / PreparedFutureCollectiveParticipantClosure
→ searchExactPrerequisiteClosure → searchExactItinerantAgenda
→ visitAgenda → searchStandaloneForCoreCandidate (1)
→ Plató 15 + rondas + comidas + cierre/transporte + validatePlan
→ primer certificado conjunto completo → ScopeProposal visible
→ Draft → validate → Stage → siguientes scopes hasta S10
```

El core nominal conserva `maximumDepth=0`; no significa ausencia de búsqueda. Se visitan arquitecturas/matchings y una continuación conjunta, no un DFS core residual en este run. Los 28 primeros candidatos consumen 50.378 ramas STANDALONE y son rechazados condicionalmente; el 29 consume 19.063 y se acepta. Los witnesses analíticos no pasan al scope visible ni reciben protección por certificarlo.

## Runs, determinismo y overhead

| Run | S1 s | Resultado | Tipo |
|---|---:|---|---|
| current-off | 268.555 | 266/266 S10 PASS | sin instrumentación |
| 8d-off | 170.615 | 266/266 S10 PASS | sin instrumentación |
| current-on | 275.316 | 266/266 S10 PASS | timers + V8 |
| 8d-on | 216.970 | 266/266 S10 PASS | timers + V8 |
| current-trace | 173.116 | 266/266 S10 PASS | traza de decisiones ligera |
| current-sampled | 176.913 | 266/266 S10 PASS | V8 sin wrappers |
| 8d-sampled | 186.555 | 266/266 S10 PASS | V8 sin wrappers |

Histórico aportado: 8d 174,897/170,776 s; actual 214,692/209,865 s. Control fresco sin instrumentación: 170,615/268,555 s; control equivalente con muestreo V8 sin wrappers: **186,555/176,913 s** (8d/actual). No se demuestra una regresión temporal estable ni causalidad del nuevo guard. Las funciones comunes concentran el coste y sus llamadas son idénticas. `onHardValidCoreLeaf` exclusivo instrumentado: 13,342 ms en 8d frente a 15,939 ms actual, diferencia de 2,597 ms, insuficiente para explicar decenas de segundos.

Se usaron hooks temporales tras tsx: timers sync `try/finally`, observación de returns, ledger y captura del S10 real. `timed` y `trace` son dos modos del observador temporal, separados del `causalDiagnostic` productivo, que sigue vigente en ambos. Se verifican en los diez Stages status, **orden observado** (SHA de 62.255 decisiones en S1), certificado, fingerprint, todo `iterations[].work` y ledger autoritativo. No se afirma observar cada decisión interna no instrumentada.

El timer suma exactamente 275,222 s exclusivos en S1. Las muestras atribuyen **31,595 s** a instrumentación en ese run (26,941 s self directo de sus funciones), frente a 24,591 s en 8d. Timed−trace actual =102,191 s; cambios de code shape/JIT y variabilidad impiden llamar a esa diferencia overhead exacto. No se traslada el tiempo instrumentado al budget productivo. Los runs son secuenciales; no hay aislamiento de frecuencia/carga del host. Los controles sin wrappers conservan S1<300 s.

Material SHA: `ae079844467d20d6adf59b55367d41fe0b5c4e5a2d07323d6a7d3d95d325afcc`. Snapshot aceptado final: `7195f0eba23dcd42fc442a5e8ae9377d85fe53e74df7129244d4df19a5632415`. Los siete runs tienen idéntico material y contadores, cero HARD/REQUIRED nuevos bajo la configuración representada y ningún placement protegido movido.

## Hotspots S1

Muestras V8 de los controles sin wrappers, ponderadas por `timeDeltas`; son estimaciones de atribución, no nanosegundos exactos de CPU. Ventana S1 desde la primera muestra de `executeAssistedPlanning` por `durationMs`, con incertidumbre de pocos ms de orquestación. Exclusivo asigna una muestra a una fase; acumulado incluye fases hijas y no se suma entre filas.

| Fase | 8d exclusivo s | Actual exclusivo s | Actual acumulado s |
|---|---:|---:|---:|
| `collective_closure` | 76.015 | 73.016 | 74.503 |
| `transport` | 52.466 | 50.729 | 50.729 |
| `future_technical_chain` | 17.652 | 14.324 | 14.409 |
| `operational_meals` | 8.128 | 7.922 | 7.922 |
| `core_architecture_matching` | 8.228 | 7.647 | 68.915 |
| `preferred_resource_unit` | 7.031 | 6.756 | 27.020 |
| `round_synchronization` | 6.838 | 6.634 | 17.284 |
| `runtime_or_other` | 4.671 | 4.830 | 0.000 |
| `core_search` | 2.335 | 1.957 | 172.057 |
| `participant_meals` | 1.901 | 1.801 | 8.071 |
| `itinerant_agenda` | 1.140 | 1.138 | 38.615 |
| `technical_chain` | 0.081 | 0.085 | 0.085 |
| `ordinary_standalone` | 0.067 | 0.067 | 29.624 |
| `prerequisite_closure` | 0.003 | 0.004 | 38.619 |

Por función, las tres mayores atribuciones self sin wrappers son `taskRespectsScheduledDependencies` **41,109 s**, `diagnoseTaskPlacement` **34,550 s** y `canPlaceTask` **26,676 s**. El chequeo de dependencias construye un Map de placements por consulta. Esto identifica trabajo concreto existente; no demuestra que el guard nuevo lo haya aumentado.

Contadores y distribuciones provienen del observador completo; los tiempos incluyen su efecto y sirven para atribución/distribución, no para presentar latencia productiva. “Acumulado” usa outermost para evitar sumar recursión doble. Percentiles indicados son límites superiores del histograma, no cuantiles exactos.

| Función | Llamadas | Exclusivo s | Acumulado s | Máximo ms | P50 ≤ ms | P95 ≤ ms |
|---|---:|---:|---:|---:|---:|---:|
| `placement/diagnoseTaskPlacement` | 16,872,579 | 165.335 | 165.335 | 120.360 | 0.01 | 0.03 |
| `futureCollectiveParticipantClosure/PreparedFutureCollectiveParticipantClosure/evaluateContext` | 54,208 | 20.281 | 116.366 | 2212.354 | 0.3 | 10 |
| `placement/exactTaskDynamicStartDomain` | 1,849,745 | 18.560 | 18.560 | 69.076 | 0.003 | 0.03 |
| `placement/canPlaceTask` | 16,872,383 | 15.581 | 180.804 | 120.371 | 0.01 | 0.03 |
| `preparedOperationalMealAuthority/PreparedOperationalMealAuthority/assess` | 48,072 | 11.483 | 11.483 | 64.744 | 0.3 | 1 |
| `participantFutureFeasibility/probeParticipantFutureReservations` | 6,399 | 10.933 | 15.304 | 341.589 | 3 | 10 |
| `transportGrouping/assessCoreArrivalTransportFeasibility` | 1,177 | 9.710 | 84.109 | 762.828 | 100 | 300 |
| `technicalChainFutureFeasibility/PreparedFutureTechnicalChainAuthority/valid` | 391,052 | 7.166 | 23.667 | 65.276 | 0.1 | 0.1 |
| `exactPreferredResourceUnit/exploreExactPreferredResourceUnit` | 1 | 3.127 | 40.224 | 40224.111 | 100000 | 100000 |
| `placement/exactTaskStaticStartDomain` | 540,217 | 2.397 | 2.397 | 8.112 | 0.003 | 0.01 |
| `placement/exactTaskStartDomain` | 477,048 | 1.470 | 14.810 | 69.090 | 0.03 | 0.1 |
| `anonymousPipelineWitness/buildPipelineWitness` | 136 | 1.380 | 86.118 | 2419.719 | 1000 | 3000 |

`searchJoint`: 29 llamadas, 153,834 s acumulados instrumentados; `visitChain`: 2.214, 153,725 s outermost; `searchExactPrerequisiteClosure`: 723, 57,442 s acumulados pero sólo ~16 ms de fase propia; `searchExactItinerantAgenda`: 723, 57,426 s; `searchStandaloneForCoreCandidate`: una llamada, 43,889 s. La exploración de cadenas “technical” es estructura operativa con concursantes: no se reintroducen las tres tareas ficticias de cabecera.

## Ledger y waterfall de continuación

| Consumidor | Ramas | % ledger S1 | % continuación |
|---|---:|---:|---:|
| `CORE:core_architecture_matching` | 2,778 | 3.437 | — |
| `STANDALONE:transport` | 1,117 | 1.382 | 1.609 |
| `CORE:future_technical_chain` | 2,808 | 3.474 | — |
| `CORE:core_search` | 5,808 | 7.185 | — |
| `STANDALONE:collective_closure` | 2,366 | 2.927 | 3.407 |
| `STANDALONE:itinerant_agenda` | 47,980 | 59.355 | 69.095 |
| `STANDALONE:ordinary_standalone` | 1 | 0.001 | 0.001 |
| `STANDALONE:preferred_resource_unit` | 13,069 | 16.168 | 18.820 |
| `STANDALONE:round_synchronization` | 4,388 | 5.428 | 6.319 |
| `STANDALONE:participant_meals` | 520 | 0.643 | 0.749 |

Los consumidores anidados explican por qué el standalone tiene una sola rama directa, pero ocupa decenas de segundos: delega ledger a unidad de recursos, rondas, comidas y transporte. La continuación representa 85,905 % del ledger. La agenda itinerante consume 69,095 % de ella, pero sólo ~1,138 s de fase exclusiva en el control sin wrappers; sus llamadas incluyen validación/cierre downstream.

Profundidad local de agenda: 12.297 ramas a 0, 24.629 a 1 y 11.053 a 2, más una rama restante. Contextos de 94 tareas concentran 13.069 ramas de Plató 15 y 4.388 de rondas; contexto de 90 tareas, 2.185 ramas de cierre. No se confunde profundidad local de agenda, tamaño de contexto y profundidad core. El JSON conserva el waterfall completo por hoja.

Primer certificado suficiente completo: rama **80,377** (99.433% del ledger final), contexto de 228 tareas; tiempo 273,632 s instrumentado / 171,871 s con traza ligera. Quedan 458 ramas hasta finalizar S1. Fingerprint `7733a62b5c4082b48480ec44815845ba2d41437321ebf35d342e391193699dd2`. Este certificado efímero se usa para el perfil; los KPIs usan exclusivamente el S10 aceptado.

Cierre colectivo: 54.208 evaluaciones, 4.070 estados distintos, **50.138 hits de la caché existente** (92,492%). Hay 1.490 estados Hall únicos y 2.674 returns Hall, incluidos 1.184 hits. No se añade caché. Las equivalencias usan hash de autoridades completas/contexto/mode/comidas/participantes; no sólo IDs. El JSON incluye la huella íntegra de fuente y ejemplos con 145 visitas/144 hits. Esto no autoriza deduplicar contextos con otra configuración o protección.

## Rechazo probado y contrafactual necesario

Hojas 1, 5 y 9 usan distintas arquitecturas/matchings y descansos Main (13:55, 14:10, 14:20). Sus primeros Hall aparecen tras 3.110, 5.114 y 4.383 ramas desde la entrada de hoja. La hoja 5 usa 6.316 ramas de continuación y 6,704 s instrumentados; la 9, 5.276 y 4,671 s. No son certificados de inviabilidad de toda arquitectura.

Se retiran del contexto las 38 ocupaciones provisionales IN/Estilismo entrada, manteniendo sus obligaciones pendientes en el canon. Se retienen 44 placements estructurales sólo como decisiones del candidato. **El core relajado da PASS necesario** en esas hojas. Los prefijos cronológicos con 0–7 miembros adicionales de la cadena también pasan; el primer Hall de ese replay aparece con los ocho miembros, incluida la pareja conjunta. Por tanto, adelantar el rechazo al Main, a la raíz o a supporting nominales no está demostrado.

Causa concreta: elegir esa permutación impone Alfombra conjunta C06/C10 **18:25–18:35**. Cada Totales post termina como pronto 18:45 y cada cierre Estilismo necesita comenzar a las 18:50, seguido de OUT completo antes de 19:00. Ambos cierres compiten por el único slot Estilismo 18:50–18:55: **Hall 2 tareas / 1 slot**. La autoridad actual lo certifica después de construir los dominios colectivos. La primera decisión que entraña el fallo es esa pareja `raíz + permutación` con sus endpoints, no el Main ni la raíz sola.

Usando `evaluateIndividualContinuation` existente sobre sólo los participantes afectados y la relajación optimista, 25/28 primeros Hall de hojas rechazadas se reproducen; tres devuelven PASS y deben seguir al chequeo actual. Caso repetido 50 veces: **2,455 ms** de media, frente a **38,133 ms** del contexto completo repetido 20 veces, ahorro local 93,562 %. Los porcentajes son coste local observado, no ahorro de S1.

Controles: reordenar la entrada del predicate conserva Hall; adelantar diez minutos la pareja dentro de la fase flexible da PASS necesario; la pareja del S10 válido da PASS; retener literalmente los 38 IN/entradas del planning válido como protegidos también da PASS. Ninguno de esos PASS certifica un futuro completo. La hoja 29 contiene un prefijo fallido para C01 y después acaba ACCEPT: demuestra por qué un Hall condicional no se convierte en nogood de Main/arquitectura. No se usa ABSTAIN o una sola permutación como rechazo de su padre.

El punto computacional más barato probado usa endpoints ya determinados por la elección exacta de candidato y sólo los dos dominios terminales necesarios. **No se ha demostrado todavía ahorro neto global ni el ledger de un wiring temprano.** Invocarlo indiscriminadamente en los 391.052 checks de cadenas podría empeorar el coste. No se recomienda implementar aún la poda.

## S10 real frente al humano

Se captura `dailyTasks` completo justo antes de devolver la Evidence del mismo full A2 y se recalcula su fingerprint igual al Stage 10 aceptado. Se conservan 266 identidades, 19 Sodexo, asignaciones efectivas (18 filas con unidad itinerante), una preparación de setup de 10 min y 17 de ronda de 5 min. No se sustituye el S10 por un witness inicial ni por el histórico de 209 obligaciones. Los ocho witnesses finales de comida operacional se identifican por separado: el snapshot persiste el descanso Main; los otros son certificación analítica final, no ocupaciones aceptadas adicionales.

La referencia humana actual también tiene 266 obligaciones, no 269; fingerprint `98ae25c0965e7e8c25929ef76bd9f83f774fbdea159c6c44130997e4421ad3b6`. Se conservan las correcciones expresas de Fuente 06 y los horarios primarios. Ambos pasan el mismo `evaluatePlanningQuality` para las métricas disponibles; pausas Main autorizadas: humano 14:00–15:15, OptiPlan 14:50–16:05.

| KPI/señal | Humano | OptiPlan | Delta Opti−humano | Ganador descriptivo / validez | Oportunidad |
|---|---:|---:|---:|---|---|
| P01 gaps/minutos no autorizados | 0 / 0 | 0 / 0 | 0 / 0 | Igual; continuidad comparable | Conservar continuidad |
| P01 Main inicio→fin | 11:15–17:15 | 12:20–18:20 | +65 / +65 min | Descriptivo; ambos 285 min productivos +75 pausa | Examinar coste operativo de arquitectura de 2 bloques |
| P02 makespan | 575 min | 600 min | +25 min | Humano descriptivo; homologación HARD pendiente | Cierre global antes |
| P02 fin global | 18:35 | 19:00 | +25 min | Humano descriptivo | Cierres terminales |
| P03 media / mediana | 399,211 / 385 | 483,158 / 495 | +83,947 / +110 | Humano descriptivo | Reducir permanencia sin retrasar IN por preferencia no autorizada |
| P03 P90 / máximo | 515 / 545 | 570 / 575 | +55 / +30 | Humano descriptivo | C02/C10/C13 de mayor permanencia |
| P03 total | 7.585 | 9.180 | +1.595 min | Humano descriptivo | Evitar comprar menos bloques con más horas-persona |
| P07 bloques Main | 4 (2/coach) | 2 (1/coach) | −2 | OptiPlan descriptivo; no victoria agregada | Contrastar otras arquitecturas factibles contra presencia/makespan |
| P07 familias / cambios / reentradas | 2 / 1 / 0 | 2 / 1 / 0 | 0 / 0 / 0 | Igual | Mantener setups y preparación real |
| P07 preparaciones / minutos | 18 / 95 | 18 / 95 | 0 / 0 | Igual | Ningún ahorro eliminando ocupaciones |
| P09 anchors / parejas / cadena | 3 / 2 / 1 | 3 / 2 / 1 | 0 | Completo/sincronizado en ambas realizaciones efectivas | Corregir después la integración del evaluador, no esta unidad |
| P09 rondas emparejadas / residual | 9 / 1 | 9 / 1 | 0 | Igual; rondas simultáneas | Conservar coordinación |
| P04/P05/P06/P08/P10 oficiales | Bloqueados | Bloqueados | — | No comparar ni declarar clasificación parcial | Completar contrato de datos y configuración del evaluador |

P09 crudo devuelve una violación OptiPlan: `sequenceAfterJointGroupId` exige igualdad exacta entre fin de Alfombra e inicio de Totales post. El S10 tiene Alfombra 18:15–18:25 y Totales post 18:30–18:35, con margen efectivo válido de 5 min. Fuente 06 exige simultaneidad de ambos miembros de cada pareja; no introduce adyacencia entre esas dos operaciones independientes. El validator vigente devuelve cero violaciones de joint. Se reporta la discrepancia del evaluador sin modificarlo ni usar su flag extra como HARD/ganador.

**Detalle de permanencia (minutos):**

| Participante | Humano | OptiPlan | Delta |
|---|---:|---:|---:|
| C01 | 385 | 270 | -115 |
| C02 | 385 | 575 | +190 |
| C03 | 325 | 535 | +210 |
| C04 | 510 | 545 | +35 |
| C05 | 355 | 495 | +140 |
| C06 | 545 | 480 | -65 |
| C07 | 300 | 480 | +180 |
| C08 | 265 | 495 | +230 |
| C09 | 435 | 450 | +15 |
| C10 | 515 | 570 | +55 |
| C11 | 495 | 425 | -70 |
| C12 | 380 | 515 | +135 |
| C13 | 465 | 570 | +105 |
| C14 | 405 | 515 | +110 |
| C15 | 380 | 485 | +105 |
| C16 | 440 | 510 | +70 |
| C17 | 350 | 395 | +45 |
| C18 | 350 | 405 | +55 |
| C19 | 300 | 465 | +165 |

Tres personas mejoran (C01 −115, C06 −65, C11 −70 min); las otras 16 empeoran. Peores permanencias OptiPlan: C02 575, C10/C13 570, C04 545, C03 535. Espera bruta inactiva: humano 4.195 min, OptiPlan 5.790, media +83,947. Se obtiene con unión de obligaciones, incluyendo Sodexo como actividad propia; no distingue espera inevitable/evitable y **no es P04 oficial**.

**Final por espacio canónico (sin inferir zonas ausentes):**

| Espacio | Humano | OptiPlan | Delta min |
|---|---:|---:|---:|
| `alfombra-roja` | 18:20 | 18:35 | +15 |
| `caracola-jose-maria` | 15:45 | 13:50 | -115 |
| `caracola-lucia` | 14:45 | 11:50 | -175 |
| `estudio-7` | 17:15 | 18:20 | +65 |
| `p14-giratuto` | 15:15 | 14:10 | -65 |
| `p14-pasillo` | 13:35 | 14:20 | +45 |
| `p14-recursos` | 16:20 | 16:25 | +5 |
| `p15-croma` | 13:20 | 14:05 | +45 |
| `p15-estrellas-sillon` | 15:05 | 16:55 | +110 |
| `participant-meal` | 16:15 | 16:30 | +15 |
| `reality-buggy` | 17:30 | 17:45 | +15 |
| `reality-control` | 17:00 | 17:15 | +15 |
| `reality-corner-music` | 14:00 | 11:55 | -125 |
| `reality-hall-p14` | 16:30 | 16:45 | +15 |
| `reality-influencer` | 12:30 | 13:25 | +55 |
| `reality-manzano` | 11:45 | 11:15 | -30 |
| `reality-plato` | 13:30 | 15:05 | +95 |
| `styling` | 18:25 | 18:55 | +30 |
| `totales-1` | 17:15 | 18:30 | +75 |
| `totales-coreo` | 16:40 | 17:55 | +75 |
| `totales-post` | 18:15 | 18:35 | +20 |
| `transport-in` | 12:35 | 12:05 | -30 |
| `transport-out` | 18:35 | 19:00 | +25 |

**Recursos críticos representados (obligaciones productivas; sin comidas/preparaciones; no P05):**

| Recurso | Humano inicio→fin / span | OptiPlan inicio→fin / span | Delta span |
|---|---|---|---:|
| `coach-lucia` | 09:45–16:15 / 390 | 09:50–14:20 / 270 | -120 |
| `coach-jose-maria` | 09:55–17:15 / 440 | 11:05–18:20 / 435 | -5 |
| `cam-2` | 09:30–15:05 / 335 | 10:55–16:55 / 360 | +25 |
| `eva` | 16:00–18:00 / 120 | 16:15–18:15 / 120 | +0 |

IN OptiPlan: siete grupos 09:00/09:30/10:00/10:30/11:00/11:30/12:00, tamaños 3/3/3/3/3/3/1. OUT: 15:25/17:30/17:50/18:10/18:30/18:55, tamaños 1/1/1/4/6/6. La referencia IN tiene cinco personas a las 10:00 frente a máximo 3; sus OUT incluyen gaps 15/15/15/5 frente al mínimo efectivo 20. Los horarios no se corrigen silenciosamente para homologarlos.

El JSON conserva gaps por participante/espacio, union de ocupación, spans de recursos representados y raw gaps de dependencias. No se llama “gap no autorizado” a todo hueco de espacio ni se atribuye capacidad por nombres. Robustez: no se simulan retrasos ni se declara P10 con raw gaps; falta umbral efectivo y resolución completa de transiciones. Las primeras/últimas horas y utilización descriptiva no certifican evitabilidad ni libertad de rescheduling.

## Gates de comparabilidad y defecto heredado de proyección

Fuente 06 v2.7 confirma Estilismo capacidad 1: la advertencia `STYLING_CAPACITY_UNSPECIFIED_BY_MASTER` de `humanReference.ts` queda superada por autoridad expresa, no se edita. Hay cinco pares de Estilismo salida humano solapados 5 min, y C01 Redes/C11 Corner solapados 11:55–12:00 en P14 Recursos. Estos seis conflictos bastan para FAIL humano. No se homologa una referencia moviendo horas.

**Hallazgo adicional de autoridad:** 06 §7.5 asigna CAM1 a Recursos y Pasillo. El manifest/builder vigente no incluye CAM1 entre sus recursos ni demandas de esos espacios. Ambos HEADs tienen este mismo vacío y sus timings finales tienen **16 solapes cruzados / 80 min** al aplicar dicha autoridad. Ejemplo OptiPlan: C01 Redes/C12 Pasillo 13:05–13:10. Ejemplo humano: C02 Redes/C01 Pasillo 12:00–12:05. No es una regresión de esta unidad, pero impide equiparar “0 HARD del fixture” con “0 HARD de toda Fuente 06”. Con CAM1 efectiva, el gate no compensable falla y la clasificación sería `INVALID`; no puede compensarse con KPIs.

El comparador compartido bajo la configuración representada devuelve `BLOCKED_BY_CONFIGURATION` por `reference_hard_gates:fail` y `tolerance_policy`. P04 requiere clasificación de espera evitable; P05 asignaciones/relevancia/espera de recurso en su contrato; P06 capacidades/policies/ocupaciones autorizadas; P08 jerarquía de zonas/contratos; P10 umbral/slack efectivo. Parte de esos datos existe en el adapter pero no está integrada en la interfaz del evaluador. CAM1 sí está ausente del fixture efectivo. Ninguna Fuente aporta aquí la superficie exacta versionada P01–P10 con tolerancias por señal: no se inventan tolerancias ni se acepta un subconjunto de KPIs como oficial.

A2-ASSIST-9 **no puede afirmar superioridad ni parity**. Readiness del comparador: BLOCKED; contraste de autoridad CAM1: FAIL no compensable. Los descriptivos permanecen válidos como comparación de timings, con estas limitaciones explícitas.

## Única hipótesis X/Y/Z/W/M y siguiente delta

**X:** el cierre colectivo completo certifica repetidamente un Hall terminal tardío de una geometría futura ya elegida.

**Y:** `searchJoint → visitChain/visitAgenda → evaluateContext` construye los 19 dominios y sus ancestros/OUT antes de descubrir un Hall de dos participantes; sus endpoints ya están determinados por la raíz/permutación candidata.

**Z:** dominio/placement/dependencias concentran el coste de S1; el caso demostrado tarda 38,133 ms frente a 2,455 ms para su condición necesaria optimista. Esta causa no explica por sí sola la subida histórica, que no se reproduce estable.

**W candidato:** reutilizar `evaluateIndividualContinuation` para un Hall NECESSARY de los cierres afectados, únicamente sobre ese candidato exacto, con IN/entradas no aceptados relajados y protección literal. PASS/ABSTAIN continúan; fallo no elimina Main, raíz o permutaciones alternativas. No añadir otro explorador ni caché.

**M esperado, aún sin demostrar:** replay agregado debe mostrar ahorro neto de S1 superior al ruido del control (objetivo experimental ≥10%), con 266/266 S10/material/certificado/protección intactos, sin nuevos HARD/REQUIRED y todo accounting explícito ≤100.000. No hay resultado implementado ni ahorro global atribuido.

**Siguiente delta mínimo: sólo diagnóstico** de ese predicate sobre los 4.070 contextos distintos, incluyendo válidos/hits, para medir coste añadido en PASS, trabajo realmente evitado y wiring/charges. No se propone implementar la poda todavía: faltan beneficio agregado y accounting temprano. No se extiende a reparación ASST-010, canon, budgets ni una segunda hipótesis.

## Validación, CI y frontera de esta entrega

| Check | Resultado |
|---|---|
| A2 completos / material / protección | 7/7 PASS; máximo 80.835 por solicitud; 0 nuevos HARD/REQUIRED representados; 0 placements movidos |
| Neutralidad observador | Los diez Stages con mismo orden observado, certificado, todo work y fingerprint; probe instrumentado 4/4 |
| Tests focales de referencia/calidad/comparador/repair/cierre | 51/51 PASS |
| Transporte en actual y 8d | 19 PASS + los mismos 2 FAIL en cada HEAD |
| `npm run check`, `npm run build` | PASS |
| Secuencia de migraciones + su test | PASS; 73 históricas, 071–087; test 1/1 |
| CI head productivo 4f473 | `baseline-ci` success, [run](https://github.com/angelvicen92/production-planner/actions/runs/37946002944) |

Fallos de transporte heredados, reproducidos frescos en ambos HEADs: `exact continuation constructs IN, work, ESTILISMO_SALIDA, then dependent OUT immutably and order-invariantly` y `terminal IN materialization finds the backward-propagated witness`. No se modifican expectations ni se reportan como regresiones nuevas.

La instrumentación y scripts temporales se retiran del checkout al terminar; se conserva sólo Evidence. Blob productivo `exactItinerantPlan.ts`: `c699e8c12ab1ef72b72b61d83afcd67cae01886c`. No cambia el código productivo respecto de 4f473; no se cambian canon, budgets, timeouts, benchmark, DB/migraciones, UI/API ni publicación.

**ASST-010 sigue abierto** en la ruta de config refresh/excepción/rollback/redo/divergencia de la Evidence anterior. Esta unidad explica S1/calidad y no pretende cerrar ese gate. PR #1104 continúa draft, base igual; sin merge. El HEAD documental nuevo y su CI se verifican al publicar, separados del head productivo auditado.
