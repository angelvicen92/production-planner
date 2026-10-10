# A2 en el Supabase de pruebas existente

Destino confirmado por el usuario: **planificador_audiovisual / `dyqusivzgxebkxkwohwn`**. La fecha preparada es **2026-10-30**; el importador acepta otra fecha explícita. La identificación del destino no autoriza aún escrituras: esquema, seguridad, carga y cualquier alta de usuario requieren aprobación específica. **A2 todavía no está cargado ni probado en Supabase/Replit.**

La jornada nueva es `27001`: C01–C19, 266 obligaciones pendientes (247 productivas + 19 Sodexo), 23 espacios/zonas, nueve recursos y todas las autoridades del canon. No se importan horarios resueltos, etapas ni ejecuciones. Los defaults globales quedan fuera del dataset. Horarios, plantillas y optimizador se materializan en snapshots de la jornada; la procedencia de los overrides del plan registra al operador Auth que realiza la carga.

## Versión publicable

Usar el PR **#1105**, rama **`codex/optiplan-a2-import-demo`**, ahora contra **`main`**. Ya no requiere fusionar #1104. Incluye los componentes productivos necesarios para el A2 certificado; los diagnósticos experimentales de ASST-010 y CP-SAT quedan fuera del árbol entregado. No promete resolver el recorrido alternativo bloqueado de ASST-010. El humano continúa proponiendo, aplicando, validando y aceptando cada alcance.

## Preparación y backup, sin escrituras remotas

Desde esa rama, con las variables actuales del mismo Supabase para cliente y servidor:

```sh
npm ci
npm run demo:a2:prepare-import -- 2026-10-30 work/a2-existing
npm run demo:a2:prepare-schema -- work/a2-existing
npm run demo:a2:audit -- dyqusivzgxebkxkwohwn 2026-10-30 work/a2-existing
mkdir -p work/a2-existing/before
pg_dump "$DEMO_DATABASE_URL" --format=custom --no-owner --file=work/a2-existing/before.dump
pg_restore --list work/a2-existing/before.dump > work/a2-existing/before/backup-list.txt
psql "$DEMO_DATABASE_URL" --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 \
  -f script/demo/sql/catalog-audit.sql > work/a2-existing/before/catalog-audit.json
npm run demo:a2:security-rollback -- work/a2-existing/before
```

`DEMO_DATABASE_URL` es una conexión PostgreSQL privada al proyecto confirmado, tomada de su panel; no se imprime ni se guarda en Git. Comprobar el host `db.dyqusivzgxebkxkwohwn.supabase.co`, o el pooler y su usuario `postgres.dyqusivzgxebkxkwohwn`. En el editor SQL comprobar el proyecto seleccionado. Las credenciales REST disponibles en Codex no proporcionan esta conexión: la inspección de catálogos sigue pendiente hasta disponer de acceso SQL. Se puede ejecutar `catalog-audit.sql` en el editor y guardar su única salida JSON. No crear un RPC de inspección en la base.

Comprobar que el archivo de backup es recuperable con un restore en una copia local. El dump y `private-baseline.json` contienen información existente: mantenerlos privados, fuera de commits y paquetes públicos. La lectura REST no sustituye al backup PostgreSQL.

Revisar el catálogo original y el diff de `schema.sql`: columnas/tipos/defaults, constraints, triggers, secuencias, firmas/cuerpos/permisos de RPC, políticas y rol `service_role BYPASSRLS`. Si aparece un requisito distinto de los documentados, detener el despliegue y adaptar el parche. No inferir compatibilidad del número 085. Guardar ese catálogo original antes de aplicar la seguridad; sirve para generar su rollback exacto.

## Esquema y seguridad, solo tras aprobación específica

El orden de adopción es: reparar el drift de **076**, instalar la persistencia de recursos de **086**, adoptar **087 sin reescribir snapshots v1**, añadir **088**, reconciliar los 14 contratos Assisted con sus cuerpos oficiales y aplicar la seguridad preparada. `schema.sql` hace la adopción en una transacción; no ejecuta el backfill de 076 ni el UPDATE de contract_version de 087. Las columnas antiguas y los snapshots v1 se conservan. El normalizador ya acepta v1 y v2. No volver a ejecutar los históricos 076/087 después de este procedimiento, ni usar `db:push`.

En una sesión SQL del destino, con los valores reales revisados:

```sql
SET optiplan.confirmed_demo_project = 'dyqusivzgxebkxkwohwn';
SET optiplan.backup_sha256 = '<sha256-del-before.dump>';
SET optiplan.schema_approved = 'yes';
-- Ejecutar el contenido de work/a2-existing/schema.sql en esta misma sesión.
```

Para seguridad, en otra operación aprobada:

```sql
SET optiplan.confirmed_demo_project = 'dyqusivzgxebkxkwohwn';
SET optiplan.backup_sha256 = '<sha256-del-before.dump>';
SET optiplan.security_approved = 'yes';
-- Ejecutar script/demo/sql/security.sql en esta misma sesión.
```

Los settings son declaraciones del operador; no verifican por sí solos el host ni la autorización humana. La variante con `psql` consiste en guardar estos SET en un archivo privado de sesión y usar `psql "$DEMO_DATABASE_URL" -v ON_ERROR_STOP=1 -f sesion.sql -f archivo.sql`; ambos archivos se ejecutan en la misma conexión. Nunca sustituir valores pendientes por tokens ficticios.

