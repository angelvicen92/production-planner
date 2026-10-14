# P4 — Control Room PRO

Base autorizada: `eb1b9a04a8c8983479df299e1e40ba4349c9564a` (#1125), después de #1123 y #1124. Unidad de lectura operativa; no modifica motor, planning, horarios, transacciones de ejecución, DB/RLS, migraciones ni Day Workspace (#1126). La entrega es un PR contra main, sin merge ni publicación Replit.

## Diagnóstico causal confirmado

El Control Room anterior consumía tareas desde `usePlan`, utilizaba un reloj global como fallback y agrupaba por zona/espacio o equipo itinerante. Descartaba carriles sin tareas próximas, en curso o recientemente completadas. Sus tres contadores omitían `interrupted` y `cancelled`; el contexto del día, la preparación y las incidencias compartidas no formaban una lectura ejecutiva conjunta.

`computeAdjustedEta` calculaba por zona el ratio medio de duraciones reales/previstas, limitado a 0,5–2, multiplicaba el trabajo restante por ese ratio y desplazaba el último fin planificado. Contaba como restante todo lo distinto de done, incluidas canceladas. Usaba duraciones de plantilla antes que placements y admitía tiempos legacy HH:mm. Asignaba high con seis muestras sin calibración. No reconstruía dependencias ni recursos: esa presentación no demostraba un pronóstico de producción.

La causa era la agregación parcial y la falta de distinción entre autoridades, además de presentar una extrapolación como cierre estimado. El delta reúne las lecturas existentes y sustituye esa extrapolación por métricas tipadas y verificables. La hipótesis se contrasta mostrando el mismo A2 aceptado, comprobando todos los estados y haciendo cambios confirmados desde otra sesión sin alterar placements o Stages.

## Arquitectura y autoridades

- `useControlRoomData`: una instancia de `usePlanRealtime`; queries del planning, ejecución y lista compartida de incidencias. Conserva prefijos de invalidación existentes y separa cachés por actor. Reconciliación HTTP cada 5 s sin canal, 30 s con canal, pausa offline. No usa `usePlan`, que abriría otra suscripción.
- `useIncidentList`: reutiliza exactamente la consulta y caché de War Room, sin obtener formularios ni abrir otro canal. El servidor continúa comprobando `p_actor` en `incident_query`; ningún endpoint alternativo amplía el ámbito.
- `useExecutionContext`: añade actor y AbortSignal a la lectura existente. Los consumidores de ejecución mantienen sus mismas transacciones y políticas. Dashboard toma dataUpdatedAt del observer existente en lugar de buscar una clave antigua sin actor (dos líneas de lectura necesarias para evitar una regresión).
- `projectControlRoom`: función determinista de lectura; cuenta todas las obligaciones recibidas, proyecta espacios, desvía sólo con timestamps completos y devuelve información no disponible explícitamente.
- Componentes: contexto en la página, resumen ejecutivo, atención/incidencias, situación de platós/espacios, próximas actividades y presentación temporal compartida. Modo Dirección utiliza toda la pantalla y tipografía mayor; Producción tiene filtros/detalle; Técnico muestra fechas de consulta.
- War Room sólo recibe un parámetro de deep link `incident`, resuelto por su propia consulta autorizada. Control Room no crea ni edita incidencias.

Fuentes oficiales: 00 v2.12 y 07 v2.2; 01 v5.2 §§6.5, 7 y P4, perfiles Dirección/Producción; límites ORC de 02; Assisted de 03; autoridades/configuración de 04; Evidence de 05; canon de 06. No se convierten métricas de search en señales operativas.

## Métricas y fórmulas auditables

| Indicador | Procedencia | Fórmula / condiciones |
|---|---|---|
| Estado de jornada | `dailyTasks.status`, contexto `planningState/planningReady/draftPending`, latest planning run | Terminada sólo si hay obligaciones y todas son done/cancelled; Aux no demuestra finalización global. En ejecución por estados done/in_progress/interrupted, nunca sólo por la hora. Aceptada por autoridad de ejecución; publicado es publicación explícita; Draft no se presenta como aceptado. |
| Obligaciones y cinco estados | GET plan, `dailyTasks` | Todas las tareas del día recibido. Estados desconocidos se conservan en un sexto bucket; suma de buckets = total. Sin horario también cuenta. |
| Progreso | Estados confirmados | `100 × done / total recibido`; canceladas dentro del denominador y fuera del numerador. Mostrar un decimal evita redondear una obligación pendiente a 100%. |
| Cobertura aceptada | Placements + `planningReady` + ausencia de Draft/run activo | Número con intervalo completo válido, sólo bajo esa autoridad. En otro caso se explica cobertura del estado de trabajo, no aceptación. |
| Comienzo / fin planificado | Intervalos de todas las obligaciones de la versión efectiva | min(start), max(end), sólo con cobertura completa, autoridad aceptada/publicada y sin Draft. Ventana del día no equivale a fin del planning. |
| Tiempo activo | `startRealAt`, `endRealAt` o `pausedAt`, `pausedTotalSeconds`; reloj autorizado si en curso | Duración de `shared/execution`, en segundos, descontando pausas. Legacy HH:mm o timestamps sin zona no establecen precisión. |
| Inicio / fin Δ | Timestamp real y placement fechado en Madrid | `(real − planificado) / 1000`, con fecha/modo/revisión compatibles. Fin sólo cuando existe timestamp completo del mismo día. |
| Duración Δ | Tiempo activo e intervalo placement | `activo − (endPlanned − startPlanned) / 1000`. Usa placement, no duración por defecto de plantilla. |
| Pendiente con comienzo pasado | Estado pending + fecha/reloj + planning aceptado + ejecución iniciada | `(operationalNow − startPlanned)/1000 > 0`. No acusa una jornada ajena ni trata preparación cero como alarma. |
| Exceso en curso | In_progress y duración Δ válida | `duración Δ > 0`. Umbral configurable de atención; nunca convierte por sí solo un retraso en crítico. |
| Fin estimado / variación de cierre | Sin modelo validado | No disponible. No ratio, confianza estadística, banda o propagación inventada; no invoca solver. |
| Fin real post-día | Timestamps de tareas done | Último fin real confirmado cuando todas las done tienen timestamp completo. Canceladas no aportan duración o fin ficticios. |
| Incidencias abiertas | GET incidents autorizado | open + escalated; críticas sólo abiertas/escaladas critical; escaladas según estado. API fallida/pendiente = desconocido, nunca cero. |
| Edad de incidencia | `createdAt` y reloj real del servidor | Diferencia física real; no reloj operativo simulado. Resueltas muestran su fecha de resolución. |
| Bloqueo de espacio | Incidencia abierta `space_blocked` | Se dice “bloqueo registrado”; sin actividad no implica parada por incidencia. Varias tareas activas en espacios distintos se conservan. |
| Recursos | `execution.tasks.resources` | Nombres de recursos efectivos confirmados; no deduce saturación, requisitos genéricos o capacidades a partir de conteos. |
| Prioridad flujo principal | `plannerNextConfiguration.plannerNext.mainFlow.spaceId` cuando existe | Identidad configurada, nunca nombre o fixture. Prioriza ese plató/actividades; resto por críticas, problemas y actividad. |
| Salud | online, estado del canal, dataUpdatedAt y errores de queries | SUBSCRIBED no demuestra entrega. Última consulta confirmada = mínimo de las tres lecturas esenciales; error/offline/antigüedad se señalan. |

Conversión de HH:mm exige el día completo y Europe/Madrid. Se reutiliza `madridClockBase`; se rechazan horas inexistentes o ambiguas por DST. La memoización acotada guarda exclusivamente conversiones de fecha/hora deterministas; nunca datos de tareas, permisos o incidencias.

## Validación y límites

La Evidence JSON y capturas acompañan el head final. El ensayo reproduce `script/demo/fixtures/a2-legacy-import.json.gz`, Stage aceptado 10, 266 obligaciones; no construye otra solución ni certifica nuevo Full A2. Los servicios PostgreSQL, Auth y PostgREST son locales descartables. El runner rechaza destinos remotos. Los cambios operativos del ensayo se hacen mediante autoridades reales y sólo en esa base.

TypeScript, build y 11 pruebas de proyección pasan; suite de servidor proporcional sin benchmarks de búsqueda: 308/308. Pruebas focales conjuntas: 21/21. El primer intento de HTTP/build con sandbox sin sockets se repitió con el acceso local necesario; no era un defecto del producto. La build conserva el aviso existente de bundle grande.

Limitaciones explícitas: el transporte certificado es HTTP polling, no entrega WebSocket de Supabase. No hay modelo predictivo ni análisis de saturación validado. No se afirma propagación de retrasos, dependencia crítica, idle causal o factibilidad futura. La ausencia de ubicación por sí sola no produce una alerta: puede corresponder a una obligación no física. Sólo una relación explícita rota verificable en el catálogo se señala. Las lecturas son eventualmente consistentes y no constituyen un snapshot transaccional conjunto; se señalan errores y tiempos de confirmación. No se hacen escrituras en Supabase conectado ni publicación Replit.

## Demostración ejecutiva de tres minutos

- **0:00–0:35:** abrir A2 en Dirección; leer estado, 266 obligaciones y comienzo/fin aceptados. Mostrar que preparación cero no es una alarma y que la estimación permanece no disponible.
- **0:35–1:15:** iniciar y terminar una actividad en Mi Día desde Aux; observar estado, tiempo activo, contadores y persistencia tras recarga en Control Room.
- **1:15–1:55:** registrar una crítica en War Room; verla en Control Room y abrir su contexto exacto. Resolver desde la otra sesión y comprobar el contador.
- **1:55–2:30:** pasar a Producción, filtrar platós activos/con problemas, expandir espacios y abrir una tarea. Señalar que falta de actividad no prueba bloqueo.
- **2:30–3:00:** mostrar Viewer sin edición, Aux con ámbito autorizado, modo oscuro y error de consulta sin contadores ficticios. Leer fuente/denominador y estado de sincronización; confirmar que el planning aceptado permanece intacto.

## Resultado del head entregado

[Evidence nativa y hashes](P4-CONTROL-ROOM-PRO.json), [13 capturas inspeccionadas](P4-CONTROL-ROOM-UI/) y [benchmark](P4-CONTROL-ROOM-PERFORMANCE.json).

| Gate | Resultado |
|---|---|
| A — exactitud A2 | PASS: 266 recibidas; suma de estados = 266. Placements, Stage 10/fingerprint, sesiones y planes literales; cero writes remotos. |
| B — antes/durante/después | PASS: preparación aceptada; Start/Finish reales; cierre después de una completada y 265 cancelaciones explícitas mediante autoridad nativa local. No se presenta como un rodaje completo de 266 actividades. |
| C — ejecución entre sesiones | PASS: Aux inicia/termina en Mi Día; Producción ve estado, segundos/duración y resultado tras recarga. |
| D — incidencias/permisos | PASS: crítica creada en War Room, observada y abierta desde Control Room, resuelta por otro usuario. Viewer sin edición, Aux limitado y cambio de cuenta sin reutilizar incidencias globales. |
| E — ETA/tiempo | PASS: 11 pruebas de proyección incluyen ausencia/incompletitud de timestamps, pausas, segundos, cambio de reloj, simulación, otra fecha, parcial y canceladas. Ninguna confianza/banda/modelo inventado. |
| F — platós | PASS focal: inactivo permanece visible, actividades simultáneas por espacios, bloqueo explícito, interrupción, relación rota y obligación sin ubicación. Recursos nominales sólo como datos de la autoridad, sin saturación deducida. |
| G — pantallas | PASS: Dirección 1920, Producción 1440, tablet 820, móvil 390, oscuro, preparación, ejecución, crítica, offline y fallo genuino de consulta. Sin overflow horizontal; muestra del resumen ≥7,7:1 en claro y oscuro. |
| H — regresión | TypeScript/build/secuencia PASS; 21/21 focales, 308/308 servidor sin benchmarks de búsqueda. Workflow específico añadido; estado CI del commit final en el PR. |

El ensayo utiliza Node 20.20.2 y las versiones exactas de `package-lock.json`; la Evidence conserva su SHA-256. Se revisaron capturas de `main` y head con el mismo A2 y servicios. La nueva proyección completa mide aproximadamente 1,3 ms de media/1,7 ms p95 repetida para 266 tareas, frente a 0,37 ms de la antigua **ETA aislada**; primera conversión fría ~40 ms. Las operaciones medidas tienen distinto alcance y no permiten afirmar una aceleración frente al antiguo panel. La memoización redujo la primera implementación de la proyección (~305 ms), sin caché de permisos/datos operativos. El benchmark conserva los números exactos y los tamaños comparables de build.

La medición de carga de navegador es una observación local de desarrollo por versión, con compilación de módulos incluida; no demuestra un SLA ni una mejora estadística. El gate visual verifica una muestra del resumen, no una auditoría automatizada completa de accesibilidad de toda la aplicación.

Reproducción:

```sh
npm ci
npm run check
npm run build
node --import tsx --test client/src/lib/control-room-metrics.test.ts server/liveExecution.spec.ts server/incidents.spec.ts server/apiAuthorization.spec.ts
npx --no-install playwright install --with-deps chromium
node --import tsx script/demo/smokeA2Integration.ts work/control-room-p4 --historical-topology --control-room-snapshot
```

Para comparar capturas con main, preparar un checkout de `eb1b9a0` con dependencias y caché Vite independientes, y proporcionar `CONTROL_ROOM_BASELINE_ROOT` al mismo runner. Esta opción sólo afecta al ensayo; no introduce despliegue ni registro nuevo.
