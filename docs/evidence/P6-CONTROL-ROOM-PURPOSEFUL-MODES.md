# P6 — Control Room con perspectivas diferenciadas

**Gate de merge bloqueado.** La [auditoría posterior de autorización](P6-AUTHORIZATION-AUDIT.md) demuestra una regresión del hook global en Autopilot y deja sin aislar el origen de una lectura JSON fallida. Los verdes locales descritos abajo no cierran P6 ni sustituyen Planner Engine CI completo.

Rama `codex/ops-p6-control-room-purposeful-modes`, base autorizada `c1b3305b792e75d1409740e2893b3fd137ea6933`. Un PR contra main, sin merge ni publicación. No se modifica backend, SQL/migraciones/RLS, motor, planning, fechas, Mi Día, Hoja del día ni War Room.

## Causa y cambio

La página pasaba los tres modos a `ProductionControlPanel`; sólo Dirección alteraba tamaño/layout y Técnico añadía fechas. El selector tampoco consultaba el rol. Ahora la página calcula una sola `projectControlRoom` memoizada y entrega esa misma proyección a presentaciones exclusivas:

- **Producción:** atención/incidencias abiertas y escaladas primero; bloqueos registrados, tareas en curso y próximas con enlaces a tarea, Mi Día y War Room. Inspección por plató/espacio/estado bajo demanda, desmontada hasta abrirla para evitar renderizar las 266 fichas en la vista principal.
- **Dirección:** fase, cobertura/progreso y denominador, horas planificadas, estados confirmados; hasta cuatro hechos principales, tres críticas, cuatro bloqueos y ocho tarjetas sintéticas de plató, indicando los elementos adicionales. Sin filtros, agenda extensa, IDs, edición o diagnóstico interno. Pantalla sin sidebar y autoscroll de 30 s que respeta reduced motion.
- **Técnico:** conexión del navegador, canal realtime, reconciliación HTTP, último éxito y antigüedad/error de cada lectura, comparabilidad del reloj y métricas sin autoridad. Puede seguir diagnosticando si falla ejecución. No renderiza agenda ni resumen ejecutivo. Nunca declara la salud global a partir de una consulta.

Se reutilizan `ExecutiveSummary`, etiquetas, deep links, conversiones Europe/Madrid y métricas existentes; no se modifica ninguna fórmula ni se incorpora un KPI o ETA. La predicción de cierre sigue no disponible.

## Autoridad de perspectivas y datos

| Rol confirmado por `/api/me/role` | Perspectivas | Condición |
|---|---|---|
| Admin | Producción, Dirección, Técnico | Las dos primeras requieren contexto de ejecución coherente; Técnico sigue disponible ante fallo de ejecución. |
| Producción | Producción, Dirección | La previsualización ejecutiva requiere contexto de ejecución con el mismo rol. |
| Viewer/Dirección | Dirección | Lectura ejecutiva; sin controles de operación. |
| Aux | Producción | Proyección filtrada por `execution.tasks.inScope`, con avisos explícitos de lectura parcial y horarios/progreso de su ámbito. |
| Sin rol, error de consulta de rol o desacuerdo de autoridades | Ninguna | Se ocultan composiciones hasta reconfirmar acceso. |

Técnico se reserva a Admin conforme a Fuente 01 §12 (diagnósticos). `hasScope` representa asignaciones de Aux; no es un permiso global: Admin/Producción pueden tener `hasScope=false` y autoridad global. No se infieren permisos del JWT, nombres, localStorage ni selección visual.

La preferencia nueva tiene clave por actor. Se ignora la antigua bandera global de Dirección, se valida cada render contra los modos actuales y se persiste únicamente el resultado permitido. La caché del rol queda separada por actor, usa AbortSignal y reconfirma cada 30 s, al recuperar foco/sesión y mediante Actualizar. Un fallo no reutiliza un rol privilegiado anterior. Un cambio de rol puede observarse con el intervalo de consulta; no se promete revocación instantánea por WebSocket.

**El selector no es una frontera de confidencialidad.** La auditoría de `server/apiAuthorization.ts` confirma GET de planes/catálogos para Admin, Producción, Aux y Viewer. En el ensayo HTTP nativo los cuatro reciben las 266 tareas del plan. `execution_context` devuelve el rol/autoridad efectiva; Aux tiene 19 tareas en scope en ese ensayo y el resumen usa sólo esas 19. Las incidencias pasan por `incident_query` con actor y su propia política. Ocultar Técnico o resumir Aux no reduce lo que una API ya permite leer. No se redefine ese contrato ni se modifica autorización del servidor/RLS en este PR.

## Fuentes de los indicadores

| Dato presentado | Autoridad y condición |
|---|---|
| Fase, cinco estados, obligaciones, progreso | `projectControlRoom` sobre estados recibidos y autoridad de ejecución. Done / total recibido; canceladas fuera del numerador. Preparación cero no es alarma. |
| Inicio/fin planificado y cobertura | Placements completos de la versión efectiva aceptada/publicada, sin Draft/run activo; en Aux se etiquetan como horarios del ámbito, nunca cierre global. |
| Atención y retrasos | Alertas existentes de proyección, con umbral configurado; los retrasos pendientes requieren ejecución iniciada y fecha/reloj comparable. Una crítica viene de una incidencia critical abierta/escalada, nunca de un retraso inferido. |
| Bloqueos, críticas y platós | Incidencias abiertas `space_blocked`, severidad y relaciones verificadas en la misma proyección. Inactividad no prueba parada ni causa. |
| Último éxito / antigüedad | `dataUpdatedAt` de cada observer HTTP. Se conserva la fecha del último éxito tras error; pendiente/fallido nunca significa cero. Obsoleto al superar intervalo + 20 s. Catálogos no periódicos pueden requerir Actualizar para reconfirmarse. |
| Confirmación conjunta | Mínimo de planificación, ejecución e incidencias. Lecturas independientes y eventualmente consistentes; no snapshot transaccional conjunto. |
| Canal realtime | Estado del hook existente. Conectado no garantiza entrega; HTTP reconcilia cada 30 s con canal, 5 s sin él y pausa offline. |
| Reloj y neutralización | Contexto de ejecución autorizado, modo/revisión y fecha Europe/Madrid de la jornada. Sin contexto coherente se neutralizan resumen y contadores; sin incidencias se neutralizan sus contadores/bloqueos; fecha distinta neutraliza retrasos actuales. |
| Cierre previsto | No disponible: ningún modelo validado. |

