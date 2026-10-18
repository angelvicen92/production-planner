# P2A — Señales temporales en Mi Día

Base combinada P1A+P1B: `0c26905d82f7b7a4cb483c33f7a3f968ca3b8a82`, tree `ffefca1128012c54812574f8f68437b747dc618c`. Rama: `codex/ops-p2a-myday-temporal-signals`.

## Causa y resultado

Mi Día ya recibía estado, reloj autorizado, placement aceptado y registros reales. Faltaba una lectura directa de la proximidad al fin. La información común P1A incorpora ahora una señal con icono, texto y cuenta de tiempo, visible en la tarjeta destacada y en la agenda.

| Actividad prevista 10:00–10:10 | Señal |
|---|---|
| En curso entre 10:00 y 10:07:59 | Verde suave; tiempo hasta el fin previsto |
| Desde 10:08 hasta 10:10 inclusive | Naranja suave; tiempo hasta el fin previsto |
| Después de 10:10, aún en curso | Rojo suave; exceso sobre el fin previsto |
| Finalizada | Panel neutro con desviación real de inicio, fin y duración activa |
| Pendiente, interrumpida o cancelada | Sin señal de actividad en curso |

El umbral `0.2` pertenece exclusivamente a la presentación local. Se calcula con la duración del placement aceptado y su hora final absoluta. Un arranque tardío o una pausa no desplazan ese final. No se sustituye el placement por duración de plantilla ni por un ETA. Cada actividad simultánea conserva su propia señal.

`my-day-temporal.ts` reutiliza `plannedInstant`/`madridDate` existentes para fecha y hora Madrid, incluidos rechazo de horas DST ambiguas/inexistentes; `executionClockCurrent` y `executionDuration` conservan la autoridad de ejecución. El componente recibe el mismo `nowMs` y tick de un segundo que ya utilizaba Mi Día, extrapolado desde `execution_context.clock.operationalAt`. No se añade otro reloj.

La comparación es neutra sin planning aceptado, con Draft pendiente, placement inválido/incompleto, otra fecha, timestamps incompletos/sin zona horaria, cambio de modo/revisión del reloj, pausa incoherente o registro en curso contradictorio. También queda neutra antes del intervalo previsto. Sin conexión se conserva el registro y se pausa la comparación en curso con explicación; las desviaciones finalizadas siguen procediendo de sus registros, independientes del paso del tiempo. Un cambio posterior de autoridad temporal no permite inventar comparabilidad histórica.

El estado «En curso» conserva su etiqueta y usa el color primario; el verde queda reservado a la nueva comparación válida. Los paneles tienen variantes claras/oscuras y no requieren hover. No son regiones de alerta ni anuncian cada tick. Start/Finish mantiene su mutación original con `expectedStatus`, autoridad del servidor e invalidaciones.

## Alcance

Sólo se modifican Mi Día, su información común, el componente/proyección temporal y pruebas/Evidence propias. Se importa una utilidad temporal existente sin modificar Control Room. Cero delta en shared/execution, hooks compartidos, servidor, DB, migraciones, permisos, motor y Planning Workspace. Sin endpoints, sonidos, notificaciones, persistencia, predicción o publicación Replit.

Fuentes revisadas: AGENTS.md, 00 v2.13, 01 v5.2 (ejecución, Mi Día, roles y diseño), 04 v2.7 (planning aceptado y tiempo), 05 v2.7 (regresión/Evidence), 07 v2.2; código P1A y shared/execution; Evidence G0, P1A y P1B.

## Resultado del candidato

