# OptiPlan — Guía rápida de publicación en Replit y Supabase

**Edición:** 20 de octubre de 2026 · guía operativa versionada (no Fuente normativa 00–07)  
**Repositorio:** `angelvicen92/production-planner`  
**App Replit:** `code-architect-tool--avmb`  
**Supabase:** `planificador_audiovisual` (`dyqusivzgxebkxkwohwn`)

## Regla de oro

Publicar **solo un commit de `main` revisado con CI verde**, con un **respaldo verificable anterior a las migraciones**, y en este orden:

**PR/CI → backup → migraciones pendientes → verificaciones SQL → publicación Replit → comprobación final.**

No se aplica una migración si el backup falla, no se publica código que requiera columnas/RPC todavía ausentes, y no se ejecutan migraciones históricas ya registradas. Un backup legible no sustituye a un ensayo de restauración en una base descartable cuando el riesgo lo exija.

## 1. Preparación: un solo comando en Replit Shell

**No subas ningún archivo manualmente a Replit** y no instales el script en `$HOME/optiplan-tools`.
La guía y la herramienta se conservan y revisan juntas en GitHub:

- `docs/operations/OptiPlan_Guia_Replit_Supabase.md` — esta guía.
- `script/deploy/optiplan_preparar_release.sh` — herramienta operativa.

**Cada despliegue:** ChatGPT audita `main`, CI, Evidence y las migraciones y proporciona el **SHA completo autorizado**. Desde el Shell de Replit, situado dentro del checkout del repositorio, ejecuta **una sola línea**, reemplazando el marcador por el SHA aprobado:

```bash
SHA=SHA_COMPLETO_AUTORIZADO; git fetch --no-tags origin main && bash <(git show "$SHA:script/deploy/optiplan_preparar_release.sh") "$SHA"
```

Este comando recupera de GitHub la **versión del script contenida en el propio commit aprobado**, sin depender de qué rama esté seleccionada en Replit. El script vuelve a comprobar que `origin/main` coincide exactamente con ese SHA y **nunca aplica migraciones ni publica por sí solo**.

> No ejecutar con un SHA deducido, antiguo o no revisado. Si la orden `git show` falla, detente; no copies scripts de otros commits ni continúes manualmente.

Ese comando automáticamente:

1. Comprueba que `DATABASE_URL` pertenece al Supabase correcto **sin mostrar contraseña**, que la versión de PostgreSQL es 17 y que la rama remota es el SHA autorizado.
2. Comprueba que el checkout de Replit está limpio, consulta el ledger de migraciones y los contadores operativos.
3. Crea un backup privado con **`pg_dump 17`**: usa PostgreSQL 17 local si existe o el catálogo Nix 25.05, porque Replit Nixpkgs 24.05 no incluye `postgresql_17` y su `pg_dump` 16 no sirve contra Supabase 17.
4. Lee el índice y **todo el contenido** del backup con `pg_restore --file=/dev/null`; registra SHA256, versión, contadores y última migración.
5. Comprueba de nuevo los contadores, cambia a una nueva rama local de release con el SHA exacto, ejecuta `npm run check` y `npm run build`, y verifica el árbol limpio.

La salida correcta termina con **`RELEASE PREPARADA`** y muestra `RELEASE_SHA`, `BACKUP_PATH`, `BACKUP_SHA256`, `COUNTS` y `LATEST_MIGRATION`.

**Si falla cualquier etapa: detenerse.** No ejecutar migraciones ni pulsar Publish. El script corre con `bash` en un proceso hijo: un fallo no debe cerrar el Shell interactivo. El respaldo queda en `$HOME/optiplan-private-backups/` con permisos privados; **no está en Git**. Conviene guardar una copia cifrada fuera de Replit siguiendo la política de conservación de datos.

> **Importante:** Si Supabase cambia a PostgreSQL 18, cambia de proyecto/host o el nuevo `main` ya no es el SHA aprobado, el script se detiene deliberadamente. Revisar y actualizar el procedimiento antes de seguir.

## 2. Migraciones en Supabase (las hace ChatGPT por el conector)

Pasar a ChatGPT las líneas finales de la preparación. ChatGPT:

1. Vuelve a consultar el SHA de `main` y las migraciones **realmente aplicadas** en Supabase. Compara con el commit preparado y el manifest del respaldo. Consulta el script SQL de cada migración faltante directamente en ese commit.
2. Revisa su impacto (DDL, datos, roles, funciones, RLS, grants), solicita validación adicional solo si es indispensable y aplica **cada migración en orden** con el conector `apply_migration` para conservar el ledger. Nunca aplicar SQL por `psql` como sustituto si eso deja las migraciones sin registrar.
3. Después de cada migración comprueba éxito, ledger, firmas de RPC, privilegios y contadores de planes, tareas, Stages, validaciones, eventos, excepciones y snapshots; los cambios esperados deben estar documentados.

