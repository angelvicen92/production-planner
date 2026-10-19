# P7 — Fecha de ejecución y fidelidad del registro real

PR #1155, base `c1b3305b792e75d1409740e2893b3fd137ea6933`, rama `codex/ops-p7-execution-date-integrity`. Esta revisión corrige el contrato del head auditado `3c3b51439cb9681a6d9449647248088ea1199549`; los resultados anteriores se conservan como históricos y no acreditan el contrato actual.

## Causa y cambio requerido

- **X:** un Start real a las **19:10**, fecha del plan **31/10/2026**, horario previsto **08:00–19:00**, era rechazado. También fallaba rectificar un inicio tardío preexistente.
- **Y:** 098 reutilizaba `work_start/work_end` como límites de ejecución; `correct_task_execution_time` de 097 imponía la misma restricción.
- **Z:** producción no podía reflejar una desviación real del mismo día y Start/rectificación quedaban incoherentes.
- **W:** separar la fecha de pertenencia de la ejecución de la ventana usada para planificar.
- **M:** el mismo día de Madrid admite hechos reales tempranos o tardíos y su corrección auditada; otro día sigue rechazándose. No se recorta, desplaza ni sustituye el timestamp real.

La **Fuente 01 v5.2**, §11, §4.2 y «Día en vivo exitoso», establece «Start fija el inicio real», «La ejecución real es la verdad operativa» y «Los retrasos se registran». La **Fuente 04 v2.7**, Parte III §6–7 y disponibilidad temporal de recursos, define la ventana del día, su snapshot y la intersección de disponibilidades para **planificar**. Esa ventana permanece intacta: no se amplía la disponibilidad del motor al admitir un hecho ejecutado fuera de previsión. Se consultaron también 00 v2.13, 05 v2.7 y 07 v2.2; no se modifican normas oficiales.

Se distinguen cuatro autoridades: horario previsto y disponibilidad para planificar; fecha de jornada (`plans.date` en Madrid); instante real del reloj servidor e historial inmutable; desviación, observable porque se conservan simultáneamente los tiempos planificados y reales. No se añade una regla de búsqueda ni una vista nueva para compensar el registro.

## Prueba roja antes de modificar 098

Se añadieron primero dos tests positivos al código auditado. Ambos fallaron por la causa esperada, sin error de conexión ni autorización:

1. Start a las 19:10 del mismo día: `EXECUTION_START_WORKDAY`.
2. Rectificación a las 19:05 de un inicio a las 19:10 ya admitido por 097: `EXECUTION_WORKDAY`.

[contract-red-current-098.log](contract-red-current-098.log) conserva el resultado. El ensayo nativo mantiene también el antes/después del defecto original: la función exacta de 097 admite un Start con reloj manual avanzado 25 horas y fecha equivocada (HTTP 200); 098 conserva esos datos y permite terminar/resetear el registro antiguo, pero rechaza el siguiente Start (409, sin escrituras).

## Delta productivo

`098_execution_start_workday.sql` contiene `CREATE OR REPLACE` de **las dos firmas existentes**. 097 permanece idéntica a la base y no se aplica 098 a Supabase real.

En `execute_task_transition(bigint,uuid,text,text,integer)`, únicamente `pending → in_progress` compara `operationalAt` con `plans.date` en **Europe/Madrid**, después de locks y antes de cualquier escritura. No consulta `work_start/work_end`. Conserva autorización/G0, expectedStatus/expectedVersion, estados, readiness, ocupación de persona/espacio, modo/revisión y cronología. El modo manual conserva el round-trip y detección del fold/gap: una base HH:mm sin instante unívoco se rechaza aunque haya transcurrido tiempo desde su fijación. Una base unívoca sí puede avanzar a cualquiera de los dos instantes reales del fold.

En `correct_task_execution_time(bigint,uuid,text,text,text,integer)`, se retira únicamente la barrera de horas previstas y se mantiene la fecha Madrid del inicio y del fin, si existe. Continúan actor y ámbito, versión observada, motivo, offset explícito, estado, límite de futuro, cronología y límites de pausas del run actual, locks intactos, incremento de versión y evento inmutable con valor anterior/nuevo y snapshots. Los instantes explícitos del fold siguen siendo distintos; un offset identifica un instante que se convierte a Madrid, sin inventar la hora inexistente del gap.

La comparación de cuerpos acredita igualdad por bytes fuera de estas autoridades temporales ([contract-sql-preservation.json](contract-sql-preservation.json)). Los tests comparan OID, argumentos/defaults y ACL de ambas funciones antes/después de reemplazarlas; `anon/authenticated` no pueden ejecutar las RPC. No se añaden grants, firmas alternativas, tablas, columnas ni backfills.

`server/liveExecution.ts` distingue mensajes de fecha equivocada (409), reloj manual inválido/DST (409), reloj modificado (409), revisión de tarea obsoleta (409), cronología incompatible (409), permisos (403) y persistencia fallida (503). Un Start tardío del día correcto responde **200**.

## Continuidad y frontera de medianoche

