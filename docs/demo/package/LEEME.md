# A2 operativo — Supabase de pruebas existente

Código: PR #1105, rama codex/optiplan-a2-import-demo, contra main. Leer procedimiento/A2-IMPORT-PROCEDURE.md antes de cualquier carga. La fecha preparada es 2026-10-30; puede regenerarse otra fecha en la rama.

Los SQL están preparados para revisión. Ninguna escritura remota autorizada o ejecutada. Faltan catálogo SQL real, backup, aprobación específica, publicación del usuario y ensayo de la interfaz. No ejecutar los archivos con valores de confirmación inventados. No utilizar el importador antiguo para proyecto vacío.

ESTADO.json registra HEAD y hashes de los SQL. El ZIP no contiene backups ni datos de las cuatro jornadas existentes. Las pruebas largas son locales, con builder real y RPC en memoria; no acreditan el recorrido remoto. Los scripts ejecutables están en el repositorio de ese HEAD, no se ejecutan desde este ZIP aislado.

Usar **OPTIPLAN-A2-OPERATIVO.zip**. El ZIP anterior conserva evidencia histórica; no usar su SQL para la base poblada.
