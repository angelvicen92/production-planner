# P3 — rectificación auditada desde Mi Día

Base: `04bd38a33c6d5666651bd509d1838cea6bc787b6` (PR #1150). Rama remota: `codex/ops-p3-mi-dia-audited-time-ui`.

## Causa y cambio

P2B ya persistía rectificaciones auditadas, pero un ayudante no podía solicitarlas desde Mi Día. `Corregir hora` abre ahora un único diálogo desde la tarjeta principal y desde la agenda, incluidas actividades completadas. La elegibilidad requiere timestamps completos, versión observada y `hasAuthority` del contexto existente. Redacción sin autoridad y Viewer no reciben controles de escritura. `canExecute` no decide la autoridad de rectificación: el contexto integrado también incorpora readiness del planning en ese indicador.

Se reutilizan sin cambios `PATCH /api/tasks/:id/real-time`, `GET /api/tasks/:id/execution-history`, la autorización nominal y la transacción de 097. No hay backend, migraciones, estados, permisos ni fórmulas de duración nuevos. La fecha es la de la jornada; la entrada conserva segundos y la conversión enumera los offsets de Madrid y exige round-trip exacto. Horas inexistentes y ambiguas se bloquean expresamente. No se fabrica un instante a partir de un HH:mm legacy.

El formulario captura la tarea mostrada al abrirse. Un polling posterior no sustituye `expectedVersion`; tampoco lo hace la consulta del historial. Un ref evita doble envío. Tras 409 se actualizan las consultas y se exige **Usar datos actuales**, revisar y confirmar de nuevo. No hay retry ni marcas optimistas. Los errores 400/403/503 y offline son explícitos. El éxito requiere una respuesta confirmada con tarea, versión y hora concordantes, seguida de invalidación de tareas/plan/ejecución.

Las fracciones del timestamp original no se redondean por introducir sólo un motivo: una hora igual al segundo mostrado sigue siendo un no-op. La duración, desviaciones y semáforos P2A se derivan de las mismas lecturas/fórmulas existentes. Start/Finish conservan su flujo.

El historial se consulta al solicitarlo, sin polling por tarea. Distingue `old_value/new_value` (horas operativas) de `created_at` (registro de la corrección) y filtra sólo `time_correction`; Start/Finish permanecen como hechos originales. El endpoint aporta `changed_by`, no un nombre fiable: se muestra la cuenta registrada sin atribuir nombres.

## Evidence y gates

Los resultados verificables, hashes del código, ledger y capturas están en [P3-mi-dia-audited-time-ui.json](P3-mi-dia-audited-time-ui.json) y [P3-time-ui/](P3-time-ui/).

| Caso | Prueba |
|---|---|
| Inicio en curso, inicio/fin completados y rectificación sucesiva | Ensayo nativo, formulario real y auditoría SQL |
| Motivo obligatorio, no-op, segundos/fracciones y envío único | Chromium focal y ensayo nativo |
| Cronología imposible, pausas/interrupciones y rollback | Suites SQL P2B y ensayo nativo existente |
| Timestamp incompleto y fecha ausente | Unitarias y Chromium focal |
| Sin permiso, Redacción y Viewer | Unitarias, HTTP/G0, Chromium y SQL nativo |
| Autoridad nominal en dos espacios y tareas completadas | Contexto y controles de Mi Día sobre Auth/HTTP reales |
| Versión cambiada tras abrir y tras polling | Chromium focal; dos navegadores nativos |
| 409, refresco y reconfirmación explícita | HTTP real desde ambos navegadores |
| 400/403/503, offline y fallo de historial | Chromium focal sin éxito ni marcas ficticias |
| Zona del dispositivo y DST normal/inexistente/ambiguo | Unitarias y navegador en America/New_York |
| Historial íntegro al reabrir, con marcas originales conservadas | HTTP/SQL y recarga de Mi Día |
| Concordancia con Control Room y Start/Finish | Navegadores reales tras recarga |

El ensayo amplía `smokeExecutionTimeCorrections.ts` dentro del runner existente: GoTrue → HTTP producto → PostgREST → PostgreSQL descartable, ledger completo incluida 097, identidades y dos sesiones de Chromium reales. Comprueba locks antes/después de cada rectificación UI, conservación literal de planning/Stages/Draft y las 266 obligaciones del A2 aceptado. No crea infraestructura de autenticación paralela. Los tres ensayos nativos de ejecución (P2B/P3, G0 y snapshot) han pasado. La copia aceptada completa acredita preservación, no una generación Full A2 nueva.

Validación final: **33/33 focales**, TypeScript del producto y del ensayo, build, UI y los tres ensayos nativos correctos. La regresión inicial dio **47/48** al ejecutarse junto a otras cargas: `A2-ASSIST-8 product request/run/apply accepts the canonical first stage` obtuvo 0 obligaciones frente a 19 (dos runs, 561,4 s). El mismo test del candidato, ejecutado después de forma aislada, pasa **2/2**: acepta 19 obligaciones y compara dos fingerprints idénticos (219,4 s). Quedan verificadas las 48 condiciones de regresión; el primer intento fallido se conserva en `regression.log`, y la repetición en `a2-isolated.log`.

La comparación adicional usa un checkout limpio de `04bd38a…` y las mismas dependencias/Node 20: acepta 19 obligaciones, 22.053 ramas y fingerprint `bb27f392bc55684dc45cc5d8813bc21686cb15ad0f65897374cc4aacc7d5f1d6` en 103,6 s. `BLOCKED` es el estado esperado del probe `stopAfterFirstProposal`: quedan 247 obligaciones fuera de ese único Stage, sin blocker causal. Motor, fixtures A2, servicios Assisted, contratos y migraciones son idénticos a la base. Estos resultados no establecen una causa concluyente del primer fallo; no se ha cambiado el planificador ni su gate para cerrar P3.

## Reproducción

Node 20, dependencias del lockfile, Docker y Chromium:

```sh
node --import tsx --test --test-reporter=spec --test-concurrency=1 client/src/lib/execution-time-correction.test.ts client/src/lib/my-day-temporal.test.ts client/src/lib/execution-precondition.test.ts server/executionTimeCorrections.spec.ts server/liveExecution.spec.ts server/incidents.spec.ts server/apiAuthorization.spec.ts
node --import tsx --test --test-reporter=spec --test-concurrency=1 server/assistedPlanningWorkflow.spec.ts server/assistedPlanningSnapshot.spec.ts server/assistedManualSnapshotFidelity.spec.ts server/benchmarks/runA2Assist8Evidence.spec.ts client/src/lib/control-room-metrics.test.ts
node client/src/components/my-day/p3.browser.mjs
npm run check
npm run build
node --import tsx script/demo/smokeA2Integration.ts work/p3-native --historical-topology --time-corrections
node --import tsx script/demo/smokeA2Integration.ts work/p3-g0 --historical-topology --production-scope
node --import tsx script/demo/smokeA2Integration.ts work/p3-execution --historical-topology --live-execution-snapshot
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` permite Chromium del sistema. El workflow `Live day execution` incorpora el nuevo gate visual, sus rutas de activación y artefactos públicos; mantiene los ensayos nativos G0/ejecución existentes.

## Límites

Las horas repetidas por DST se impiden guardar: esta unidad no añade una elección de ocurrencia. El autor se identifica por su cuenta cuando no hay un nombre fiable en la respuesta. Se certifica HTTP/polling; Realtime/WebSocket y una nueva generación Full A2 quedan fuera del gate proporcional. Los avisos de Browserslist y tamaño de bundle ya existían.

No se modificó el Supabase conectado, no se desplegó en Replit y no se hizo merge.
