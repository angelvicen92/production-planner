# P4 — Mi Día: matriz simultánea y filtros reales

Base: `f1f085ff9c5a93c012a3c5c7d9136259c4755a93`. Rama: `codex/ops-p4-mi-dia-matrix-filters`.

## Causa y resultado

La base elegía `waiting.find(canExecute) ?? waiting[0]` y mostraba pendientes sólo cuando no había tareas en curso. Tres tareas de las 09:00 quedaban reducidas a una; después de las 09:00 conservaba «PRÓXIMA ACTIVIDAD PENDIENTE». Los botones de estado sólo ejecutaban `scrollIntoView`, y el selector de ubicación dependía de `hasScope && onlyMine`.

El navegador de comparación carga los dos archivos originales mediante un overlay de Vite, con las mismas respuestas de ensayo: reproduce una sola tarjeta para las tres pendientes de las 09:00 y ninguna pendiente destacada cuando hay tareas en curso. [Antes, móvil](P4-mi-dia/before-singular-mobile.png) y [antes, tablet](P4-mi-dia/before-singular-tablet.png).

La nueva proyección conserva todas las tareas en curso, todas las franjas retrasadas y todas las tareas de la primera franja actual/futura simultáneamente. No selecciona por permiso, identidad o posición. Los empates usan el mismo instante previsto; el ID sólo desempata el orden de tarjetas. Las retrasadas se despliegan de doce en doce con conteo total y restantes explícitos; toda la agenda sigue disponible. [Después, tablet](P4-mi-dia/late-tablet.png).

`plannedInstant` y `madridDate` existentes aportan fecha completa, Europe/Madrid y rechazo de horas DST ambiguas/inexistentes. A las 09:00 exactas las tres pendientes siguen en Próximas; a las 09:00:01 son tres retrasadas con un segundo de retraso. Sin planning aceptado comparable, fecha, horario, reloj con timestamps completos o conexión, no se afirma retraso ni se fabrica una franja próxima. Las pendientes no comparables se cuentan expresamente y permanecen en la agenda. Las señales P2A y la duración compartida siguen disponibles; `ActivityInformation` se reutiliza en el detalle expandible.

Todas es el estado inicial. En curso, Pendientes, Completadas e Interrumpidas/canceladas filtran tanto la matriz como la agenda, con `aria-pressed` y vacío/restablecimiento explícitos. Los contadores se calculan tras ámbito/ubicación/búsqueda y antes del estado. La agenda ordena las pendientes por placement, conserva los estados interrumpidos/cancelados y deja completadas al final. No hay scroll al filtrar ni tras polling; un fragmento explícito de actividad se atiende una sola vez al cargar la jornada.

La concentración visual utiliza tareas y snapshot espacial diario. Producción/Admin global dispone de Toda la jornada, plató/zona y espacio sin fabricar ámbito nominal. Aux mantiene por defecto Sólo mi ámbito asignado y la intersección exacta de `execution_context.tasks[].inScope`; consultar fuera de él no concede escritura. Viewer y aux sin ámbito conservan consulta sin controles de ejecución. El cambio de jornada reinicia estado, búsqueda, ubicación y ámbito personal.

Start/Finish conserva la mutación del servidor, `expectedStatus`, `expectedVersion`, bloqueo de doble envío, reconciliación, errores y ausencia de éxito optimista. La rectificación P3 y su historial conservan el componente y contrato originales. No hay cambios de servidor, SQL, RPC, API, RLS, roles, modelos, motor, Assisted, Planner Next, snapshots, configuración ni otras vistas.

## Pruebas

Los resultados y hashes verificables se registran en [P4-mi-dia-operational-matrix.json](P4-mi-dia-operational-matrix.json) y [P4-mi-dia/](P4-mi-dia/).

Resultado final local: **TypeScript, build y secuencia de migraciones PASS; 34/34 focales; 41/41 gate de ejecución; 8/8 escenarios P4; 4/4 escenarios P3; tres gates nativos PASS**, cada uno con las 100 migraciones. La comparación visual de la base también pasa. Los tres informes preservan 266 obligaciones, once Stages y las otras 333 obligaciones de ensayo. Los locks preexistentes se conservan; Start/Finish mantiene únicamente las escrituras de ejecución y locks auditados ya autorizadas por el backend.

