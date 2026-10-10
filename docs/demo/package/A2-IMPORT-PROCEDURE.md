# A2 en el Supabase de pruebas existente

Destino confirmado por el usuario: **planificador_audiovisual / `dyqusivzgxebkxkwohwn`**. La fecha preparada es **2026-10-30**; el importador acepta otra fecha explícita. La identificación del destino no autoriza aún escrituras: esquema, seguridad, carga y cualquier alta de usuario requieren aprobación específica. **A2 todavía no está cargado ni probado en Supabase/Replit.**

La jornada nueva es `27001`: C01–C19, 266 obligaciones pendientes (247 productivas + 19 Sodexo), 23 espacios/zonas, nueve recursos y todas las autoridades del canon. No se importan horarios resueltos, etapas ni ejecuciones. Los defaults globales quedan fuera del dataset. Horarios, plantillas y optimizador se materializan en snapshots de la jornada; la procedencia de los overrides del plan registra al operador Auth que realiza la carga.

## Versión publicable

Usar el PR **#1105**, rama **`codex/optiplan-a2-import-demo`**, ahora contra **`main`**. Ya no requiere fusionar #1104. Incluye los componentes productivos necesarios para el A2 certificado; los diagnósticos experimentales de ASST-010 y CP-SAT quedan fuera del árbol entregado. No promete resolver el recorrido alternativo bloqueado de ASST-010. El humano continúa proponiendo, aplicando, validando y aceptando cada alcance.

## 1. Preparar los archivos, sin escrituras remotas

Desde esa rama, con las variables actuales del mismo Supabase para cliente y servidor:

```sh
set -e
umask 077
mkdir -p work/a2-existing/before
npm ci
npm run demo:a2:prepare-import -- 2026-10-30 work/a2-existing
npm run demo:a2:prepare-schema -- work/a2-existing
npm run demo:a2:audit -- dyqusivzgxebkxkwohwn 2026-10-30 work/a2-existing/before
```

`before/` conserva la evidencia anterior a cualquier cambio. Las lecturas posteriores se guardarán en `work/a2-existing/`, sin sobrescribir ese original. La carpeta contiene datos privados y queda fuera de Git y del ZIP público.

`DEMO_DATABASE_URL` es la conexión PostgreSQL privada del proyecto confirmado, tomada de su panel y configurada en la terminal del operador. Comprobar el host `db.dyqusivzgxebkxkwohwn.supabase.co`, o el usuario `postgres.dyqusivzgxebkxkwohwn` del pooler. Si el host directo no es accesible por IPv4, usar **Session pooler, puerto 5432**, del mismo proyecto. No utilizar Transaction pooler 6543 para este procedimiento. No imprimir la contraseña ni guardar la URL en Git. Las claves REST de OPTIPLAN no sustituyen esta conexión.

## 2. Exportar el catálogo original, solo lectura

El usuario confirma que ChatGPT ya ejecutó `script/demo/sql/catalog-audit.sql` por la conexión Supabase: **56 tablas, 575 columnas, 26 funciones, 70 políticas y 15 tablas sin RLS**. Falta disponer del JSON completo para revisar compatibilidad; ese recuento no acredita los cuerpos de las funciones ni sus permisos.

Hay dos formas equivalentes de exportarlo:

- **Conexión de Supabase / editor SQL:** seleccionar `planificador_audiovisual / dyqusivzgxebkxkwohwn` y ejecutar el archivo completo `script/demo/sql/catalog-audit.sql`. Guardar el objeto de la única celda `audit` como `work/a2-existing/before/catalog-audit.json`. Debe empezar por `{`, incluir `format: 1` y contener las definiciones completas de funciones. No guardar solo un resumen, un CSV, una respuesta envuelta en `rows`/`audit` ni una salida truncada. Si se exporta mediante ChatGPT, conservar el resultado completo como archivo, sin resumirlo.
- **Terminal con PostgreSQL:** ejecutar exactamente esta orden; escribe un archivo local y solo lee la base:

```sh
psql "$DEMO_DATABASE_URL" -X --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 \
  -f script/demo/sql/catalog-audit.sql > work/a2-existing/before/catalog-audit.json
```

Comprobar el formato y mostrar el recuento del archivo exportado:

