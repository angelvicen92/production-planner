# Entrega A2 en la aplicación — 10 de octubre de 2026

PR [#1105](https://github.com/angelvicen92/production-planner/pull/1105), rama `codex/optiplan-a2-import-demo`, contra **main**. El HEAD definitivo y sus checks aparecen en el PR. Ya no depende de fusionar #1104. No se ha hecho merge ni desplegado Replit.

**Destino identificado:** `planificador_audiovisual / dyqusivzgxebkxkwohwn`, confirmado de pruebas. Fecha preparada: 2026-10-30, configurable. **Ninguna escritura remota, migración o modificación de permisos realizada. A2 todavía no está cargado en Supabase.**

**Completado:** importador para base poblada, configuraciones por día sin writes a defaults globales, IDs explícitos en las 16 tablas, locks/guards, conservación literal de filas anteriores y RESTART transaccional de secuencias. Adopción del drift 076/086/087/088 preparada sin backfills sobre jornadas anteriores. Matriz de seguridad de 15 tablas y rollback específico preparados. API con login en debug y rol obligatorio en writes de daily-tasks. Corregido el bloqueo de S0 por metadatos opcionales de recursos undefined.

**Verificado en esta iteración:** 26 tests focales; PostgreSQL WASM con cuatro jornadas previas, constraints, canon completo, defaults, versión v1, guards, secuencias adelantadas y rollback tardío. RPC real de bootstrap y persistencia de asignaciones físicas. Matriz SQL para anon, Auth sin rol, cuatro roles y servidor; middleware HTTP real con Auth/roles simulados. Typecheck raíz y estricto adicional, build y secuencia de migraciones.

**Dos A2 completos actuales:** 266/266, diez etapas, S1 **77,614 / 72,687 s**, suma de etapas **95,437 / 90,053 s**, fingerprint final idéntico `561738ed95e376d28df16ca7a16f2aef9ba0f08135f3dcd5b80a616d4a5bde54`, 20 auditorías canónicas de etapa PASS. El builder real se reconstruye tras cada aceptación; RPC de los recorridos largos en memoria. El ensayo histórico de S1=143,495 s permanece declarado. No se promete la misma latencia en Replit.

**Pendiente remoto:** catálogo SQL completo y backup, aprobación específica de schema/seguridad/carga, publicación del usuario, login, 266 obligaciones en S0, sugerencia, diez propuestas/aplicaciones/validaciones/aceptaciones, vistas, recarga y segunda sesión. Los tests locales no acreditan esos pasos.

Procedimiento exacto: [A2-IMPORT-PROCEDURE.md](A2-IMPORT-PROCEDURE.md). Migraciones, matriz y rollback: [A2-MIGRATIONS-SECURITY.md](A2-MIGRATIONS-SECURITY.md). Evidencia máquina: [A2-EXISTING-DELIVERY-EVIDENCE.json](A2-EXISTING-DELIVERY-EVIDENCE.json).

El árbol de esta entrega excluye los diagnósticos experimentales ASST-010 y CP-SAT. ASST-010 S2 sigue bloqueado en el recorrido alternativo histórico; no se ha investigado ni activado un solver nuevo en esta iteración. El paquete ZIP publicado anteriormente es evidencia histórica: para cargar sobre la base poblada usar este procedimiento y los scripts de la rama actual.