**Regla adicional Supabase desde el 30/10/2026:** cada tabla nueva en `public` que deba ser accesible desde Data API necesita **GRANT explícito mínimo + RLS** en su propia migración. No conceder `GRANT ALL` genérico. El PR #1159 (P11) añadió la migración `100_data_api_explicit_grants` y un gate permanente de compatibilidad; la migración 100 quedó aplicada en producción el 20/10/2026. Verificar cada vez el ledger real: no repetir migraciones aplicadas.

## 3. Publicar en Replit

Con las migraciones confirmadas, ChatGPT ejecuta **Publish App** desde el conector Replit de la aplicación existente, sin crear otra. Se consulta el estado hasta `success`. Los estados `building`, `running` y `promoting` **no son éxito final**. No iniciar un segundo Publish mientras el primero siga en progreso.

URL pública: https://code-architect-tool--avmb.replit.app

## 4. Verificación posterior

Se confirma que:

- Replit informa `success` y el **código efectivamente desplegado** corresponde al SHA preparado. `success` por sí solo no certifica el SHA: verificarlo mediante el mecanismo de versión de la app/logs; si no existe, anotar expresamente que falta esta evidencia, sin afirmar un SHA remoto como probado.
- Las migraciones esperadas aparecen en Supabase y las tablas/funciones/permisos requeridos siguen operativos.
- Los recuentos de datos y la procedencia de Stages, validaciones y eventos no muestran pérdidas imprevistas.
- La UI abre tras recarga completa; un usuario autorizado puede leer la jornada y ejecutar una **prueba de lectura**, sin reiniciar ni mover tareas reales para comprobar el despliegue.
- Una prueba funcional de edición/aceptación se hace en jornada descartable, no en el A2 histórico.

En caso de fallo, **detener cambios** y diagnosticar. Volver a publicar código anterior no revierte automáticamente una migración de base. La restauración del backup requiere un procedimiento de recuperación separado y comprobado.

## Por qué no hay un único comando para migrar **y** publicar

El script de Replit realiza en **una orden** todo el *preflight* y el respaldo; **no** aplica migraciones ni publica. Hacerlo sin control adicional mezclaría tres autoridades distintas (Shell, migraciones versionadas de Supabase y hosting de Replit), con riesgo de desalinear el ledger o publicar código incompatible. La ejecución de esas dos etapas finales queda orquestada por ChatGPT a través de los conectores.

Si más adelante queremos un auténtico despliegue de **un solo clic**, habrá que desarrollar y auditar un pipeline CI/CD con secretos protegidos, restauración ensayada, migraciones versionadas, aprobación y una API de publicación soportada. No improvisar un script con credenciales privilegiadas.

## 5. Cómo se encuentra este procedimiento en futuros chats

`AGENTS.md` del repositorio enlaza esta guía como **ruta operativa para despliegues**. En las instrucciones del Proyecto de ChatGPT conviene añadir el recordatorio permanente que figura al final de esta guía; no hace falta crear una nueva Fuente oficial. Las decisiones del proyecto siguen sometidas a Fuentes 00–07, GitHub `main`, CI y Evidence.

> **Texto para Instrucciones del proyecto ChatGPT:** «Ante cualquier petición de respaldo, migración Supabase, publicación o actualización de Replit en OptiPlan, consulta primero `docs/operations/OptiPlan_Guia_Replit_Supabase.md` y `script/deploy/optiplan_preparar_release.sh` del `main` vigente en `angelvicen92/production-planner`. Verifica estado real, commit, CI, Evidence, backup y ledger antes de actuar; jamás supongas que una publicación o migración está realizada. La guía es operativa y subordinada a las Fuentes oficiales 00–07».

## Referencia: publicación correcta del 20/10/2026

- `main`: `5f3052d3f520535502ca76e205aea6e9cd9a144e`.
- PostgreSQL 17.6; `pg_dump 17.6` ejecutado con `nix-shell -I nixpkgs=https://github.com/NixOS/nixpkgs/archive/nixos-25.05.tar.gz -p postgresql_17`.
- Backup privado: `optiplan-pre098-pre099-20261020T152744Z.dump`, SHA256 `d83089bbf292ba1613a9611793ca5193e249b834b5ee27893b7e2d7f9763b990`.
- Migraciones `098_execution_start_workday` y `099_transport_group_config_integrity` aplicadas en orden.
- Estado Replit: `success`. Contadores verificados: 7 planes, 1.131 tareas, 104 Stages, 99 validaciones y 232 eventos.

- **Despliegue P11 posterior:** PR #1159 fusionado como `bed725d3b145baf0c582116c1c7ce309bd72f43f` y migración `100_data_api_explicit_grants` aplicada el 20/10/2026. Backup previo `optiplan-pre100-20261020T163627Z.dump`; SHA256 `9c629ec62a23423963b838c9ccbfddc24585cde7362335be42589f8802c97dee`. No requirió nueva publicación de UI.

**Estos ejemplos son históricos.** No reutilizar sus SHA, hashes, nombres o contadores como valores fijos del próximo despliegue.