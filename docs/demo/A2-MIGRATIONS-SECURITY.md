# Esquema y seguridad para la demo A2

Esta propuesta está preparada y probada localmente; **no se ha aplicado en remoto**. El destino de pruebas está confirmado, pero el usuario exige aprobación específica para schema, permisos y carga.

## Evidencia remota obtenida

GET REST del 10 de octubre de 2026: cuatro jornadas, 47 concursantes, 333 tareas, 278 runs. No hay colisiones en los IDs propuestos. Faltan columnas de transición, márgenes, contrato Planner Next y snapshots operativos 076. `plan_resource_bundle_snapshots` devuelve 404. Anon puede leer filas de `spaces`, `daily_tasks` y `plan_resource_items` (HTTP 200); la inspección aportada por el usuario indica 15 tablas sin RLS y grants amplios. La lectura de OpenAPI anon no expone RPCs; eso no prueba todos sus permisos PostgreSQL.

El usuario confirma después que ChatGPT ejecutó `catalog-audit.sql` mediante la conexión Supabase en modo de solo lectura: 56 tablas, 575 columnas, 26 funciones, 70 políticas y 15 tablas sin RLS. El catálogo es accesible; queda exportar su JSON completo y contrastar tipos, firmas, cuerpos, grants y políticas. No se considera hecha esa comprobación a partir del recuento. La exportación y las operaciones posteriores están detalladas por orden en [A2-IMPORT-PROCEDURE.md](A2-IMPORT-PROCEDURE.md).

## Adopción del esquema

| Dependencia | Cambio preparado | Protección de datos actuales |
| --- | --- | --- |
| 076 con drift | Añadir columnas espaciales ausentes y tabla de bundles por día | Sin backfill, sin UPDATE de snapshots anteriores; columnas nuevas espaciales nullable para legacy |
| 086 | Bootstrap/apply/accept conservan assignedResourceIds | Snapshot S0 compara también recursos; writer interno no callable desde REST |
| 087 | Transición, márgenes y funciones de configuración | Sin convertir filas v1 a v2; constraint admite ambas versiones; columnas y semántica nuevas aditivas |
| 088 | JSON nullable por jornada, shape constraint y trigger | NULL en jornadas anteriores; contrato nuevo inmutable |
| Contratos Assisted | Reconciliar 14 cuerpos oficiales y grants servidor | Sin DML ejecutado al instalar funciones; preflight compara cuerpos, no solo nombres |

`demo:a2:prepare-schema` genera un único `schema.sql` transaccional. No equivale a aplicar ciegamente todos los históricos. Preservar el catálogo original, revisar sus diferencias y comprobar compilación y constraints antes de autorizar. Cambios inesperados de tipo, firma o nombre de parámetros hacen abortar la adopción; requieren adaptar el parche. No se actualiza artificialmente el registro de migraciones de Supabase para ocultar el drift.

La prueba local representa schema Drizzle más columnas históricas y el drift observado por REST. El fixture es exclusivamente de tests, no un bootstrap Supabase. Verifica rollback de adopción, conservación de campos antiguos y contract_version=1, carga con cuatro jornadas, canon, defaults, secuencias adelantadas, rechazo de repetición/clave duplicada y rollback tras fallo tardío. Ejecuta el RPC real de bootstrap y el writer interno para probar persistencia física; no equivale a un login ni a diez aceptaciones remotas.

## Matriz propuesta

Se aplica a las 15 tablas enumeradas en `script/demo/sql/security.sql`. El navegador usa Supabase para Auth y la API OPTIPLAN para datos. El servidor usa service_role; sus handlers deben autorizar antes de acceder.

| Identidad | REST SELECT | REST INSERT/UPDATE/DELETE | API lectura de día | API planificación/tareas | API catálogo global | API debug |
| --- | --- | --- | --- | --- | --- | --- |
| Anónimo | Sin filas | Denegado/sin filas afectadas | 401 | 401 | 401 | 401 |
| Auth sin rol | Sin filas | Denegado/sin filas afectadas | 403 | 403 | 403 | 403 |
| viewer | Sí | Denegado/sin filas afectadas | Sí | 403 | Lectura | 403 |
| aux | Sí | Denegado/sin filas afectadas | Sí | 403 | Lectura | 403 |
| production | Sí | Denegado/sin filas afectadas | Sí | Sí | Lectura | 403 |
| admin | Sí | Denegado/sin filas afectadas | Sí | Sí | Lectura/escritura | Sí |
| service_role | Según grants existentes | Según grants existentes | Backend | Backend | Backend | Backend |

Las políticas restrictivas TO PUBLIC limitan los grants/policies permisivos previos; no se eliminan políticas ajenas ni se revocan grants indiscriminadamente. La política de lectura autorizada se crea antes de habilitar RLS. Las escrituras REST directas quedan bloqueadas incluso para admin/production: usan la API, que registra y aplica los contratos. No se amplían privilegios service_role. Se exige BYPASSRLS; cualquier grant servidor insuficiente debe revisarse antes de abrir la demo.

Los tests SQL ejecutan la matriz contra las 15 tablas, con una política permisiva legacy TO PUBLIC y grants amplios deliberados: anon, auth sin rol y los cuatro roles; lectura, INSERT, UPDATE, DELETE y bypass servidor. La prueba HTTP usa el middleware real y autenticación/rol simulados: 401/403, ausencia de writes cuando se deniega, bootstrap del primer login y operaciones autorizadas. **La matriz remota con JWT reales sigue pendiente.**

Esto no crea aislamiento entre usuarios por jornada: el modelo actual permite a los roles autorizados leer todas las jornadas. El aislamiento A2 protege su grafo de datos y los snapshots anteriores. No se promete una separación multi-tenant que OPTIPLAN no tiene.

## Comprobaciones remotas posteriores, todavía pendientes

Después de publicar esta versión y aplicar cambios aprobados: login de usuarios con roles ya existentes, GET de día/recursos, read-only RPC/grants audit, inicio/propuesta/validación/aceptación de A2 y pruebas negativas de acceso con anon/auth sin rol/viewer. Los tests destructivos de permisos deben usar una copia local o rollback controlado, nunca tareas de las jornadas existentes. Para la demo real solo se permiten writes al nuevo plan, con consentimiento específico. Inspeccionar logs y comparar el baseline de las jornadas anteriores tras el ensayo.

## Rollback y criterio de apertura

`demo:a2:security-rollback -- <directorio-del-catálogo-original>` genera el rollback que elimina solo las cinco políticas nuevas por tabla, restaura RLS disabled donde estaba disabled y revoca únicamente el SELECT authenticated añadido cuando no existía. Requiere `optiplan.security_rollback_approved='yes'` y destino confirmado. Restaura la exposición anterior; no ejecutarlo por comodidad ni abrir la demo en ese estado. No incluye borrado de filas.

Para schema, preferir volver atrás el código manteniendo las adiciones compatibles. Un down físico debe prepararse contra una copia restaurada del backup y aprobarse después de verificar dependencias y datos posteriores; no ejecutar un DROP genérico ni un restore completo sobre la base compartida. Las transacciones fallidas de esta adopción revierten schema, carga y RESTART de secuencias.

Abrir la demo solo tras preflight PASS, versión de API con la nueva autorización publicada, carga verificada, login real y ensayo. No se considera cerrado ningún gate remoto por el resultado de un test local.