```sh
node <<'NODE'
const fs = require('node:fs');
const c = JSON.parse(fs.readFileSync('work/a2-existing/before/catalog-audit.json', 'utf8'));
const required = ['observedAt', 'columns', 'tables', 'functions', 'policies', 'grants', 'roles', 'constraints', 'triggers', 'sequences'];
if (c.format !== 1 || required.some(k => !(k in c))) throw Error('Exportar el objeto audit completo, sin envoltorios');
console.log({observedAt: c.observedAt, tables: c.tables.length, columns: c.columns.length, functions: c.functions.length, policies: c.policies.length, tablesWithoutRLS: c.tables.filter(t => !t.rls).length});
NODE
```

Los conteos son una referencia inicial, no una condición fija para futuras exportaciones. No crear un RPC de inspección. Revisaremos este archivo antes de autorizar el esquema o la seguridad.

## 3. Guardar y comprobar el backup manual

Supabase Free no impide hacer este backup manual. El preflight actual requiere un archivo **custom de `pg_dump`**, cabecera `PGDMP`; un `.sql` de texto o una exportación CSV no sirven para este gate. Si se genera en otro ordenador, copiarlo a `work/a2-existing/before.dump` antes de los pasos siguientes.

```sh
set -e
pg_dump "$DEMO_DATABASE_URL" --format=custom --no-owner --file=work/a2-existing/before.dump
pg_restore --list work/a2-existing/before.dump > work/a2-existing/before/backup-list.txt
node -e "const fs=require('node:fs'); console.log(require('node:crypto').createHash('sha256').update(fs.readFileSync('work/a2-existing/before.dump')).digest('hex'))" > work/a2-existing/before/backup-sha256.txt
npm run demo:a2:security-rollback -- work/a2-existing/before
```

El hash de `backup-sha256.txt` es el que se copia en los bloques SQL siguientes. `pg_restore --list` comprueba que el archivo puede leerse, **no que el restore completo funcione**. Comprobar también su restauración en una copia local vacía y descartable con los roles y extensiones de Supabase compatibles. Para esa copia ya preparada, con `A2_RESTORE_DATABASE_URL` exportada como variable de entorno y apuntando a localhost:

```sh
set -e
node -e "const u=new URL(process.env.A2_RESTORE_DATABASE_URL); if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)) throw Error('La prueba de restore debe apuntar a una copia local');"
pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname="$A2_RESTORE_DATABASE_URL" work/a2-existing/before.dump \
  > work/a2-existing/before/backup-restore.log 2>&1
```

Solo continuar si el restore termina con código 0; no ejecutar esta prueba contra el Supabase compartido. El dump y `private-baseline.json` contienen información existente: mantenerlos privados. La lectura REST no sustituye al backup PostgreSQL. `security-rollback.sql` se genera del catálogo original y queda preparado, sin ejecutarse.

Revisar el catálogo original y el diff de `schema.sql`: columnas/tipos/defaults, constraints, triggers, secuencias, firmas/cuerpos/permisos de RPC, políticas y rol `service_role BYPASSRLS`. Si aparece un requisito distinto de los documentados, detener el despliegue y adaptar el parche. No inferir compatibilidad del número 085. Guardar ese catálogo original antes de aplicar la seguridad; sirve para generar su rollback exacto.

## 4. Aplicar el esquema, solo tras aprobación específica

El orden de adopción es: reparar el drift de **076**, instalar la persistencia de recursos de **086**, adoptar **087 sin reescribir snapshots v1**, añadir **088**, reconciliar los 14 contratos Assisted con sus cuerpos oficiales y aplicar la seguridad preparada. `schema.sql` hace la adopción en una transacción; no ejecuta el backfill de 076 ni el UPDATE de contract_version de 087. Las columnas antiguas y los snapshots v1 se conservan. El normalizador ya acepta v1 y v2. No volver a ejecutar los históricos 076/087 después de este procedimiento, ni usar `db:push`.

Guardar este bloque en el archivo privado `work/a2-existing/schema-session.sql`, sustituyendo el hash por el de `backup-sha256.txt`. El `yes` se utiliza únicamente después de recibir la aprobación del esquema:

```sql
SET optiplan.confirmed_demo_project = 'dyqusivzgxebkxkwohwn';
SET optiplan.backup_sha256 = '<sha256-del-before.dump>';
SET optiplan.schema_approved = 'yes';
-- Ejecutar el contenido de work/a2-existing/schema.sql en esta misma sesión.
```

Ejecutar ambos archivos en **una sola conexión**:

```sh
psql "$DEMO_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f work/a2-existing/schema-session.sql -f work/a2-existing/schema.sql
```

