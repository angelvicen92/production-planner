# P2B — rectificación auditada de horas reales

Base: `0c26905d82f7b7a4cb483c33f7a3f968ca3b8a82`. Rama: `codex/ops-p2b-audited-time-corrections`. [Resultados nativos, gates y hashes](P2B-audited-time-corrections.json).

## Causa y decisión

`093.execute_task_transition` sólo registraba la hora de pulsación del servidor. Reset eliminaba el estado de ejecución completo; no permitía corregir un inicio o fin individual. Una corrección por UPDATE aislado habría perdido la marca original y podría competir con Finish.

`097_audited_execution_time_corrections.sql` reutiliza **task_status_events**, ampliándolo con `event_kind`, versión, motivo, campo corregido, valores anterior/nuevo y snapshot anterior. No se crea otra tabla de auditoría. Los eventos existentes y sus timestamps no se reescriben; un trigger impide UPDATE/DELETE del histórico, incluidas eliminaciones en cascada. También se revocan UPDATE/DELETE de service_role. `time_correction` conserva el estado previo: no representa una transición Start/Finish. `created_at` es tiempo físico del servidor; `operational_at` registra el reloj operativo al corregir y `new_value` la hora declarada.

Fuentes revisadas: AGENTS, 00 v2.13, 01 v5.2 (actores, ejecución y auditoría), 04 v2.7 (ejecución y jornada), 05 v2.7 (gates y preservación), 07 v2.2; migraciones 039/093/094/096 y Evidence EJEC-01/G0. Se conserva la autoridad G0: roles globales Admin/Producción; aux con Producción nominal efectiva, activa y vinculada, o recurso nominal autorizado independiente. Redacción no concede autoridad.

## Contrato

`PATCH /api/tasks/:id/real-time`, autenticado:

```json
{
  "field": "start",
  "realAt": "2026-10-29T11:55:00+01:00",
  "reason": "Registro tardío",
  "expectedVersion": 3
}
```

- Una sola hora por operación; `field` es `start` o `end`. Fecha completa y offset explícito (o Z). Motivo obligatorio de **1–240 caracteres**, sin longitud mínima adicional. Se rechazan campos desconocidos, actor falsificado, vacío y no-op.
- Inicio: actividad iniciada, interrumpida o terminal con timestamps completos. Fin: actividad terminada/cancelada que tuvo inicio real. No se inventan timestamps para filas legacy incompletas ni se reabre la actividad.
- La versión `executionVersion` se devuelve en las lecturas de tareas y en la respuesta. Correcciones, transiciones y reset incrementan la misma secuencia. Corrección y Start/Finish exigen la versión observada; falta de versión en HTTP es 400, versión obsoleta es 409. La firma SQL antigua de transición se elimina para impedir bypass.
- Orden de locks: plan → sesión activa → tarea → configuración de reloj. Los permisos se revalidan **después de esperar los locks**, dentro de la transacción. No hay compensación posterior: tarea, versión y evento se confirman o revierten juntos.
- La nueva hora no puede ser futura respecto al reloj operativo. Se comprueban orden inicio/fin, estados y todos los límites de pausa/reanudación del ciclo actual (posterior al último reset), además del total de pausa. Los hechos de pausa no se editan.
- Se usa la fecha y ventana de jornada configuradas en el plan, con límites inclusivos y la autoridad Madrid ya existente. No se introduce soporte de jornadas nocturnas. Los instantes con offset distinguen las dos ocurrencias del cambio de hora; el reloj manual HH:mm ambiguo o inexistente se rechaza. Una revisión/modo de reloj incompatible requiere revisión por Producción, también sobre una tarea terminada.
- Sólo se actualizan timestamps efectivos, sus representaciones HH:mm/segundos y versión. Placements, planning, Stage/Draft y locks no se escriben desde la corrección.

`GET /api/tasks/:id/execution-history` devuelve versión actual y todos los eventos originales/correcciones/reset. Lectura global de Admin/Producción/Viewer y lectura operativa autorizada de aux. Las RPC son invoker, `search_path=''` y EXECUTE exclusivo de service_role; nunca aceptan actor del cuerpo HTTP.

401 sin autenticación; 403 sin autoridad; 404 inexistente; 400 contrato incompleto; 409 versión/estado/cronología/jornada/reloj incompatibles; 503 persistencia no confirmada.

## Lecturas y compatibilidad

`daily_tasks.start_real_at/end_real_at` siguen siendo la autoridad efectiva. La corrección actualiza en SQL las representaciones antiguas usadas por Mi Día. `shared/execution.executionDuration` sigue siendo la fórmula compartida con Control Room; no se añade otra duración o desviación persistida.

Mi Día envía Start/Finish directamente desde su componente. Para conservar intactos los componentes de **Mi Día y Control Room**, el transporte común añade la versión **ya observada en la caché de consultas** a esos comandos existentes. No consulta una versión nueva antes de escribir ni reintenta una escritura obsoleta. Si las dos lecturas cacheadas discrepan o falta una versión, no puede enviar una precondición válida. Los clientes HTTP externos deben enviar `expectedVersion` explícitamente. Los ensayos existentes se adaptan a este contrato obligatorio.

