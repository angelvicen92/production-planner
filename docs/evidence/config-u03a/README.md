# U03a — autorización de escritura de plantillas

Fecha: 15 de octubre de 2026 (Europe/Madrid). Base: `977dbb3ef6244de022410e4d00036cd186c15aad`. Rama: `codex/config-u03a-authorize-template-writes` → `main`.

## Causa y corrección

Recorrido real reconstruido:

1. `client/src/pages/settings.tsx`, `TaskTemplatesSettings.saveEdit`: construye el PATCH principal. Las dependencias inversas también utilizan `api.taskTemplates.update.path`.
2. `client/src/hooks/use-tasks.ts`, `useUpdateTaskTemplate`: llama a `apiRequest`, que obtiene el token de sesión y envía `Authorization: Bearer …`.
3. `shared/routes.ts`, `api.taskTemplates.update`: `PATCH /api/ta/:id`, schema estricto y respuesta camelCase. No existe otro registro de handler que llame a `storage.updateTaskTemplate`.
4. `server/routes.ts`, `registerRoutes`: monta `createApiAuthorization` bajo `/api` antes de los handlers.
5. `server/middleware/requireAuth.ts`: valida el token con `supabaseAnon.auth.getUser`; sin token válido devuelve 401.
6. `server/apiAuthorization.ts`: en baseline `/ta/:id` no coincide con `/task-templates`; `apiRequiredRoles` devuelve `null` y el middleware continúa sin consultar el rol. El handler tampoco llama a `ensureAdmin`.
7. El handler valida el body y llama a `storage.updateTaskTemplate`. `server/storage.ts` traduce camelCase a columnas snake_case y ejecuta `supabaseAdmin.from('task_templates').update(...).eq('id', ...).select().single()`.
8. `server/supabase.ts` crea ese cliente con `service_role`, que evita RLS. La autorización de la API es por tanto necesaria antes de llegar al storage.

Hipótesis falsable: hacer que el alias real utilice la política de catálogo existente debe convertir las escrituras autenticadas no admin de 200 a 403, conservar la escritura válida del admin y no alterar registros ni snapshots en peticiones rechazadas.

El único cambio productivo añade ambas familias de plantilla (`ta` y `task-templates`) a la condición de catálogo, con límite de segmento y comparación insensible a mayúsculas. Reutiliza los roles y `getUserRole` existentes. El casing es necesario porque Express registra esos handlers sin `case sensitive routing`; proteger sólo `/ta` dejaría accesible el mismo handler por `/TA`. No se normalizan ni cambian otras familias de API.

No cambian endpoint, payload, handler, storage, UI, RLS, migraciones, configuración diaria, heurísticas ni motor.

## Baseline frente a candidato

La ejecución anterior al parche falló deliberadamente en la expectativa de seguridad: Production obtuvo 200 donde se exigía 403. La lectura SQL confirmó el cambio de la fila. La ejecución del candidato arranca también un segundo servidor desde un worktree del baseline sin modificar; ambos usan los mismos servicios descartables y la misma identidad/payload/fixture, restaurada entre escrituras autorizadas del experimento.

| Identidad | Baseline PATCH real | Candidato PATCH real | Cambio de registros en candidato |
|---|---:|---:|---|
| Admin | 200 | 200 | Sólo la plantilla de prueba |
| Production | 200 | 403 | Ninguno |
| Aux | 200 | 403 | Ninguno |
| Viewer | 200 | 403 | Ninguno |
| Autenticado sin rol | 200 | 403 | Ninguno |
| Sin autenticación | 401 | 401 | Ninguno |
| Token inválido | 401 | 401 | Ninguno |

La misma matriz se ejecuta por `/api/ta/:id`, `/api/TA/:id` y `/API/tA/:id/`: 42 peticiones PATCH entre baseline y candidato. Cada 200 comprueba respuesta, fila SQL y que sólo cambió `task_templates`. Cada rechazo compara recuento y hash del contenido completo, ordenado, de seis tablas: `task_templates`, `plan_task_template_snapshots`, `plans`, `daily_tasks`, `assisted_planning_stages` y `plan_config_revisions`. La base contiene 62 snapshots existentes; las comprobaciones no son vacías. La fixture nueva se elimina al terminar y se verifica el estado original.

También se comprueban GET del catálogo por rol, 20 denegaciones de POST/DELETE de plantillas (rutas canónicas y casing), payload admin inválido sin escritura y autorización anterior a la validación del payload para Production. Los tests HTTP focales garantizan que un rechazo no alcanza el handler y que el alias no captura `/target`.

## Compatibilidad de UI y límite U02

Chromium entra con contraseña como admin, abre Configuración → Plantillas, edita duración y abreviatura y pulsa el Guardar real. Usa el componente, hook y transporte existentes, sin interceptar peticiones. Se comparan el payload completo y el resultado entre baseline y candidato.

