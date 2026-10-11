# A2 — comidas operativas persistidas y orden de Stages

Continuación del PR #1105 desde `b598a54`, rama `codex/optiplan-a2-import-demo`. [Evidence comparativa](A2-STAGE-ORDER-EVIDENCE.json).

**El snapshot realmente aceptado y persistido pasa ahora el canon integral: 266/266, ocho comidas operativas y cero violaciones.** El baseline y las dos variaciones de orden se repiten de forma determinista. No cambian horarios, asignaciones, preparaciones, políticas ni búsqueda frente a b598a54; se consolidan las siete comidas antes omitidas.

## Autoridades y delta causal

Consulta dirigida: Fuentes 03 v3.6, 05 v2.6, 06 v2.7 y Gate 4.4 de Fuente 07 v2.2. Sus hashes están en Evidence. Las instrucciones del encargo gobiernan las acciones; no se ejecutan instrucciones de carga/publicación de los documentos.

En b598a54 el witness JOINT_COMPLETION era válido y contenía las ocho comidas. `AssistedProposalService.run` sólo proyectaba la principal; PostgreSQL persistía fielmente un snapshot con 1/8. El canon devolvía siete incumplimientos de comidas y dos de preparación entre rondas. El [diagnóstico histórico completo](https://github.com/angelvicen92/production-planner/blob/b598a54/docs/demo/A2-STAGE-ORDER-AUDIT.md) y su [Evidence](https://github.com/angelvicen92/production-planner/blob/b598a54/docs/demo/A2-STAGE-ORDER-EVIDENCE.json) siguen disponibles; sus fallos no se reescriben como éxitos.

El cambio productivo se limita a esa proyección:

1. Conserva literalmente `baseSnapshot.operationalMeals`.
2. Consume las políticas canónicas `OperationalMealPolicy` y los intervalos de `selectedMealWitnesses.operational.scheduled`, ya seleccionados y validados por el motor.
3. Identifica consumidores por espacios y recursos físicos explícitos, incluyendo coach y composiciones itinerantes. Mientras una asignación futura esté abierta, cuentan sus composiciones admisibles: el witness no las convierte en protección.
4. Añade el intervalo sólo cuando todos los consumidores están en las colocaciones ya aceptadas o en la propuesta visible actual. Una unidad parcial/futura mantiene la pausa virtual. No se proyectan horarios de tareas ajenas al scope.

Apply sigue escribiendo sólo Draft; accept consolida la decisión; el siguiente run la recibe como comida protegida con el mismo intervalo. No cambia ningún contrato SQL ni función de fingerprint. Tampoco se modifican solver, matching, Future Feasibility, poda, budgets, timeouts, recomendador ni validadores.

| Comida | Primer Stage con consumidores completos | Comidas persistidas acumuladas |
|---|---:|---:|
| Estudio 7 | S1 | 1 |
| Los dos coaches | S2 | 3 |
| Totales sincronizado | S4 | 4 |
| Reality A y B | S5 | 6 |
| Plató 15 | S6 | 7 |
| Plató 14 | S7 | 8 |

S3 y S8–S10 conservan las comidas existentes. Cada Stage comprueba independientemente la relación entre consumidores completos e intervalos persistidos. El test focal cubre aceptación parcial, recursos/coach, conservación literal y la tarea itinerante futura que puede consumir otra composición; ésta no autoriza aceptación prematura.

## Recorridos y validación real

Se utiliza la misma base Docker descartable: PostgreSQL 17.11, GoTrue, PostgREST, Auth y API/RPC productivos, Node 20.20.2 y Chromium. El recorrido inicial usa la UI real para login → jornada → S0 → sugerir → propuesta/run → apply → validate → accept → SQL → recarga, hasta S10. Los roles HTTP/RLS, denegación de escrituras directas, inmutabilidad, staleness atómica, segundo navegador y rollback/redo permanecen comprobados.

Los checkpoints son los Stages originales completos, restaurados mediante rollback productivo; conservan catálogo, configuración, linaje, runs, witnesses, recursos y todas las protecciones. No se importan horarios resueltos ni se reconstruye una sesión a partir de un snapshot parcial. Las dos variaciones usan `TASK_IDS` explícitos, sin alterar la recomendación automática. Finalmente se restaura S0 y se repite el orden original con sus mismos selectores e `includePrerequisites`.

| Recorrido | Base común | Acumulados posteriores | Repeticiones completas |
|---|---|---|---:|
| Baseline | S0 | 19 → 38 → 46 → 65 → 75 → 111 → 169 → 207 → 209 → 266 | 2: UI y API productiva |
| P14 antes de P15 | S5, 75/266 | 133 → 169 → 207 → 209 → 266 | 2 |
| P15 antes de Reality A/B | S4, 65/266 | 101 → 111 → 169 → 207 → 209 → 266 | 2 |

Los pares se eligen por autoridades configuradas, comprobando independencia de dependencias, recursos y acoplamientos técnicos cruzados. Se mantienen pipeline/feeders, Reality C/EVA y prioridad de Totales. P14–IN/Estilismo tiene precedencias temporales y se descartó como par relativamente independiente; ello no demuestra que invertir sus Stages sea imposible.

Cada continuación focal consume 293 branches; los costes son 1465 para P14/P15 y 1758 para P15/Reality por repetición. S1 conserva el trabajo original: 21975 branches, 4766 core y 17209 standalone, siete intentos/materializaciones de bundle, matching ACCEPT. El orden interno de construcción del witness es distinto del orden visible de aceptación. El JOINT válido se revalida contra las protecciones y el canon antes de reutilizarse; no hay nueva estrategia ni agotamiento.

En los **seis finales realmente persistidos**, `validatePlan` recibe las 247 tareas, 19 comidas Sodexo, una preparación de setup, 17 entre rondas y ocho comidas operativas del snapshot SQL, con el EngineInput leído del storage real. Resultado: `hardValid=true`, sin violaciones estructuradas, reason codes ni contadores de incumplimientos; cierre colectivo certificado. No se añaden filas del witness para sustituir ocupaciones ausentes. El antiguo contrafactual ahora añade cero intervalos y no constituye la prueba de aceptación.

La comparación de los diez snapshots originales contra b598a54 demuestra igualdad literal de todo su contenido excepto las comidas añadidas. Todas las comidas previamente aceptadas se conservan. El fingerprint final cambia legítimamente de `a797ee88647d14e18aaa698d53306c8005cf70588ce74b7d7333b5ba88ce216e` a **`557d0efe105e7a2257f4f7754150e8aff814581ec943e5f623dbbc3640f147b9`**. La prueba exige determinismo dentro de cada orden, sin exigir ese fingerprint a un orden alternativo que produzca geometría distinta. En estos dos casos la geometría y el fingerprint final coinciden con el baseline corregido.

## Límite de transporte del ensayo CLI

El primer ensayo corregido acreditó el baseline UI y las cuatro variantes con canon PASS, pero falló en el segundo polling GET de S1 al repetir desde S0 (`TypeError: fetch failed`); no aceptó ningún Stage de esa repetición. El gateway había recibido completo el cuerpo de `assisted_finish_proposal`, con respuesta todavía pendiente. No hubo OOM, nueva violación ni evidencia de agotamiento. Se conserva el SHA y el estado observado en Evidence. Una simulación mínima de sockets no reprodujo el fallo, por lo que no se atribuye una causa exacta al producto.

Antes de continuar se documentó el fallo y se detuvieron los cambios productivos. El ensayo definitivo usa `Connection: close` para las peticiones CLI: HTTP/Auth/API/RPC reales, sin pool ocioso, retries ni cambios de timeout. La UI Chromium permanece intacta. Esta ejecución comprueba la integración con conexiones independientes; no certifica el caso de replay S1 mediante el pool fetch original, cuya causa exacta queda pendiente. No se cambia ni añade estrategia de búsqueda.

## Reproducción y gates

Con las dependencias, Docker y Chromium del [smoke nativo](A2-ASSISTED-INTEGRATION.md), usar Node 20:

```sh
npm run demo:a2:smoke -- work/a2-stage-order --full --stage-order
```

Salida esperada: **0, PASS**. El modo `--full` incluye ahora el canon integral del snapshot SQL; `--stage-order` añade las cuatro continuaciones focales y la segunda construcción desde S0. CI ejecuta ambas opciones y publica los informes, sin logs privados ni credenciales. No se relajan assertions, reason codes o budgets; no se añaden mocks, skips o exclusiones. Los diagnósticos históricos ASST-010/Full A2 Autopilot mantienen sus assertions y tratamiento previo.

Evidence conserva los dos checkpoints completos y el historial final de **43 Stages y 42 runs** de la base sintética. Son las siete tablas del contrato Assisted, no un backup de Supabase ni tablas de Auth. Los archivos gzip, hashes y comprobación de anonimización/ausencia de credenciales están en Evidence. Los captures históricos de b598a54 siguen en ese commit.

El Gate integral queda respondido: mismas entradas y configuración, mismas decisiones de búsqueda y geometría, primera omisión aislada en la proyección, único delta en las ocupaciones consolidadas, falsificación mínima seguida de prueba de persistencia real y determinismo. La robustez probada sigue siendo de dos cambios tardíos de aceptación sobre un witness ya construido; no acredita cualquier orden previo a S1 ni resuelve ASST-010.

Supabase remoto, Replit y el Docker de adopción del usuario quedan intactos. La adopción del catálogo/backup originales, Supabase PostgreSQL 17.6.1.063, Realtime/WebSocket y el ensayo de la URL publicada siguen pendientes. No se hace merge ni se abre otro PR.