Debe terminar con `COMMIT` y código 0. Si se usa el editor SQL o la conexión de ChatGPT, enviar **el bloque SET seguido del contenido completo de schema.sql en una única ejecución**. No ejecutar los SET en una petición y el archivo en otra: la conexión puede cambiar.

## 5. Aplicar la seguridad, solo tras aprobación específica

Guardar este bloque en `work/a2-existing/security-session.sql`, con el mismo hash real y después de recibir la aprobación de seguridad:

```sql
SET optiplan.confirmed_demo_project = 'dyqusivzgxebkxkwohwn';
SET optiplan.backup_sha256 = '<sha256-del-before.dump>';
SET optiplan.security_approved = 'yes';
-- Ejecutar script/demo/sql/security.sql en esta misma sesión.
```

```sh
psql "$DEMO_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f work/a2-existing/security-session.sql -f script/demo/sql/security.sql
```

Debe terminar con `COMMIT` y código 0. En el editor o la conexión de ChatGPT, ejecutar SET y archivo juntos en una única petición. Los settings son declaraciones del operador: no prueban por sí solos el host ni la autorización humana. No usar hashes o UUID ficticios.

La matriz y el rollback están en [A2-MIGRATIONS-SECURITY.md](A2-MIGRATIONS-SECURITY.md). Las políticas se crean antes de habilitar RLS. Son restrictivas para limitar políticas antiguas permisivas; los writes de la aplicación continúan con el rol servidor después de autorización en la API. No abrir la demo con una versión anterior de la API: esta entrega cierra el bypass de login en debug y los writes sin rol en daily-tasks.

## 6. Refrescar el preflight y cargar, solo tras aprobación de datos

Después de las operaciones aprobadas, refrescar la evidencia de lectura (vigencia máxima 15 minutos):

```sh
set -e
npm run demo:a2:audit -- dyqusivzgxebkxkwohwn 2026-10-30 work/a2-existing
psql "$DEMO_DATABASE_URL" -X --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 \
  -f script/demo/sql/catalog-audit.sql > work/a2-existing/catalog-audit.json
npm run demo:a2:preflight -- work/a2-existing 2026-10-30 work/a2-existing/before.dump
cp work/a2-existing/private-baseline.json work/a2-existing/pre-import-baseline.json
```

También puede exportarse este catálogo nuevo por la conexión Supabase, igual que en el paso 2, pero guardándolo como `work/a2-existing/catalog-audit.json`. No sobrescribir `before/catalog-audit.json`. El informe REST por sí solo mantiene `readyForWrite: false`; el gate combinado es **preflight.json**.

No cargar salvo código 0, `issues: []`, `readyForApprovedImport: true`, restore del backup comprobado y aprobación específica. Si pasan más de 15 minutos antes de cargar, repetir estas lecturas y el preflight **antes** de la importación. El fichero `pre-import-baseline.json` compara la carga frente al estado posterior a las migraciones; el original `before/` conserva el estado anterior a ellas. No regenerar ese baseline después de cargar.

El preflight comprueba host cliente/servidor, backup custom no vacío, esquema, cuerpos y permisos RPC, secuencias, constraints, políticas y colisiones. El importador vuelve a comprobar IDs y claves, actor autorizado y defaults dentro de la transacción. Conserva todas las filas anteriores de las tablas tocadas; un efecto inesperado de trigger aborta la carga. Los índices UNIQUE y FK actúan como última barrera frente a cualquier conflicto adicional.

Guardar este bloque en `work/a2-existing/import-session.sql`, con el hash real y el UUID del operador Auth existente con rol admin o production. El `yes` de importación requiere su aprobación propia:

```sql
SET optiplan.confirmed_demo_project = 'dyqusivzgxebkxkwohwn';
SET optiplan.backup_sha256 = '<sha256-del-before.dump>';
SET optiplan.security_approved = 'yes';
SET optiplan.demo_actor = '<UUID-Auth-existente-con-rol-admin-o-production>';
SET optiplan.import_approved = 'yes'; -- aprobación específica de esta carga
-- Ejecutar work/a2-existing/import.sql.
```

```sh
psql "$DEMO_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f work/a2-existing/import-session.sql -f work/a2-existing/import.sql
```

En el editor o la conexión de ChatGPT, ejecutar SET y archivo juntos en una única petición. Éxito: `COMMIT`, código 0 y la fila `27001 / 2026-10-30`. No repetir una carga que ya terminó correctamente.

