# P3 — War Room persistente y compartida

Base: `cdbf3570c1f55acd6a5d6c3dc196f48458e67866` (PR #1124 integrado). Rama: `codex/war-room-persistent-incidents-p3`. Clasificación: **DB Safe Merge**. Ninguna migración ni escritura en Supabase conectado; sin publicación ni merge.

## Diagnóstico causal verificado

`war-room-store.ts` guardaba incidencias y resoluciones en `localStorage`. `/war-room` leía ese array para sus indicadores; Dashboard llamaba a `addIncident` antes de navegar, sin conservar jornada/contexto. Hoja del Día también contaba ese array local. No había API, identidad autenticada, versión ni auditoría compartida. Registrar un problema en un móvil no lo hacía visible para otro operador.

La nueva autoridad es PostgreSQL. La UI sólo cuenta registros confirmados por HTTP. El archivo local anterior se conserva, se identifica como archivo de este navegador y nunca se importa, se borra ni se suma automáticamente.

Fuentes revisadas: índice 00 v2.12; 01 v5.2 (6.9, 9.4, perfiles, UX, P3 y DB Safe Merge); fronteras 02 v2.2/03 v3.7; autoridad productiva y persistencia 04 v2.7; gates 05 v2.7; canon 06 v2.9; protocolo 07 v2.2. Se reutiliza el patrón invoker/transacción/ámbito nominal de 093, sin modificar ejecución ni planificación.

## Arquitectura y diff

- `shared/incidents.ts`: taxonomía de las diez clases oficiales, severidad, estado, referencias opcionales, contratos Zod estrictos. Los tipos locales históricos sólo tienen correspondencia explícita; no activan importación.
- `094_operational_incidents.sql`: incidencias y eventos, FK restrictivas, pertenencia a jornada y coherencia tarea/persona/zona/espacio/recurso, índices por día/estado/fecha, revisión y timestamps físicos del servidor.
- `server/incidents.ts` + `incidentErrors.ts`: consultas y comandos separados, identidad de `requireAuth`, autorización de rol en middleware y comprobación nominal dentro de la RPC. Errores humanos 400/401/403/404/409/503; ninguna credencial o error SQL llega a la UI.
- `shared/routes.ts`/`schema.ts`: contrato HTTP y representación de tablas; SQL es autoridad de RLS, grants, integridad y atomicidad.
- `/war-room` + `use-war-room.ts`: cabecera y contadores oficiales, prioridad crítica/abierta/resuelta, búsqueda y nueve filtros combinables, detalle con histórico, formulario breve con opciones adicionales, asignación nominal, edición, escalada, resolución/reapertura con decisión obligatoria.
- Dashboard abre un borrador revisable con jornada, tarea, motivo y ubicación. La navegación nunca registra por sí sola. También permite abrir un borrador desde su cabecera. Hoja del Día enlaza al registro compartido.
- `use-plan-realtime.ts` reutiliza el canal existente para invalidar consultas de incidencias. No añade bus ni suscripción paralela. Las cachés de lista, contexto y detalle se separan por usuario autenticado para no reutilizar datos de otra cuenta en el mismo navegador. Mi Día sólo incorpora el destino de lectura y scroll de `Ir a tarea`; no cambia su autoridad de ejecución.

API: `GET /api/plans/:planId/incidents` (lista), `GET .../context` (opciones/autoridad), `GET .../:incidentId` (detalle e histórico), `POST` en la colección (crear), `PATCH .../:incidentId` (editar), `POST .../:incidentId/{resolve,reopen,escalate}`. Cada modificación exige `expectedVersion`. La creación exige `requestId`, único por jornada/autor, para hacer seguros los reintentos de un mismo borrador. Reutilizar la clave con otros datos devuelve 409; nunca confirma silenciosamente un borrador diferente.

Se generó la plantilla con Supabase CLI 2.81.3 y se normalizó a `094` según la secuencia NNN del repositorio. La migración se reaplica sin perder incidencias ni eventos.

La RPC serializa comandos por jornada, vuelve a comprobar autoridad y versión y guarda incidencia+evento en una sola transacción. El fallo de cualquier parte revierte ambas. Resolver no borra; reabrir conserva la decisión de resolución en el evento anterior. El registro no escribe tareas, eventos de ejecución, locks, Stages, configuración ni reloj. No hay impacto económico/temporal inventado ni horas operativas simuladas presentadas como hechos físicos.

## Contrato de permisos

| Identidad | Lectura | Escritura |
|---|---|---|
| Anónimo / sin rol | Denegada | Denegada |
| Viewer | Jornadas visibles según el contrato actual de la app | Ninguna |
| Aux | Incidencias con tarea dentro de su ámbito nominal vigente | Crear/editar/escalar/resolver/reabrir sólo con esa autoridad, comprobada antes y después de editar el vínculo |
| Producción / Admin | Todas las incidencias de las jornadas permitidas por la app | Gestión completa y asignación de responsable nominal |

Aux reutiliza `execution_task_scope`: vínculos primarios reales con staff activo/asignación efectiva por espacio/zona o identidad de recurso efectivo. Ver una tarea no concede modificación. Un Aux no puede escribir incidencias globales, transferirlas a otro ámbito ni gestionar responsables. El responsable debe ser staff activo con asignación en la jornada; no se inventan responsables a partir de nombres.

El servidor obtiene UUID/email del token validado por Auth. La RPC da prioridad al nombre nominal real y usa como fallback el email validado que entrega el servidor. No consulta `auth.users` para mostrar nombres ni amplía sus permisos de lectura. El cliente no puede enviar autor, plan, estado arbitrario, timestamps o versiones resultantes.

Data API: `authenticated` sólo tiene SELECT sujeto a RLS; anon carece de acceso y todas las escrituras directas están revocadas. Las RPC públicas de comandos/consultas son ejecutables sólo por `service_role` y verifican el actor explícitamente. El único definer nuevo es un predicado de lectura en un esquema privado, con `auth.uid()` fijo y `search_path=''`, necesario porque las tablas de snapshots utilizadas por la autoridad nominal son de servidor. No acepta actor del consumidor. El histórico se restringe tanto por la visibilidad actual como por el ámbito de cada snapshot anterior.

## Validación y Evidence

Los ensayos usan PostgreSQL 17.11, GoTrue y PostgREST reales en contenedores descartables; aplican **todo el ledger nativo 001–094**, sin sustitución de RPC ni interceptar peticiones del navegador. Generan cinco identidades con login por contraseña y abren tres contextos Chromium independientes: Aux móvil (zona horaria Nueva York), Producción escritorio (Madrid), Viewer móvil.

[Evidence JSON](P3-WAR-ROOM.json) contiene versiones, hashes de fuentes/migraciones, snapshot de origen, checks y resultado. [Capturas](P3-WAR-ROOM-UI/) contienen móvil, escritorio, oscuro, crítica abierta, resuelta, formulario, detalle e histórico y estado vacío.

| Gate | Resultado |
|---|---|
| Ledger completo + reaplicación idempotente de 094 | PASS |
| HTTP: anónimo, sin rol, Viewer, Aux sin vínculo/fuera de ámbito, Admin/Producción | PASS |
| Tarea/recurso de otro día, pertenencia/hierarquía e identidad/fecha/versiones manipuladas | PASS |
| RLS directo: visibilidad por fila y prohibición de INSERT/PATCH/DELETE/RPC con actor suplantado para todos los roles | PASS |
| Error de evento al crear/actualizar | 503, sin éxito parcial y sin filtrar detalle interno |
| UI ante error real de persistencia | No presenta éxito, conserva el borrador; reintento confirmado sin duplicado |
| Carrera con versión observada | Un 200 y un 409; un único evento de la revisión ganadora |
| Asignación, escalada, resolución, reapertura e histórico secuencial | PASS |
| Aux móvil crea → Producción consulta/resuelve → Aux observa → recarga | PASS con HTTP polling visible de 5 s |
| Filtros combinados, Viewer sin gestión, offline, cambio de cuenta sin reutilizar caché, archivo local, Dashboard revisable, enlace a tarea y Control Room | PASS |
| A2 y otros días | 266 obligaciones y todas las filas de tareas, eventos de ejecución, Stages, sesiones, locks, planes, recursos, asignaciones, preferencias y reloj permanecen literales |
| TypeScript / build / secuencia / focales (Node 20.20.2) | PASS; focales 10/10 |
| Suite de servidor, sin benchmarks de búsqueda (Node 20.20.2) | 308/308 PASS |

Se reutiliza `script/demo/fixtures/a2-legacy-import.json.gz`: jornada aceptada, Stage 10 y fingerprint `a58fc840fa4b8d04049c96d8310eac6e5d4df66f08069d968fe7a5e0adf9e2dc`. No se ejecuta una nueva búsqueda ni se certifica una nueva solución A2. El gate comprueba que gestionar incidencias conserva exactamente la planificación aceptada. `plan-details.tsx`, PlanningTimeline, Assisted Workspace, motor y budgets permanecen sin diff.

Reproducción (Node 20, Docker, Chromium):

```sh
npm ci
npx --no-install playwright install --with-deps chromium
node --import tsx --test server/incidents.spec.ts server/apiAuthorization.spec.ts server/liveExecution.spec.ts
node --import tsx script/demo/smokeA2Integration.ts work/war-room-p3 --historical-topology --war-room-snapshot
npm run check
npm run build
npm run check:migrations
```

El runner no acepta destino remoto, verifica loopback, genera credenciales locales y destruye sus servicios al terminar. El workflow `Persistent War Room` reproduce los checks y publica sólo JSON público y capturas; excluye logs privados y credenciales.

## DB Safe Merge y rollback conceptual

1. Revisar contrato y diff junto a este ensayo, grants/RLS y CI del head candidato.
2. Antes de adoptar 094 en un proyecto real: copia de seguridad verificada y aprobación del procedimiento operativo de migración. Esta unidad no aplica esa migración ni modifica el catálogo conectado.
3. Desplegar coordinadamente migración y backend/frontend; antes de 094 la API falla sin presentar guardados o indicadores ficticios.
4. Verificar con dos identidades del proyecto los ámbitos nominales reales, consulta y resolución; verificar la publicación `supabase_realtime` si existe.
5. Rollback: detener los comandos o volver al frontend anterior sin borrar tablas/eventos. Conservar/exportar el histórico y cualquier incidencia creada. No ejecutar un DROP automático ni volver a tratar las notas locales como autoridad. Las FK `RESTRICT` también bloquean borrados ordinarios del día o de referencias con incidencias.

## Límites

- La suite ampliada que incluye búsqueda en frío no se certifica localmente: un intento en Node 24 agotó ASST-010 y se interrumpió la repetición ampliada para no convertir esta unidad de persistencia en un benchmark del solver. La suite de servidor sin benchmarks pasa 308/308 en Node 20; la CI separa ese benchmark del gate de incidencias. No se modifican budgets ni contratos del motor.
- El transporte demostrado es polling HTTP cada 5 s; no se certifica entrega por WebSocket de Supabase Realtime. El canal se reutiliza cuando está disponible y mantiene reconciliación cada 30 s. La UI no promete instantaneidad.
- La visibilidad global de Producción/Admin/Viewer sigue la política existente de jornadas de esta aplicación; no se añade un modelo de organizaciones/tenants. Aux tiene la restricción nominal descrita.
- No hay importación de notas locales, borrado, tickets genéricos, alertas, predicción, ETA, informes post-día ni replanificación.
- La edición de incidencias resueltas requiere reapertura explícita. Los recursos vinculados a una tarea deben ser efectivos para ella; recursos desconocidos quedan sin informar.
- Las pruebas se realizan en servicios descartables. La adopción en Supabase real y la publicación Replit quedan fuera de esta entrega.

## Demostración de dos minutos

- **0:00–0:20:** abrir la misma jornada en móvil Aux y escritorio Producción; comprobar ámbito y aviso del transporte.
- **0:20–0:50:** registrar una crítica vinculada a una tarea en el móvil; guardar y mostrar confirmación del servidor. Ver aparecer la misma incidencia en escritorio.
- **0:50–1:15:** abrir detalle; mostrar autor, lugar e histórico. Filtrar por tarea y severidad; asignar responsable desde Producción.
- **1:15–1:40:** resolver con una decisión concreta. Ver resolución en móvil, recargar y comprobar que permanece.
- **1:40–2:00:** mostrar Viewer sin acciones, reabrir conservando la decisión anterior y abrir el enlace a la tarea. Señalar que el planning y el reloj no cambian.
