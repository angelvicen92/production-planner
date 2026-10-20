# P11 — Seguridad y disponibilidad de Data API

Base: `5f3052d3f520535502ca76e205aea6e9cd9a144e`. Rama: `codex/ops-p11-supabase-data-api-grants`. Clasificación: DB Safe Merge, CONFIG_NEUTRAL. Fuentes: 00 v2.13, 01 v5.2, 04 v2.7 (11.4 y 20.17), 07 v2.2.

## Problema y corrección

Una instalación nueva sin grants automáticos ejecuta 001–099 correctamente, pero `GET /rest/v1/plans?select=id&limit=1` con service_role devuelve **403 / 42501**. El cliente Admin del servidor también utiliza PostgREST: BYPASSRLS no sustituye SELECT/INSERT/UPDATE/DELETE ni USAGE de secuencias.

La 100 incorpora los grants requeridos por las rutas actuales, sin cambiar 001–099, las políticas, firmas, cuerpos RPC ni el motor. Concede permisos por objeto y operación; mantiene los UPDATE por columna y las prohibiciones de DELETE en Stages, excepciones, eventos, incidentes y cabeceras. No introduce TRUNCATE, GRANT ALL, privilegios anon ni escrituras authenticated. Los siete snapshots que ya tenían ALL conservan ese permiso histórico; esta tarea no los revoca.

La 100 también activa RLS en doce tablas que el ledger histórico deja deshabilitadas. Once se protegían mediante el bundle separado `script/demo/sql/security.sql`; engine_plan_results tampoco estaba cubierto allí. La consulta de **solo lectura** del proyecto `dyqusivzgxebkxkwohwn` confirma que producción ya tiene 60/60 tablas con RLS, ocho sin policies y plan_summaries como security_invoker. No se aplica ningún cambio a ese proyecto. El endurecimiento afecta a la reconstrucción incompleta del ledger y conserva BYPASSRLS del servidor; no inventa policies para las tablas privadas.

La migración se creó con la CLI oficial 2.81.3 (`migration new data_api_explicit_grants`) y se adaptó al convenio NNN obligatorio del repositorio. Se aplica dos veces en cada ensayo para comprobar idempotencia.

## Qué autoriza cada grant

- SELECT/INSERT/UPDATE/DELETE service_role se limita a las operaciones que realizan storage y los handlers. Los invocadores SQL necesitan además los objetos que leen o escriben: por ejemplo, eventos de ejecución SELECT/INSERT, y DELETE de plan_breaks durante el refresco versionado. No se concede UPDATE/DELETE de eventos auditados.
- USAGE en veinte secuencias serial permite los INSERT auditados. No se concede SELECT ni UPDATE de secuencias nuevas; las identity no necesitan USAGE para su asignación interna. Los grants explícitos de secuencias anteriores se mantienen.
- SELECT authenticated en plans, daily_tasks, locks y planning_runs permite las suscripciones del navegador. operational_incidents ya tiene su grant en 094. Sus policies siguen decidiendo las filas visibles; no se infiere acceso de una claim editable por el usuario.
- EXECUTE service_role en hhmm_to_minutes, positive_integer_jsonb_array, is_positive_integer_jsonb_array y valid_planning_header_lines permite evaluar la vista y los CHECKs. Eran ejecutables por PUBLIC con los defaults anteriores. No se abre ninguna RPC privilegiada a clientes.
- resources y user_preferences son legacy sin consumo Data API actual: se mantienen sin grants en una instalación restringida. Los favoritos vigentes utilizan plans.is_favorite. No se concede acceso sólo porque producción conserve un grant histórico.

[PRIVILEGE_MATRIX.md](PRIVILEGE_MATRIX.md) detalla las 60 tablas, una vista, 47 secuencias y 53 funciones públicas, creador, consumidores, roles efectivos, columnas y policies. [source-calls.json](source-calls.json) conserva los call sites de supabase-js. El contrato revisable de permisos está en `script/demo/fixtures/data-api-privileges.json`.

## Reproducción y gate permanente

El harness existente crea exclusivamente PostgreSQL 17, GoTrue y PostgREST locales en Docker con credenciales aleatorias y puertos loopback. No consume DATABASE_URL ni claves Supabase del entorno para elegir el destino. El servidor hijo recibe únicamente las credenciales recién creadas. Las imágenes mantienen los digests fijados del harness.

`--restricted-data-api` modifica sólo el bootstrap de esa base descartable: tablas y secuencias sin privilegios por defecto, y funciones sin EXECUTE de PUBLIC ni de los roles API. Ejecuta literalmente 001–099, registra el fallo nativo y después aplica 100 y todas las migraciones futuras. Una segunda base local reconstruye 001–099 con los defaults históricos, aplica 100 y comprueba que todos los privilegios efectivos anteriores se conservan. Las tablas incompletas pasan a RLS; las policies y definiciones RPC se comparan literalmente.

El gate comprueba:

1. El catálogo real completo —incluyendo permisos heredados de PUBLIC y grants de columnas— coincide con el contrato revisado; una tabla nueva necesita registrarse deliberadamente.
2. Los call sites descubiertos con el AST TypeScript disponen de los permisos efectivos necesarios. Los .from dinámicos de administración se ejercen por HTTP real.
3. Cada uno de los 59 objetos legibles por service_role responde a una llamada PostgREST real. Los roles cliente se prueban de nuevo después del import y del bundle histórico de seguridad.
4. Una tabla nueva con RLS y policy SELECT, pero sin grant, falla con 42501. Después del grant se puede leer; al retirar la policy la lectura authenticated devuelve cero filas con HTTP 200. Se distingue falta de grant de filtrado RLS; tokens inválidos se clasifican aparte como 401/PGRST301 o rechazo de Auth.
5. Retirar SELECT de plans hace fallar tanto el contrato como la comprobación de call sites. Conceder SELECT/INSERT anon hace fallar el contrato y la comparación de seguridad. Las mutaciones son locales y se revierten.
6. La matriz HTTP/Auth incluye anon, sin rol, viewer, aux, production y admin; se prueban promoción, descenso y revocación con el mismo JWT y limpieza de un usuario descartable mediante el endpoint administrativo real. Hoja del día se carga en Chromium con datos y peticiones reales.

El workflow `data-api-grants-ci.yml` se ejecuta en todos los PR contra main, sin filtros que excluyan migraciones futuras. Sus seis jobs usan fixtures independientes y Node 20. Assisted recorre once Stages y la validación manual; otro ensayo independiente verifica aceptación REQUIRED. Los demás jobs cubren configuración, snapshots, Mi Día/ejecución y rectificaciones, Control Room, War Room y cabeceras.

Para una migración futura: crear su tabla con RLS, policies y grants explícitos según consumidores; conceder USAGE sólo si requiere nextval de una secuencia serial; limitar EXECUTE de las funciones a sus actores. Actualizar deliberadamente el contrato de permisos y añadir su recorrido funcional. Nunca regenerar el contrato para silenciar un fallo sin auditar qué acceso se está autorizando.

```sh
npm run demo:a2:smoke -- /tmp/p11 --restricted-data-api --workspace-setup
npm run demo:a2:smoke -- /tmp/p11-assisted --restricted-data-api --full --manual-validation --transport-policy
npm run demo:a2:smoke -- /tmp/p11-required --restricted-data-api --manual-required-replay=/tmp/p11-assisted/manual-validation-baseline.json
npm run demo:a2:smoke -- /tmp/p11-execution --restricted-data-api --historical-topology --time-corrections
```

## Seguridad y disponibilidad son comprobaciones diferentes

La reconstrucción restringida no concede lectura ni escritura anon en ningún objeto public. authenticated tiene doce lecturas tras la 100, ninguna escritura de tabla; la RLS limita las filas. El ensayo A2 preexistente aplica después quince grants SELECT con policies restrictivas: son un overlay auditado por separado, no permisos nuevos de la 100. Quedan ocho tablas sin policies, accesibles sólo por el servidor según sus grants.

La instalación histórica conserva sus 45 objetos SELECT anon en producción, sujetos a RLS. No se revocan en esta unidad. Una reconstrucción nueva puede devolver 401/42501 donde una instalación histórica devuelve 200 con cero filas: ambos rechazan la lectura de datos, pero el mecanismo es distinto. El ensayo existente se ajusta exclusivamente para exigir ese rechazo de anon bajo el nuevo bootstrap; las aserciones de lectura y denegación de los demás actores se mantienen.

La conexión PostgreSQL directa de administración y las consultas de auditoría no se confunden con PostgREST. El gate no restaura grants generales para ocultar fallos ni cambia la identidad de una RPC a SECURITY DEFINER para eludir permisos.

## Advisor y límites independientes

[production-advisors.json](production-advisors.json) recoge únicamente metadatos de una consulta remota de solo lectura. Continúan los seis avisos [function_search_path_mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable). No causan la retirada de grants automáticos y las definiciones de funciones se conservan.

Los ocho avisos [RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) corresponden a tablas del servidor; no se añaden policies para abrirlas. Los avisos de descubribilidad GraphQL (45 anon, 54 authenticated), has_role SECURITY DEFINER y protección de contraseñas quedan registrados como hallazgos independientes. No se amplían ni se corrigen de forma incidental.

Se preservan las concesiones históricas existentes; no se pretende una limpieza general de privilegios. Realtime se valida en su requisito SELECT/RLS y mediante los recorridos con HTTP polling del harness; la entrega WebSocket de Supabase Realtime no forma parte de esta pila local.

## Operación y rollback conceptual

La entrega es un PR, sin merge ni despliegue. Antes de un despliegue posterior debe respetarse la secuencia 098 → 099 → 100. No se deben revocar defaults del proyecto real para repetir la prueba.

La 100 no modifica filas ni transforma configuraciones. Un rollback no debe hacer REVOKE masivo ni desactivar RLS: puede retirar permisos que ya existían antes de aplicar la 100. Si se revierte un despliegue futuro, comparar primero sus ACL previas por objeto/columna y mantener las protecciones existentes. El gate y la aplicación previa pueden coexistir con la migración aditiva.

## Fuentes oficiales externas

- [Cambio Supabase y calendario del 30/10/2026](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- [Securing your API: grants y RLS](https://supabase.com/docs/guides/api/securing-your-api).

La verificación técnica y sus resultados finales se conservan en `validation.json` y los informes nativos adjuntos a esta carpeta/artefactos CI. Nunca se incluyen app-private.log, claves ni tokens en los artefactos publicados.