No se incorpora interfaz de corrección. No hay cambios en solver, configuración de planificación, Fuentes, componentes de ambas vistas ni migraciones integradas 001–096.

## Validación del candidato

| Gate | Resultado |
|---|---|
| Focal SQL/PGlite, autorización HTTP y transporte | **23/23 PASS**, Node 20.20.2 |
| Regresión planning/snapshots/workflow/Control Room/A2 | **48/48 PASS**; primer Stage A2 generado dos veces con fingerprint idéntico |
| Secuencia 071–097 y tests del validador | PASS; **8/8** tests |
| Ledger completo nativo | **100 migraciones PASS**, PostgreSQL 17.11 descartable |
| TypeScript producto y ensayo nuevo | PASS |
| Build Vite/esbuild | PASS; avisos existentes de Browserslist y tamaño de bundle |
| GoTrue → HTTP producto → PostgREST → PostgreSQL | **PASS**, identidades y sesiones reales |
| Regresión G0 nativa completa con 097 | **PASS**, ejecución/incidencias/RLS, revocación, concurrencia y rollback |
| Mi Día y Control Room en Chromium tras recargar | **PASS**, horas corregidas y duración concordantes; sin interceptar HTTP |
| Botones existentes Start/Finish de Mi Día | **PASS**, envían versión observada y reciben 200; componentes intactos |
| A2 aceptado y otros días | **266 obligaciones, placements y Stages/Draft literales**, locks de la tarea corregida idénticos |

Matriz nueva: inicio y fin, rectificaciones sucesivas con marca original conservada, tarea terminada, Producción nominal en varios espacios, globales, Redacción/viewer/sin rol/otro espacio/otro día, identidad revocada, campos falsificados, versión ausente/obsoleta, pausas y cronología imposible, futuro, jornada/fecha, modo/revisión del reloj y ambas fronteras DST. Se comprueba ausencia de escrituras en cada rechazo.

Concurrencia nativa: corrección contra Finish y dos correcciones de la misma versión producen **200 + 409**. Para revocación se retiene el lock del plan, se observa la RPC esperando mediante `pg_stat_activity`, se retira la autoridad y se libera: **403 y cero cambios**, aunque el precheck HTTP hubiera pasado. Un trigger que falla al insertar la corrección provoca **503 y rollback de tarea, versión e histórico**. Las RPC directas desde authenticated se deniegan.

El ensayo carga una copia descartable del A2 previamente aceptado `a2-legacy-import.json.gz`: 266 obligaciones, S0–S10, fingerprint `a58fc840fa4b8d04049c96d8310eac6e5d4df66f08069d968fe7a5e0adf9e2dc`. Certifica preservación y lecturas sobre esa copia; **no atribuye una nueva generación completa A2 al solver**. La prueba separada de 48 casos sí vuelve a generar determinísticamente el primer Stage. Se conserva la protección de ejecución existente y sus locks, sin replanificar ninguna tarea.

Durante la preparación, un ensayo agrupado con Node 24 produjo un fallo nativo V8/PGlite; se ejecutó la certificación final con Node 20, la misma versión mayor de CI. La suite final está verde. Un timeout inicial de selección de jornada en navegador se corrigió en el ensayo seleccionando la jornada por su control existente después de cargar preferencias; no cambió código de las vistas.

Capturas de las vistas existentes con el mismo registro corregido: [Mi Día](P2B-time-corrections/mi-dia.png) y [Control Room](P2B-time-corrections/control-room.png). Ambas muestran 04:30 de tiempo activo; Control Room conserva segundos y desviación frente al placement. Son datos locales de ensayo.

## Reproducción

Con Node 20, dependencias del lockfile, Docker y Chromium:

```sh
node --import tsx --test --test-concurrency=1 server/executionTimeCorrections.spec.ts server/liveExecution.spec.ts server/incidents.spec.ts server/apiAuthorization.spec.ts client/src/lib/execution-precondition.test.ts
node --import tsx --test --test-concurrency=1 server/assistedPlanningWorkflow.spec.ts server/assistedPlanningSnapshot.spec.ts server/assistedManualSnapshotFidelity.spec.ts server/benchmarks/runA2Assist8Evidence.spec.ts client/src/lib/control-room-metrics.test.ts
npm run check:migrations
node --test script/check-migration-sequence.test.mjs
npm run check
npm run build
node --import tsx script/demo/smokeA2Integration.ts work/p2b-native --historical-topology --time-corrections
node --import tsx script/demo/smokeA2Integration.ts work/p2b-g0-native --historical-topology --production-scope
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` permite usar Chromium del sistema. El runner sólo admite servicios propios en loopback; crea/elimina PostgreSQL, Auth y PostgREST con credenciales efímeras. El workflow `Live day execution` incorpora este gate y publica JSON/capturas, excluyendo logs privados.

Pendiente de integración: aplicar 097 mediante el proceso autorizado junto al backend y clientes que envían versión. La nueva API exige ese despliegue coordinado. No se accedió al Supabase conectado, no se aplicaron migraciones remotas, no se publicó y no se hizo merge. Realtime/WebSocket y una nueva generación Full A2 quedan fuera del gate proporcional de esta unidad.
