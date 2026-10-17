# Autopilot en Planning maximizado

Base autorizada: `codex/autopilot-demo-workspace` / `9fe046af69f6937e16238c03c4a426e842d58789` (#1143 integrado).

## Diagnóstico causal

La cabecera estaba fuera de `PlanningWorkspaceLayout`, por lo que el contenedor fijo de «Maximizar conjunto» la ocultaba. Cada evento de Autopilot invalidaba Assisted, aunque sus lecturas intermedias podían contener un Draft aplicado y todavía no aceptado. El plan consolidado sólo se refrescaba al terminar y el timeline no recibía `readOnly` durante Autopilot.

Otra causa observada en la integración fue el desmontaje de toda la página ante un error recuperable de la consulta del plan, incluso con datos en caché. Ese desmontaje ejecutaba `dispose()` del controlador mientras el run podía finalizar correctamente en el servidor sin llegar a aceptarse en el cliente.

## Cambio

El layout recibe un único `header`, renderizado en el mismo árbol tanto en modo normal como maximizado. Un contador de inicio confirmado solicita la maximización existente una sola vez; Esc y restaurar sólo cambian su estado local. Vistas, orden, proporción, filtros, densidad y geometría permanecen en los componentes retenidos existentes.

`observeAutopilotCheckpoints` conserva las lecturas que ya hace el controlador. Publica en React Query el par estado/plan únicamente cuando el controlador emite `READING` o `VERIFYING` después de verificar persistencia; deduplica por identidad de Stage. No hace peticiones. Las lecturas de aplicación/validación no se publican. El mismo evento actualiza el snapshot presentado y el progreso, sin invalidaciones por mensajes de polling.

Durante la ejecución, el timeline consulta el checkpoint verificado, recibe `readOnly` y no recibe callbacks de movimientos o cambios de estado. Las operaciones Assisted conservan su protección por el controlador y `busy`. El estado de maximización no depende de `busy` ni de las fases, así que parar, fallar o completar no restaura ni vuelve a maximizar automáticamente.

`plan-details.tsx` mantiene el árbol Assisted cuando una consulta de fondo falla de forma recuperable y ya hay plan en caché; muestra un estado de reconexión sin destruir el controlador ni las vistas. La pantalla de carga sigue sirviendo a una apertura sin datos.

Se reutilizan `AssistedAutopilotProgress` y su proyector, con una sola barra global. La presentación se compacta en móvil, y el conjunto permite desplazar paneles con altura útil cuando varias vistas no caben. El detalle técnico sigue disponible en el desplegable y, si hace falta, mediante el scroll de la cabecera.

## Validación reproducible

```sh
npm run check
npx --no-install tsc -p script/demo/tsconfig.integration.json
npm run build
npm run check:migrations
node --import tsx --test \
  client/src/lib/assisted-autopilot-checkpoints.test.ts \
  client/src/lib/assisted-autopilot-progress.test.ts \
  client/src/components/planning/assisted-autopilot-progress.test.tsx \
  client/src/components/planning/assisted-planning-workspace.test.ts \
  shared/assistedAutopilot.test.ts \
  client/src/lib/planning-workspace-geometry.test.ts \
  client/src/lib/planning-workspace-preferences.test.ts \
  client/src/lib/assisted-planning-view.test.ts \
  client/src/components/planning-timeline-assisted-drag.test.ts \
  client/src/lib/planning-space-presentation.test.ts \
  client/src/components/planning/space-task-content.test.tsx \
  client/src/lib/planning-view-policy.test.ts \
  client/src/lib/planning-recovery.test.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --import tsx script/demo/smokeA2Integration.ts \
  work/autopilot-delivery --historical-topology --autopilot-workspace
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --import tsx script/demo/smokeA2Integration.ts \
  work/autopilot-viewport --historical-topology --planning-navigation --planning-viewport --viewport-only
```

La matriz de viewport se ejecuta en un checkout descartable del candidato con caché Vite independiente y hashes de los archivos productivos cotejados con el checkout principal.

Los 83 tests focales, TypeScript de producto y harness, build y secuencia de migraciones pasan. Los avisos de tamaño de bundle permanecen. La dependencia de tests `@electric-sql/pglite`, ya declarada, se instaló localmente; package.json y el lockfile permanecen intactos.

La integración usa PostgreSQL, GoTrue, PostgREST, servidor HTTP de producto y Chromium reales en contenedores locales descartables. No intercepta HTTP, no sustituye RPC y no usa horarios resueltos como semilla del nuevo día. El ID 27002 del harness pertenece exclusivamente a esa base local recién creada: no es la jornada 27002 remota. No se accedió a las jornadas reales 27002/27003. Escrituras remotas: cero.

La prueba confirma cancelación de consentimiento sin maximización/escrituras, entrada confirmada, barra única sobre las vistas, preferencias preservadas, Esc sin detener ni reentrar, checkpoints progresivos cotejados con SQL, ausencia de controles manuales, móvil, parada entre etapas, reanudación y 100% real conservando la maximización. La captura móvil usa el zoom configurado y desplaza el planning hasta una tarea aceptada, sin cambiar el encuadre.

Las pruebas unitarias del controlador y el proyector cubren progreso durante generación/validación, aceptación no verificada, errores y parada. La prueba de Chromium añade un caso separado y explícitamente simulado: asigna un `AbortError` a la consulta React Query conservando sus datos, comprueba la identidad del DOM retenido y exige que después se completen los Stages por HTTP real. No intercepta peticiones ni modifica respuestas del servidor. Los demás casos unitarios no se presentan como inyección de fallos HTTP en la integración real.

## Regresión heredada y límites

El recorrido completo antiguo `--planning-navigation --planning-viewport` falla en `sticky zone heading: -113 != 207`, tanto en este candidato como en la base exacta `9fe046a`, con el mismo Chromium y fixture. El delta no cambia la autoridad de cabeceras adhesivas. Se conserva el contraste en `ui01b-baseline-comparison.json`; la matriz focal de viewport se ejecuta con `--viewport-only`, opción documentada en UI-01B que ahora tiene entrada explícita en el harness.

La matriz focal también detecta deriva en `two-horizontal/start-250/spaces`: `[[10,13.19],[10,10],[10,10],[10,10],[10,10]]`, idéntica en candidato y base. Los grupos que parten de 25% y 100% pasan antes de ese fallo. No se declara verde la matriz completa ni se modifica Ajustar en esta unidad.

La jornada canónica descartable termina en S11; no reproduce ni modifica el historial S12 de la jornada real 27003. La prueba local no certifica el navegador ni el despliegue remoto de producción. La CI incorpora un job específico `autopilot-workspace`; su resultado alojado debe consultarse en el PR.

Clasificación: `CONFIG_NEUTRAL`, cambio de presentación y sincronización de caché. Sin modificaciones de motor, búsqueda, budgets, validación, aceptación, endpoints, contratos compartidos, DB, RLS ni configuración operativa. Sin merge ni publicación en Replit.

## Resultados y archivos

Integración final: **PASS**, con hashes de 79 archivos idénticos entre inicio, final y checkout entregado. Se cotejan también las listas completas de IDs dibujados y aceptados en cada checkpoint registrado.

| Etapa | Tareas confirmadas | IDs dibujados cotejados con SQL |
|---|---:|---:|
| S1 | 19/266 | 19 |
| S2 | 38/266 | 38 |
| S3 | 46/266 | 46 |

Parada: S4, 65/266. Reanudación y finalización: S11, 266/266 y 100%, manteniendo maximización.

- [Prueba integrada y hashes](integration-proof.json).
- [Comparación de los dos fallos UI-01B con la base](ui01b-baseline-comparison.json).
- [Escritorio con barra y tareas](desktop.png).
- [Móvil con barra y tareas](mobile.png).
- [Finalización maximizada](complete.png).

Archivos de código, pruebas y CI modificados:

- `.github/workflows/planner-engine-ci.yml`
- `client/src/components/planning/assisted-autopilot-progress.tsx`
- `client/src/components/planning/assisted-planning-workspace.test.ts`
- `client/src/components/planning/assisted-planning-workspace.tsx`
- `client/src/components/planning/planning-workspace-layout.tsx`
- `client/src/index.css`
- `client/src/lib/assisted-autopilot.ts`
- `client/src/pages/plan-details.tsx`
- `script/demo/smokeA2Integration.ts`
- `script/demo/smokePlanningNavigation.ts`
- `client/src/lib/assisted-autopilot-checkpoints.test.ts`
- `script/demo/smokeAutopilotWorkspace.ts`
