# UI-01 — Planning Workspace Premium

Base autorizada inicial: `c19a9c661124da7a291dff543b0ed4386f251228`.

Durante la implementación entró UI-03A (#1133) en `main`. La rama incorpora ese `main` (`6353a2a2845610ee0f6bdc1bec6ee91a70af652d`) y conserva su recorrido de apartados plegables; el conflicto del harness se resuelve manteniendo ambos modos de prueba independientes.

## Cambio y causa

El panel fullscreen ya no desplaza un segundo contenedor alrededor del timeline. Cada timeline/agenda tiene un único viewport nativo bidimensional y ocupa el espacio restante del panel; su altura depende del viewport. Las barras están en el borde de ese panel. Las horas y las etiquetas de concursantes permanecen sticky; en espacios, las cabeceras de zona/carril comparten un origen temporal y la regla horaria queda fija a la izquierda.

Se elimina `transform: scale()`. En concursantes, X cambia la anchura de minutos y Y la altura de filas; en espacios, Y cambia píxeles/minuto y X cambia carriles y separaciones. El encuadre «Jornada completa» incluye también tareas fuera de la ventana nominal; «Tareas representadas» calcula límites con padding sobre las tareas filtradas. Ninguno filtra obligaciones por hora. Los límites de edición siguen siendo los de la jornada, independientes del encuadre visual. El drag convierte la posición real del puntero a minutos y conserva el snapping de cinco minutos. Un clic sin desplazamiento no crea un movimiento.

Los controles ofrecen ejes independientes, multiplicación proporcional vinculada, reset y ajuste al espacio disponible (escalas visuales 10–300%). El ajuste de espacios incluye las separaciones y evita que los títulos impongan anchuras ajenas a los carriles. Las tarjetas breves conservan su duración geométrica y su nombre/horario completo está disponible en el título.

La normalización conserva el orden elegido, elimina duplicados y mantiene al menos una vista. Los paneles permanecen montados al reordenar, ocultar o cambiar de distribución. Un separador para dos paneles horizontales admite puntero, touch y flechas/Home/End; las proporciones se limitan a 30–70%. Las consultas de tamaño del contenedor devuelven los paneles a una columna cuando no caben. Orden, proporción, distribución, filtros y geometría se guardan localmente por usuario/jornada; cambiar de usuario o jornada cambia ese ámbito.

`Ocultar vacíos` utiliza asignaciones del conjunto completo de tareas, incluso sin inicio/fin. La jerarquía de un espacio cuenta para su zona; una tarea sin espacio no inventa un carril físico. El filtro y los carriles comparten este cálculo, y las selecciones que desaparecen se reconcilian inmediatamente.

## Validación reproducible

```sh
npm run check
npm run build
node --import tsx --test \
  client/src/lib/planning-workspace-preferences.test.ts \
  client/src/lib/planning-workspace-geometry.test.ts \
  client/src/lib/planning-view-policy.test.ts \
  client/src/lib/assisted-planning-view.test.ts \
  client/src/components/planning-timeline-assisted-drag.test.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --import tsx script/demo/smokeA2Integration.ts \
  work/ui01-navigation-final-verified --historical-topology --planning-navigation
```

El recorrido reutiliza el harness descartable: PostgreSQL, GoTrue, PostgREST, migraciones originales, servidor de producto y Chromium reales. No intercepta peticiones ni sustituye RPCs. Reabre el snapshot histórico aceptado de la jornada 27001 (266/266) y el import sin horarios de 27002 (266 obligaciones). Es validación de interfaz sobre esos datos, no una nueva certificación del solver S0→S11.

`planning-navigation.json` registra dimensiones y comprobaciones; `integration.json` conserva hashes de los archivos ejecutados, migraciones, imagen de origen y resultado del harness. El recorrido comprueba:

- X/Y/vinculado mediante dimensiones DOM, persistencia tras recarga, reset, reducción real de filas y ajuste completo de los timelines de concursantes y espacios.
- Scroll único, barra horizontal dentro del panel, cabeceras sticky y fullscreen.
- Divisor por ratón/teclado, orden persistente y conservación del mismo nodo al intercambiar paneles.
- Drag exacto de cinco minutos tras zoom/resize, clic sin movimiento, edición compartida entre vistas y descarte local.
- Protección del cambio a aceptado durante movimientos pendientes; navegación aceptado/borrador sin fugas.
- Identidades de tareas en recursos, tres paneles y filtro de espacios antes/después de tener horarios.
- Desktop 1440×900 y 1920×1080, móvil 390×844 sin overflow del documento.
- Usuario viewer: zoom y pan táctil en ambos ejes, sin capacidad de edición ni preferencias heredadas de otro usuario.
- Cero peticiones mutantes de los controles visuales; igualdad SQL literal de tareas, locks, sesiones, Stages/snapshots, validaciones, runs, revisiones y excepciones antes/después. Las otras jornadas permanecen intactas. El informe registra por separado el bootstrap de autenticación al recargar y la única creación de S0 al abrir 27002 por primera vez; la comparación de esa jornada empieza inmediatamente después de su inicialización, antes de tocar los filtros. Cualquier otra petición mutante hace fallar la prueba.

## Resultado

TypeScript, build, cinco archivos de tests focales y `git diff --check`: PASS. El harness completo registra 15 comprobaciones, de las cuales 9 corresponden al recorrido UI-01, y 8 capturas. Todos los hashes del código ejecutado coinciden con el candidato. `validation.json` registra comandos, resultados y commit de producto. No se ejecutó una nueva búsqueda Full A2 ni se certifica un despliegue remoto.

## Evidencia visual

- `navigation-1440.png` y `navigation-1920.png`: dos paneles.
- `navigation-three-panels.png`: tres paneles y recursos.
- `navigation-spaces-fullscreen-sticky.png`: espacios, cabeceras y regla temporal desplazadas.
- `navigation-390.png`: distribución móvil.
- `navigation-unscheduled-hide-empty.png`: filtro de 27002 sin horarios.
- `navigation-viewer-touch.png`: consulta móvil después del pan táctil.

## Frontera

Cambios productivos limitados a layout, fullscreen, timeline, preferencias/geometría y CSS; el wrapper legacy de `plan-details` adopta el mismo contrato flex. El test anterior de Day Workspace comprueba ahora ambos ejes en lugar de un porcentaje único. Se retira una rama de render de lista que era inalcanzable: ambos modos ya usaban el timeline vertical.

Sin cambios en motor, Assisted, endpoints, schema/migraciones, validadores, locks o publicación. No se implementan la nueva cuadrícula A2 ni el menú de ejecución. Sin merge ni publicación en Replit. No se ha validado un despliegue remoto; las capturas y resultados corresponden al entorno local descartable.
