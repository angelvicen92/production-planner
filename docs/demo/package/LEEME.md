# A2 operativo — Supabase de pruebas existente

Código: PR #1105, rama codex/optiplan-a2-import-demo, contra main. Leer procedimiento/A2-IMPORT-PROCEDURE.md antes de cualquier carga. La fecha preparada es 2026-10-30; puede regenerarse otra fecha en la rama.

El usuario confirma acceso al catálogo por la conexión Supabase y prepara un backup manual. Falta exportar el JSON completo del catálogo, verificar el backup custom y su restore local, aprobar específicamente esquema, seguridad y carga, publicar mediante el procedimiento del usuario y ensayar la interfaz. No se han ejecutado escrituras remotas. Los SQL están preparados para revisión; las confirmaciones deben corresponder a la operación aprobada, al hash real del backup y al operador Auth existente.

ESTADO.json registra HEAD y hashes de los SQL. La última revisión solo cambia documentación; el motor y los SQL conservan la versión validada. El ZIP no contiene backups ni datos de las cuatro jornadas existentes. Las pruebas largas son locales, con builder real y RPC en memoria; no acreditan el recorrido remoto. Los scripts ejecutables están en el repositorio de ese HEAD, no se ejecutan desde este ZIP aislado.

Usar **OPTIPLAN-A2-OPERATIVO.zip**. El ZIP anterior conserva evidencia histórica; no usar su SQL para la base poblada.
