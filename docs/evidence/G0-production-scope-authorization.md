# G0 — autoridad nominal de Producción

Base verificada: `015eb9c281e423e90e8645adafe1904770571f23`, tanto main como `codex/ops-g0-production-scope-authorization` al arrancar. [Resultados y hashes verificables](G0-production-scope-authorization.json).

## Diagnóstico causal reproducible

La hipótesis se confirma. `093.execution_task_scope` seleccionaba por persona/plan/ámbito sin exigir `plan_staff_assignments.staff_role='production'`. El rol global `aux` convertía ese ámbito en autoridad mediante `execution_task_authorized`. `execution_context.hasScope` repetía la omisión. `094` reutiliza el predicado en consultas, comandos y RLS de incidencias.

Se añadió primero la distinción `staff_role` al fixture (antes omitida) y un test de denegación. Sin corregir SQL, falló: `hasScope=true`, esperado `false`. El test histórico permanente aplica exclusivamente 093/094: una identidad aux con vínculo primario a una persona activa, asignada sólo a Redacción, ejecuta Start/Finish, deja la tarea done, persiste dos eventos y crea una incidencia con su evento. La misma configuración con 096 queda sin ámbito/autoridad y recibe 403; las tablas e históricos permanecen intactos.

Los tests están en `server/liveExecution.spec.ts` y `server/incidents.spec.ts`, con fixture compartido `server/fixtures/executionDatabase.ts`. La reproducción histórica está aislada mediante `scopeFix:false`; las regresiones ordinarias aplican siempre 096.

## Delta y autoridades conservadas

La única modificación productiva es `096_production_execution_scope.sql`, creada con CLI 2.81.3 y normalizada a la secuencia NNN del repositorio. No se reescribe ninguna migración integrada.

- `execution_task_scope`: añade exclusivamente `a.staff_role='production'` a la rama staff. Conserva persona activa, vínculo primario, plan, modos zona/espacio, ausencia de herencia en modo espacios y rama independiente de recursos nominales.
- `execution_context.hasScope`: deriva de la existencia de alguna tarea en el mismo predicado efectivo que `tasks[].inScope`. Una asignación editorial, dormida por modo o un recurso sin tarea efectiva ya no afirma ámbito operativo. `hasAuthority/canExecute` conservan el contrato existente de rol global y readiness.
- Admin/Producción globales mantienen su autoridad aunque no tengan vínculo nominal. El rol global `aux` y la clasificación Producción/Redacción de la asignación siguen siendo autoridades distintas. El catálogo `staff_people.role_type` no sustituye al rol efectivo de la asignación.
- Ambas funciones siguen siendo invoker, con `search_path=''` y EXECUTE exclusivo de service_role. La sustitución es compatible e idempotente; se comprobaron ACL y propiedades antes/después de reaplicarla.

No hay cambios productivos de API, interfaz, solver, Stages, planning, asignaciones/configuración del día ni horas reales. Los cambios en asignaciones, modos y recursos durante el ensayo son fixtures en una base local descartable.

## Efecto en War Room

`incident_visible`, `incident_manageable`, `incident_query` (canCreate/canReport/canManage), `incident_command` y `incident_private.visible` pasan a usar el alcance corregido automáticamente. Se comprueban listado, detalle, histórico y RLS real por PostgREST, además de crear/editar/escalar/resolver/reabrir. Un aux sólo editorial pierde la capacidad accidental de gestionar y ver incidencias de ese ámbito. Conserva las consultas informativas permitidas por la API; viewer mantiene lectura global y ninguna escritura. Los registros históricos existentes no se borran.

## Validación

| Gate | Resultado |
|---|---|
| Ejecución/autorización/incidencias focales | 16/16 PASS |
| Secuencia y comprobación de migraciones | PASS, 73 archivos históricos y 071–096 |
| Ledger completo en PostgreSQL 17.11 | PASS, sin modificar SQL previo |
| TypeScript de producto y del ensayo nuevo | PASS |
| Build Vite/esbuild | PASS; avisos existentes de bundle/Browserslist |
| Auth real → HTTP producto → PostgREST → PostgreSQL | PASS |
| Regresión planning/snapshots/workflow/Control Room | 48/48 PASS, incluido primer Stage A2 generado dos veces con fingerprint idéntico |
| A2 aceptado: 266 placements, Stages/Draft, planes y reloj | Preservación literal PASS |
| Otros días de la base descartable | Preservación literal PASS |

Matriz positiva por HTTP: plató completo, varios espacios, varios platós para una persona, dos ayudantes con ámbitos solapados, Admin/Producción globales y recurso nominal legítimo. Para cada uno se ejecuta Start/Finish y el ciclo completo de incidencias. Redacción junto a un recurso nominal legítimo conserva la autoridad independiente de ese recurso.

Matriz negativa: aux sin vínculo, sólo editorial, otro espacio, ámbito revocado, modo espacios con asignación sólo por plató y viewer incluso con asignación nominal. Los tests SQL añaden persona inactiva y vínculo no primario. Se intentan falsificar actor/rol por HTTP, retarget de incidencia a otra tarea y llamadas RPC directas desde authenticated. Cada denegación compara tareas, locks e históricos de ejecución/incidencias antes/después.

Concurrencia nativa: Start, Finish y edición de incidencia con dos identidades solapadas devuelven 200+409 y un único evento por versión/transición. Para revocación se retiene el lock del plan, se verifica mediante `pg_stat_activity` que la RPC está esperando, se borra la asignación y se libera el lock: ejecución e incidencias rechazan con 403 sin persistir, aunque el precheck HTTP de ejecución hubiera pasado.

Fallos inyectados en PostgreSQL: inserción de eventos de ejecución, locks y eventos de incidencia produce 503 y rollback íntegro, incluida actualización de incidencia. No se confirma un éxito parcial.

La copia aceptada procede de `script/demo/fixtures/a2-legacy-import.json.gz`: 266 tareas, S0–S10, fingerprint `a58fc840fa4b8d04049c96d8310eac6e5d4df66f08069d968fe7a5e0adf9e2dc`. El JSON registra el hash de la fuente, migraciones e implementación. Este gate certifica preservación del planning aceptado; no se atribuye a una nueva generación completa del solver.

## Reproducción

```sh
node --import tsx --test --test-concurrency=1 server/liveExecution.spec.ts server/incidents.spec.ts server/apiAuthorization.spec.ts
node --import tsx --test --test-concurrency=1 server/assistedPlanningWorkflow.spec.ts server/assistedPlanningSnapshot.spec.ts server/assistedManualSnapshotFidelity.spec.ts server/benchmarks/runA2Assist8Evidence.spec.ts client/src/lib/control-room-metrics.test.ts
npm run check:migrations
node --test script/check-migration-sequence.test.mjs
npm run check
npm run build
node --import tsx script/demo/smokeA2Integration.ts work/g0-production-scope --historical-topology --production-scope
```

La última orden necesita Docker y crea/elimina PostgreSQL, GoTrue y PostgREST propios con credenciales efímeras y hosts loopback; no acepta destino remoto. La CI `Live day execution` incorpora el gate G0 y publica su JSON, además de conservar el ensayo existente con navegadores. La certificación local usa Node 24.19.0; la CI usa Node 20.

## Límites

La migración queda pendiente de aplicar en el entorno conectado conforme al proceso de integración; por instrucción no se accedió a esa base ni se ejecutaron advisors remotos. No se publica Replit ni se hace merge. Realtime/WebSocket y una nueva generación A2 completa quedan fuera de esta certificación de autorización; el ensayo verifica la frontera mediante HTTP/Auth/RLS reales y preservación del snapshot aceptado.
