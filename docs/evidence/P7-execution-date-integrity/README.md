# P7 — Integridad temporal de nuevos Starts

Base y rama verificadas: `c1b3305b792e75d1409740e2893b3fd137ea6933`, `codex/ops-p7-execution-date-integrity`. Fuentes consultadas: 00 v2.13 (autoridad), 01 v5.2 (estados y permisos), 04 v2.7 (snapshot diario y ventana máxima de jornada), 05 v2.7 (gates y determinismo), 07 v2.2 (método causal). Evidence previa: EJEC-01/P1, G0, P2B y P3.

## Defecto y reproducción anterior al cambio

`execution_clock(plan)` obtiene el reloj del servidor. En modo manual resuelve `plans.date + simulated_time` en Madrid y suma el tiempo físico transcurrido desde `simulated_set_at`. Por tanto, un reloj fijado a las 10:00 hace 25 horas ya pertenece a otro día. La transición versionada de 097 adquiría locks y comprobaba autorización, versión, estado, readiness, ocupación, revisión y cronología, pero no contrastaba la fecha/hora resultante con el plan.

Se añadió primero el test SQL `P7: a manual clock advanced beyond the plan date rejects Start without writes` sobre 097, antes de crear 098. **Rojo observado: `AssertionError: Missing expected rejection`**; no fue un rechazo por permisos ni un fallo de conexión. Véase [main-reproduction.log](main-reproduction.log).

El ensayo nativo reproduce además el cuerpo exacto de la función de 097 en PostgreSQL descartable, sin alterar el resto del ledger: HTTP responde **200**, persiste el inicio y SQL confirma que su fecha de Madrid es distinta de `plans.date`. Reinstala 098, verifica igualdad literal de datos antes/después de la migración, termina esa ejecución antigua y hace reset. El siguiente Start con el mismo reloj fuera de fecha devuelve **409**, sin modificar tarea, versión, eventos ni locks. Este antes/después queda automatizado en `smokeExecutionDateIntegrity.ts`.

## Recorrido productivo observado

`Mi Día / Iniciar` → `useUpdateTaskStatus` con `expectedStatus/expectedVersion` observados → `PATCH /api/tasks/:id/status` → middleware de autenticación/autorización → `storage.updateTaskStatus` → `server/liveExecution.executeTask` → PostgREST `execute_task_transition(bigint,uuid,text,text,integer)` → PostgreSQL.

El actor procede de la sesión HTTP; el cliente no aporta el instante de inicio a la RPC. El ensayo envía también los campos horarios legacy: no permiten rescatar un Start inadmisible. En Chromium real, con zona del dispositivo `America/New_York`, la UI existente permite enviar el Start y muestra la respuesta del servidor. Rechazo **409**, posterior Start válido **200**, Finish **200**. Las dos peticiones de Start observan la misma versión porque el rechazo no la incrementa. Véase [p7-start-rejected.png](p7-start-rejected.png).

## Delta SQL y decisión temporal

098 contiene exclusivamente `CREATE OR REPLACE` de la firma versionada de `execute_task_transition`. Conserva defaults, OID/ACL, invoker, `search_path`, orden de locks y todo el cuerpo anterior fuera de la guarda. No incorpora otra firma ni cambia grants, RLS o tablas.

Después de los locks efectivos de plan → sesión activa → tarea → settings, y antes de cualquier escritura, sólo para `pending → in_progress`:

1. Lee fecha y límites diarios de `plans`, ya bloqueado.
2. Usa `operationalAt` de `execution_clock`, leído bajo el lock de settings.
3. Compara fecha y hora en **Europe/Madrid**, con los límites inclusivos de 097.
4. En modo manual aplica el mismo round-trip y detección de fold/gap que la corrección auditada. Una base HH:mm ambigua o inexistente no se normaliza silenciosamente, aunque después hayan transcurrido horas.
5. Rechaza con `EXECUTION_START_WORKDAY` → `executionError` → HTTP **409**: «La hora operativa no corresponde a la jornada del planning.» Permisos siguen siendo 403, versión stale 409 y fallo de persistencia 503.

