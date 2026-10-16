# UI-01B — geometría y maximización del Workspace

Base: `c1cf4359fe721c60f30244f90a73989e37018282`.

## Causas y corrección

Ajustar dividía las dimensiones observadas del canvas por el zoom anterior.
`min-width`, flex/grid y la altura de los avisos envueltos hacían que esa medida
no representase el contenido intrínseco. Recursos podía medir más de 13.000 px
con una sola selección. El aviso de edición también cambiaba de altura al partir
de 25%, provocando un segundo ajuste distinto.

Ahora los renderers declaran su geometría a 100%: minutos, filas, columnas,
gaps y grupos físicos/lógicos realmente representados. Se descuentan etiquetas,
cabeceras, avisos y espacio de barras; los controles usan el ancho útil antes de
medir su altura. La última etiqueta horaria se alinea dentro del borde derecho.
Un ResizeObserver recalcula el ajuste activo al cambiar tamaño, divisor,
distribución o maximización. El zoom manual desactiva ese ajuste automático.
No hay transformaciones ni scrolls adicionales.

Recursos es una agenda: columnas de referencia 280 px, acotadas a 240–400 px,
repartidas en filas según el espacio disponible. Una selección conserva un ancho
compacto; muchas selecciones continúan por scroll vertical en el mismo viewport.
Ajustar normaliza la anchura y el espaciado; nunca reduce una lista larga hasta
hacerla caber en altura. Las tarjetas tienen mínimo 88 px, crecen con su contenido
y mantienen 14 px para el título y 12 px para los metadatos. Título y ubicación
se envuelven, y el estado puede pasar a otra línea. Colores y autoridades
operativas siguen siendo los existentes.

Maximizar conjunto utiliza el mismo árbol React dentro de un contenedor fijo.
Conserva vistas, orden, proporción, filtros, zoom y movimientos. El workspace
coordina un único panel individual activo; Esc cierra primero ese panel y vuelve
al conjunto. Un siguiente Esc o el control visible restaura el conjunto.
Diálogos y menús activos conservan Esc. El bloqueo del documento se adquiere una
sola vez y al salir se restauran overflow y scroll anteriores. Los wrappers
legacy siguen admitiendo maximización individual.

## Reproducción

```sh
npm run check
npm run build
node --import tsx --test \
  client/src/lib/planning-workspace-geometry.test.ts \
  client/src/lib/planning-workspace-preferences.test.ts \
  client/src/lib/planning-space-presentation.test.ts \
  client/src/components/planning/space-task-content.test.tsx \
  client/src/lib/planning-view-policy.test.ts \
  client/src/lib/assisted-planning-view.test.ts \
  client/src/components/planning-timeline-assisted-drag.test.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --import tsx script/demo/smokeA2Integration.ts \
  work/ui01b-final --historical-topology --planning-navigation --planning-viewport
```

El harness usa PostgreSQL, GoTrue, PostgREST, HTTP de producto y Chromium reales.
No intercepta peticiones. Reabre el snapshot histórico de 266 obligaciones y el
día importado sin horarios. Antes del snapshot SQL de invariancia configura tres
colores y un título largo en el catálogo descartable; es una fixture de
presentación explícita. No cambia IDs, horarios, estados ni snapshots aceptados.
La comparación before ejecuta el producto de la base con el mismo código del
harness y `--viewport-baseline`; copiar los scripts de prueba al checkout base,
no los componentes corregidos. `--viewport-only` permite repetir la matriz focal.

Para regenerar el before desde la raíz del repo, en un directorio nuevo:

```sh
mkdir -p work/ui01b-base
git archive c1cf4359fe721c60f30244f90a73989e37018282 | tar -x -C work/ui01b-base
ln -s "$PWD/node_modules" work/ui01b-base/node_modules
cp script/demo/smokeA2Integration.ts script/demo/smokePlanningNavigation.ts \
  script/demo/smokePlanningViewport.ts work/ui01b-base/script/demo/
cp client/src/components/planning/planning-fullscreen.tsx \
  work/ui01b-base/client/src/components/planning/
cd work/ui01b-base
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --import tsx script/demo/smokeA2Integration.ts \
  ../ui01b-before --historical-topology --planning-navigation --viewport-baseline
```

El archivo adicional de contexto fullscreen sólo satisface el inventario de
hashes del harness; el producto base no lo importa. Los componentes, geometría,
preferencias y CSS del before son literalmente los de la base.

## Frontera

Sin cambios en motor, Assisted, DB/migraciones, RLS, endpoints, validadores,
contratos ni publicación. La prueba UI usa una planificación histórica y no
certifica una búsqueda nueva ni un despliegue remoto. En paneles muy pequeños se
conserva el límite de zoom de 10% y el contenido sigue disponible por scroll.
Sin merge ni publicación en Replit.

## Resultado y capturas

TypeScript, build, siete archivos de tests focales y Chromium: **PASS**.
La matriz registra 61 grupos de cinco pulsaciones (305 pulsaciones), con deriva
máxima de 0.0 puntos porcentuales. Los ocho casos de Recursos conservan títulos
de 14 px, tres colores configurados, el título largo completo y scroll interno.
Los hashes de todos los archivos ejecutados coinciden con el candidato.

El recorrido UI-01 anterior también pasa: zoom por ejes, divisor, orden, móvil,
consulta viewer/touch, drag de cinco minutos y descarte. Los movimientos locales
sobreviven a fullscreen conjunto/individual; tareas, Stages, sesiones, locks,
runs, revisiones, excepciones y catálogo de presentación permanecen literalmente
iguales en SQL. Las peticiones de autenticación y la inicialización única de S0
en el día sin horarios se registran aparte; los controles visuales envían cero
peticiones operativas mutantes.

- [Validación resumida](validation.json).
- [Matriz de Chromium](after/planning-viewport.json).
- [Harness y hashes de ejecución](after/integration.json).
- [Producto before idéntico a la base](before/base-product-verification.json).
- [Antes: una columna](before/before-resource-one.png).
- [Después: una columna](after/after-resources-1365-1.png).
- [Después: ocho selecciones](after/after-resources-1920-8.png).
- [Conjunto horizontal a 1920 px](after/after-workspace-1920-horizontal.png).
- [Conjunto en rejilla a 1365 px](after/after-workspace-1365-rejilla.png).

Los avisos de tamaño de bundle/Browserslist del build son los existentes.