| Gate | Resultado objetivo |
|---|---|
| TypeScript y build | PASS; avisos previos de Browserslist y tamaño de bundle |
| Suite focal combinada | 56/56 PASS: 9 nuevas temporales/render, 13 P1A, 18 P1B/proyección y 16 ejecución/incidencias/G0 |
| Navegador con HTTP interceptado | 9 comprobaciones PASS, incluida comparación con base; cero errores JS |
| Start/Finish nativo existente | PASS: Auth → HTTP → PostgREST → PostgreSQL, botones reales y persistencia tras recarga |
| Planning aceptado | 266 placements, recursos, Stages y Draft preservados literalmente; otros días preservados |
| Móvil / tablet | 390×844 / 820×1180, sin overflow; variantes clara y oscura revisadas |
| Escrituras nuevas de la presentación | Ninguna; el ensayo sólo observa las dos PATCH originales de Start y Finish |
| Servicios remotos / nueva generación solver | Cero escrituras remotas; ninguna nueva generación A2 |

[Manifest y hashes](validation.json), [resultado de navegador](browser.json), [ensayo nativo](native.json), [suite focal](tests.log), [TypeScript](check.log) y [build](build.log). El manifest incluye los hashes de los archivos candidatos y de las autoridades intactas. El extracto nativo elimina transporte/logs privados y conserva el hash del informe original, los fingerprints y comprobaciones objetivas.

| Captura | Evidence |
|---|---|
| Mismo escenario en main | [Antes, móvil](before-mobile.png) |
| Señales en vivo | [Verde, móvil](normal-mobile.png), [naranja, móvil](ending-mobile.png), [rojo y verde simultáneos, tablet](overrun-tablet.png) |
| Registro terminado | [Desviación real, tablet](completed-tablet.png) |
| Sin conexión / simulación | [Offline](offline-tablet.png), [reloj simulado](simulated-tablet.png) |
| Modo oscuro | [Tablet](dark-tablet.png) |
| Ejecución nativa | [En curso, móvil](native-mi-dia-mobile-running.png), [finalizada tras recarga, tablet](native-mi-dia-tablet-completed.png) |

Las capturas de presentación usan datos de ensayo; los nombres ausentes del fixture conservan el fallback existente. Las capturas nativas muestran los nombres y recursos reales del snapshot histórico de prueba. Revisión visual: señal legible, icono/texto/cuenta explícitos, botón de acción conservado y sin alarma de ejecución en completadas.

## Reproducción

Con las dependencias exactas del lockfile:

```sh
npm run check
node --import tsx script/build.ts
node --import tsx --test --test-isolation=none --test-concurrency=1 client/src/lib/my-day-temporal.test.ts client/src/components/my-day/temporal-signal.test.tsx client/src/components/my-day/activity-information.test.tsx client/src/lib/my-day-operational.test.ts client/src/lib/control-room-metrics.test.ts client/src/components/control-room/temporal-navigation.test.ts server/liveExecution.spec.ts server/incidents.spec.ts server/apiAuthorization.spec.ts
P2A_BASELINE_ROOT=/ruta/checkout-0c26905d node --import tsx client/src/components/my-day/p2a.browser.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx client/src/components/my-day/a2-native.test.ts work/p2a-native
```

Node usado: 24.19.0. Para Node 20 se omite `--test-isolation=none`. El navegador requiere Chromium (`P2A_CHROMIUM` permite otro ejecutable); guarda resultados en `work/p2a-browser` o `P2A_OUTPUT`. Sin `P2A_BASELINE_ROOT` prueba sólo el candidato. El runner nativo P1A existente necesita Docker y crea/elimina servicios propios en loopback. Ninguna prueba tiene como destino la base conectada.

La prueba de presentación intercepta HTTP con escenarios explícitos sobre las 266 identidades de `server/fixtures/assistedA2S10.json`. Compara base y candidato con iguales respuestas, prueba el tick y los estados de presentación; no certifica por sí sola Auth/RLS ni entrega Realtime. La prueba nativa reutiliza el fixture histórico aceptado P1A (266 tareas, S0–S10), sin generar un nuevo planning ni alterar su canon. Los logs privados y credenciales efímeras del runner quedan fuera de esta Evidence.

Límite: se certifica actualización local y polling HTTP; no transporte Supabase Realtime/WebSocket real. No se hace merge ni se publica Replit.
