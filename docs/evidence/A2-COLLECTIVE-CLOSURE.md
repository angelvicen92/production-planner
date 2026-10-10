# A2 — continuación conjunta de cierre

Calificación posterior del fixture: [CAM1 corregida en #1104; replay automático bloqueado](A2-CAM1-CORRECTION.md). La completitud histórica siguiente omitía la exclusividad de Fuente 06 §7.5 y no certifica el A2 oficial vigente.

**ASSISTED_COMPLETION: 266/266 en S10**, por el flujo real request/run/apply/accept. Dos ejecuciones limpias son equivalentes en placements, recursos, unidades, comidas, preparaciones, certificados y accounting. Cada petición comparte un ledger de 100.000 ramas. No hay nuevas violaciones HARD/REQUIRED, decisiones protegidas modificadas, seed histórico, merge ni otro PR.

PR [#1103](https://github.com/angelvicen92/production-planner/pull/1103), base #1085 (`c00bb3d`), continuación del head revisado `ffc35446ac2d4685dfbace367cf637945eb2a8f4`. La Evidence vigente está en [A2-COLLECTIVE-CLOSURE-COMPLETION.json](A2-COLLECTIVE-CLOSURE-COMPLETION.json). Los JSON anteriores `CONTRACT` y `SUFFICIENCY` conservan el diagnóstico histórico 0/266; `A2-COLLECTIVE-CLOSURE.json` conserva 38 y `A2-ASSIST-8-assisted-completion.json` conserva 209. No se han sobrescrito ni utilizado como seed.

## X — causa demostrada

El head revisado exigía 209 ancestros y carecía de productores conjuntos para 104: P14/P15 (94) y cadena/peer/Post (10). Son dependencias directas; no se elimina ninguna. La pareja pipeline–cadena–A/B de la unidad anterior tampoco certificaba el residual. El rechazo de un matching conjunto hacía que P15 abandonase su geometría sin demostrar una arista individualmente imposible.

La regresión a/b duración 10, recurso exclusivo, ventana 0–20 y setup 20–30 demuestra el defecto: el primer matching a10/b0 se rechaza; a0/b10 debe conservarse y se acepta. P15 reutiliza ahora las particiones disjuntas de rondas. Una prohibición individual sólo procede de una prueba individual; una prueba conjunta excluye su conjunción, y el agotamiento sigue siendo incertidumbre.

Al componer el contexto completo, el replay ordinario rechazaba IN simultáneos y la transición interna Reality–Main `INCLUDED`. Se corrige mediante las autoridades existentes de paquetes IN, operaciones anchored y grupos joint. Las contrapruebas rechazan tamaño/gap de IN incorrectos, ruptura de adyacencia, desincronización y conflictos externos. No se relaja el placement ordinario ni el validador.

## Y — alcance exacto del certificado

El bundle sólo se acepta después de producir un contexto compatible de las **247 tareas y 19 comidas**: core/IN/entrada/anchors, cadena técnica, Reality A/B, rondas y sus 17 preparaciones, P15 con setup, P14, Post, cierre Estilismo y OUT. También se validan pausas operacionales y restricciones de recursos/unidades. `validatePlan` exige HARD/REQUIRED para la realización completa.

La autoridad de cierre mantiene todos los ancestros, cotas canónicas, capacidad colectiva, comidas y continuación OUT. `NECESSARY_ONLY/PASS` sirve para conservar candidatos; jamás acepta un Stage. Hall bajo dominios optimistas permite una poda local sound; `ABSTAIN`, falta de productor y budget exhaustion no prueban imposibilidad global. La suficiencia procede de la composición completa y su validación, no de certificados individuales independientes.

`JOINT_COMPLETION` permanece efímero. La proyección devuelve sólo tareas/preparaciones/comidas autorizadas para el scope actual; el producto conserva el filtro visible existente. Antes del Stage siguiente se revalidan canon, identidad, recursos/unidades, disponibilidad, preparaciones y decisiones aceptadas. Si falla el replay se reconstruye dentro del mismo ledger; no se reutiliza un certificado obsoleto. S5 y S7 reconstruyen contexto futuro conservando todo lo aceptado.

La guardia de productor exige que tareas y comidas estén incluidas, protegidas o explícitamente elegibles como futuro. No permite replantear estados inmutables por incorporar un problema fuente completo.

## Z — avance funcional real

| Stage | Nuevas obligaciones | Acumuladas | Ramas core + continuación | Tiempo de las dos ejecuciones |
|---|---:|---:|---:|---:|
| S1 | 19 | 19 | 11.394 + 69.441 = 80.835 | 189,67 / 184,63 s |
| S2 | 19 | 38 | 0 + 293 | 0,17 / 0,16 s |
| S3 | 8 | 46 | 0 + 293 | 0,13 / 0,12 s |
| S4 | 19 | 65 | 0 + 293 | 0,19 / 0,10 s |
| S5 | 10 | 75 | 0 + 13.241 | 19,39 / 19,62 s |
| S6 | 36 | 111 | 0 + 293 | 0,12 / 0,12 s |
| S7 | 58 | 169 | 0 + 1.884 | 7,27 / 7,03 s |
| S8 | 38 | 207 | 0 + 293 | 0,14 / 0,16 s |
| S9 | 2 | 209 | 0 + 293 | 0,17 / 0,16 s |
| S10 | 57 | 266 | 0 + 293 | 0,17 / 0,15 s |

S10 añade 38 tareas y 19 comidas. En todas las peticiones `core + continuación = total <= 100.000`; arquitectura, matching, contextos futuros, residual, comidas, transporte y replay comparten ese ledger. No se añaden resets, subpresupuestos, timeouts ni búsqueda combinatoria gratuita. El prep nominal anticipado sin ledger se evita en este camino; el replay exacto cobra sus vértices.

Se conservan jornada 09:00–21:00, C01 hasta 15:30, C02–C19 hasta 19:00, margen default 5/MAX/cero explícito, salida.after0/OUT.before0, Estilismo capacidad 1 e IN target3/max3/gap30. No cambia el canon ni el orden de scopes.

La selección inicial llega a la arquitectura 29 antes de aceptar S1. Puede diferir de las decisiones históricas; dentro de cada ejecución se verifica igualdad exacta de tareas, recursos, unidades, comidas y preparaciones ya aceptados. La fuente vigente queda completada sin duplicados y `dailyTasks` coincide con el último Stage aceptado.

## W — implementación mínima

- `exactMainAndFeederCore.ts`, `exactRoundSynchronization.ts`, `exactPreferredResourceUnit.ts`: partición compartida y conservación de alternativas conjuntas; pruebas necesarias por arista sin certificados positivos.
- `assistedPlanning.ts`, `contracts.ts`, `anonymousPipelineWitness.ts`: proyección del canon y witness completo efímero, con elegibilidad explícita.
- `exactItinerantPlan.ts`: composición de continuations existentes, podas necesarias en fronteras, comidas antes del relleno ordinario, certificado completo y proyección/replay entre Stages. Se conserva la selección de unidades REQUIRED anterior al relleno; no se añade un scheduler ni DFS global nuevo.
- `futureCollectiveParticipantClosure.ts`, `jointCompletionWitness.ts`: replay de autoridades canónicas, incertidumbre y validación conjunta.
- Tests focales correspondientes y `runA2CollectiveClosureEvidence.ts`: regresiones, soundness, neutralidad/determinismo y emisor compacto. El inventario/prototipos anteriores permanecen disponibles.

No cambia DB, schema, UI, API, ORC, V3/V4, budgets ni expectativas de producto. El catálogo identifica la capacidad de esta rama pendiente de merge y mantiene su snapshot histórico.

## M — validación y límites

Código productivo validado: `3a3645209ce5b4f0c50db1dce40330c83b4f8a2c`. **278 tests focales/regresiones PASS**, TypeScript, build y secuencia de migraciones PASS; gates de producto: 9 PASS / 3 FAIL heredados, incluido A2-ASSIST-8 PASS. Dos ejecuciones completas limpias PASS; material determinista `ae079844467d20d6adf59b55367d41fe0b5c4e5a2d07323d6a7d3d95d325afcc`, fingerprint final `7195f0eba23dcd42fc442a5e8ae9377d85fe53e74df7129244d4df19a5632415`. Los tests focales y checks del candidato se registran en el JSON vigente.

**Latencia pendiente:** S1 cumple el techo bloqueante de cinco minutos pero supera el objetivo interactivo de dos. El resto queda por debajo de veinte segundos. La completitud funcional conseguida no declara rendimiento interactivo cumplido ni suficiencia para cualquier otra configuración.

Los gates heredados se mantienen visibles y sin rebajar expectativas: A2-ASSIST-1 exige una propuesta con budget 6.000; aislamiento rechaza el benchmark histórico `runA2Assist8ManualEvidence.spec.ts`; ASST-010 no alcanza su propuesta inicial antes de probar rollback/divergencia. Su clasificación y el resultado del gate A2-ASSIST-8 se registran en Evidence. No se declara CI global verde ni imposibilidad global.

Reproducción compacta: ejecutar dos veces `runA2Assist8Evidence({reportIterationDurations:true})`, guardar las observaciones fuera del producto y emitir con `node --import tsx server/benchmarks/runA2CollectiveClosureEvidence.ts --completion-observations --first <run1.json> --second <run2.json>`. El emisor compara el material completo, exige 266/266, certificados, protección, límites de ledger y ausencia de nuevas infracciones; nunca carga observaciones como hints del solver.