Se ha descubierto un fallo previo adicional de U02: el formulario completo incluye `zoneId`/`spaceId`; storage añade `location_label=null`, pero el ledger nativo no contiene esa columna en `task_templates`. El schema API admite el payload y PostgREST devuelve 400 por columna ausente. Este resultado debe ser idéntico en baseline y candidato, sin escritura y con recarga intacta. No se añade una columna artificial a la fixture ni una migración para hacer pasar la prueba.

El PATCH admin válido `{abbrev:'UI-U03A', defaultDuration:17}` sí devuelve 200, persiste ambos valores, devuelve camelCase y se recupera mediante GET. Las escrituras globales aceptadas conservan las jornadas y sus snapshots. U03a cierra la autorización; no afirma reparar el guardado completo, los márgenes ni el alta de U02.

## Reproducción y Evidence

`script/demo/smokeA2Integration.ts --template-authorization` reutiliza el harness nativo existente: PostgreSQL, GoTrue, PostgREST, ledger completo sin modificar, identidades con login por contraseña y servidor de producto. Sólo admite servicios locales; sobrescribe las variables Supabase del proceso hijo con credenciales recién generadas. No utiliza Supabase productivo. `--historical-topology` carga fixtures descartables, conserva el día previo de 266 obligaciones/11 Stages y las otras 333 tareas, y no ejecuta búsqueda ni nuevas propuestas en este modo.

```sh
git worktree add --detach work/u03a-baseline 977dbb3ef6244de022410e4d00036cd186c15aad
ln -s "$PWD/node_modules" work/u03a-baseline/node_modules
TEMPLATE_AUTHORIZATION_BASELINE_ROOT=work/u03a-baseline npm run demo:a2:smoke -- work/template-authorization --historical-topology --template-authorization
```

Requiere Docker y Chromium de Playwright. `Template Authorization CI` ejecuta esta comparación, el typecheck de integración y los tests de middleware en Node 20; publica sólo JSON de evidencia y capturas de la fixture, sin logs privados ni credenciales. `baseline.json` conserva la reproducción anterior al parche; `candidate.json` registra la ejecución verificada con su matriz y compatibilidad UI. Los hashes identifican las fuentes ejecutadas y el ledger.

Validación local: 31 tests focales de autorización/ejecución/incidentes/snapshots, TypeScript principal y de integración, comprobación de secuencia de migraciones y build. Los resultados remotos corresponden a los checks del PR; no se sustituye CI por una afirmación local.

## Rutas revisadas y trabajo separado

| Ruta/operación | Hallazgo y tratamiento |
|---|---|
| PATCH `/api/ta/:id` y dependencias inversas | Único caller HTTP de `updateTaskTemplate`; cerrado en U03a, incluido casing y slash final. |
| POST/DELETE `/api/task-templates` | Política admin existente reutilizada; pruebas negativas reales, incluido casing. |
| DELETE `/api/zones/:id` y `/api/spaces/:id` | Actualizan referencias de plantilla al eliminar ubicación; prefijos canónicos admin. La clasificación de `/ZONES` y `/SPACES` devuelve null: posible bypass por casing fuera de plantillas, pendiente de unidad separada. No se ejecutan borrados para explotarlo ni se amplía U03a. |
| POST `/api/plans/:id/manual-block` | Permite admin/production por ámbito diario; si falta `manual_block`, inserta un default global fijo. No permite PATCH arbitrario de una plantilla existente. Revisar esa autoridad global como trabajo separado. |
| PUT `/api/vocal-coach-rules` | Clasificación null y sin gate adicional localizado, ya señalado en P1. Pendiente de otra unidad; sin mutaciones de prueba aquí. |
| PATCH `/api/control-room-settings` | Clasificación null pero handler con `ensureAdmin`; no se presenta como bypass. |

Backlog explícitamente separado, conservando las unidades de [P1](../../audit/configuration-p1/06-capabilities-backlog.md): U02 (márgenes, alta/edición lossless y `location_label`); U04 (composición itinerante); U05 (controles 0–10 sin consumidor demostrado); U11 (limpieza/separación de catálogos). Ninguno se implementa en este PR.

Límites: esto certifica la ruta HTTP de plantillas en servicios descartables con el ledger del repositorio; no certifica RLS/grants, accesos REST directos, Realtime ni estado del despliegue productivo. La clasificación general todavía permite `null` para otras familias; este cambio no es un cierre integral de todas las rutas de la auditoría. No se hace merge ni se publica en Replit.

Autoridad consultada: `AGENTS.md`; Fuentes 00 v2.12, 01 v5.2 (§12), 04 v2.7 (§11.4/§20.17), 05 v2.7 (§5) y 07 v2.2; auditoría P1 README, 01, 04 y 06. La Evidence local no eleva el estado global de ninguna capability ni altera las 266 obligaciones A2.