| Operación | Contrato actual |
|---|---|
| Nuevo Start | Fecha de Madrid del plan; puede ser anterior/posterior al horario previsto |
| Finish / Interrupt / Resume / Cancel | Cuerpo previo intacto; permite continuidad de registros existentes fuera de horario/día, sujeto a revisión y cronología |
| Reset | Contrato previo intacto, auditoría y retirada exclusiva del lock de ejecución; el nuevo Start revalida la fecha |
| Corrección de inicio/fin | Mismo día Madrid, incluso fuera de horario; conserva cronología, pausas, futuro, versión, actor y motivo |
| Historial | Eventos originales inmutables; la rectificación añade evento y conserva snapshots anterior/nuevo |

No se infiere una jornada nocturna de `20:00–04:00`, ni de límites nulos/invertidos. Las horas de planificación no deciden la fecha del registro: un hecho del día siguiente no se convierte en parte del anterior. Un Start de otro día se rechaza incluso con esos límites. La política anterior de Finish permite cerrar un registro existente tras medianoche; esta revisión no amplía la rectificación a fechas distintas. Un hecho **enteramente del mismo día** puede iniciarse, terminarse, rectificarse y leerse en el historial sin la antigua incoherencia.

El reloj manual se ancla al día de cada plan conforme a `execution_clock`, no a la fecha física de fijación. Se prueban días de 23/25 horas y zona de sesión/dispositivo distinta; no se sustituye el calendario por un umbral fijo de 24 horas.

## Recorrido real y validación

`Mi Día / Iniciar` → versión/estado observados → `PATCH /api/tasks/:id/status` → actor autenticado → `storage.updateTaskStatus` → `liveExecution.executeTask` → PostgREST → RPC versionada. La hora del cliente no es autoridad. La rectificación usa `PATCH /api/tasks/:id/real-time`; el historial usa la API existente.

El ensayo descartable aplica **todo el ledger hasta 098**, PostgreSQL 17, Auth con contraseña, HTTP, PostgREST y Chromium. Verifica Starts temprano/tardío, correcciones de inicio/fin tras Finish, historial original, rechazo sin cambios materiales por otra fecha, G0, carreras entre dos actores y Start en espera del lock del reloj. El reloj ganador puede rechazar por día distinto o admitir una hora temprana/tardía del mismo día. Cada carrera válida confirma un único incremento/evento/lock.

En Mi Día real, Chromium usa `America/New_York`: observa 409 por otra fecha con versión intacta; registra Start **21:10**, rectifica inicio **21:09:00**, finaliza y rectifica fin **21:09:30**, recarga y abre el historial. Se comprueban timestamps y versiones enviados. Capturas: [rechazo](contract-start-rejected.png) e [historial tardío](contract-late-correction-history.png). No se modifican componentes de Mi Día ni Control Room/P6.

Resultados exactos, comandos, hashes y límites en [validation.json](validation.json). Los reportes nativos actuales llevan prefijo `contract-`. Los antiguos `native-*.json`, logs sin ese prefijo y [audit-3c3b514-validation.json](audit-3c3b514-validation.json) son Evidence histórica de la iteración auditada; sus expectativas de ventana **han sido sustituidas** por esta revisión.

El snapshot aceptado sigue siendo una copia versionada de **266 obligaciones y S0–S10**, fingerprint `a58fc840fa4b8d04049c96d8310eac6e5d4df66f08069d968fe7a5e0adf9e2dc`. El ensayo compara literalmente placements, planes, sesiones, Stages y otras jornadas. Esta preservación no se presenta como una nueva generación Full A2; Planner Engine CI ejecuta por separado la generación y determinismo. Motor, Assisted, storage, límites y presupuestos de búsqueda no cambian.

Los ajustes históricos de P1/G0 para fijar por API un reloj manual válido siguen siendo necesarios: un Start automático sobre el snapshot histórico debe rechazarse por otra fecha. En los tests de 097, la antigua expectativa de rechazar una corrección por horario se sustituye por aceptación auditada; se conservan los negativos de fecha/cronología/DST y se añade la comprobación del instante Madrid real cuando se aporta offset.

No hay activación humana de jornada, merge, publicación Replit, despliegue ni migración remota. Realtime/WebSocket y ejecución publicada quedan fuera del ensayo local.

## Reproducir

```sh
node --import tsx --test --test-concurrency=1 server/liveExecutionDateIntegrity.spec.ts server/executionTimeCorrections.spec.ts
npm run check
npm run build
npm run check:migrations
npx --no-install tsc -p script/demo/tsconfig.integration.json
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx script/demo/smokeA2Integration.ts work/p7-contract/native --historical-topology --execution-date-integrity
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx script/demo/smokeA2Integration.ts work/p7-contract/p2b-p3 --historical-topology --time-corrections
```

El runner solo admite servicios propios en loopback y los elimina al terminar. `Live day execution` ejecuta el gate P7 junto a G0, P2B/P3, P1 y sus gates visuales existentes, sin aumentar timeouts.