No se exige que un plan simulado sea el día físico actual. Un reloj manual recién fijado se ancla por contrato al día de cada plan; varias jornadas siguen siendo independientes. Tampoco se usa un umbral fijo de 24 horas: las pruebas verifican días de Madrid de **23 y 25 horas**, dos instantes reales del fold alcanzados desde una base unívoca y una fecha UTC distinta que pertenece al día correcto en Madrid. El reloj automático debe corresponder al día real de Madrid del plan.

## Continuidad de las demás operaciones

| Operación | Al finalizar/cambiar de fecha | Si cambia revisión/modo o se invierte el reloj |
|---|---|---|
| Nuevo Start desde pending | Nueva guarda temporal; límites inclusivos de 097 | Mantiene además las precondiciones existentes |
| Finish | Puede cerrar una ejecución ya iniciada fuera de la ventana/día | Sigue devolviendo CLOCK_CHANGED/CLOCK_REVERSED cuando corresponda |
| Interrupt | Conserva la ejecución y registra la pausa fuera de ventana/día | Conserva los conflictos de reloj existentes |
| Resume desde interrupted | No es un nuevo Start; mantiene cronología y ocupación | Conserva revisión/modo y rechazo de inversión |
| Cancel desde pending | Conserva su contrato; no requiere fecha de nuevo Start | Mantiene reglas previas |
| Cancel desde interrupted | Conserva acumulación de pausa y cierre | Mantiene revisión/modo y cronología |
| Reset | Disponible para Admin/Producción, incluso para datos antiguos; conserva auditoría | No requiere recuperar el reloj anterior; el siguiente Start vuelve a validar |
| Corrección auditada P2B/P3 | Conserva sus límites y cronología de 097 | Conserva sus propios conflictos de reloj y control de versión |

La migración no revalida ni reescribe tareas antiguas. Se prueba una ejecución fuera de día creada con 097 y terminada después de aplicar 098. No se amplían las políticas de cierre, interrupción, cancelación o rectificación. Una ejecución terminada fuera de ventana puede seguir encontrando las restricciones previas de corrección; P7 no introduce esa política.

Ventanas nulas, invertidas o de duración cero no tienen un Start admisible, como en 097. Las Fuentes no autorizan aquí un contrato nocturno o excepcional: no se transforma `fin <= inicio` en cruce de medianoche, no se amplía la ventana y no se crea activación humana de jornada. Esos casos quedan aislados mediante rechazo y tests.

## Expectativas históricas corregidas, sin eliminar pruebas

- P1 hacía un Start automático sobre la fecha histórica del snapshot A2 y esperaba 200; ese era precisamente el comportamiento defectuoso. El recorrido positivo configura ahora por la API existente un reloj manual válido y contrasta los timestamps de Start contra el reloj operativo del servidor. Sigue comprobando carreras, fallos de persistencia, dos navegadores, reset, permisos y preservación. P7 cubre separadamente automático real correcto/incorrecto.
- G0 configura de igual forma un reloj manual válido antes de capturar su baseline: su prueba sigue aislando permisos y preserva literalmente planes, Stages y reloj durante las operaciones de autorización.
- El test DST de correcciones iniciaba en `04:00` con límite `04:00`, aunque el reloj ya había sumado fracciones de segundo y quedaba fuera. El inicio usa `03:59`; se mantienen las pruebas de corrección y se prueban por separado los extremos exactos y un microsegundo fuera del intervalo.
- El mismo test iniciaba usando el gap manual `02:30` del 29 de marzo: ahora exige rechazo del nuevo Start. Conserva su rechazo histórico de corrección sobre una ejecución previamente iniciada de forma válida, tras cambiar a ese reloj inválido.

## Validación y alcance de la Evidence

Resultados exactos y comandos en [validation.json](validation.json); ensayos públicos nativos y logs adyacentes. Entorno local: Node 24.19.0, PostgreSQL 17.11, imágenes fijadas por digest del runner existente, Chromium del sistema. CI conserva Node 20 y sus timeouts anteriores.