Las pruebas puras cubren tres pendientes a las 08:59, 09:00, 09:00:01 y 09:01; franjas retrasadas/futuras coexistentes; varias en curso; distintos espacios/personas; horarios ausentes; otra fecha; DST; determinismo e inputs inmutables. El ensayo UI cubre cinco filtros, búsqueda, contadores, ámbito global y dos ámbitos nominales, viewer/sin autoridad, jornada, Start/Finish desde ambas vistas, rectificación, doble envío, 400/403/409/503, offline, error de lectura, expansión y reloj manual. Viewports: 390×844 y 820×1180; navegador en America/New_York para comprobar independencia del dispositivo.

Se ejecutan los gates existentes de Live day execution: autorización HTTP, SQL/PGlite de ejecución/rectificaciones/incidencias, workflow Assisted y los tres ensayos nativos G0, rectificaciones P2B/P3 y snapshot aceptado. Los servicios nativos son PostgreSQL/PostgREST/GoTrue locales descartables con Auth real y dos navegadores. Sus informes públicos excluyen logs privados y credenciales.

La instalación inicial estaba incompleta; se reconstruyó con `npm ci --cache work/npm-cache`, sin modificar el lockfile. Un primer intento de los tests HTTP falló por `listen EPERM` en el sandbox; se ejecutó de nuevo con red local habilitada. El primer ensayo P4 esperaba el texto del fixture para 403; se corrigió para esperar la traducción común real de `apiRequest`. Hubo timeouts de navegación en frío y una interrupción del diálogo P3 durante HMR; el candidato estable se verifica sin ediciones concurrentes. No se cambió código productivo para eludir esas comprobaciones.

## Reproducción

Node 24 local (`--test-isolation=none`); CI usa Node 20 sin esa opción. Dependencias del lockfile, Docker y Chromium:

```sh
npm run check
npm run build
npm run check:migrations
node --import tsx --test --test-concurrency=1 client/src/lib/my-day-operational.test.ts client/src/lib/my-day-temporal.test.ts client/src/lib/execution-time-correction.test.ts client/src/lib/execution-precondition.test.ts client/src/components/my-day/activity-information.test.tsx client/src/components/my-day/temporal-signal.test.tsx
node --import tsx --test --test-concurrency=1 server/liveExecution.spec.ts server/executionTimeCorrections.spec.ts client/src/lib/execution-precondition.test.ts server/incidents.spec.ts server/apiAuthorization.spec.ts server/assistedPlanningWorkflow.spec.ts
node client/src/components/my-day/p4.browser.mjs
node client/src/components/my-day/p3.browser.mjs
node --import tsx script/demo/smokeA2Integration.ts work/p4-native-scope --historical-topology --production-scope
node --import tsx script/demo/smokeA2Integration.ts work/p4-native-corrections --historical-topology --time-corrections
node --import tsx script/demo/smokeA2Integration.ts work/p4-native-execution --historical-topology --live-execution-snapshot
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` selecciona Chromium del sistema. El workflow de ejecución incorpora la proyección y el ensayo P4, manteniendo sus gates previos.

## Preservación y límites

Se certifica la copia histórica A2 aceptada de 266 obligaciones y once Stages, con planning, recursos, locks, Draft y otros días conservados literalmente. Esto es preservación de un snapshot aceptado, no una nueva generación Full A2 del solver. El ensayo UI interceptado usa esas 266 identidades con horarios/nombres sintéticos declarados; no acredita por sí mismo Auth/RLS. Los gates nativos independientes sí verifican las autoridades reales.

La actualización certificada es polling HTTP; Realtime/WebSocket no se certifica en los servicios descartables existentes. Los avisos de Browserslist y tamaño de bundle ya existían. No se accede a Supabase real para escrituras, no se publica Replit y no se hace merge.

Deuda separada: las limitaciones actuales de asignación nominal de equipos Reality/itinerantes permanecen fuera de este delta. Un filtro de ubicación no sustituye una asignación ni demuestra autoridad de los miembros de un equipo.
