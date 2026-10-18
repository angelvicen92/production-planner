# P1B — Control Room global: lectura temporal

Base: `17dc265c51bb2c7c1e93a28f8d8a05db67e9d7db`. Rama: `codex/ops-p1-control-room-director`. [Resultados, hashes y capturas](P1B-EVIDENCE.json).

## Causa y cambio comprobado

P4 ya conserva las 266 obligaciones y la autoridad de ejecución. La limitación era visual: Dirección no permitía filtrar ni abrir el historial completo; cada espacio mostraba sólo su última completada y su siguiente actividad. No faltaba otra proyección.

| Lectura | Base | P1B |
|---|---|---|
| Resumen ejecutivo | Estado/preparación y cinco estados globales | Conservado; los filtros declaran su propio denominador sin alterar el resumen |
| Dirección | Sin filtros; última completada y siguiente | Plató, espacio, estado y situación del espacio; historial y restantes desplegables |
| En curso | Todas las actividades simultáneas | Conservadas, destacadas; planning, inicio real, segundos activos y desviación de duración |
| Completadas | Última por espacio; detalle sólo en Producción | Todas, ordenadas por fin real descendente; inicio/fin reales, tiempo activo y duración frente al placement |
| Pendientes | Una siguiente y acceso parcial al resto | Siguiente de la proyección y acceso a todas las posteriores, incluidas interrumpidas y sin horario |
| Datos incompletos | Información no disponible | Se conserva la tarea; desviación «No calculable» y explicación de autoridades necesarias |
| Obsolescencia | Indicador en cabecera | Aviso que permanece visible al desplazarse; sin conexión/error/edad según sincronización existente |
| Reintento | Planning, ejecución, incidencias y run | Reintenta además platós, espacios, personas y configuración de atención |

`selectActivities` selecciona referencias de `projectControlRoom`; `activitySections` agrupa esas mismas referencias. No vuelve a leer ni calcular estados, permisos, tiempos, desviaciones, siguiente actividad o incidencias. No se modifica `projectControlRoom`, el panel padre, sus hooks ni sus fórmulas. Producción conserva además inicio Δ, fin Δ y recursos nominales efectivos. Los catálogos sin actividad permanecen consultables. Las incidencias resueltas siguen en el registro compartido y dejan de bloquear el espacio según la proyección existente.

Fuentes revisadas: AGENTS, 00 v2.13, 01 v5.2 (Control Room, Dirección, indicadores y diseño), autoridades de 04 v2.7, validación de 05 v2.7, protocolo 07 v2.2, Evidence P4 y G0. El prompt restringe esta unidad a métricas verificadas: no se incorpora ETA, propagación, criticidad futura ni disponibilidad inferida.

## Validación del candidato

- TypeScript y build PASS con dependencias exactas de `package-lock.json`. Avisos existentes de Browserslist y tamaño de bundle.
- 34/34 tests PASS: 7 nuevos de selección temporal, 11 existentes de proyección y 16 existentes de ejecución/incidencias/autorización G0. Los tests de G0 ejecutan SQL/RLS en PGlite y middleware HTTP local; no se modifica su implementación ni assertions.
- 14 comprobaciones de navegador PASS: preparación, ejecución, completadas, trabajo posterior desplegable, vacíos, filtros combinados y limpieza, dos actividades simultáneas, incidencias abiertas/resueltas, datos incompletos, recuperación de catálogo, offline, consulta obsoleta, Viewer/Producción/Aux y post-día.
- A2: 266 identidades exactamente una vez en selección y secciones, incluidos estados desconocidos, canceladas, obligaciones sin horario y ubicaciones incompletas. Los tests comparan literalmente inputs/proyección y reutilizan sus objetos. Sin cambios al planning, tiempos reales ni permisos productivos.
- Dirección 1920×1080 y tablet 820×1180; Producción en tablet. Sin overflow horizontal en las 14 capturas. Revisión visual de resumen, simultáneas, completadas, detalle Producción, base y aviso obsoleto. Controles nativos de filtro de al menos 44 px.
- Navegador en America/New_York: se comprueban segundos reales mostrados en Europe/Madrid. Cero errores JavaScript y cero peticiones de escritura operativa; únicamente bootstrap de rol existente.

La comparación usa **el mismo fixture y las mismas respuestas interceptadas** en un checkout limpio de la base y el candidato. El fixture es `server/fixtures/assistedA2S10.json` (provenance y fingerprint originales en JSON), con estados y timestamps de ensayo en memoria. No es un rodaje real ni una nueva generación Full A2. Se comprueba que ni siquiera ese input de ensayo cambia durante la lectura.

## Capturas comparativas

| Vista | Base | P1B |
|---|---|---|
| Resumen Dirección 1920 | [Antes](p1b-before-director-1920.png) | [Después](p1b-after-director-1920.png) |
| Lectura por espacios 1920 | [Antes](p1b-before-temporal-1920.png) | [Después](p1b-after-temporal-1920.png) |
| Historial de completadas | — | [Dirección 1920](p1b-completed-director-1920.png), [Dirección 820](p1b-completed-director-820.png), [Producción 820](p1b-completed-production-820.png) |
| Datos y sincronización | — | [Incompletos](p1b-incomplete-data-820.png), [Offline](p1b-offline-820.png), [Error](p1b-query-error-820.png), [Obsoletos](p1b-stale-query-820.png) |
| Jornada | — | [Preparación](p1b-before-day-1920.png), [Post-día](p1b-after-day-1920.png), [Sin actividad](p1b-empty-space-820.png) |

Las capturas y Evidence se mantienen en este directorio para respetar el aislamiento solicitado. No se modifica ningún script compartido de integración.

## Reproducción

```sh
npm ci
npm run check
npm run build
node --import tsx --test --test-concurrency=1 client/src/lib/control-room-metrics.test.ts client/src/components/control-room/temporal-navigation.test.ts server/liveExecution.spec.ts server/incidents.spec.ts server/apiAuthorization.spec.ts
P1B_BASELINE_ROOT=/ruta/checkout-base node --import tsx client/src/components/control-room/p1b.browser.mjs
```

El checkout-base debe contener `17dc265c` y sus dependencias. El navegador usa `/usr/bin/chromium`; `P1B_CHROMIUM` permite indicar el Chromium instalado por Playwright. Sin `P1B_BASELINE_ROOT` se verifica sólo el candidato. Los resultados se guardan en `work/p1b-browser`; `P1B_OUTPUT` permite cambiar el destino. No se necesitan credenciales remotas: las lecturas HTTP se interceptan y el tráfico externo del navegador se responde localmente.

## Alcance y límites

El diff sólo toca la página y `client/src/components/control-room`, incluidos tests y entregables. Mi Día, Start/Finish, DB/migraciones, servidor, Planning Workspace, motor, scripts compartidos, permisos y reloj real permanecen sin cambios. La base G0 se recuperó exactamente, con su commit y tree originales, antes de editar.

La validación nueva de navegador es de presentación con HTTP interceptado, no una nueva certificación nativa de Auth/PostgREST/PostgreSQL ni de entrega Realtime. Esa autoridad sigue en G0/P4 y en la suite existente. No se accede a Supabase conectado, no se publica Replit y no se hace merge. Los filtros no se guardan entre jornadas o cambios de modo; no se persisten preferencias nuevas.
