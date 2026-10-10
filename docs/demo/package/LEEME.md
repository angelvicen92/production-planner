# OPTIPLAN — paquete A2

El entregable principal es la jornada A2 para la aplicación real. Importador y wiring listos en [PR #1105](https://github.com/angelvicen92/production-planner/pull/1105); falta confirmar el proyecto Supabase separado y ensayar la carga remota. No se han escrito datos ni aplicado migraciones remotas.

Leer `informe/A2-IMPORT-PROCEDURE.md`. La fecha 2026-10-30 del SQL es un ejemplo: regenerar con `npm run demo:a2:prepare-import -- YYYY-MM-DD` desde `codex/optiplan-a2-import-demo`. No ejecutar el SQL sobre el proyecto conectado actual. Las herramientas necesitan el repositorio y sus dependencias. El usuario actualiza/publica Replit desde GitHub como acostumbra.

Respaldo estático: desde la carpeta descomprimida ejecutar `python3 -m http.server 4173 --directory reproduccion --bind 127.0.0.1` y abrir http://127.0.0.1:4173. Reproduce archivos; no genera el plan en directo. La revisión manual canónica requiere `npm run demo:a2` en el repositorio. Las capturas sirven de apoyo.

`ESTADO.json` contiene HEAD y CI PASS exactos. PR #1105 y #1106 draft, apilados sobre #1104 y sin merge. `registro-filas-reconstruidas` conserva dos runs completos y veinte auditorías. `experimental` describe CP-SAT y el bloqueo S2, sin backend productivo.
