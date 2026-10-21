# Autorización de catálogos globales — cierre posterior a U03a

Fecha: 21 de octubre de 2026 (Europe/Madrid). Base inmutable: `a6ab898a0d443be17e3ef4a33d09a5e1cdbe456a`. Rama: `codex/catalog-write-authz-case-hardening` → `main`. Unidad independiente de U06a; sin merge ni despliegue.

## Autoridad y causa demostrada

Lecturas: `AGENTS.md`; `docs/governance/OPTIPLAN_MASTER_ADECUACION_APP.md`; Fuentes 00 v2.13 (autoridad por ámbito), 01 v5.2 (§12 y perfiles Admin/Producción/Aux/Viewer), 04 v2.7 (§11.4 y §20.17), 05 v2.7 (§5, gate proporcional), 07 v2.2 (método causal); `docs/evidence/config-u03a/README.md`. Se conserva la política existente: ADMIN configura catálogos globales; admin/production editan reglas del plan; admin/production/aux/viewer leen catálogos. Autenticación sin rol no concede autoridad de catálogo.

Recorrido real:

1. `shared/routes.ts` declara `PUT /api/vocal-coach-rules`, `PATCH/DELETE /api/zones/:id` y `PATCH/DELETE /api/spaces/:id`.
2. `server/routes.ts:registerRoutes` monta `createApiAuthorization({authenticate:requireAuth,lookupRole:getUserRole,authorizeTask:canExecuteTask})` bajo `/api`, antes de registrar los handlers.
3. `requireAuth` valida el JWT mediante Auth; `getUserRole` obtiene el rol vigente. Una clasificación `null` sólo autentica y deja continuar, sin consultar el rol.
4. El catálogo vocal global carecía de clasificación y de guard ADMIN localizado. Su handler usa `supabaseAdmin` para DELETE global seguido de INSERT.
5. Zonas/espacios canónicos ya exigían ADMIN, pero su clasificación comparaba prefijos con casing sensible. Express usa matching insensible a mayúsculas y admite slash final. `/API/ZONES/:id` y `/API/SPACES/:id` alcanzaban los mismos handlers sin la clasificación.
6. PATCH delega en storage; DELETE usa `supabaseAdmin` y puede limpiar referencias de plantillas/tareas antes de borrar. `service_role` evita RLS; la denegación debe ocurrir en middleware.

**Hipótesis falsable:** completar exclusivamente esa clasificación cambia a 403 las escrituras autenticadas no ADMIN que antes persistían; ADMIN sigue obteniendo 200 con persistencia real; ningún rechazo llega a consultas del handler ni cambia el contenido público.

## Delta productivo

Sólo cambia una condición y su comentario en `server/apiAuthorization.ts`: amplía el matcher insensible a casing, con límite de segmento, de plantillas a `zones|spaces`, y añade el endpoint global exacto `vocal-coach-rules` con slash final opcional. Reutiliza sin cambios autenticación, lookup de rol, middleware y listas de permisos. No se convierte todo `/api` a minúsculas ni se cambia la política general de rutas no clasificadas.

El patrón vocal es global y exacto: no captura `/plans/:id/vocal-coach-rules` ni `/vocal-coach-rules-extra`. Zonas/espacios conservan su límite de segmento y la autoridad de catálogo de sus subrutas. `/zones-extra` y `/spaces-extra` no coinciden y devuelven 404 en los handlers reales.

GET conserva acceso para los cuatro roles existentes, tanto canónico como con casing y slash final. Se elimina también la lectura accidental sin rol de las variantes que antes no se clasificaban; utiliza la lista de lectura de catálogo ya existente, sin crear roles o permisos nuevos. Sin sesión/token válido se sigue devolviendo 401.

No cambian handlers, persistencia, contratos/payloads, fuentes oficiales, modelo, migraciones, U06a, motor, permisos diarios, configuración del día ni UI.

## Matriz HTTP antes/después

Cada celda corresponde a handlers reales con Auth por contraseña, PostgREST y PostgreSQL descartables. Se prueban ruta minúscula, slash final, mayúscula y mezcla de casing con slash final, incluyendo `/API`.

| Identidad | PUT global antes | PATCH/DELETE zonas/espacios minúscula antes | PATCH/DELETE casing antes | Escrituras candidato, todas las variantes |
|---|---:|---:|---:|---:|
| ADMIN | 200 | 200 | 200 | 200 |
| Production | 200 | 403 | 200 | 403 |
| Aux | 200 | 403 | 200 | 403 |
| Viewer | 200 | 403 | 200 | 403 |
| Autenticado sin rol | 200 | 403 | 200 | 403 |
| Sin sesión | 401 | 401 | 401 | 401 |
| Token inválido | 401 | 401 | 401 | 401 |

Los 200 se comprueban contra SQL: PATCH cambia nombre y devuelve identidad correcta; DELETE elimina una fila nueva real; PUT sustituye reglas no vacías y persiste el cambio de orden. Entre peticiones se restaura la misma fixture, incluidos IDs, y se comprueba su igualdad. No se usa un ID inexistente para simular un borrado exitoso.

