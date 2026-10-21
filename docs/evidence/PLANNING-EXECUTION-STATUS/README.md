# Estados de ejecución en el planning

21 de octubre de 2026. Base autorizada: `c7959c328eb2f4d53d938e4eea9f4eec71db21b7`.

## Cambio y autoridad

Las cinco variantes de tarjeta comparten ahora indicador, nombre accesible y tooltip de estado: timeline horizontal de concursantes, espacios físicos, agenda itinerante, tareas sin ubicación y listas de recursos. Las columnas de espacios incluyen su modo de lista compacta. La misma presentación se conserva en densidad PDF e impresión.

- `pending`: aspecto original, sin icono adicional.
- `in_progress`: contorno verde e icono de actividad estático.
- `done`: fondo suavizado, texto sin atenuación y tic verde.
- `interrupted`: contorno ámbar y pausa.
- `cancelled`: contorno neutral y aspa, sin confundirlo con una tarea sin horario.

El color primario/secundario de la actividad sigue siendo el fondo de cada tarjeta. Una leyenda compacta se incluye en el contenido capturable del planning y se ajusta al ancho móvil. Los indicadores no capturan eventos de puntero. Los menús, selección, drag y locks continúan en el componente existente.

Sólo se leen los estados recibidos de las filas efectivas de `daily_tasks` en la vista aceptada. No hay inferencias desde el reloj ni los horarios. Draft y propuestas no reciben estos indicadores; la vista previa V4 los suprime explícitamente al mostrar un plan proyectado. Comidas operativas, descansos sintéticos, bloqueos manuales y estados ausentes/desconocidos carecen de indicadores de ejecución. Esto también elimina la falsa apariencia de completado de los descansos legacy, cuyo `done` es sólo un detalle de su proyección visual.

No cambian estados, transiciones, permisos, APIs, SQL/RLS, eventos, horarios, snapshots, autoridad de ejecución ni motores. No se interviene en #1165. No se añade polling ni Realtime: el render se actualiza con las props que ya suministra el producto.

Contratos consultados: AGENTS.md; Fuente 00 v2.13; Fuente 07 v2.2 (gate proporcional); Fuente 01 v5.2 §§11, 9.2 y 10.2; Fuente 04 v2.7 §9 (`daily_tasks`, Draft y Stage).

## Capturas antes/después

Capturas del componente real con fixtures locales idénticos. La muestra de recursos muestra un concursante para que quepan los cinco estados; las assertions recorren además los otros concursantes/agendas.

| Vista | Antes | Después |
|---|---|---|
| Concursantes | [Antes](before-contestants.png) | [Después](after-contestants.png) |
| Espacios, itinerantes y sin ubicación | [Antes](before-spaces.png) | [Después](after-spaces.png) |
| Recursos | [Antes](before-resources.png) | [Después](after-resources.png) |

Adicionales: [lista compacta](after-spaces-list.png), [móvil 390px](after-mobile.png), [tema oscuro](after-dark.png), [impresión](after-print.png), densidad PDF de [concursantes](after-contestants-pdf.png), [espacios](after-spaces-pdf.png) y [recursos](after-resources-pdf.png).

## Validación

- `npm run check`: PASS.
- `npx tsc -p docs/evidence/PLANNING-EXECUTION-STATUS/tsconfig.json`: PASS; verifica también el harness de navegador.
- Tests focales: **41/41 PASS**, sin skips. Incluyen los tres tests nuevos de los cinco estados, exclusión de proyecciones y transiciones/reset, más los contratos existentes de colores/participantes, comidas operativas, recursos, geometría, cabeceras, vista de ejecución, precondiciones y drag Assisted.
- Prueba Chromium focal: PASS. Resultado completo en [browser.json](browser.json), capturas base en [baseline.json](baseline.json).
- `npm run build`: PASS, cliente y servidor; advertencia habitual de tamaño de bundle.
- `git diff --check`: PASS.

Comandos reproducibles desde la raíz:

```sh
npx tsx --test \
  client/src/components/planning/planning-execution-status.test.tsx \
  client/src/components/planning/space-task-content.test.tsx \
  client/src/lib/planning-space-presentation.test.ts \
  client/src/lib/assisted-planning-view.test.ts \
  client/src/components/planning-timeline-assisted-drag.test.ts \
  client/src/lib/planning-operational-meals.test.ts \
  client/src/lib/planning-view-policy.test.ts \
  client/src/lib/planning-workspace-geometry.test.ts \
  client/src/lib/planning-header.test.ts \
  client/src/lib/day-execution-view.test.ts \
  client/src/lib/execution-precondition.test.ts
node --import tsx script/demo/smokePlanningExecutionVisuals.ts --baseline --baseline-ref=c7959c328eb2f4d53d938e4eea9f4eec71db21b7
node --import tsx script/demo/smokePlanningExecutionVisuals.ts
```

El harness arranca Vite local y el `PlanningTimeline` real, usa Chromium disponible en `/usr/bin/chromium` (o `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`) y escribe temporales en `work/execution-visuals/`. Auth queda sustituida sólo dentro del harness; no hay credenciales ni conexiones a Supabase. Las dependencias faltantes del entorno se restauraron y el gate final se ejecutó con `npm ci --ignore-scripts`, sin cambios de manifiesto/lockfile.

El navegador verifica los cinco estados en las tres vistas, incluidas tareas físicas, itinerantes y sin ubicación; colores originales y opacidad de texto; descansos legacy y comidas proyectadas sin falsos indicadores; ausencia de estado conocido; exclusión de Draft y simulación; jornada completamente pendiente; iconos dentro de tarjetas de 5 minutos/10px; densidad PDF; menús Start, Finish, Interrupt y Cancel; reset recibido; menú por teclado y acción de lock; movimiento en Draft sin cambiar las filas fuente; viewport móvil sin desbordamiento de página; impresión; cero errores JS y cero escrituras HTTP operativas.

## Límites del gate

La prueba es de presentación con fixtures locales y actualizaciones observadas de la caché React Query, sin recarga durante las transiciones. No acredita el backend de transiciones/reset, RLS, SQL, Realtime entre sesiones ni una jornada remota. Esas autoridades y sus invalidaciones no se han modificado. La comprobación de geometría/datos demuestra que la decoración y sus menús conservan los horarios; el ensayo de drag modifica únicamente el borrador local del harness y conserva las filas originales.

Se aplica el gate proporcional de Fuente 07: no se ejecuta Full A2 ni una búsqueda de Planner Next para un diff de presentación. Sin merge ni despliegue.
