# Assisted: vistas, ordenación e Historial

Base comprobada: main `bace4aa4098e499ce3caa61d940ae2ccbbe86195`, PR #1109. El checkout contiene `shared/assistedAutopilot.ts` y «Completar automáticamente».

## Causa y delta

Assisted recibía las opciones visuales, pero sus selectores/filtros pertenecían a la rama Legacy. La ordenación de `PlanningTimeline` también estaba oculta y su clic competía con drag al forzar modo manual. Historial mostraba aceptación sin distinguir generación.

Se extraen los mismos selectores y filtros como JSX compartido en `plan-details.tsx`, se entregan al workspace y se mantiene el renderizador existente. El control de ordenación se comparte, conserva todas las tareas y toma prioridad sobre los eventos de edición mientras está activado. La comparación por primera hora de la plantilla y nombre sigue siendo exclusivamente visual.

`GET /api/plans/:id/assisted/history/timings` conserva la autenticación y los roles de lectura, comprueba acceso al plan y limita stages/runs al plan y sesión activa. Lee sólo ID y metadatos temporales en consultas compactas. No carga snapshots ni Evidence de runs. El cliente lo consulta únicamente al abrir Historial.

Generación usa `started_at → finished_at`; Solicitud a aceptación usa `created_at → accepted_at` e incluye aplicación, validación, aceptación y posible espera humana. No representa el tiempo puro del motor ni una medición desde el primer clic. Stage 0, runs ausentes y fechas inválidas o incoherentes producen «No disponible», sin reconstrucción ni persistencia nueva.

## Verificación

- 108 tests relevantes pasan: timestamps, cronología, Stage 0, renderer de métricas, consulta compacta, permisos HTTP, sort estable con tareas ausentes, retorno al nombre, draft drag, workspace, Autopilot y workflow/proposal existentes.
- 26 tests de importación A2 pasan (`npm run test:demo:a2-import`).
- `npm run check`, `npm run build`, `npm run check:migrations`, TypeScript de integración y `git diff --check` pasan.
- Integración completa: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run demo:a2:smoke -- work/a2-views-history-verified --full`.
- PostgreSQL/GoTrue/PostgREST/Auth/HTTP/Chromium reales y locales; S0→S10 generados, aceptados, persistidos y recargados, sin seed resuelto ni intercepción de propuestas. Validación canónica 266/266 y ocho comidas operativas.
- S10: 266 IDs de tarea en concursantes, tras clic real en IN/Croma/Ensayo, al volver al nombre y en espacios Timeline/Lista. El clic de navegador despacha pointerdown/up/click en `assisted-draft`: cero movimientos pendientes y edición deshabilitada.
- Recursos: 72 IDs de tarea con recursos seleccionados, exactamente los mismos que Legacy; las 266 tareas reaparecen al volver a concursantes.
- Historial: intervalos y timestamps coinciden con SQL; Stage 0 sin métricas; una consulta por apertura; roles anon 401, sin rol 403, viewer/aux/production/admin 200; plan inexistente 404 e ID inválido 400.
- Las acciones visuales sólo envían lecturas. Material SQL de tareas, locks, sesiones, stages, validaciones, runs, revisiones y excepciones permanece idéntico; mismo Draft y fingerprint.

Resultados y hashes del runtime: [ASSISTED-VIEWS-HISTORY.json](ASSISTED-VIEWS-HISTORY.json). El workflow existente ejecuta los nuevos tests y publica el artefacto `views-history.json`, junto al gate A2 completo con órdenes alternativas y Autopilot.

## Límites y protecciones

El catálogo desechable de A2 carecía de índices de orden visual. La prueba configura exclusivamente esos índices antes de la auditoría y los restaura al finalizar. Legacy conserva su regla de ocultar los grupos sin orden configurado. Recursos conserva su filtrado; no se inventan asignaciones para tareas sin recursos.

No se escribió ni probó en Supabase conectado o en el runtime de producción. La validación nativa de órdenes alternativas y Autopilot corresponde al gate estándar de CI; las suites focales y la integración S10 anterior se ejecutaron localmente.

No hay cambios de migraciones, asignaciones físicas, motor, construcción, búsqueda, matching, Future Feasibility, budgets, validadores ni lógica de Autopilot. Un único PR contra main, sin merge.