No hace falta cambiar roles existentes. Si se necesita una cuenta nueva para el amigo, autorizarla por separado; `DEMO-OPERATOR.sql` solo admite una cuenta sin rol previo y exige ese consentimiento adicional.

La carga usa INSERT, locks con timeout y **ALTER SEQUENCE RESTART transaccional**, conservando secuencias ya adelantadas. No usa setval, upserts, UPDATE ni DELETE. Una repetición se rechaza. Las asignaciones de espacios también tienen IDs explícitos reservados `16001–16004`; se comprueban las 16 tablas de carga. Los catálogos nuevos son compartidos: los recursos globales quedan inactivos y las plantillas no se auto-crean, pero nuevos días creados posteriormente podrían incluir las zonas/espacios nuevos al copiar el catálogo. No se modifican snapshots de jornadas anteriores.

## 7. Verificar la carga, solo lectura

Verificar inmediatamente, antes de iniciar Assisted:

```sh
npm run demo:a2:verify-database -- dyqusivzgxebkxkwohwn 2026-10-30 \
  work/a2-existing/pre-import-baseline.json
```

Esta orden solo lee. Éxito: código 0, `canonicalProblemEqual: true`, `contestants: 19`, `obligations: 266` y `existingRowsAudit: "PASS"`. Acredita el problema completo reconstruido por `buildEngineInput`, las tareas sin horas y la conservación literal de las filas anteriores a la carga. Si falla, no iniciar la demo ni intentar corregir datos a mano.

## 8. Actualizar Replit y comprobar la aplicación real

El usuario actualiza su checkout de Replit a `codex/optiplan-a2-import-demo`, con el HEAD indicado en la entrega, instala las dependencias del lockfile, compila y publica por su procedimiento habitual. Mantiene las variables del proyecto confirmado; cliente y servidor deben apuntar al mismo host. No basta actualizar `main`, que todavía no incluye el PR. Codex no modifica Replit ni despliega.

Entrar con un usuario `admin` o `production`, abrir la jornada de **2026-10-30** y comprobar las 266 obligaciones sin planificar. Entrar en Planificación asistida y arrancar S0. Para cada etapa: **Sugerir siguiente alcance → revisar selección → generar → aplicar → validar → aceptar**. Mantener `Include prerequisites` desactivado. Conteos acumulados: **19, 38, 46, 65, 75, 111, 169, 207, 209, 266**. No aceptar nuevas violaciones HARD/REQUIRED. El guion de selectors está en `A2-LIVE-STAGE-GUIDE.json`, sin horarios solución.

Mostrar concursantes, espacios y recursos; comprobar las 51 tareas de CAM1 sin solapamientos y las comidas. Después de S10, recargar y abrir desde otra sesión autorizada: comprobar 266/266, diez etapas y proposalRunId. No cambiar el reloj global ni los defaults para ensayar este día. Todos estos pasos remotos siguen **PENDIENTES**, incluido login y recovery: los tests locales no los certifican.

## 9. Recuperar si un paso falla

Si falla una transacción de esquema o carga, ejecutar ROLLBACK si el cliente deja la sesión abierta; no quedan filas/secuencias parcialmente importadas. Corregir la causa, refrescar preflight y repetir desde S0 vacío. Tras una carga correcta, no repetir import.sql: abrir el mismo día y recuperar su sesión Assisted existente. Si una propuesta se interrumpe, revisar el run y regenerar desde el último borrador válido; no alterar jornadas ajenas.

Si el esquema ya terminó con COMMIT y falla un paso posterior, **no volver a ejecutar schema.sql**: contiene cambios de una sola aplicación. Revisar el catálogo y continuar desde el paso pendiente. La aprobación de esquema no implica aprobar seguridad, y ninguna de ambas implica aprobar la carga o las aceptaciones en la interfaz. Hasta esas aprobaciones solo están autorizadas la preparación local, la exportación y las lecturas.

Para retroceder la publicación, el usuario vuelve a su versión anterior de Replit; dejar las adiciones de schema y A2 almacenadas. Es el rollback de aplicación que conserva datos. Un rollback físico del esquema requiere autorización aparte: debe ejecutarse únicamente sobre una copia restaurada del backup, verificarse y revisarse su diff antes de tocar el destino. No se entrega un down automático que borre la nueva jornada o elimine columnas con valores nuevos. La seguridad tiene rollback específico generado del catálogo previo, descrito en el documento de seguridad. Nunca restaurar el backup completo sobre la base compartida como primera medida: podría perder trabajo posterior de las otras cuatro jornadas.