Fuentes oficiales leídas: 00 v2.13 (autoridad por ámbito), 01 v5.2 §§12, 5.6, 5.10, 6.5 y P4, 04 v2.7 (configuración efectiva, roles y controles pertinentes), 05 v2.7 (validación proporcional y Evidence) y 07 v2.2 (continuidad y método causal). Se contrastó Evidence P4 y los tests/recorridos existentes. No se promueve una conducta accidental del código a regla de dominio.

## Recorridos y reproducción

La regresión UI usa respuestas HTTP interceptadas y fixture A2 S10 de 266 obligaciones. Acredita composición, opciones por rol, preferencia permitida/prohibida, cambio de rol, fallo de autorización, filtros, enlaces, segundos Madrid desde navegador New York, simulación/otra fecha, consultas fallidas, offline y antigüedad. Las capturas de los tres modos cubren 1920/1440/820/390 según presentación y modo oscuro. Este recorrido no certifica Auth/RLS ni entrega WebSocket.

El recorrido nativo usa el runner existente con PostgreSQL, GoTrue, PostgREST y aplicación reales en servicios locales descartables. Comprueba lectura inicial sin escrituras, A2 aceptado de 266 obligaciones, Start/Finish desde otra sesión, incidencia crítica creada y resuelta en War Room, cuatro roles, revocación Admin→Viewer con diagnóstico abierto y cambio de cuenta Producción→Aux. Preserva literalmente placements, Stage/fingerprint, sesiones/Draft, planes, locks previos y otros días. El ensayo verifica por separado el único lock nuevo que Start/Finish crea y retiene por contrato; no atribuye esa escritura operativa a Control Room. Las acciones operativas de ensayo se limitan a esa base descartable; no son escrituras en Supabase real. El post-día conserva la metodología P4: una completada y 265 cancelaciones explícitas; no se afirma haber ejecutado 266 actividades.

```sh
npm ci
npm run check
npm run build
node --import tsx --test client/src/lib/control-room-metrics.test.ts client/src/lib/control-room-modes.test.ts client/src/components/control-room/temporal-navigation.test.ts server/apiAuthorization.spec.ts server/liveExecution.spec.ts server/incidents.spec.ts
node client/src/components/control-room/p6.browser.mjs
node --import tsx script/demo/smokeA2Integration.ts work/control-room-p6 --historical-topology --control-room-snapshot
node --import tsx script/demo/smokeA2Integration.ts work/p6-time-corrections --historical-topology --time-corrections
node --import tsx script/demo/smokeA2Integration.ts work/p6-live-day --historical-topology --live-execution-snapshot
```

El navegador focal admite `P6_CHROMIUM` (por defecto `/usr/bin/chromium`). El nativo usa la instalación de Playwright. En este entorno se fijó `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright`. La CI existente incorpora los tests de modos y el browser P6, además del ensayo nativo. Los recorridos existentes `smokeExecutionTimeCorrections` y `smokeLiveExecutionJourney` abren ahora explícitamente la inspección tras entrar o recargar Control Room; sólo cambian esos clics, manteniendo todas sus aserciones de datos, cronología, auditoría y permisos. El browser histórico P1B documenta una composición anterior con filtros en Dirección; el contrato actual verifica esos filtros en Producción mediante P6 y mantiene intacta su Evidence histórica.

Resultados: `npm run check` y `npm run build` PASS (aviso de bundle grande existente); **38/38 tests focales; compilación TypeScript del runner de integración**, **11/11 comprobaciones de navegador**, **23 capturas UI** y ensayo nativo local PASS. También pasan los recorridos nativos existentes de correcciones temporales y ejecución en vivo: [Evidence de regresión](P6-CONTROL-ROOM-REGRESSIONS.json). La medición nativa del resumen contrasta una muestra de texto en claro/oscuro (mínimo observado ~7,7:1); no es una auditoría automática completa de accesibilidad. Técnico no reutiliza ese resumen y no se le atribuye esa medición.

Los resultados finales, hashes y limitaciones están en [Evidence UI](P6-CONTROL-ROOM-UI/browser-evidence.json) y [Evidence nativa](P6-CONTROL-ROOM-NATIVE.json). Las capturas nativas diferenciadas están en [Producción](P6-CONTROL-ROOM-NATIVE-UI/control-room-production-critical.png), [Dirección](P6-CONTROL-ROOM-NATIVE-UI/control-room-director-1920-critical.png) y [Técnico](P6-CONTROL-ROOM-NATIVE-UI/control-room-technical-1440.png). No se certifica transporte WebSocket ni un SLA; se verifica reconciliación HTTP. No hay escritura remota, solver, cambios de schema ni publicación.