La matriz y el rollback están en [A2-MIGRATIONS-SECURITY.md](A2-MIGRATIONS-SECURITY.md). Las políticas se crean antes de habilitar RLS. Son restrictivas para limitar políticas antiguas permisivas; los writes de la aplicación continúan con el rol servidor después de autorización en la API. No abrir la demo con una versión anterior de la API: esta entrega cierra el bypass de login en debug y los writes sin rol en daily-tasks.

## Preflight final y carga, solo tras aprobación de datos

Después de las operaciones aprobadas, refrescar la evidencia de lectura (vigencia máxima 15 minutos):

```sh
npm run demo:a2:audit -- dyqusivzgxebkxkwohwn 2026-10-30 work/a2-existing
psql "$DEMO_DATABASE_URL" --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 \
  -f script/demo/sql/catalog-audit.sql > work/a2-existing/catalog-audit.json
npm run demo:a2:preflight -- work/a2-existing 2026-10-30 work/a2-existing/before.dump
```

No cargar salvo `readyForApprovedImport: true` y aprobación específica. El preflight comprueba host cliente/servidor, backup custom no vacío, esquema, cuerpos y permisos RPC, secuencias, constraints, políticas y colisiones. El importador vuelve a comprobar IDs y claves, actor autorizado y defaults dentro de la transacción. Conserva todas las filas anteriores de las tablas tocadas; un efecto inesperado de trigger aborta la carga. Los índices UNIQUE y FK actúan como última barrera frente a cualquier conflicto adicional.

En la misma sesión SQL de carga:

```sql
SET optiplan.confirmed_demo_project = 'dyqusivzgxebkxkwohwn';
SET optiplan.backup_sha256 = '<sha256-del-before.dump>';
SET optiplan.security_approved = 'yes';
SET optiplan.demo_actor = '<UUID-Auth-existente-con-rol-admin-o-production>';
-- Ejecutar work/a2-existing/import.sql.
```

No hace falta cambiar roles existentes. Si se necesita una cuenta nueva para el amigo, autorizarla por separado; `DEMO-OPERATOR.sql` solo admite una cuenta sin rol previo y exige ese consentimiento adicional.

La carga usa INSERT, locks con timeout y **ALTER SEQUENCE RESTART transaccional**, conservando secuencias ya adelantadas. No usa setval, upserts, UPDATE ni DELETE. Una repetición se rechaza. Las asignaciones de espacios también tienen IDs explícitos reservados `16001–16004`; se comprueban las 16 tablas de carga. Los catálogos nuevos son compartidos: los recursos globales quedan inactivos y las plantillas no se auto-crean, pero nuevos días creados posteriormente podrían incluir las zonas/espacios nuevos al copiar el catálogo. No se modifican snapshots de jornadas anteriores.

Verificar inmediatamente, antes de iniciar Assisted:

```sh
npm run demo:a2:verify-database -- dyqusivzgxebkxkwohwn 2026-10-30 \
  work/a2-existing/private-baseline.json
```

Esta orden solo lee. Debe acreditar igualdad estricta del problema completo reconstruido por `buildEngineInput` frente al canon, C01–C19, 266 tareas pendientes sin horas y conservación literal de las filas anteriores. Si falla, no iniciar la demo ni intentar corregir datos a mano.

## Actualización de Replit y ensayo real

El usuario actualiza su checkout de Replit a `codex/optiplan-a2-import-demo`, con el HEAD indicado en la entrega, instala las dependencias del lockfile, compila y publica por su procedimiento habitual. Mantiene las variables del proyecto confirmado; cliente y servidor deben apuntar al mismo host. No basta actualizar `main`, que todavía no incluye el PR. Codex no modifica Replit ni despliega.

Entrar con un usuario `admin` o `production`, abrir la jornada de **2026-10-30** y comprobar las 266 obligaciones sin planificar. Entrar en Planificación asistida y arrancar S0. Para cada etapa: **Sugerir siguiente alcance → revisar selección → generar → aplicar → validar → aceptar**. Mantener `Include prerequisites` desactivado. Conteos acumulados: **19, 38, 46, 65, 75, 111, 169, 207, 209, 266**. No aceptar nuevas violaciones HARD/REQUIRED. El guion de selectors está en `A2-LIVE-STAGE-GUIDE.json`, sin horarios solución.

Mostrar concursantes, espacios y recursos; comprobar las 51 tareas de CAM1 sin solapamientos y las comidas. Después de S10, recargar y abrir desde otra sesión autorizada: comprobar 266/266, diez etapas y proposalRunId. No cambiar el reloj global ni los defaults para ensayar este día. Todos estos pasos remotos siguen **PENDIENTES**, incluido login y recovery: los tests locales no los certifican.

## Recuperación

Si falla una transacción de esquema o carga, ejecutar ROLLBACK si el cliente deja la sesión abierta; no quedan filas/secuencias parcialmente importadas. Corregir la causa, refrescar preflight y repetir desde S0 vacío. Tras una carga correcta, no repetir import.sql: abrir el mismo día y recuperar su sesión Assisted existente. Si una propuesta se interrumpe, revisar el run y regenerar desde el último borrador válido; no alterar jornadas ajenas.

Para retroceder la publicación, el usuario vuelve a su versión anterior de Replit; dejar las adiciones de schema y A2 almacenadas. Es el rollback de aplicación que conserva datos. Un rollback físico del esquema requiere autorización aparte: debe ejecutarse únicamente sobre una copia restaurada del backup, verificarse y revisarse su diff antes de tocar el destino. No se entrega un down automático que borre la nueva jornada o elimine columnas con valores nuevos. La seguridad tiene rollback específico generado del catálogo previo, descrito en el documento de seguridad. Nunca restaurar el backup completo sobre la base compartida como primera medida: podría perder trabajo posterior de las otras cuatro jornadas.
