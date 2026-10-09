# ASST-010 — scope explícito y auditoría del refresh

**ASST-010: FAIL después del refresh. A2-ASSIST-8: PASS, 266/266 en S10, dos ejecuciones limpias y material completo idéntico.** AcceptedException, rollback, redo y divergencia canónicos permanecen sin alcanzar. El PR continúa draft y el gate de producción/merge falla.

Se continúa el mismo [PR #1104](https://github.com/angelvicen92/production-planner/pull/1104), rama `codex/asst-010-explicit-scope-continuation`, desde `6f0f696437f0a0644f844e1158b6b38fc4ec18ab`, árbol `f9e0ef08951f9695600f8a5c4ef24d109139f3df`. Antes de editar se verifican checkout limpio, SHA y contenido iguales al remoto; base remota intacta en `5e46168daa35d755bcb9a2573ed81647d8b466a2`. El JSON conserva los dos ciclos anteriores y añade la auditoría vigente bajo `configRefreshAudit`.

## X — entrada y fallo reproducido

El single-Main `TASK_IDS:[10017]` obtiene propuesta, pasa apply/validate/accept y conserva sólo ese Main como decisión aceptada. Su proyección tiene cuatro tareas; el productor efímero tiene 82. No hay placements protegidos ni witnesses previos al inicio. El delta anterior que habilitó esta continuación permanece intacto: blob de `assistedPlanning.ts` `7a259c18301936dbbf4368cdc07cd736f5ec206e`.

**El refresh real cambia ESTILISMO_ENTRADA, no Prueba vocal.** La plantilla `20009`, representada por `task:10018`, pasa de 10 a 20 minutos en 19 instancias. Prueba vocal conserva 15. La selección deriva de las dependencias canónicas del gate, sin modificarlo ni usar nombres en lógica productiva.

S2 solicita `TASK_IDS:[10015]` (Corner Influencer del mismo participante), consume duración 20, tiene cinco tareas proyectadas y 83 en el productor. Protege literalmente `task:10017` en `[845,860]` y la pausa Main en `[890,965]`. El refresh preserva stages y snapshot S1. La entrada canónica tiene 247 tareas + 19 comidas y 266 obligaciones elegibles pending/interrupted.

El test original `runA2Assist7Evidence.spec.ts` falla de nuevo en la propuesta de S2, tras recorrer los servicios request/run/apply/validate/accept de S1 y refresh. Resultado exacto: `BRANCH_BUDGET_EXHAUSTED`, `CORE_BRANCH_BUDGET_EXHAUSTED`, causa interna `MATCHING_SEARCH_BUDGET_EXHAUSTED`. No existe certificado de inviabilidad global.

## Y — call path, witnesses y autoridad causal

`AssistedProposalService.run` reconstruye input/config vigente y contexto protegido → `resolveAssistedScope` proyecta IDs mediante el identity map y elegibilidad → `buildAssistedProblem` cierra dependencies/anchors → `collectiveCoreProjection` incorpora Main futuros como raíces, Vocal/IN/entrada/anchors como supporting efímero → `executeAssistedPlanning` ejecuta una búsqueda con un ledger → `executePlannerNext` / `runExactItinerantPlanSearch` → arquitecturas nominales, `preparePipelineBundleGraph`, matching por bundles y `exactMainAndFeederCore` → hard gate y Future Feasibility de cadena/participante → continuación conjunta → `validatePlan` y proyección autorizada → propuesta.

S2 se detiene antes de `searchJoint`. La frontera estructural se agota y entra en `residualMatching`. La propuesta visible y las protecciones se siguen construyendo desde el scope original, nunca desde el witness futuro.

A2 recomendado comienza con `SPACE:3004`, 19 Main y 82 tareas proyectadas. Su input de solver y el productor de S1 manual son exactamente iguales al normalizar únicamente los budgets; los EngineInput sólo difieren en planId y 300.000 frente a 100.000 ramas. A2 enlaza `proposalRunId` en sus Stages y revalida witnesses; el harness ASST-010 no incluye ese enlace y aporta cero witnesses previos. Se registra esta diferencia; no se modifica persistencia, servicios ni expectativas para eludirla. Son recorridos de servicios con storage/RPC en memoria, no pruebas de UI/DB real.

La revalidación read-only de un certificado recién generado da PASS con el canon original (292 vértices cobrables) y STALE con el canon actualizado (12 comprobaciones hasta detectar el cambio). No se llama al solver con ese material. La capacidad existente revalida estrictamente o reconstruye; no ofrece reparación parcial de `JOINT_COMPLETION`. Un witness de duración 10 no certifica duración 20.

## Z — mecanismo anterior al coste residual

El primer bundle coloca las 19 entradas de 20 minutos consecutivamente en Estilismo, `[550,930]`. C01 tiene disponibilidad hasta 930 y aún necesita Estilismo salida de 5 minutos seguido de OUT de 5, margen 0. `exactTaskStartDomain` devuelve dominio vacío para su salida `task:10004`. Manteniendo sólo placements del propio C01, el mismo dominio admite `[790,925]`: el bloqueo observado procede de la ocupación de Estilismo por las entradas de otros participantes.

Se auditan los **60 matchings de geometrías distintas**. Todos tienen dominio vacío para esa salida; sus bloques de entrada terminan entre 930 y 950 y C01 sólo tiene una posición de bundle en cada grafo. El productor `buildPipelineWitness` construye `stylingSpots` como `start + ordinal × duration`. Esa realización contigua impide la salida; la autoridad del espacio canónico es capacidad 1, sin secondaryContinuity ni setup que obliguen a terminar todas las entradas antes de comenzar salidas.

Una contraprueba reducida conserva capacidad, disponibilidad y dependencias: dos entradas de 20 minutos contiguas dejan sin dominio una salida; entrada-a → salida-a → OUT-a, con entrada-b después, pasa `validatePlan`. Demuestra que intercalar puede ser legal. **No demuestra la viabilidad de las 266 obligaciones actualizadas con S1 protegido.** La poda de la hoja contigua es sound; abandonar esa representación no equivale a certificar todas las representaciones posibles.

La cadena Reality C aporta también un rechazo local certificado por `task:10102` @980. Ninguna de estas autoridades prueba inviabilidad global. El residual visita 207 patrones y 1.141 timelines, colapsa 348 órdenes equivalentes y reconstruye 1.251 matchings completos sin actualizaciones incrementales ni cache hits. No se capturan hashes completos de autoridad de cada invocación: estos conteos no justifican llamar redundantes a todas las ramas ni añadir una cache indiscriminada.

## W — hipótesis falsable y único experimento productivo nuevo

**X**: se pierden reparaciones estructurales y se cae al residual. **Y**: `seenBundleForbidden` comparte exclusiones `task@posición` entre grafos diferentes en `runExactMainAndFeederSearch`. **Z**: omite 44 de 52 solicitudes de reparación aunque una posición representa otros horarios/bundles. **W**: limitar la deduplicación al candidato estructural que define ese grafo. **M**: recuperar la alternativa válida en la contraprueba con su budget intacto y comprobar por separado el efecto canónico.

La contraprueba usa dos Main/Vocal y geometrías 60/70 y 80/90. El primer grafo no puede reparar a@0; el segundo puede situar a@90 y conservar sus dos obligaciones futuras. Antes agota 10 ramas; después completa en 2 mediante el matching incremental existente. Diagnóstico on/off conserva resultado, decisiones, fingerprint, contabilidad y stop reason. El test comprueba validez e input inmutable.

El único cambio productivo son **7 líneas** en `exactMainAndFeederCore.ts`: al cambiar el candidato/grafo se reinicia el conjunto de exclusiones; dentro del mismo grafo se mantiene la deduplicación. No hay nuevo scheduler/DFS, scoring, seed, presupuesto, timeout ni relajación. Se añade un test focal de 51 líneas.

| S2 | Referencia `6f0f696` | Candidato |
|---|---:|---:|
| Arquitecturas / matchings / hojas core | 79 / 60 / 52 | 79 / 60 / 52 |
| Reparaciones / deduplicaciones entre grafos | 8 / 44 | 52 / 0 |
| Reparaciones con nuevo matching | 0 | 0 |
| Ramas antes del residual | 9.344 | 9.404 |
| Ramas matching residual | 288.190 | 288.190 |
| Ledger total = core + continuación | 300.000 = 299.636 + 364 | Igual |
| Propuesta S2 / continuación conjunta alcanzada | No / No | No / No |

La hipótesis de que esta corrección bastaba para desbloquear S2 queda **refutada**. Se retiene el defecto corregido porque su pérdida de alternativas está demostrada, sin atribuirle mejora canónica. Se detiene expansión después de un experimento productivo nuevo; los dos ciclos anteriores permanecen documentados. No se encadenan heurísticas sobre el consumidor residual.

El experimento focal siguiente debe usar los exploradores exactos ordinarios/placement/transporte existentes para mantener reconfigurables IN y entradas no aceptados en la frontera core → continuación conjunta y certificar una intercalación de entrada/salida bajo el canon actualizado. Primero debe pasar la contraprueba reducida con decisiones protegidas; después exigir certificado completo, ledger y validación antes de proyectar. No se implementa sin esa evidencia.

## M — gates, tiempos y límites

Los dos flujos A2 nuevos arrancan con snapshots vacíos y sin seed. El comparador exige igualdad de scopes, placements, recursos, unidades, comidas, preparaciones, witnesses/certificados y accounting. Fingerprint final `7195f0eba23dcd42fc442a5e8ae9377d85fe53e74df7129244d4df19a5632415`; digest material `ae079844467d20d6adf59b55367d41fe0b5c4e5a2d07323d6a7d3d95d325afcc`, ambos idénticos al baseline.

| Stage | Ledger core + continuación | Baseline, ms (dos runs) | Candidato, ms (dos runs) |
|---|---:|---:|---:|
| S1 | 11.394 + 69.441 | 241.975 / 220.710 | 174.897 / 170.776 |
| S2 | 0 + 293 | 180 / 128 | 193 / 117 |
| S3 | 0 + 293 | 149 / 268 | 110 / 103 |
| S4 | 0 + 293 | 213 / 183 | 202 / 97 |
| S5 | 0 + 13.241 | 18.085 / 25.088 | 17.501 / 18.020 |
| S6 | 0 + 293 | 107 / 137 | 111 / 106 |
| S7 | 0 + 1.884 | 6.814 / 11.614 | 6.766 / 6.749 |
| S8 | 0 + 293 | 137 / 132 | 225 / 128 |
| S9 | 0 + 293 | 125 / 195 | 209 / 194 |
| S10 | 0 + 293 | 183 / 332 | 136 / 197 |
| Cálculo total | — | 267.968 / 258.787 | 200.350 / 196.487 |

Tiempo total de los wrappers A2 nuevos: 200.535,874 / 196.563,581 ms. Cada Stage mide la llamada completa, incluidos core y continuaciones; no hay cronómetros independientes completos para esas dos fases. Se usa el mismo workspace y los dos runs nuevos son secuenciales. Las decisiones y ramas A2 son iguales: la variación temporal no prueba una aceleración causal del delta y no se declara optimización de S1. **Objetivo <=120 s: FAIL en S1. Techo <=300 s: PASS.**

ASST original falla tras **527.143,777 ms**; S2 aislado con la misma entrada consume **216.652,672 ms**. No se capturó un cronómetro separado para S1 ASST. El run con inspector se solapa con la auditoría read-only y no sirve como comparación de latencia. Su input, resultado y **Evidence completa** son exactamente iguales al S2 directo: la captura no cambia decisiones, ledger, fingerprint ni stop reason. Tras imprimir el fallo se interrumpen únicamente el observador y el wrapper que esperaban el cierre del debugger; ninguna búsqueda se interrumpe ni ese exit 130 se cuenta como PASS.

| Gate | Estado |
|---|---|
| Identidad checkout; scope autorizado; witness futuro invisible/no protegido | PASS |
| Refresh materializado y S1 preservado | PASS |
| ASST-010 completo / propuesta post-refresh | FAIL |
| AcceptedException, provenance, rollback, redo y divergencia en el recorrido canónico | INCONCLUSIVE: no alcanzados |
| A2 266/266, S10, dos runs limpios, material completo y protección exacta | PASS |
| Nuevas HARD/REQUIRED, comidas, movimientos de aceptados A2 | PASS: 0 violaciones nuevas / 0 movimientos |
| Ledger exacto A2, máximo 100.000 por solicitud | PASS: máximo 80.835 |
| Requisito interactivo 100.000 en ASST-010 | FAIL: fixture heredada sigue en 300.000 |
| Instrumentación neutral | PASS |
| Regresiones focales | 354 PASS / 2 FAIL heredados / 0 nuevos |
| TypeScript, build, secuencia y test de migraciones | PASS |
| Preparación para producción/merge | FAIL |

Los dos fallos de transporte se reproducen también en checkout separado de `6f0f696`: `exact continuation constructs IN, work, ESTILISMO_SALIDA, then dependent OUT immutably and order-invariantly` y `terminal IN materialization finds the backward-propagated witness`. Los tests unitarios aislados de excepciones/lineage pasan y no sustituyen ASST.

Archivos de esta continuación: `exactMainAndFeederCore.ts`, su spec y estos dos archivos de Evidence. Riesgo: recuperar alternativas puede consumir más ramas en configuraciones que dependían de deduplicación incorrecta; el ledger conserva sus límites. No se modifican benchmark/expectativas, canon A2, budgets/timeouts, UI/API/persistencia, base remota ni otras optimizaciones. No hay merge.

Reproducción: `npx tsx --test server/benchmarks/runA2Assist7Evidence.spec.ts`; test nuevo con `--test-name-pattern='structural matching exclusions'` en `exactMainAndFeederCore.spec.ts`; dos llamadas a `runA2Assist8Evidence({reportIterationDurations:true})` desde snapshot vacío, comparadas mediante `collectiveClosureDeterministicMaterial`. Los detalles antes/después, neutralidad, autoridades y límites están en `configRefreshAudit` del [JSON](ASST-010-explicit-scope-core.json).
