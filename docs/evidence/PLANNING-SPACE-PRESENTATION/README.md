# Planning por plató y espacio: concursantes y cabeceras

Base: `6837459a0034c7b8c7e6c447e6dfff8a982f177e` (`main`).

## Causa y decisión visual

Los tres renderers de tarjetas verticales (espacios/solo zona, itinerantes y sin
ubicación) priorizaban `taskDisplayName`; el concursante sólo estaba disponible
en el menú. En PDF/Lista, algunos metadatos sustituían la hora por el espacio.
Las cabeceras usaban fondos al 12/22 % y calculaban el texto sobre el color sin
transparencia, por lo que la identidad cromática y el contraste se perdían.

Ahora el nombre ocupa la primera línea. Debajo se conservan actividad y hora;
la hora tiene espacio reservado y la actividad se trunca primero. Si la altura
no permite dos líneas, se prioriza el nombre y el contenido completo permanece
en el texto de hover. No cambia la geometría. Sin concursante resoluble se usa
la actividad, sin inventar identidades. Las tareas conjuntas reutilizan únicamente
`plannerNextConfiguration.taskOperations[].jointGroupId`: cada nombre tiene una
parte del ancho y su propio truncado, conservando ambos participantes visibles.
No se fusionan tareas ni se alteran sus IDs.

El modelo actual configura color por zona/plató, no por espacio. Se reutiliza
`uiColor`/`ui_color` de la zona con fondo opaco. Si falta, se usa la paleta ya
presente en las tareas del espacio (`uiColorSecondary`, luego `uiColor`); la
cabecera del plató usa la misma autoridad entre sus tareas. El orden de fallback
es estable por plantilla/ID y excluye bloqueos manuales y pausas sintéticas. Un espacio vacío puede heredar el fallback de su
plató; sin ningún color existente se conserva la apariencia neutral. No se añade
configuración ni una paleta productiva nueva. El texto negro/blanco se elige por
contraste WCAG con el fondo real.

## Validación

- `npm run check`: PASS. El checkout carecía de PGlite; se restauró
  `@electric-sql/pglite@0.5.8`, ya declarado, sólo en `node_modules`. Sin cambios
  en `package.json` ni lockfile.
- `npm run build`: PASS. Avisos existentes sobre Browserslist y tamaño del bundle.
- Tests focales: PASS, cinco archivos:
  `planning-space-presentation.test.ts`, `space-task-content.test.tsx`,
  `planning-timeline-assisted-drag.test.ts`,
  `planning-workspace-geometry.test.ts`, `planning-view-policy.test.ts`.
- Chromium real, componentes `PlanningTimeline` y `FullscreenPlanningPanel`,
  snapshot histórico aceptado de 266 tareas de
  `script/demo/fixtures/a2-legacy-import.json.gz`. Se compararon el renderer base
  y el candidato con los mismos datos en Timeline/Lista × Normal/PDF: mismos
  266 IDs, inicios, posiciones y alturas en las cuatro combinaciones.
- Cabeceras opacas con contraste de texto >= 4.5:1; concursantes principales,
  horas visibles donde cabe la segunda línea y parejas explícitas comprobadas.
- Casos de presentación controlados: nombres largos, pareja con truncado
  independiente, tarea de cinco minutos, concursante nulo/no resoluble,
  itinerantes, solo zona y sin ubicación, fallback cromático, menú de tarjeta.
- Regresión visual: hideEmpty mantiene las 266 identidades; maximizar, zoom Y,
  scroll en ambos ejes, cabecera sticky, móvil 390 px sin desborde del documento,
  y drag manual de concursante que registra un movimiento local.
- Referencia visual: primera página de `ENSAYO_A2_LV.pdf` inspeccionada para la
  jerarquía persona → actividad y la identidad cromática de cabeceras.

El fixture histórico no incluye una paleta completa: las capturas A2 usan una
**paleta de prueba configurada**, idéntica antes/después. Los casos de nombres
largos son sintéticos y están separados del snapshot histórico. Esta revisión
aislada del renderer no certifica autenticación, RLS, base de datos, ejecución del
motor ni el navegador publicado. No se usaron ni modificaron datos remotos.
No se repitió el recorrido UI-01 completo de resize/swap: no se cambiaron sus
componentes ni contratos; la geometría de tareas sí se comparó literalmente.

Detalle de comprobaciones y hashes geométricos: [browser-report.json](browser-report.json).

## Capturas

| Vista | Antes | Después |
| --- | --- | --- |
| Espacios Timeline | [Antes](before-timeline-normal.png) | [Después](after-timeline-normal.png) |
| Espacios Lista | [Antes](before-list-normal.png) | [Después](after-list-normal.png) |

[Pareja con nombres largos, tarjeta corta y fallbacks](after-edge-cases.png).

Sólo se cambia presentación. Sin cambios en motor, planificación, validadores,
DB, APIs, filtros, selección de espacios o persistencia. Sin merge ni publicación.