Cada rechazo compara recuento y hash del contenido ordenado de **todas las tablas públicas**, y comprueba la traza real de PostgREST: sólo se permiten GET de `user_roles` para el lookup del middleware; cero consultas de handler y cero peticiones mutantes. El test focal añade un contador de invocaciones de handler y lookup por petición. La conservación no se basa sólo en comparar recuentos.

La base contiene tareas, Stages y snapshots históricos reales de la fixture del repositorio; las comprobaciones no son vacías. No se ejecuta nueva búsqueda ni Full A2. La restauración final exige igualdad de contenido de todas las tablas públicas frente al estado original anterior a las fixtures del experimento.

Regresiones proporcionales: GET por siete identidades y variantes; prefijos falsos con 404; PUT real del plan mantiene admin/production; PATCH real del alias U03a sigue reservado a ADMIN; payload inválido de ADMIN devuelve 400 sin mutación y Production recibe 403 antes de validación. Los tests focales existentes cubren ejecución, correcciones, reset, contratos de plantilla y aceptación Assisted (incluyendo revocación de rol).

## Reproducción

La primera ejecución se hizo **antes de editar código productivo**, con `--catalog-authorization-baseline`. Registró la matriz y escrituras efectivas; el nuevo test focal también falló sobre ese baseline por ausencia de clasificación/lookup. La ejecución comparativa arranca un segundo servidor desde un worktree inmutable de la misma base, usando los mismos servicios, identidades, payloads y fixtures restauradas.

```sh
git worktree add --detach work/catalog-authz-baseline a6ab898a0d443be17e3ef4a33d09a5e1cdbe456a
ln -s "$PWD/node_modules" work/catalog-authz-baseline/node_modules
# Antes del parche productivo:
npm run demo:a2:smoke -- work/catalog-authz-before --historical-topology --catalog-authorization-baseline
# Con el candidato:
CATALOG_AUTHORIZATION_BASELINE_ROOT=work/catalog-authz-baseline npm run demo:a2:smoke -- work/catalog-authz-after --historical-topology --catalog-authorization
```

Requiere las dependencias del lockfile y Docker local. Reutiliza el harness nativo existente y el ledger completo sin modificar. El harness sobrescribe las variables Supabase del hijo con URL loopback y credenciales generadas para esa ejecución; sólo admite servidores locales. No realiza peticiones mutantes contra Supabase productivo.

## Riesgos separados y límites

- **Atomicidad vocal preexistente:** DELETE e INSERT son dos peticiones independientes. Si falla la inserción tras un borrado correcto, el catálogo puede quedar vacío; un GET concurrente puede ver el intervalo vacío, y dos reemplazos concurrentes pueden interferir. La autorización reduce quién puede iniciar esa secuencia; no la hace atómica. Debe cerrarse en una unidad separada, sin rediseñar persistencia aquí.
- Las demás familias con clasificación `null` o diferencias de casing quedan fuera del cierre; no es una auditoría integral de autorización.
- Esta Evidence certifica la frontera HTTP de estas rutas y conservación SQL local. No certifica REST directo/RLS/grants de producción, Realtime, despliegue Replit ni uso productivo publicado.
- Los hashes cubren contenido de tablas públicas, no secuencias ni estado interno Auth. Las peticiones rechazadas no envían ninguna escritura PostgREST; los experimentos autorizados sí consumen secuencias locales, que desaparecen al eliminar los contenedores.

## Resultado local y CI

- Reproducción inicial antes del parche: **140 escrituras HTTP + 84 lecturas**, conservación final verificada.
- Comparación final: **545 peticiones HTTP**: 140 escrituras baseline, 140 candidato, 168 lecturas, 91 de rutas vecinas/plantillas y 6 payloads inválidos. Siete identidades, cuatro variantes por ruta de catálogo.
- Contenido observado: **60 tablas públicas**, **865 tareas**, **11 Stages**, **62 snapshots de plantilla**. Cada denegación sin cambios; fixtures eliminadas y estado inicial restaurado íntegramente.
- **50 tests focales PASS**, TypeScript principal e integración PASS, secuencia de migraciones PASS y build PASS (avisos de tamaño de bundle).
- Entorno local Node 24.19.0; CI fija Node 20. No se ejecutó búsqueda/Full A2 para este gate: el cambio no altera planner ni input.

Artefactos: [matriz inicial](baseline-matrix.json), [matriz final](candidate-matrix.json), [traza HTTP y fingerprints iniciales](baseline-http-sql.json.gz), [traza final](candidate-http-sql.json.gz), [metadatos iniciales](baseline-integration.json.gz), [metadatos finales](candidate-integration.json.gz), [tests](catalog-focal-tests.log), [fallo focal anterior](catalog-middleware-before.log) y [manifest de integridad](manifest.json). Los JSON comprimidos conservan hashes de runtime y ledger, recuentos/hashes por petición y traza REST sin credenciales. Los logs privados de servidor no se versionan.

`Catalog Authorization CI` reproduce esta comparación en servicios nativos descartables y publica los JSON de Evidence; `Baseline CI` verifica TypeScript, migraciones y build. El PR permite consultar el estado remoto exacto del head; un resultado local no sustituye ese estado ni acredita despliegue. Los workflows generales existentes pueden activarse automáticamente por sus filtros amplios; no se amplía este gate a modificarlos ni a solicitar Full A2 manualmente.