Los JSON conservan checks, resultados, hashes de fuentes y ledger, y resumen el tráfico RPC por ruta/método/status para evitar duplicar cada petición. El runner y los artefactos de CI conservan su traza completa.

El ledger nativo completo se aplica desde cero, incluidos 093 → 094 → 095 → 096 → 097 → 098. No se saltan migraciones históricas. El ensayo P7 reconstituye adicionalmente la función anterior y aplica 098 sobre datos reales ya iniciados para observar la continuidad.

Los extremos exactos y DST se prueban en PostgreSQL/PGlite con instantes controlados; el ensayo Auth/HTTP usa `execution_clock` real. Para probar automático positivo sobre el snapshot histórico, una transacción local cambia temporalmente la fecha/ventana del fixture, ejecuta la RPC y hace **ROLLBACK**. No persiste cambios de planning ni altera el reloj productivo.

El A2 de ejecución es una **copia aceptada** del fixture versionado: 266 obligaciones, S0–S10, fingerprint `a58fc840fa4b8d04049c96d8310eac6e5d4df66f08069d968fe7a5e0adf9e2dc`. Se comparan literalmente todos los placements, Stages, sesiones y planes, además de las otras jornadas. Eso acredita preservación; no se presenta como una nueva generación Full A2. La regresión de primer Stage ejecuta por separado dos recorridos productivos y compara fingerprints deterministas.

El intento de primer Stage concurrente con los gates nativos falló: 7/8 tests, segunda ejecución sin Stage aceptado y fingerprint distinto ([log](a2-contended.log), 542,299 s para el test). La repetición aislada **sin cambios de código, límites ni timeout pasó 2/2**, incluidos ambos recorridos y la igualdad de fingerprints ([log](a2-isolated.log)). Motor, servicios Assisted, storage y benchmark permanecen idénticos por bytes a la base. La ejecución SQL no participa en ese benchmark en memoria. Se conserva el fallo observado; no se atribuye una causa exacta de parada que el log no detalla ni se modifica el planificador para ocultarlo.

Un primer intento nativo pasó SQL/HTTP y agotó los 30 segundos de navegación inicial mientras se ejecutaban otros gates. El reintento con el mismo código pasó. No se incrementó ningún timeout. No se publican logs privados ni credenciales del ensayo.

No hay cambios de componentes de Mi Día/Control Room, ORC, Assisted ni snapshots del producto. No se ejecutan migraciones contra Supabase real. Realtime/WebSocket, despliegue real y adopción del catálogo conectado quedan fuera de esta unidad. Sin merge ni despliegue.

## Reproducir

```sh
npm run check:migrations
node --test script/check-migration-sequence.test.mjs
node --import tsx --test --test-concurrency=1 server/liveExecutionDateIntegrity.spec.ts server/liveExecution.spec.ts server/executionTimeCorrections.spec.ts server/incidents.spec.ts server/apiAuthorization.spec.ts client/src/lib/execution-precondition.test.ts client/src/lib/execution-time-correction.test.ts client/src/lib/my-day-temporal.test.ts server/assistedPlanningWorkflow.spec.ts
node --import tsx --test --test-concurrency=1 server/assistedPlanningSnapshot.spec.ts server/assistedManualSnapshotFidelity.spec.ts client/src/lib/control-room-metrics.test.ts
node --import tsx --test --test-concurrency=1 server/benchmarks/runA2Assist8Evidence.spec.ts engine/planner-next/benchmarks/canonicalFullA2EngineInput.spec.ts
npm run check
npm run build
node --import tsx script/demo/smokeA2Integration.ts work/p7-native --historical-topology --execution-date-integrity
node --import tsx script/demo/smokeA2Integration.ts work/p7-g0 --historical-topology --production-scope
node --import tsx script/demo/smokeA2Integration.ts work/p7-p2b-p3 --historical-topology --time-corrections
node --import tsx script/demo/smokeA2Integration.ts work/p7-p1 --historical-topology --live-execution-snapshot
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` permite usar Chromium del sistema. El runner sólo admite servicios propios en loopback y los elimina al terminar. `Live day execution` ejecuta la prueba nueva junto a sus gates existentes y publica JSON/captura del rechazo.
